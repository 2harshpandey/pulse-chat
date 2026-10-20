import React, { useState, useEffect, useCallback } from 'react';
import { transferManager, TransferInfo } from '../../TransferManager';
import { MediaDownloadOverlayBtn, DownloadProgressRing } from '../../ChatStyledComponents';
import { downloadFile } from '../../utils';

export const DownloadSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const CancelSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export interface MediaDownloadButtonProps {
  messageId: string;
  url?: string;
  filename?: string;
  isVideo?: boolean;
  onRequestDownload?: (messageId: string, mediaUrl: string, filename: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

export const MediaDownloadButton: React.FC<MediaDownloadButtonProps> = ({
  messageId,
  url,
  filename,
  isVideo = false,
  onRequestDownload,
  style,
  className,
}) => {
  const [transferInfo, setTransferInfo] = useState<TransferInfo | undefined>(() =>
    transferManager.getTransfer(messageId)
  );

  useEffect(() => {
    const unsubscribe = transferManager.subscribe((transfers) => {
      setTransferInfo(transfers.get(messageId));
    });
    return () => {
      unsubscribe();
    };
  }, [messageId]);

  const isDownloading =
    transferInfo?.type === 'download' &&
    (transferInfo.state === 'downloading' || transferInfo.state === 'paused');
  const clampedProgress = Math.max(0, Math.min(1, transferInfo?.progress || 0));
  const fallbackName = filename || (isVideo ? 'video.mp4' : 'media.jpg');

  const handleClick = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      if ('button' in e && e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      if (!url) return;

      if (isDownloading) {
        transferManager.cancelTransfer(messageId);
        return;
      }

      if (onRequestDownload) {
        onRequestDownload(messageId, url, fallbackName);
      } else {
        void downloadFile(url, fallbackName, undefined, undefined, !isVideo);
      }
    },
    [url, isDownloading, messageId, onRequestDownload, fallbackName, isVideo]
  );

  if (!url) return null;

  return (
    <MediaDownloadOverlayBtn
      style={style}
      className={className}
      title={isDownloading ? 'Tap to cancel download' : 'Download'}
      aria-label={isDownloading ? 'Cancel download' : 'Download media'}
      onPointerDown={(e) => {
        // Prevent click loss during high-frequency re-renders
        handleClick(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      {isDownloading ? (
        <DownloadProgressRing $progress={clampedProgress} $visible={true}>
          <svg className="ring-svg" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
            <circle className="track" cx="18" cy="18" r="15.8" />
            <circle className="progress" cx="18" cy="18" r="15.8" />
          </svg>
          <span className="cancel-icon" style={{ pointerEvents: 'none' }}>
            <CancelSvg />
          </span>
        </DownloadProgressRing>
      ) : (
        <DownloadSvg />
      )}
    </MediaDownloadOverlayBtn>
  );
};
