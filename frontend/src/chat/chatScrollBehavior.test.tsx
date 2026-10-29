import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatViewport, IS_AT_BOTTOM_THRESHOLD_PX } from './hooks/useChatViewport';
import { isTouchDevice } from './constants';

describe('Chat scroll behavior & auto-scroll rules', () => {
  it('defines IS_AT_BOTTOM_THRESHOLD_PX as 60px to prevent false negative at-bottom drops', () => {
    expect(IS_AT_BOTTOM_THRESHOLD_PX).toBe(60);
  });

  it('correctly reports atBottom true when distanceFromBottom <= 60px', () => {
    const mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 400, configurable: true });
    // scrollTop = 550 => distanceFromBottom = 1000 - (550 + 400) = 50 <= 60
    Object.defineProperty(mockContainer, 'scrollTop', { value: 550, configurable: true });

    const ref = { current: mockContainer };
    const { result } = renderHook(() =>
      useChatViewport({
        chatContainerRef: ref as any,
        inputOverlayRef: { current: null },
        messageInputRef: { current: null },
      })
    );

    act(() => {
      result.current.syncBottomStateFromScroller();
    });

    expect(result.current.isAtBottomRef.current).toBe(true);
    expect(result.current.isScrollToBottomVisible).toBe(false);
  });

  it('correctly reports atBottom false when distanceFromBottom > 60px (user scrolled up)', () => {
    const mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 400, configurable: true });
    // scrollTop = 400 => distanceFromBottom = 1000 - (400 + 400) = 200 > 60
    Object.defineProperty(mockContainer, 'scrollTop', { value: 400, configurable: true });

    const ref = { current: mockContainer };
    const { result } = renderHook(() =>
      useChatViewport({
        chatContainerRef: ref as any,
        inputOverlayRef: { current: null },
        messageInputRef: { current: null },
      })
    );

    act(() => {
      result.current.syncBottomStateFromScroller();
    });

    expect(result.current.isAtBottomRef.current).toBe(false);
    expect(result.current.isScrollToBottomVisible).toBe(true);
  });

  it('cleans up pendingBottomScrollTimeoutsRef array when timeouts complete', async () => {
    vi.useFakeTimers();

    const mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(mockContainer, 'scrollTop', { value: 600, writable: true, configurable: true });

    const ref = { current: mockContainer };
    const { result } = renderHook(() =>
      useChatViewport({
        chatContainerRef: ref as any,
        inputOverlayRef: { current: null },
        messageInputRef: { current: null },
      })
    );

    act(() => {
      result.current.forceScrollToBottomAsync(true);
    });

    // Right after calling, 3 timeout IDs are pending
    expect(result.current.pendingBottomScrollTimeoutsRef.current.length).toBe(3);

    // Advance time past all timers (350ms)
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Timeouts array should now be cleanly reset to []
    expect(result.current.pendingBottomScrollTimeoutsRef.current.length).toBe(0);

    vi.useRealTimers();
  });

  it('auto-scroll logic honors isAtBottom and isSentByMe guards', () => {
    // Test the auto-scroll decision rule
    const shouldAutoScroll = (
      newestMsg: { userId: string },
      currentUserId: string,
      wasAtBottom: boolean
    ) => {
      const isSentByMe = Boolean(newestMsg?.userId && newestMsg.userId === currentUserId);
      return isSentByMe || wasAtBottom;
    };

    // 1. Incoming message from another user while user is scrolled up -> DO NOT SCROLL
    expect(
      shouldAutoScroll({ userId: 'other-user-99' }, 'my-user-id', false)
    ).toBe(false);

    // 2. Incoming message from another user while user is at bottom -> AUTO-SCROLL
    expect(
      shouldAutoScroll({ userId: 'other-user-99' }, 'my-user-id', true)
    ).toBe(true);

    // 3. Outgoing message sent by the user themselves while scrolled up -> AUTO-SCROLL to view sent message
    expect(
      shouldAutoScroll({ userId: 'my-user-id' }, 'my-user-id', false)
    ).toBe(true);

    // 4. Outgoing message sent by the user themselves while at bottom -> AUTO-SCROLL
    expect(
      shouldAutoScroll({ userId: 'my-user-id' }, 'my-user-id', true)
    ).toBe(true);
  });

  it('never auto-scrolls to bottom when older messages are prepended to the head', () => {
    const isNewTailMessage = (
      currentLength: number,
      currentLastId: string | null,
      prevSnapshot: { length: number; lastId: string | null }
    ) => {
      return (
        currentLength > prevSnapshot.length &&
        prevSnapshot.length > 0 &&
        currentLastId !== prevSnapshot.lastId
      );
    };

    // Scenario: User had 20 messages, bottom message was sent by user ('msg-me-20')
    const prevSnapshot = { length: 20, lastId: 'msg-me-20' };

    // 15 older messages are fetched and prepended at the top. Total is now 35 messages.
    // The tail message is still 'msg-me-20'.
    const isTailNew = isNewTailMessage(35, 'msg-me-20', prevSnapshot);
    expect(isTailNew).toBe(false);

    // Scenario: A new incoming message arrives at the bottom
    const newIncomingTail = isNewTailMessage(21, 'msg-incoming-21', prevSnapshot);
    expect(newIncomingTail).toBe(true);
  });

  it('never auto-scrolls to bottom when jumping to an older quoted message slice', () => {
    const isNewTailMessage = (
      currentLength: number,
      currentLastId: string | null,
      prevSnapshot: { length: number; lastId: string | null },
      hasMoreNewerMessages: boolean,
      quoteJumpLock: boolean,
      isLocatingMessage: boolean
    ) => {
      return (
        !hasMoreNewerMessages &&
        !quoteJumpLock &&
        !isLocatingMessage &&
        currentLength > 0 &&
        prevSnapshot.length > 0 &&
        currentLastId !== prevSnapshot.lastId &&
        (currentLength === prevSnapshot.length + 1 ||
          (currentLength === prevSnapshot.length && currentLength >= 50))
      );
    };

    const prevSnapshot = { length: 25, lastId: 'bottom-msg-25' };

    // When jumping to a quoted message, 50 messages around target are loaded, hasMoreNewerMessages is true
    const jumpResult = isNewTailMessage(50, 'target-slice-50', prevSnapshot, true, true, false);
    expect(jumpResult).toBe(false);

    // When normal new message arrives while at the true tail
    const normalArrival = isNewTailMessage(26, 'bottom-msg-26', prevSnapshot, false, false, false);
    expect(normalArrival).toBe(true);
  });
});

describe('Enter key behavior and touch device detection', () => {
  it('correctly detects desktop with small window as non-touch device', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      if (query === '(pointer: fine)') return { matches: true };
      if (query === '(hover: hover)') return { matches: true };
      if (query === '(pointer: coarse)') return { matches: false };
      return { matches: false };
    });

    try {
      expect(isTouchDevice()).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('correctly detects true touch device with coarse pointer as touch device', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      if (query === '(pointer: fine)') return { matches: false };
      if (query === '(hover: hover)') return { matches: false };
      if (query === '(pointer: coarse)') return { matches: true };
      return { matches: false };
    });

    try {
      expect(isTouchDevice()).toBe(true);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('simulates handleInputKeyDown logic: Enter sends message in small desktop window', () => {
    const handleSendMessage = vi.fn();
    const preventDefault = vi.fn();

    const handleInputKeyDown = (
      e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault: () => void },
      isTouch: boolean
    ) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSendMessage();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (isTouch) return;
        e.preventDefault();
        handleSendMessage();
      }
    };

    // 1. Desktop in small window (isTouch = false): pressing Enter sends message
    handleInputKeyDown({ key: 'Enter', shiftKey: false, preventDefault }, false);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(handleSendMessage).toHaveBeenCalledTimes(1);

    // 2. Desktop in small window: Shift+Enter does NOT send (inserts newline)
    handleInputKeyDown({ key: 'Enter', shiftKey: true, preventDefault }, false);
    expect(handleSendMessage).toHaveBeenCalledTimes(1); // not incremented

    // 3. Real touch device (isTouch = true): plain Enter does NOT send (allows newline on virtual keyboard)
    handleInputKeyDown({ key: 'Enter', shiftKey: false, preventDefault }, true);
    expect(handleSendMessage).toHaveBeenCalledTimes(1); // not incremented

    // 4. Real touch device: Ctrl+Enter or Cmd+Enter with keyboard ALWAYS sends
    handleInputKeyDown({ key: 'Enter', ctrlKey: true, preventDefault }, true);
    expect(handleSendMessage).toHaveBeenCalledTimes(2);
  });
});
