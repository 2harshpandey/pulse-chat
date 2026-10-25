import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message } from '../types';
import type { UserProfile } from '../../UserContext';
import { clearOverlayGuardHistoryEntry, resolveApiBaseUrl } from '../utils';
import { transferManager } from '../TransferManager';
import { INITIAL_HISTORY_BATCH_SIZE, INITIAL_FIRST_ITEM_INDEX } from '../constants';

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
}: UseChatWebSocketProps) {
  const internalWs = useRef<WebSocket | null>(null);
  const ws = externalWs || internalWs;
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const lastPingAtRef = useRef<number>(Date.now());
  const lastHiddenTimeRef = useRef<number>(Date.now());

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef<number>(600);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingCooldownRef = useRef(false);
  const presenceActivityRef = useRef<'typing' | 'gif_selecting' | null>(null);

  const appendMessageToWindowRef = useRef(appendMessageToWindow);
  useEffect(() => {
    appendMessageToWindowRef.current = appendMessageToWindow;
  }, [appendMessageToWindow]);

  const setPresenceActivity = useCallback(
    (nextActivity: 'typing' | 'gif_selecting' | null) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      if (presenceActivityRef.current === nextActivity) return;

      try {
        if (nextActivity) {
          ws.current.send(JSON.stringify({ type: 'start_typing', activity: nextActivity, roomId }));
        } else {
          ws.current.send(JSON.stringify({ type: 'stop_typing', roomId }));
        }
        presenceActivityRef.current = nextActivity;
      } catch (_) {
        // Best effort
      }
    },
    [roomId]
  );

  const handleTyping = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (ws.current.bufferedAmount > 4096) return;

    if (!typingCooldownRef.current || presenceActivityRef.current !== 'typing') {
      typingCooldownRef.current = true;
      setPresenceActivity('typing');
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setPresenceActivity(null);
      typingTimeoutRef.current = null;
      typingCooldownRef.current = false;
    }, 3000);
  }, [setPresenceActivity]);

  useEffect(() => {
    if (!userProfile) return;

    let shouldReconnect = true;

    const connect = () => {
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

      let wsUrl = `${wsUrlBase}?userId=${userId}`;
      if (tempToken) wsUrl += `&token=${tempToken}`;
      else if (roomId) wsUrl += `&roomId=${roomId}`;

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        reconnectDelayRef.current = 600;
        presenceActivityRef.current = null;
        ws.current?.send(
          JSON.stringify({ type: 'user_join', ...(userProfile || {}), userId, roomId })
        );
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        if (isNativeFilePickerOpenRef.current) {
          isNativeFilePickerOpenRef.current = false;
        }
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        typingCooldownRef.current = false;
        presenceActivityRef.current = null;
        console.log('WebSocket disconnected — scheduling reconnect');
        if (shouldReconnect) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 1.5, 10000);
            connect();
          }, reconnectDelayRef.current);
        }
      };

      ws.current.onerror = () => {
        setIsConnected(false);
        if (ws.current?.readyState === 1) {
          ws.current.close();
        }
      };

      ws.current.onmessage = async (event: MessageEvent) => {
        const messageData = JSON.parse(event.data);
        if (messageData.type === 'ping') {
          lastPingAtRef.current = Date.now();
          return;
        }
        if (messageData.type === 'force_logout') {
          sessionStorage.setItem('authError', messageData.message || 'You have been logged out.');
          if (overlayGuardPushed.current) {
            clearOverlayGuardHistoryEntry();
            overlayGuardPushed.current = false;
          }
          logout();
          return;
        }
        if (messageData.type === 'username_taken') {
          console.warn('Username collision during reconnect — retrying session in 2.5s');
          if (ws.current) {
            ws.current.close();
          }
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, 2500);
          return;
        }
        if (messageData.type === 'pinned_messages_update') {
          const rawPins = Array.isArray(messageData.data) ? messageData.data : [];
          const normalizedPins = rawPins.map(normalizeMessage);
          const validPins = normalizedPins.filter(
            (m: any) => m && !m.isDeleted && !m.vanished && m.text !== 'This message has been deleted by an admin.'
          );
          setPinnedMessages(validPins);
          setCurrentPinnedIndex(prev => {
            if (validPins.length === 0) return 0;
            return prev >= validPins.length ? 0 : prev;
          });
          return;
        }
        if (messageData.type === 'history') {
          hasInitialScrolled.current = false;
          initialHistoryBottomStabilized.current = false;
          suppressInitialBottomPinRef.current = false;
          initialTopMostItemIndexRef.current = null;
          const rawHistory = Array.isArray(messageData.data) ? messageData.data : [];
          const processed = filterVisibleMessages(rawHistory.map(normalizeMessage));

          groupStartMessageIdsRef.current.clear();
          for (let i = 0; i < processed.length; i++) {
            const current = processed[i];
            const prev = i > 0 ? processed[i - 1] : null;
            if (!prev || prev.type === 'system_notification' || prev.userId !== current.userId) {
              groupStartMessageIdsRef.current.add(current.id);
            }
          }

          setMessages(processed);
          setNewMessagesWhileScrolledUp(0);
          messageTailSnapshotRef.current = {
            length: processed.length,
            lastId: processed.length > 0 ? processed[processed.length - 1].id : null,
          };
          setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
          const cursorFromServer =
            typeof messageData.oldestCreatedAt === 'string' && messageData.oldestCreatedAt
              ? messageData.oldestCreatedAt
              : null;
          const nextOldestCursor = cursorFromServer || getMessageCursor(processed[0]);
          setOldestLoadedAt(nextOldestCursor);
          oldestLoadedAtRef.current = nextOldestCursor;
          const nextHasMore =
            typeof messageData.hasMoreHistory === 'boolean'
              ? messageData.hasMoreHistory
              : processed.length >= INITIAL_HISTORY_BATCH_SIZE;
          setHasMoreOlderMessages(nextHasMore);
          hasMoreOlderMessagesRef.current = nextHasMore;

          const newestCursor = getMessageCursor(processed[processed.length - 1]) || null;
          newestLoadedAtRef.current = newestCursor;
          setNewestLoadedAt(newestCursor);
          setHasMoreNewerMessages(false);
          hasMoreNewerMessagesRef.current = false;

          setHistoryLoaded(true);
          setHistorySessionId(prev => prev + 1);
          transferManager.restoreSessionDownloads().catch(console.error);
          transferManager.restoreSessionUploads().then((restoredUploads) => {
            if (restoredUploads.length > 0) {
              setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const uniqueRestored = restoredUploads.filter(m => !existingIds.has(m.id));
                return [...prev, ...uniqueRestored];
              });
            }
          });
        } else if (messageData.type === 'online_users') {
          setOnlineUsers(messageData.data);
        } else if (messageData.type === 'report_submitted') {
          setIsSubmittingReport(false);
          setReportError('');
          setReportReason('');
          setReportTargetMessage(null);
          setIsReportModalVisible(false);
        } else if (messageData.type === 'report_error') {
          setIsSubmittingReport(false);
          setReportError(
            typeof messageData.message === 'string'
              ? messageData.message
              : 'Failed to submit report. Please try again.'
          );
        } else if (messageData.type === 'chat_cleared' || messageData.type === 'chat_hidden_for_everyone') {
          setMessages([]);
          setPinnedMessages([]);
          setCurrentPinnedIndex(0);
          setNewMessagesWhileScrolledUp(0);
          messageTailSnapshotRef.current = { length: 0, lastId: null };
          setHasMoreOlderMessages(false);
          hasMoreOlderMessagesRef.current = false;
          setOldestLoadedAt(null);
          oldestLoadedAtRef.current = null;
          setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
        } else if (messageData.type === 'delete') {
          const targetId = messageData.id;
          setMessages(prev => prev.filter(m => m.id !== targetId));
          setSearchResults(prev => (prev ? prev.filter(m => m.id !== targetId) : null));
          setReplyingTo(prev => (prev && prev.id === targetId ? null : prev));
          setPinnedMessages(prev => prev.filter(p => p.id !== targetId));
        } else if (messageData.type === 'update') {
          const normalizedUpdate = normalizeMessage(messageData.data);
          const updateMsgInList = (list: Message[]) =>
            list.map(m => {
              if (m.id === normalizedUpdate.id) return { ...m, ...normalizedUpdate };
              if (normalizedUpdate.isDeleted && m.replyingTo && m.replyingTo.id === normalizedUpdate.id) {
                return { ...m, replyingTo: { ...m.replyingTo, isDeleted: true } };
              }
              return m;
            });
          setMessages(prev => updateMsgInList(prev));
          setSearchResults(prev => (prev ? updateMsgInList(prev) : null));
          setReplyingTo(prev => {
            if (prev && prev.id === normalizedUpdate.id) {
              if (
                normalizedUpdate.isDeleted ||
                normalizedUpdate.vanished ||
                normalizedUpdate.text === 'This message has been deleted by an admin.'
              ) {
                return null;
              }
              return { ...prev, ...normalizedUpdate };
            }
            return prev;
          });
          if (
            normalizedUpdate.isDeleted ||
            normalizedUpdate.vanished ||
            normalizedUpdate.text === 'This message has been deleted by an admin.'
          ) {
            setPinnedMessages(prev => prev.filter(p => p.id !== normalizedUpdate.id));
          }
        } else if (messageData.type === 'bulk_update') {
          const updatedMessages = messageData.messages.map(normalizeMessage);
          const updatedIds = new Set(updatedMessages.map((m: any) => m.id));
          const updatedMap = new Map<string, Message>(updatedMessages.map((m: any) => [m.id, m]));

          const applyBulkUpdate = (list: Message[]) =>
            list.map(m => {
              if (updatedMap.has(m.id)) return { ...m, ...(updatedMap.get(m.id) as Message) };
              if (m.replyingTo && updatedIds.has(m.replyingTo.id)) {
                const updatedTarget = updatedMap.get(m.replyingTo.id);
                if (updatedTarget && updatedTarget.isDeleted) {
                  return { ...m, replyingTo: { ...m.replyingTo, isDeleted: true } };
                }
              }
              return m;
            });
          setMessages(prev => applyBulkUpdate(prev));
          setSearchResults(prev => (prev ? applyBulkUpdate(prev) : null));
          setReplyingTo(prev => {
            if (prev && updatedIds.has(prev.id)) {
              const updatedTarget = updatedMap.get(prev.id);
              if (updatedTarget) {
                if (
                  updatedTarget.isDeleted ||
                  updatedTarget.vanished ||
                  updatedTarget.text === 'This message has been deleted by an admin.'
                ) {
                  return null;
                }
                return { ...prev, ...updatedTarget };
              }
            }
            return prev;
          });
          const deletedOrVanishedIds = new Set(
            updatedMessages
              .filter(
                (m: any) =>
                  m.isDeleted ||
                  m.vanished ||
                  m.text === 'This message has been deleted by an admin.'
              )
              .map((m: any) => m.id)
          );
          if (deletedOrVanishedIds.size > 0) {
            setPinnedMessages(prev => prev.filter(p => !deletedOrVanishedIds.has(p.id)));
          }
        } else if (messageData.type === 'bulk_delete') {
          const deletedIds = new Set(messageData.messageIds);
          setMessages(prev => prev.filter(m => !deletedIds.has(m.id)));
          setSearchResults(prev => (prev ? prev.filter(m => !deletedIds.has(m.id)) : null));
          setReplyingTo(prev => {
            if (prev && deletedIds.has(prev.id)) return null;
            return prev;
          });
          setPinnedMessages(prev => prev.filter(p => !deletedIds.has(p.id)));
        } else {
          const normalized = normalizeMessage(messageData);
          const isJoinNotification =
            normalized.type === 'system_notification' &&
            /has joined the chat/i.test(normalized.text || '');
          const isIncomingMessage =
            normalized.type !== 'system_notification' && normalized.userId !== userId;
          if (isJoinNotification || isIncomingMessage) {
            void playNotificationSound(isJoinNotification ? 'join' : 'message');
          }
          if (messageData.clientTempId) {
            setMessages(prev => prev.map(m => {
              if (m.id === messageData.clientTempId || (m as any).clientTempId === messageData.clientTempId) {
                return {
                  ...normalized,
                  clientTempId: messageData.clientTempId,
                  localBlobUrl: (m as any).localBlobUrl || (normalized as any).localBlobUrl,
                };
              }
              if (m.replyingTo && (m.replyingTo.id === messageData.clientTempId || (m.replyingTo as any).clientTempId === messageData.clientTempId)) {
                return {
                  ...m,
                  replyingTo: {
                    ...m.replyingTo,
                    id: normalized.id,
                    url: normalized.url || m.replyingTo.url,
                    type: normalized.type !== 'system_notification' ? normalized.type : m.replyingTo.type,
                  }
                };
              }
              return m;
            }));
          }
          appendMessageToWindowRef.current(normalized);
        }
      };
    };

    connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const timeHidden = Date.now() - lastHiddenTimeRef.current;
        if (timeHidden > 0 && timeHidden < 5000) return;
        if (ws.current !== null && ws.current.readyState === WebSocket.CONNECTING) return;

        const socketIsAlive =
          ws.current !== null &&
          ws.current.readyState === WebSocket.OPEN &&
          Date.now() - lastPingAtRef.current < 25000;

        if (socketIsAlive) return;

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
          typingCooldownRef.current = false;
          presenceActivityRef.current = null;
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

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      shouldReconnect = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
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
    };
  }, [userProfile, roomId, tempToken, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watchdog
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        if (Date.now() - lastPingAtRef.current > 25000) {
          console.warn('Frontend Heartbeat: Dead connection detected. Closing socket to force reconnect.');
          ws.current.close();
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return {
    ws,
    isConnected,
    onlineUsers,
    lastPingAtRef,
    setPresenceActivity,
    handleTyping,
  };
}
