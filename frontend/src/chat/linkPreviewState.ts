import type { LinkPreviewData } from './types';
import { MAX_LINK_PREVIEW_CACHE_ENTRIES } from './constants';
import { resolveApiBaseUrl } from './utils';

export const linkPreviewCache = new Map<string, LinkPreviewData | null>();
export const linkPreviewInFlight = new Map<string, Promise<LinkPreviewData | null>>();

export const getLinkPreviewFallback = (url: string): LinkPreviewData => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '');
    return { hostname };
  } catch {
    return { hostname: 'link' };
  }
};

export const rememberLinkPreview = (url: string, data: LinkPreviewData | null): void => {
  if (!linkPreviewCache.has(url) && linkPreviewCache.size >= MAX_LINK_PREVIEW_CACHE_ENTRIES) {
    const oldestKey = linkPreviewCache.keys().next().value;
    if (oldestKey) linkPreviewCache.delete(oldestKey);
  }
  linkPreviewCache.set(url, data);
};

export const fetchLinkPreviewData = (url: string): Promise<LinkPreviewData | null> => {
  if (linkPreviewCache.has(url)) return Promise.resolve(linkPreviewCache.get(url) ?? null);
  if (linkPreviewInFlight.has(url)) return linkPreviewInFlight.get(url)!;

  const promise = (async () => {
    try {
      const apiBase = resolveApiBaseUrl();
      const previewEndpoint = `${apiBase}/api/link-preview?url=${encodeURIComponent(url)}`;
      const res = await fetch(previewEndpoint);
      if (!res.ok) throw new Error('bad response');
      const json: LinkPreviewData = await res.json();
      rememberLinkPreview(url, json);
      return json;
    } catch {
      rememberLinkPreview(url, null);
      return null;
    } finally {
      linkPreviewInFlight.delete(url);
    }
  })();

  linkPreviewInFlight.set(url, promise);
  return promise;
};
