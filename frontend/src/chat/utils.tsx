// --- PURE UTILITY FUNCTIONS ---
import React from 'react';
import type { DownloadProgressCallback, RouterHistoryState } from './types';

export const getUserId = (): string => {
  let userId = localStorage.getItem('pulseUserId');
  if (!userId) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(3);
      window.crypto.getRandomValues(array);
      userId = Date.now().toString(36) + Array.from(array, n => n.toString(36)).join('');
    } else {
      userId = Date.now().toString(36) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }
    localStorage.setItem('pulseUserId', userId);
  }
  return userId;
};

export const estimateMessageHeight = (msg: any): number => {
  let h = 50; 
  if (msg.replyingTo) h += 60;
  if (msg.type === 'image' || msg.type === 'video') h += 300;
  else if (msg.type === 'file') h += 80;
  if (msg.text) {
    const lines = msg.text.split('\n').length;
    const wrapLines = Math.ceil(msg.text.length / 40);
    h += Math.max(lines, wrapLines) * 20;
  }
  if (msg.url) h += 100;
  if (msg.reactions && Object.keys(msg.reactions).length > 0) h += 30;
  return h;
};

export const normalizeMessageId = (rawId: any): string => {
  if (rawId === null || rawId === undefined) return '';
  if (typeof rawId === 'string' || typeof rawId === 'number') return String(rawId);
  if (typeof rawId === 'object') {
    const nested = (rawId as any).id ?? (rawId as any)._id ?? (rawId as any).messageId;
    if (nested !== null && nested !== undefined) return String(nested);
  }
  return '';
};

export const getMessageElementId = (rawId: any): string => {
  const normalized = normalizeMessageId(rawId);
  if (!normalized) return '';
  return `message-${encodeURIComponent(normalized)}`;
};

export const normalizeOverlayText = (value: string): string => value.replace(/\u00A0/g, ' ');

export const EMOJI_SEQUENCE_RE = /(?:[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF])(?:\uFE0F|\u200D(?:[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]))*/g;

export const wrapEmojis = (value: string, isStandalone: boolean = false): React.ReactNode[] => {
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  EMOJI_SEQUENCE_RE.lastIndex = 0;
  while ((match = EMOJI_SEQUENCE_RE.exec(value)) !== null) {
    if (match.index > lastIndex) {
      result.push(value.slice(lastIndex, match.index));
    }
    result.push(
      <span key={`emoji-${match.index}`} className={isStandalone ? "emoji-standalone" : "emoji-inline"}>{match[0]}</span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    result.push(value.slice(lastIndex));
  }
  return result;
};

export const findMessageElement = (rawId: any): HTMLElement | null => {
  const normalized = normalizeMessageId(rawId);
  if (!normalized) return null;

  // Prefer the actual element ID so highlights apply to the styled component
  const byId = document.getElementById(getMessageElementId(normalized)) as HTMLElement | null;
  if (byId) return byId;

  // Fallback to VirtualMessageWrapper if the message is off-screen (unmounted)
  const byVirtualId = document.querySelector(`[data-virtual-id="${normalized}"]`) as HTMLElement | null;
  if (byVirtualId) return byVirtualId;

  return null;
};

export const resolveReplyTargetId = (replyingTo: any, sourceMessageId?: string): string => {
  const sourceId = normalizeMessageId(sourceMessageId);
  const candidates = [replyingTo?.id, replyingTo?.messageId, replyingTo?._id];
  const normalized = candidates.map((candidate) => normalizeMessageId(candidate)).filter(Boolean);
  if (normalized.length === 0) return '';
  const nonSelf = normalized.find((candidate) => !sourceId || candidate !== sourceId);
  return nonSelf || normalized[0];
};

/**
 * Trusted CDN hostnames allowed as download targets in downloadFile.
 */
export const ALLOWED_DOWNLOAD_HOSTS = ['res.cloudinary.com', 'giphy.com'];

export const resolveApiBaseUrl = (): string => {
  const base = (import.meta.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
  if (!base) return '';
  const useHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return base.replace(/^http:\/\//, useHttps ? 'https://' : 'http://');
};

export const buildDownloadProxyUrl = (resourceUrl: string, filename?: string): string => {
  const apiBase = resolveApiBaseUrl();
  const endpoint = `${apiBase}/api/download`;
  const params = new URLSearchParams({ url: resourceUrl });
  if (filename) params.set('filename', filename);
  return `${endpoint}?${params.toString()}`;
};

/**
 * Fetches a URL as a blob and reports incremental transfer progress when
 * content-length is available.
 */
export const fetchBlobWithProgress = async (
  resourceUrl: string,
  onProgress?: DownloadProgressCallback,
  abortSignal?: AbortSignal,
): Promise<Blob> => {
  onProgress?.(0);
  const response = await fetch(resourceUrl, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    signal: abortSignal,
  });
  if (!response.ok) throw new Error('Fetch failed');

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

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
    const blob = new Blob(chunks);
    if (!blob || blob.size === 0) throw new Error('Empty blob');
    onProgress?.(1);
    return blob;
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) throw new Error('Empty blob');
  onProgress?.(1);
  return blob;
};

export const repairMojibakeText = (value?: string | null): string => {
  const raw = String(value || '');
  if (!raw) return '';

  const repaired = raw
    .replace(/'|'|'|â/g, "'")
    .replace(/'|'|â/g, "'")
    .replace(/"|"|â/g, '"')
    .replace(/-|"|â€|â/g, '"')
    .replace(/-"|â€“|â/g, '-')
    .replace(/-|â€”|â/g, '-')
    .replace(/-|â€¦|â¦/g, '...')
    .replace(/-|Â·/g, '·')
    .replace(/—|–/g, '-')
    .replace(/…/g, '...')
    .replace(/-/g, 'EUR')
    .replace(/-/g, '')
    .replace(/Â(?=\s|$|[\w().,;:'"-])/g, '');

  return repaired.normalize('NFC');
};

export const sanitizeFilename = (name: string, fallback: string = 'download'): string => {
  const raw = repairMojibakeText(name).trim();
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
};

export const getDisplayFilename = (name?: string | null, fileUrl?: string | null, fallback: string = 'Download file'): string => {
  const repairedName = sanitizeFilename(String(name || ''), '');
  if (repairedName) return repairedName;

  if (fileUrl) {
    try {
      const parsed = new URL(fileUrl);
      const pathName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
      const repairedPathName = sanitizeFilename(pathName, '');
      if (repairedPathName) return repairedPathName;
    } catch {
      // Ignore malformed URLs and use the fallback below.
    }
  }

  return fallback;
};

export const chooseReadableFilename = (preferred?: string | null, fallback?: string | null, defaultName: string = 'file'): string => {
  const repairedPreferred = sanitizeFilename(String(preferred || ''), '');
  const repairedFallback = sanitizeFilename(String(fallback || ''), '');

  if (!repairedPreferred) return repairedFallback || defaultName;
  if (!preferred || repairedPreferred !== preferred) return repairedFallback || repairedPreferred;
  return repairedPreferred;
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

  const isTrustedHost =
    (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    ALLOWED_DOWNLOAD_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
  if (!isTrustedHost) return;

  const pathName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  const fallbackName = sanitizeFilename(pathName, 'download');
  const safeFilename = sanitizeFilename(filename, fallbackName);

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
      // Last-resort browser navigation fallback. This keeps file clicks useful even
      // if the proxy fetch is blocked by CORS/provider behavior in production.
      triggerAnchorDownload(buildDownloadProxyUrl(parsed.href, safeFilename), safeFilename);
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
 * Sanitizes a URL before using it as a media src/href attribute.
 */
export const sanitizeMediaUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'blob:') {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
};

/**
 * Returns true only if the URL hostname is exactly giphy.com or a subdomain.
 */
export const isGiphyUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'giphy.com' || hostname.endsWith('.giphy.com');
  } catch {
    return false;
  }
};

export const withCloudinaryTransform = (url: string, transform: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'res.cloudinary.com' && !host.endsWith('.res.cloudinary.com')) return '';

    const marker = '/upload/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return '';

    const prefix = parsed.pathname.slice(0, markerIndex + marker.length);
    const rest = parsed.pathname.slice(markerIndex + marker.length);
    if (!rest) return '';

    parsed.pathname = `${prefix}${transform}/${rest}`;
    return parsed.href;
  } catch {
    return '';
  }
};

export const getQuotedPreviewThumbUrl = (mediaType: 'image' | 'video', mediaUrl?: string): string => {
  const safeUrl = sanitizeMediaUrl(mediaUrl);
  if (!safeUrl) return '';
  if (mediaType === 'video') {
    return withCloudinaryTransform(safeUrl, 'so_0,f_jpg,q_20,w_96,h_96,c_fill') || '';
  }
  return withCloudinaryTransform(safeUrl, 'f_auto,q_20,w_96,h_96,c_fill') || safeUrl;
};

export const getMediaGatePreviewUrl = (mediaType: 'image' | 'video', mediaUrl?: string): string => {
  const safeUrl = sanitizeMediaUrl(mediaUrl);
  if (!safeUrl) return '';
  if (mediaType === 'video') {
    return withCloudinaryTransform(safeUrl, 'so_0,f_jpg,q_55,w_720,h_720,c_fill') || '';
  }
  return withCloudinaryTransform(safeUrl, 'f_auto,q_55,w_720,h_720,c_fill') || safeUrl;
};

export const formatMediaSize = (bytes?: number): string => {
  const numericBytes = typeof bytes === 'number' ? bytes : Number(bytes);
  if (!Number.isFinite(numericBytes) || numericBytes <= 0) return '';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = numericBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

export const getMediaCacheLookupKey = (messageId: string, sourceUrl: string): string =>
  `${messageId}::${sourceUrl}`;

export const getFileContainerLabel = (name?: string, fileUrl?: string): string => {
  let candidate = repairMojibakeText(name || '').trim();

  if (!candidate && fileUrl) {
    try {
      const parsed = new URL(fileUrl);
      candidate = repairMojibakeText(decodeURIComponent(parsed.pathname.split('/').pop() || ''));
    } catch {
      candidate = '';
    }
  }

  const extensionMatch = candidate.match(/\.([a-z0-9]{1,16})$/i);
  return extensionMatch ? extensionMatch[1].toUpperCase() : 'FILE';
};

export const inferredContentLengthByUrlCache = new Map<string, number>();

export const getCurrentHistoryPath = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const readRouterHistoryState = (): RouterHistoryState => {
  const raw = window.history.state;
  if (raw && typeof raw === 'object') {
    return { ...(raw as RouterHistoryState) };
  }
  return {};
};

export const readRouterUserState = (state: RouterHistoryState): Record<string, unknown> => {
  if (state.usr && typeof state.usr === 'object' && !Array.isArray(state.usr)) {
    return { ...(state.usr as Record<string, unknown>) };
  }
  return {};
};

export const buildOverlayGuardState = (
  baseState: RouterHistoryState,
  hasOverlayGuard: boolean,
  mode: 'push' | 'replace',
): RouterHistoryState => {
  const nextBase = { ...baseState };
  const nextUserState = readRouterUserState(baseState);

  if (Object.prototype.hasOwnProperty.call(nextBase, 'overlayGuard')) {
    if (nextBase.overlayGuard === true) {
      nextUserState.overlayGuard = true;
    }
    delete nextBase.overlayGuard;
  }

  if (hasOverlayGuard) {
    nextUserState.overlayGuard = true;
  } else {
    delete nextUserState.overlayGuard;
  }

  const fallbackIdx = Math.max(window.history.length - 1, 0);
  const currentIdx = typeof nextBase.idx === 'number' ? nextBase.idx : fallbackIdx;
  const currentKey = typeof nextBase.key === 'string' && nextBase.key
    ? nextBase.key
    : Math.random().toString(36).slice(2, 10);

  return {
    ...nextBase,
    usr: nextUserState,
    idx: mode === 'push' ? currentIdx + 1 : currentIdx,
    key: mode === 'push' ? Math.random().toString(36).slice(2, 10) : currentKey,
  };
};

export const pushOverlayGuardHistoryEntry = (): void => {
  const nextState = buildOverlayGuardState(readRouterHistoryState(), true, 'push');
  window.history.pushState(nextState, document.title, getCurrentHistoryPath());
};

export const clearOverlayGuardHistoryEntry = (): void => {
  const nextState = buildOverlayGuardState(readRouterHistoryState(), false, 'replace');
  window.history.replaceState(nextState, document.title, getCurrentHistoryPath());
};

/**
 * Module-level WeakMap cache for blob: URLs.
 */
const _blobUrlCache = new WeakMap<File, string>();

export const getBlobUrl = (file: File | undefined): string => {
  if (!file) return '';
  if (!_blobUrlCache.has(file)) {
    _blobUrlCache.set(file, URL.createObjectURL(file));
  }
  return _blobUrlCache.get(file)!;
};

export const revokeBlobUrl = (file: File): void => {
  const url = _blobUrlCache.get(file);
  if (url) { URL.revokeObjectURL(url); _blobUrlCache.delete(file); }
};

// ---------------------------------------------------------------------------
// "Delete for me" persistence helpers
// ---------------------------------------------------------------------------
const DELETED_FOR_ME_KEY = (userId: string) => `pulseDeletedForMe_${userId}`;

export function getDeletedForMeIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_FOR_ME_KEY(userId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function addDeletedForMeIds(userId: string, ids: string[]): void {
  try {
    const existing = getDeletedForMeIds(userId);
    ids.forEach(id => existing.add(id));
    localStorage.setItem(DELETED_FOR_ME_KEY(userId), JSON.stringify(Array.from(existing)));
  } catch { /* storage full — ignore */ }
}
