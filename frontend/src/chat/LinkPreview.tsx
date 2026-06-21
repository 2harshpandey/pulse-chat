import React, { useState, useEffect } from 'react';
import type { LinkPreviewData } from './types';
import { MAX_LINK_PREVIEW_CACHE_ENTRIES } from './constants';
import { resolveApiBaseUrl } from './utils';
import {
  LinkPreviewCard, LinkPreviewImageWrapper, LinkPreviewImage, LinkPreviewBody, LinkPreviewSiteName,
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
  linkPreviewInFlight.set(url, promise);
  return promise;
};

export const LinkPreviewSkeleton = ({ sender }: { sender: 'me' | 'other' }) => (
  <LinkPreviewCard
    $sender={sender}
    as="div"
    style={{ opacity: 0.6, pointerEvents: 'none' }}
  >
    <div style={{ width: '78px', minWidth: '78px', height: '78px', background: sender === 'me' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', display: 'block' }} />
    <LinkPreviewBody>
      <div style={{ height: '14px', width: '50%', background: sender === 'me' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', marginBottom: '8px', borderRadius: '3px' }} />
      <div style={{ height: '12px', width: '80%', background: sender === 'me' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)', marginBottom: '6px', borderRadius: '3px' }} />
      <div style={{ height: '12px', width: '60%', background: sender === 'me' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)', borderRadius: '3px' }} />
    </LinkPreviewBody>
  </LinkPreviewCard>
);


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
    return () => { cancelled = true; };
  }, [url]);
  if (!data) return <LinkPreviewSkeleton sender={sender} />;

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
      <LinkPreviewImageWrapper>
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
      </LinkPreviewImageWrapper>
      <LinkPreviewBody>
        <LinkPreviewSiteName $sender={sender}>{data.siteName || data.hostname}</LinkPreviewSiteName>
        {data.title ? (
          <LinkPreviewTitle $sender={sender}>{data.title}</LinkPreviewTitle>
        ) : (
          <LinkPreviewTitle $sender={sender} style={{ wordBreak: 'break-all', fontWeight: 500 }}>{url}</LinkPreviewTitle>
        )}
        {data.description && <LinkPreviewDesc $sender={sender}>{data.description}</LinkPreviewDesc>}
      </LinkPreviewBody>
    </LinkPreviewCard>
  );
});
