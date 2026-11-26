import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen, fireEvent } from '@testing-library/react';
import { useChatWebSocket } from './hooks/useChatWebSocket';
import { useChatMedia } from './hooks/useChatMedia';
import { useTabSessionLock } from './hooks/useTabSessionLock';
import { OtherTabOverlay } from './components/modals/OtherTabOverlay';
import type { Message } from './types';

describe('Mobile Media Upload & Reconnect Resilience', () => {
  let createdSockets: MockWebSocket[] = [];
  const originalWebSocket = global.WebSocket;

  class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;

    url: string;
    readyState = 1; // WebSocket.OPEN
    send = vi.fn();
    close = vi.fn();
    onopen: any = null;
    onclose: any = null;
    onerror: any = null;
    onmessage: any = null;

    constructor(url: string) {
      this.url = url;
      createdSockets.push(this);
    }
  }

  beforeEach(() => {
    createdSockets = [];
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    (global as any).WebSocket = originalWebSocket;
  });

  const stableProfile = { userId: 'user-123', username: 'Tester' } as any;

  it('queues messages in safeSend before auth_success and flushes them in FIFO order on auth_success', async () => {
    const wsRef: { current: any } = { current: null };
    const setMessages = vi.fn();
    const messagesRef = { current: [] };

    const { result } = renderHook(() =>
      useChatWebSocket({
        ws: wsRef,
        userId: 'user-123',
        roomId: 'room-abc',
        userProfile: stableProfile,
        logout: vi.fn(),
        overlayGuardPushed: { current: false },
        playNotificationSound: vi.fn(),
        setMessages,
        messagesRef,
        setPinnedMessages: vi.fn(),
        setCurrentPinnedIndex: vi.fn(),
        setHistoryLoaded: vi.fn(),
        setHistorySessionId: vi.fn(),
        setFirstItemIndex: vi.fn(),
        setOldestLoadedAt: vi.fn(),
        oldestLoadedAtRef: { current: null },
        setHasMoreOlderMessages: vi.fn(),
        hasMoreOlderMessagesRef: { current: false },
        setHasMoreNewerMessages: vi.fn(),
        hasMoreNewerMessagesRef: { current: false },
        setNewestLoadedAt: vi.fn(),
        newestLoadedAtRef: { current: null },
        setNewMessagesWhileScrolledUp: vi.fn(),
        messageTailSnapshotRef: { current: { length: 0, lastId: null } },
        groupStartMessageIdsRef: { current: new Set() },
        hasInitialScrolled: { current: false },
        initialHistoryBottomStabilized: { current: false },
        suppressInitialBottomPinRef: { current: false },
        initialTopMostItemIndexRef: { current: null },
        normalizeMessage: (m: any) => m,
        filterVisibleMessages: (list: any[]) => list,
        getMessageCursor: (m: any) => m?.id || null,
        appendMessageToWindow: vi.fn(),
        setSearchResults: vi.fn(),
        setReplyingTo: vi.fn(),
        setIsSubmittingReport: vi.fn(),
        setReportError: vi.fn(),
        setReportReason: vi.fn(),
        setReportTargetMessage: vi.fn(),
        setIsReportModalVisible: vi.fn(),
        isNativeFilePickerOpenRef: { current: false },
      })
    );

    const activeSocket = wsRef.current;
    expect(activeSocket).toBeDefined();

    // Trigger onopen: socket opens and sends user_join
    await act(async () => {
      await activeSocket.onopen?.();
    });

    // Socket is connected, but room is NOT yet authenticated/joined
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isRoomJoined).toBe(false);

    // Call safeSend with an image message while socket is connected but unauthenticated
    const imgPayload = {
      type: 'image',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/test.jpg',
      clientTempId: 'temp-media-1',
      roomId: 'room-abc',
    };

    await act(async () => {
      const sent = result.current.safeSend(imgPayload);
      expect(sent).toBe(false); // Queued, not sent immediately to prevent unjoined socket drop
    });

    // Check sent frames so far: user_join was sent, but NOT the image frame
    const sentBeforeAuth = activeSocket.send.mock.calls.map((c: any) => JSON.parse(c[0]));
    expect(sentBeforeAuth.some((f: any) => f.type === 'image')).toBe(false);

    // Simulate server returning auth_success
    await act(async () => {
      await activeSocket.onmessage?.({
        data: JSON.stringify({
          type: 'auth_success',
          userId: 'user-123',
          username: 'Tester',
          roomId: 'room-abc',
        }),
      });
    });

    // Now isRoomJoined is true and the queued image frame has been safely flushed!
    expect(result.current.isRoomJoined).toBe(true);
    const sentAfterAuth = activeSocket.send.mock.calls.map((c: any) => JSON.parse(c[0]));
    const flushedImage = sentAfterAuth.find((f: any) => f.type === 'image');
    expect(flushedImage).toBeDefined();
    expect(flushedImage.clientTempId).toBe('temp-media-1');
  });

  it('preserves uploading and optimistic messages when initial history arrives after reconnection', async () => {
    const wsRef: { current: any } = { current: null };
    let currentMessages: Message[] = [
      {
        id: 'uploading-img-1',
        clientTempId: 'uploading-img-1',
        type: 'image',
        url: 'blob:http://localhost/test-blob',
        isUploading: true,
        userId: 'user-123',
        username: 'Tester',
        timestamp: new Date().toISOString(),
      },
    ];

    const setMessages = vi.fn((updater: any) => {
      if (typeof updater === 'function') {
        currentMessages = updater(currentMessages);
      } else {
        currentMessages = updater;
      }
    });

    const messagesRef = { current: currentMessages };

    renderHook(() =>
      useChatWebSocket({
        ws: wsRef,
        userId: 'user-123',
        roomId: 'room-abc',
        userProfile: stableProfile,
        logout: vi.fn(),
        overlayGuardPushed: { current: false },
        playNotificationSound: vi.fn(),
        setMessages,
        messagesRef,
        setPinnedMessages: vi.fn(),
        setCurrentPinnedIndex: vi.fn(),
        setHistoryLoaded: vi.fn(),
        setHistorySessionId: vi.fn(),
        setFirstItemIndex: vi.fn(),
        setOldestLoadedAt: vi.fn(),
        oldestLoadedAtRef: { current: null },
        setHasMoreOlderMessages: vi.fn(),
        hasMoreOlderMessagesRef: { current: false },
        setHasMoreNewerMessages: vi.fn(),
        hasMoreNewerMessagesRef: { current: false },
        setNewestLoadedAt: vi.fn(),
        newestLoadedAtRef: { current: null },
        setNewMessagesWhileScrolledUp: vi.fn(),
        messageTailSnapshotRef: { current: { length: 0, lastId: null } },
        groupStartMessageIdsRef: { current: new Set() },
        hasInitialScrolled: { current: false },
        initialHistoryBottomStabilized: { current: false },
        suppressInitialBottomPinRef: { current: false },
        initialTopMostItemIndexRef: { current: null },
        normalizeMessage: (m: any) => m,
        filterVisibleMessages: (list: any[]) => list,
        getMessageCursor: (m: any) => m?.id || null,
        appendMessageToWindow: vi.fn(),
        setSearchResults: vi.fn(),
        setReplyingTo: vi.fn(),
        setIsSubmittingReport: vi.fn(),
        setReportError: vi.fn(),
        setReportReason: vi.fn(),
        setReportTargetMessage: vi.fn(),
        setIsReportModalVisible: vi.fn(),
        isNativeFilePickerOpenRef: { current: false },
      })
    );

    const activeSocket = wsRef.current;
    expect(activeSocket).toBeDefined();

    await act(async () => {
      await activeSocket.onopen?.();
    });

    // Reconnection triggers 'history' from server (which does NOT yet include the newly uploaded image)
    await act(async () => {
      await activeSocket.onmessage?.({
        data: JSON.stringify({
          type: 'history',
          data: [
            { id: 'older-msg-1', type: 'text', text: 'Existing chat message', timestamp: '2026-11-10T08:00:00Z' },
          ],
        }),
      });
    });

    // The uploading image must NOT be overwritten or wiped out from the chat list!
    expect(currentMessages).toHaveLength(2);
    expect(currentMessages[0].id).toBe('older-msg-1');
    expect(currentMessages[1].id).toBe('uploading-img-1');
    expect(currentMessages[1].isUploading).toBe(true);
  });

  it('useChatMedia uses safeSend to dispatch completed uploads without dropping frames', () => {
    const mockSafeSend = vi.fn().mockReturnValue(true);
    const mockMessages: Message[] = [
      {
        id: 'temp-media-upload',
        type: 'image',
        isUploading: true,
        userId: 'user-123',
        username: 'Tester',
        timestamp: new Date().toISOString(),
      },
    ];

    const { result } = renderHook(() =>
      useChatMedia({
        messages: mockMessages,
        setMessages: vi.fn(),
        userId: 'user-123',
        apiBase: 'http://localhost:8080',
        roomId: 'room-abc',
        isLoggedIn: true,
        isDesktopInteraction: false,
        inputMessage: '',
        setInputMessage: vi.fn(),
        resetInputLayerHeight: vi.fn(),
        ws: { current: null },
        safeSend: mockSafeSend,
        setPresenceActivity: vi.fn(),
        startSendingActivity: vi.fn(),
        stopSendingActivity: vi.fn(),
        messageInputRef: { current: null },
      })
    );

    expect(result.current).toBeDefined();
    expect(typeof result.current.handleResumeUpload).toBe('function');
  });

  it('does NOT append previously persisted old database messages with clientTempId to the bottom when reconnect history arrives', async () => {
    const wsRef: { current: any } = { current: null };
    let currentMessages: Message[] = [
      // Persisted older message from days ago (loaded during scroll-up or quote jump; has server _id and clientTempId)
      {
        id: 'server-uuid-nov19',
        _id: 'mongo-id-nov19',
        clientTempId: '1795042384123_old',
        type: 'text',
        text: 'Old message from Nov 19',
        userId: 'user-other',
        username: 'Khushi',
        timestamp: '2026-11-19T20:35:00.000Z',
      } as any,
      // Genuine in-flight local optimistic text message (not yet assigned server _id)
      {
        id: '1795549500000_99',
        clientTempId: '1795549500000_99',
        type: 'text',
        text: 'Sending right now',
        userId: 'user-123',
        username: 'Tester',
        timestamp: new Date().toISOString(),
      },
    ];

    const setMessages = vi.fn((updater: any) => {
      if (typeof updater === 'function') {
        currentMessages = updater(currentMessages);
      } else {
        currentMessages = updater;
      }
    });

    const messagesRef = { current: currentMessages };

    renderHook(() =>
      useChatWebSocket({
        ws: wsRef,
        userId: 'user-123',
        roomId: 'room-abc',
        userProfile: stableProfile,
        logout: vi.fn(),
        overlayGuardPushed: { current: false },
        playNotificationSound: vi.fn(),
        setMessages,
        messagesRef,
        setPinnedMessages: vi.fn(),
        setCurrentPinnedIndex: vi.fn(),
        setHistoryLoaded: vi.fn(),
        setHistorySessionId: vi.fn(),
        setFirstItemIndex: vi.fn(),
        setOldestLoadedAt: vi.fn(),
        oldestLoadedAtRef: { current: null },
        setHasMoreOlderMessages: vi.fn(),
        hasMoreOlderMessagesRef: { current: false },
        setHasMoreNewerMessages: vi.fn(),
        hasMoreNewerMessagesRef: { current: false },
        setNewestLoadedAt: vi.fn(),
        newestLoadedAtRef: { current: null },
        setNewMessagesWhileScrolledUp: vi.fn(),
        messageTailSnapshotRef: { current: { length: 0, lastId: null } },
        groupStartMessageIdsRef: { current: new Set() },
        hasInitialScrolled: { current: false },
        initialHistoryBottomStabilized: { current: false },
        suppressInitialBottomPinRef: { current: false },
        initialTopMostItemIndexRef: { current: null },
        normalizeMessage: (m: any) => m,
        filterVisibleMessages: (list: any[]) => list,
        getMessageCursor: (m: any) => m?.id || null,
        appendMessageToWindow: vi.fn(),
        setSearchResults: vi.fn(),
        setReplyingTo: vi.fn(),
        setIsSubmittingReport: vi.fn(),
        setReportError: vi.fn(),
        setReportReason: vi.fn(),
        setReportTargetMessage: vi.fn(),
        setIsReportModalVisible: vi.fn(),
        isNativeFilePickerOpenRef: { current: false },
      })
    );

    const activeSocket = wsRef.current;
    await act(async () => {
      await activeSocket.onopen?.();
    });

    await act(async () => {
      await activeSocket.onmessage?.({
        data: JSON.stringify({
          type: 'history',
          data: [
            {
              id: 'latest-msg-1',
              _id: 'mongo-latest-1',
              clientTempId: '1795549400000_1',
              type: 'text',
              text: 'Latest message from today',
              timestamp: '2026-11-25T01:30:00.000Z',
            },
          ],
        }),
      });
    });

    // Old persisted Nov 19 message MUST NOT be appended after latest-msg-1!
    expect(currentMessages.map((m) => m.id)).toEqual(['latest-msg-1', '1795549500000_99']);
  });

  it('handles session_displaced without triggering reconnect loop and renders OtherTabOverlay with Use Here', async () => {
    const wsRef: { current: any } = { current: null };
    const onSessionDisplaced = vi.fn();

    const { result } = renderHook(() =>
      useChatWebSocket({
        ws: wsRef,
        userId: 'user-123',
        roomId: 'room-abc',
        userProfile: stableProfile,
        logout: vi.fn(),
        overlayGuardPushed: { current: false },
        playNotificationSound: vi.fn(),
        setMessages: vi.fn(),
        messagesRef: { current: [] },
        setPinnedMessages: vi.fn(),
        setCurrentPinnedIndex: vi.fn(),
        setHistoryLoaded: vi.fn(),
        setHistorySessionId: vi.fn(),
        setFirstItemIndex: vi.fn(),
        setOldestLoadedAt: vi.fn(),
        oldestLoadedAtRef: { current: null },
        setHasMoreOlderMessages: vi.fn(),
        hasMoreOlderMessagesRef: { current: false },
        setHasMoreNewerMessages: vi.fn(),
        hasMoreNewerMessagesRef: { current: false },
        setNewestLoadedAt: vi.fn(),
        newestLoadedAtRef: { current: null },
        setNewMessagesWhileScrolledUp: vi.fn(),
        messageTailSnapshotRef: { current: { length: 0, lastId: null } },
        groupStartMessageIdsRef: { current: new Set() },
        hasInitialScrolled: { current: false },
        initialHistoryBottomStabilized: { current: false },
        suppressInitialBottomPinRef: { current: false },
        initialTopMostItemIndexRef: { current: null },
        normalizeMessage: (m: any) => m,
        filterVisibleMessages: (list: any[]) => list,
        getMessageCursor: (m: any) => m?.id || null,
        appendMessageToWindow: vi.fn(),
        setSearchResults: vi.fn(),
        setReplyingTo: vi.fn(),
        setIsSubmittingReport: vi.fn(),
        setReportError: vi.fn(),
        setReportReason: vi.fn(),
        setReportTargetMessage: vi.fn(),
        setIsReportModalVisible: vi.fn(),
        isNativeFilePickerOpenRef: { current: false },
        tabId: 'tab-test-1',
        onSessionDisplaced,
      })
    );

    const activeSocket = wsRef.current;
    await act(async () => {
      await activeSocket.onopen?.();
    });
    expect(result.current.isConnected).toBe(true);

    // Server sends session_displaced
    await act(async () => {
      await activeSocket.onmessage?.({
        data: JSON.stringify({
          type: 'session_displaced',
          reason: 'another_tab',
          message: 'This chat room is already open in another tab.',
        }),
      });
    });

    expect(onSessionDisplaced).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(false);

    // Test OtherTabOverlay UI & Use Here callback
    const onUseHere = vi.fn();
    render(<OtherTabOverlay isOpen={true} onUseHere={onUseHere} />);
    expect(screen.getByText('PulseChat is open in another tab')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Use Here' }));
    expect(onUseHere).toHaveBeenCalledTimes(1);
  });

  it('useTabSessionLock detects existing active tab lock via BroadcastChannel / localStorage and yields cleanly on CLAIM', async () => {
    localStorage.clear();
    const { result: tab1 } = renderHook(() =>
      useTabSessionLock({ userId: 'u-tab', roomId: 'r-tab', enabled: true })
    );
    expect(tab1.current.isDisplacedByOtherTab).toBe(false);

    const { result: tab2 } = renderHook(() =>
      useTabSessionLock({ userId: 'u-tab', roomId: 'r-tab', enabled: true })
    );
    // Allow 120ms probe / channel response if any
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(tab2.current.isDisplacedByOtherTab).toBe(true);

    // Clicking "Use Here" on tab2 claims leadership and displaces tab1
    act(() => {
      tab2.current.claimHere();
    });
    expect(tab2.current.isDisplacedByOtherTab).toBe(false);
    expect(tab2.current.forceTakeoverRef.current).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(tab1.current.isDisplacedByOtherTab).toBe(true);
    localStorage.clear();
  });
});
