import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message } from '../types';
import type { UserProfile, PresenceActivity } from '../../UserContext';
import { clearOverlayGuardHistoryEntry, resolveApiBaseUrl, isGroupStartMessage, getSessionToken, setSessionToken, normalizeMessageId } from '../utils';
import { transferManager } from '../TransferManager';
import { INITIAL_HISTORY_BATCH_SIZE, INITIAL_FIRST_ITEM_INDEX } from '../constants';
import { initTelemetryContext, updateTelemetryWs } from '../telemetry';

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
      // Buffer in-flight message while connecting, closed, or awaiting auth_success
      pendingOutgoingQueueRef.current.push(data);
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
    (activity: PresenceActivity) => {
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
            startHeartbeatForActivity(nextActivity);
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
        ws.current?.send(
          JSON.stringify({
            type: 'user_join',
            ...(userProfile || {}),
            userId: effectiveUserId,
            roomId,
            sessionToken,
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

      ws.current.onmessage = async (event: MessageEvent) => {
        let messageData: any;
        try {
          messageData = JSON.parse(event.data);
        } catch (parseErr) {
          console.warn('[WebSocket] Malformed non-JSON frame received:', parseErr);
          return;
        }
        if (!messageData || typeof messageData !== 'object') return;
        if (messageData.type === 'ping') {
          lastPingAtRef.current = Date.now();
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            try {
              ws.current.send(JSON.stringify({ type: 'pong' }));
            } catch (_) {}
          }
          return;
        }
        if (messageData.type === 'pong') {
          lastPingAtRef.current = Date.now();
          return;
        }
        if (messageData.type === 'auth_success') {
          isRoomJoinedRef.current = true;
          setIsRoomJoined(true);
          if (messageData.sessionToken) {
            setSessionToken(messageData.sessionToken, roomId);
          }
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            try {
              while (pendingOutgoingQueueRef.current.length > 0) {
                const queued = pendingOutgoingQueueRef.current.shift();
                if (queued) ws.current.send(queued);
              }
            } catch (queueErr) {
              console.warn('Failed to flush queued outgoing frames after auth_success:', queueErr);
            }
          }
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
          console.warn('Username collision detected - terminating reconnect loop');
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          if (ws.current) {
            ws.current.onclose = null;
            ws.current.close();
          }
          setIsConnected(false);
          sessionStorage.setItem('authError', messageData.message || 'This username is active in another session.');
          if (overlayGuardPushed.current) {
            clearOverlayGuardHistoryEntry();
            overlayGuardPushed.current = false;
          }
          logout();
          return;
        }
        if (messageData.type === 'error') {
          console.warn('[WebSocket Error Frame]', messageData.message);
          if (typeof messageData.message === 'string' && /authentication required/i.test(messageData.message)) {
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }
            if (ws.current) {
              ws.current.onclose = null;
              ws.current.close();
            }
            setIsConnected(false);
            sessionStorage.setItem('authError', messageData.message);
            if (overlayGuardPushed.current) {
              clearOverlayGuardHistoryEntry();
              overlayGuardPushed.current = false;
            }
            logout();
          }
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
            if (isGroupStartMessage(current, prev)) {
              groupStartMessageIdsRef.current.add(current.id);
            }
          }

          setMessages(prev => {
            const historyIds = new Set(processed.map(m => m.id));
            const inFlightToKeep = prev.filter(m => {
              if (m.isUploading || m.uploadError) return true;
              const tempId = (m as any).clientTempId;
              if (tempId && !historyIds.has(tempId) && !historyIds.has(m.id)) return true;
              return false;
            });
            if (inFlightToKeep.length === 0) return processed;
            return [...processed, ...inFlightToKeep];
          });
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
          const targetMatches = (replyingTo: any, update: Message): boolean => {
            if (!replyingTo || !update) return false;
            const replyIds = [
              normalizeMessageId(replyingTo.id),
              normalizeMessageId(replyingTo._id),
              normalizeMessageId(replyingTo.messageId),
              normalizeMessageId(replyingTo.clientTempId),
            ].filter(Boolean);
            const updateIds = [
              normalizeMessageId(update.id),
              normalizeMessageId(update._id),
              normalizeMessageId((update as any).clientTempId),
            ].filter(Boolean);
            return replyIds.some(rid => updateIds.includes(rid));
          };

          const updateMsgInList = (list: Message[]) =>
            list.map(m => {
              if (m.id === normalizedUpdate.id || (normalizedUpdate._id && m._id === normalizedUpdate._id)) {
                return { ...m, ...normalizedUpdate };
              }
              if (m.replyingTo && targetMatches(m.replyingTo, normalizedUpdate)) {
                if (
                  normalizedUpdate.isDeleted ||
                  normalizedUpdate.vanished ||
                  normalizedUpdate.text === 'This message has been deleted.' ||
                  normalizedUpdate.text === 'This message has been deleted by an admin.'
                ) {
                  return {
                    ...m,
                    replyingTo: {
                      ...m.replyingTo,
                      isDeleted: true,
                      deletedBy: normalizedUpdate.deletedBy || m.replyingTo.deletedBy,
                      text: undefined,
                      url: undefined,
                    },
                  };
                }
                if (normalizedUpdate.edited && normalizedUpdate.text && !m.replyingTo.isGroup && m.replyingTo.type !== 'group') {
                  return {
                    ...m,
                    replyingTo: {
                      ...m.replyingTo,
                      text: normalizedUpdate.text,
                      edited: true,
                    },
                  };
                }
              }
              return m;
            });
          setMessages(prev => updateMsgInList(prev));
          setSearchResults(prev => (prev ? updateMsgInList(prev) : null));
          setReplyingTo(prev => {
            if (prev && (prev.id === normalizedUpdate.id || (normalizedUpdate._id && prev._id === normalizedUpdate._id))) {
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
            setPinnedMessages(prev => prev.filter(p => p.id !== normalizedUpdate.id && (!normalizedUpdate._id || p._id !== normalizedUpdate._id)));
          } else {
            setPinnedMessages(prev =>
              prev.map(p => (p.id === normalizedUpdate.id || (normalizedUpdate._id && p._id === normalizedUpdate._id) ? { ...p, ...normalizedUpdate } : p))
            );
          }
        } else if (messageData.type === 'bulk_update') {
          const updatedMessages = messageData.messages.map(normalizeMessage);
          const targetMatches = (replyingTo: any, update: Message): boolean => {
            if (!replyingTo || !update) return false;
            const replyIds = [
              normalizeMessageId(replyingTo.id),
              normalizeMessageId(replyingTo._id),
              normalizeMessageId(replyingTo.messageId),
              normalizeMessageId(replyingTo.clientTempId),
            ].filter(Boolean);
            const updateIds = [
              normalizeMessageId(update.id),
              normalizeMessageId(update._id),
              normalizeMessageId((update as any).clientTempId),
            ].filter(Boolean);
            return replyIds.some(rid => updateIds.includes(rid));
          };

          const updatedMap = new Map<string, Message>();
          updatedMessages.forEach((m: any) => {
            if (m.id) updatedMap.set(normalizeMessageId(m.id), m);
            if (m._id) updatedMap.set(normalizeMessageId(m._id), m);
          });

          const applyBulkUpdate = (list: Message[]) =>
            list.map(m => {
              const directMatch = updatedMap.get(normalizeMessageId(m.id)) || (m._id ? updatedMap.get(normalizeMessageId(m._id)) : undefined);
              if (directMatch) return { ...m, ...directMatch };
              if (m.replyingTo) {
                const matchingUpdated = updatedMessages.find((u: any) => targetMatches(m.replyingTo, u));
                if (matchingUpdated) {
                  if (
                    matchingUpdated.isDeleted ||
                    matchingUpdated.vanished ||
                    matchingUpdated.text === 'This message has been deleted.' ||
                    matchingUpdated.text === 'This message has been deleted by an admin.'
                  ) {
                    return {
                      ...m,
                      replyingTo: {
                        ...m.replyingTo,
                        isDeleted: true,
                        deletedBy: matchingUpdated.deletedBy || m.replyingTo.deletedBy,
                        text: undefined,
                        url: undefined,
                      },
                    };
                  }
                  if (matchingUpdated.edited && matchingUpdated.text && !m.replyingTo.isGroup && m.replyingTo.type !== 'group') {
                    return {
                      ...m,
                      replyingTo: {
                        ...m.replyingTo,
                        text: matchingUpdated.text,
                        edited: true,
                      },
                    };
                  }
                }
              }
              return m;
            });
          setMessages(prev => applyBulkUpdate(prev));
          setSearchResults(prev => (prev ? applyBulkUpdate(prev) : null));
          setReplyingTo(prev => {
            if (prev) {
              const prevNormId = normalizeMessageId(prev.id);
              const prevNormMongoId = prev._id ? normalizeMessageId(prev._id) : undefined;
              const updatedTarget =
                (prevNormId ? updatedMap.get(prevNormId) : undefined) ||
                (prevNormMongoId ? updatedMap.get(prevNormMongoId) : undefined);
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
          setPinnedMessages(prev =>
            prev
              .filter(p => !deletedOrVanishedIds.has(p.id))
              .map(p => (updatedMap.has(p.id) ? { ...p, ...(updatedMap.get(p.id) as Message) } : p))
          );
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
            setMessages(prev => {
              let matched = false;
              const updated = prev.map(m => {
                if (m.id === messageData.clientTempId || (m as any).clientTempId === messageData.clientTempId) {
                  matched = true;
                  return {
                    ...normalized,
                    clientTempId: messageData.clientTempId,
                    localBlobUrl: (m as any).localBlobUrl || (normalized as any).localBlobUrl,
                  };
                }
                if (m.replyingTo && (m.replyingTo.id === messageData.clientTempId || (m.replyingTo as any).clientTempId === messageData.clientTempId)) {
                  const isGroup = Boolean(m.replyingTo.isGroup || m.replyingTo.type === 'group');
                  return {
                    ...m,
                    replyingTo: {
                      ...m.replyingTo,
                      id: normalized.id,
                      url: isGroup ? undefined : (normalized.url || m.replyingTo.url),
                      type: isGroup ? 'group' : (normalized.type !== 'system_notification' ? normalized.type : m.replyingTo.type),
                    }
                  };
                }
                return m;
              });
              return matched ? updated : [...updated, normalized];
            });
            return;
          }
          appendMessageToWindowRef.current(normalized);
        }
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
        const timeHidden = Date.now() - lastHiddenTimeRef.current;
        if (timeHidden > 0 && timeHidden < 5000) return;
        if (ws.current !== null && ws.current.readyState === WebSocket.CONNECTING) return;

        const socketIsAlive =
          ws.current !== null &&
          ws.current.readyState === WebSocket.OPEN &&
          Date.now() - lastPingAtRef.current < 35000;

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

    const handlePageHide = () => {
      if (presenceActivityRef.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          ws.current.send(JSON.stringify({ type: 'stop_typing', roomId }));
        } catch (_) {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      shouldReconnect = false;
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
  }, [userProfile, roomId, tempToken, userId]); // eslint-disable-line react-hooks/exhaustive-deps

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
