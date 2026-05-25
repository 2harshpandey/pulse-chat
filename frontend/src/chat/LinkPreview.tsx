import React, { useState, useEffect } from 'react';
import type { LinkPreviewData } from './types';
import { MAX_LINK_PREVIEW_CACHE_ENTRIES } from './constants';
import { resolveApiBaseUrl } from './utils';
import {
  LinkPreviewCard, LinkPreviewImage, LinkPreviewBody, LinkPreviewSiteName,
  LinkPreviewTitle, LinkPreviewDesc,
} from './ChatStyledComponents';

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

export const LinkPreview: React.FC<{ url: string; sender: 'me' | 'other' }> = React.memo(({ url, sender }) => {
  const [data, setData] = useState<LinkPreviewData | null | undefined>(
    () => {
      if (!linkPreviewCache.has(url)) return getLinkPreviewFallback(url);
      return linkPreviewCache.get(url) ?? getLinkPreviewFallback(url);
    }
  );
  useEffect(() => {
    if (linkPreviewCache.has(url)) {
      setData(linkPreviewCache.get(url) ?? getLinkPreviewFallback(url));
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await fetchLinkPreviewData(url);
      if (!cancelled) setData(result ?? getLinkPreviewFallback(url));
    })();
    return () => { cancelled = true; };
  }, [url]);
  if (!data) return null;

  const primaryImage = data.image || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(data.hostname)}&sz=128`;
  const secondaryImage = `https://${data.hostname}/favicon.ico`;

  return (
    <LinkPreviewCard
      $sender={sender}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <LinkPreviewImage
        src={primaryImage}
        alt=""
        onError={(e) => {
          const current = e.currentTarget.getAttribute('src') || '';
          if (current !== secondaryImage) {
            e.currentTarget.setAttribute('src', secondaryImage);
            return;
          }
          e.currentTarget.style.visibility = 'hidden';
        }}
      />
      <LinkPreviewBody>
        <LinkPreviewSiteName $sender={sender}>{data.siteName || data.hostname}</LinkPreviewSiteName>
        {data.title && <LinkPreviewTitle $sender={sender}>{data.title}</LinkPreviewTitle>}
        {data.description && <LinkPreviewDesc $sender={sender}>{data.description}</LinkPreviewDesc>}
      </LinkPreviewBody>
    </LinkPreviewCard>
  );
});
