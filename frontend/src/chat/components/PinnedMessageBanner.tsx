import React from 'react';
import type { Message } from '../types';
import {
  PinnedBannerContainer,
  PinnedBannerIconWrapper,
  PinnedCycleIndicator,
  PinnedCycleSegment,
  PinnedBannerContentWrapper,
  PinnedBannerLabel,
  PinnedBannerText,
} from '../Chat.styles';

export interface PinnedMessageBannerProps {
  pinnedMessages: any[];
  currentPinnedIndex: number;
  isJumpingToPinned: boolean;
  onClick: () => void;
}

export const PinnedMessageBanner: React.FC<PinnedMessageBannerProps> = ({
  pinnedMessages,
  currentPinnedIndex,
  isJumpingToPinned,
  onClick,
}) => {
  const activePins = (pinnedMessages || []).filter(
    (msg) =>
      msg &&
      !msg.isDeleted &&
      !msg.vanished &&
      msg.text !== 'This message has been deleted by an admin.'
  );

  if (activePins.length === 0) return null;

  const safeIndex = currentPinnedIndex >= activePins.length ? 0 : currentPinnedIndex;
  const msg = activePins[safeIndex];
  if (!msg) return null;

  return (
    <PinnedBannerContainer onClick={onClick}>
      <PinnedBannerIconWrapper>
        {isJumpingToPinned ? (
          <>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
          </>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11V22H13V16H18V14L16 12Z" />
          </svg>
        )}
        {activePins.length > 1 && !isJumpingToPinned && (
          <PinnedCycleIndicator>
            {activePins.map((_, i) => (
              <PinnedCycleSegment key={i} $active={i === safeIndex} />
            ))}
          </PinnedCycleIndicator>
        )}
      </PinnedBannerIconWrapper>
      <PinnedBannerContentWrapper>
        <PinnedBannerLabel>Pinned Message</PinnedBannerLabel>
        <PinnedBannerText>
          {(() => {
            if (!msg) return 'Attachment';
            const isGif =
              !!msg.url?.match(/^https?:\/\/(?:[a-z0-9-]+\.)*giphy\.com\//i) ||
              !!msg.text?.match(/^https?:\/\/(?:[a-z0-9-]+\.)*giphy\.com\//i) ||
              msg.originalName?.toLowerCase().endsWith('.gif') ||
              msg.url?.toLowerCase().split('?')[0].endsWith('.gif');
            if (isGif) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect>
                    <path d="M10 9l-3 0 0 6 3 0"></path>
                    <path d="M14 9l-1 0 0 6 1 0"></path>
                    <path d="M19 9l-2 0 0 6"></path>
                    <path d="M17 12l2 0"></path>
                  </svg>
                  GIF
                </div>
              );
            }
            if (msg.type === 'image') {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  Photo
                </div>
              );
            }
            if (msg.type === 'video') {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                  Video
                </div>
              );
            }
            if (msg.type === 'audio') {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  Voice Message
                </div>
              );
            }
            if (msg.type === 'file') {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                  </svg>
                  {msg.originalName || 'File'}
                </div>
              );
            }
            return msg.text || 'Attachment';
          })()}
        </PinnedBannerText>
      </PinnedBannerContentWrapper>
    </PinnedBannerContainer>
  );
};
