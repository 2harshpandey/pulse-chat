import { getCachedMediaBlob, setCachedMediaBlob, removeCachedMediaBlob, getCachedMediaForUser, clearOtherSessions } from '../mediaCache';
import { buildDownloadProxyUrl } from './utils';

// We use sessionStorage to maintain a unique session ID.
// When the tab is closed, this session ID is lost.
let currentSessionId = '';
if (typeof window !== 'undefined') {
  currentSessionId = sessionStorage.getItem('pulse_session_id') || '';
  if (!currentSessionId) {
    if (window.crypto && window.crypto.randomUUID) {
      currentSessionId = window.crypto.randomUUID();
    } else if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(4);
      window.crypto.getRandomValues(array);
      currentSessionId = Array.from(array, dec => dec.toString(36)).join('');
    } else {
      currentSessionId = Date.now().toString(36) + 'fallback';
    }
    sessionStorage.setItem('pulse_session_id', currentSessionId);
  }
}

export type TransferType = 'upload' | 'download';
export type TransferState = 'pending' | 'uploading' | 'downloading' | 'paused' | 'success' | 'error';

export interface TransferInfo {
  id: string; // usually messageId
  type: TransferType;
  state: TransferState;
  progress: number;
  error?: string;
  file?: File;
  url?: string;
  abortController?: AbortController;
  chunks?: BlobPart[];
  receivedBytes?: number;
  totalBytes?: number;
}

class TransferManager {
  private transfers: Map<string, TransferInfo> = new Map();
  private listeners: Set<(transfers: Map<string, TransferInfo>) => void> = new Set();

  subscribe(listener: (transfers: Map<string, TransferInfo>) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    // Create a new Map so React state detects the change
    const newMap = new Map(this.transfers);
    this.listeners.forEach(listener => listener(newMap));
  }

  getTransfer(id: string): TransferInfo | undefined {
    return this.transfers.get(id);
  }

  getAllTransfers(): Map<string, TransferInfo> {
    return this.transfers;
  }

  // --- UPLOAD LOGIC ---
  async startUpload(messageId: string, file: File, roomId: string, apiBase: string, userId: string, messageObj?: any): Promise<any> {
    // Save to IndexedDB to survive refresh
    await setCachedMediaBlob(currentSessionId, messageId, 'upload', file, messageObj);

    let startProgress = 0;
    let uploadedBytes = 0;

    // Check status
    try {
      const statusRes = await fetch(`${apiBase}/api/upload/status?uploadId=${messageId}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        uploadedBytes = statusData.uploadedBytes || 0;
        startProgress = (uploadedBytes / file.size) * 0.9;
      }
    } catch (e) {
      // Ignore status check errors, will start from 0
    }

    const abortController = new AbortController();
    const info: TransferInfo = {
      id: messageId,
      type: 'upload',
      state: 'uploading',
      progress: startProgress || 0,
      file,
      abortController,
    };
    this.transfers.set(messageId, info);
    this.notify();

    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    let startChunkIndex = Math.floor(uploadedBytes / CHUNK_SIZE);
    if (startChunkIndex >= totalChunks) startChunkIndex = 0;

    return new Promise(async (resolve, reject) => {
      try {
        let lastResponseData = null;
        for (let i = startChunkIndex; i < totalChunks; i++) {
          if (abortController.signal.aborted) {
            const currentInfo = this.transfers.get(messageId);
            if (currentInfo) {
              this.transfers.set(messageId, { ...currentInfo, state: 'paused' });
              this.notify();
            }
            return reject(new Error('Aborted'));
          }

          const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const formData = new FormData();
          formData.append('chunk', chunk);
          formData.append('uploadId', messageId);
          formData.append('chunkIndex', i.toString());
          formData.append('chunkStart', (i * CHUNK_SIZE).toString());
          formData.append('totalChunks', totalChunks.toString());
          formData.append('originalname', file.name);
          formData.append('mimetype', file.type);
          formData.append('userId', userId);
          formData.append('roomId', roomId);
          formData.append('text', messageObj?.text || '');

          const response = await fetch(`${apiBase}/api/upload/chunk`, {
            method: 'POST',
            body: formData,
            signal: abortController.signal,
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Upload failed');
          }

          lastResponseData = await response.json();
          
          const currentInfo = this.transfers.get(messageId);
          if (currentInfo && currentInfo.state === 'uploading') {
            const progress = ((i + 1) / totalChunks) * 0.9;
            this.transfers.set(messageId, { ...currentInfo, progress });
            
            // Only notify periodically or on finish to avoid React spam
            if (i === totalChunks - 1 || i % 2 === 0) {
              this.notify();
            }
          }
        }

        // Upload complete
        const finalInfo = this.transfers.get(messageId);
        if (finalInfo) {
          this.transfers.set(messageId, { ...finalInfo, state: 'success', progress: 1 });
          this.transfers.delete(messageId);
          removeCachedMediaBlob(currentSessionId, messageId, 'upload').catch(() => {});
          this.notify();
        }
        resolve(lastResponseData);

      } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'Aborted') {
          const currentInfo = this.transfers.get(messageId);
          if (currentInfo) {
            this.transfers.set(messageId, { ...currentInfo, state: 'paused' });
            this.notify();
          }
          reject(new Error('Aborted'));
        } else {
          this.handleUploadError(messageId, err.message || 'Upload failed');
          reject(err);
        }
      }
    });
  }

  pauseTransfer(id: string) {
    const info = this.transfers.get(id);
    if (info && info.abortController) {
      info.abortController.abort(); // this triggers onabort which sets state to paused
    }
  }

  resumeUpload(id: string, roomId: string, apiBase: string, userId: string): Promise<any> | null {
    const info = this.transfers.get(id);
    if (!info || info.type !== 'upload' || info.state !== 'paused' || !info.file) return null;
    return this.startUpload(id, info.file, roomId, apiBase, userId);
  }

  cancelTransfer(id: string) {
    const info = this.transfers.get(id);
    if (info) {
      if (info.abortController) info.abortController.abort();
      this.transfers.delete(id);
      
      // Cleanup partial/upload from IndexedDB
      removeCachedMediaBlob(currentSessionId, id, info.type === 'upload' ? 'upload' : 'download_partial').catch(() => {});
      
      this.notify();
    }
  }

  private handleUploadError(id: string, errorMsg: string) {
    const currentInfo = this.transfers.get(id);
    if (currentInfo) {
      this.transfers.set(id, { ...currentInfo, state: 'error', error: errorMsg });
      this.notify();
    }
  }

  // --- DOWNLOAD LOGIC ---
  async startDownload(messageId: string, url: string, filename: string): Promise<void> {
    const existing = this.transfers.get(messageId);
    const startByte = existing?.receivedBytes || 0;
    const existingChunks = existing?.chunks || [];
    const abortController = new AbortController();

    const info: TransferInfo = {
      id: messageId,
      type: 'download',
      state: 'downloading',
      progress: existing?.progress || 0,
      url,
      abortController,
      chunks: existingChunks,
      receivedBytes: startByte,
      totalBytes: existing?.totalBytes || 0,
    };
    this.transfers.set(messageId, info);
    this.notify();

    try {
      const headers = new Headers();
      if (startByte > 0) {
        headers.append('Range', `bytes=${startByte}-`);
      }
      
      let response;
      const isCloudinaryRaw = url.startsWith('https://res.cloudinary.com/') && url.includes('/raw/upload/');

      if (!isCloudinaryRaw) {
        try {
          response = await fetch(url, { headers, signal: abortController.signal });
        } catch (err) {
          // network error, let proxy fallback handle it
        }
      }

      if (!response || (!response.ok && response.status !== 206)) {
        const proxyUrl = buildDownloadProxyUrl(url, filename);
        response = await fetch(proxyUrl, { headers, signal: abortController.signal });
      }

      if (!response.ok && response.status !== 206) throw new Error('Fetch failed');

      let effectiveStartByte = startByte;
      let chunks = existingChunks;
      if (response.status === 200 && effectiveStartByte > 0) {
        effectiveStartByte = 0;
        chunks = [];
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) + effectiveStartByte : (existing?.totalBytes || 0);
      
      const currentInfo = this.transfers.get(messageId);
      if (currentInfo) {
        currentInfo.totalBytes = total;
        if (effectiveStartByte === 0) currentInfo.receivedBytes = 0;
      }

      if (total > 0 && response.body) {
        const reader = response.body.getReader();
        let received = effectiveStartByte;
        let lastNotifyTime = Date.now();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
          received += (value?.length ?? 0);
          const current = this.transfers.get(messageId);
          if (current && current.state === 'downloading') {
            current.receivedBytes = received;
            current.chunks = chunks;
            this.transfers.set(messageId, { ...current, progress: received / total });
            
            // Throttle UI updates to at most once every 100ms to prevent main thread blocking
            const now = Date.now();
            if (now - lastNotifyTime >= 100) {
              this.notify();
              lastNotifyTime = now;
            }
          }
        }
        // Ensure the final 100% progress is always notified
        this.notify();
      } else {
        const blob = await response.blob();
        chunks.push(blob);
      }

      const blob = new Blob(chunks);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);

      this.transfers.delete(messageId);
      this.notify();
      
      // Cleanup partial from IndexedDB
      // Overwrite with empty to "delete" or just ignore
    } catch (err: any) {
      if (err.name === 'AbortError') {
        const currentInfo = this.transfers.get(messageId);
        if (currentInfo) {
          this.transfers.set(messageId, { ...currentInfo, state: 'paused' });
          this.notify();
          // Save partial to IndexedDB
          setCachedMediaBlob(currentSessionId, messageId, 'download_partial', new Blob(currentInfo.chunks || []), {
            url, filename, progress: currentInfo.progress, receivedBytes: currentInfo.receivedBytes, totalBytes: currentInfo.totalBytes
          }).catch(() => {});
        }
      } else {
        const currentInfo = this.transfers.get(messageId);
        if (currentInfo) {
          this.transfers.set(messageId, { ...currentInfo, state: 'error', error: err.message });
          this.notify();
        }
      }
    }
  }

  resumeDownload(id: string, filename: string): Promise<void> | null {
    const info = this.transfers.get(id);
    if (!info || info.type !== 'download' || info.state !== 'paused' || !info.url) return null;
    return this.startDownload(id, info.url, filename);
  }

  // Restore session downloads from IndexedDB
  async restoreSessionDownloads(): Promise<void> {
    const records = await getCachedMediaForUser(currentSessionId);
    
    let restored = false;
    for (const record of records) {
      if (record.sourceUrl === 'download_partial' && record.metadata) {
        this.transfers.set(record.messageId, {
          id: record.messageId,
          type: 'download',
          state: 'paused',
          progress: record.metadata.progress || 0,
          url: record.metadata.url,
          chunks: [record.blob],
          receivedBytes: record.metadata.receivedBytes || 0,
          totalBytes: record.metadata.totalBytes || 0,
        });
        restored = true;
      }
    }
    if (restored) this.notify();
  }

  // Restore session uploads from IndexedDB
  async restoreSessionUploads(): Promise<any[]> {
    await clearOtherSessions(currentSessionId);
    
    const records = await getCachedMediaForUser(currentSessionId);
    const restoredMessages: any[] = [];
    
    for (const record of records) {
      if (record.sourceUrl === 'upload' && record.metadata) {
        if (!this.transfers.has(record.messageId)) {
          const file = new File([record.blob], record.metadata.originalName || 'file', { type: record.blob.type });
          this.transfers.set(record.messageId, {
            id: record.messageId,
            type: 'upload',
            state: 'paused',
            progress: 0,
            file,
          });
        }
        
        // Return the message object with isUploading = true so Chat.tsx can display it
        const restoredMsg = { ...record.metadata, isUploading: true };
        // Create an object URL for the blob so it renders
        restoredMsg.url = URL.createObjectURL(record.blob);
        restoredMessages.push(restoredMsg);
      }
    }
    
    if (restoredMessages.length > 0) {
      this.notify();
    }
    return restoredMessages;
  }
}

export const transferManager = new TransferManager();
