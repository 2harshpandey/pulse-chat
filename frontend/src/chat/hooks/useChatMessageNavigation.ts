import React, { useCallback, useEffect, useState } from 'react';
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
  isGroupStartMessage,
} from '../utils';
import { sendClientDiagnostic } from '../telemetry';

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
  const [isLocatingMessage, setIsLocatingMessage] = useState(false);

  // Highlight message helper
  const highlightMessage = useCallback((messageId: string) => {
    if (!messageId) return;
    const maxAttempts = 24;
    const attemptDelayMs = 60;

    const applyHighlight = (attempt: number) => {
      const element = findMessageElement(messageId);
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

  const checkIsFullyVisible = useCallback((element: HTMLElement, scroller: HTMLElement): boolean => {
    const containerRect = scroller.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) return false;

    const elRect = element.getBoundingClientRect();
    if (elRect.width === 0 && elRect.height === 0) return false;

    const bubble =
      (element.querySelector('[class*="MessageBubble"], [class*="MediaGroupContainer"]') as HTMLElement | null) ||
      element;
    const bubbleRect = bubble.getBoundingClientRect();

    const tolerance = 2; // subpixel rendering tolerance
    const isTopVisible = Math.min(elRect.top, bubbleRect.top) >= containerRect.top - tolerance;
    const isBottomVisible = Math.max(elRect.bottom, bubbleRect.bottom) <= containerRect.bottom + tolerance;

    if (bubbleRect.height > containerRect.height) {
      return bubbleRect.top <= containerRect.top + tolerance && bubbleRect.bottom >= containerRect.bottom - tolerance;
    }

    return isTopVisible && isBottomVisible;
  }, []);

  const scrollToLoadedMessage = useCallback(
    (messageId: string, behavior: 'auto' | 'smooth' = 'auto', force = false) => {
      const rawTargetId = normalizeMessageId(messageId);
      if (!rawTargetId) return false;

      // Find by id or _id in messagesRef.current
      const targetMsg = messagesRef.current.find(
        (m) => normalizeMessageId(m.id) === rawTargetId || normalizeMessageId(m._id) === rawTargetId
      );
      if (!targetMsg) return false;

      const targetId = normalizeMessageId(targetMsg.id) || rawTargetId;

      // 1. If element is already rendered and FULLY visible on screen:
      const immediateElement = findMessageElement(targetId) || findMessageElement(rawTargetId);
      const immediateScroller =
        (chatContainerRef.current?.querySelector('[data-virtuoso-scroller]') as HTMLElement | null) ||
        chatContainerRef.current;

      if (immediateElement && immediateScroller && checkIsFullyVisible(immediateElement, immediateScroller)) {
        highlightMessage(targetId);
        return true;
      }

      // 2. Element is not fully visible, so scroll is required:
      clearPendingBottomScrollTimers();
      engageQuoteJumpLock(2600);
      scheduleProgrammaticScrollSuppression(2600);
      lastAtBottomStateRef.current = false;
      isAtBottomRef.current = false;
      setIsScrollToBottomVisible(true);

      if (!force && shouldSuppressProgrammaticScroll()) return false;

      const ensureVisibleAndHighlight = (attempt: number) => {
        const element = findMessageElement(targetId) || findMessageElement(rawTargetId);
        const scroller =
          (chatContainerRef.current?.querySelector('[data-virtuoso-scroller]') as HTMLElement | null) ||
          chatContainerRef.current;

        if (!element || !scroller) {
          if (attempt < 25) window.setTimeout(() => ensureVisibleAndHighlight(attempt + 1), 40);
          return;
        }

        if (checkIsFullyVisible(element, scroller)) {
          highlightMessage(targetId);
          return;
        }

        const elRect = element.getBoundingClientRect();
        const bubble =
          (element.querySelector('[class*="MessageBubble"], [class*="MediaGroupContainer"]') as HTMLElement | null) ||
          element;
        const bubbleRect = bubble.getBoundingClientRect();
        const containerRect = scroller.getBoundingClientRect();

        const topEdge = Math.min(elRect.top, bubbleRect.top);
        const bottomEdge = Math.max(elRect.bottom, bubbleRect.bottom);
        const totalHeight = bottomEdge - topEdge;
        const margin = 16;

        const isPartiallyVisible =
          topEdge < containerRect.bottom && bottomEdge > containerRect.top;

        if (isPartiallyVisible) {
          if (totalHeight > containerRect.height - 2 * margin || topEdge < containerRect.top + margin) {
            scroller.scrollBy({ top: topEdge - containerRect.top - margin, behavior });
          } else if (bottomEdge > containerRect.bottom - margin) {
            scroller.scrollBy({ top: bottomEdge - containerRect.bottom + margin, behavior });
          }
        } else {
          // Robust container scroll positioning
          const targetScrollTop =
            topEdge - containerRect.top + scroller.scrollTop - Math.max(0, (containerRect.height - totalHeight) / 2);
          scroller.scrollTo({ top: Math.max(0, targetScrollTop), behavior });
          element.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
        }

        highlightMessage(targetId);
      };

      requestAnimationFrame(() => ensureVisibleAndHighlight(0));
      return true;
    },
    [
      chatContainerRef,
      checkIsFullyVisible,
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
      const candidateIds = [
        directRequested,
        normalizeMessageId(replyingToPayload?.id),
        normalizeMessageId(replyingToPayload?.messageId),
        normalizeMessageId(replyingToPayload?._id),
        normalizeMessageId(replyingToPayload?.clientTempId),
      ].filter(Boolean);

      for (const candidate of candidateIds) {
        if (sourceId && candidate === sourceId) continue;
        const inMemory = messagesRef.current.find(
          (m) =>
            normalizeMessageId(m.id) === candidate ||
            normalizeMessageId(m._id) === candidate ||
            normalizeMessageId((m as any).clientTempId) === candidate
        );
        if (inMemory) {
          return normalizeMessageId(inMemory.id) || candidate;
        }
      }

      return directRequested;
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
        const immediateElement = findMessageElement(targetId);
        const immediateScroller =
          (chatContainerRef.current?.querySelector('[data-virtuoso-scroller]') as HTMLElement | null) ||
          chatContainerRef.current;
        const alreadyFullyVisible =
          immediateElement && immediateScroller ? checkIsFullyVisible(immediateElement, immediateScroller) : false;

        if (!alreadyFullyVisible) {
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
      }

      setIsLocatingMessage(true);
      sendClientDiagnostic('quote_jump_to_message', { targetId, sourceId });
      return new Promise<void>((resolve) => {
        const finish = () => {
          setIsLocatingMessage(false);
          resolve();
        };

        if (!targetId) {
          finish();
          return;
        }
        if (scrollToLoadedMessage(targetId, behavior, force)) {
          requestAnimationFrame(() => finish());
          return;
        }
        if (!historyLoaded) {
          finish();
          return;
        }

        // Guard: Do not attempt to load history for in-flight temporary upload IDs (e.g. 1782315628560_0)
        const isTemporaryUploadId = /^\d+_\d+$/.test(targetId);
        const isUploadingLocally = messagesRef.current.some(
          (m) =>
            (normalizeMessageId(m.id) === targetId || normalizeMessageId((m as any).clientTempId) === targetId) &&
            m.isUploading
        );
        if (isTemporaryUploadId || isUploadingLocally) {
          quoteWarn('Target message is an in-flight temporary upload ID that cannot exist in server history:', targetId);
          finish();
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
                  if (isGroupStartMessage(current, prev)) {
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
                  finish();
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
            !messagesRef.current.some(
              (m) => normalizeMessageId(m.id) === targetId || normalizeMessageId(m._id) === targetId
            ) &&
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
            finish();
          });
        })();
      });
    },
    [
      activeSearchQuery,
      apiBase,
      chatContainerRef,
      checkIsFullyVisible,
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
    isLocatingMessage,
  };
}
