import React, { useState, useEffect, useLayoutEffect, useRef, useContext, useMemo, useCallback } from 'react';
import { UserContext } from '../../UserContext';
import { useTheme } from '../../ThemeContext';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { NEWER_LOAD_TRIGGER_PX } from '../constants';
import { getUserId, resolveApiBaseUrl } from '../utils';
import {
  useChatAudio,
  useChatSearch,
  useChatViewport,
  useChatMedia,
  useChatMessages,
  useChatReactions,
  useChatSelection,
  useChatWebSocket,
  useChatOverlayGuard,
  useChatComposer,
  useChatMessageNavigation,
} from './';

export interface UseChatControllerProps {
  isMe?: boolean;
  isTempLink?: boolean;
}

export function useChatController({ isMe }: UseChatControllerProps = {}) {
  const userContext = useContext(UserContext);
  const { token: tempToken, roomId: urlRoomId } = useParams<{ token?: string; roomId?: string }>();
  const roomId = isMe ? 'me' : (urlRoomId || userContext?.profile?.roomId || 'me');
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const userIdRef = useRef<string>(getUserId());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null!);
  const inputOverlayRef = useRef<HTMLDivElement>(null);
  const fullEmojiPickerRef = useRef<HTMLDivElement>(null!);
  const initialTopMostItemIndexRef = useRef<number | null>(null);

  const [inputMessage, setInputMessage] = useState('');
  const inputMessageRef = useRef(inputMessage);
  useEffect(() => {
    inputMessageRef.current = inputMessage;
  }, [inputMessage]);

  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOnline = () => setIsBrowserOnline(true);
      const handleOffline = () => setIsBrowserOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const [isUserListVisible, setIsUserListVisible] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const overlayGuardPushed = useRef(false);
  const apiBase = resolveApiBaseUrl();

  // Redirect meta roomId if needed
  useEffect(() => {
    if (userContext?.profile && roomId && roomId !== 'me') {
      fetch(`${apiBase}/api/rooms/${roomId}/meta`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.id && data.id !== roomId) {
            navigate(`/room/${data.id}`, { replace: true, state: location.state });
          }
        })
        .catch(console.error);
    }
  }, [userContext?.profile, roomId, navigate, location.state, apiBase]);

  // Viewport Hook
  const viewport = useChatViewport({
    chatContainerRef,
    inputOverlayRef,
    messageInputRef,
  });

  // Audio Hook
  const audio = useChatAudio(Boolean(userContext?.profile));

  // Messages Hook
  const msgs = useChatMessages({
    userId: userIdRef.current,
    roomId,
    apiBase,
    chatContainerRef,
    isAtBottomRef: viewport.isAtBottomRef,
    inputMessageRef,
    setInputMessage,
    resetInputLayerHeight: viewport.resetInputLayerHeight,
    syncInputLayerLayout: viewport.syncInputLayerLayout,
    messageInputRef,
    scrollToBottom: viewport.scrollToBottom,
    syncBottomStateFromScroller: viewport.syncBottomStateFromScroller,
    setNewMessagesWhileScrolledUp: viewport.setNewMessagesWhileScrolledUp,
  });

  // Reactions Hook
  const reactions = useChatReactions({
    userId: userIdRef.current,
    userProfile: userContext?.profile,
    roomId,
    ws,
    setMessages: msgs.setMessages,
    chatContainerRef,
  });

  // Selection Hook
  const selection = useChatSelection({
    userId: userIdRef.current,
    roomId,
    ws,
    messages: msgs.messages,
    setMessages: msgs.setMessages,
    chatContainerRef,
    isAtBottomRef: viewport.isAtBottomRef,
    overlayGuardPushed,
  });

  // Search Hook
  const search = useChatSearch({
    messages: msgs.messages,
    chatContainerRef,
    isAtBottomRef: viewport.isAtBottomRef,
    apiBase,
    roomId,
    filterVisibleMessages: msgs.filterVisibleMessages,
    normalizeMessage: msgs.normalizeMessage,
  });

  // Navigation Hook
  const nav = useChatMessageNavigation({
    apiBase,
    roomId,
    messagesRef: msgs.messagesRef,
    setMessages: msgs.setMessages,
    historyLoaded: msgs.historyLoaded,
    chatContainerRef,
    replyingTo: msgs.replyingTo,
    activeSearchQuery: search.activeSearchQuery,
    resetSearch: search.resetSearch,
    quoteJumpReturnStackRef: viewport.quoteJumpReturnStackRef,
    clearPendingBottomScrollTimers: viewport.clearPendingBottomScrollTimers,
    engageQuoteJumpLock: viewport.engageQuoteJumpLock,
    scheduleProgrammaticScrollSuppression: viewport.scheduleProgrammaticScrollSuppression,
    lastAtBottomStateRef: viewport.lastAtBottomStateRef,
    isAtBottomRef: viewport.isAtBottomRef,
    setIsScrollToBottomVisible: viewport.setIsScrollToBottomVisible,
    shouldSuppressProgrammaticScroll: viewport.shouldSuppressProgrammaticScroll,
    filterVisibleMessages: msgs.filterVisibleMessages,
    normalizeMessage: msgs.normalizeMessage,
    markDeletedReplyTargets: msgs.markDeletedReplyTargets,
    groupStartMessageIdsRef: msgs.groupStartMessageIdsRef,
    setFirstItemIndex: msgs.setFirstItemIndex,
    firstItemIndexRef: msgs.firstItemIndexRef,
    setNewMessagesWhileScrolledUp: viewport.setNewMessagesWhileScrolledUp,
    messageTailSnapshotRef: msgs.messageTailSnapshotRef,
    getMessageCursor: msgs.getMessageCursor,
    oldestLoadedAtRef: msgs.oldestLoadedAtRef,
    setOldestLoadedAt: msgs.setOldestLoadedAt,
    newestLoadedAtRef: msgs.newestLoadedAtRef,
    setNewestLoadedAt: msgs.setNewestLoadedAt,
    setHasMoreOlderMessages: msgs.setHasMoreOlderMessages,
    hasMoreOlderMessagesRef: msgs.hasMoreOlderMessagesRef,
    setHasMoreNewerMessages: msgs.setHasMoreNewerMessages,
    hasMoreNewerMessagesRef: msgs.hasMoreNewerMessagesRef,
    isLoadingOlderRef: msgs.isLoadingOlderRef,
    fetchAndPrependOlderMessages: msgs.fetchAndPrependOlderMessages,
  });

  // Media Hook
  const media = useChatMedia({
    messages: msgs.messages,
    setMessages: msgs.setMessages,
    userId: userIdRef.current,
    apiBase,
    roomId,
    isLoggedIn: Boolean(userContext?.profile),
    isDesktopInteraction: viewport.isDesktopInteraction,
    inputMessage,
    setInputMessage,
    resetInputLayerHeight: viewport.resetInputLayerHeight,
    ws,
    setPresenceActivity: () => {},
    messageInputRef,
  });

  // WebSocket Hook
  const socket = useChatWebSocket({
    ws,
    userId: userIdRef.current,
    roomId,
    tempToken,
    userProfile: userContext?.profile,
    logout: () => userContext?.logout(),
    overlayGuardPushed,
    playNotificationSound: audio.playNotificationSound,
    setMessages: msgs.setMessages,
    messagesRef: msgs.messagesRef,
    setPinnedMessages: msgs.setPinnedMessages,
    setCurrentPinnedIndex: msgs.setCurrentPinnedIndex,
    setHistoryLoaded: msgs.setHistoryLoaded,
    setHistorySessionId: msgs.setHistorySessionId,
    setFirstItemIndex: msgs.setFirstItemIndex,
    setOldestLoadedAt: msgs.setOldestLoadedAt,
    oldestLoadedAtRef: msgs.oldestLoadedAtRef,
    setHasMoreOlderMessages: msgs.setHasMoreOlderMessages,
    hasMoreOlderMessagesRef: msgs.hasMoreOlderMessagesRef,
    setHasMoreNewerMessages: msgs.setHasMoreNewerMessages,
    hasMoreNewerMessagesRef: msgs.hasMoreNewerMessagesRef,
    setNewestLoadedAt: msgs.setNewestLoadedAt,
    newestLoadedAtRef: msgs.newestLoadedAtRef,
    setNewMessagesWhileScrolledUp: viewport.setNewMessagesWhileScrolledUp,
    messageTailSnapshotRef: msgs.messageTailSnapshotRef,
    groupStartMessageIdsRef: msgs.groupStartMessageIdsRef,
    hasInitialScrolled: viewport.hasInitialScrolled,
    initialHistoryBottomStabilized: viewport.initialHistoryBottomStabilized,
    suppressInitialBottomPinRef: viewport.suppressInitialBottomPinRef,
    initialTopMostItemIndexRef,
    normalizeMessage: msgs.normalizeMessage,
    filterVisibleMessages: msgs.filterVisibleMessages,
    getMessageCursor: msgs.getMessageCursor,
    appendMessageToWindow: msgs.appendMessageToWindow,
    setSearchResults: search.setSearchResults,
    setReplyingTo: msgs.setReplyingTo,
    setIsSubmittingReport: selection.setIsSubmittingReport,
    setReportError: selection.setReportError,
    setReportReason: selection.setReportReason,
    setReportTargetMessage: selection.setReportTargetMessage,
    setIsReportModalVisible: selection.setIsReportModalVisible,
    isNativeFilePickerOpenRef: media.isNativeFilePickerOpenRef,
  });

  // Composer Hook
  const composer = useChatComposer({
    inputMessage,
    setInputMessage,
    inputMessageRef,
    userId: userIdRef.current,
    roomId,
    userProfile: userContext?.profile,
    ws,
    apiBase,
    isMobileView: viewport.isMobileView,
    stableViewportHeightRef: viewport.stableViewportHeightRef,
    chatContainerRef,
    messageInputRef,
    inputOverlayRef,
    skipNextInputLayoutSyncRef: viewport.skipNextInputLayoutSyncRef,
    syncInputLayerLayout: viewport.syncInputLayerLayout,
    resetInputLayerHeight: viewport.resetInputLayerHeight,
    syncInputOverlayScroll: viewport.syncInputOverlayScroll,
    handleTyping: socket.handleTyping,
    setPresenceActivity: socket.setPresenceActivity,
    editingMessageId: msgs.editingMessageId,
    setEditingMessageId: msgs.setEditingMessageId,
    priorDraftBeforeEdit: msgs.priorDraftBeforeEdit,
    handleCancelEdit: msgs.handleCancelEdit,
    replyingTo: msgs.replyingTo,
    setReplyingTo: msgs.setReplyingTo,
    stagedFile: media.stagedFile,
    setStagedFile: media.setStagedFile,
    stagedFiles: media.stagedFiles,
    setStagedFiles: media.setStagedFiles,
    showFilePreview: media.showFilePreview,
    setShowFilePreview: media.setShowFilePreview,
    previewCaption: media.previewCaption,
    setPreviewCaption: media.setPreviewCaption,
    setPreviewActiveIndex: media.setPreviewActiveIndex,
    preMediaDraft: media.preMediaDraft,
    setPreMediaDraft: media.setPreMediaDraft,
    stageFilesForPreview: media.stageFilesForPreview,
    handleRequestCloseFilePreview: media.handleRequestCloseFilePreview,
    stagedGif: media.stagedGif,
    setStagedGif: media.setStagedGif,
    closeGifPicker: media.closeGifPicker,
    gifPickerRef: media.gifPickerRef,
    lightboxUrl: media.lightboxUrl,
    closeLightbox: media.closeLightbox,
    isSelectModeActive: selection.isSelectModeActive,
    isDeleteConfirmationVisible: selection.isDeleteConfirmationVisible,
    isUserListVisible,
    deleteMenuRef: selection.deleteMenuRef,
    setActiveDeleteMenu: selection.setActiveDeleteMenu,
    messagesRef: msgs.messagesRef,
    setMessages: msgs.setMessages,
    appendMessageToWindow: msgs.appendMessageToWindow,
    hasMoreNewerMessagesRef: msgs.hasMoreNewerMessagesRef,
    jumpToLatestMessages: msgs.jumpToLatestMessages,
    activeSearchQuery: search.activeSearchQuery,
    chatSearchQuery: search.chatSearchQuery,
    isSearchActive: search.isSearchActive,
    resetSearch: search.resetSearch,
    forceScrollToBottomAsync: viewport.forceScrollToBottomAsync,
    scrollToBottom: viewport.scrollToBottom,
    syncBottomStateFromScroller: viewport.syncBottomStateFromScroller,
    quoteJumpReturnStackRef: viewport.quoteJumpReturnStackRef,
    scrollToLoadedMessage: nav.scrollToLoadedMessage,
    setNewMessagesWhileScrolledUp: viewport.setNewMessagesWhileScrolledUp,
    clearQuoteJumpSuppression: viewport.clearQuoteJumpSuppression,
    lastPingAtRef: socket.lastPingAtRef,
    setHasMoreOlderMessages: msgs.setHasMoreOlderMessages,
    setOldestLoadedAt: msgs.setOldestLoadedAt,
    setFirstItemIndex: msgs.setFirstItemIndex,
  });

  // Overlay Guard Hook
  useChatOverlayGuard({
    isLoggedIn: Boolean(userContext?.profile),
    isSelectModeActive: selection.isSelectModeActive,
    selectedMessageCount: selection.selectedMessages.length,
    setSelectedMessages: selection.setSelectedMessages,
    setIsSelectModeActive: selection.setIsSelectModeActive,
    isDeleteConfirmationVisible: selection.isDeleteConfirmationVisible,
    setIsDeleteConfirmationVisible: selection.setIsDeleteConfirmationVisible,
    isReportModalVisible: selection.isReportModalVisible,
    setIsReportModalVisible: selection.setIsReportModalVisible,
    setReportError: selection.setReportError,
    setIsSubmittingReport: selection.setIsSubmittingReport,
    lightboxUrl: media.lightboxUrl,
    setLightboxUrl: media.setLightboxUrl,
    isUserListVisible,
    setIsUserListVisible,
    replyingTo: msgs.replyingTo,
    setReplyingTo: msgs.setReplyingTo,
    showGifPicker: media.showGifPicker,
    closeGifPicker: media.closeGifPicker,
    emojiPickerPosition: composer.emojiPickerPosition,
    closeEmojiPicker: composer.closeEmojiPicker,
    fullEmojiPickerPosition: reactions.fullEmojiPickerPosition,
    setFullEmojiPickerPosition: reactions.setFullEmojiPickerPosition,
    messageIdForFullEmojiPickerRef: reactions.messageIdForFullEmojiPickerRef,
    isPlusMenuOpen: composer.isPlusMenuOpen,
    setIsPlusMenuOpen: composer.setIsPlusMenuOpen,
    isSearchActive: search.isSearchActive,
    setChatSearchQuery: search.setChatSearchQuery,
    setActiveSearchQuery: search.setActiveSearchQuery,
    handleCloseSearch: search.handleCloseSearch,
  });

  // Hide global home button
  useEffect(() => {
    document.body.classList.add('hide-global-home-btn');
    return () => {
      document.body.classList.remove('hide-global-home-btn');
    };
  }, []);

  // Close User List if switching to mobile view
  useEffect(() => {
    if (viewport.isMobileView || !userContext?.profile) {
      setIsUserListVisible(false);
    }
  }, [viewport.isMobileView, userContext?.profile]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    const currentLength = msgs.messages.length;
    const currentLastId = currentLength > 0 ? msgs.messages[currentLength - 1].id : null;
    const prevSnapshot = msgs.messageTailSnapshotRef.current;

    if (!msgs.historyLoaded) {
      msgs.messageTailSnapshotRef.current = { length: currentLength, lastId: currentLastId };
      return;
    }

    if (currentLength > prevSnapshot.length && prevSnapshot.length > 0) {
      const hasPendingBottomScroll = viewport.pendingBottomScrollTimeoutsRef.current.length > 0;
      if (viewport.isAtBottomRef.current || hasPendingBottomScroll) {
        viewport.forceScrollToBottomAsync(true);
      }
    }

    msgs.messageTailSnapshotRef.current = { length: currentLength, lastId: currentLastId };
  }, [
    msgs.historyLoaded,
    msgs.messages,
    msgs.messageTailSnapshotRef,
    viewport.forceScrollToBottomAsync,
    viewport.isAtBottomRef,
    viewport.pendingBottomScrollTimeoutsRef,
  ]);

  // Initial scroll to bottom
  useLayoutEffect(() => {
    if (msgs.messages.length > 0 && !viewport.hasInitialScrolled.current) {
      viewport.hasInitialScrolled.current = true;
      const scroller = chatContainerRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
  }, [msgs.messages.length, viewport.hasInitialScrolled]);

  useEffect(() => {
    if (!msgs.historyLoaded) return;
    if (viewport.initialHistoryBottomStabilized.current) return;
    viewport.initialHistoryBottomStabilized.current = true;

    const timer = setTimeout(() => {
      if (viewport.shouldSuppressProgrammaticScroll()) return;
      if (viewport.suppressInitialBottomPinRef.current) return;
      const scroller = chatContainerRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, 300);

    return () => clearTimeout(timer);
  }, [
    msgs.historyLoaded,
    viewport.initialHistoryBottomStabilized,
    viewport.shouldSuppressProgrammaticScroll,
    viewport.suppressInitialBottomPinRef,
  ]);

  // Scroll anchor / metrics correction
  useLayoutEffect(() => {
    if (chatContainerRef.current) {
      const scroller = chatContainerRef.current;
      if (msgs.scrollAnchorRef.current) {
        const { id, top: beforeTop } = msgs.scrollAnchorRef.current;
        msgs.scrollAnchorRef.current = null;
        const el = document.getElementById(id);
        if (el) {
          const afterTop = el.getBoundingClientRect().top;
          const diff = afterTop - beforeTop;
          if (diff !== 0) {
            scroller.scrollTop += diff;
          }
          return;
        }
      }

      if (msgs.previousScrollMetricsRef.current) {
        const metrics = msgs.previousScrollMetricsRef.current;
        msgs.previousScrollMetricsRef.current = null;
        const heightDiff = scroller.scrollHeight - metrics.height;
        if (heightDiff > 0) {
          scroller.scrollTop = metrics.top + heightDiff;
        }
      }
    }
  }, [msgs.messages, msgs.previousScrollMetricsRef, msgs.scrollAnchorRef]);

  const selectedMessageIds = useMemo(() => new Set(selection.selectedMessages), [selection.selectedMessages]);
  const loadedMediaMessageSet = useMemo(() => new Set(media.loadedMediaMessageIds), [media.loadedMediaMessageIds]);

  const selectedMessage =
    search.filteredMessages.find((msg) => msg.id === selection.selectedMessages[0]) ||
    msgs.messages.find((msg) => msg.id === selection.selectedMessages[0]);

  const canEditSelectedMessage =
    selection.selectedMessages.length === 1 &&
    selectedMessage &&
    selectedMessage.userId === userIdRef.current &&
    selectedMessage.text &&
    new Date().getTime() - new Date(selectedMessage.timestamp).getTime() < 15 * 60 * 1000;

  const hasNewMessagesIndicator = viewport.newMessagesWhileScrolledUp > 0;
  const newMessagesIndicatorLabel =
    viewport.newMessagesWhileScrolledUp > 99 ? '99+' : String(viewport.newMessagesWhileScrolledUp);
  const scrollToLatestLabel = hasNewMessagesIndicator
    ? `Scroll to latest messages (${viewport.newMessagesWhileScrolledUp} new)`
    : 'Scroll to latest messages';
  const scrollToLatestTitle = hasNewMessagesIndicator
    ? `${newMessagesIndicatorLabel} new message${viewport.newMessagesWhileScrolledUp === 1 ? '' : 's'}`
    : 'Scroll to latest messages';

  const handleJumpToNextPinned = useCallback(async () => {
    if (msgs.isJumpingToPinned) return;
    viewport.setNewMessagesWhileScrolledUp(0);
    if (search.activeSearchQuery) {
      search.resetSearch();
    }
    const currentMsg = msgs.pinnedMessages[msgs.currentPinnedIndex];
    if (currentMsg) {
      msgs.setIsJumpingToPinned(true);
      try {
        await nav.scrollToMessage(
          currentMsg.id || currentMsg._id || currentMsg.messageId,
          undefined,
          'auto',
          true
        );
      } finally {
        msgs.setIsJumpingToPinned(false);
        msgs.setCurrentPinnedIndex((prev) => (prev + 1) % msgs.pinnedMessages.length);
      }
    } else {
      msgs.setCurrentPinnedIndex((prev) => (prev + 1) % msgs.pinnedMessages.length);
    }
  }, [msgs, nav, search, viewport]);

  const handleMessagesContainerScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    if (reactions.reactionPickerData && reactions.scrollAtReactionPickerRef.current !== null) {
      if (Math.abs(target.scrollTop - reactions.scrollAtReactionPickerRef.current) > 20) {
        reactions.setReactionPickerData(null);
      }
    }
    if (
      selection.isSelectModeActive &&
      selection.selectedMessages.length === 1 &&
      selection.scrollAtSelectModeRef.current !== null
    ) {
      if (Math.abs(target.scrollTop - selection.scrollAtSelectModeRef.current) > 20) {
        document.body.classList.add('hide-mobile-picker');
      }
    }
    if (
      target.scrollTop < 2500 &&
      !msgs.isLoadingOlderRef.current &&
      msgs.hasMoreOlderMessages &&
      !search.suppressOlderMessageLoadRef.current
    ) {
      msgs.loadOlderMessages();
    }
    const distanceFromBottom = target.scrollHeight - (target.scrollTop + target.clientHeight);
    if (
      distanceFromBottom < NEWER_LOAD_TRIGGER_PX &&
      !msgs.isLoadingNewerRef.current &&
      msgs.hasMoreNewerMessagesRef.current
    ) {
      msgs.loadNewerMessages();
    }
    const atBottom = distanceFromBottom <= 20;
    viewport.handleAtBottomStateChange(atBottom);
  }, [msgs, reactions, search, selection, viewport]);

  return {
    userContext,
    tempToken,
    roomId,
    isDark,
    toggleTheme,
    isBrowserOnline,
    isUserListVisible,
    setIsUserListVisible,
    userIdRef,
    chatContainerRef,
    messageInputRef,
    inputOverlayRef,
    fullEmojiPickerRef,
    inputMessage,
    setInputMessage,
    ws,
    overlayGuardPushed,
    viewport,
    audio,
    msgs,
    reactions,
    selection,
    search,
    nav,
    media,
    socket,
    composer,
    selectedMessageIds,
    loadedMediaMessageSet,
    selectedMessage,
    canEditSelectedMessage,
    hasNewMessagesIndicator,
    newMessagesIndicatorLabel,
    scrollToLatestLabel,
    scrollToLatestTitle,
    handleJumpToNextPinned,
    handleMessagesContainerScroll,
  };
}

export type ChatController = ReturnType<typeof useChatController>;
