import { useState, useEffect } from 'react';
import type { Message } from './types';
import { downloadAlbumAsZip } from './utils';
import { sendClientDiagnostic } from './telemetry';

type Listener = () => void;

class AlbumDownloadManager {
  private activeDownloads = new Map<string, number>(); // albumId -> progress (0..1)
  private abortControllers = new Map<string, AbortController>(); // albumId -> AbortController
  private listeners = new Set<Listener>();
  private alreadyInProgressListeners = new Set<(albumId: string) => void>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onAlreadyInProgress(callback: (albumId: string) => void): () => void {
    this.alreadyInProgressListeners.add(callback);
    return () => {
      this.alreadyInProgressListeners.delete(callback);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('AlbumDownloadManager listener error:', err);
      }
    });
  }

  isDownloading(albumId: string): boolean {
    return this.activeDownloads.has(albumId);
  }

  getProgress(albumId: string): number {
    return this.activeDownloads.get(albumId) ?? 0;
  }

  hasAnyActiveDownload(): boolean {
    return this.activeDownloads.size > 0;
  }

  getActiveDownloadProgress(): number {
    let max = 0;
    for (const progress of this.activeDownloads.values()) {
      if (progress > max) max = progress;
    }
    return max;
  }

  notifyAlreadyInProgress(albumId: string) {
    this.alreadyInProgressListeners.forEach((cb) => {
      try {
        cb(albumId);
      } catch (err) {
        console.error('AlbumDownloadManager alreadyInProgress error:', err);
      }
    });
  }

  cancelDownload(albumId?: string): boolean {
    if (albumId) {
      const controller = this.abortControllers.get(albumId);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(albumId);
        this.activeDownloads.delete(albumId);
        this.notify();
        return true;
      }
      return false;
    }

    let anyCancelled = false;
    for (const [id, controller] of this.abortControllers.entries()) {
      controller.abort();
      this.activeDownloads.delete(id);
      anyCancelled = true;
    }
    this.abortControllers.clear();
    this.activeDownloads.clear();
    if (anyCancelled) {
      this.notify();
    }
    return anyCancelled;
  }

  async startDownload(
    albumId: string,
    target: Message[] | ((onProgress: (p: number) => void, signal?: AbortSignal) => Promise<any>),
    customAlreadyInProgress?: () => void
  ): Promise<boolean> {
    if (!albumId || !target) return false;
    if (Array.isArray(target) && target.length === 0) return false;

    if (this.activeDownloads.has(albumId)) {
      if (customAlreadyInProgress) {
        customAlreadyInProgress();
      }
      this.notifyAlreadyInProgress(albumId);
      return false;
    }

    const controller = new AbortController();
    this.abortControllers.set(albumId, controller);
    this.activeDownloads.set(albumId, 0.05);
    this.notify();
    sendClientDiagnostic('album_zip_download_start', {
      albumId,
      itemsCount: Array.isArray(target) ? target.length : undefined,
    });

    try {
      if (typeof target === 'function') {
        await target((p) => {
          if (controller.signal.aborted) return;
          this.activeDownloads.set(albumId, p);
          this.notify();
        }, controller.signal);
      } else {
        await downloadAlbumAsZip(target, {
          onProgress: (p) => {
            if (controller.signal.aborted) return;
            this.activeDownloads.set(albumId, p);
            this.notify();
          },
          signal: controller.signal,
        });
      }
      sendClientDiagnostic('album_zip_download_complete', { albumId });
      return !controller.signal.aborted;
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError') {
        sendClientDiagnostic('album_zip_download_cancelled', { albumId });
        return false;
      }
      console.error('Album download failed:', err);
      sendClientDiagnostic('album_zip_download_error', { albumId, error: String(err) });
      return false;
    } finally {
      this.abortControllers.delete(albumId);
      this.activeDownloads.delete(albumId);
      this.notify();
    }
  }
}

export const albumDownloadManager = new AlbumDownloadManager();

export function useAlbumDownload(albumId?: string) {
  const [, setTick] = useState(0);

  useEffect(() => {
    return albumDownloadManager.subscribe(() => {
      setTick((t) => t + 1);
    });
  }, []);

  return {
    isDownloading: albumId
      ? albumDownloadManager.isDownloading(albumId)
      : albumDownloadManager.hasAnyActiveDownload(),
    progress: albumId
      ? albumDownloadManager.getProgress(albumId)
      : albumDownloadManager.getActiveDownloadProgress(),
    startDownload: (messages: Message[], onAlready?: () => void) =>
      albumId
        ? albumDownloadManager.startDownload(albumId, messages, onAlready)
        : Promise.resolve(false),
    cancelDownload: (id?: string) =>
      albumDownloadManager.cancelDownload(id || albumId),
  };
}
