import React from 'react';
import type { Message } from './types';
import {
  sanitizeMediaUrl, isTenorUrl, withCloudinaryTransform, getMediaGatePreviewUrl,
  formatMediaSize, getFileContainerLabel, buildDownloadProxyUrl,
  fetchBlobWithProgress, downloadFile, wrapEmojis,
} from './utils';
import {
  MediaContent, MediaImageWrapper, MediaVideoWrapperDiv, MediaLoadGate, MediaLoadPreview,
  MediaLoadIcon, MediaLoadLabel, MediaSizeBadge, MediaDownloadOverlayBtn,
  FileAttachmentCard, FileAttachmentMeta, FileAttachmentName, FileAttachmentDetails,
  MessageText, DownloadProgressRing, VideoPlayerWrapper,
} from './ChatStyledComponents';
import { VideoPlayer } from './VideoPlayer';
import { MediaDisplay } from './MediaDisplay';

// --- URL Detection helpers ---
// Curated list of known valid TLDs ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â filters gibberish like .gfdgf or .gtd
export const VALID_TLDS = new Set([
  // Generic
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro',
  // Popular new gTLDs
  'io', 'co', 'ai', 'app', 'dev', 'web', 'tech', 'online', 'site', 'store', 'shop',
  'blog', 'cloud', 'digital', 'media', 'social', 'email', 'live', 'video', 'tv',
  'news', 'agency', 'studio', 'design', 'space', 'team', 'group', 'global',
  'world', 'today', 'network', 'finance', 'health', 'care', 'academy',
  // Country codes
  'ac', 'ad', 'ae', 'af', 'ag', 'al', 'am', 'ao', 'ar', 'as', 'at', 'au', 'aw', 'az',
  'ba', 'bb', 'bd', 'be', 'bg', 'bh', 'bi', 'bj', 'bm', 'bn', 'bo', 'br', 'bs', 'bt',
  'bw', 'by', 'bz', 'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm', 'cn',
  'cr', 'cu', 'cv', 'cy', 'cz', 'de', 'dj', 'dk', 'dm', 'do', 'dz', 'ec', 'ee', 'eg',
  'er', 'es', 'et', 'eu', 'fi', 'fj', 'fo', 'fr', 'ga', 'gb', 'gd', 'ge', 'gg', 'gh',
  'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gt', 'gu', 'gy', 'hk', 'hn', 'hr', 'ht',
  'hu', 'id', 'ie', 'il', 'im', 'in', 'iq', 'ir', 'is', 'it', 'je', 'jm', 'jo', 'jp',
  'ke', 'kg', 'kh', 'km', 'kn', 'kr', 'kw', 'ky', 'kz', 'la', 'lb', 'lc', 'li', 'lk',
  'lr', 'ls', 'lt', 'lu', 'lv', 'ly', 'ma', 'mc', 'md', 'me', 'mg', 'mk', 'ml', 'mm',
  'mn', 'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz', 'na',
  'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nu', 'nz', 'om', 'pa', 'pe',
  'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'ps', 'pt', 'pw', 'py', 'qa', 're',
  'ro', 'rs', 'ru', 'rw', 'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sk', 'sl',
  'sm', 'sn', 'so', 'sr', 'st', 'su', 'sv', 'sy', 'sz', 'tc', 'td', 'tf', 'tg', 'th',
  'tj', 'tk', 'tl', 'tm', 'tn', 'to', 'tr', 'tt', 'tv', 'tw', 'tz', 'ua', 'ug', 'uk',
  'um', 'us', 'uy', 'uz', 'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu', 'wf', 'ws', 'ye',
  'yt', 'za', 'zm', 'zw',
]);

// color used for all hyperlinks ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â other-users messages use CSS variable (blue in
// light mode, yellow in dark mode). Own messages keep the yellow constant.
export const LINK_COLOR_OWN = 'rgb(255, 238, 0)';

// Candidate regex: matches http(s)://..., www.anything, or word.word patterns.
// Uses a capturing group so text.split() keeps the matches in the result array.
// TLD validation inside normalizeUrl filters false positives (gibberish domains).
export const CANDIDATE_URL_RE = /((?:https?:\/\/|ftp:\/\/)[^\s]+|www\.[a-zA-Z0-9][a-zA-Z0-9\-.]*[a-zA-Z0-9]\.[a-zA-Z]{2,}(?:[^\s]*)?|(?<![/@#])[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;

export const normalizeUrl = (raw: string): { href: string; display: string } | null => {
  // Strip trailing punctuation
  const display = raw.replace(/[.,;:!?)'">\]]+$/, '');
  if (!display) return null;
  // Already has a protocol ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â always a link
  if (/^https?:\/\//i.test(display)) return { href: display, display };
  if (/^ftp:\/\//i.test(display)) return { href: display, display };
  // Starts with www. ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â always a link
  if (/^www\./i.test(display)) return { href: `https://${display}`, display };
  // Bare domain ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â validate TLD against known list
  const hostname = display.split(/[/?#]/)[0];
  const labels = hostname.split('.');
  if (labels.length < 2) return null;
  const tld = labels[labels.length - 1].toLowerCase();
  if (!VALID_TLDS.has(tld)) return null;
  const validLabel = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$|^[a-zA-Z0-9]$/;
  if (!labels.every(l => validLabel.test(l))) return null;
  return { href: `https://${display}`, display };
};

/**
 * Sanitise a URL for use as an <a href>.
 *
 * Two-step defence:
 *  1. Parse with the browser's URL constructor and whitelist the protocol.
 *     This blocks javascript:, data:, vbscript: etc.
 *  2. Return encodeURI(parsed.href) rather than the original string.
 *     encodeURI is a recognised URL sanitiser in CodeQL's JavaScript query
 *     library (js/xss-through-dom) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it encodes HTML meta-characters
 *     (<, >, ", ' ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦) that should never appear raw in an href, and returning
 *     the encoded form (not the original tainted string) breaks the taint
 *     chain that CodeQL traces from e.target.value through to the DOM sink.
 */
export const safeHref = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ftp:') {
      return '#';
    }
    // encodeURI normalises + encodes the URL; it is recognised by CodeQL as
    // an explicit sanitiser that removes the XSS taint from the value.
    return encodeURI(parsed.href);
  } catch {
    return '#';
  }
};

export const renderTextWithLinks = (text: string, sender: 'me' | 'other'): React.ReactNode => {
  const parts = text.split(CANDIDATE_URL_RE);
  if (parts.length === 1) return wrapEmojis(text);
  const result: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) { if (part) result.push(...wrapEmojis(part)); return; }
    const norm = normalizeUrl(part);
    if (!norm) { result.push(part); return; }
    const trailing = part.slice(norm.display.length);
    result.push(
      <React.Fragment key={i}>
        <a
          href={safeHref(norm.href)}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: sender === 'other' ? 'var(--link-color)' : LINK_COLOR_OWN,
            wordBreak: 'break-all',
          }}
        >{norm.display}</a>
        {trailing ? wrapEmojis(trailing) : null}
      </React.Fragment>
    );
  });
  return result.length === 1 ? result[0] : <>{result}</>;
};

// Returns the href for the first detected URL (used by LinkPreview card)
export const detectFirstUrl = (text: string): string | null => {
  CANDIDATE_URL_RE.lastIndex = 0;
  const match = CANDIDATE_URL_RE.exec(text);
  CANDIDATE_URL_RE.lastIndex = 0;
  if (!match) return null;
  const norm = normalizeUrl(match[0]);
  return norm ? norm.href : null;
};



export const renderMessageContent = (
  msg: Message,
  openLightbox: (url: string) => void,
  onMediaPointerDown?: () => void,
  sender: 'me' | 'other' = 'other',
  onVideoFullscreenEnter?: () => void,
  isMediaLoaded: boolean = true,
  onRequestMediaLoad?: (messageId: string, mediaUrl?: string) => void,
  isMediaLoadInProgress: boolean = false,
  mediaLoadProgress: number = 0,
  onRequestDownload?: (messageId: string, mediaUrl: string, filename: string) => void,
  isDownloadInProgress: boolean = false,
  downloadProgress: number = 0,
  loadedMediaSrc?: string | null,
) => {
  const isVideo = msg.type === 'video' || msg.url?.match(/\.(mp4|webm|mov)$/i);
  const isImage = msg.type === 'image' || msg.url?.match(/\.(jpeg|jpg|gif|png|svg)$/i);
  const isOwnMessage = sender === 'me';
  const shouldGateMedia = Boolean(msg.url) && !msg.isUploading && !isMediaLoaded && !isOwnMessage;
  const resolvedMediaUrl = loadedMediaSrc || msg.url || '';
  const clampedLoadProgress = Math.max(0, Math.min(1, mediaLoadProgress || 0));
  const clampedDownloadProgress = Math.max(0, Math.min(1, downloadProgress || 0));
  const mediaSizeLabel = formatMediaSize(msg.size);
  const fileContainerLabel = getFileContainerLabel(msg.originalName, msg.url);
  const fileMetaLabel = [formatMediaSize(msg.size), fileContainerLabel].filter(Boolean).join(' ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ');
  const canDownload = sender === 'other';
  const gatePreviewUrl = shouldGateMedia
    ? sanitizeMediaUrl(getMediaGatePreviewUrl(isVideo ? 'video' : 'image', resolvedMediaUrl || msg.url))
    : '';

  const DownloadSvg = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );

  // Cancel / X icon shown in the center of the progress ring.
  // Using a separate SVG (not DownloadSvg) makes the intent clear:
  // "tap to cancel" rather than "tap to download again".
  const CancelSvg = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );

  const RingedDownloadIcon = ({ progress }: { progress: number }) => (
    <DownloadProgressRing $progress={progress} $visible={true}>
      <svg className="ring-svg" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
        <circle className="track" cx="18" cy="18" r="15.8" />
        <circle className="progress" cx="18" cy="18" r="15.8" />
      </svg>
      {/* Show X cross so user knows tapping will cancel the operation */}
      <span className="cancel-icon">
        <CancelSvg />
      </span>
    </DownloadProgressRing>
  );

  const triggerDownload = (filename: string) => {
    if (!msg.url) return;
    if (onRequestDownload) {
      onRequestDownload(msg.id, msg.url, filename);
      return;
    }
    void downloadFile(msg.url, filename);
  };

  const handleLoadMediaClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onRequestMediaLoad) {
      onRequestMediaLoad(msg.id, msg.url);
    }
  };

  const handleLoadMediaPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Keep pointer events bubbling so swipe-to-quote can start from gated media.
    onMediaPointerDown?.();
  };

  if (isImage) {
    return (
      <MediaContent>
        <MediaImageWrapper>
          {msg.url && shouldGateMedia ? (
            <>
              {gatePreviewUrl && (
                <MediaLoadPreview
                  src={gatePreviewUrl}
                  alt=""
                  aria-hidden="true"
                  $isLoading={isMediaLoadInProgress}
                />
              )}
              <MediaLoadGate
                type="button"
                data-allow-quote-swipe
                aria-label="Load image"
                title="Load image"
                onPointerDown={handleLoadMediaPointerDown}
                onClick={handleLoadMediaClick}
                $isLoading={isMediaLoadInProgress}
              >
                <MediaLoadIcon>
                  {isMediaLoadInProgress ? <RingedDownloadIcon progress={clampedLoadProgress} /> : <DownloadSvg />}
                </MediaLoadIcon>
                <MediaLoadLabel>{isMediaLoadInProgress ? `Loading ${Math.round(clampedLoadProgress * 100)}%` : 'Tap to load'}</MediaLoadLabel>
              </MediaLoadGate>
              {mediaSizeLabel && <MediaSizeBadge>{mediaSizeLabel}</MediaSizeBadge>}
            </>
          ) : msg.url ? (
            <img src={sanitizeMediaUrl(resolvedMediaUrl)} alt={msg.originalName} onClick={() => { const u = sanitizeMediaUrl(resolvedMediaUrl); if (u) openLightbox(u); }} onPointerDown={() => onMediaPointerDown?.()} onDoubleClick={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} />
          ) : null}
          {msg.url && !shouldGateMedia && canDownload && (
            <MediaDownloadOverlayBtn
              title={isDownloadInProgress ? 'Tap to cancel' : 'Download'}
              aria-label={isDownloadInProgress ? 'Cancel download' : 'Download image'}
              onClick={(e) => {
                e.stopPropagation();
                // Always call triggerDownload ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it toggles cancel if in-flight
                triggerDownload(msg.originalName || 'image');
              }}
            >
              {isDownloadInProgress ? <RingedDownloadIcon progress={clampedDownloadProgress} /> : <DownloadSvg />}
            </MediaDownloadOverlayBtn>
          )}
        </MediaImageWrapper>
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{renderTextWithLinks(msg.text, sender)}</MessageText>}
      </MediaContent>
    );
  }

  if (isVideo && msg.url) {
    return (
      <MediaContent>
        {/* MediaVideoWrapperDiv has CSS hover rule that reveals the download button */}
        <MediaVideoWrapperDiv>
          {shouldGateMedia ? (
            <VideoPlayerWrapper>
              {gatePreviewUrl && (
                <MediaLoadPreview
                  src={gatePreviewUrl}
                  alt=""
                  aria-hidden="true"
                  $isLoading={isMediaLoadInProgress}
                />
              )}
              <MediaLoadGate
                type="button"
                data-allow-quote-swipe
                aria-label="Load video"
                title="Load video"
                onPointerDown={handleLoadMediaPointerDown}
                onClick={handleLoadMediaClick}
                $isLoading={isMediaLoadInProgress}
              >
                <MediaLoadIcon>
                  {isMediaLoadInProgress ? <RingedDownloadIcon progress={clampedLoadProgress} /> : <DownloadSvg />}
                </MediaLoadIcon>
                <MediaLoadLabel>{isMediaLoadInProgress ? `Loading ${Math.round(clampedLoadProgress * 100)}%` : 'Tap to load'}</MediaLoadLabel>
              </MediaLoadGate>
              {mediaSizeLabel && <MediaSizeBadge>{mediaSizeLabel}</MediaSizeBadge>}
            </VideoPlayerWrapper>
          ) : (
            <VideoPlayer src={resolvedMediaUrl} onPointerDown={onMediaPointerDown} onFullscreenEnter={onVideoFullscreenEnter} />
          )}
          {/* Download button ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â top-left overlay, same style as image download btn */}
          {!shouldGateMedia && canDownload && (
            <MediaDownloadOverlayBtn
              title={isDownloadInProgress ? 'Tap to cancel' : 'Download video'}
              aria-label={isDownloadInProgress ? 'Cancel download' : 'Download video'}
              onClick={(e) => {
                e.stopPropagation();
                // Always call triggerDownload ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it toggles cancel if in-flight
                triggerDownload(msg.originalName || 'video');
              }}
            >
              {isDownloadInProgress ? <RingedDownloadIcon progress={clampedDownloadProgress} /> : <DownloadSvg />}
            </MediaDownloadOverlayBtn>
          )}
        </MediaVideoWrapperDiv>
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{renderTextWithLinks(msg.text, sender)}</MessageText>}
      </MediaContent>
    );
  }

  if (msg.type === 'file' || (msg.url && !isImage && !isVideo)) {
    return (
      <MediaContent>
        <FileAttachmentCard onClick={() => { if (canDownload && !isDownloadInProgress) triggerDownload(msg.originalName || 'file'); }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <FileAttachmentMeta>
            <FileAttachmentName>{msg.originalName || 'Download file'}</FileAttachmentName>
            <FileAttachmentDetails>{fileMetaLabel}</FileAttachmentDetails>
          </FileAttachmentMeta>
          {canDownload && isDownloadInProgress ? (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px' }}>
              <RingedDownloadIcon progress={clampedDownloadProgress} />
            </div>
          ) : canDownload ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0, opacity: 0.6 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          ) : null}
        </FileAttachmentCard>
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{renderTextWithLinks(msg.text, sender)}</MessageText>}
      </MediaContent>
    );
  }

  if (msg.text) {
    return <MessageText>{renderTextWithLinks(msg.text, sender)}</MessageText>;
  }

  return null;
};
