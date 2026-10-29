import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Message, ReactionsPopupData } from '../../types';
import { filterValidReactions } from '../../constants';
import { sanitizeMediaUrl, withCloudinaryTransform, getMediaGatePreviewUrl } from '../../utils';
import { VideoPlayer } from '../../VideoPlayer';
import { MediaDownloadButton } from '../message';
import { usePhotoZoom } from '../../hooks/usePhotoZoom';
import { LightboxToolbar, LightboxZoomButton } from '../../styles/chat.media.styles';
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
  onOpenReactionPicker?: (messageId: string, rect: DOMRect, sender: 'me' | 'other', isAlbum?: boolean) => void;
  onSetReactionsPopup?: (popup: ReactionsPopupData | null) => void;
  allMessages?: Message[];
  onSetReply?: (message: Message) => void;
  onMediaLoadError?: (messageId: string, url?: string) => void;
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
  onOpenReactionPicker,
  onSetReactionsPopup,
  allMessages,
  onSetReply,
  onMediaLoadError,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchOffset, setTouchOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [photoBox, setPhotoBox] = useState<{ width: number; height: number } | null>(null);

  const zoom = usePhotoZoom();

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const hasSwipedRef = useRef(false);
  const requestedLoadIdsRef = useRef<Set<string>>(new Set());
  // Stable media URL per slide to prevent swapping video source mid-playback
  const activeMediaUrlRef = useRef<{ id: string; url: string } | null>(null);

  useEffect(() => {
    zoom.resetZoom();
  }, [currentIndex, isOpen, zoom.resetZoom]);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
      setTouchOffset(0);
      setIsSwiping(false);
    }
  }, [isOpen, initialIndex, items.length]);

  const rawItem = items[currentIndex] || items[0];
  const currentItem = useMemo(() => {
    if (!rawItem) return rawItem;
    if (!allMessages || allMessages.length === 0) return rawItem;
    return allMessages.find((m) => m.id === rawItem.id) || rawItem;
  }, [rawItem, allMessages]);

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

  // Track rendered photo dimensions so reaction badge pins to the actual photo corner
  useEffect(() => {
    if (isVideo) {
      setPhotoBox(null);
      return;
    }
    const img = zoom.imageRef.current;
    if (!img) return;

    const updateBox = () => {
      const w = img.clientWidth || img.offsetWidth;
      const h = img.clientHeight || img.offsetHeight;
      if (w > 0 && h > 0) {
        setPhotoBox({ width: w, height: h });
      }
    };

    updateBox();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateBox);
      ro.observe(img);
    }
    window.addEventListener('resize', updateBox);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateBox);
    };
  }, [isOpen, currentIndex, currentItem?.id, isVideo]);

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
    if (zoom.isZoomed) return;
    if (e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = null;
    hasSwipedRef.current = false;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (zoom.isZoomed) return;
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
  let currentSlideUrl = (loadedMediaSrcById && loadedMediaSrcById[currentItem.id]) || currentItem.url || '';
  if (isVideo) {
    if (!activeMediaUrlRef.current || activeMediaUrlRef.current.id !== currentItem.id) {
      activeMediaUrlRef.current = {
        id: currentItem.id,
        url: currentSlideUrl,
      };
    }
    currentSlideUrl = activeMediaUrlRef.current.url;
  }
  const safeUrl = sanitizeMediaUrl(currentSlideUrl);

  const formattedTime = currentItem.timestamp
    ? new Date(currentItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const renderReactionBadge = (isPhoto: boolean = false) => {
    if (!currentItem) return null;
    const valid = filterValidReactions(currentItem.reactions);
    const itemReactions: Record<string, { userId: string; username: string }[]> = {};
    for (const [emoji, users] of Object.entries(valid)) {
      const itemUsers = users.filter((u: any) => !u.isAlbum);
      if (itemUsers.length > 0) {
        itemReactions[emoji] = itemUsers;
      }
    }
    const totalReactions = Object.values(itemReactions).flat().length;
    const uniqueEmojis = Object.keys(itemReactions);
    if (totalReactions === 0) return null;

    const isVisible = !isPhoto || !zoom.isZoomed;

    const bottomPos = isPhoto
      ? photoBox
        ? `max(8px, calc(50% - ${photoBox.height / 2}px - 14px))`
        : '16px'
      : '-14px';
    const rightPos = isPhoto
      ? photoBox
        ? `max(8px, calc(50% - ${photoBox.width / 2}px - 10px))`
        : '16px'
      : '-10px';

    return (
      <div
        style={{
          position: 'absolute',
          bottom: bottomPos,
          right: rightPos,
          zIndex: 26,
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          background: 'rgba(30, 41, 59, 0.9)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '999px',
          padding: '4px 10px 4px 8px',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.2)',
          cursor: isVisible ? 'pointer' : 'default',
          userSelect: 'none',
          opacity: isVisible ? 1 : 0,
          visibility: isVisible ? 'visible' : 'hidden',
          transform: isVisible ? 'scale(1)' : 'scale(0.7)',
          pointerEvents: isVisible ? 'auto' : 'none',
          transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.2s',
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSetReactionsPopup?.({
            messageId: currentItem.id,
            reactions: itemReactions,
            rect: e.currentTarget.getBoundingClientRect(),
          });
        }}
        title="View reactions on this media"
      >
        {uniqueEmojis.slice(0, 3).map((emoji) => (
          <span key={emoji} style={{ fontSize: '18px', lineHeight: 1 }}>
            {emoji}
          </span>
        ))}
        {totalReactions > 1 && (
          <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#f8fafc', marginLeft: '3px' }}>
            {totalReactions}
          </span>
        )}
      </div>
    );
  };

  return (
    <MediaGalleryOverlay
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Header Bar */}
      <MediaGalleryHeader>
        <MediaGalleryInfo>
          {items.length > 1 && (
            <MediaGalleryCounter>
              {currentIndex + 1} / {items.length}
            </MediaGalleryCounter>
          )}
          {currentItem.username && (
            <MediaGalleryMeta>
              {currentItem.username} {formattedTime ? `• ${formattedTime}` : ''}
            </MediaGalleryMeta>
          )}
        </MediaGalleryInfo>

        <MediaGalleryActions>
          {onSetReply && (
            <MediaGalleryActionBtn
              type="button"
              title="Reply to message"
              aria-label="Reply to message"
              onClick={(e) => {
                e.stopPropagation();
                onSetReply(currentItem);
                onClose();
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 17 4 12 9 7" />
                <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
              </svg>
            </MediaGalleryActionBtn>
          )}

          {onOpenReactionPicker && (
            <MediaGalleryActionBtn
              type="button"
              title="React to message"
              aria-label="React to message"
              data-reaction-btn="true"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onOpenReactionPicker(
                  currentItem.id,
                  rect,
                  currentItem.userId === currentUserId ? 'me' : 'other'
                );
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
                <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
              </svg>
            </MediaGalleryActionBtn>
          )}

          <MediaDownloadButton
            messageId={currentItem.id}
            url={safeUrl}
            filename={currentItem.originalName}
            isVideo={isVideo}
            onRequestDownload={onRequestDownload}
            isGalleryHeader={true}
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
          if (e.target === e.currentTarget && !hasSwipedRef.current && !zoom.isZoomed) onClose();
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
            if (e.target === e.currentTarget && !hasSwipedRef.current && !zoom.isZoomed) onClose();
          }}
        >
          {isVideo ? (
            <MediaGalleryVideoWrapper
              key={currentItem.id || safeUrl}
              onClick={(e) => e.stopPropagation()}
            >
              <VideoPlayer
                src={safeUrl}
                fallbackUrl={sanitizeMediaUrl(currentItem.url) || undefined}
                autoPlay={true}
                isGalleryMode={true}
              />
              {renderReactionBadge(false)}
            </MediaGalleryVideoWrapper>
          ) : (
            <div
              ref={zoom.frameRef as any}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
              onWheel={zoom.handleWheel}
              onPointerDown={zoom.handlePointerDown}
              onPointerMove={zoom.handlePointerMove}
              onPointerUp={zoom.handlePointerUp}
              onPointerCancel={zoom.handlePointerCancel}
              onDoubleClick={zoom.handleDoubleClick}
              onClick={(e) => {
                if (e.target === e.currentTarget && !hasSwipedRef.current && !zoom.isZoomed) {
                  onClose();
                }
              }}
            >
              <img
                ref={zoom.imageRef as any}
                key={currentItem.id || safeUrl}
                src={safeUrl}
                alt={currentItem.originalName || 'Photo'}
                draggable={false}
                onLoad={(e) => {
                  zoom.handleImageLoad(e);
                  const img = e.currentTarget;
                  if (img.clientWidth > 0 && img.clientHeight > 0) {
                    setPhotoBox({ width: img.clientWidth, height: img.clientHeight });
                  }
                }}
                onError={(e) => {
                  const fallback = sanitizeMediaUrl(currentItem.url);
                  const img = e.currentTarget;
                  if (fallback && img.src !== fallback) {
                    img.src = fallback;
                  }
                  onMediaLoadError?.(currentItem.id, currentItem.url);
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={zoom.handleDoubleClick}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                style={{
                  maxWidth: '90vw',
                  maxHeight: '72vh',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
                  outline: 'none',
                  transformOrigin: 'center center',
                  willChange: 'transform',
                  transition: zoom.isInteracting ? 'none' : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                  cursor: zoom.isZoomed ? 'move' : 'default',
                  transform: `translate3d(${zoom.transform.x}px, ${zoom.transform.y}px, 0) scale(${zoom.transform.scale})`,
                }}
              />
              {renderReactionBadge(true)}

              <LightboxToolbar
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  top: '16px',
                  right: '16px',
                }}
              >
                <LightboxZoomButton
                  type="button"
                  title="Zoom out"
                  aria-label="Zoom out"
                  disabled={!zoom.canZoomOut}
                  onClick={zoom.handleZoomOut}
                >
                  <svg viewBox="0 0 24 24">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </LightboxZoomButton>
                <LightboxZoomButton
                  type="button"
                  title="Zoom in"
                  aria-label="Zoom in"
                  disabled={!zoom.canZoomIn}
                  onClick={zoom.handleZoomIn}
                >
                  <svg viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </LightboxZoomButton>
              </LightboxToolbar>
            </div>
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
      {(Boolean(currentItem.text) || items.length > 1) && (
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
                        onError={(e) => {
                          const fallback = sanitizeMediaUrl(item.url);
                          const img = e.currentTarget;
                          if (fallback && img.src !== fallback) {
                            img.src = fallback;
                          }
                          onMediaLoadError?.(item.id, item.url);
                        }}
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
      )}
    </MediaGalleryOverlay>
  );
};
