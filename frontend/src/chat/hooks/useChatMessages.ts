import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message } from '../types';
import {
  INITIAL_HISTORY_BATCH_SIZE,
  HISTORY_PAGE_SIZE,
  MAX_MESSAGES_WINDOW,
  INITIAL_FIRST_ITEM_INDEX,
  START_REACHED_COOLDOWN_MS,
  MAX_NEW_MESSAGE_INDICATOR_COUNT,
  scrollLog,
  filterValidReactions,
} from '../constants';
import {
  normalizeMessageId,
  getDeletedForMeIds,
  copyTextToClipboard,
  sanitizeMediaUrl,
  findMessageElement,
} from '../utils';
import { albumDownloadManager } from '../albumDownloadManager';

export interface UseChatMessagesProps {
  userId: string;
  roomId: string;
  apiBase: string;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottomRef: React.MutableRefObject<boolean>;
  inputMessageRef: React.MutableRefObject<string>;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  resetInputLayerHeight: () => void;
  syncInputLayerLayout: (textarea?: HTMLTextAreaElement | null, value?: string, shouldMaintainBottom?: boolean) => void;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  scrollToBottom: (behavior?: 'auto' | 'smooth', force?: boolean) => void;
  syncBottomStateFromScroller: () => void;
  setNewMessagesWhileScrolledUp: React.Dispatch<React.SetStateAction<number>>;
}

export function useChatMessages({
  userId,
  roomId,
  apiBase,
  chatContainerRef,
  isAtBottomRef,
  inputMessageRef,
  setInputMessage,
  resetInputLayerHeight,
  syncInputLayerLayout,
  messageInputRef,
  scrollToBottom,
  syncBottomStateFromScroller,
  setNewMessagesWhileScrolledUp,
}: UseChatMessagesProps) {
  // Messages & Pagination
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const [isJumpingToPinned, setIsJumpingToPinned] = useState(false);

  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historySessionId, setHistorySessionId] = useState(0);

  const [firstItemIndex, setFirstItemIndexState] = useState(INITIAL_FIRST_ITEM_INDEX);
  const firstItemIndexRef = useRef(INITIAL_FIRST_ITEM_INDEX);

  const setFirstItemIndex = useCallback((valOrUpdater: number | ((prev: number) => number)) => {
    setFirstItemIndexState((prev) => {
      const next = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater;
      firstItemIndexRef.current = next;
      scrollLog('firstItemIndex →', next);
      return next;
    });
  }, []);

  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
  const hasMoreOlderMessagesRef = useRef(hasMoreOlderMessages);
  const [oldestLoadedAt, setOldestLoadedAt] = useState<string | null>(null);
  const oldestLoadedAtRef = useRef<string | null>(null);

  const [hasMoreNewerMessages, setHasMoreNewerMessages] = useState(false);
  const hasMoreNewerMessagesRef = useRef(false);
  const [newestLoadedAt, setNewestLoadedAt] = useState<string | null>(null);
  const newestLoadedAtRef = useRef<string | null>(null);

  const isLoadingOlderRef = useRef(false);
  const isLoadingNewerRef = useRef(false);
  const lastStartReachedAtRef = useRef<number>(0);
  const lastEndReachedAtRef = useRef<number>(0);
  const prependScrollLockRef = useRef<number>(0);

  const groupStartMessageIdsRef = useRef<Set<string>>(new Set());
  const messageTailSnapshotRef = useRef<{ length: number; lastId: string | null }>({ length: 0, lastId: null });
  const scrollAnchorRef = useRef<{ id: string; top: number } | null>(null);
  const previousScrollMetricsRef = useRef<{ height: number; top: number } | null>(null);

  // Message Actions: Reply, Edit, Delete, Select, Report, Reactions
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const replyPreviewRef = useRef<HTMLDivElement>(null);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageOriginalText, setEditingMessageOriginalText] = useState<string>('');
  const [priorDraftBeforeEdit, setPriorDraftBeforeEdit] = useState<string>('');

  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const copiedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCopiedToast = useCallback(() => {
    if (copiedToastTimerRef.current) clearTimeout(copiedToastTimerRef.current);
    setShowCopiedToast(true);
    copiedToastTimerRef.current = setTimeout(() => setShowCopiedToast(false), 2000);
  }, []);

  const [albumDownloadToast, setAlbumDownloadToast] = useState<string | null>(null);
  const albumDownloadToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerAlbumDownloadToast = useCallback((message = 'Album download is already in progress') => {
    if (albumDownloadToastTimerRef.current) clearTimeout(albumDownloadToastTimerRef.current);
    setAlbumDownloadToast(message);
    albumDownloadToastTimerRef.current = setTimeout(() => setAlbumDownloadToast(null), 2500);
  }, []);

  useEffect(() => {
    return albumDownloadManager.onAlreadyInProgress(() => {
      triggerAlbumDownloadToast('Album download is already in progress');
    });
  }, [triggerAlbumDownloadToast]);

  useEffect(() => {
    return () => {
      if (copiedToastTimerRef.current) clearTimeout(copiedToastTimerRef.current);
      if (albumDownloadToastTimerRef.current) clearTimeout(albumDownloadToastTimerRef.current);
    };
  }, []);

  // Sync refs
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreOlderMessagesRef.current = hasMoreOlderMessages;
  }, [hasMoreOlderMessages]);

  useEffect(() => {
    oldestLoadedAtRef.current = oldestLoadedAt;
  }, [oldestLoadedAt]);

  const normalizeMessage = useCallback((msg: any): Message => {
    const normalizedId = normalizeMessageId(msg?.id ?? msg?._id);
    const normalizedReplyId = normalizeMessageId(msg?.replyingTo?.id ?? msg?.replyingTo?.messageId ?? msg?.replyingTo?._id);
    const baseMsg: any = {
      ...msg,
      ...(normalizedId ? { id: normalizedId } : {}),
      ...(msg?.replyingTo && normalizedReplyId
        ? { replyingTo: { ...msg.replyingTo, id: normalizedReplyId } }
        : {}),
    };

    if (baseMsg.reactions) {
      return { ...baseMsg, reactions: filterValidReactions(baseMsg.reactions) } as Message;
    }
    return baseMsg as Message;
  }, []);

  const getMessageCursor = useCallback((msg?: Message): string | null => {
    if (!msg) return null;
    return msg.createdAt || msg.timestamp || null;
  }, []);

  const markDeletedReplyTargets = useCallback((list: Message[], deletedIds: Set<string>): Message[] => {
    if (list.length === 0) return list;
    const messageById = new Map<string, Message>();
    for (const msg of list) {
      if (msg.id) messageById.set(normalizeMessageId(msg.id), msg);
      if ((msg as any)._id) messageById.set(normalizeMessageId((msg as any)._id), msg);
      if ((msg as any).clientTempId) messageById.set(normalizeMessageId((msg as any).clientTempId), msg);
    }

    return list.map((m) => {
      if (!m.replyingTo) return m;

      const targetId = normalizeMessageId(m.replyingTo.id);
      const target = targetId ? messageById.get(targetId) : undefined;

      const isDeleted =
        (targetId && deletedIds.has(targetId)) ||
        (target && target.isDeleted) ||
        Boolean(m.replyingTo.isDeleted);

      let changed = false;
      const updatedReply = { ...m.replyingTo };

      if (isDeleted !== m.replyingTo.isDeleted) {
        updatedReply.isDeleted = isDeleted;
        changed = true;
      }

      if (target) {
        if (target.id && m.replyingTo.id !== target.id) {
          updatedReply.id = target.id;
          changed = true;
        }
        if (target.url && (!m.replyingTo.url || m.replyingTo.url.startsWith('blob:'))) {
          updatedReply.url = target.url;
          changed = true;
        }
        if (target.type && target.type !== 'system_notification' && m.replyingTo.type !== target.type) {
          updatedReply.type = target.type;
          changed = true;
        }
        if (target.text && !target.isDeleted && m.replyingTo.text !== target.text) {
          updatedReply.text = target.text;
          changed = true;
        }
        if (target.deletedBy && updatedReply.deletedBy !== target.deletedBy) {
          updatedReply.deletedBy = target.deletedBy;
          changed = true;
        }
      }

      return changed ? { ...m, replyingTo: updatedReply } : m;
    });
  }, []);

  const filterVisibleMessages = useCallback((allMsgs: Message[]): Message[] => {
    const clearTs = Number(localStorage.getItem(`pulseClearTimestamp_${userId}`) || '0');
    const deletedForMeIds = getDeletedForMeIds(userId);
    const filtered = (clearTs > 0
      ? allMsgs.filter(m => m.type === 'system_notification' || new Date(m.timestamp).getTime() > clearTs)
      : allMsgs
    ).filter(m => !deletedForMeIds.has(m.id));
    const deletedIds = new Set(filtered.filter(m => m.isDeleted).map(m => m.id));
    return markDeletedReplyTargets(filtered, deletedIds);
  }, [markDeletedReplyTargets, userId]);

  // Append message to sliding window
  const appendMessageToWindow = useCallback((msg: Message) => {
    if (hasMoreNewerMessagesRef.current) {
      if (msg.type !== 'system_notification' && msg.userId !== userId) {
        setNewMessagesWhileScrolledUp(prev => Math.min(prev + 1, MAX_NEW_MESSAGE_INDICATOR_COUNT));
      }
      return;
    }

    if (!isAtBottomRef.current) {
      if (msg.type !== 'system_notification' && msg.userId !== userId) {
        setNewMessagesWhileScrolledUp(prev => Math.min(prev + 1, MAX_NEW_MESSAGE_INDICATOR_COUNT));
      }
    }

    const current = messagesRef.current;
    if (msg.id && current.some((m) => m.id === msg.id)) return;
    if (msg.id && getDeletedForMeIds(userId).has(msg.id)) return;

    const prevMsg = current.length > 0 ? current[current.length - 1] : null;
    if (!prevMsg || prevMsg.type === 'system_notification' || prevMsg.userId !== msg.userId) {
      groupStartMessageIdsRef.current.add(msg.id);
    }

    const newCursor = getMessageCursor(msg) || msg.createdAt || msg.timestamp || null;
    if (newCursor) {
      newestLoadedAtRef.current = newCursor;
      setNewestLoadedAt(newCursor);
    }

    let nextMessages = [...current, msg];
    if (nextMessages.length > MAX_MESSAGES_WINDOW) {
      const evictCount = nextMessages.length - MAX_MESSAGES_WINDOW;
      const firstKept = nextMessages[evictCount];
      const newOldestCursor = getMessageCursor(firstKept) || oldestLoadedAtRef.current;
      oldestLoadedAtRef.current = newOldestCursor;
      setOldestLoadedAt(newOldestCursor);
      setHasMoreOlderMessages(true);
      hasMoreOlderMessagesRef.current = true;
      const nextIdx = firstItemIndexRef.current + evictCount;
      firstItemIndexRef.current = nextIdx;
      setFirstItemIndexState(nextIdx);

      if (!isAtBottomRef.current && firstKept?.id) {
        const anchorEl = findMessageElement(firstKept.id);
        if (anchorEl) {
          scrollAnchorRef.current = { id: firstKept.id, top: anchorEl.getBoundingClientRect().top };
        }
      }

      nextMessages = nextMessages.slice(evictCount);
    }

    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }, [getMessageCursor, isAtBottomRef, setNewMessagesWhileScrolledUp, userId]);

  // Prepend older messages
  const fetchAndPrependOlderMessages = useCallback(async (beforeCursor: string, limitOverride?: number) => {
    const before = encodeURIComponent(beforeCursor);
    const limit = limitOverride || HISTORY_PAGE_SIZE;
    const res = await fetch(`${apiBase}/api/messages?before=${before}&limit=${limit}`, {
      headers: { 'x-room-id': roomId }
    });
    if (!res.ok) throw new Error('Failed to fetch older messages');

    const payload = await res.json();
    const rawBatch: any[] = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload.messages) ? payload.messages : []);
    const hasMore = Array.isArray(payload)
      ? rawBatch.length >= limit
      : Boolean(payload.hasMore);

    if (rawBatch.length === 0) {
      setHasMoreOlderMessages(false);
      hasMoreOlderMessagesRef.current = false;
      return { prependedCount: 0, hasMore: false, nextCursor: oldestLoadedAtRef.current };
    }

    const normalizedBatch = rawBatch.map(normalizeMessage);
    const filteredBatch = filterVisibleMessages(normalizedBatch);
    const nextCursor = getMessageCursor(normalizedBatch[0]) || beforeCursor;

    for (let i = 0; i < filteredBatch.length; i++) {
      const current = filteredBatch[i];
      const prev = i > 0 ? filteredBatch[i - 1] : null;
      if (!prev || prev.type === 'system_notification' || prev.userId !== current.userId) {
        groupStartMessageIdsRef.current.add(current.id);
      }
    }

    setOldestLoadedAt(nextCursor);
    oldestLoadedAtRef.current = nextCursor;

    const existingIdsSnapshot = new Set(messagesRef.current.map((m) => m.id));
    const prependedCount = filteredBatch.reduce((count, m) => count + (existingIdsSnapshot.has(m.id) ? 0 : 1), 0);

    const prev = messagesRef.current;
    const prevIds = new Set(prev.map((m) => m.id));
    const uniqueOlder = filteredBatch.filter((m) => !prevIds.has(m.id));

    if (uniqueOlder.length > 0) {
      const combinedDeletedIds = new Set(
        [...prev, ...uniqueOlder].filter((m) => m.isDeleted).map((m) => m.id)
      );
      const patchedOlder = markDeletedReplyTargets(uniqueOlder, combinedDeletedIds);
      const patchedPrev = markDeletedReplyTargets(prev, combinedDeletedIds);

      const actualPrependedCount = patchedOlder.length;
      if (actualPrependedCount > 0) {
        const nextIdx = firstItemIndexRef.current - actualPrependedCount;
        let nextMessages = [...patchedOlder, ...patchedPrev];

        if (nextMessages.length > MAX_MESSAGES_WINDOW) {
          const evictCount = nextMessages.length - MAX_MESSAGES_WINDOW;
          const lastKept = nextMessages[MAX_MESSAGES_WINDOW - 1];
          const newNewestCursor = getMessageCursor(lastKept) || newestLoadedAtRef.current;
          newestLoadedAtRef.current = newNewestCursor;
          setNewestLoadedAt(newNewestCursor);
          setHasMoreNewerMessages(true);
          hasMoreNewerMessagesRef.current = true;
          nextMessages = nextMessages.slice(0, MAX_MESSAGES_WINDOW);
        }

        const scroller = chatContainerRef.current;
        const anchorId = prev[0]?.id;
        const anchorEl = anchorId ? findMessageElement(anchorId) : null;
        if (anchorEl) {
          scrollAnchorRef.current = { id: anchorId, top: anchorEl.getBoundingClientRect().top };
        }
        if (scroller) {
          previousScrollMetricsRef.current = { height: scroller.scrollHeight, top: scroller.scrollTop };
        }

        firstItemIndexRef.current = nextIdx;
        setFirstItemIndexState(nextIdx);
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        prependScrollLockRef.current = performance.now() + 800;
      }
    }

    setHasMoreOlderMessages(hasMore);
    hasMoreOlderMessagesRef.current = hasMore;

    return { prependedCount, hasMore, nextCursor };
  }, [apiBase, chatContainerRef, filterVisibleMessages, getMessageCursor, markDeletedReplyTargets, normalizeMessage, roomId]);

  const loadOlderMessages = useCallback(async () => {
    if (!historyLoaded || isLoadingOlderRef.current || !hasMoreOlderMessagesRef.current || !oldestLoadedAtRef.current) return;

    const now = performance.now();
    if (now - lastStartReachedAtRef.current < START_REACHED_COOLDOWN_MS) return;
    lastStartReachedAtRef.current = now;

    isLoadingOlderRef.current = true;
    try {
      const res = await fetchAndPrependOlderMessages(oldestLoadedAtRef.current);
      if (res.hasMore && chatContainerRef.current) {
        const scroller = chatContainerRef.current;
        // If user is still near the top after prepending, continue loading older messages seamlessly
        if (scroller.scrollTop < 1200) {
          window.setTimeout(() => {
            if (!isLoadingOlderRef.current && hasMoreOlderMessagesRef.current) {
              void loadOlderMessages();
            }
          }, 150);
        }
      }
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      isLoadingOlderRef.current = false;
    }
  }, [chatContainerRef, fetchAndPrependOlderMessages, historyLoaded]);

  // Append newer messages
  const fetchAndAppendNewerMessages = useCallback(async (afterCursor: string, limitOverride?: number) => {
    const after = encodeURIComponent(afterCursor);
    const limit = limitOverride || HISTORY_PAGE_SIZE;
    const res = await fetch(`${apiBase}/api/messages?after=${after}&limit=${limit}`, {
      headers: { 'x-room-id': roomId }
    });
    if (!res.ok) throw new Error('Failed to fetch newer messages');

    const payload = await res.json();
    const rawBatch: any[] = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload.messages) ? payload.messages : []);
    const serverHasMore: boolean = Array.isArray(payload)
      ? rawBatch.length >= limit
      : Boolean(payload.hasMore);

    if (rawBatch.length === 0) {
      setHasMoreNewerMessages(false);
      hasMoreNewerMessagesRef.current = false;
      return;
    }

    const normalizedBatch = rawBatch.map(normalizeMessage);
    const filteredBatch = filterVisibleMessages(normalizedBatch);

    const newNewestCursor = getMessageCursor(normalizedBatch[normalizedBatch.length - 1]) || afterCursor;
    newestLoadedAtRef.current = newNewestCursor;
    setNewestLoadedAt(newNewestCursor);

    const currentMessages = messagesRef.current;
    const existingIds = new Set(currentMessages.map((m) => m.id));
    const uniqueNewer = filteredBatch.filter((m) => !existingIds.has(m.id));

    if (uniqueNewer.length > 0) {
      const combinedDeletedIds = new Set(
        [...currentMessages, ...uniqueNewer].filter((m) => m.isDeleted).map((m) => m.id)
      );
      const patchedNewer = markDeletedReplyTargets(uniqueNewer, combinedDeletedIds);
      const patchedCurrent = markDeletedReplyTargets(currentMessages, combinedDeletedIds);

      let nextMessages = [...patchedCurrent, ...patchedNewer];

      if (nextMessages.length > MAX_MESSAGES_WINDOW) {
        const evictCount = nextMessages.length - MAX_MESSAGES_WINDOW;
        const firstKept = nextMessages[evictCount];
        const anchorEl = firstKept?.id ? findMessageElement(firstKept.id) : null;
        if (anchorEl) {
          scrollAnchorRef.current = { id: firstKept.id, top: anchorEl.getBoundingClientRect().top };
        }
        const newOldestCursor = getMessageCursor(firstKept) || oldestLoadedAtRef.current;
        oldestLoadedAtRef.current = newOldestCursor;
        setOldestLoadedAt(newOldestCursor);
        setHasMoreOlderMessages(true);
        hasMoreOlderMessagesRef.current = true;
        const nextIdx = firstItemIndexRef.current + evictCount;
        firstItemIndexRef.current = nextIdx;
        setFirstItemIndexState(nextIdx);
        nextMessages = nextMessages.slice(evictCount);
      }

      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      messageTailSnapshotRef.current = {
        length: nextMessages.length,
        lastId: nextMessages.length > 0 ? nextMessages[nextMessages.length - 1].id : null,
      };
    }

    setHasMoreNewerMessages(serverHasMore);
    hasMoreNewerMessagesRef.current = serverHasMore;
  }, [apiBase, filterVisibleMessages, getMessageCursor, markDeletedReplyTargets, normalizeMessage, roomId]);

  const loadNewerMessages = useCallback(async () => {
    if (!historyLoaded || isLoadingNewerRef.current || !hasMoreNewerMessagesRef.current || !newestLoadedAtRef.current) return;
    const now = performance.now();
    if (now - lastEndReachedAtRef.current < START_REACHED_COOLDOWN_MS) return;
    lastEndReachedAtRef.current = now;

    isLoadingNewerRef.current = true;
    try {
      await fetchAndAppendNewerMessages(newestLoadedAtRef.current);
    } catch (err) {
      console.error('Failed to load newer messages:', err);
    } finally {
      isLoadingNewerRef.current = false;
    }
  }, [fetchAndAppendNewerMessages, historyLoaded]);

  // Jump to latest messages
  const jumpToLatestMessages = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/messages?limit=${INITIAL_HISTORY_BATCH_SIZE}`, {
        headers: { 'x-room-id': roomId }
      });
      if (!res.ok) return;
      const payload = await res.json();
      const rawBatch: any[] = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload.messages) ? payload.messages : []);
      const serverHasMore: boolean = Boolean(payload.hasMore);
      const normalized = filterVisibleMessages(rawBatch.map(normalizeMessage));
      const deletedIds = new Set(normalized.filter((m) => m.isDeleted).map((m) => m.id));
      const patched = markDeletedReplyTargets(normalized, deletedIds);

      groupStartMessageIdsRef.current.clear();
      for (let i = 0; i < patched.length; i++) {
        const current = patched[i];
        const prev = i > 0 ? patched[i - 1] : null;
        if (!prev || prev.type === 'system_notification' || prev.userId !== current.userId) {
          groupStartMessageIdsRef.current.add(current.id);
        }
      }

      setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
      firstItemIndexRef.current = INITIAL_FIRST_ITEM_INDEX;
      messagesRef.current = patched;
      setMessages(patched);

      const oldest = patched.length > 0 ? (payload.oldestCreatedAt || getMessageCursor(patched[0])) : null;
      oldestLoadedAtRef.current = oldest;
      setOldestLoadedAt(oldest);

      const newest = patched.length > 0 ? getMessageCursor(patched[patched.length - 1]) : null;
      newestLoadedAtRef.current = newest;
      setNewestLoadedAt(newest);

      setHasMoreOlderMessages(serverHasMore);
      hasMoreOlderMessagesRef.current = serverHasMore;
      setHasMoreNewerMessages(false);
      hasMoreNewerMessagesRef.current = false;
      setNewMessagesWhileScrolledUp(0);
      messageTailSnapshotRef.current = {
        length: patched.length,
        lastId: patched.length > 0 ? patched[patched.length - 1].id : null,
      };

      scrollToBottom('auto', true);
      requestAnimationFrame(() => syncBottomStateFromScroller());
    } catch (err) {
      console.error('Failed to jump to latest messages:', err);
    }
  }, [apiBase, filterVisibleMessages, getMessageCursor, markDeletedReplyTargets, normalizeMessage, roomId, scrollToBottom, setFirstItemIndex, setNewMessagesWhileScrolledUp, syncBottomStateFromScroller]);


  const handleSetReply = useCallback((message: Message) => {
    if (message.type === 'system_notification') return;
    setReplyingTo(message);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, [messageInputRef]);

  // Edit handlers
  const handleStartEdit = useCallback((message: Message) => {
    const draft = inputMessageRef.current;
    setPriorDraftBeforeEdit(draft);
    setEditingMessageOriginalText(message.text || '');
    setEditingMessageId(message.id);
    setInputMessage(message.text || '');
    requestAnimationFrame(() => {
      const ta = messageInputRef.current;
      if (ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
        syncInputLayerLayout(ta, message.text || '', true);
      }
    });
  }, [inputMessageRef, messageInputRef, setInputMessage, syncInputLayerLayout]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingMessageOriginalText('');
    setInputMessage(priorDraftBeforeEdit);
    setPriorDraftBeforeEdit('');
    resetInputLayerHeight();
    requestAnimationFrame(() => { messageInputRef.current?.focus(); });
  }, [messageInputRef, priorDraftBeforeEdit, resetInputLayerHeight, setInputMessage]);

  // Copy handler
  const handleCopy = useCallback(async (message: Message) => {
    try {
      if (message.type === 'image' && message.url) {
        const url = sanitizeMediaUrl(message.url);
        if (url && typeof navigator !== 'undefined' && navigator.clipboard?.write && window.isSecureContext) {
          try {
            const blobPromise = fetch(url)
              .then(res => res.blob())
              .then(blob => {
                if (blob.type === 'image/png') return blob;
                return new Promise<Blob>((resolve, reject) => {
                  const img = new Image();
                  img.crossOrigin = 'anonymous';
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    canvas.getContext('2d')!.drawImage(img, 0, 0);
                    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
                    URL.revokeObjectURL(img.src);
                  };
                  img.onerror = () => reject(new Error('Image load failed'));
                  img.src = URL.createObjectURL(blob);
                });
              });
            const item = new ClipboardItem({ 'image/png': blobPromise });
            await navigator.clipboard.write([item]);
            triggerCopiedToast();
            return;
          } catch (imgErr) {
            console.warn('Image blob clipboard copy failed, falling back to text/URL:', imgErr);
          }
        }
      }

      const textToCopy = message.text || message.url || '';
      if (textToCopy) {
        const success = await copyTextToClipboard(textToCopy);
        if (success) {
          triggerCopiedToast();
        }
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
      try {
        const fallbackText = message.text || message.url || '';
        if (fallbackText) {
          const success = await copyTextToClipboard(fallbackText);
          if (success) triggerCopiedToast();
        }
      } catch {
        /* silently fail */
      }
    }
  }, [triggerCopiedToast]);

  return {
    messages,
    setMessages,
    messagesRef,
    pinnedMessages,
    setPinnedMessages,
    currentPinnedIndex,
    setCurrentPinnedIndex,
    isJumpingToPinned,
    setIsJumpingToPinned,
    historyLoaded,
    setHistoryLoaded,
    historySessionId,
    setHistorySessionId,
    firstItemIndex,
    setFirstItemIndex,
    firstItemIndexRef,
    hasMoreOlderMessages,
    setHasMoreOlderMessages,
    hasMoreOlderMessagesRef,
    oldestLoadedAt,
    setOldestLoadedAt,
    oldestLoadedAtRef,
    hasMoreNewerMessages,
    setHasMoreNewerMessages,
    hasMoreNewerMessagesRef,
    newestLoadedAt,
    setNewestLoadedAt,
    newestLoadedAtRef,
    isLoadingOlderRef,
    isLoadingNewerRef,
    groupStartMessageIdsRef,
    messageTailSnapshotRef,
    scrollAnchorRef,
    previousScrollMetricsRef,
    normalizeMessage,
    getMessageCursor,
    markDeletedReplyTargets,
    filterVisibleMessages,
    appendMessageToWindow,
    fetchAndPrependOlderMessages,
    loadOlderMessages,
    fetchAndAppendNewerMessages,
    loadNewerMessages,
    jumpToLatestMessages,
    replyingTo,
    setReplyingTo,
    replyPreviewRef,
    handleSetReply,
    editingMessageId,
    setEditingMessageId,
    editingMessageOriginalText,
    priorDraftBeforeEdit,
    handleStartEdit,
    handleCancelEdit,
    showCopiedToast,
    triggerCopiedToast,
    albumDownloadToast,
    triggerAlbumDownloadToast,
    handleCopy,
  };
}
