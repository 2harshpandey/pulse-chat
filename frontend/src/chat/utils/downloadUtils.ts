// --- File Downloads, Proxy URLs, ZIP Album Bundling & Image Clipboard Copy ---

import type { DownloadProgressCallback, Message } from '../types';
import { sendClientDiagnostic } from '../telemetry';
import { isAudioMedia, isVideoMedia } from '../../shared/mediaTypes';
import { getSessionToken } from '../../auth/utils';
import {
  ALLOWED_DOWNLOAD_HOSTS,
  getStoredValue,
  isGiphyUrl,
  isGifUrl,
  resolveApiBaseUrl,
  sanitizeFilename,
  sanitizeMediaUrl,
} from './urlMediaUtils';
import { importWithChunkRetry } from '../../pwaUpdater';

export const buildDownloadProxyUrl = (resourceUrl: string, filename?: string): string => {
  const apiBase = resolveApiBaseUrl();
  const endpoint = `${apiBase}/api/download`;
  const params = new URLSearchParams({ url: resourceUrl });
  if (filename) params.set('filename', filename);
  if (typeof window !== 'undefined') {
    const roomId = getStoredValue('pulse_room_id') || getStoredValue('pulseRoomId');
    if (roomId) params.set('roomId', roomId);
    const userId = getStoredValue('pulse_user_id') || getStoredValue('pulseUserId');
    if (userId) params.set('userId', userId);
  }
  return `${endpoint}?${params.toString()}`;
};

export const inferMimeTypeFromUrl = (url: string): string => {
  if (!url) return 'application/octet-stream';
  if (/\.png($|\?)/i.test(url)) return 'image/png';
  if (/\.webp($|\?)/i.test(url)) return 'image/webp';
  if (/\.gif($|\?)/i.test(url)) return 'image/gif';
  if (/\.(jpg|jpeg)($|\?)/i.test(url)) return 'image/jpeg';
  if (/\.svg($|\?)/i.test(url)) return 'image/svg+xml';
  if (/\.(mp4|m4v)($|\?)/i.test(url)) return 'video/mp4';
  if (/\.webm($|\?)/i.test(url)) return 'video/webm';
  if (/\.mov($|\?)/i.test(url)) return 'video/quicktime';
  if (/\.mp3($|\?)/i.test(url)) return 'audio/mpeg';
  if (/\.ogg($|\?)/i.test(url)) return 'audio/ogg';
  if (/\.wav($|\?)/i.test(url)) return 'audio/wav';
  if (/\.m4a($|\?)/i.test(url)) return 'audio/mp4';
  return 'application/octet-stream';
};

export const fetchBlobWithProgress = async (
  resourceUrl: string,
  onProgress?: DownloadProgressCallback,
  abortSignal?: AbortSignal,
): Promise<Blob> => {
  onProgress?.(0);
  const headers: Record<string, string> = {};
  if (typeof window !== 'undefined' && (resourceUrl.includes('/api/download') || resourceUrl.startsWith('/'))) {
    const roomId = getStoredValue('pulse_room_id') || getStoredValue('pulseRoomId');
    const sessionToken = getSessionToken(roomId || undefined);
    if (sessionToken) headers['x-session-token'] = sessionToken;
    if (roomId) headers['x-room-id'] = roomId;
    const userId = getStoredValue('pulse_user_id') || getStoredValue('pulseUserId');
    if (userId) headers['x-user-id'] = userId;
  }

  const response = await fetch(resourceUrl, {
    method: 'GET',
    headers,
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    signal: abortSignal,
  });
  if (!response.ok) throw new Error('Fetch failed');

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const headerContentType = response.headers.get('content-type');
  const inferredType = inferMimeTypeFromUrl(resourceUrl);
  const finalContentType = (headerContentType && !headerContentType.includes('application/octet-stream'))
    ? headerContentType
    : inferredType;

  if (total > 0 && response.body) {
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value as unknown as BlobPart);
      received += (value?.length ?? 0);
      onProgress?.(Math.max(0, Math.min(1, received / total)));
    }
    const blob = new Blob(chunks, { type: finalContentType });
    if (!blob || blob.size === 0) throw new Error('Empty blob');
    onProgress?.(1);
    return blob;
  }

  const rawBlob = await response.blob();
  if (!rawBlob || rawBlob.size === 0) throw new Error('Empty blob');
  const blob = rawBlob.type ? rawBlob : new Blob([rawBlob], { type: finalContentType });
  onProgress?.(1);
  return blob;
};

/**
 * Triggers a browser download for a file hosted on a trusted CDN.
 */
export const downloadFile = async (
  url: string,
  filename: string,
  onProgress?: DownloadProgressCallback,
  abortSignal?: AbortSignal,
  preferProxy: boolean = false,
): Promise<void> => {
  const triggerAnchorDownload = (href: string, downloadName: string) => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = downloadName;
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  const pathName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  const fallbackName = sanitizeFilename(pathName, 'download');
  const safeFilename = sanitizeFilename(filename, fallbackName);

  sendClientDiagnostic('file_download_start', { filename: safeFilename, preferProxy });

  if (parsed.protocol === 'blob:') {
    triggerAnchorDownload(url, safeFilename);
    sendClientDiagnostic('file_download_complete', { filename: safeFilename, source: 'blob' });
    return;
  }

  const isTrustedHost =
    (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    ALLOWED_DOWNLOAD_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
  if (!isTrustedHost) return;

  const downloadViaProxy = async () => {
    const proxyUrl = buildDownloadProxyUrl(parsed.href, safeFilename);
    const blob = await fetchBlobWithProgress(proxyUrl, onProgress, abortSignal);
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, safeFilename);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  };

  if (preferProxy) {
    try {
      await downloadViaProxy();
      return;
    } catch (proxyError: any) {
      if (proxyError?.name === 'AbortError' || abortSignal?.aborted) {
        onProgress?.(0);
        return;
      }
      onProgress?.(0);
      const activeRoomId = typeof window !== 'undefined' ? (getStoredValue('pulse_room_id') || getStoredValue('pulseRoomId')) : null;
      const needsHeaderAuth = Boolean(activeRoomId && activeRoomId.toLowerCase() !== 'global' && getSessionToken(activeRoomId));
      triggerAnchorDownload(needsHeaderAuth ? parsed.href : buildDownloadProxyUrl(parsed.href, safeFilename), safeFilename);
      return;
    }
  }

  try {
    const blob = await fetchBlobWithProgress(parsed.href, onProgress, abortSignal);
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, safeFilename);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  } catch (error: any) {
    if (error?.name === 'AbortError' || abortSignal?.aborted) {
      onProgress?.(0);
      return;
    }
    try {
      await downloadViaProxy();
      return;
    } catch (proxyError: any) {
      if (proxyError?.name === 'AbortError' || abortSignal?.aborted) {
        onProgress?.(0);
        return;
      }
      onProgress?.(0);
      throw proxyError;
    }
  }
};

/**
 * Downloads multiple media files from a grouped album or selection as a single ZIP archive.
 * Dynamically loads JSZip on-demand to guarantee ZERO impact on initial site performance.
 */
export const downloadAlbumAsZip = async (
  messages: Message[],
  options?: {
    zipNamePrefix?: string;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  }
): Promise<void> => {
  const mediaItems = messages.filter((m) => !m.isDeleted && Boolean(m.url));
  if (mediaItems.length === 0 || options?.signal?.aborted) return;

  try {
    options?.onProgress?.(0.05);

    const jszipModule = await importWithChunkRetry(() => import('jszip'));
    if (options?.signal?.aborted) return;

    const JSZip = (jszipModule && 'default' in jszipModule && jszipModule.default) ? jszipModule.default : (jszipModule as any);
    if (typeof JSZip !== 'function') {
      throw new Error('Failed to load ZIP bundler module');
    }
    const zip = new JSZip();

    const primaryMsg = mediaItems[0];
    const timestamp = primaryMsg.timestamp ? new Date(primaryMsg.timestamp) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}`;
    const timePart = `${pad(timestamp.getHours())}-${pad(timestamp.getMinutes())}-${pad(timestamp.getSeconds())}`;
    const rawUser = primaryMsg.username ? sanitizeFilename(primaryMsg.username, 'PulseUser') : 'PulseUser';
    const cleanUser = rawUser.replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = options?.zipNamePrefix || 'Pulse_Album';
    const zipFilename = `${prefix}_${cleanUser}_${datePart}_${timePart}.zip`;

    const usedNames = new Set<string>();
    const totalCount = mediaItems.length;
    let completedCount = 0;
    let nextIndex = 0;
    const CONCURRENCY_LIMIT = 3;

    const worker = async () => {
      while (nextIndex < totalCount) {
        if (options?.signal?.aborted) return;
        const index = nextIndex++;
        const msg = mediaItems[index];
        if (!msg.url || options?.signal?.aborted) continue;
        const fileUrl = msg.url;
        const isAudio = isAudioMedia(msg);
        const isVideo = isVideoMedia(msg);
        const isGif = Boolean(fileUrl.match(/\.gif$/i)) || isGiphyUrl(fileUrl);
        const defaultExt = isAudio ? '.mp3' : isVideo ? '.mp4' : isGif ? '.gif' : '.jpg';

        let baseName = msg.originalName ? sanitizeFilename(msg.originalName, '') : '';
        if (!baseName && fileUrl) {
          try {
            const pathname = new URL(fileUrl).pathname;
            baseName = sanitizeFilename(decodeURIComponent(pathname.split('/').pop() || ''), '');
          } catch {}
        }
        if (!baseName) {
          baseName = `media_${index + 1}${defaultExt}`;
        }
        if (!/\.[a-zA-Z0-9]+$/.test(baseName)) {
          baseName += defaultExt;
        }

        let uniqueName = baseName;
        let dupCounter = 1;
        const extMatch = baseName.match(/(\.[a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1] : '';
        const nameWithoutExt = ext ? baseName.slice(0, -ext.length) : baseName;

        while (usedNames.has(uniqueName.toLowerCase())) {
          uniqueName = `${nameWithoutExt} (${dupCounter})${ext}`;
          dupCounter++;
        }
        usedNames.add(uniqueName.toLowerCase());

        let blob: Blob;
        try {
          blob = await fetchBlobWithProgress(fileUrl, undefined, options?.signal);
        } catch {
          if (options?.signal?.aborted) return;
          const proxyUrl = buildDownloadProxyUrl(fileUrl, uniqueName);
          blob = await fetchBlobWithProgress(proxyUrl, undefined, options?.signal);
        }

        if (options?.signal?.aborted) return;
        zip.file(uniqueName, blob);
        completedCount++;
        options?.onProgress?.(0.05 + (completedCount / totalCount) * 0.75);
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY_LIMIT, totalCount) },
      () => worker()
    );
    await Promise.all(workers);

    if (options?.signal?.aborted) return;
    options?.onProgress?.(0.85);

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    if (options?.signal?.aborted) return;
    options?.onProgress?.(1);

    const objectUrl = URL.createObjectURL(zipBlob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = zipFilename;
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  } catch (error: any) {
    if (options?.signal?.aborted || error?.name === 'AbortError') {
      return;
    }
    console.error('Failed to download album as zip:', error);
  }
};

/**
 * Copies an image or GIF to the OS clipboard directly as a binary image (PNG).
 * Dispatches a status toast upon completion.
 */
export async function copyImageToClipboard(
  imageUrl: string,
  onToast?: (msg: string) => void,
  options?: { isGif?: boolean }
): Promise<boolean> {
  if (!imageUrl || typeof window === 'undefined') return false;
  const safeUrl = sanitizeMediaUrl(imageUrl);
  let isGif = Boolean(options?.isGif) || isGifUrl(safeUrl || imageUrl);

  const notify = (msg: string) => {
    if (onToast) {
      onToast(msg);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pulse:status_toast', { detail: { message: msg } }));
    }
  };

  if (!safeUrl) {
    notify(isGif ? 'Failed to copy GIF' : 'Failed to copy image');
    return false;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && window.isSecureContext && typeof ClipboardItem !== 'undefined') {
    try {
      const res = await fetch(safeUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawBlob = await res.blob();
      if (rawBlob.type === 'image/gif') {
        isGif = true;
      }

      let pngBlob: Blob;
      if (rawBlob.type === 'image/png') {
        pngBlob = rawBlob;
      } else {
        pngBlob = await new Promise<Blob>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const objectUrl = URL.createObjectURL(rawBlob);
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width || 300;
              canvas.height = img.naturalHeight || img.height || 300;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                URL.revokeObjectURL(objectUrl);
                return reject(new Error('Canvas context unavailable'));
              }
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((b) => {
                URL.revokeObjectURL(objectUrl);
                if (b) resolve(b);
                else reject(new Error('Canvas toBlob failed'));
              }, 'image/png');
            } catch (err) {
              URL.revokeObjectURL(objectUrl);
              reject(err);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Image load failed'));
          };
          img.src = objectUrl;
        });
      }

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob }),
      ]);
      notify(isGif ? 'GIF copied to clipboard' : 'Image copied to clipboard');
      return true;
    } catch (err) {
      console.warn('[copyImageToClipboard] Direct blob copy failed, falling back:', err);
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(safeUrl);
      notify(isGif ? 'GIF link copied to clipboard' : 'Image link copied to clipboard');
      return true;
    }
  } catch (err) {
    console.error('[copyImageToClipboard] All clipboard copy strategies failed:', err);
  }

  notify(isGif ? 'Failed to copy GIF' : 'Failed to copy image');
  return false;
}
