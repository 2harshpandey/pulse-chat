import React from 'react';
import type { Message } from './types';
import { isAudioMedia, isVideoMedia, isImageMedia } from '../shared/mediaTypes';
import {
  sanitizeMediaUrl, getMediaGatePreviewUrl,
  formatMediaSize, getFileContainerLabel,
  downloadFile, getDisplayFilename,
  isNonTouchDevice, isPhotoOrGif,
} from './utils';
import {
  VALID_TLDS,
  LINK_COLOR_OWN,
  CANDIDATE_URL_RE,
  normalizeUrl,
  safeHref,
  renderTextWithLinks,
  detectFirstUrl,
} from './utils/urlLinkUtils';
import {
  MediaContent, MediaImageWrapper, MediaVideoWrapperDiv,
  FileAttachmentCard, FileAttachmentMeta, FileAttachmentName, FileAttachmentDetails,
  MessageText, VideoPlayerWrapper,
} from './ChatStyledComponents';
import { VideoPlayer } from './VideoPlayer';
import { AudioMessagePlayer } from './components/message/AudioMessagePlayer';
import { MediaCopyButton } from './components/message/MediaCopyButton';
import {
  DownloadSvg,
  RingedProgressIcon,
  MediaTapToLoadOverlay,
  MediaUploadProgressOverlay,
  MediaDownloadActionOverlay,
} from './components/message/MediaOverlayPrimitives';
import type { TransferInfo } from './TransferManager';

export {
  VALID_TLDS,
  LINK_COLOR_OWN,
  CANDIDATE_URL_RE,
  normalizeUrl,
  safeHref,
  renderTextWithLinks,
  detectFirstUrl,
};



export const renderMessageContent = (
  msg: Message,
  openLightbox: (url: string, canonicalUrl?: string) => void,
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
  transferInfo?: TransferInfo,
  onResumeUpload?: (messageId: string) => void,
  onCancelUpload?: (messageId: string) => void,
  onMediaLoad?: () => void,
  isSelectModeActive: boolean = false,
  onMediaError?: (messageId: string, url?: string) => void,
) => {
  const isAudio = isAudioMedia(msg);
  const isVideo = isVideoMedia(msg);
  const isImage = !isAudio && !isVideo && isImageMedia(msg);
  const isOwnMessage = sender === 'me';
  const shouldGateMedia = Boolean(msg.url) && !msg.isUploading && !isMediaLoaded && !isOwnMessage;
  const resolvedMediaUrl = loadedMediaSrc || msg.url || '';
  const clampedLoadProgress = Math.max(0, Math.min(1, mediaLoadProgress || 0));
  const clampedDownloadProgress = Math.max(0, Math.min(1, downloadProgress || 0));
  const mediaSizeLabel = formatMediaSize(msg.size);
  const displayFilename = getDisplayFilename(msg.originalName, msg.url, 'Download file');
  const fileContainerLabel = getFileContainerLabel(displayFilename, msg.url);
  const fileMetaLabel = [formatMediaSize(msg.size), fileContainerLabel].filter(Boolean).join(' • ');
  const canDownload = Boolean(msg.url) && !msg.isUploading;
  const gatePreviewUrl = shouldGateMedia
    ? sanitizeMediaUrl(getMediaGatePreviewUrl(isVideo ? 'video' : 'image', resolvedMediaUrl || msg.url))
    : '';

  const triggerDownload = (filename: string) => {
    if (!msg.url) return;
    if (onRequestDownload) {
      onRequestDownload(msg.id, msg.url, filename);
      return;
    }
    void downloadFile(msg.url, filename, undefined, undefined, msg.type === 'file' || (!isImage && !isVideo));
  };

  const handleLoadMediaClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onRequestMediaLoad) {
      onRequestMediaLoad(msg.id, msg.url);
    }
  };

  const handleLoadMediaPointerDown = () => {
    // Keep pointer events bubbling so swipe-to-quote can start from gated media.
    onMediaPointerDown?.();
  };

  if (isImage) {
    return (
      <MediaContent>
        <MediaImageWrapper>
          {msg.url && shouldGateMedia ? (
            <MediaTapToLoadOverlay
              isVideo={false}
              gatePreviewUrl={gatePreviewUrl}
              isLoading={isMediaLoadInProgress}
              progress={clampedLoadProgress}
              mediaSizeLabel={mediaSizeLabel}
              onPointerDown={handleLoadMediaPointerDown}
              onClick={handleLoadMediaClick}
            />
          ) : msg.url ? (
            <>
              <img
                onLoad={onMediaLoad}
                onError={(e) => {
                  const fallback = sanitizeMediaUrl(msg.url);
                  const img = e.currentTarget;
                  if (fallback && img.src !== fallback) {
                    img.src = fallback;
                  }
                  onMediaError?.(msg.id, msg.url);
                }}
                src={sanitizeMediaUrl(resolvedMediaUrl)}
                alt={displayFilename}
                onClick={() => { if (isSelectModeActive) return; const u = sanitizeMediaUrl(resolvedMediaUrl); if (u) openLightbox(u, msg.url); }}
                onPointerDown={() => onMediaPointerDown?.()}
                onDoubleClick={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
              />
              {msg.isUploading && (
                <MediaUploadProgressOverlay
                  messageId={msg.id}
                  transferInfo={transferInfo}
                  onResumeUpload={onResumeUpload}
                  onCancelUpload={onCancelUpload}
                />
              )}
            </>
          ) : null}
          {msg.url && !shouldGateMedia && canDownload && (
            <MediaDownloadActionOverlay
              isDownloadInProgress={isDownloadInProgress}
              downloadProgress={clampedDownloadProgress}
              isPaused={transferInfo?.type === 'download' && transferInfo?.state === 'paused'}
              idleTitle="Download"
              idleAriaLabel="Download image"
              style={{
                position: 'absolute',
                top: '6px',
                left: '6px',
                zIndex: 3,
              }}
              onTrigger={() => triggerDownload(displayFilename || 'image')}
            />
          )}
          {msg.url && !shouldGateMedia && isNonTouchDevice() && isPhotoOrGif(msg) && (
            <MediaCopyButton
              url={msg.url}
              style={{
                position: 'absolute',
                top: '6px',
                left: '46px',
                zIndex: 3,
              }}
            />
          )}
        </MediaImageWrapper>
        {msg.text && (
          <div style={{ width: 0, minWidth: '100%' }}>
            <MessageText style={{ paddingTop: '0.5rem' }}>{renderTextWithLinks(msg.text, sender)}</MessageText>
          </div>
        )}
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
              <MediaTapToLoadOverlay
                isVideo={true}
                gatePreviewUrl={gatePreviewUrl}
                isLoading={isMediaLoadInProgress}
                progress={clampedLoadProgress}
                mediaSizeLabel={mediaSizeLabel}
                onPointerDown={handleLoadMediaPointerDown}
                onClick={handleLoadMediaClick}
              />
            </VideoPlayerWrapper>
          ) : (
            <VideoPlayerWrapper>
              <VideoPlayer
                src={sanitizeMediaUrl(resolvedMediaUrl) || ''}
                fallbackUrl={sanitizeMediaUrl(msg.url) || undefined}
                onPointerDown={() => onMediaPointerDown?.()}
                onFullscreenEnter={onVideoFullscreenEnter}
                isUploading={msg.isUploading}
                onLoadedData={onMediaLoad}
                isSelectModeActive={isSelectModeActive}
                timestamp={msg.timestamp}
              />
              {msg.isUploading && (
                <MediaUploadProgressOverlay
                  messageId={msg.id}
                  transferInfo={transferInfo}
                  onResumeUpload={onResumeUpload}
                  onCancelUpload={onCancelUpload}
                />
              )}
            </VideoPlayerWrapper>
          )}
          {/* Download button - top-left overlay, same style as image download btn */}
          {!shouldGateMedia && canDownload && (
            <MediaDownloadActionOverlay
              isDownloadInProgress={isDownloadInProgress}
              downloadProgress={clampedDownloadProgress}
              isPaused={transferInfo?.type === 'download' && transferInfo?.state === 'paused'}
              idleTitle="Download video"
              idleAriaLabel="Download video"
              onTrigger={() => triggerDownload(displayFilename || 'video')}
            />
          )}
        </MediaVideoWrapperDiv>
        {msg.text && (
          <div style={{ width: 0, minWidth: '100%' }}>
            <MessageText style={{ paddingTop: '0.5rem' }}>{renderTextWithLinks(msg.text, sender)}</MessageText>
          </div>
        )}
      </MediaContent>
    );
  }

  if (isAudio && (msg.url || msg.isUploading)) {
    return (
      <MediaContent>
        <AudioMessagePlayer
          msg={msg}
          sender={sender}
          isSelectModeActive={isSelectModeActive}
        />
      </MediaContent>
    );
  }

  if (msg.type === 'file' || (msg.url && !isImage && !isVideo && !isAudio)) {
    return (
      <MediaContent>
        <FileAttachmentCard
          role={canDownload ? 'button' : undefined}
          tabIndex={canDownload ? 0 : -1}
          title={canDownload ? (isDownloadInProgress ? 'Downloading' : 'Download file') : undefined}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canDownload && !isSelectModeActive) triggerDownload(displayFilename || 'file');
          }}
          onKeyDown={(e) => {
            if (!canDownload || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            e.stopPropagation();
            triggerDownload(displayFilename || 'file');
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <FileAttachmentMeta>
            <FileAttachmentName>{displayFilename}</FileAttachmentName>
            <FileAttachmentDetails>{fileMetaLabel}</FileAttachmentDetails>
          </FileAttachmentMeta>
          {msg.isUploading ? (
            <div 
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (transferInfo?.state === 'paused') {
                  onResumeUpload?.(msg.id);
                } else {
                  onCancelUpload?.(msg.id);
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <RingedProgressIcon progress={transferInfo?.progress || 0} isPaused={transferInfo?.state === 'paused'} isUpload={true} />
            </div>
          ) : canDownload && isDownloadInProgress ? (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', cursor: 'pointer' }}>
              <RingedProgressIcon progress={clampedDownloadProgress} isPaused={transferInfo?.type === 'download' && transferInfo?.state === 'paused'} />
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

  // Fallback for media messages where the URL is missing or unusable
  // (e.g. Cloudinary async upload, stale blob: URL from a previous session).
  // Show a small placeholder so the message bubble is not silently invisible.
  // Cast to string to bypass TS narrowing — runtime data may have type='video'|'image'|'file' with no url.
  const msgTypeStr = msg.type as string;
  if (msgTypeStr === 'video' || msgTypeStr === 'image' || msgTypeStr === 'file' || msgTypeStr === 'audio') {
    return (
      <MediaContent>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.45)', fontSize: 13,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            style={{ width: 18, height: 18, flexShrink: 0, opacity: 0.6 }}>
            {msgTypeStr === 'video' ? (
              <>
                <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
                <polyline points="23 7 16 12 23 17 23 7" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : msgTypeStr === 'image' ? (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="3" x2="21" y2="21" />
              </>
            ) : msgTypeStr === 'audio' ? (
              <>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </>
            ) : (
              <>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </>
            )}
          </svg>
          <span>{msgTypeStr === 'audio' ? 'Voice message unavailable' : 'Media unavailable'}</span>
        </div>
      </MediaContent>
    );
  }

  return null;
};

