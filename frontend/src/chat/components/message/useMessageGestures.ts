import React, { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useDrag } from '@use-gesture/react';
import type { Message } from '../../types';
import { LONG_PRESS_CANCEL_MOVE_PX, LONG_PRESS_DURATION_MS } from '../../constants';
import { onChatScroll, isChatActivelyScrolling } from '../../chatScrollState';

/** Returns true if the virtual keyboard is likely open (visualViewport shrunk vs full layout height). */
function isVirtualKeyboardOpen(): boolean {
  if (typeof window === 'undefined') return false;
  const vvHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  // Keyboard is considered open when visible area is >96px shorter than the full layout height
  return (window.innerHeight - vvHeight) > 96;
}


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
  const lastLongPressTriggerTimeRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isSelectModeActiveRef = useRef(isSelectModeActive);

  useEffect(() => {
    if (!isSelectModeActive && isSelectModeActiveRef.current) {
      lastSelectModeExitTimeRef.current = Date.now();
    }
    isSelectModeActiveRef.current = isSelectModeActive;
  }, [isSelectModeActive]);

  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressTapSelectionRef = useRef(false);
  const isScrollGestureRef = useRef(false);
  const ignoreSwipeGestureRef = useRef(false);
  const swipeOffsetRef = useRef(0);
  // Tracks the focused input element at the moment a long-press starts,
  // so we can restore keyboard focus after the state update dismisses it.
  const activeInputAtLongPressRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return onChatScroll(() => {
      // Whenever the chat container scrolls, immediately invalidate any active long-press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      isScrollGestureRef.current = true;
      suppressTapSelectionRef.current = true;
    });
  }, []);

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

  const triggerLongPress = useCallback(() => {
    if (wasLongPressed.current) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    wasLongPressed.current = true;
    lastLongPressTriggerTimeRef.current = Date.now();
    suppressTapSelectionRef.current = true;

    // Snapshot the currently-focused input before the state update causes a re-render
    // that may blur it (dismissing the virtual keyboard on mobile).
    const inputToRestore = activeInputAtLongPressRef.current;

    handleToggleSelectMessage(msg.id);

    // If a text input had focus when the long-press started, restore it after the browser
    // finishes its blur/focus cycle triggered by the React re-render. This keeps the virtual
    // keyboard visible. We use two nested rAFs to ensure we run after React has committed and
    // the browser has processed the resulting focus loss.
    if (inputToRestore) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            if (
              document.activeElement !== inputToRestore &&
              typeof (inputToRestore as any).focus === 'function'
            ) {
              (inputToRestore as any).focus({ preventScroll: true });
            }
          } catch (_) {}
        });
      });
    }

    // Provide immediate haptic feedback in exact synchronization with the reaction bar popup
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(35);
      } catch (_) {}
    }
  }, [msg.id, handleToggleSelectMessage]);

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

      // Only cancel the long-press timer if the user performs an intentional swipe or scroll movement
      const isHorizontalSwipe = Math.abs(mx) > Math.abs(my) && Math.abs(mx) > 10;
      const isLargeMovement = Math.hypot(mx, my) > LONG_PRESS_CANCEL_MOVE_PX || Math.abs(my) > 12;

      if (active && (isHorizontalSwipe || isLargeMovement) && longPressTimerRef.current) {
        isScrollGestureRef.current = true;
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        suppressTapSelectionRef.current = true;
      }

      if (tap) {
        // If the tap was on the MobileReactionPicker, ignore it completely and reset long-press flag.
        if (target.closest('.mobile-reaction-picker')) {
          wasLongPressed.current = false;
          return;
        }

        // Ignore synthetic tap events that are actually part of a scroll gesture.
        if (suppressTapSelectionRef.current) {
          suppressTapSelectionRef.current = false;
          return;
        }

        // If this 'tap' is the end of a long press, reset the flag and do nothing.
        if (wasLongPressed.current || Date.now() - lastLongPressTriggerTimeRef.current < 400) {
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
        if (Date.now() - lastLongPressTriggerTimeRef.current > 400) {
          wasLongPressed.current = false;
        }
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
      isScrollGestureRef.current = false;
      ignoreSwipeGestureRef.current = false;
      touchStartPointRef.current = null;
      touchStartTimeRef.current = 0;
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
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isSelectModeActive) {
      wasLongPressed.current = false;
      suppressTapSelectionRef.current = false;
      isScrollGestureRef.current = false;
      ignoreSwipeGestureRef.current = false;
    }
  }, [isSelectModeActive]);

  const isLongPressIgnoredTarget = useCallback((target: HTMLElement) => {
    return Boolean(
      target.closest('.mobile-reaction-picker') ||
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

    // Do not initiate long-press if the chat is actively scrolling or user is catching an active momentum scroll
    if (isChatActivelyScrolling(250)) {
      isScrollGestureRef.current = true;
      suppressTapSelectionRef.current = true;
      return;
    }

    // Snapshot the currently focused input so we can restore keyboard focus after long-press fires.
    // We only capture it when the keyboard is actually open to avoid unnecessary focus calls.
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      (focused.tagName === 'TEXTAREA' ||
        focused.tagName === 'INPUT' ||
        focused.isContentEditable) &&
      isVirtualKeyboardOpen()
    ) {
      activeInputAtLongPressRef.current = focused;
    } else {
      activeInputAtLongPressRef.current = null;
    }

    const touch = e.touches[0];
    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    touchStartTimeRef.current = Date.now();
    suppressTapSelectionRef.current = false;
    isScrollGestureRef.current = false;
    wasLongPressed.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressTimerRef.current = setTimeout(() => {
      if (!suppressTapSelectionRef.current && !isScrollGestureRef.current && !isChatActivelyScrolling(150)) {
        triggerLongPress();
      }
    }, LONG_PRESS_DURATION_MS);
  };

  const handleLongPressMove = (e: React.TouchEvent) => {
    if (wasLongPressed.current || isScrollGestureRef.current) {
      return;
    }

    if (!touchStartPointRef.current || e.touches.length === 0) {
      return;
    }

    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPointRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPointRef.current.y);
    const dist = Math.hypot(dx, dy);

    // If movement exceeds touch slop (12px radial, 10px horizontal, 10px vertical),
    // this gesture is an intentional scroll or swipe.
    // Permanently mark as a scroll gesture so keeping the finger stationary on screen
    // after scrolling will NEVER trigger a long-press!
    const isIntentionalMove = dist > LONG_PRESS_CANCEL_MOVE_PX || dx > 10 || dy > 10;

    if (isIntentionalMove) {
      isScrollGestureRef.current = true;
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

    // Resilient completion: only trigger if the user was holding still (NOT scrolling, NOT moving)
    // and held for nearly the full duration (>= 320ms)
    if (
      !wasLongPressed.current &&
      !suppressTapSelectionRef.current &&
      !isScrollGestureRef.current &&
      !isChatActivelyScrolling(250) &&
      touchStartTimeRef.current > 0
    ) {
      const elapsed = Date.now() - touchStartTimeRef.current;
      if (elapsed >= 320) {
        triggerLongPress();
      }
    }

    touchStartPointRef.current = null;
    touchStartTimeRef.current = 0;
    isScrollGestureRef.current = false;
    activeInputAtLongPressRef.current = null;
  };

  const handleLongPressCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPointRef.current = null;
    touchStartTimeRef.current = 0;
    isScrollGestureRef.current = true;
    suppressTapSelectionRef.current = true;
    activeInputAtLongPressRef.current = null;
    resetSwipePosition(true);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!isMobileView) return;
    // On mobile touch devices, the browser dispatches contextmenu on long press.
    // Suppress the default browser popup (Copy / Share / Select all).
    e.preventDefault();
    e.stopPropagation();

    // If long press hasn't fired yet and this was NOT a scroll or move, trigger immediately!
    if (
      !wasLongPressed.current &&
      !suppressTapSelectionRef.current &&
      !isScrollGestureRef.current &&
      !isChatActivelyScrolling(250)
    ) {
      triggerLongPress();
    }
  }, [isMobileView, triggerLongPress]);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Never intercept clicks on the mobile reaction picker or explicitly allowed click targets
    if (target.closest('.mobile-reaction-picker') || target.closest('[data-allow-click]')) {
      return;
    }

    // Suppress synthetic clicks that immediately follow exiting select mode or completing a long-press
    const recentlyExitedSelectMode = Date.now() - lastSelectModeExitTimeRef.current < 300;
    const recentlyLongPressed = Date.now() - lastLongPressTriggerTimeRef.current < 400;

    if (recentlyExitedSelectMode || recentlyLongPressed || wasLongPressed.current) {
      e.stopPropagation();
      e.preventDefault();
      wasLongPressed.current = false;
    }
  }, []);

  return {
    messageRowRef,
    wasLongPressed,
    lastSelectModeExitTimeRef,
    resetSwipePosition,
    handleLongPressStart,
    handleLongPressMove,
    handleLongPressEnd,
    handleLongPressCancel,
    handleContextMenu,
    handleClickCapture,
  };
}
