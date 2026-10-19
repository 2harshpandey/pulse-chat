import React, { useCallback, useEffect } from 'react';
import type { Message } from '../types';
import {
  MAX_QUOTE_JUMP_STACK_DEPTH,
  MAX_QUOTE_AUTO_LOAD_PAGES,
  INITIAL_FIRST_ITEM_INDEX,
  quoteWarn,
} from '../constants';
import {
  normalizeMessageId,
  getMessageElementId,
  findMessageElement,
} from '../utils';

export interface UseChatMessageNavigationProps {
  apiBase: string;
  roomId: string;
  messagesRef: React.MutableRefObject<Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  historyLoaded: boolean;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  replyingTo: Message | null;
  activeSearchQuery?: string;
  setActiveSearchQuery?: (val: string) => void;
  setChatSearchQuery?: (val: string) => void;
  setIsSearchActive?: (val: boolean) => void;
  resetSearch?: () => void;
  quoteJumpReturnStackRef: React.MutableRefObject<string[]>;
  clearPendingBottomScrollTimers: () => void;
  engageQuoteJumpLock: (ms: number) => void;
  scheduleProgrammaticScrollSuppression: (ms: number) => void;
  lastAtBottomStateRef: React.MutableRefObject<boolean>;
  isAtBottomRef: React.MutableRefObject<boolean>;
  setIsScrollToBottomVisible: (val: boolean) => void;
  shouldSuppressProgrammaticScroll: () => boolean;
  filterVisibleMessages: (messages: Message[]) => Message[];
  normalizeMessage: (raw: any) => Message;
  markDeletedReplyTargets: (messages: Message[], deletedIds: Set<string>) => Message[];
  groupStartMessageIdsRef: React.MutableRefObject<Set<string>>;
  setFirstItemIndex: React.Dispatch<React.SetStateAction<number>>;
  firstItemIndexRef: React.MutableRefObject<number>;
  setNewMessagesWhileScrolledUp: React.Dispatch<React.SetStateAction<number>>;
  messageTailSnapshotRef: React.MutableRefObject<{ length: number; lastId: string | null }>;
  getMessageCursor: (m?: Message) => string | null;
  oldestLoadedAtRef: React.MutableRefObject<string | null>;
  setOldestLoadedAt: (val: string | null) => void;
  newestLoadedAtRef: React.MutableRefObject<string | null>;
  setNewestLoadedAt: (val: string | null) => void;
  setHasMoreOlderMessages: (val: boolean) => void;
  hasMoreOlderMessagesRef: React.MutableRefObject<boolean>;
  setHasMoreNewerMessages: (val: boolean) => void;
  hasMoreNewerMessagesRef: React.MutableRefObject<boolean>;
  isLoadingOlderRef: React.MutableRefObject<boolean>;
  fetchAndPrependOlderMessages: (
    beforeCreatedAt: string,
    limit?: number
  ) => Promise<{ prependedCount: number; nextCursor: string | null; hasMore: boolean }>;
}

export function useChatMessageNavigation({
  apiBase,
  roomId,
  messagesRef,
  setMessages,
  historyLoaded,
  chatContainerRef,
  replyingTo,
  activeSearchQuery,
  setActiveSearchQuery,
  setChatSearchQuery,
  setIsSearchActive,
  resetSearch,
  quoteJumpReturnStackRef,
  clearPendingBottomScrollTimers,
  engageQuoteJumpLock,
  scheduleProgrammaticScrollSuppression,
  lastAtBottomStateRef,
  isAtBottomRef,
  setIsScrollToBottomVisible,
  shouldSuppressProgrammaticScroll,
  filterVisibleMessages,
  normalizeMessage,
  markDeletedReplyTargets,
  groupStartMessageIdsRef,
  setFirstItemIndex,
  firstItemIndexRef,
  setNewMessagesWhileScrolledUp,
  messageTailSnapshotRef,
  getMessageCursor,
  oldestLoadedAtRef,
  setOldestLoadedAt,
  newestLoadedAtRef,
  setNewestLoadedAt,
  setHasMoreOlderMessages,
  hasMoreOlderMessagesRef,
  setHasMoreNewerMessages,
  hasMoreNewerMessagesRef,
  isLoadingOlderRef,
  fetchAndPrependOlderMessages,
}: UseChatMessageNavigationProps) {
  // Highlight message helper
  const highlightMessage = useCallback((messageId: string) => {
    if (!messageId) return;
    const maxAttempts = 24;
    const attemptDelayMs = 60;

    const applyHighlight = (attempt: number) => {
      const element = document.getElementById(getMessageElementId(messageId));
      if (!element) {
        if (attempt < maxAttempts) {
          window.setTimeout(() => applyHighlight(attempt + 1), attemptDelayMs);
        }
        return;
      }

      element.classList.remove('quote-jump-highlight');
      void element.getBoundingClientRect();
      element.classList.add('quote-jump-highlight');

      window.setTimeout(() => {
        element.classList.remove('quote-jump-highlight');
      }, 1300);
    };

    applyHighlight(0);
  }, []);

  const scrollToLoadedMessage = useCallback(
    (messageId: string, behavior: 'auto' | 'smooth' = 'auto', force = false) => {
      const targetId = normalizeMessageId(messageId);
      if (!targetId) return false;
      const msgIndex = messagesRef.current.findIndex((m) => normalizeMessageId(m.id) === targetId);
      if (msgIndex === -1) return false;

      clearPendingBottomScrollTimers();
      engageQuoteJumpLock(2600);
      scheduleProgrammaticScrollSuppression(2600);
      lastAtBottomStateRef.current = false;
      isAtBottomRef.current = false;
      setIsScrollToBottomVisible(true);

      if (!force && shouldSuppressProgrammaticScroll()) return false;

      const ensureVisibleAndHighlight = (attempt: number) => {
        const element = findMessageElement(targetId);
        if (!element) {
          if (attempt < 25) window.setTimeout(() => ensureVisibleAndHighlight(attempt + 1), 40);
          return;
        }
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
        highlightMessage(targetId);
      };

      requestAnimationFrame(() => ensureVisibleAndHighlight(0));
      return true;
    },
    [
      clearPendingBottomScrollTimers,
      engageQuoteJumpLock,
      highlightMessage,
      isAtBottomRef,
      lastAtBottomStateRef,
      messagesRef,
      scheduleProgrammaticScrollSuppression,
      setIsScrollToBottomVisible,
      shouldSuppressProgrammaticScroll,
    ]
  );

  const resolveReplyNavigationTargetId = useCallback(
    (requestedMessageId: string, sourceMessageId?: string, replyingToPayload?: any): string => {
      const sourceId = normalizeMessageId(sourceMessageId);
      const directRequested = normalizeMessageId(requestedMessageId);
      const idsInMemory = new Set(messagesRef.current.map((m) => normalizeMessageId(m.id)).filter(Boolean));

      const candidateIds = [
        directRequested,
        normalizeMessageId(replyingToPayload?.id),
        normalizeMessageId(replyingToPayload?.messageId),
        normalizeMessageId(replyingToPayload?._id),
      ].filter(Boolean);

      for (const candidate of candidateIds) {
        if (sourceId && candidate === sourceId) continue;
        if (idsInMemory.has(candidate)) {
          return candidate;
        }
      }

      if (!replyingToPayload) return directRequested;

      const replyText = typeof replyingToPayload.text === 'string' ? replyingToPayload.text.trim() : '';
      const replyUsername = typeof replyingToPayload.username === 'string' ? replyingToPayload.username.trim() : '';
      const replyType = typeof replyingToPayload.type === 'string' ? replyingToPayload.type : '';
      const replyUrl = typeof replyingToPayload.url === 'string' ? replyingToPayload.url.trim() : '';

      const sourceIndex = sourceId
        ? messagesRef.current.findIndex((m) => normalizeMessageId(m.id) === sourceId)
        : -1;

      const metadataMatches = messagesRef.current
        .map((m, index) => ({ m, index }))
        .filter(({ m }) => {
          if (sourceId && normalizeMessageId(m.id) === sourceId) return false;
          if (replyUsername && m.username !== replyUsername) return false;
          if (replyType && m.type !== replyType) return false;
          if (replyUrl && (m.url || '').trim() !== replyUrl) return false;
          if (replyText && (m.text || '').trim() !== replyText) return false;
          if (!replyText && !replyUrl) return false;
          return true;
        });

      if (metadataMatches.length === 0) return directRequested;

      const preferred = sourceIndex > 0
        ? metadataMatches.filter(({ index }) => index < sourceIndex)
        : metadataMatches;

      const chosen = preferred.length > 0
        ? preferred[preferred.length - 1]
        : metadataMatches[metadataMatches.length - 1];

      return normalizeMessageId(chosen.m.id) || directRequested;
    },
    [messagesRef]
  );

  const scrollToMessage = useCallback(
    (
      messageId: string,
      sourceMessageId?: string,
      behavior: 'auto' | 'smooth' = 'auto',
      force = false,
      replyingToPayload?: any
    ) => {
      const targetId = resolveReplyNavigationTargetId(messageId, sourceMessageId, replyingToPayload);
      const sourceId = normalizeMessageId(sourceMessageId);

      if (activeSearchQuery) {
        if (resetSearch) {
          resetSearch();
        } else {
          setActiveSearchQuery?.('');
          setChatSearchQuery?.('');
          setIsSearchActive?.(false);
        }
      }

      if (targetId && sourceId && targetId === sourceId) return;

      if (sourceId && sourceId !== targetId) {
        const stack = quoteJumpReturnStackRef.current;
        const lastSourceId = stack[stack.length - 1];
        if (lastSourceId !== sourceId) {
          const nextStack =
            stack.length >= MAX_QUOTE_JUMP_STACK_DEPTH
              ? stack.slice(stack.length - MAX_QUOTE_JUMP_STACK_DEPTH + 1)
              : stack.slice();
          nextStack.push(sourceId);
          quoteJumpReturnStackRef.current = nextStack;
        }
      }

      return new Promise<void>((resolve) => {
        if (!targetId) {
          resolve();
          return;
        }
        if (scrollToLoadedMessage(targetId, behavior, force)) {
          resolve();
          return;
        }
        if (!historyLoaded) {
          resolve();
          return;
        }

        void (async () => {
          try {
            const res = await fetch(`${apiBase}/api/messages?around=${encodeURIComponent(targetId)}&limit=50`, {
              headers: { 'x-room-id': roomId },
            });
            if (res.ok) {
              const data = await res.json();
              const rawBatch = Array.isArray(data.messages) ? data.messages : [];
              if (
                rawBatch.length > 0 &&
                rawBatch.some((m: any) => normalizeMessageId(m.id) === targetId || normalizeMessageId(m._id) === targetId)
              ) {
                const normalized = filterVisibleMessages(rawBatch.map(normalizeMessage));
                const deletedIds = new Set(normalized.filter((m) => m.isDeleted).map((m) => m.id));
                const patched = markDeletedReplyTargets(normalized, deletedIds);

                groupStartMessageIdsRef.current.clear();
                for (let i = 0; i < patched.length; i++) {
                  const current = patched[i];
                  const prev = i > 0 ? patched[i - 1] : null;
                  if (!prev || prev.type === 'system_notification' || prev.userId !== current.userId) {
                    groupStartMessageIdsRef.current.add(current.id);
                  }
                }

                setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
                firstItemIndexRef.current = INITIAL_FIRST_ITEM_INDEX;
                messagesRef.current = patched;
                setMessages(patched);
                setNewMessagesWhileScrolledUp(0);
                messageTailSnapshotRef.current = {
                  length: patched.length,
                  lastId: patched.length > 0 ? patched[patched.length - 1].id : null,
                };

                const oldest = patched.length > 0 ? data.oldestCreatedAt || getMessageCursor(patched[0]) : null;
                oldestLoadedAtRef.current = oldest;
                setOldestLoadedAt(oldest);

                const newest =
                  patched.length > 0 ? data.newestCreatedAt || getMessageCursor(patched[patched.length - 1]) : null;
                newestLoadedAtRef.current = newest;
                setNewestLoadedAt(newest);

                setHasMoreOlderMessages(Boolean(data.hasMoreOlder));
                hasMoreOlderMessagesRef.current = Boolean(data.hasMoreOlder);

                setHasMoreNewerMessages(Boolean(data.hasMoreNewer));
                hasMoreNewerMessagesRef.current = Boolean(data.hasMoreNewer);

                requestAnimationFrame(() => {
                  scrollToLoadedMessage(targetId, behavior, force);
                  resolve();
                });
                return;
              }
            }
          } catch (err) {
            quoteWarn('Fast jump-around failed, falling back to sequential loader', err);
          }

          let cursor = oldestLoadedAtRef.current;
          let hasMore = hasMoreOlderMessagesRef.current;
          let fetchedPages = 0;

          while (
            !messagesRef.current.some((m) => normalizeMessageId(m.id) === targetId) &&
            hasMore &&
            cursor &&
            fetchedPages < MAX_QUOTE_AUTO_LOAD_PAGES
          ) {
            if (isLoadingOlderRef.current) {
              await new Promise((res) => setTimeout(res, 80));
              cursor = oldestLoadedAtRef.current;
              hasMore = hasMoreOlderMessagesRef.current;
              continue;
            }

            isLoadingOlderRef.current = true;
            try {
              const result = await fetchAndPrependOlderMessages(cursor, 500);
              fetchedPages += 1;
              cursor = result.nextCursor;
              hasMore = result.hasMore;
            } catch (error) {
              console.error('Failed to auto-load quoted message history:', error);
              break;
            } finally {
              isLoadingOlderRef.current = false;
            }

            await new Promise((res) => setTimeout(res, 0));
          }

          requestAnimationFrame(() => {
            scrollToLoadedMessage(targetId, behavior, force);
            resolve();
          });
        })();
      });
    },
    [
      activeSearchQuery,
      apiBase,
      fetchAndPrependOlderMessages,
      filterVisibleMessages,
      firstItemIndexRef,
      getMessageCursor,
      groupStartMessageIdsRef,
      hasMoreNewerMessagesRef,
      hasMoreOlderMessagesRef,
      historyLoaded,
      isLoadingOlderRef,
      markDeletedReplyTargets,
      messageTailSnapshotRef,
      messagesRef,
      newestLoadedAtRef,
      normalizeMessage,
      oldestLoadedAtRef,
      quoteJumpReturnStackRef,
      resetSearch,
      resolveReplyNavigationTargetId,
      roomId,
      scrollToLoadedMessage,
      setActiveSearchQuery,
      setChatSearchQuery,
      setFirstItemIndex,
      setHasMoreNewerMessages,
      setHasMoreOlderMessages,
      setIsSearchActive,
      setMessages,
      setNewMessagesWhileScrolledUp,
      setNewestLoadedAt,
      setOldestLoadedAt,
    ]
  );

  // Reply preview alignment
  useEffect(() => {
    if (!replyingTo) return;
    const alignQuotedMessage = () => {
      const msgElement = findMessageElement(replyingTo.id);
      const container =
        (chatContainerRef.current?.querySelector('[data-virtuoso-scroller]') as HTMLElement) ||
        chatContainerRef.current;
      if (!msgElement || !container) return;
      const containerRect = container.getBoundingClientRect();
      const msgRect = msgElement.getBoundingClientRect();
      const margin = 20;

      if (msgRect.bottom > containerRect.bottom - margin) {
        container.scrollBy({ top: msgRect.bottom - containerRect.bottom + margin, behavior: 'auto' });
      } else if (msgRect.top < containerRect.top + margin) {
        container.scrollBy({ top: msgRect.top - containerRect.top - margin, behavior: 'auto' });
      }
    };

    const delays = [10, 50, 150, 320];
    const timers = delays.map((delay) => setTimeout(alignQuotedMessage, delay));
    return () => timers.forEach(clearTimeout);
  }, [replyingTo, chatContainerRef]);

  return {
    highlightMessage,
    scrollToLoadedMessage,
    resolveReplyNavigationTargetId,
    scrollToMessage,
  };
}
