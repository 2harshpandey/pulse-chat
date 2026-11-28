import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message } from '../types';
import { applyMessageUpdateDetailToList, normalizeMessageId, getSessionToken, getUserId, resolveApiBaseUrl, getDeletedForMeIds, getStoredValue } from '../utils';
import { detectFirstUrl, normalizeUrl, safeExternalUrl } from '../utils/urlLinkUtils';

export type GalleryFilter = 'photo' | 'video' | 'doc' | 'link' | null;

export interface GalleryItem {
  id: string;
  type: string;
  url?: string;
  linkUrl?: string;
  originalName?: string;
  size?: number;
  createdAt?: string;
  userId?: string;
  username?: string;
  text?: string;
  duration?: number;
  reactions?: Message['reactions'];
}

export interface UseChatMediaGalleryProps {
  roomId: string;
  isActive: boolean;
  userId?: string;
}

export function useChatMediaGallery({ roomId, isActive, userId }: UseChatMediaGalleryProps) {
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
        const effectiveUserId = userId || getUserId();
        const sessionToken = getSessionToken(roomId);

        const params = new URLSearchParams();
        params.set('roomId', roomId);
        if (effectiveUserId) {
          params.set('userId', effectiveUserId);
        }
        if (sessionToken) {
          params.set('sessionToken', sessionToken);
        }
        if (filterParam) {
          params.set('type', filterParam);
        }
        if (cursorParam) {
          params.set('before', cursorParam);
        }
        params.set('limit', '40');

        const headers: Record<string, string> = {
          'x-room-id': roomId,
          'x-user-id': effectiveUserId,
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

        const roomKey = roomId || 'me';
        const clearTs = Number(
          getStoredValue(`pulseClearTimestamp_${effectiveUserId}_${roomKey}`) || '0'
        );
        const deletedForMe = getDeletedForMeIds(effectiveUserId);
        const filteredNewItems = (data.items || []).filter((item) => {
          if (deletedForMe.has(item.id)) return false;
          if (clearTs > 0 && item.createdAt) {
            const itemTime = new Date(item.createdAt).getTime();
            if (itemTime <= clearTs) return false;
          }
          return true;
        });

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
        if (isMountedRef.current && abortRef.current === controller) {
          setIsLoading(false);
        }
      }
    },
    [roomId, userId]
  );

  // Fetch when tab becomes active or filter changes
  useEffect(() => {
    if (!isActive) return;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    void fetchPage(null, filter, false);
  }, [isActive, filter, fetchPage]);

  // Listen for message deletion, clear chat, and new incoming media in real time
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMessageDeleted = (e: any) => {
      const detail = e?.detail;
      const currentRoomKey = roomId || 'me';
      if (detail?.roomId && detail.roomId !== currentRoomKey && detail.roomId !== roomId) {
        return;
      }
      const ids: unknown[] = Array.isArray(detail?.ids) ? detail.ids : [];
      const deletedIds = new Set<string>(ids.map((id) => normalizeMessageId(id)).filter(Boolean));
      if (deletedIds.size > 0) {
        setItems((prev) => prev.filter((item) => !deletedIds.has(normalizeMessageId(item.id))));
      }
    };

    const handleChatCleared = (e: any) => {
      const clearedRoom = e?.detail?.roomId;
      const currentRoomKey = roomId || 'me';
      if (!clearedRoom || clearedRoom === currentRoomKey) {
        setItems([]);
        setCursor(null);
        setHasMore(false);
      }
    };

    const handleNewMessage = (e: any) => {
      const msg = e?.detail?.message;
      const msgRoomId = e?.detail?.roomId || 'me';
      const currentRoomKey = roomId || 'me';
      if (!msg || msgRoomId !== currentRoomKey) return;
      if (msg.vanished || msg.isDeleted) return;

      const isImage = msg.type === 'image' || msg.type === 'photo' || msg.type === 'gif';
      const isVideo = msg.type === 'video';
      const isDoc = msg.type === 'file' || msg.type === 'doc';
      const isLink =
        (msg.type === 'link' && Boolean((msg.url && (normalizeUrl(msg.url) || safeExternalUrl(msg.url))) || (msg.text && detectFirstUrl(msg.text)))) ||
        (msg.type === 'text' && Boolean(msg.text && detectFirstUrl(msg.text)));

      if (filter === 'photo' && !isImage) return;
      if (filter === 'video' && !isVideo) return;
      if (filter === 'doc' && !isDoc) return;
      if (filter === 'link' && !isLink) return;
      if (!filter && !isImage && !isVideo && !isDoc && !isLink) return;

      const newItem: GalleryItem = {
        id: String(msg.id || msg._id || ''),
        type: msg.type,
        url: msg.url,
        originalName: msg.originalName,
        size: msg.size,
        createdAt: msg.createdAt || msg.timestamp || new Date().toISOString(),
        userId: msg.userId,
        username: msg.username,
        text: msg.text,
        duration: msg.duration,
        reactions: msg.reactions,
      };

      setItems((prev) => {
        if (prev.some((it) => it.id === newItem.id)) return prev;
        return [newItem, ...prev];
      });
    };

    const handleMessageUpdated = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;
      const currentRoomKey = roomId || 'me';
      if (detail.roomId && detail.roomId !== currentRoomKey && detail.roomId !== roomId) {
        return;
      }

      setItems((prev) =>
        applyMessageUpdateDetailToList(prev, detail, (match) => ({
          ...(match.reactions !== undefined ? { reactions: match.reactions } : {}),
          ...(match.text !== undefined ? { text: match.text } : {}),
          ...(match.url !== undefined ? { url: match.url } : {}),
          ...(match.originalName !== undefined ? { originalName: match.originalName } : {}),
        }))
      );
    };

    window.addEventListener('pulse:message_deleted', handleMessageDeleted);
    window.addEventListener('pulse:chat_cleared', handleChatCleared);
    window.addEventListener('pulse:new_message', handleNewMessage);
    window.addEventListener('pulse:message_updated', handleMessageUpdated);

    return () => {
      window.removeEventListener('pulse:message_deleted', handleMessageDeleted);
      window.removeEventListener('pulse:chat_cleared', handleChatCleared);
      window.removeEventListener('pulse:new_message', handleNewMessage);
      window.removeEventListener('pulse:message_updated', handleMessageUpdated);
    };
  }, [roomId, filter]);

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
