import type { LinkPreviewData } from './types';
import { MAX_LINK_PREVIEW_CACHE_ENTRIES } from './constants';
import { resolveApiBaseUrl, getSessionToken, getStoredValue } from './utils';

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

export const fetchLinkPreviewData = (url: string, roomId?: string): Promise<LinkPreviewData | null> => {
  if (linkPreviewCache.has(url)) return Promise.resolve(linkPreviewCache.get(url) ?? null);
  if (linkPreviewInFlight.has(url)) return linkPreviewInFlight.get(url)!;

  const promise = (async () => {
    try {
      const apiBase = resolveApiBaseUrl();
      const currentRoomId = roomId || getStoredValue('pulseRoomId') || getStoredValue('pulse_room_id') || 'me';
      const previewEndpoint = `${apiBase}/api/link-preview?url=${encodeURIComponent(url)}&roomId=${encodeURIComponent(currentRoomId)}`;
      
      const headers: Record<string, string> = {
        'x-room-id': currentRoomId,
      };
      const sessionToken = getSessionToken(currentRoomId);
      if (sessionToken) headers['x-session-token'] = sessionToken;
      const userId = getStoredValue('pulseUserId') || getStoredValue('pulse_user_id');
      if (userId) headers['x-user-id'] = userId;

      const res = await fetch(previewEndpoint, { headers });
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
