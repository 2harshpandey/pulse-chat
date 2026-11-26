import type React from 'react';
import type { Message } from '../types';
import type { UserProfile } from '../../UserContext';
import { INITIAL_FIRST_ITEM_INDEX, INITIAL_HISTORY_BATCH_SIZE } from '../constants';
import { clearOverlayGuardHistoryEntry, normalizeMessageId, setSessionToken } from '../utils';
import { transferManager } from '../TransferManager';
import { resetMessageWindow } from './chatWindowHelper';

export interface WsMessageRouterContext {
  ws: React.MutableRefObject<WebSocket | null>;
  userId: string;
  roomId: string;
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
  appendMessageToWindowRef: React.MutableRefObject<(msg: Message) => void>;
  setSearchResults: React.Dispatch<React.SetStateAction<Message[] | null>>;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  setOnlineUsers: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  setIsSubmittingReport: React.Dispatch<React.SetStateAction<boolean>>;
  setReportError: React.Dispatch<React.SetStateAction<string>>;
  setReportReason: React.Dispatch<React.SetStateAction<string>>;
  setReportTargetMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  setIsReportModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  lastPingAtRef: React.MutableRefObject<number>;
  isRoomJoinedRef: React.MutableRefObject<boolean>;
  setIsRoomJoined: React.Dispatch<React.SetStateAction<boolean>>;
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
  pendingOutgoingQueueRef: React.MutableRefObject<string[]>;
  reconnectTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onSessionDisplaced?: () => void;
  stopReconnect: () => void;
  consumeIsInitialHistory: () => boolean;
}

function forceSessionLogout(
  ctx: WsMessageRouterContext,
  authErrorMessage: string
): void {
  sessionStorage.setItem('authError', authErrorMessage);
  if (ctx.overlayGuardPushed.current) {
    clearOverlayGuardHistoryEntry();
    ctx.overlayGuardPushed.current = false;
  }
  ctx.logout();
}

function isDeletedOrVanished(msg: any): boolean {
  return Boolean(
    msg?.isDeleted ||
    msg?.vanished ||
    msg?.text === 'This message has been deleted.' ||
    msg?.text === 'This message has been deleted by an admin.'
  );
}

function isHardRemovedForPinOrReply(msg: any): boolean {
  return Boolean(
    msg?.isDeleted ||
    msg?.vanished ||
    msg?.text === 'This message has been deleted by an admin.'
  );
}

function targetMatchesReply(replyingTo: any, update: Message): boolean {
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
}

function handleHistoryFrame(ctx: WsMessageRouterContext, messageData: any): void {
  ctx.hasInitialScrolled.current = false;
  ctx.initialHistoryBottomStabilized.current = false;
  ctx.suppressInitialBottomPinRef.current = false;
  ctx.initialTopMostItemIndexRef.current = null;

  const rawHistory = Array.isArray(messageData.data) ? messageData.data : [];
  const processed = ctx.filterVisibleMessages(rawHistory.map(ctx.normalizeMessage));

  const cursorFromServer =
    typeof messageData.oldestCreatedAt === 'string' && messageData.oldestCreatedAt
      ? messageData.oldestCreatedAt
      : null;
  const nextOldestCursor = cursorFromServer || ctx.getMessageCursor(processed[0]);
  const nextHasMore =
    typeof messageData.hasMoreHistory === 'boolean'
      ? messageData.hasMoreHistory
      : processed.length >= INITIAL_HISTORY_BATCH_SIZE;
  const newestCursor = ctx.getMessageCursor(processed[processed.length - 1]) || null;

  resetMessageWindow({
    messages: processed,
    oldestCursor: nextOldestCursor,
    newestCursor,
    hasMoreOlder: nextHasMore,
    hasMoreNewer: false,
    groupStartMessageIdsRef: ctx.groupStartMessageIdsRef,
    setFirstItemIndex: ctx.setFirstItemIndex,
    messagesRef: ctx.messagesRef,
    setMessages: ctx.setMessages,
    mergeMessagesUpdater: (prev) => {
      const historyIds = new Set<string>();
      const historyTempIds = new Set<string>();
      for (const m of processed) {
        if (m.id) historyIds.add(normalizeMessageId(m.id));
        if ((m as any)._id) historyIds.add(normalizeMessageId((m as any)._id));
        if ((m as any).clientTempId) historyTempIds.add(normalizeMessageId((m as any).clientTempId));
      }
      const inFlightToKeep = prev.filter(m => {
        const normId = normalizeMessageId(m.id);
        const normMongoId = (m as any)._id ? normalizeMessageId((m as any)._id) : '';
        const rawTempId = (m as any).clientTempId;
        const normTempId = rawTempId ? normalizeMessageId(rawTempId) : '';
        const alreadyInHistory = Boolean(
          (normId && (historyIds.has(normId) || historyTempIds.has(normId))) ||
          (normMongoId && (historyIds.has(normMongoId) || historyTempIds.has(normMongoId))) ||
          (normTempId && (historyIds.has(normTempId) || historyTempIds.has(normTempId)))
        );
        if (alreadyInHistory) return false;
        if (m.isUploading || m.uploadError) return true;
        // Never carry forward already-persisted old DB messages that happen to have a clientTempId;
        // only keep genuine local optimistic messages whose id is still the temporary clientTempId.
        return Boolean(normTempId && normId === normTempId && !normMongoId);
      });
      const merged = inFlightToKeep.length === 0 ? processed : [...processed, ...inFlightToKeep];
      if (ctx.messagesRef) ctx.messagesRef.current = merged;
      return merged;
    },
    setOldestLoadedAt: ctx.setOldestLoadedAt,
    oldestLoadedAtRef: ctx.oldestLoadedAtRef,
    setNewestLoadedAt: ctx.setNewestLoadedAt,
    newestLoadedAtRef: ctx.newestLoadedAtRef,
    setHasMoreOlderMessages: ctx.setHasMoreOlderMessages,
    hasMoreOlderMessagesRef: ctx.hasMoreOlderMessagesRef,
    setHasMoreNewerMessages: ctx.setHasMoreNewerMessages,
    hasMoreNewerMessagesRef: ctx.hasMoreNewerMessagesRef,
    setNewMessagesWhileScrolledUp: ctx.setNewMessagesWhileScrolledUp,
    messageTailSnapshotRef: ctx.messageTailSnapshotRef,
  });

  ctx.setHistoryLoaded(true);
  ctx.setHistorySessionId(prev => prev + 1);
  const isInitialHistory = ctx.consumeIsInitialHistory();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('pulse:history_synced', {
        detail: { messages: processed, roomId: ctx.roomId, isInitial: isInitialHistory },
      })
    );
  }
  transferManager.restoreSessionDownloads().catch(console.error);
  transferManager.restoreSessionUploads(ctx.roomId).then((restoredUploads) => {
    if (restoredUploads.length > 0) {
      ctx.setMessages(prev => {
        const existingIds = new Set<string>();
        for (const m of prev) {
          if (m.id) existingIds.add(normalizeMessageId(m.id));
          if ((m as any).clientTempId) existingIds.add(normalizeMessageId((m as any).clientTempId));
        }
        const uniqueRestored = restoredUploads.filter(m => {
          const nId = normalizeMessageId(m.id);
          const nTemp = (m as any).clientTempId ? normalizeMessageId((m as any).clientTempId) : '';
          return (!nId || !existingIds.has(nId)) && (!nTemp || !existingIds.has(nTemp));
        });
        if (uniqueRestored.length === 0) return prev;
        const merged = [...prev, ...uniqueRestored];
        if (ctx.messagesRef) ctx.messagesRef.current = merged;
        return merged;
      });
    }
  });
}

function handleUpdateOrBulkFrame(ctx: WsMessageRouterContext, messageData: any): void {
  const updatedMessages: Message[] =
    messageData.type === 'update'
      ? [ctx.normalizeMessage(messageData.data)]
      : messageData.messages.map(ctx.normalizeMessage);

  const updatedMap = new Map<string, Message>();
  updatedMessages.forEach((m: any) => {
    if (m.id) updatedMap.set(normalizeMessageId(m.id), m);
    if (m._id) updatedMap.set(normalizeMessageId(m._id), m);
  });

  const applyUpdatesToList = (list: Message[]) =>
    list.map(m => {
      const directMatch =
        updatedMap.get(normalizeMessageId(m.id)) ||
        (m._id ? updatedMap.get(normalizeMessageId(m._id)) : undefined);
      if (directMatch) {
        if (isDeletedOrVanished(directMatch)) {
          const {
            text: _t,
            url: _u,
            originalName: _o,
            size: _s,
            duration: _d,
            waveform: _w,
            reactions: _r,
            replyingTo: _rt,
            ...restOld
          } = m;
          return { ...restOld, ...directMatch };
        }
        return { ...m, ...directMatch };
      }
      if (m.replyingTo) {
        const matchingUpdated = updatedMessages.find(u => targetMatchesReply(m.replyingTo, u));
        if (matchingUpdated) {
          if (isDeletedOrVanished(matchingUpdated)) {
            return {
              ...m,
              replyingTo: {
                ...m.replyingTo,
                isDeleted: true,
                deletedBy: matchingUpdated.deletedBy || m.replyingTo.deletedBy,
                text: undefined,
                url: undefined,
                duration: undefined,
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

  ctx.setMessages(prev => applyUpdatesToList(prev));
  ctx.setSearchResults(prev => (prev ? applyUpdatesToList(prev) : null));
  ctx.setReplyingTo(prev => {
    if (!prev) return prev;
    const prevNormId = normalizeMessageId(prev.id);
    const prevNormMongoId = prev._id ? normalizeMessageId(prev._id) : undefined;
    const updatedTarget =
      (prevNormId ? updatedMap.get(prevNormId) : undefined) ||
      (prevNormMongoId ? updatedMap.get(prevNormMongoId) : undefined);
    if (!updatedTarget) return prev;
    if (isHardRemovedForPinOrReply(updatedTarget)) return null;
    return { ...prev, ...updatedTarget };
  });

  const deletedOrVanishedIds = new Set(
    updatedMessages
      .filter(isHardRemovedForPinOrReply)
      .flatMap((m: any) => [normalizeMessageId(m.id), m._id ? normalizeMessageId(m._id) : ''].filter(Boolean))
  );
  ctx.setPinnedMessages(prev =>
    prev
      .filter(p => {
        const pId = normalizeMessageId(p.id);
        const pMongoId = p._id ? normalizeMessageId(p._id) : '';
        return !deletedOrVanishedIds.has(pId) && (!pMongoId || !deletedOrVanishedIds.has(pMongoId));
      })
      .map(p => {
        const match =
          updatedMap.get(normalizeMessageId(p.id)) ||
          (p._id ? updatedMap.get(normalizeMessageId(p._id)) : undefined);
        return match ? { ...p, ...match } : p;
      })
  );
}

function handleIncomingChatMessageFrame(ctx: WsMessageRouterContext, messageData: any): void {
  const normalized = ctx.normalizeMessage(messageData);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pulse:new_message', { detail: { message: normalized, roomId: ctx.roomId } }));
  }
  const isJoinNotification =
    normalized.type === 'system_notification' &&
    /has joined the chat/i.test(normalized.text || '');
  const isIncomingMessage =
    normalized.type !== 'system_notification' && normalized.userId !== ctx.userId;
  if (isJoinNotification || isIncomingMessage) {
    void ctx.playNotificationSound(isJoinNotification ? 'join' : 'message');
  }
  if (messageData.clientTempId) {
    const incomingTempId = normalizeMessageId(messageData.clientTempId);
    const hasLocalOptimisticMatch = Boolean(
      incomingTempId &&
      ctx.messagesRef?.current?.some(
        m =>
          normalizeMessageId(m.id) === incomingTempId ||
          normalizeMessageId((m as any).clientTempId) === incomingTempId ||
          (m.replyingTo &&
            (normalizeMessageId(m.replyingTo.id) === incomingTempId ||
              normalizeMessageId((m.replyingTo as any).clientTempId) === incomingTempId))
      )
    );
    if (hasLocalOptimisticMatch) {
      ctx.setMessages(prev => {
        let matched = false;
        const updated = prev.map(m => {
          if (
            normalizeMessageId(m.id) === incomingTempId ||
            normalizeMessageId((m as any).clientTempId) === incomingTempId
          ) {
            matched = true;
            return {
              ...normalized,
              clientTempId: messageData.clientTempId,
              localBlobUrl: (m as any).localBlobUrl || (normalized as any).localBlobUrl,
            };
          }
          if (
            m.replyingTo &&
            (normalizeMessageId(m.replyingTo.id) === incomingTempId ||
              normalizeMessageId((m.replyingTo as any).clientTempId) === incomingTempId)
          ) {
            const isGroup = Boolean(m.replyingTo.isGroup || m.replyingTo.type === 'group');
            return {
              ...m,
              replyingTo: {
                ...m.replyingTo,
                id: normalized.id,
                url: isGroup ? undefined : (normalized.url || m.replyingTo.url),
                type: isGroup ? 'group' : (normalized.type !== 'system_notification' ? normalized.type : m.replyingTo.type),
              },
            };
          }
          return m;
        });
        const next = matched ? updated : [...updated, normalized];
        if (ctx.messagesRef) ctx.messagesRef.current = next;
        return next;
      });
      if (!ctx.hasMoreNewerMessagesRef.current) {
        const newCursor = ctx.getMessageCursor(normalized) || normalized.createdAt || normalized.timestamp || null;
        if (newCursor) {
          ctx.newestLoadedAtRef.current = newCursor;
          ctx.setNewestLoadedAt(newCursor);
        }
      }
      return;
    }
  }
  ctx.appendMessageToWindowRef.current(normalized);
}

/**
 * Routes parsed incoming WebSocket JSON frames to the appropriate chat state handlers.
 */
export function routeIncomingWsMessage(ctx: WsMessageRouterContext, eventData: string): void {
  let messageData: any;
  try {
    messageData = JSON.parse(eventData);
  } catch (parseErr) {
    console.warn('[WebSocket] Malformed non-JSON frame received:', parseErr);
    return;
  }
  if (!messageData || typeof messageData !== 'object') return;

  switch (messageData.type) {
    case 'ping':
      ctx.lastPingAtRef.current = Date.now();
      if (ctx.ws.current && ctx.ws.current.readyState === WebSocket.OPEN) {
        try {
          ctx.ws.current.send(JSON.stringify({ type: 'pong' }));
        } catch (_) {}
      }
      return;

    case 'pong':
      ctx.lastPingAtRef.current = Date.now();
      return;

    case 'auth_success':
      ctx.isRoomJoinedRef.current = true;
      ctx.setIsRoomJoined(true);
      if (messageData.sessionToken) {
        setSessionToken(messageData.sessionToken, ctx.roomId);
      }
      if (ctx.ws.current && ctx.ws.current.readyState === WebSocket.OPEN) {
        try {
          while (ctx.pendingOutgoingQueueRef.current.length > 0) {
            const queued = ctx.pendingOutgoingQueueRef.current.shift();
            if (queued) ctx.ws.current.send(queued);
          }
        } catch (queueErr) {
          console.warn('Failed to flush queued outgoing frames after auth_success:', queueErr);
        }
      }
      return;

    case 'force_logout':
      forceSessionLogout(ctx, messageData.message || 'You have been logged out.');
      return;

    case 'session_displaced':
      ctx.stopReconnect();
      if (ctx.reconnectTimerRef.current) {
        clearTimeout(ctx.reconnectTimerRef.current);
        ctx.reconnectTimerRef.current = null;
      }
      if (ctx.ws.current) {
        ctx.ws.current.onclose = null;
        ctx.ws.current.close();
        ctx.ws.current = null;
      }
      ctx.setIsConnected(false);
      ctx.isRoomJoinedRef.current = false;
      ctx.setIsRoomJoined(false);
      ctx.onSessionDisplaced?.();
      return;

    case 'username_taken':
      console.warn('Username collision detected - terminating reconnect loop');
      if (ctx.reconnectTimerRef.current) {
        clearTimeout(ctx.reconnectTimerRef.current);
        ctx.reconnectTimerRef.current = null;
      }
      if (ctx.ws.current) {
        ctx.ws.current.onclose = null;
        ctx.ws.current.close();
      }
      ctx.setIsConnected(false);
      forceSessionLogout(ctx, messageData.message || 'This username is active in another session.');
      return;

    case 'error':
      console.warn('[WebSocket Error Frame]', messageData.message);
      if (typeof messageData.message === 'string' && /authentication required/i.test(messageData.message)) {
        if (ctx.reconnectTimerRef.current) {
          clearTimeout(ctx.reconnectTimerRef.current);
          ctx.reconnectTimerRef.current = null;
        }
        if (ctx.ws.current) {
          ctx.ws.current.onclose = null;
          ctx.ws.current.close();
        }
        ctx.setIsConnected(false);
        forceSessionLogout(ctx, messageData.message);
      }
      return;

    case 'pinned_messages_update': {
      const rawPins = Array.isArray(messageData.data) ? messageData.data : [];
      const normalizedPins = rawPins.map(ctx.normalizeMessage);
      const validPins = normalizedPins.filter(
        (m: any) => m && !m.isDeleted && !m.vanished && m.text !== 'This message has been deleted by an admin.'
      );
      ctx.setPinnedMessages(validPins);
      ctx.setCurrentPinnedIndex(prev => {
        if (validPins.length === 0) return 0;
        return prev >= validPins.length ? 0 : prev;
      });
      return;
    }

    case 'history':
      handleHistoryFrame(ctx, messageData);
      return;

    case 'online_users':
      ctx.setOnlineUsers(messageData.data);
      return;

    case 'report_submitted':
      ctx.setIsSubmittingReport(false);
      ctx.setReportError('');
      ctx.setReportReason('');
      ctx.setReportTargetMessage(null);
      ctx.setIsReportModalVisible(false);
      return;

    case 'report_error':
      ctx.setIsSubmittingReport(false);
      ctx.setReportError(
        typeof messageData.message === 'string'
          ? messageData.message
          : 'Failed to submit report. Please try again.'
      );
      return;

    case 'chat_cleared':
    case 'chat_hidden_for_everyone':
      ctx.setMessages([]);
      ctx.setPinnedMessages([]);
      ctx.setCurrentPinnedIndex(0);
      ctx.setNewMessagesWhileScrolledUp(0);
      ctx.messageTailSnapshotRef.current = { length: 0, lastId: null };
      ctx.setHasMoreOlderMessages(false);
      ctx.hasMoreOlderMessagesRef.current = false;
      ctx.setOldestLoadedAt(null);
      ctx.oldestLoadedAtRef.current = null;
      ctx.setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pulse:chat_cleared', { detail: { roomId: ctx.roomId } }));
      }
      return;

    case 'delete': {
      const targetId = normalizeMessageId(messageData.id);
      const deletedSet = new Set([targetId].filter(Boolean));
      const filterAndTombstone = (list: Message[]) =>
        list
          .filter(m => normalizeMessageId(m.id) !== targetId && normalizeMessageId((m as any)._id) !== targetId)
          .map(m => {
            if (!m.replyingTo) return m;
            const rtId = normalizeMessageId(m.replyingTo.id);
            const rtMongoId = normalizeMessageId((m.replyingTo as any)._id);
            const rtMsgId = normalizeMessageId((m.replyingTo as any).messageId);
            if (deletedSet.has(rtId) || deletedSet.has(rtMongoId) || deletedSet.has(rtMsgId)) {
              return {
                ...m,
                replyingTo: {
                  ...m.replyingTo,
                  isDeleted: true,
                  text: undefined,
                  url: undefined,
                },
              };
            }
            return m;
          });
      ctx.setMessages(prev => filterAndTombstone(prev));
      ctx.setSearchResults(prev => (prev ? filterAndTombstone(prev) : null));
      ctx.setReplyingTo(prev => (prev && (normalizeMessageId(prev.id) === targetId || normalizeMessageId((prev as any)._id) === targetId) ? null : prev));
      ctx.setPinnedMessages(prev => prev.filter(p => normalizeMessageId(p.id) !== targetId));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pulse:message_deleted', { detail: { ids: [messageData.id] } }));
      }
      return;
    }

    case 'update':
    case 'bulk_update':
      handleUpdateOrBulkFrame(ctx, messageData);
      return;

    case 'bulk_delete': {
      const deletedIds = new Set(
        (Array.isArray(messageData.messageIds) ? messageData.messageIds : [])
          .map((id: any) => normalizeMessageId(id))
          .filter(Boolean)
      );
      const filterAndTombstone = (list: Message[]) =>
        list
          .filter(m => !deletedIds.has(normalizeMessageId(m.id)) && !deletedIds.has(normalizeMessageId((m as any)._id)))
          .map(m => {
            if (!m.replyingTo) return m;
            const rtId = normalizeMessageId(m.replyingTo.id);
            const rtMongoId = normalizeMessageId((m.replyingTo as any)._id);
            const rtMsgId = normalizeMessageId((m.replyingTo as any).messageId);
            if (deletedIds.has(rtId) || deletedIds.has(rtMongoId) || deletedIds.has(rtMsgId)) {
              return {
                ...m,
                replyingTo: {
                  ...m.replyingTo,
                  isDeleted: true,
                  text: undefined,
                  url: undefined,
                },
              };
            }
            return m;
          });
      ctx.setMessages(prev => filterAndTombstone(prev));
      ctx.setSearchResults(prev => (prev ? filterAndTombstone(prev) : null));
      ctx.setReplyingTo(prev => (prev && (deletedIds.has(normalizeMessageId(prev.id)) || deletedIds.has(normalizeMessageId((prev as any)._id))) ? null : prev));
      ctx.setPinnedMessages(prev => prev.filter(p => !deletedIds.has(normalizeMessageId(p.id))));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pulse:message_deleted', { detail: { ids: messageData.messageIds } }));
      }
      return;
    }

    default:
      handleIncomingChatMessageFrame(ctx, messageData);
  }
}
