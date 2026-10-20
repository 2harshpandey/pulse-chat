import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message } from '../../types';
import { sanitizeMediaUrl } from '../../utils';
import { VideoPlayer } from '../../VideoPlayer';
import { MediaDownloadButton } from '../message';
import {
  MediaGalleryOverlay,
  MediaGalleryHeader,
  MediaGalleryInfo,
  MediaGalleryCounter,
  MediaGalleryMeta,
  MediaGalleryActions,
  MediaGalleryActionBtn,
  MediaGalleryViewport,
  MediaGalleryNavBtn,
  MediaGallerySlide,
  MediaGalleryVideoWrapper,
  MediaGalleryBottom,
  MediaGalleryCaption,
  MediaGalleryThumbsRow,
  MediaGalleryThumb,
} from '../../ChatStyledComponents';

export interface MediaGalleryModalProps {
  isOpen: boolean;
  items: Message[];
  initialIndex?: number;
  onClose: () => void;
  onRequestDownload?: (messageId: string, mediaUrl: string, filename: string) => void;
  loadedMediaSrcById?: Record<string, string>;
}

export const MediaGalleryModal: React.FC<MediaGalleryModalProps> = ({
  isOpen,
  items,
  initialIndex = 0,
  onClose,
  onRequestDownload,
  loadedMediaSrcById,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchOffset, setTouchOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
      setTouchOffset(0);
      setIsSwiping(false);
    }
  }, [isOpen, initialIndex, items.length]);

  const currentItem = items[currentIndex] || items[0];
  const isVideo =
    Boolean(currentItem) &&
    (currentItem.type === 'video' || Boolean(currentItem.url?.match(/\.(mp4|webm|mov)$/i)));

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(items.length - 1, prev + 1));
  }, [items.length]);

  // Keyboard navigation: Left/Right arrows and Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToPrev, goToNext, onClose]);

  // Touch gesture handling for smooth swiping
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = null;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartXRef.current;
    const deltaY = currentY - touchStartYRef.current;

    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalSwipeRef.current) {
      // Elastic resistance at boundaries
      let offset = deltaX;
      if ((currentIndex === 0 && deltaX > 0) || (currentIndex === items.length - 1 && deltaX < 0)) {
        offset = deltaX * 0.3;
      }
      setTouchOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);

    if (isHorizontalSwipeRef.current) {
      const threshold = 50;
      if (touchOffset > threshold && currentIndex > 0) {
        goToPrev();
      } else if (touchOffset < -threshold && currentIndex < items.length - 1) {
        goToNext();
      }
    }

    setTouchOffset(0);
    isHorizontalSwipeRef.current = null;
  };

  if (!isOpen || items.length === 0) return null;

  const itemUrl = (loadedMediaSrcById && loadedMediaSrcById[currentItem.id]) || currentItem.url;
  const safeUrl = sanitizeMediaUrl(itemUrl);

  const formattedTime = currentItem.timestamp
    ? new Date(currentItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <MediaGalleryOverlay
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Header Bar */}
      <MediaGalleryHeader>
        <MediaGalleryInfo>
          <MediaGalleryCounter>
            {currentIndex + 1} / {items.length}
          </MediaGalleryCounter>
          {currentItem.username && (
            <MediaGalleryMeta>
              {currentItem.username} {formattedTime ? `• ${formattedTime}` : ''}
            </MediaGalleryMeta>
          )}
        </MediaGalleryInfo>

        <MediaGalleryActions>
          <MediaDownloadButton
            messageId={currentItem.id}
            url={safeUrl}
            filename={currentItem.originalName}
            isVideo={isVideo}
            onRequestDownload={onRequestDownload}
            style={{ position: 'relative', top: 0, left: 0 }}
          />

          <MediaGalleryActionBtn
            type="button"
            title="Close viewer (Esc)"
            aria-label="Close viewer"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </MediaGalleryActionBtn>
        </MediaGalleryActions>
      </MediaGalleryHeader>

      {/* Main Viewport with Navigation Buttons and Media Slide */}
      <MediaGalleryViewport
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Previous Button (Shown on non-touch devices) */}
        {currentIndex > 0 && (
          <MediaGalleryNavBtn
            $direction="left"
            type="button"
            aria-label="Previous item"
            title="Previous (Left arrow)"
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </MediaGalleryNavBtn>
        )}

        {/* Current Media Slide */}
        <MediaGallerySlide
          style={{
            transform: `translate3d(${touchOffset}px, 0, 0)`,
            transition: isSwiping ? 'none' : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {isVideo ? (
            <MediaGalleryVideoWrapper key={currentItem.id || safeUrl}>
              <VideoPlayer
                src={safeUrl}
                autoPlay={true}
                isGalleryMode={true}
              />
            </MediaGalleryVideoWrapper>
          ) : (
            <img
              key={currentItem.id || safeUrl}
              src={safeUrl}
              alt={currentItem.originalName || 'Photo'}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
          )}
        </MediaGallerySlide>

        {/* Next Button (Shown on non-touch devices) */}
        {currentIndex < items.length - 1 && (
          <MediaGalleryNavBtn
            $direction="right"
            type="button"
            aria-label="Next item"
            title="Next (Right arrow)"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </MediaGalleryNavBtn>
        )}
      </MediaGalleryViewport>

      {/* Bottom Thumbnail Strip and Caption */}
      <MediaGalleryBottom>
        {currentItem.text && (
          <MediaGalleryCaption>{currentItem.text}</MediaGalleryCaption>
        )}

        {items.length > 1 && (
          <MediaGalleryThumbsRow>
            {items.map((item, idx) => {
              const itemIsVideo =
                item.type === 'video' ||
                Boolean(item.url?.match(/\.(mp4|webm|mov)$/i));
              const itemUrl = (loadedMediaSrcById && loadedMediaSrcById[item.id]) || item.url;
              const thumbUrl = sanitizeMediaUrl(itemUrl);

              return (
                <MediaGalleryThumb
                  key={item.id || idx}
                  $active={idx === currentIndex}
                  onClick={() => setCurrentIndex(idx)}
                  title={`View item ${idx + 1}`}
                >
                  {itemIsVideo ? (
                    <>
                      <video
                        src={thumbUrl}
                        preload="metadata"
                        muted
                        playsInline
                        onLoadedMetadata={(e) => { try { e.currentTarget.currentTime = 0.001; } catch (_) {} }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0,0,0,0.3)',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                          <polygon points="8 5 19 12 8 19" />
                        </svg>
                      </div>
                    </>
                  ) : (
                    <img src={thumbUrl} alt="" loading="lazy" />
                  )}
                </MediaGalleryThumb>
              );
            })}
          </MediaGalleryThumbsRow>
        )}
      </MediaGalleryBottom>
    </MediaGalleryOverlay>
  );
};
