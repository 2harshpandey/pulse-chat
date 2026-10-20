import React, { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useDrag } from '@use-gesture/react';
import type { Message } from '../../types';
import { LONG_PRESS_CANCEL_MOVE_PX } from '../../constants';

interface UseMessageGesturesParams {
  msg: Message;
  isMobileView: boolean;
  isSelectModeActive: boolean;
  handleSetReply: (message: Message) => void;
  handleToggleSelectMessage: (messageId: string) => void;
}

export function useMessageGestures({
  msg,
  isMobileView,
  isSelectModeActive,
  handleSetReply,
  handleToggleSelectMessage,
}: UseMessageGesturesParams) {
  const messageRowRef = useRef<HTMLDivElement>(null!);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeTransitionResetTimerRef = useRef<number | null>(null);
  const wasLongPressed = useRef(false);
  const lastSelectModeExitTimeRef = useRef(0);
  const isSelectModeActiveRef = useRef(isSelectModeActive);

  useEffect(() => {
    if (!isSelectModeActive && isSelectModeActiveRef.current) {
      lastSelectModeExitTimeRef.current = Date.now();
    }
    isSelectModeActiveRef.current = isSelectModeActive;
  }, [isSelectModeActive]);

  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressTapSelectionRef = useRef(false);
  const ignoreSwipeGestureRef = useRef(false);
  const swipeOffsetRef = useRef(0);

  const resetSwipePosition = useCallback((animate: boolean) => {
    if (!messageRowRef.current) return;
    swipeOffsetRef.current = 0;
    if (swipeTransitionResetTimerRef.current !== null) {
      window.clearTimeout(swipeTransitionResetTimerRef.current);
      swipeTransitionResetTimerRef.current = null;
    }

    messageRowRef.current.style.transform = 'translateX(0px)';
    messageRowRef.current.style.transition = animate ? 'transform 0.2s ease-out' : 'none';

    if (animate) {
      swipeTransitionResetTimerRef.current = window.setTimeout(() => {
        if (!messageRowRef.current) return;
        messageRowRef.current.style.transition = 'none';
        swipeTransitionResetTimerRef.current = null;
      }, 220);
    }
  }, []);

  const isSwipeQuoteIgnoredTarget = useCallback((target: HTMLElement) => {
    if (target.closest('[data-allow-quote-swipe]')) return false;
    return Boolean(
      target.closest('[data-quote-swipe-ignore]') ||
      target.closest('button, a, input, textarea, [contenteditable="true"]')
    );
  }, []);

  useDrag(
    ({ active, movement: [mx, my], last, tap, first, event }) => {
      const target = event.target as HTMLElement;

      if (first) {
        ignoreSwipeGestureRef.current = isSwipeQuoteIgnoredTarget(target);
      }

      if (ignoreSwipeGestureRef.current) {
        if (last) {
          ignoreSwipeGestureRef.current = false;
          if (swipeOffsetRef.current > 0) {
            resetSwipePosition(true);
          }
        }
        return;
      }

      // If a drag gesture is active (i.e., user is scrolling), cancel the long-press timer.
      if (active && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        suppressTapSelectionRef.current = true;
      }

      if (tap) {
        // If the tap was on the MobileReactionPicker, ignore it completely.
        if (target.closest('.mobile-reaction-picker')) {
          return;
        }

        // Ignore synthetic tap events that are actually part of a scroll gesture.
        if (suppressTapSelectionRef.current) {
          suppressTapSelectionRef.current = false;
          return;
        }

        // If this 'tap' is the end of a long press, reset the flag and do nothing.
        if (wasLongPressed.current) {
          wasLongPressed.current = false;
          return;
        }

        // Otherwise, if it's a genuine tap in select mode, toggle the selection.
        if (isSelectModeActive) {
          if (target.closest('[data-checkbox]')) {
            return;
          }
          handleToggleSelectMessage(msg.id);
          return;
        }
      }

      // When a gesture ends as a drag (not a tap), clean up refs so the next tap starts fresh.
      if (last && !tap) {
        wasLongPressed.current = false;
        suppressTapSelectionRef.current = false;
        ignoreSwipeGestureRef.current = false;
      }

      // Always restore the row position at the end of any gesture.
      if (last && swipeOffsetRef.current > 0) {
        resetSwipePosition(true);
      }

      if (!isMobileView || isSelectModeActive || !messageRowRef.current) {
        return;
      }

      const isHorizontalGesture = Math.abs(mx) > Math.abs(my);

      if (last) {
        if (isHorizontalGesture && mx > 70) {
          handleSetReply(msg);
        }
        return;
      }

      if (!active) {
        return;
      }

      if (!isHorizontalGesture || mx <= 0) {
        if (swipeOffsetRef.current > 0) {
          resetSwipePosition(false);
        }
        return;
      }

      const newX = Math.min(Math.max(mx, 0), 80);
      if (newX === swipeOffsetRef.current) {
        return;
      }
      swipeOffsetRef.current = newX;
      messageRowRef.current.style.transform = `translateX(${newX}px)`;
      messageRowRef.current.style.transition = 'none';
    },
    {
      filterTaps: true,
      eventOptions: { passive: true },
      target: messageRowRef,
      drag: { threshold: 10, axis: 'x' },
    }
  );

  // Reset gesture refs when recycled for a different message
  const prevMsgIdRef = useRef(msg.id);
  useLayoutEffect(() => {
    if (prevMsgIdRef.current !== msg.id) {
      prevMsgIdRef.current = msg.id;
      wasLongPressed.current = false;
      suppressTapSelectionRef.current = false;
      ignoreSwipeGestureRef.current = false;
      touchStartPointRef.current = null;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      resetSwipePosition(false);
    }
  }, [msg.id, resetSwipePosition]);

  useEffect(() => {
    return () => {
      if (swipeTransitionResetTimerRef.current !== null) {
        window.clearTimeout(swipeTransitionResetTimerRef.current);
        swipeTransitionResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isSelectModeActive) {
      wasLongPressed.current = false;
      suppressTapSelectionRef.current = false;
      ignoreSwipeGestureRef.current = false;
    }
  }, [isSelectModeActive]);

  const isLongPressIgnoredTarget = useCallback((target: HTMLElement) => {
    return Boolean(
      target.closest('.mobile-reaction-picker') ||
      target.closest('[data-quote-swipe-ignore]') ||
      target.closest('button, a, input, textarea, [contenteditable="true"]')
    );
  }, []);

  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isMobileView || !('touches' in e)) {
      return;
    }

    const target = e.target as HTMLElement;
    if (isLongPressIgnoredTarget(target)) {
      return;
    }

    if (e.touches.length !== 1) {
      return;
    }

    const touch = e.touches[0];
    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    suppressTapSelectionRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressTimerRef.current = setTimeout(() => {
      if (!suppressTapSelectionRef.current) {
        handleToggleSelectMessage(msg.id);
        wasLongPressed.current = true;
      }
    }, 500);
  };

  const handleLongPressMove = (e: React.TouchEvent) => {
    if (!touchStartPointRef.current || e.touches.length === 0) {
      return;
    }

    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPointRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPointRef.current.y);

    if (dx > LONG_PRESS_CANCEL_MOVE_PX || dy > LONG_PRESS_CANCEL_MOVE_PX) {
      suppressTapSelectionRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPointRef.current = null;
  };

  const handleLongPressCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPointRef.current = null;
    suppressTapSelectionRef.current = true;
    resetSwipePosition(true);
  };

  return {
    messageRowRef,
    wasLongPressed,
    lastSelectModeExitTimeRef,
    resetSwipePosition,
    handleLongPressStart,
    handleLongPressMove,
    handleLongPressEnd,
    handleLongPressCancel,
  };
}
