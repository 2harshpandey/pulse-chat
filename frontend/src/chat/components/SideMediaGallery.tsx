import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import type { Message } from '../types';
import { useChatMediaGallery, type GalleryFilter, type GalleryItem } from '../hooks/useChatMediaGallery';
import { sanitizeMediaUrl, withCloudinaryTransform, downloadFile } from '../utils';
import {
  MediaGalleryPanelRoot,
  MediaGalleryFilterBar,
  MediaGalleryFilterChip,
  MediaGalleryScrollArea,
  MediaGalleryGrid,
  MediaGalleryTile,
  MediaGalleryTileImg,
  MediaGalleryPlayOverlay,
  MediaGalleryPlayIconCircle,
  MediaGalleryDurationBadge,
  MediaGalleryDocCard,
  MediaGalleryDocIcon,
  MediaGalleryDocInfo,
  MediaGalleryDocName,
  MediaGalleryDocMeta,
  MediaGalleryLinkCard,
  MediaGalleryLinkIcon,
  MediaGalleryEmptyState,
  MediaGalleryErrorState,
  MediaGallerySpinner,
  MediaGallerySentinel,
  MediaGalleryDateDivider,
  MediaGalleryDateBadge,
} from '../styles/chat.message.styles';

export interface SideMediaGalleryProps {
  roomId: string;
  isActive: boolean;
  currentUserId?: string;
  openMediaGallery?: (items: Message[], initialIndex?: number, options?: { autoPlayVideo?: boolean }) => void;
  openLightbox?: (url: string, canonicalUrl?: string) => void;
  loadedMediaMessageSet?: Set<string>;
  loadedMediaSrcById?: Record<string, string>;
  onShowToast?: (msg: string) => void;
}

const FILTERS: { label: string; value: GalleryFilter }[] = [
  { label: 'Photos', value: 'photo' },
  { label: 'Videos', value: 'video' },
  { label: 'Docs', value: 'doc' },
  { label: 'Links', value: 'link' },
];

const formatDuration = (seconds?: number): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes > 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.ceil(bytes / 1024)} KB`;
};

export const getMediaDateGroupLabel = (timestamp?: string | number | Date): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffMs = todayMidnight.getTime() - dateMidnight.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays >= 2 && diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const extractUrlFromText = (text: string): string | null => {
  const match = text.match(/(?:https?:\/\/|www\.)[^\s]+/i);
  if (!match) return null;
  let raw = match[0].replace(/[.,;:!?)'">\]]+$/, '');
  if (/^www\./i.test(raw)) {
    raw = `https://${raw}`;
  }
  return raw;
};

const isPlayableType = (type?: string, url?: string): boolean => {
  if (!type && !url) return false;
  const t = (type || '').toLowerCase();
  if (t === 'image' || t === 'video' || t === 'gif' || t === 'photo') return true;
  if (url && /\.(jpe?g|png|gif|webp|svg|mp4|webm|mov|m4v)$/i.test(url)) return true;
  return false;
};

export const SideMediaGallery: React.FC<SideMediaGalleryProps> = ({
  roomId,
  isActive,
  currentUserId,
  openMediaGallery,
  openLightbox,
  loadedMediaMessageSet,
  loadedMediaSrcById,
  onShowToast,
}) => {
  const { items, isLoading, hasMore, filter, error, loadMore, toggleFilter, refetch } = useChatMediaGallery({
    roomId,
    isActive,
    userId: currentUserId,
  });

  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for seamless infinite scrolling
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !isActive) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      {
        rootMargin: '160px',
        threshold: 0.05,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore, isActive]);

  // Build playable items list for the full-screen media player
  const playableItems = useMemo<Message[]>(() => {
    return items
      .filter((it) => isPlayableType(it.type, it.url))
      .map((it) => ({
        id: it.id,
        userId: it.userId || '',
        username: it.username || 'User',
        text: it.text || '',
        timestamp: it.createdAt || new Date().toISOString(),
        createdAt: it.createdAt || new Date().toISOString(),
        type: (it.type === 'video' || (it.url && /\.(mp4|webm|mov|m4v)$/i.test(it.url)) ? 'video' : 'image') as any,
        url: it.url,
        originalName: it.originalName,
        size: it.size,
        duration: it.duration,
        sender: it.userId || '',
      }));
  }, [items]);

  const handleMediaClick = useCallback(
    (item: GalleryItem) => {
      const isPlayable = isPlayableType(item.type, item.url);
      const isLink = item.type === 'link' || (item.type === 'text' && Boolean(item.text && /https?:\/\//i.test(item.text)));

      if (isPlayable) {
        const targetList =
          playableItems.length > 0
            ? playableItems
            : [
                {
                  id: item.id,
                  userId: item.userId || '',
                  username: item.username || 'User',
                  text: item.text || '',
                  timestamp: item.createdAt || new Date().toISOString(),
                  createdAt: item.createdAt || new Date().toISOString(),
                  type: (item.type === 'video' || (item.url && /\.(mp4|webm|mov|m4v)$/i.test(item.url)) ? 'video' : 'image') as any,
                  url: item.url,
                  originalName: item.originalName,
                  size: item.size,
                  duration: item.duration,
                  sender: item.userId || '',
                },
              ];
        const targetIndex = targetList.findIndex((m) => m.id === item.id);
        if (openMediaGallery) {
          openMediaGallery(targetList, Math.max(0, targetIndex), { autoPlayVideo: true });
        } else if (openLightbox && item.url && item.type !== 'video') {
          const safe = sanitizeMediaUrl(item.url);
          openLightbox(safe || item.url, item.url);
        }
      } else if ((item.type === 'file' || item.type === 'doc') && item.url) {
        const safe = sanitizeMediaUrl(item.url);
        if (safe) {
          if (onShowToast) {
            onShowToast('Download started...');
          } else if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pulse:status_toast', { detail: { message: 'Download started...' } }));
          }
          void downloadFile(safe, item.originalName || 'file', undefined, undefined, true).catch(() => {
            if (onShowToast) {
              onShowToast('Failed to download file');
            } else if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('pulse:status_toast', { detail: { message: 'Failed to download file' } }));
            }
          });
        }
      } else if (isLink && item.text) {
        const urlStr = extractUrlFromText(item.text);
        if (urlStr) {
          const safe = sanitizeMediaUrl(urlStr);
          if (safe) {
            window.open(safe, '_blank', 'noopener,noreferrer');
          }
        }
      } else if (item.url) {
        const safe = sanitizeMediaUrl(item.url);
        if (safe) {
          window.open(safe, '_blank', 'noopener,noreferrer');
        }
      }
    },
    [openMediaGallery, openLightbox, playableItems, onShowToast]
  );

  const renderItem = useCallback(
    (item: GalleryItem) => {
      const isImage = item.type === 'image' || item.type === 'gif' || item.type === 'photo';
      const isVideo = item.type === 'video';
      const isFile = item.type === 'file' || item.type === 'doc';
      const isLink = item.type === 'link' || (item.type === 'text' && Boolean(item.text && /https?:\/\//i.test(item.text)));

      // Photos
      if (isImage) {
        const cachedSrc = loadedMediaSrcById ? loadedMediaSrcById[item.id] : undefined;
        const thumbUrl = sanitizeMediaUrl(
          cachedSrc ||
            withCloudinaryTransform(item.url || '', 'f_auto,q_auto,w_240,h_240,c_fill') ||
            item.url ||
            ''
        );

        return (
          <MediaGalleryTile
            key={item.id}
            onClick={() => handleMediaClick(item)}
            title={item.originalName || 'Photo'}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMediaClick(item);
              }
            }}
          >
            <MediaGalleryTileImg
              src={thumbUrl}
              alt={item.originalName || 'Photo'}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                const fallback = sanitizeMediaUrl(item.url || '');
                if (fallback && img.src !== fallback) {
                  img.src = fallback;
                }
              }}
            />
          </MediaGalleryTile>
        );
      }

      // Videos
      if (isVideo) {
        const cachedSrc = loadedMediaSrcById ? loadedMediaSrcById[item.id] : undefined;
        const posterUrl = sanitizeMediaUrl(
          withCloudinaryTransform(item.url || '', 'so_0,f_jpg,q_auto,w_240,h_240,c_fill') ||
            cachedSrc ||
            item.url ||
            ''
        );

        const durationStr = formatDuration(item.duration);

        return (
          <MediaGalleryTile
            key={item.id}
            onClick={() => handleMediaClick(item)}
            title={item.originalName || 'Video'}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMediaClick(item);
              }
            }}
          >
            <MediaGalleryTileImg
              src={posterUrl}
              alt={item.originalName || 'Video'}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                const fallback = sanitizeMediaUrl(item.url || '');
                if (fallback && img.src !== fallback) {
                  img.src = fallback;
                }
              }}
            />
            <MediaGalleryPlayOverlay>
              <MediaGalleryPlayIconCircle>
                <svg viewBox="0 0 24 24">
                  <polygon points="8 5 19 12 8 19" />
                </svg>
              </MediaGalleryPlayIconCircle>
            </MediaGalleryPlayOverlay>
            {durationStr && <MediaGalleryDurationBadge>{durationStr}</MediaGalleryDurationBadge>}
          </MediaGalleryTile>
        );
      }

      // Docs / Files
      if (isFile) {
        const ext = (item.originalName?.split('.').pop() || 'FILE').toUpperCase();
        const sizeStr = formatFileSize(item.size);

        return (
          <MediaGalleryDocCard
            key={item.id}
            onClick={() => handleMediaClick(item)}
            title={`Download ${item.originalName || 'file'}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMediaClick(item);
              }
            }}
          >
            <MediaGalleryDocIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </MediaGalleryDocIcon>
            <MediaGalleryDocInfo>
              <MediaGalleryDocName>{item.originalName || 'Document'}</MediaGalleryDocName>
              <MediaGalleryDocMeta>
                <span>{ext}</span>
                {sizeStr && <span>• {sizeStr}</span>}
              </MediaGalleryDocMeta>
            </MediaGalleryDocInfo>
          </MediaGalleryDocCard>
        );
      }

      // Links
      if (isLink && item.text) {
        const urlStr = extractUrlFromText(item.text);
        let domain = '';
        if (urlStr) {
          try {
            domain = new URL(urlStr).hostname.replace(/^www\./i, '');
          } catch (_) {
            domain = 'Link';
          }
        }

        return (
          <MediaGalleryLinkCard
            key={item.id}
            onClick={() => handleMediaClick(item)}
            title={`Open ${domain || 'link'}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMediaClick(item);
              }
            }}
          >
            <MediaGalleryLinkIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </MediaGalleryLinkIcon>
            <MediaGalleryDocInfo>
              <MediaGalleryDocName style={{ color: '#38bdf8' }}>{domain || 'External Link'}</MediaGalleryDocName>
              <MediaGalleryDocMeta>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.text.slice(0, 90)}
                </span>
              </MediaGalleryDocMeta>
            </MediaGalleryDocInfo>
          </MediaGalleryLinkCard>
        );
      }

      return null;
    },
    [handleMediaClick, loadedMediaSrcById]
  );

  return (
    <MediaGalleryPanelRoot>
      <MediaGalleryFilterBar
        role="tablist"
        aria-label="Media filters"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        {FILTERS.map(({ label, value }) => (
          <MediaGalleryFilterChip
            key={value}
            $active={filter === value}
            onClick={() => toggleFilter(value)}
            type="button"
            role="tab"
            aria-selected={filter === value}
          >
            {label}
          </MediaGalleryFilterChip>
        ))}
      </MediaGalleryFilterBar>

      <MediaGalleryScrollArea>
        <MediaGalleryGrid>
          {items.map((item, index) => {
            const currentLabel = getMediaDateGroupLabel(item.createdAt);
            const prevLabel = index > 0 ? getMediaDateGroupLabel(items[index - 1].createdAt) : null;
            const showDivider = Boolean(currentLabel && currentLabel !== prevLabel);

            return (
              <React.Fragment key={item.id}>
                {showDivider && (
                  <MediaGalleryDateDivider role="separator" aria-label={currentLabel}>
                    <MediaGalleryDateBadge>{currentLabel}</MediaGalleryDateBadge>
                  </MediaGalleryDateDivider>
                )}
                {renderItem(item)}
              </React.Fragment>
            );
          })}

          {!isLoading && !error && items.length === 0 && (
            <MediaGalleryEmptyState>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>{filter ? `No ${filter}s found in this room` : 'No media sent in this room yet'}</span>
            </MediaGalleryEmptyState>
          )}

          {error && (
            <MediaGalleryErrorState>
              <span>{error}</span>
              <button type="button" onClick={refetch}>
                Retry
              </button>
            </MediaGalleryErrorState>
          )}

          <MediaGallerySentinel ref={sentinelRef} />
        </MediaGalleryGrid>

        {isLoading && <MediaGallerySpinner aria-label="Loading media..." />}
      </MediaGalleryScrollArea>
    </MediaGalleryPanelRoot>
  );
};

