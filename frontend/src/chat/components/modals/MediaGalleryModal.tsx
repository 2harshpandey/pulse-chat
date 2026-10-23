import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message } from '../../types';
import { sanitizeMediaUrl, withCloudinaryTransform, getMediaGatePreviewUrl, downloadAlbumAsZip } from '../../utils';
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
  loadedMediaMessageSet?: Set<string>;
  onRequestMediaLoad?: (messageId: string, mediaUrl?: string, allowCancel?: boolean) => void;
  currentUserId?: string;
}

export const MediaGalleryModal: React.FC<MediaGalleryModalProps> = ({
  isOpen,
  items,
  initialIndex = 0,
  onClose,
  onRequestDownload,
  loadedMediaSrcById,
  loadedMediaMessageSet,
  onRequestMediaLoad,
  currentUserId,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchOffset, setTouchOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const hasSwipedRef = useRef(false);
  const requestedLoadIdsRef = useRef<Set<string>>(new Set());
  // Stable media URL per slide to prevent swapping video source mid-playback
  const activeMediaUrlRef = useRef<{ id: string; url: string } | null>(null);

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

  // If opening or navigating to an item that is not yet loaded, auto-load it in fullscreen (exactly once)
  useEffect(() => {
    if (!isOpen || !currentItem?.id || !currentItem?.url) return;
    if (currentUserId && currentItem.userId === currentUserId) return;
    if (requestedLoadIdsRef.current.has(currentItem.id)) return;
    if (loadedMediaMessageSet && !loadedMediaMessageSet.has(currentItem.id)) {
      requestedLoadIdsRef.current.add(currentItem.id);
      onRequestMediaLoad?.(currentItem.id, currentItem.url, false);
    }
  }, [isOpen, currentIndex, currentItem?.id, currentItem?.url, currentItem?.userId, currentUserId, loadedMediaMessageSet, onRequestMediaLoad]);

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
    hasSwipedRef.current = false;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartXRef.current;
    const deltaY = currentY - touchStartYRef.current;

    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      hasSwipedRef.current = true;
      if (isHorizontalSwipeRef.current === null) {
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
    setTimeout(() => {
      hasSwipedRef.current = false;
    }, 150);
  };

  if (!isOpen || items.length === 0) return null;

  // Stable media URL per slide to prevent swapping video source mid-playback
  if (!activeMediaUrlRef.current || activeMediaUrlRef.current.id !== currentItem.id) {
    activeMediaUrlRef.current = {
      id: currentItem.id,
      url: (loadedMediaSrcById && loadedMediaSrcById[currentItem.id]) || currentItem.url || '',
    };
  }
  const safeUrl = sanitizeMediaUrl(activeMediaUrlRef.current.url);

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
          {items.length > 1 && (
            <MediaGalleryActionBtn
              type="button"
              title="Download all as ZIP"
              aria-label="Download all items as ZIP"
              onClick={() => {
                void downloadAlbumAsZip(items);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </MediaGalleryActionBtn>
          )}

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
          if (e.target === e.currentTarget && !hasSwipedRef.current) onClose();
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
          onClick={(e) => {
            if (e.target === e.currentTarget && !hasSwipedRef.current) onClose();
          }}
        >
          {isVideo ? (
            <MediaGalleryVideoWrapper
              key={currentItem.id || safeUrl}
              onClick={(e) => e.stopPropagation()}
            >
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
              onClick={(e) => e.stopPropagation()}
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
      <MediaGalleryBottom
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {currentItem.text && (
          <MediaGalleryCaption>{currentItem.text}</MediaGalleryCaption>
        )}

        {items.length > 1 && (
          <MediaGalleryThumbsRow>
            {items.map((item, idx) => {
              const itemIsVideo =
                item.type === 'video' ||
                Boolean(item.url?.match(/\.(mp4|webm|mov)$/i));
              const isLoaded = Boolean(
                (currentUserId && item.userId === currentUserId) ||
                (loadedMediaMessageSet && loadedMediaMessageSet.has(item.id)) ||
                (loadedMediaSrcById && loadedMediaSrcById[item.id])
              );

              // Use lightweight static image poster from Cloudinary (~800 bytes)
              // to prevent mounting heavy <video> elements that preload video streams
              const videoPoster = itemIsVideo
                ? withCloudinaryTransform(item.url || '', 'so_0,f_jpg,q_35,w_96,h_96,c_fill')
                : '';

              const imageThumb = !itemIsVideo
                ? (loadedMediaSrcById && loadedMediaSrcById[item.id]) ||
                  withCloudinaryTransform(item.url || '', 'f_auto,q_35,w_96,h_96,c_fill') ||
                  getMediaGatePreviewUrl('image', item.url) ||
                  item.url
                : '';

              const thumbUrl = sanitizeMediaUrl(itemIsVideo ? (videoPoster || item.url) : imageThumb);

              return (
                <MediaGalleryThumb
                  key={item.id || idx}
                  $active={idx === currentIndex}
                  onClick={() => setCurrentIndex(idx)}
                  title={`View item ${idx + 1}`}
                >
                  {itemIsVideo ? (
                    <>
                      {videoPoster ? (
                        <img
                          src={thumbUrl}
                          alt=""
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            filter: isLoaded ? 'none' : 'blur(2px) brightness(0.85)',
                            transition: 'filter 0.2s ease',
                          }}
                        />
                      ) : (
                        <video
                          src={thumbUrl}
                          preload="none"
                          muted
                          playsInline
                        />
                      )}
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
                    <img
                      src={thumbUrl}
                      alt=""
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: isLoaded ? 'none' : 'blur(2px) brightness(0.85)',
                        transition: 'filter 0.2s ease',
                      }}
                    />
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
