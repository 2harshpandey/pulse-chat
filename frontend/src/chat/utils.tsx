// --- PURE UTILITY FUNCTIONS ---
import React from 'react';
import type { DownloadProgressCallback, RouterHistoryState, Message } from './types';

export const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + encodeURIComponent(name) + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
};

export const setCookie = (name: string, value: string, days = 365): void => {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

export const deleteCookie = (name: string): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
};

export const getUserId = (): string => {
  let userId: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      userId = localStorage.getItem('pulseUserId') || getCookie('pulseUserId');
    } catch (_) {}
  }
  if (!userId) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(3);
      window.crypto.getRandomValues(array);
      userId = Date.now().toString(36) + Array.from(array, n => n.toString(36)).join('');
    } else {
      userId = Date.now().toString(36) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }
  }
  if (typeof window !== 'undefined' && userId) {
    try {
      localStorage.setItem('pulseUserId', userId);
      setCookie('pulseUserId', userId, 365);
    } catch (_) {}
  }
  return userId;
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

export const audioDurationCache = new Map<string, number>();

type AudioDurationSubscriber = (key: string, duration: number) => void;
const audioDurationSubscribers = new Set<AudioDurationSubscriber>();

export const setAudioDurationCache = (key: string | null | undefined, duration: number | null | undefined): void => {
  if (!key || typeof duration !== 'number' || isNaN(duration) || !isFinite(duration) || duration <= 0) return;
  const rounded = Math.round(duration * 10) / 10;
  audioDurationCache.set(key, rounded);
  audioDurationSubscribers.forEach((sub) => {
    try {
      sub(key, rounded);
    } catch (err) {
      console.error('Audio duration subscriber error:', err);
    }
  });
};

export const subscribeAudioDuration = (subscriber: AudioDurationSubscriber): (() => void) => {
  audioDurationSubscribers.add(subscriber);
  return () => {
    audioDurationSubscribers.delete(subscriber);
  };
};

export const resolveAudioDuration = async (url?: string | null, id?: string | null): Promise<number | null> => {
  if (id && audioDurationCache.has(id)) return audioDurationCache.get(id)!;
  if (url && audioDurationCache.has(url)) return audioDurationCache.get(url)!;
  if (!url || typeof window === 'undefined') return null;

  // 1. Fast check: If it's an HTTP/HTTPS CDN link, try a HEAD request to extract Server-Timing duration if present
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const headController = new AbortController();
      const headTimeout = setTimeout(() => headController.abort(), 2000);
      const headRes = await fetch(url, { method: 'HEAD', mode: 'cors', signal: headController.signal }).catch(() => null);
      clearTimeout(headTimeout);
      if (headRes && headRes.ok) {
        const serverTiming = headRes.headers.get('server-timing') || '';
        const duMatch = serverTiming.match(/du=([0-9.]+)/i);
        if (duMatch && duMatch[1]) {
          const parsedDu = parseFloat(duMatch[1]);
          if (!isNaN(parsedDu) && isFinite(parsedDu) && parsedDu > 0) {
            setAudioDurationCache(id, parsedDu);
            setAudioDurationCache(url, parsedDu);
            return parsedDu;
          }
        }
      }
    } catch {
      // Continue to audio element resolution
    }
  }

  // 2. Programmatic Audio Element Resolution
  if (typeof Audio === 'undefined') return null;

  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      audio.preload = 'metadata';
      let resolved = false;

      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('durationchange', onLoaded);
        audio.removeEventListener('canplay', onLoaded);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('timeupdate', onSeekEnd);
        audio.removeEventListener('seeked', onSeekEnd);
        try {
          audio.src = '';
        } catch {}
      };

      const finishWithDuration = (dur: number) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        setAudioDurationCache(id, dur);
        setAudioDurationCache(url, dur);
        resolve(dur);
      };

      const onSeekEnd = () => {
        if (resolved) return;
        const dur = audio.duration;
        if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
          finishWithDuration(dur);
        }
      };

      const onLoaded = () => {
        if (resolved) return;
        const dur = audio.duration;
        // Chromium WebM recorded audio fix: duration is reported as Infinity initially
        if (dur === Infinity) {
          audio.addEventListener('timeupdate', onSeekEnd);
          audio.addEventListener('seeked', onSeekEnd);
          try {
            audio.currentTime = 1e101;
          } catch {
            // Seek failed
          }
          return;
        }

        if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
          finishWithDuration(dur);
        }
      };

      const onError = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(null);
      };

      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('durationchange', onLoaded);
      audio.addEventListener('canplay', onLoaded);
      audio.addEventListener('error', onError);

      audio.src = url;
      try {
        audio.load();
      } catch {}

      // 10 second timeout safety net
      setTimeout(() => {
        if (!resolved) {
          if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
            finishWithDuration(audio.duration);
          } else {
            resolved = true;
            cleanup();
            resolve(null);
          }
        }
      }, 10000);
    } catch {
      resolve(null);
    }
  });
};

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

  // Direct ID match on element
  const byRawId = document.getElementById(normalized) as HTMLElement | null;
  if (byRawId) return byRawId;

  // Match by data-message-id or data-mongo-id attribute
  const byDataId = document.querySelector(
    `[data-message-id="${normalized}"], [data-mongo-id="${normalized}"]`
  ) as HTMLElement | null;
  if (byDataId) return byDataId;

  // Fallback to grouped media message row if target is part of a media album
  const byGroup = document.querySelector(`[data-grouped-ids~="${normalized}"]`) as HTMLElement | null;
  if (byGroup) return byGroup;

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
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || /^192\.168\./.test(hostname) || /^10\./.test(hostname)) {
      return `${window.location.protocol}//${hostname}:8080`;
    }
  }
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

  const pathName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  const fallbackName = sanitizeFilename(pathName, 'download');
  const safeFilename = sanitizeFilename(filename, fallbackName);

  if (parsed.protocol === 'blob:') {
    triggerAnchorDownload(url, safeFilename);
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
  const mediaItems = messages.filter(
    (m) => !m.isDeleted && Boolean(m.url)
  );

  if (mediaItems.length === 0 || options?.signal?.aborted) return;

  try {
    options?.onProgress?.(0.05);

    // Dynamically load JSZip to avoid bundle bloat
    const jszipModule = await import('jszip');
    if (options?.signal?.aborted) return;

    const JSZip = (jszipModule && 'default' in jszipModule && jszipModule.default) ? jszipModule.default : (jszipModule as any);
    const zip = new JSZip();

    // Determine an informative zip filename with user, date, and timestamp
    const primaryMsg = mediaItems[0];
    const timestamp = primaryMsg.timestamp ? new Date(primaryMsg.timestamp) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}`;
    const timePart = `${pad(timestamp.getHours())}-${pad(timestamp.getMinutes())}-${pad(timestamp.getSeconds())}`;
    const rawUser = primaryMsg.username ? sanitizeFilename(primaryMsg.username, 'PulseUser') : 'PulseUser';
    const cleanUser = rawUser.replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = options?.zipNamePrefix || 'Pulse_Album';
    const zipFilename = `${prefix}_${cleanUser}_${datePart}_${timePart}.zip`;

    // Deduplicate filenames within the ZIP archive
    const usedNames = new Set<string>();
    const totalCount = mediaItems.length;
    let completedCount = 0;

    await Promise.all(
      mediaItems.map(async (msg, index) => {
        if (!msg.url || options?.signal?.aborted) return;
        const fileUrl = msg.url;
        const isAudio = msg.type === 'audio' || Boolean(
          (!msg.type || msg.type === 'file') && (
            fileUrl.match(/\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)($|\?)/i) ||
            msg.originalName?.match(/\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i) ||
            (msg.originalName?.toLowerCase().includes('voice') && fileUrl.match(/\.(webm|ogg|mp4|m4a)($|\?)/i))
          )
        );
        const isVideo = !isAudio && (msg.type === 'video' || Boolean(fileUrl.match(/\.(mp4|webm|mov)$/i)));
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

        // Handle duplicate filenames
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

        // Fetch blob using existing robust proxy fallback
        let blob: Blob;
        try {
          blob = await fetchBlobWithProgress(fileUrl, undefined, options?.signal);
        } catch (fetchErr) {
          if (options?.signal?.aborted) return;
          const proxyUrl = buildDownloadProxyUrl(fileUrl, uniqueName);
          blob = await fetchBlobWithProgress(proxyUrl, undefined, options?.signal);
        }

        if (options?.signal?.aborted) return;
        zip.file(uniqueName, blob);
        completedCount++;
        options?.onProgress?.(0.05 + (completedCount / totalCount) * 0.75);
      })
    );

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
 * Sanitizes a URL before using it as a media src/href attribute.
 */
export const sanitizeMediaUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);
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
  const cloudThumb = withCloudinaryTransform(safeUrl, 'f_auto,q_20,w_96,h_96,c_fill');
  if (cloudThumb) return cloudThumb;
  if (isGiphyUrl(safeUrl)) {
    return safeUrl
      .replace(/\/giphy\.gif(\?.*)?$/i, '/200w_s.gif$1')
      .replace(/\/200\.gif(\?.*)?$/i, '/200w_s.gif$1')
      .replace(/\/200w\.gif(\?.*)?$/i, '/200w_s.gif$1');
  }
  return safeUrl;
};

export const getMediaGatePreviewUrl = (mediaType: 'image' | 'video', mediaUrl?: string): string => {
  const safeUrl = sanitizeMediaUrl(mediaUrl);
  if (!safeUrl) return '';
  if (mediaType === 'video') {
    return withCloudinaryTransform(safeUrl, 'so_0,f_jpg,q_25,w_120,c_scale') || '';
  }

  // Cloudinary image thumbnail: ultra-lightweight ~1KB preview with scale & quality reduction
  const cloudThumb = withCloudinaryTransform(safeUrl, 'f_auto,q_25,w_120,c_scale');
  if (cloudThumb) return cloudThumb;

  // Giphy: use tiny static still (e.g. 200w_s.gif) rather than downloading the full animated GIF
  if (isGiphyUrl(safeUrl)) {
    return safeUrl
      .replace(/\/giphy\.gif(\?.*)?$/i, '/200w_s.gif$1')
      .replace(/\/200\.gif(\?.*)?$/i, '/200w_s.gif$1')
      .replace(/\/200w\.gif(\?.*)?$/i, '/200w_s.gif$1');
  }

  // Never fall back to raw safeUrl: doing so forces the browser to preload the heavy file in the background!
  return '';
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

/**
 * Universally copies text to clipboard across all platforms (Desktop, Android, iOS Safari),
 * supporting both secure contexts (HTTPS / localhost) and non-secure LAN IP contexts (http://192.168.x.x).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Async Clipboard API if available in secure context
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, falling back to execCommand:', err);
    }
  }

  // 2. Synchronous execCommand fallback for non-secure contexts (e.g. mobile over HTTP) or unsupported environments
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.fontSize = '16px'; // Prevents iOS Safari auto-zoom
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);

    const isIOS = typeof navigator !== 'undefined' && /ipad|iphone|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.focus({ preventScroll: true });
      textArea.select();
    }

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (fallbackErr) {
    console.error('execCommand fallback failed:', fallbackErr);
    return false;
  }
}

export const getRootDomain = (hostname: string): string => {
  if (!hostname) return '';
  const clean = hostname.replace(/^www\./i, '').toLowerCase();
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;
  const isSecondLevelCctld =
    parts.length > 2 &&
    ['co', 'com', 'org', 'net', 'gov', 'edu'].includes(parts[parts.length - 2]);
  return parts.slice(isSecondLevelCctld ? -3 : -2).join('.');
};

export const isDomainOrSubdomain = (targetHost: string, baseDomain: string): boolean => {
  if (!targetHost || !baseDomain) return false;
  const cleanTarget = targetHost.replace(/^www\./i, '').toLowerCase();
  const cleanBase = baseDomain.toLowerCase();
  return cleanTarget === cleanBase || cleanTarget.endsWith(`.${cleanBase}`);
};

export const isAmazonHost = (targetHost: string): boolean => {
  if (!targetHost) return false;
  const clean = targetHost.replace(/^www\./i, '').toLowerCase();
  return (
    clean === 'amazon.com' ||
    clean.endsWith('.amazon.com') ||
    clean === 'amzn.to' ||
    clean.endsWith('.amzn.to') ||
    clean === 'amzn.in' ||
    clean.endsWith('.amzn.in') ||
    /(?:^|\.)amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/i.test(clean)
  );
};

export const getHostnameFromUrl = (urlStr: string): string => {
  try {
    return new URL(urlStr).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
};

