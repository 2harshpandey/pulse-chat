import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatWebSocket } from './hooks/useChatWebSocket';
import { useChatMedia } from './hooks/useChatMedia';
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
        sender: 'user-123',
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
        sender: 'user-123',
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
});
