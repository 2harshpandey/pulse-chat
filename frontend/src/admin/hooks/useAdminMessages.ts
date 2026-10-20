import React, { useState, useMemo, useEffect } from 'react';
import type { UserProfile } from '../types';

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
      const eventTypeMatch =
        filterEventType === 'All'
          ? true
          : filterEventType === 'Deleted by admin'
          ? log.message?.deletedBy === 'admin' || log.message?.vanished === true
          : log.type === filterEventType.toLowerCase().replace(' (everyone)', '_everyone');
      const contentMatch = !filterContent
        ? true
        : (() => {
            const lc = filterContent.toLowerCase();
            if (log.type === 'create' && log.message?.text) return log.message.text.toLowerCase().includes(lc);
            if (log.type === 'edit')
              return log.oldText?.toLowerCase().includes(lc) || log.newText?.toLowerCase().includes(lc);
            if (log.type === 'delete_everyone' && log.deletedContent?.text)
              return log.deletedContent.text.toLowerCase().includes(lc);
            if (log.type === 'upload' && log.file?.originalname)
              return log.file.originalname.toLowerCase().includes(lc);
            return false;
          })();
      return messageIdMatch && userMatch && eventTypeMatch && contentMatch;
    });
  }, [enrichedHistoryLogs, filterMessageId, filterUser, filterEventType, filterContent]);

  const laterDeletedByUserIds = useMemo(() => {
    const ids = new Set<string>();
    enrichedHistoryLogs.forEach((log) => {
      if (log.type === 'delete_everyone') {
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
