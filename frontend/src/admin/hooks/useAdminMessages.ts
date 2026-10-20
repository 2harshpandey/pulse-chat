import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { UserProfile } from '../types';
import { isGifLog, isPhotoLog, isVideoLog, isDocumentLog } from '../utils';

interface UseAdminMessagesOptions {
  apiUrl: string;
  apiHeaders: () => Record<string, string>;
  users: UserProfile[];
  ws: React.MutableRefObject<WebSocket | null>;
}

export function useAdminMessages({ apiUrl, apiHeaders, users, ws }: UseAdminMessagesOptions) {
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteAction, setBulkDeleteAction] = useState<'hide' | 'delete'>('hide');
  const [bulkDeleteVanish, setBulkDeleteVanish] = useState(false);
  const [displayedLogsCount, setDisplayedLogsCount] = useState(50);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [oldestLogCursor, setOldestLogCursor] = useState<string | null>(null);
  const [isLoadingMoreLogs, setIsLoadingMoreLogs] = useState(false);

  const [pinTargetId, setPinTargetId] = useState<string | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDuration, setPinDuration] = useState<number | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);

  // Message Log filters
  const [filterMessageId, setFilterMessageId] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterEventType, setFilterEventType] = useState('All');
  const [filterContent, setFilterContent] = useState('');

  // Reset displayed logs when filters change
  useEffect(() => {
    setDisplayedLogsCount(50);
  }, [filterMessageId, filterUser, filterEventType, filterContent]);

  // --- Pin Actions ---
  const submitPin = (replaceOldest = false) => {
    if (!pinTargetId) {
      alert('Error: Message ID could not be identified for pinning.');
      return;
    }
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: 'pin_message',
          messageId: pinTargetId,
          durationMs: pinDuration,
          replaceOldest,
        })
      );
    }
    setShowPinModal(false);
    setShowReplaceModal(false);
    setPinTargetId(null);
  };

  const handleConfirmDuration = () => {
    if (pinnedMessages.length >= 4) {
      setShowPinModal(false);
      setShowReplaceModal(true);
    } else {
      submitPin(false);
    }
  };

  const handleInitiatePin = (messageId: string) => {
    setPinTargetId(messageId);
    setPinDuration(24 * 60 * 60 * 1000);
    setShowPinModal(true);
  };

  const handleUnpin = (messageId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'unpin_message', messageId }));
    }
  };

  // --- Selection & Bulk Actions ---
  const extractMessageId = (log: any) => log.messageId || log.message?.id || log.message?._id || log._id;

  const enrichedHistoryLogs = useMemo(() => {
    const userMap = new Map(users.map((u) => [u.userId, u.username]));
    return historyLogs.map((log) => {
      let resolvedUsername = log.username;
      if (!resolvedUsername || resolvedUsername === 'Unknown') {
        resolvedUsername = userMap.get(log.userId) || 'Unknown';
      }
      return { ...log, username: resolvedUsername };
    });
  }, [historyLogs, users]);

  const filteredHistoryLogs = useMemo(() => {
    return enrichedHistoryLogs.filter((log) => {
      const messageIdMatch = filterMessageId
        ? (log.messageId || log.message?.id)?.toLowerCase().includes(filterMessageId.toLowerCase())
        : true;
      const userMatch = filterUser ? (log.username || '').toLowerCase().includes(filterUser.toLowerCase()) : true;
      let eventTypeMatch = true;
      if (filterEventType === 'All') {
        eventTypeMatch = true;
      } else if (filterEventType === 'Deleted by admin') {
        eventTypeMatch = log.message?.deletedBy === 'admin' || log.message?.vanished === true;
      } else if (filterEventType === 'Create') {
        eventTypeMatch = log.type === 'create';
      } else if (filterEventType === 'Edit') {
        eventTypeMatch = log.type === 'edit';
      } else if (filterEventType === 'Upload') {
        eventTypeMatch = log.type === 'upload';
      } else if (filterEventType === 'Delete (Everyone)') {
        eventTypeMatch = log.type === 'delete_everyone' || log.type === 'delete';
      } else if (filterEventType === 'Photo') {
        eventTypeMatch = log.type === 'create' && isPhotoLog(log);
      } else if (filterEventType === 'Video') {
        eventTypeMatch = log.type === 'create' && isVideoLog(log);
      } else if (filterEventType === 'GIF') {
        eventTypeMatch = log.type === 'create' && isGifLog(log);
      } else if (filterEventType === 'Document') {
        eventTypeMatch = log.type === 'create' && isDocumentLog(log);
      } else if (filterEventType === 'Pinned Messages') {
        const id = extractMessageId(log);
        const isCurrentlyPinned = Boolean(
          id && pinnedMessages.some((p: any) => p.id === id || p._id === id || (p.messageId && p.messageId === id))
        );
        const hasPinnedField = Boolean(log.message?.pinned?.pinnedAt || log.pinned?.pinnedAt);
        eventTypeMatch = isCurrentlyPinned || (pinnedMessages.length === 0 && hasPinnedField);
      } else {
        eventTypeMatch = log.type === filterEventType.toLowerCase().replace(' (everyone)', '_everyone');
      }

      const contentMatch = !filterContent
        ? true
        : (() => {
            const lc = filterContent.toLowerCase();
            if (log.type === 'create' && log.message?.text) return log.message.text.toLowerCase().includes(lc);
            if (log.type === 'edit')
              return log.oldText?.toLowerCase().includes(lc) || log.newText?.toLowerCase().includes(lc);
            if ((log.type === 'delete_everyone' || log.type === 'delete') && log.deletedContent?.text)
              return log.deletedContent.text.toLowerCase().includes(lc);
            if (log.type === 'upload' && log.file?.originalname)
              return log.file.originalname.toLowerCase().includes(lc);
            return false;
          })();
      return messageIdMatch && userMatch && eventTypeMatch && contentMatch;
    });
  }, [enrichedHistoryLogs, filterMessageId, filterUser, filterEventType, filterContent, pinnedMessages]);

  const laterDeletedByUserIds = useMemo(() => {
    const ids = new Set<string>();
    enrichedHistoryLogs.forEach((log) => {
      if (log.type === 'delete_everyone' || log.type === 'delete') {
        const id = extractMessageId(log);
        if (id) ids.add(id);
      }
      if (log.message?.isDeleted && log.message?.deletedBy && log.message.deletedBy !== 'admin') {
        const id = extractMessageId(log);
        if (id) ids.add(id);
      }
    });
    return ids;
  }, [enrichedHistoryLogs]);

  const validSelectionLogs = useMemo(() => {
    return filteredHistoryLogs.filter((log) => !!extractMessageId(log));
  }, [filteredHistoryLogs]);

  const uniqueValidMessageIds = useMemo(() => {
    const ids = new Set<string>();
    validSelectionLogs.forEach((log) => {
      const id = extractMessageId(log);
      if (id) ids.add(id);
    });
    return ids;
  }, [validSelectionLogs]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedMessages(new Set(uniqueValidMessageIds));
    } else {
      setSelectedMessages(new Set());
    }
  };

  const handleSelectMessage = (id: string, checked: boolean) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkActionSubmit = async () => {
    if (selectedMessages.size === 0) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/messages/bulk-action`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          messageIds: Array.from(selectedMessages),
          action: bulkDeleteAction,
          vanish: bulkDeleteVanish,
        }),
      });
      if (res.ok) {
        setSelectedMessages(new Set());
        setShowBulkDeleteModal(false);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to perform bulk action.');
      }
    } catch (err) {
      console.error('Bulk action error:', err);
      alert('An error occurred while performing the bulk action.');
    }
  };

  const getBackendFilterType = (filter: string): string => {
    switch (filter) {
      case 'Photo': return 'photo';
      case 'Video': return 'video';
      case 'GIF': return 'gif';
      case 'Document': return 'document';
      case 'Pinned Messages': return 'pinned';
      case 'Deleted by admin': return 'deleted_by_admin';
      case 'Create': return 'create';
      case 'Edit': return 'edit';
      case 'Upload': return 'upload';
      case 'Delete (Everyone)': return 'delete_everyone';
      default: return '';
    }
  };

  // Re-fetch from server when dropdown filter changes so the server query is exact
  const isFirstMountRef = React.useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    let isCancelled = false;
    setIsLoadingMoreLogs(true);
    setDisplayedLogsCount(50);

    const typeParam = getBackendFilterType(filterEventType);
    let url = `${apiUrl}/api/admin/history?limit=100`;
    if (typeParam) {
      url += `&type=${encodeURIComponent(typeParam)}`;
    }
    if (filterMessageId) url += `&messageId=${encodeURIComponent(filterMessageId)}`;
    if (filterUser) url += `&user=${encodeURIComponent(filterUser)}`;
    if (filterContent) url += `&content=${encodeURIComponent(filterContent)}`;

    fetch(url, { headers: apiHeaders() })
      .then((res) => (res.ok ? res.json() : { events: [], hasMore: false }))
      .then((data) => {
        if (isCancelled) return;
        const incoming = Array.isArray(data) ? data : data.events || [];
        const nextHasMore = Array.isArray(data) ? data.length >= 100 : Boolean(data.hasMore);
        const nextOldestCursor = Array.isArray(data)
          ? incoming.length > 0
            ? incoming[incoming.length - 1].createdAt
            : null
          : data.oldestCreatedAt;

        let finalIncoming = incoming;
        if (filterEventType === 'Pinned Messages' && pinnedMessages.length > 0) {
          const existingIds = new Set(incoming.map((i: any) => extractMessageId(i)));
          const missingPins = pinnedMessages.filter((p: any) => !existingIds.has(p.id));
          if (missingPins.length > 0) {
            const syntheticEvents = missingPins.map((p: any) => ({
              _id: p._id || p.id,
              roomId: p.roomId || 'me',
              type: 'create',
              messageId: p.id,
              message: p,
              userId: p.userId || 'unknown',
              username: p.username || p.sender || 'Unknown',
              timestamp: p.timestamp || p.createdAt || new Date(),
              createdAt: p.createdAt || p.timestamp || new Date(),
            }));
            finalIncoming = [...incoming, ...syntheticEvents];
          }
        }

        setHistoryLogs(finalIncoming);
        setHasMoreLogs(filterEventType === 'Pinned Messages' ? false : nextHasMore);
        setOldestLogCursor(filterEventType === 'Pinned Messages' ? null : nextOldestCursor);
      })
      .catch((err) => {
        console.error('Failed to fetch filtered logs:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingMoreLogs(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [filterEventType, filterMessageId, filterUser, filterContent, apiUrl, apiHeaders, pinnedMessages]);

  const loadMoreLogs = useCallback(async () => {
    // If we already have more filtered logs in memory than currently displayed, reveal 50 more
    if (displayedLogsCount < filteredHistoryLogs.length) {
      setDisplayedLogsCount((prev) => prev + 50);
      return;
    }

    // Pinned messages are loaded all at once; no pagination exists for pinned messages
    if (filterEventType === 'Pinned Messages') {
      setHasMoreLogs(false);
      return;
    }

    // Otherwise, if the server has more older logs, fetch the next batch from the server
    if (!hasMoreLogs || !oldestLogCursor || isLoadingMoreLogs) return;

    setIsLoadingMoreLogs(true);
    let cursor = oldestLogCursor;
    let scans = 0;
    const maxScans = 10;
    const typeParam = getBackendFilterType(filterEventType);

    try {
      while (cursor && scans < maxScans) {
        scans++;
        let url = `${apiUrl}/api/admin/history?limit=100&before=${encodeURIComponent(cursor)}`;
        if (typeParam) {
          url += `&type=${encodeURIComponent(typeParam)}`;
        }
        if (filterMessageId) url += `&messageId=${encodeURIComponent(filterMessageId)}`;
        if (filterUser) url += `&user=${encodeURIComponent(filterUser)}`;
        if (filterContent) url += `&content=${encodeURIComponent(filterContent)}`;

        const res = await fetch(url, { headers: apiHeaders() });
        if (!res.ok) break;

        const data = await res.json();
        const incoming = Array.isArray(data) ? data : data.events || [];
        const nextHasMore = Array.isArray(data) ? data.length >= 100 : Boolean(data.hasMore);
        const nextOldestCursor = Array.isArray(data)
          ? incoming.length > 0
            ? incoming[incoming.length - 1].createdAt
            : null
          : data.oldestCreatedAt;

        let addedCount = 0;
        setHistoryLogs((prev) => {
          const existingIds = new Set(prev.map((item) => item._id || extractMessageId(item)));
          const uniqueIncoming = incoming.filter(
            (item: any) => !existingIds.has(item._id || extractMessageId(item))
          );
          addedCount = uniqueIncoming.length;
          return [...prev, ...uniqueIncoming];
        });

        cursor = nextOldestCursor;
        setHasMoreLogs(nextHasMore);
        setOldestLogCursor(nextOldestCursor);
        setDisplayedLogsCount((prev) => prev + 50);

        // Stop scanning if matching items were added, or if there are no more logs on the server
        if (addedCount > 0 || !nextHasMore || !nextOldestCursor) {
          break;
        }
      }
    } catch (err) {
      console.error('Failed to load older logs:', err);
    } finally {
      setIsLoadingMoreLogs(false);
    }
  }, [
    displayedLogsCount,
    filteredHistoryLogs.length,
    hasMoreLogs,
    oldestLogCursor,
    isLoadingMoreLogs,
    filterEventType,
    filterMessageId,
    filterUser,
    filterContent,
    apiUrl,
    apiHeaders,
  ]);

  return {
    historyLogs,
    setHistoryLogs,
    enrichedHistoryLogs,
    filteredHistoryLogs,
    laterDeletedByUserIds,
    uniqueValidMessageIds,
    pinnedMessages,
    setPinnedMessages,
    selectedMessages,
    setSelectedMessages,
    showBulkDeleteModal,
    setShowBulkDeleteModal,
    bulkDeleteAction,
    setBulkDeleteAction,
    bulkDeleteVanish,
    setBulkDeleteVanish,
    displayedLogsCount,
    setDisplayedLogsCount,
    hasMoreLogs,
    setHasMoreLogs,
    oldestLogCursor,
    setOldestLogCursor,
    isLoadingMoreLogs,
    loadMoreLogs,
    pinTargetId,
    setPinTargetId,
    showPinModal,
    setShowPinModal,
    pinDuration,
    setPinDuration,
    showReplaceModal,
    setShowReplaceModal,
    filterMessageId,
    setFilterMessageId,
    filterUser,
    setFilterUser,
    filterEventType,
    setFilterEventType,
    filterContent,
    setFilterContent,
    submitPin,
    handleConfirmDuration,
    handleInitiatePin,
    handleUnpin,
    extractMessageId,
    handleSelectAll,
    handleSelectMessage,
    handleBulkActionSubmit,
  };
}
