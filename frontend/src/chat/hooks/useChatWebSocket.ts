import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message } from '../types';
import type { UserProfile, PresenceActivity } from '../../UserContext';
import { resolveApiBaseUrl, getSessionToken } from '../utils';
import { initTelemetryContext, updateTelemetryWs } from '../telemetry';
import { routeIncomingWsMessage } from './wsMessageRouter';

interface UseChatWebSocketProps {
  ws?: React.MutableRefObject<WebSocket | null>;
  userId: string;
  roomId: string;
  tempToken?: string;
  userProfile: UserProfile | null | undefined;
  logout: () => void;
  overlayGuardPushed: React.MutableRefObject<boolean>;
  playNotificationSound: (variant: 'join' | 'message') => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  messagesRef: React.MutableRefObject<Message[]>;
  setPinnedMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setCurrentPinnedIndex: React.Dispatch<React.SetStateAction<number>>;
  setHistoryLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  setHistorySessionId: React.Dispatch<React.SetStateAction<number>>;
  setFirstItemIndex: (valOrUpdater: number | ((prev: number) => number)) => void;
  setOldestLoadedAt: React.Dispatch<React.SetStateAction<string | null>>;
  oldestLoadedAtRef: React.MutableRefObject<string | null>;
  setHasMoreOlderMessages: React.Dispatch<React.SetStateAction<boolean>>;
  hasMoreOlderMessagesRef: React.MutableRefObject<boolean>;
  setHasMoreNewerMessages: React.Dispatch<React.SetStateAction<boolean>>;
  hasMoreNewerMessagesRef: React.MutableRefObject<boolean>;
  setNewestLoadedAt: React.Dispatch<React.SetStateAction<string | null>>;
  newestLoadedAtRef: React.MutableRefObject<string | null>;
  setNewMessagesWhileScrolledUp: React.Dispatch<React.SetStateAction<number>>;
  messageTailSnapshotRef: React.MutableRefObject<{ length: number; lastId: string | null }>;
  groupStartMessageIdsRef: React.MutableRefObject<Set<string>>;
  hasInitialScrolled: React.MutableRefObject<boolean>;
  initialHistoryBottomStabilized: React.MutableRefObject<boolean>;
  suppressInitialBottomPinRef: React.MutableRefObject<boolean>;
  initialTopMostItemIndexRef: React.MutableRefObject<number | null>;
  normalizeMessage: (msg: any) => Message;
  filterVisibleMessages: (msgs: Message[]) => Message[];
  getMessageCursor: (msg?: Message) => string | null;
  appendMessageToWindow: (msg: Message) => void;
  setSearchResults: React.Dispatch<React.SetStateAction<Message[] | null>>;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  setIsSubmittingReport: React.Dispatch<React.SetStateAction<boolean>>;
  setReportError: React.Dispatch<React.SetStateAction<string>>;
  setReportReason: React.Dispatch<React.SetStateAction<string>>;
  setReportTargetMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  setIsReportModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isNativeFilePickerOpenRef: React.MutableRefObject<boolean>;
  tabId?: string;
  isTabBlockedRef?: React.MutableRefObject<boolean>;
  isCheckingTabLockRef?: React.MutableRefObject<boolean>;
  forceTakeoverRef?: React.MutableRefObject<boolean>;
  tabClaimEpoch?: number;
  onSessionDisplaced?: () => void;
}

export function useChatWebSocket({
  ws: externalWs,
  userId,
  roomId,
  tempToken,
  userProfile,
  logout,
  overlayGuardPushed,
  playNotificationSound,
  setMessages,
  messagesRef,
  setPinnedMessages,
  setCurrentPinnedIndex,
  setHistoryLoaded,
  setHistorySessionId,
  setFirstItemIndex,
  setOldestLoadedAt,
  oldestLoadedAtRef,
  setHasMoreOlderMessages,
  hasMoreOlderMessagesRef,
  setHasMoreNewerMessages,
  hasMoreNewerMessagesRef,
  setNewestLoadedAt,
  newestLoadedAtRef,
  setNewMessagesWhileScrolledUp,
  messageTailSnapshotRef,
  groupStartMessageIdsRef,
  hasInitialScrolled,
  initialHistoryBottomStabilized,
  suppressInitialBottomPinRef,
  initialTopMostItemIndexRef,
  normalizeMessage,
  filterVisibleMessages,
  getMessageCursor,
  appendMessageToWindow,
  setSearchResults,
  setReplyingTo,
  setIsSubmittingReport,
  setReportError,
  setReportReason,
  setReportTargetMessage,
  setIsReportModalVisible,
  isNativeFilePickerOpenRef,
  tabId,
  isTabBlockedRef,
  isCheckingTabLockRef,
  forceTakeoverRef,
  tabClaimEpoch = 0,
  onSessionDisplaced,
}: UseChatWebSocketProps) {
  const internalWs = useRef<WebSocket | null>(null);
  const ws = externalWs || internalWs;
  const [isConnected, setIsConnected] = useState(false);
  const [isRoomJoined, setIsRoomJoined] = useState(false);
  const isRoomJoinedRef = useRef<boolean>(false);
  const pendingOutgoingQueueRef = useRef<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const lastPingAtRef = useRef<number>(Date.now());
  const lastHiddenTimeRef = useRef<number>(Date.now());

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef<number>(600);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const presenceHeartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceActivityRef = useRef<PresenceActivity | null>(null);
  const activeUploadsCountRef = useRef<number>(0);
  const currentSendingActivityRef = useRef<PresenceActivity | null>(null);
  const stopSendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityStartedAtRef = useRef<number>(0);

  const appendMessageToWindowRef = useRef(appendMessageToWindow);
  useEffect(() => {
    appendMessageToWindowRef.current = appendMessageToWindow;
  }, [appendMessageToWindow]);

  const safeSend = useCallback(
    (payload: any) => {
      const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const socket = ws.current;
      if (socket && socket.readyState === WebSocket.OPEN && isRoomJoinedRef.current) {
        try {
          while (pendingOutgoingQueueRef.current.length > 0) {
            const queued = pendingOutgoingQueueRef.current.shift();
            if (queued) socket.send(queued);
          }
          socket.send(data);
          return true;
        } catch (e) {
          console.warn('Failed to send WebSocket payload immediately:', e);
        }
      }
      // Buffer in-flight message while connecting, closed, or awaiting auth_success (capped at 50 frames)
      if (pendingOutgoingQueueRef.current.length < 50) {
        pendingOutgoingQueueRef.current.push(data);
      }
      return false;
    },
    [ws]
  );

  const stopHeartbeatForActivity = useCallback(() => {
    if (presenceHeartbeatIntervalRef.current) {
      clearInterval(presenceHeartbeatIntervalRef.current);
      presenceHeartbeatIntervalRef.current = null;
    }
  }, []);

  const startHeartbeatForActivity = useCallback(
    () => {
      stopHeartbeatForActivity();
      presenceHeartbeatIntervalRef.current = setInterval(() => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        if (ws.current.bufferedAmount > 4096) return;
        const current = currentSendingActivityRef.current || presenceActivityRef.current;
        if (current && current !== 'typing') {
          try {
            ws.current.send(JSON.stringify({ type: 'start_typing', activity: current, roomId }));
          } catch (_) {}
        }
      }, 2200);
    },
    [roomId, stopHeartbeatForActivity]
  );

  const setPresenceActivity = useCallback(
    (nextActivity: PresenceActivity | null, force: boolean = false) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      if (!force && presenceActivityRef.current === nextActivity) return;

      // Prevent generic resets (e.g. from typing timeouts)
      // from wiping out an active media upload or active sending state unless forced
      if (
        nextActivity === null &&
        !force &&
        (activeUploadsCountRef.current > 0 || currentSendingActivityRef.current !== null)
      ) {
        return;
      }

      try {
        if (nextActivity) {
          ws.current.send(JSON.stringify({ type: 'start_typing', activity: nextActivity, roomId }));
          if (nextActivity !== 'typing') {
            startHeartbeatForActivity();
          } else {
            stopHeartbeatForActivity();
          }
        } else {
          stopHeartbeatForActivity();
          ws.current.send(JSON.stringify({ type: 'stop_typing', roomId }));
        }
        presenceActivityRef.current = nextActivity;
      } catch (_) {
        // Best effort
      }
    },
    [roomId, startHeartbeatForActivity, stopHeartbeatForActivity]
  );

  const startSendingActivity = useCallback(
    (activity: PresenceActivity) => {
      activeUploadsCountRef.current += 1;
      currentSendingActivityRef.current = activity;
      activityStartedAtRef.current = Date.now();

      if (stopSendingTimeoutRef.current) {
        clearTimeout(stopSendingTimeoutRef.current);
        stopSendingTimeoutRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      lastTypingSentAtRef.current = 0;

      setPresenceActivity(activity, true);
    },
    [setPresenceActivity]
  );

  const stopSendingActivity = useCallback(() => {
    activeUploadsCountRef.current = Math.max(0, activeUploadsCountRef.current - 1);
    if (activeUploadsCountRef.current === 0) {
      if (stopSendingTimeoutRef.current) {
        clearTimeout(stopSendingTimeoutRef.current);
      }
      const elapsed = Date.now() - activityStartedAtRef.current;
      const minDuration = 1000; // ensures smooth animation and visibility to others
      const delay = Math.max(0, minDuration - elapsed);

      stopSendingTimeoutRef.current = setTimeout(() => {
        if (activeUploadsCountRef.current === 0) {
          currentSendingActivityRef.current = null;
          setPresenceActivity(null, true);
          lastTypingSentAtRef.current = 0;
        }
      }, delay);
    }
  }, [setPresenceActivity]);

  const handleTyping = useCallback(
    (activity?: PresenceActivity | null) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      if (ws.current.bufferedAmount > 4096) return;

      if (activity === null) {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        lastTypingSentAtRef.current = 0;
        setPresenceActivity(null, true);
        return;
      }

      // Do not downgrade active file sending presence to generic typing
      if (activeUploadsCountRef.current > 0 || currentSendingActivityRef.current !== null) {
        return;
      }

      const targetActivity = activity || 'typing';
      const now = Date.now();
      const isNewActivity = presenceActivityRef.current !== targetActivity;
      const shouldSendHeartbeat = now - lastTypingSentAtRef.current >= 2000;

      if (isNewActivity || shouldSendHeartbeat) {
        lastTypingSentAtRef.current = now;
        setPresenceActivity(targetActivity, true);
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (activeUploadsCountRef.current === 0 && currentSendingActivityRef.current === null) {
          setPresenceActivity(null, true);
        }
        typingTimeoutRef.current = null;
        lastTypingSentAtRef.current = 0;
      }, 2500);
    },
    [setPresenceActivity]
  );

  useEffect(() => {
    if (!userProfile) return;

    let shouldReconnect = true;
    let hasLoadedInitialHistory = false;

    const connect = () => {
      if (isTabBlockedRef?.current || isCheckingTabLockRef?.current) {
        return;
      }
      if (
        ws.current &&
        (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const apiBase = resolveApiBaseUrl();
      const wsUrlBase = apiBase
        ? apiBase.replace(/^http/, 'ws')
        : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

      const effectiveUserId = userProfile?.userId || userId;
      let wsUrl = `${wsUrlBase}?userId=${encodeURIComponent(effectiveUserId)}`;
      if (tempToken) wsUrl += `&token=${encodeURIComponent(tempToken)}`;
      else if (roomId) wsUrl += `&roomId=${encodeURIComponent(roomId)}`;

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        isRoomJoinedRef.current = false;
        setIsRoomJoined(false);
        lastPingAtRef.current = Date.now();
        reconnectDelayRef.current = 600;
        presenceActivityRef.current = null;
        initTelemetryContext(ws.current, roomId, effectiveUserId, userProfile?.username);
        const sessionToken = getSessionToken(roomId);
        const shouldForceTakeover = Boolean(forceTakeoverRef?.current);
        if (forceTakeoverRef) {
          forceTakeoverRef.current = false;
        }
        ws.current?.send(
          JSON.stringify({
            type: 'user_join',
            ...(userProfile || {}),
            userId: effectiveUserId,
            roomId,
            sessionToken,
            ...(tabId ? { tabId } : {}),
            ...(shouldForceTakeover ? { forceTakeover: true } : {}),
          })
        );
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        isRoomJoinedRef.current = false;
        setIsRoomJoined(false);
        updateTelemetryWs(null);
        if (isNativeFilePickerOpenRef.current) {
          isNativeFilePickerOpenRef.current = false;
        }
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        if (stopSendingTimeoutRef.current) {
          clearTimeout(stopSendingTimeoutRef.current);
          stopSendingTimeoutRef.current = null;
        }
        stopHeartbeatForActivity();
        lastTypingSentAtRef.current = 0;
        presenceActivityRef.current = null;
        activeUploadsCountRef.current = 0;
        currentSendingActivityRef.current = null;
        if (shouldReconnect) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 1.5, 10000);
            connect();
          }, reconnectDelayRef.current);
        }
      };

      ws.current.onerror = () => {
        setIsConnected(false);
        isRoomJoinedRef.current = false;
        setIsRoomJoined(false);
        if (ws.current?.readyState === 1) {
          ws.current.close();
        }
      };

      ws.current.onmessage = (event: MessageEvent) => {
        routeIncomingWsMessage(
          {
            ws,
            userId,
            roomId,
            logout,
            overlayGuardPushed,
            playNotificationSound,
            setMessages,
            messagesRef,
            setPinnedMessages,
            setCurrentPinnedIndex,
            setHistoryLoaded,
            setHistorySessionId,
            setFirstItemIndex,
            setOldestLoadedAt,
            oldestLoadedAtRef,
            setHasMoreOlderMessages,
            hasMoreOlderMessagesRef,
            setHasMoreNewerMessages,
            hasMoreNewerMessagesRef,
            setNewestLoadedAt,
            newestLoadedAtRef,
            setNewMessagesWhileScrolledUp,
            messageTailSnapshotRef,
            groupStartMessageIdsRef,
            hasInitialScrolled,
            initialHistoryBottomStabilized,
            suppressInitialBottomPinRef,
            initialTopMostItemIndexRef,
            normalizeMessage,
            filterVisibleMessages,
            getMessageCursor,
            appendMessageToWindowRef,
            setSearchResults,
            setReplyingTo,
            setOnlineUsers,
            setIsSubmittingReport,
            setReportError,
            setReportReason,
            setReportTargetMessage,
            setIsReportModalVisible,
            lastPingAtRef,
            isRoomJoinedRef,
            setIsRoomJoined,
            setIsConnected,
            pendingOutgoingQueueRef,
            reconnectTimerRef,
            onSessionDisplaced,
            stopReconnect: () => {
              shouldReconnect = false;
            },
            consumeIsInitialHistory: () => {
              const isInitial = !hasLoadedInitialHistory;
              hasLoadedInitialHistory = true;
              return isInitial;
            },
          },
          event.data
        );
      };
    };

    connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTimeRef.current = Date.now();
        // If user was actively typing, stop typing immediately to avoid ghost indicators
        if (presenceActivityRef.current === 'typing') {
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
          }
          lastTypingSentAtRef.current = 0;
          setPresenceActivity(null, true);
        }
      } else if (document.visibilityState === 'visible') {
        if (isTabBlockedRef?.current || isCheckingTabLockRef?.current) return;
        const timeHidden = Date.now() - lastHiddenTimeRef.current;
        const isSocketOpen = ws.current !== null && ws.current.readyState === WebSocket.OPEN;
        if (isSocketOpen && timeHidden > 0 && timeHidden < 5000) return;
        if (ws.current !== null && ws.current.readyState === WebSocket.CONNECTING) return;

        const socketIsAlive =
          isSocketOpen &&
          Date.now() - lastPingAtRef.current < 35000;

        if (socketIsAlive && ws.current) {
          // Probe socket liveness and refresh app-level heartbeat on resume
          try {
            ws.current.send(JSON.stringify({ type: 'ping' }));
          } catch (_) {}
          return;
        }

        if (ws.current) {
          ws.current.onclose = null;
          ws.current.close();
          ws.current = null;
          setIsConnected(false);
          if (isNativeFilePickerOpenRef.current) isNativeFilePickerOpenRef.current = false;
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
          }
          if (stopSendingTimeoutRef.current) {
            clearTimeout(stopSendingTimeoutRef.current);
            stopSendingTimeoutRef.current = null;
          }
          stopHeartbeatForActivity();
          lastTypingSentAtRef.current = 0;
          presenceActivityRef.current = null;
          activeUploadsCountRef.current = 0;
          currentSendingActivityRef.current = null;
        }

        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        reconnectDelayRef.current = 600;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 200);
      }
    };

    const handleOnline = () => connect();

    const handlePageHide = (e: PageTransitionEvent) => {
      if (presenceActivityRef.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          ws.current.send(JSON.stringify({ type: 'stop_typing', roomId }));
        } catch (_) {}
      }
      if (!e.persisted && !isNativeFilePickerOpenRef.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          ws.current.close(1000, 'page_unloading');
        } catch (_) {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      shouldReconnect = false;
      pendingOutgoingQueueRef.current = [];
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (stopSendingTimeoutRef.current) clearTimeout(stopSendingTimeoutRef.current);
      stopHeartbeatForActivity();
      lastTypingSentAtRef.current = 0;
      if (ws.current) {
        const socket = ws.current;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => socket.close();
        } else {
          socket.onopen = null;
          socket.close();
        }
        ws.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [userProfile, roomId, tempToken, userId, tabClaimEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watchdog
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        if (Date.now() - lastPingAtRef.current > 35000) {
          console.warn('Frontend Heartbeat: Dead connection detected. Closing socket to force reconnect.');
          lastPingAtRef.current = Date.now();
          ws.current.close();
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return {
    ws,
    isConnected,
    isRoomJoined,
    isRoomJoinedRef,
    safeSend,
    onlineUsers,
    lastPingAtRef,
    setPresenceActivity,
    handleTyping,
    startSendingActivity,
    stopSendingActivity,
  };
}
