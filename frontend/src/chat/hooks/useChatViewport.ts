import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { Message } from '../types';
import { isDesktopInteractionDevice, quoteLog } from '../constants';

const checkIsMobile = () =>
  typeof window !== 'undefined'
    ? window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches
    : false;

interface UseChatViewportProps {
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  inputOverlayRef: React.RefObject<HTMLDivElement | null>;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  messages?: Message[];
  historyLoaded?: boolean;
  messageTailSnapshotRef?: React.MutableRefObject<{ length: number; lastId: string | null }>;
  scrollAnchorRef?: React.MutableRefObject<{ id: string; top: number } | null>;
  previousScrollMetricsRef?: React.MutableRefObject<{ height: number; top: number } | null>;
}

export function useChatViewport({
  chatContainerRef,
  inputOverlayRef,
  messageInputRef,
  messages,
  historyLoaded,
  messageTailSnapshotRef,
  scrollAnchorRef,
  previousScrollMetricsRef,
}: UseChatViewportProps) {
  const [isMobileView, setIsMobileView] = useState(checkIsMobile);
  const [isDesktopInteraction, setIsDesktopInteraction] = useState(isDesktopInteractionDevice);
  const [isScrollToBottomVisible, setIsScrollToBottomVisible] = useState(false);
  const [newMessagesWhileScrolledUp, setNewMessagesWhileScrolledUp] = useState(0);

  const isAtBottomRef = useRef(true);
  const lastAtBottomStateRef = useRef(true);
  const hasInitialScrolled = useRef(false);
  const initialHistoryBottomStabilized = useRef(false);
  const suppressInitialBottomPinRef = useRef(false);

  const pendingBottomScrollTimeoutsRef = useRef<number[]>([]);
  const suppressProgrammaticScrollUntilRef = useRef<number>(0);
  const quoteJumpLockRef = useRef(false);
  const quoteJumpLockTimeoutRef = useRef<number | null>(null);
  const quoteJumpReturnStackRef = useRef<string[]>([]);

  const isVideoFullscreenSessionRef = useRef(false);
  const fullscreenScrollSnapshotRef = useRef<{
    messageId: string;
    scrollTop: number;
    bottomOffset: number;
    clientHeight: number;
  } | null>(null);

  const resizeRafRef = useRef<number>(0);
  const lastInputHeightRef = useRef<number>(0);
  const lastInputValueLengthRef = useRef<number>(0);
  const skipNextInputLayoutSyncRef = useRef(false);
  const stableViewportHeightRef = useRef<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const stableViewportWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 400);
  const appliedViewportHeightRef = useRef<number>(0);

  // Desktop interaction detection
  useEffect(() => {
    const media = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    if (!media) return;
    const update = () => setIsDesktopInteraction(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  // Resize listener for mobile view
  useEffect(() => {
    const handleResize = () => setIsMobileView(checkIsMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile Visual Viewport Tracker (Keyboard + URL bar Fix)
  useEffect(() => {
    const applyAppHeight = (nextHeight: number | null) => {
      if (nextHeight === null) {
        document.documentElement.style.removeProperty('--app-height');
        appliedViewportHeightRef.current = 0;
        return;
      }
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      const rounded = Math.round(nextHeight);
      if (Math.abs(rounded - appliedViewportHeightRef.current) < 1) return;
      appliedViewportHeightRef.current = rounded;
      document.documentElement.style.setProperty('--app-height', `${rounded}px`);
    };

    const getVisibleViewportHeight = () => {
      const vvHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const layoutHeight = window.innerHeight;
      const clamped = Math.min(layoutHeight, vvHeight);
      return Number.isFinite(clamped) && clamped > 0 ? clamped : layoutHeight;
    };

    const updateStableViewportBaseline = () => {
      stableViewportWidthRef.current = window.innerWidth;
      const newHeight = getVisibleViewportHeight();
      stableViewportHeightRef.current = newHeight;
      applyAppHeight(newHeight);
    };

    const handleViewportResize = () => {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
      const visibleHeight = getVisibleViewportHeight();

      const widthDelta = Math.abs(window.innerWidth - stableViewportWidthRef.current);
      if (widthDelta > 40) {
        stableViewportWidthRef.current = window.innerWidth;
      }

      const vvOffsetTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
      applyAppHeight(visibleHeight);

      if (isIOS) {
        document.documentElement.style.setProperty('--app-offset-top', `${vvOffsetTop}px`);
      } else {
        document.documentElement.style.setProperty('--app-offset-top', '0px');
      }

      if (window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
    };

    const handleViewportScroll = () => {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
      if (isIOS) {
        const vvOffsetTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
        document.documentElement.style.setProperty('--app-offset-top', `${vvOffsetTop}px`);
      }
      if (window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
    };

    updateStableViewportBaseline();
    handleViewportResize();

    const pollInterval = window.setInterval(handleViewportResize, 150);
    const pollStopTimer = window.setTimeout(() => {
      window.clearInterval(pollInterval);
    }, 3500);

    const rafId = requestAnimationFrame(handleViewportResize);
    const timer1 = setTimeout(handleViewportResize, 100);
    const timer2 = setTimeout(handleViewportResize, 350);
    const timer3 = setTimeout(handleViewportResize, 800);
    const timer4 = setTimeout(handleViewportResize, 1600);

    window.addEventListener('touchstart', handleViewportResize, { passive: true });
    window.addEventListener('touchend', handleViewportResize, { passive: true });
    window.addEventListener('pointerdown', handleViewportResize, { passive: true });

    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('scroll', handleViewportScroll);
    window.addEventListener('scroll', handleViewportScroll, { passive: false });
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', handleViewportResize);
    window.addEventListener('focus', handleViewportResize);
    document.addEventListener('visibilitychange', handleViewportResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      try {
        resizeObserver = new ResizeObserver(() => {
          handleViewportResize();
        });
        resizeObserver.observe(document.documentElement);
      } catch {
        /* ignore */
      }
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      window.clearInterval(pollInterval);
      window.clearTimeout(pollStopTimer);
      resizeObserver?.disconnect();
      document.documentElement.style.removeProperty('--app-height');
      document.documentElement.style.removeProperty('--app-offset-top');
      window.removeEventListener('touchstart', handleViewportResize);
      window.removeEventListener('touchend', handleViewportResize);
      window.removeEventListener('pointerdown', handleViewportResize);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleViewportScroll);
      window.removeEventListener('scroll', handleViewportScroll);
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', handleViewportResize);
      window.removeEventListener('focus', handleViewportResize);
      document.removeEventListener('visibilitychange', handleViewportResize);
    };
  }, []);

  const getChatScrollerElement = useCallback((): HTMLElement | null => {
    if (!chatContainerRef.current) return null;
    return (
      (chatContainerRef.current.querySelector('[data-virtuoso-scroller]') as HTMLElement | null) ||
      chatContainerRef.current
    );
  }, [chatContainerRef]);

  const shouldSuppressProgrammaticScroll = useCallback((): boolean => {
    return (
      isVideoFullscreenSessionRef.current ||
      quoteJumpLockRef.current ||
      performance.now() < suppressProgrammaticScrollUntilRef.current
    );
  }, []);

  const clearPendingBottomScrollTimers = useCallback(() => {
    if (pendingBottomScrollTimeoutsRef.current.length === 0) return;
    pendingBottomScrollTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    pendingBottomScrollTimeoutsRef.current = [];
  }, []);

  const scheduleProgrammaticScrollSuppression = useCallback((durationMs: number) => {
    const until = performance.now() + Math.max(0, durationMs);
    suppressProgrammaticScrollUntilRef.current = Math.max(
      suppressProgrammaticScrollUntilRef.current,
      until
    );
  }, []);

  const engageQuoteJumpLock = useCallback((durationMs: number) => {
    quoteJumpLockRef.current = true;
    if (quoteJumpLockTimeoutRef.current !== null) {
      window.clearTimeout(quoteJumpLockTimeoutRef.current);
      quoteJumpLockTimeoutRef.current = null;
    }
    quoteJumpLockTimeoutRef.current = window.setTimeout(() => {
      quoteJumpLockRef.current = false;
      quoteJumpLockTimeoutRef.current = null;
    }, Math.max(0, durationMs));
  }, []);

  const clearQuoteJumpSuppression = useCallback(() => {
    quoteJumpLockRef.current = false;
    if (quoteJumpLockTimeoutRef.current !== null) {
      window.clearTimeout(quoteJumpLockTimeoutRef.current);
      quoteJumpLockTimeoutRef.current = null;
    }
    suppressProgrammaticScrollUntilRef.current = 0;
  }, []);

  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'auto', force = false) => {
      if (!force && shouldSuppressProgrammaticScroll()) return;
      const applyScrollerBottom = () => {
        if (!force && shouldSuppressProgrammaticScroll()) return;
        const scroller = getChatScrollerElement();
        if (!scroller) return;
        try {
          scroller.scrollTo({ top: scroller.scrollHeight, behavior });
        } catch {
          if (behavior === 'auto') {
            scroller.scrollTop = scroller.scrollHeight;
          }
        }
        if (behavior === 'auto') {
          scroller.scrollTop = scroller.scrollHeight;
        }
        quoteLog('scrollToBottom applyScrollerBottom', {
          scrollTop: scroller.scrollTop,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
        });
      };

      const scroller = chatContainerRef.current;
      if (scroller && behavior === 'auto') {
        scroller.scrollTop = scroller.scrollHeight;
      }
      requestAnimationFrame(applyScrollerBottom);
    },
    [chatContainerRef, getChatScrollerElement, shouldSuppressProgrammaticScroll]
  );

  const syncBottomStateFromScroller = useCallback(() => {
    const scroller = getChatScrollerElement();
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    const atBottom = distanceFromBottom <= 2;
    isAtBottomRef.current = atBottom;
    lastAtBottomStateRef.current = atBottom;
    setIsScrollToBottomVisible(!atBottom);
    if (atBottom) {
      setNewMessagesWhileScrolledUp(0);
      quoteJumpReturnStackRef.current = [];
    }
  }, [getChatScrollerElement]);

  const forceScrollToBottomAsync = useCallback(
    (allowDuringSuppression = false) => {
      clearPendingBottomScrollTimers();
      if (!allowDuringSuppression && shouldSuppressProgrammaticScroll()) return;

      scrollToBottom('auto', true);
      const delays = [50, 200, 450];
      pendingBottomScrollTimeoutsRef.current = delays.map((delay) =>
        window.setTimeout(() => {
          if (!allowDuringSuppression && shouldSuppressProgrammaticScroll()) return;
          scrollToBottom('auto', true);
        }, delay)
      );
    },
    [clearPendingBottomScrollTimers, scrollToBottom, shouldSuppressProgrammaticScroll]
  );

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    if (quoteJumpLockRef.current) {
      isAtBottomRef.current = false;
      if (lastAtBottomStateRef.current !== false) {
        lastAtBottomStateRef.current = false;
        setIsScrollToBottomVisible(true);
      }
      return;
    }

    isAtBottomRef.current = atBottom;

    const isInProgrammaticScroll = performance.now() < suppressProgrammaticScrollUntilRef.current;
    if (!isInProgrammaticScroll && lastAtBottomStateRef.current !== atBottom) {
      lastAtBottomStateRef.current = atBottom;
      setIsScrollToBottomVisible(!atBottom);
    }

    if (!atBottom) {
      suppressInitialBottomPinRef.current = true;
    }
    if (atBottom) {
      setNewMessagesWhileScrolledUp(0);
      quoteJumpReturnStackRef.current = [];
    }
  }, []);

  // Video fullscreen exit → restore scroll position
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) return;

      if (document.activeElement instanceof HTMLVideoElement) {
        document.activeElement.blur();
      }

      if (!isVideoFullscreenSessionRef.current) return;
      isVideoFullscreenSessionRef.current = false;

      clearPendingBottomScrollTimers();
      scheduleProgrammaticScrollSuppression(700);

      const snapshot = fullscreenScrollSnapshotRef.current;
      fullscreenScrollSnapshotRef.current = null;
      if (!snapshot) return;

      const restoreScroll = () => {
        const scroller = getChatScrollerElement();
        if (!scroller) return;

        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const wasAtBottom = snapshot.bottomOffset - snapshot.clientHeight <= 20;

        if (wasAtBottom) {
          scroller.scrollTop = maxTop;
        } else {
          const target = snapshot.scrollTop;
          const clamped = Math.max(0, Math.min(target, maxTop));
          scroller.scrollTop = clamped;
        }
      };

      setTimeout(restoreScroll, 50);
      setTimeout(restoreScroll, 500);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [clearPendingBottomScrollTimers, getChatScrollerElement, scheduleProgrammaticScrollSuppression]);

  const handleVideoFullscreenEnter = useCallback((messageId: string) => {
    const scroller = getChatScrollerElement();
    if (!scroller) return;

    const scrollTop = scroller.scrollTop;
    isVideoFullscreenSessionRef.current = true;
    fullscreenScrollSnapshotRef.current = {
      messageId,
      scrollTop,
      bottomOffset: scroller.scrollHeight - scrollTop,
      clientHeight: scroller.clientHeight,
    };

    clearPendingBottomScrollTimers();
    scheduleProgrammaticScrollSuppression(1200);
  }, [clearPendingBottomScrollTimers, getChatScrollerElement, scheduleProgrammaticScrollSuppression]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (!messages || !messageTailSnapshotRef) return;
    const currentLength = messages.length;
    const currentLastId = currentLength > 0 ? messages[currentLength - 1].id : null;
    const prevSnapshot = messageTailSnapshotRef.current;

    if (!historyLoaded) {
      messageTailSnapshotRef.current = { length: currentLength, lastId: currentLastId };
      return;
    }

    if (currentLength > prevSnapshot.length && prevSnapshot.length > 0) {
      const hasPendingBottomScroll = pendingBottomScrollTimeoutsRef.current.length > 0;
      if (isAtBottomRef.current || hasPendingBottomScroll) {
        forceScrollToBottomAsync(true);
      }
    }

    messageTailSnapshotRef.current = { length: currentLength, lastId: currentLastId };
  }, [historyLoaded, messages, forceScrollToBottomAsync, messageTailSnapshotRef]);

  // Initial scroll to bottom
  useLayoutEffect(() => {
    if (!messages) return;
    if (messages.length > 0 && !hasInitialScrolled.current) {
      hasInitialScrolled.current = true;
      const scroller = chatContainerRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
  }, [messages, chatContainerRef]);

  // Initial history bottom stabilization
  useEffect(() => {
    if (!historyLoaded) return;
    if (initialHistoryBottomStabilized.current) return;
    initialHistoryBottomStabilized.current = true;

    const timer = setTimeout(() => {
      if (shouldSuppressProgrammaticScroll()) return;
      if (suppressInitialBottomPinRef.current) return;
      const scroller = chatContainerRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, 300);

    return () => clearTimeout(timer);
  }, [historyLoaded, shouldSuppressProgrammaticScroll, chatContainerRef]);

  // Scroll anchor / metrics correction
  useLayoutEffect(() => {
    if (!messages || !chatContainerRef.current) return;
    const scroller = chatContainerRef.current;
    if (scrollAnchorRef?.current) {
      const { id, top: beforeTop } = scrollAnchorRef.current;
      scrollAnchorRef.current = null;
      const el = document.getElementById(id);
      if (el) {
        const afterTop = el.getBoundingClientRect().top;
        const diff = afterTop - beforeTop;
        if (diff !== 0) {
          scroller.scrollTop += diff;
        }
        return;
      }
    }

    if (previousScrollMetricsRef?.current) {
      const metrics = previousScrollMetricsRef.current;
      previousScrollMetricsRef.current = null;
      const heightDiff = scroller.scrollHeight - metrics.height;
      if (heightDiff > 0) {
        scroller.scrollTop = metrics.top + heightDiff;
      }
    }
  }, [messages, chatContainerRef, previousScrollMetricsRef, scrollAnchorRef]);

  const syncInputOverlayScroll = useCallback(() => {
    if (!messageInputRef.current || !inputOverlayRef.current) return;
    inputOverlayRef.current.scrollTop = messageInputRef.current.scrollTop;
    inputOverlayRef.current.scrollLeft = messageInputRef.current.scrollLeft;
  }, [messageInputRef, inputOverlayRef]);

  const resetInputLayerHeight = useCallback(() => {
    const textarea = messageInputRef.current;
    const overlay = inputOverlayRef.current;

    cancelAnimationFrame(resizeRafRef.current);
    lastInputHeightRef.current = 0;

    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.overflowY = 'hidden';
      textarea.scrollTop = 0;
      textarea.scrollLeft = 0;
    }

    if (overlay) {
      overlay.style.height = 'auto';
      overlay.style.overflowY = 'hidden';
      overlay.scrollTop = 0;
      overlay.scrollLeft = 0;
    }
  }, [messageInputRef, inputOverlayRef]);

  const syncInputLayerLayout = useCallback(
    (
      textarea: HTMLTextAreaElement | null = messageInputRef.current,
      value?: string,
      shouldMaintainBottom = true
    ) => {
      if (!textarea) return;

      const overlay = inputOverlayRef.current;
      const nextValue = value ?? textarea.value;
      const isShrinking = nextValue.length < lastInputValueLengthRef.current;

      const isShortSingleLine = !nextValue.includes('\n') && nextValue.length < 50;
      if (isShortSingleLine && lastInputHeightRef.current > 0 && lastInputHeightRef.current <= 48) {
        lastInputValueLengthRef.current = nextValue.length;
        return;
      }

      cancelAnimationFrame(resizeRafRef.current);
      const wasAtBottom = isAtBottomRef.current;

      resizeRafRef.current = requestAnimationFrame(() => {
        if (!nextValue) {
          resetInputLayerHeight();
          lastInputValueLengthRef.current = 0;
          return;
        }

        if (isShrinking) {
          textarea.style.height = 'auto';
          if (overlay) overlay.style.height = 'auto';
        }

        const nextHeight = Math.min(textarea.scrollHeight, 120);
        const nextHeightPx = `${nextHeight}px`;
        const nextOverflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';

        const previousHeight = lastInputHeightRef.current;
        if (previousHeight !== nextHeight || textarea.style.height !== nextHeightPx) {
          textarea.style.height = nextHeightPx;
          if (overlay) overlay.style.height = nextHeightPx;
          lastInputHeightRef.current = nextHeight;

          if (shouldMaintainBottom && wasAtBottom && nextHeight > previousHeight) {
            requestAnimationFrame(() => scrollToBottom('auto', true));
          }
        } else if (overlay) {
          overlay.style.height = nextHeightPx;
        }

        textarea.style.overflowY = nextOverflowY;
        if (overlay) overlay.style.overflowY = nextOverflowY;
        lastInputValueLengthRef.current = nextValue.length;
        syncInputOverlayScroll();
      });
    },
    [messageInputRef, inputOverlayRef, resetInputLayerHeight, scrollToBottom, syncInputOverlayScroll]
  );

  return {
    isMobileView,
    setIsMobileView,
    isDesktopInteraction,
    setIsDesktopInteraction,
    isScrollToBottomVisible,
    setIsScrollToBottomVisible,
    newMessagesWhileScrolledUp,
    setNewMessagesWhileScrolledUp,
    isAtBottomRef,
    lastAtBottomStateRef,
    hasInitialScrolled,
    initialHistoryBottomStabilized,
    suppressInitialBottomPinRef,
    pendingBottomScrollTimeoutsRef,
    suppressProgrammaticScrollUntilRef,
    quoteJumpLockRef,
    quoteJumpLockTimeoutRef,
    quoteJumpReturnStackRef,
    isVideoFullscreenSessionRef,
    fullscreenScrollSnapshotRef,
    skipNextInputLayoutSyncRef,
    stableViewportHeightRef,
    getChatScrollerElement,
    shouldSuppressProgrammaticScroll,
    clearPendingBottomScrollTimers,
    scheduleProgrammaticScrollSuppression,
    engageQuoteJumpLock,
    clearQuoteJumpSuppression,
    scrollToBottom,
    syncBottomStateFromScroller,
    forceScrollToBottomAsync,
    handleAtBottomStateChange,
    handleVideoFullscreenEnter,
    syncInputOverlayScroll,
    resetInputLayerHeight,
    syncInputLayerLayout,
  };
}
