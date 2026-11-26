import React from 'react';
import {
  MediaLoadGate,
  MediaLoadPreview,
  MediaLoadIcon,
  MediaLoadLabel,
  MediaSizeBadge,
  MediaDownloadOverlayBtn,
  DownloadProgressRing,
} from '../../ChatStyledComponents';
import type { TransferInfo } from '../../TransferManager';

export const DownloadSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const CancelSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export const PlaySvg: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="8 5 19 12 8 19" />
  </svg>
);

export const UploadSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

/**
 * Circular SVG progress ring with pause/resume/cancel glyph inside.
 */
export const RingedProgressIcon: React.FC<{
  progress: number;
  isPaused?: boolean;
  isUpload?: boolean;
}> = ({ progress, isPaused, isUpload }) => (
  <DownloadProgressRing $progress={progress} $visible={true}>
    <svg className="ring-svg" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
      <circle className="track" cx="18" cy="18" r="15.8" />
      <circle className="progress" cx="18" cy="18" r="15.8" />
    </svg>
    <span className="cancel-icon" style={{ pointerEvents: 'none' }}>
      {isPaused ? (isUpload ? <UploadSvg /> : <DownloadSvg />) : <CancelSvg />}
    </span>
  </DownloadProgressRing>
);

interface MediaTapToLoadOverlayProps {
  isVideo: boolean;
  gatePreviewUrl?: string;
  isLoading: boolean;
  progress: number;
  mediaSizeLabel?: string | null;
  onPointerDown?: () => void;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Shared tap-to-load gate overlay rendered over unloaded image/video bubbles.
 */
export const MediaTapToLoadOverlay: React.FC<MediaTapToLoadOverlayProps> = ({
  isVideo,
  gatePreviewUrl,
  isLoading,
  progress,
  mediaSizeLabel,
  onPointerDown,
  onClick,
}) => (
  <>
    {gatePreviewUrl && (
      <MediaLoadPreview
        src={gatePreviewUrl}
        alt=""
        aria-hidden="true"
        $isLoading={isLoading}
      />
    )}
    <MediaLoadGate
      type="button"
      data-allow-quote-swipe
      aria-label={isVideo ? 'Load video' : 'Load image'}
      title={isVideo ? 'Load video' : 'Load image'}
      onPointerDown={onPointerDown}
      onClick={onClick}
      $isLoading={isLoading}
    >
      <MediaLoadIcon>
        {isLoading ? (
          <RingedProgressIcon progress={progress} />
        ) : isVideo ? (
          <PlaySvg />
        ) : (
          <DownloadSvg />
        )}
      </MediaLoadIcon>
      <MediaLoadLabel>
        {isLoading ? `Loading ${Math.round(progress * 100)}%` : 'Tap to load'}
      </MediaLoadLabel>
    </MediaLoadGate>
    {mediaSizeLabel && <MediaSizeBadge>{mediaSizeLabel}</MediaSizeBadge>}
  </>
);

interface MediaUploadProgressOverlayProps {
  messageId: string;
  transferInfo?: TransferInfo;
  onResumeUpload?: (messageId: string) => void;
  onCancelUpload?: (messageId: string) => void;
}

/**
 * Shared upload progress / pause / resume gate overlay for in-flight image and video uploads.
 */
export const MediaUploadProgressOverlay: React.FC<MediaUploadProgressOverlayProps> = ({
  messageId,
  transferInfo,
  onResumeUpload,
  onCancelUpload,
}) => (
  <MediaLoadGate
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (!target.closest('[data-action-btn="true"]')) return;

      if (transferInfo?.state === 'paused') {
        onResumeUpload?.(messageId);
      } else {
        onCancelUpload?.(messageId);
      }
    }}
    $isLoading={true}
    $isUploadGate={true}
  >
    <MediaLoadIcon data-action-btn="true">
      <RingedProgressIcon
        progress={transferInfo?.progress || 0}
        isPaused={transferInfo?.state === 'paused'}
        isUpload={true}
      />
    </MediaLoadIcon>
    <MediaLoadLabel>
      {transferInfo?.state === 'paused'
        ? 'Paused'
        : (transferInfo?.progress || 0) >= 0.9
        ? 'Processing...'
        : `Uploading ${Math.round((transferInfo?.progress || 0) * 100)}%`}
    </MediaLoadLabel>
  </MediaLoadGate>
);

interface MediaDownloadActionOverlayProps {
  isDownloadInProgress: boolean;
  downloadProgress: number;
  isPaused?: boolean;
  idleTitle: string;
  idleAriaLabel: string;
  style?: React.CSSProperties;
  onTrigger: () => void;
}

/**
 * Shared top-left download/cancel button overlay for loaded image and video attachments.
 */
export const MediaDownloadActionOverlay: React.FC<MediaDownloadActionOverlayProps> = ({
  isDownloadInProgress,
  downloadProgress,
  isPaused,
  idleTitle,
  idleAriaLabel,
  style,
  onTrigger,
}) => (
  <MediaDownloadOverlayBtn
    title={isDownloadInProgress ? 'Tap to cancel' : idleTitle}
    aria-label={isDownloadInProgress ? 'Cancel download' : idleAriaLabel}
    style={style}
    onPointerDown={(e) => {
      // Instantly register the action before high-frequency re-renders can drop mouseup/click
      e.stopPropagation();
      e.preventDefault();
      onTrigger();
    }}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
    }}
  >
    {isDownloadInProgress ? (
      <RingedProgressIcon progress={downloadProgress} isPaused={isPaused} />
    ) : (
      <DownloadSvg />
    )}
  </MediaDownloadOverlayBtn>
);
