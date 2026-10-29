import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Message } from '../types';
import { MIN_REPORT_REASON_LENGTH, MAX_REPORT_REASON_LENGTH } from '../constants';
import { addDeletedForMeIds, clearOverlayGuardHistoryEntry } from '../utils';

interface UseChatSelectionProps {
  userId: string;
  roomId: string;
  ws: React.MutableRefObject<WebSocket | null>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottomRef: React.MutableRefObject<boolean>;
  overlayGuardPushed: React.MutableRefObject<boolean>;
}

export function useChatSelection({
  userId,
  roomId,
  ws,
  messages,
  setMessages,
  chatContainerRef,
  isAtBottomRef,
  overlayGuardPushed,
}: UseChatSelectionProps) {
  const [isSelectModeActive, setIsSelectModeActive] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const prevSelectModeRef = useRef(false);
  const scrollAtSelectModeRef = useRef<number | null>(null);

  const [isDeleteConfirmationVisible, setIsDeleteConfirmationVisible] = useState(false);
  const [canDeleteForEveryone, setCanDeleteForEveryone] = useState(false);
  const [activeDeleteMenu, setActiveDeleteMenu] = useState<string | null>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null!);

  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [reportTargetMessage, setReportTargetMessage] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportError, setReportError] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Track scroll position for select mode
  useEffect(() => {
    if (isSelectModeActive && chatContainerRef.current) {
      scrollAtSelectModeRef.current = chatContainerRef.current.scrollTop;
    } else if (!isSelectModeActive) {
      scrollAtSelectModeRef.current = null;
    }
  }, [isSelectModeActive, chatContainerRef]);

  // Re-anchor scroll to bottom when select mode deactivates
  useEffect(() => {
    if (prevSelectModeRef.current && !isSelectModeActive) {
      requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          const scroller = chatContainerRef.current;
          if (scroller) scroller.scrollTop = scroller.scrollHeight;
        }
      });
    }
    prevSelectModeRef.current = isSelectModeActive;
  }, [isSelectModeActive, messages.length, isAtBottomRef, chatContainerRef]);

  // Delete handlers
  const deleteForMe = useCallback(
    (messageId: string) => {
      addDeletedForMeIds(userId, [messageId]);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    [userId, setMessages]
  );

  const deleteForEveryone = useCallback(
    (messageId: string) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      const msgObj = messages.find((m) => m.id === messageId);
      if (msgObj && msgObj.isDeleted) return;
      ws.current.send(JSON.stringify({ type: 'delete_for_everyone', messageId, roomId }));
    },
    [messages, roomId, ws]
  );

  const handleOpenDeleteMenu = useCallback(
    (messageId: string) => {
      setActiveDeleteMenu((prev) => (prev === messageId ? null : messageId));
      setTimeout(() => {
        if (!deleteMenuRef.current || !chatContainerRef.current) return;
        const container =
          (chatContainerRef.current.querySelector('[data-virtuoso-scroller]') as HTMLElement) ||
          chatContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const menuRect = deleteMenuRef.current.getBoundingClientRect();
        const overflow = menuRect.bottom - containerRect.bottom + 12;
        if (overflow > 0) {
          container.scrollBy({ top: overflow, behavior: 'smooth' });
        }
      }, 50);
    },
    [chatContainerRef]
  );

  // Select mode & bulk actions
  const handleToggleSelectMessage = useCallback((messageId: string) => {
    document.body.classList.remove('hide-mobile-picker');
    setSelectedMessages((prevSelected) => {
      const newSelected = prevSelected.includes(messageId)
        ? prevSelected.filter((id) => id !== messageId)
        : [...prevSelected, messageId];
      if (newSelected.length === 0) {
        setIsSelectModeActive(false);
      } else if (newSelected.length > 0) {
        setIsSelectModeActive(true);
      }
      return newSelected;
    });
  }, []);

  const handleCancelSelectMode = useCallback(() => {
    if (overlayGuardPushed.current) {
      clearOverlayGuardHistoryEntry();
      overlayGuardPushed.current = false;
    }
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  }, [overlayGuardPushed]);

  const handleInitiateDelete = useCallback(() => {
    if (selectedMessages.length === 0) return;
    const selectedMessageObjects = messages.filter((m) => selectedMessages.includes(m.id));
    const allAuthoredByCurrentUser = selectedMessageObjects.every((msg) => msg.userId === userId);

    if (!allAuthoredByCurrentUser) {
      setCanDeleteForEveryone(false);
    } else {
      const timeLimit = 15 * 60 * 1000;
      const now = new Date().getTime();
      const allMessagesAreRecent = selectedMessageObjects.every(
        (msg) => now - new Date(msg.timestamp).getTime() < timeLimit
      );
      const noneAlreadyDeleted = selectedMessageObjects.every((msg) => !msg.isDeleted);
      setCanDeleteForEveryone(allMessagesAreRecent && noneAlreadyDeleted);
    }
    setIsDeleteConfirmationVisible(true);
  }, [messages, selectedMessages, userId]);

  const handleBulkDeleteForMe = useCallback(() => {
    addDeletedForMeIds(userId, selectedMessages);
    setMessages((prev) => prev.filter((m) => !selectedMessages.includes(m.id)));
    if (overlayGuardPushed.current) {
      clearOverlayGuardHistoryEntry();
      overlayGuardPushed.current = false;
    }
    setIsDeleteConfirmationVisible(false);
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  }, [overlayGuardPushed, selectedMessages, userId, setMessages]);

  const handleBulkDeleteForEveryone = useCallback(() => {
    const socket = ws.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    selectedMessages.forEach((id) => {
      const msgObj = messages.find((m) => m.id === id);
      if (msgObj && msgObj.isDeleted) return;
      socket.send(JSON.stringify({ type: 'delete_for_everyone', messageId: id, roomId }));
    });
    if (overlayGuardPushed.current) {
      clearOverlayGuardHistoryEntry();
      overlayGuardPushed.current = false;
    }
    setIsDeleteConfirmationVisible(false);
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  }, [messages, overlayGuardPushed, roomId, selectedMessages, ws]);

  // Report handlers
  const handleOpenReport = useCallback(
    (message: Message) => {
      if (!message || message.userId === userId || message.isDeleted || message.type === 'system_notification') {
        return;
      }
      setActiveDeleteMenu(null);
      setReportTargetMessage(message);
      setReportReason('');
      setReportError('');
      setIsSubmittingReport(false);
      setIsReportModalVisible(true);
    },
    [userId]
  );

  const handleCloseReportModal = useCallback(() => {
    setIsReportModalVisible(false);
    setIsSubmittingReport(false);
    setReportError('');
    setReportReason('');
    setReportTargetMessage(null);
  }, []);

  const handleSubmitReport = useCallback(() => {
    if (!reportTargetMessage || !ws.current || ws.current.readyState !== WebSocket.OPEN) {
      setReportError('Unable to submit report right now. Please try again.');
      return;
    }

    const normalizedReason = reportReason.replace(/\s+/g, ' ').trim();
    if (normalizedReason.length < MIN_REPORT_REASON_LENGTH) {
      setReportError(`Please enter at least ${MIN_REPORT_REASON_LENGTH} characters.`);
      return;
    }
    if (normalizedReason.length > MAX_REPORT_REASON_LENGTH) {
      setReportError(`Please keep the reason under ${MAX_REPORT_REASON_LENGTH} characters.`);
      return;
    }

    setIsSubmittingReport(true);
    setReportError('');

    ws.current.send(
      JSON.stringify({
        type: 'report_user',
        reportedUserId: reportTargetMessage.userId,
        reportedUsername: reportTargetMessage.username,
        messageId: reportTargetMessage.id,
        messageType: reportTargetMessage.type,
        reason: normalizedReason,
        roomId,
      })
    );
  }, [reportReason, reportTargetMessage, roomId, ws]);

  return {
    isSelectModeActive,
    setIsSelectModeActive,
    selectedMessages,
    setSelectedMessages,
    prevSelectModeRef,
    scrollAtSelectModeRef,
    isDeleteConfirmationVisible,
    setIsDeleteConfirmationVisible,
    canDeleteForEveryone,
    activeDeleteMenu,
    setActiveDeleteMenu,
    deleteMenuRef,
    isReportModalVisible,
    setIsReportModalVisible,
    reportTargetMessage,
    setReportTargetMessage,
    reportReason,
    setReportReason,
    reportError,
    setReportError,
    isSubmittingReport,
    setIsSubmittingReport,
    deleteForMe,
    deleteForEveryone,
    handleOpenDeleteMenu,
    handleToggleSelectMessage,
    handleCancelSelectMode,
    handleInitiateDelete,
    handleBulkDeleteForMe,
    handleBulkDeleteForEveryone,
    handleOpenReport,
    handleCloseReportModal,
    handleSubmitReport,
  };
}
