import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import type { Message } from '../types';

interface UseChatSearchProps {
  messages: Message[];
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottomRef: React.MutableRefObject<boolean>;
  apiBase: string;
  roomId: string;
  userId?: string;
  filterVisibleMessages: (msgs: Message[]) => Message[];
  normalizeMessage: (msg: any) => Message;
}

export function useChatSearch({
  messages,
  chatContainerRef,
  isAtBottomRef,
  apiBase,
  roomId,
  userId,
  filterVisibleMessages,
  normalizeMessage,
}: UseChatSearchProps) {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isSearchClosing, setIsSearchClosing] = useState(false);

  const handleCloseSearch = useCallback(() => {
    setIsSearchActive(false);
    setIsSearchClosing(true);
    setTimeout(() => setIsSearchClosing(false), 300); // match CSS transition duration
  }, []);

  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [showSearchNotFound, setShowSearchNotFound] = useState(false);

  const scrollBeforeSearchRef = useRef<number | null>(null);
  const wasAtBottomBeforeSearchRef = useRef<boolean>(false);
  const suppressOlderMessageLoadRef = useRef(false);

  const filteredMessages = useMemo(() => {
    if (activeSearchQuery.trim()) {
      return searchResults ?? [];
    }
    return messages;
  }, [messages, activeSearchQuery, searchResults]);

  useEffect(() => {
    if (activeSearchQuery.trim() && !isSearchLoading && filteredMessages.length === 0) {
      setShowSearchNotFound(true);
      const timer = setTimeout(() => setShowSearchNotFound(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowSearchNotFound(false);
    }
  }, [activeSearchQuery, filteredMessages.length, isSearchLoading]);

  // Block loadOlderMessages for the entire search session
  useLayoutEffect(() => {
    if (activeSearchQuery) {
      suppressOlderMessageLoadRef.current = true;
    } else if (scrollBeforeSearchRef.current !== null) {
      suppressOlderMessageLoadRef.current = true;
    } else {
      suppressOlderMessageLoadRef.current = false;
    }
  }, [activeSearchQuery]);

  // Restore scroll position when search closes
  useEffect(() => {
    if (activeSearchQuery || scrollBeforeSearchRef.current === null) {
      if (!activeSearchQuery) suppressOlderMessageLoadRef.current = false;
      return;
    }

    const targetScroll = scrollBeforeSearchRef.current;
    const wasAtBottom = wasAtBottomBeforeSearchRef.current;
    scrollBeforeSearchRef.current = null;
    wasAtBottomBeforeSearchRef.current = false;

    const scroller = chatContainerRef.current;
    if (!scroller) return;

    let lastHeight = scroller.scrollHeight;
    let stableFrames = 0;
    let rafId: number;
    let cleanup: (() => void) | undefined;

    const applyRestore = () => {
      const prev = scroller.style.overflowAnchor;
      scroller.style.overflowAnchor = 'none';

      if (wasAtBottom) {
        scroller.scrollTop = scroller.scrollHeight;
      } else {
        const max = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = Math.min(Math.max(targetScroll, 0), max);
      }

      requestAnimationFrame(() => {
        scroller.style.overflowAnchor = prev || '';
        suppressOlderMessageLoadRef.current = false;
      });
    };

    const checkStable = () => {
      const currentHeight = scroller.scrollHeight;
      if (currentHeight === lastHeight) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        lastHeight = currentHeight;
      }

      if (stableFrames >= 2) {
        cleanup?.();
        applyRestore();
      } else {
        rafId = requestAnimationFrame(checkStable);
      }
    };

    rafId = requestAnimationFrame(checkStable);

    const safetyTimer = window.setTimeout(() => {
      cleanup?.();
      applyRestore();
    }, 500);

    cleanup = () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(safetyTimer);
      suppressOlderMessageLoadRef.current = false;
      cleanup = undefined;
    };

    return () => cleanup?.();
  }, [activeSearchQuery, chatContainerRef]);

  // Delay focus when search opens
  useEffect(() => {
    if (isSearchActive) {
      setTimeout(() => {
        const input = document.getElementById('chat-search-input');
        if (input) input.focus();
      }, 300);
    }
  }, [isSearchActive]);

  // Dismiss empty search on outside click
  useEffect(() => {
    if (!isSearchActive) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (activeSearchQuery.trim() || chatSearchQuery.trim() || searchResults !== null) {
        return;
      }
      const target = e.target as HTMLElement;
      if (!target.closest('#chat-search-container')) {
        setIsSearchActive(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isSearchActive, activeSearchQuery, chatSearchQuery, searchResults]);

  // Full-history search via backend API
  useEffect(() => {
    if (!activeSearchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setIsSearchLoading(true);
    setSearchResults(null);
    const headers: Record<string, string> = { 'x-room-id': roomId };
    if (userId) {
      headers['x-user-id'] = userId;
    }
    const sessionToken = sessionStorage.getItem('pulseSessionToken');
    if (sessionToken) {
      headers['x-session-token'] = sessionToken;
    }
    fetch(
      `${apiBase}/api/messages/search?q=${encodeURIComponent(activeSearchQuery.trim())}`,
      { headers }
    )
      .then(res => {
        if (!res.ok) throw new Error('Search failed');
        return res.json();
      })
      .then((raw: any[]) => {
        if (cancelled) return;
        const normalized = raw.map(normalizeMessage);
        const visibleResults = filterVisibleMessages(normalized);
        setSearchResults(visibleResults);
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Message search error:', err);
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearchLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeSearchQuery, apiBase, roomId, userId, normalizeMessage, filterVisibleMessages]);

  const captureScrollBeforeSearch = useCallback(() => {
    if (!activeSearchQuery) {
      const scroller = chatContainerRef.current;
      scrollBeforeSearchRef.current = scroller?.scrollTop ?? null;
      wasAtBottomBeforeSearchRef.current = isAtBottomRef.current;
    }
  }, [activeSearchQuery, chatContainerRef, isAtBottomRef]);

  const resetSearch = useCallback(() => {
    setActiveSearchQuery('');
    setChatSearchQuery('');
    setIsSearchActive(false);
  }, []);

  return {
    isSearchActive,
    setIsSearchActive,
    isSearchClosing,
    handleCloseSearch,
    chatSearchQuery,
    setChatSearchQuery,
    activeSearchQuery,
    setActiveSearchQuery,
    searchResults,
    setSearchResults,
    isSearchLoading,
    showSearchNotFound,
    scrollBeforeSearchRef,
    wasAtBottomBeforeSearchRef,
    suppressOlderMessageLoadRef,
    filteredMessages,
    captureScrollBeforeSearch,
    resetSearch,
  };
}
