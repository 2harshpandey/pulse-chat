import { useState, useEffect, useCallback, useRef } from 'react';
import { getSessionToken, getUserId, resolveApiBaseUrl, getDeletedForMeIds } from '../utils';

export type GalleryFilter = 'photo' | 'video' | 'doc' | 'link' | null;

export interface GalleryItem {
  id: string;
  type: string;
  url?: string;
  originalName?: string;
  size?: number;
  createdAt?: string;
  userId?: string;
  username?: string;
  text?: string;
  duration?: number;
}

export interface UseChatMediaGalleryProps {
  roomId: string;
  isActive: boolean;
}

export function useChatMediaGallery({ roomId, isActive }: UseChatMediaGalleryProps) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<GalleryFilter>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const fetchPage = useCallback(
    async (cursorParam: string | null, filterParam: GalleryFilter, append: boolean) => {
      if (!isMountedRef.current) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const apiBase = resolveApiBaseUrl();
        const userId = getUserId();
        const sessionToken = getSessionToken(roomId);

        const params = new URLSearchParams();
        if (filterParam) {
          params.set('type', filterParam);
        }
        if (cursorParam) {
          params.set('before', cursorParam);
        }
        params.set('limit', '40');

        const headers: Record<string, string> = {
          'x-room-id': roomId,
          'x-user-id': userId,
          'Content-Type': 'application/json',
        };
        if (sessionToken) {
          headers['x-session-token'] = sessionToken;
        }

        const res = await fetch(`${apiBase}/api/media/gallery?${params.toString()}`, {
          headers,
          signal: controller.signal,
        });

        if (!isMountedRef.current) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error || `Failed to load media (${res.status})`);
          setIsLoading(false);
          return;
        }

        const data = (await res.json()) as {
          items: GalleryItem[];
          hasMore: boolean;
          nextCursor?: string | null;
        };

        if (!isMountedRef.current) return;

        const deletedForMe = getDeletedForMeIds(userId);
        const filteredNewItems = (data.items || []).filter((item) => !deletedForMe.has(item.id));

        setItems((prev) => {
          if (!append) return filteredNewItems;
          const existingIds = new Set(prev.map((i) => i.id));
          const uniqueNew = filteredNewItems.filter((i) => !existingIds.has(i.id));
          return [...prev, ...uniqueNew];
        });

        setHasMore(Boolean(data.hasMore));
        setCursor(data.nextCursor || null);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (!isMountedRef.current) return;
        setError('Failed to load media. Please try again.');
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [roomId]
  );

  // Fetch when tab becomes active or filter changes
  useEffect(() => {
    if (!isActive) return;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    void fetchPage(null, filter, false);
  }, [isActive, filter, fetchPage]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore && cursor) {
      void fetchPage(cursor, filter, true);
    }
  }, [isLoading, hasMore, cursor, filter, fetchPage]);

  const toggleFilter = useCallback((selectedFilter: GalleryFilter) => {
    setFilter((prev) => (prev === selectedFilter ? null : selectedFilter));
  }, []);

  const refetch = useCallback(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    void fetchPage(null, filter, false);
  }, [fetchPage, filter]);

  return {
    items,
    isLoading,
    hasMore,
    filter,
    error,
    loadMore,
    toggleFilter,
    refetch,
  };
}
