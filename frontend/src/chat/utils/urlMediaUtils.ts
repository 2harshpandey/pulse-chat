// --- URL, Host, Cloudinary, Filename & Media Classification Helpers ---

import type { PresenceActivity } from '../types';
import {
  AUDIO_EXT_RE,
  AUDIO_URL_RE,
  IMAGE_EXT_RE,
  IMAGE_URL_RE,
  DOC_EXT_RE,
  DOC_URL_RE,
  VIDEO_EXT_RE,
  VIDEO_URL_RE,
  classifyUploadFile,
} from '../../shared/mediaTypes';

/**
 * Trusted CDN hostnames allowed as download targets in downloadFile.
 */
export const ALLOWED_DOWNLOAD_HOSTS = ['res.cloudinary.com', 'giphy.com'];

/**
 * Safely checks if a URL belongs to Cloudinary's trusted domains (res.cloudinary.com or *.cloudinary.com)
 * by parsing the hostname rather than checking a raw substring, preventing CodeQL CWE-020 alerts.
 */
export const isCloudinaryUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      (host === 'cloudinary.com' || host.endsWith('.cloudinary.com'))
    );
  } catch {
    return false;
  }
};

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

export const getStoredValue = (key: string): string | null => {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) {
      const val = sessionStorage.getItem(key);
      if (val) return val;
    }
  } catch (_) {}
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const val = localStorage.getItem(key);
      if (val) return val;
    }
  } catch (_) {}
  return null;
};

export const repairMojibakeText = (value?: string | null): string => {
  const raw = String(value || '');
  if (!raw) return '';

  // Repair single- and double-encoded UTF-8-as-Latin1/Win1252 sequences without touching ASCII hyphens
  const repaired = raw
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u201e\u00a2|\u00e2\u20ac\u2122|\u00e2\u0080\u0099/g, "'")
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00cb\u0153|\u00e2\u20ac\u02dc|\u00e2\u0080\u0098/g, "'")
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00c5\u201c|\u00e2\u20ac\u0153|\u00e2\u0080\u009c/g, '"')
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u009d|\u00e2\u20ac\u009d|\u00e2\u0080\u009d/g, '"')
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u0153|\u00e2\u20ac\u201c|\u00e2\u0080\u0093/g, '-')
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d|\u00e2\u20ac\u201d|\u00e2\u0080\u0094/g, '-')
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a6|\u00e2\u20ac\u00a6|\u00e2\u0080\u00a6/g, '...')
    .replace(/\u00c3\u0082\u00c2\u00b7|\u00c2\u00b7/g, '\u00b7')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00c3\u0192\u00c2\u00a2\u00c3\u00a2\u00e2\u201a\u00ac\u00c5\u00a1\u00c3\u0082\u00c2\u00ac|\u00e2\u201a\u00ac/g, 'EUR')
    .replace(/\u00c3\u0082/g, '')
    .replace(/\u00c2(?=\s|$|[\w().,;:'"-])/g, '');

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

export const getPresenceActivityForFile = (file: { name?: string; type?: string }): PresenceActivity => {
  const name = file.name || '';
  const type = file.type || '';
  const fileKind = classifyUploadFile(file);
  if (fileKind === 'audio') return 'sending_audio';
  if (type === 'image/gif' || /\.gif$/i.test(name)) return 'sending_gif';
  if (fileKind === 'image') return 'sending_photo';
  if (fileKind === 'video') return 'sending_video';
  return 'sending_file';
};

export const getPresenceActivityForFiles = (files: File[]): PresenceActivity => {
  if (files.length === 0) return 'sending_file';
  if (files.length === 1) return getPresenceActivityForFile(files[0]);

  const activities = files.map(getPresenceActivityForFile);
  const first = activities[0];
  if (activities.every((a) => a === first)) {
    return first;
  }
  const allMedia = activities.every(
    (a) =>
      a === 'sending_photo' ||
      a === 'sending_video' ||
      a === 'sending_gif' ||
      a === 'sending_audio'
  );
  if (allMedia) return 'sending_media';
  return 'sending_file';
};

/**
 * Checks if a message is specifically a photo or GIF (not video, audio, or document).
 */
export const isPhotoOrGif = (msg?: { type?: string; url?: string; originalName?: string; [key: string]: any } | null): boolean => {
  if (!msg) return false;
  const type = (msg.type || '').toLowerCase();
  const url = (msg.url || '').toLowerCase();
  const name = (msg.originalName || '').toLowerCase();

  if (type === 'video' || type === 'audio' || type === 'file' || type === 'doc') {
    return false;
  }
  if (
    VIDEO_URL_RE.test(url) || AUDIO_URL_RE.test(url) || DOC_URL_RE.test(url) ||
    VIDEO_EXT_RE.test(name) || AUDIO_EXT_RE.test(name) || DOC_EXT_RE.test(name)
  ) {
    return false;
  }

  if (type === 'image' || type === 'photo' || type === 'gif') {
    return true;
  }
  if (IMAGE_URL_RE.test(url) || IMAGE_EXT_RE.test(name)) {
    return true;
  }

  return false;
};

/**
 * Checks if a message has any media attachment (photo, gif, video, audio, or document).
 */
export const hasMediaAttachment = (msg?: { type?: string; url?: string; originalName?: string; [key: string]: any } | null): boolean => {
  if (!msg) return false;
  const type = (msg.type || '').toLowerCase();
  const url = (msg.url || '').toLowerCase();
  const name = (msg.originalName || '').toLowerCase();

  if (
    type === 'image' ||
    type === 'photo' ||
    type === 'gif' ||
    type === 'video' ||
    type === 'audio' ||
    type === 'file' ||
    type === 'doc'
  ) {
    return true;
  }

  if (
    IMAGE_URL_RE.test(url) || VIDEO_URL_RE.test(url) || AUDIO_URL_RE.test(url) || DOC_URL_RE.test(url) ||
    IMAGE_EXT_RE.test(name) || VIDEO_EXT_RE.test(name) || AUDIO_EXT_RE.test(name) || DOC_EXT_RE.test(name)
  ) {
    return true;
  }

  return Boolean(msg.url);
};
