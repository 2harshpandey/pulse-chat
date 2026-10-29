import React, { useState, useEffect, useMemo } from 'react';
import type { LinkPreviewData } from './types';
import {
  LinkPreviewCard, LinkPreviewImageWrapper, LinkPreviewImage, LinkPreviewBody, LinkPreviewSiteName,
  LinkPreviewTitle, LinkPreviewDesc,
} from './ChatStyledComponents';
import { getRootDomain, isDomainOrSubdomain, isAmazonHost, getHostnameFromUrl } from './utils';

import {
  linkPreviewCache,
  getLinkPreviewFallback,
  fetchLinkPreviewData
} from './linkPreviewState';
import { safeHref } from './renderMessage';

export const LinkPreviewSkeleton = ({ sender }: { sender: 'me' | 'other' }) => (
  <LinkPreviewCard
    $sender={sender}
    as="div"
    style={{ opacity: 0.6, pointerEvents: 'none' }}
  >
    <div style={{ width: '96px', minWidth: '96px', height: '96px', background: sender === 'me' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', display: 'block' }} />
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
      if (!linkPreviewCache.has(url)) return null;
      return linkPreviewCache.get(url) ?? getLinkPreviewFallback(url);
    }
  );

  const [candidateIdx, setCandidateIdx] = useState(0);

  useEffect(() => {
    setCandidateIdx(0);
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

  const rootDomain = data ? getRootDomain(data.hostname) : '';
  const host = data ? data.hostname.replace(/^www\./i, '').toLowerCase() : '';

  // Specific media/product previews (YouTube video thumbnail, Amazon product picture) should use data.image
  const isSpecialMediaPreview = useMemo(() => {
    if (!data?.image) return false;
    const isYouTubePage = isDomainOrSubdomain(host, 'youtube.com') || isDomainOrSubdomain(host, 'youtu.be');
    const isAmazonPage = isAmazonHost(host);
    const imgHost = getHostnameFromUrl(data.image);
    const isYouTubeImg = isDomainOrSubdomain(imgHost, 'ytimg.com');
    const isAmazonImg = isDomainOrSubdomain(imgHost, 'media-amazon.com') || isDomainOrSubdomain(imgHost, 'images-amazon.com');
    return isYouTubePage || isAmazonPage || isYouTubeImg || isAmazonImg;
  }, [data?.image, host]);

  const candidates = useMemo(() => {
    if (!data) return [];
    const list: string[] = [];

    // 1. YouTube video or Amazon product photo
    if (isSpecialMediaPreview && data.image) {
      list.push(data.image);
    }

    // 2. Official favicon from page (e.g. apple-touch-icon, like WhatsApp 2.8KB webp square icon)
    if (data.favicon) {
      list.push(data.favicon);
    }

    // 3. High quality DuckDuckGo and Google favicon CDNs on root domain (~1-3KB lightweight square icons)
    if (rootDomain) {
      list.push(`https://icons.duckduckgo.com/ip3/${rootDomain}.ico`);
      list.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(rootDomain)}&sz=128`);
    }

    // 4. Subdomain host fallback (Google can resolve some subdomains; avoid DuckDuckGo which returns a 404 dummy image)
    if (host && host !== rootDomain) {
      list.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`);
      list.push(`https://${host}/favicon.ico`);
    }

    // 5. Root domain direct favicon.ico
    if (rootDomain) {
      list.push(`https://${rootDomain}/favicon.ico`);
    }

    // 6. Fallback to data.image if no favicon succeeded
    if (!isSpecialMediaPreview && data.image) {
      list.push(data.image);
    }

    return Array.from(new Set(list));
  }, [data?.image, data?.favicon, host, rootDomain, isSpecialMediaPreview]);

  if (!data) return <LinkPreviewSkeleton sender={sender} />;

  const currentSrc = candidateIdx < candidates.length ? candidates[candidateIdx] : '';

  return (
    <LinkPreviewCard
      $sender={sender}
      href={safeHref(url)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {currentSrc && (
        <LinkPreviewImageWrapper>
          <LinkPreviewImage
            src={currentSrc}
            alt=""
            style={{
              objectFit: 'contain',
              padding: isSpecialMediaPreview ? '4px' : '14px',
              boxSizing: 'border-box',
            }}
            onError={() => {
              setCandidateIdx((prev) => prev + 1);
            }}
          />
        </LinkPreviewImageWrapper>
      )}
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
