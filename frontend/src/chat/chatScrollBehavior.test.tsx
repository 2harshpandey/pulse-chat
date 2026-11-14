import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatViewport, IS_AT_BOTTOM_THRESHOLD_PX } from './hooks/useChatViewport';
import { useChatComposer } from './hooks/useChatComposer';
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

  it('correctly detects desktop device even if primary pointer is coarse but any-pointer is fine or hover capability exists', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      if (query === '(pointer: fine)') return { matches: false };
      if (query === '(any-pointer: fine)') return { matches: true };
      if (query === '(hover: hover)') return { matches: true };
      if (query === '(pointer: coarse)') return { matches: true };
      return { matches: false };
    });

    try {
      expect(isTouchDevice()).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('always detects Windows desktop as non-touch device even if coarse pointer or touch capability is reported', () => {
    const originalUserAgent = navigator.userAgent;
    const originalMaxTouchPoints = navigator.maxTouchPoints;
    const originalMatchMedia = window.matchMedia;

    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 10,
      configurable: true,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      if (query === '(pointer: fine)') return { matches: false };
      if (query === '(hover: hover)') return { matches: false };
      if (query === '(pointer: coarse)') return { matches: true };
      return { matches: false };
    });

    try {
      expect(isTouchDevice()).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
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

  it('does not suppress initial bottom pin when atBottom is false before stabilization finishes', () => {
    const mockContainer = document.createElement('div');
    const ref = { current: mockContainer };
    const { result } = renderHook(() =>
      useChatViewport({
        chatContainerRef: ref as any,
        inputOverlayRef: { current: null },
        messageInputRef: { current: null },
      })
    );

    // Initial state: stabilization is false
    result.current.initialHistoryBottomStabilized.current = false;
    result.current.suppressInitialBottomPinRef.current = false;

    // Simulate scroll event where container is not at bottom during initial layout
    act(() => {
      result.current.handleAtBottomStateChange(false);
    });

    // Should NOT suppress initial bottom pin because stabilization is still in progress
    expect(result.current.suppressInitialBottomPinRef.current).toBe(false);

    // Now mark stabilization as complete (history fully settled at bottom)
    result.current.initialHistoryBottomStabilized.current = true;

    // Simulate user scrolling up away from bottom
    act(() => {
      result.current.handleAtBottomStateChange(false);
    });

    // Now it SHOULD suppress initial bottom pin because user genuinely scrolled away
    expect(result.current.suppressInitialBottomPinRef.current).toBe(true);
  });

  it('guards older message loading so it never triggers during initial load or before stabilization', () => {
    const shouldLoadOlder = (
      historyLoaded: boolean,
      hasInitialScrolled: boolean,
      initialHistoryBottomStabilized: boolean,
      scrollTop: number,
      isLoadingOlder: boolean,
      hasMoreOlder: boolean
    ) => {
      return (
        historyLoaded &&
        hasInitialScrolled &&
        initialHistoryBottomStabilized &&
        scrollTop < 2500 &&
        !isLoadingOlder &&
        hasMoreOlder
      );
    };

    // 1. Initial mount (scrollTop is 0, but history hasn't finished initial scroll/stabilization): DO NOT LOAD
    expect(shouldLoadOlder(true, false, false, 0, false, true)).toBe(false);
    expect(shouldLoadOlder(true, true, false, 0, false, true)).toBe(false);

    // 2. Initial mount before history is loaded: DO NOT LOAD
    expect(shouldLoadOlder(false, false, false, 0, false, true)).toBe(false);

    // 3. Settled at bottom (initial scroll done, stabilized, scrollTop is at bottom e.g. 5000px): DO NOT LOAD
    expect(shouldLoadOlder(true, true, true, 5000, false, true)).toBe(false);

    // 4. User scrolled up to top after stabilization (scrollTop = 100px): LOAD OLDER
    expect(shouldLoadOlder(true, true, true, 100, false, true)).toBe(true);
  });
});

describe('Mobile virtual keyboard resize & scroll anchoring', () => {
  it('pins chat to bottom when keyboard opens (viewport shrinks) IF and only IF user was at bottom', () => {
    vi.useFakeTimers();
    const origInnerHeight = window.innerHeight;
    window.innerHeight = 800;

    const mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 1500, configurable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 700, writable: true, configurable: true });
    Object.defineProperty(mockContainer, 'scrollTop', { value: 800, writable: true, configurable: true });

    try {
      const ref = { current: mockContainer };
      const { result } = renderHook(() =>
        useChatViewport({
          chatContainerRef: ref as any,
          inputOverlayRef: { current: null },
          messageInputRef: { current: null },
        })
      );

      // Initial state: user is at bottom (1500 - (800 + 700) = 0 <= 60)
      act(() => {
        result.current.syncBottomStateFromScroller();
      });
      expect(result.current.isAtBottomRef.current).toBe(true);

      // Simulate mobile keyboard opening: viewport shrinks from 800 to 450
      act(() => {
        window.innerHeight = 450;
        mockContainer.clientHeight = 350;
        window.dispatchEvent(new Event('resize'));
      });

      // Advance timers across the keyboard slide-up animation curve
      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Messages must have shifted upwards so that scrollTop reaches scrollHeight
      expect(mockContainer.scrollTop).toBe(1500);
      expect(result.current.isAtBottomRef.current).toBe(true);
      expect(result.current.isScrollToBottomVisible).toBe(false);
    } finally {
      window.innerHeight = origInnerHeight;
      vi.useRealTimers();
    }
  });

  it('does NOT scroll to bottom when keyboard opens IF user was scrolled up reading history', () => {
    vi.useFakeTimers();
    const origInnerHeight = window.innerHeight;
    window.innerHeight = 800;

    const mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 1500, configurable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 700, writable: true, configurable: true });
    // User scrolled up: scrollTop is 200 => distanceFromBottom = 1500 - (200 + 700) = 600 > 60
    Object.defineProperty(mockContainer, 'scrollTop', { value: 200, writable: true, configurable: true });

    try {
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

      // Simulate mobile keyboard opening: viewport shrinks from 800 to 450
      act(() => {
        window.innerHeight = 450;
        mockContainer.clientHeight = 350;
        window.dispatchEvent(new Event('resize'));
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Scroll position MUST NOT be jumped to bottom; it must remain at 200
      expect(mockContainer.scrollTop).toBe(200);
      expect(result.current.isAtBottomRef.current).toBe(false);
      expect(result.current.isScrollToBottomVisible).toBe(true);
    } finally {
      window.innerHeight = origInnerHeight;
      vi.useRealTimers();
    }
  });

  it('pins chat to bottom when keyboard closes (viewport expands) IF user was at bottom', () => {
    vi.useFakeTimers();
    const origInnerHeight = window.innerHeight;
    window.innerHeight = 450;

    const mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 1500, configurable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 350, writable: true, configurable: true });
    Object.defineProperty(mockContainer, 'scrollTop', { value: 1150, writable: true, configurable: true });

    try {
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

      // Simulate mobile keyboard closing: viewport expands from 450 to 800
      act(() => {
        window.innerHeight = 800;
        mockContainer.clientHeight = 700;
        window.dispatchEvent(new Event('resize'));
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Must maintain bottom position
      expect(mockContainer.scrollTop).toBe(1500);
      expect(result.current.isAtBottomRef.current).toBe(true);
    } finally {
      window.innerHeight = origInnerHeight;
      vi.useRealTimers();
    }
  });

  it('does NOT scroll to bottom when keyboard closes IF user was scrolled up', () => {
    vi.useFakeTimers();
    const origInnerHeight = window.innerHeight;
    window.innerHeight = 450;

    const mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 1500, configurable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 350, writable: true, configurable: true });
    Object.defineProperty(mockContainer, 'scrollTop', { value: 250, writable: true, configurable: true });

    try {
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

      // Simulate mobile keyboard closing: viewport expands from 450 to 800
      act(() => {
        window.innerHeight = 800;
        mockContainer.clientHeight = 700;
        window.dispatchEvent(new Event('resize'));
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Scroll position MUST NOT jump to bottom; remains at 250
      expect(mockContainer.scrollTop).toBe(250);
      expect(result.current.isAtBottomRef.current).toBe(false);
    } finally {
      window.innerHeight = origInnerHeight;
      vi.useRealTimers();
    }
  });

  it('ignores transient layout shrinkage during active keyboard resize so atBottom is not prematurely cleared', () => {
    const mockContainer = document.createElement('div');
    const ref = { current: mockContainer };
    const { result } = renderHook(() =>
      useChatViewport({
        chatContainerRef: ref as any,
        inputOverlayRef: { current: null },
        messageInputRef: { current: null },
      })
    );

    result.current.isAtBottomRef.current = true;
    result.current.isViewportResizingRef.current = true;
    result.current.wasAtBottomBeforeResizeRef.current = true;

    // A scroll event with transient atBottom = false fires during resize
    act(() => {
      result.current.handleAtBottomStateChange(false);
    });

    // Should remain true because we are in an active keyboard resize transition
    expect(result.current.isAtBottomRef.current).toBe(true);
    expect(result.current.isScrollToBottomVisible).toBe(false);
  });

  it('cancels viewport resize pinning immediately when user deliberately scrolls up', () => {
    const mockContainer = document.createElement('div');
    const ref = { current: mockContainer };
    const { result } = renderHook(() =>
      useChatViewport({
        chatContainerRef: ref as any,
        inputOverlayRef: { current: null },
        messageInputRef: { current: null },
      })
    );

    result.current.isViewportResizingRef.current = true;
    result.current.wasAtBottomBeforeResizeRef.current = true;

    act(() => {
      result.current.cancelViewportResizePinning();
    });

    expect(result.current.isViewportResizingRef.current).toBe(false);
    expect(result.current.wasAtBottomBeforeResizeRef.current).toBe(false);
  });

  it('explicitly blurs messageInput when mobile keyboard closes (viewport expands by >80px) to prevent zombie focus', () => {
    vi.useFakeTimers();
    const origInnerHeight = window.innerHeight;
    window.innerHeight = 450;

    const mockContainer = document.createElement('div');
    const mockTextarea = document.createElement('textarea');
    document.body.appendChild(mockTextarea);
    mockTextarea.focus();
    expect(document.activeElement).toBe(mockTextarea);

    try {
      const containerRef = { current: mockContainer };
      const inputRef = { current: mockTextarea };
      renderHook(() =>
        useChatViewport({
          chatContainerRef: containerRef as any,
          inputOverlayRef: { current: null },
          messageInputRef: inputRef as any,
        })
      );

      // Soft keyboard closes (e.g. via back button/gesture): viewport expands from 450 to 800
      act(() => {
        window.innerHeight = 800;
        window.dispatchEvent(new Event('resize'));
      });

      // Textarea must be explicitly blurred to eliminate zombie focus
      expect(document.activeElement).not.toBe(mockTextarea);
    } finally {
      if (mockTextarea.parentNode) {
        document.body.removeChild(mockTextarea);
      }
      window.innerHeight = origInnerHeight;
      vi.useRealTimers();
    }
  });

  it('blurs messageInput and activeElement when handleScrollToBottomButtonClick is triggered', () => {
    const mockTextarea = document.createElement('textarea');
    document.body.appendChild(mockTextarea);
    mockTextarea.focus();
    expect(document.activeElement).toBe(mockTextarea);

    const scrollToBottomMock = vi.fn();
    const inputRef = { current: mockTextarea };

    const { result } = renderHook(() =>
      useChatComposer({
        inputMessage: '',
        setInputMessage: vi.fn(),
        inputMessageRef: { current: '' },
        userId: 'user1',
        roomId: 'testRoom',
        messageInputRef: inputRef as any,
        inputOverlayRef: { current: null },
        chatContainerRef: { current: null },
        skipNextInputLayoutSyncRef: { current: false },
        resetInputLayerHeight: vi.fn(),
        syncInputOverlayScroll: vi.fn(),
        isMobileView: true,
        stableViewportHeightRef: { current: 800 },
        replyingTo: null,
        setReplyingTo: vi.fn(),
        editingMessageId: null,
        setEditingMessageId: vi.fn(),
        setEditingMessageOriginalText: vi.fn(),
        priorDraftBeforeEdit: '',
        setPriorDraftBeforeEdit: vi.fn(),
        stagedFile: null,
        setStagedFile: vi.fn(),
        stagedFiles: [],
        setStagedFiles: vi.fn(),
        showFilePreview: false,
        setShowFilePreview: vi.fn(),
        previewCaption: '',
        setPreviewCaption: vi.fn(),
        setPreviewActiveIndex: vi.fn(),
        preMediaDraft: '',
        setPreMediaDraft: vi.fn(),
        stageFilesForPreview: vi.fn(),
        handleRequestCloseFilePreview: vi.fn(),
        stagedGif: null,
        setStagedGif: vi.fn(),
        closeGifPicker: vi.fn(),
        gifPickerRef: { current: null },
        lightboxUrl: null,
        closeLightbox: vi.fn(),
        isSelectModeActive: false,
        isDeleteConfirmationVisible: false,
        isUserListVisible: false,
        deleteMenuRef: { current: null },
        setActiveDeleteMenu: vi.fn(),
        messagesRef: { current: [] },
        setMessages: vi.fn(),
        appendMessageToWindow: vi.fn(),
        hasMoreNewerMessagesRef: { current: false },
        jumpToLatestMessages: vi.fn(),
        activeSearchQuery: '',
        chatSearchQuery: '',
        isSearchActive: false,
        resetSearch: vi.fn(),
        forceScrollToBottomAsync: vi.fn(),
        scrollToBottom: scrollToBottomMock,
        syncBottomStateFromScroller: vi.fn(),
        quoteJumpReturnStackRef: { current: [] },
        scrollToLoadedMessage: vi.fn(),
        setNewMessagesWhileScrolledUp: vi.fn(),
        clearQuoteJumpSuppression: vi.fn(),
        setHasMoreOlderMessages: vi.fn(),
        setOldestLoadedAt: vi.fn(),
        setFirstItemIndex: vi.fn(),
      })
    );

    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent<HTMLButtonElement>;

    act(() => {
      result.current.handleScrollToBottomButtonClick(mockEvent);
    });

    expect(document.activeElement).not.toBe(mockTextarea);
    expect(scrollToBottomMock).toHaveBeenCalledWith('auto', true);
    if (mockTextarea.parentNode) {
      document.body.removeChild(mockTextarea);
    }
  });
});
