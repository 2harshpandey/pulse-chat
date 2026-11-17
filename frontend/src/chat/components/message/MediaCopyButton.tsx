import React, { useState } from 'react';
import { MediaDownloadOverlayBtn } from '../../ChatStyledComponents';
import { copyImageToClipboard } from '../../utils';

export interface MediaCopyButtonProps {
  url?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const MediaCopyButton: React.FC<MediaCopyButtonProps> = ({
  url,
  style,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  if (!url) return null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const success = await copyImageToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <MediaDownloadOverlayBtn
      type="button"
      title="Copy image"
      aria-label="Copy image"
      data-testid="media-copy-overlay-btn"
      onClick={handleCopy}
      style={{
        ...style,
        background: copied ? 'rgba(34, 197, 94, 0.75)' : undefined,
      }}
      className={className}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </MediaDownloadOverlayBtn>
  );
};
