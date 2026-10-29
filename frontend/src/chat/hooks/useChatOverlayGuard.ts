import React, { useEffect, useRef } from 'react';
import { pushOverlayGuardHistoryEntry } from '../utils';

interface UseChatOverlayGuardProps {
  isLoggedIn: boolean;
  isSelectModeActive: boolean;
  selectedMessageCount: number;
  setSelectedMessages: React.Dispatch<React.SetStateAction<string[]>>;
  setIsSelectModeActive: React.Dispatch<React.SetStateAction<boolean>>;
  isDeleteConfirmationVisible: boolean;
  setIsDeleteConfirmationVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isReportModalVisible: boolean;
  setIsReportModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setReportError: React.Dispatch<React.SetStateAction<string>>;
  setIsSubmittingReport: React.Dispatch<React.SetStateAction<boolean>>;
  lightboxUrl: string | null;
  setLightboxUrl: (url: string | null) => void;
  isUserListVisible: boolean;
  setIsUserListVisible: React.Dispatch<React.SetStateAction<boolean>>;
  replyingTo: any;
  setReplyingTo: React.Dispatch<React.SetStateAction<any>>;
  showGifPicker: boolean;
  closeGifPicker: () => void;
  emojiPickerPosition: DOMRect | null;
  closeEmojiPicker: (restoreKeyboard?: boolean) => void;
  fullEmojiPickerPosition: DOMRect | null;
  setFullEmojiPickerPosition: React.Dispatch<React.SetStateAction<DOMRect | null>>;
  messageIdForFullEmojiPickerRef: React.MutableRefObject<{ messageId: string; isAlbum?: boolean } | string | null>;
  isPlusMenuOpen: boolean;
  setIsPlusMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSearchActive: boolean;
  setChatSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setActiveSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  handleCloseSearch: () => void;
  mediaGallery?: { items: any[]; initialIndex: number } | null;
  closeMediaGallery?: () => void;
}

export function useChatOverlayGuard({
  isLoggedIn,
  isSelectModeActive,
  selectedMessageCount,
  setSelectedMessages,
  setIsSelectModeActive,
  isDeleteConfirmationVisible,
  setIsDeleteConfirmationVisible,
  isReportModalVisible,
  setIsReportModalVisible,
  setReportError,
  setIsSubmittingReport,
  lightboxUrl,
  setLightboxUrl,
  isUserListVisible,
  setIsUserListVisible,
  replyingTo,
  setReplyingTo,
  showGifPicker,
  closeGifPicker,
  emojiPickerPosition,
  closeEmojiPicker,
  fullEmojiPickerPosition,
  setFullEmojiPickerPosition,
  messageIdForFullEmojiPickerRef,
  isPlusMenuOpen,
  setIsPlusMenuOpen,
  isSearchActive,
  setChatSearchQuery,
  setActiveSearchQuery,
  handleCloseSearch,
  mediaGallery,
  closeMediaGallery,
}: UseChatOverlayGuardProps) {
  const overlayGuardPushed = useRef(false);

  const stateRef = useRef({
    isSelectModeActive,
    selectedMessageCount,
    isDeleteConfirmationVisible,
    isReportModalVisible,
    lightboxUrl,
    isMediaGalleryOpen: !!mediaGallery,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    isEmojiPickerOpen: !!emojiPickerPosition,
    isFullEmojiPickerOpen: !!fullEmojiPickerPosition,
    isPlusMenuOpen,
    isSearchActive,
  });

  useEffect(() => {
    stateRef.current = {
      isSelectModeActive,
      selectedMessageCount,
      isDeleteConfirmationVisible,
      isReportModalVisible,
      lightboxUrl,
      isMediaGalleryOpen: !!mediaGallery,
      isUserListVisible,
      replyingTo,
      showGifPicker,
      isEmojiPickerOpen: !!emojiPickerPosition,
      isFullEmojiPickerOpen: !!fullEmojiPickerPosition,
      isPlusMenuOpen,
      isSearchActive,
    };
  }, [
    isSelectModeActive,
    selectedMessageCount,
    isDeleteConfirmationVisible,
    isReportModalVisible,
    lightboxUrl,
    mediaGallery,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    emojiPickerPosition,
    fullEmojiPickerPosition,
    isPlusMenuOpen,
    isSearchActive,
  ]);

  useEffect(() => {
    if (!isLoggedIn) {
      overlayGuardPushed.current = false;
      return;
    }

    const hasSelectedMessages = selectedMessageCount > 0;
    const anyOpen =
      isDeleteConfirmationVisible ||
      isReportModalVisible ||
      isSelectModeActive ||
      hasSelectedMessages ||
      !!lightboxUrl ||
      !!mediaGallery ||
      isUserListVisible ||
      !!replyingTo ||
      showGifPicker ||
      !!emojiPickerPosition ||
      !!fullEmojiPickerPosition ||
      isPlusMenuOpen ||
      isSearchActive;

    if (anyOpen && !overlayGuardPushed.current) {
      pushOverlayGuardHistoryEntry();
      overlayGuardPushed.current = true;
    }
    if (!anyOpen) {
      overlayGuardPushed.current = false;
    }
  }, [
    isDeleteConfirmationVisible,
    isReportModalVisible,
    isSelectModeActive,
    selectedMessageCount,
    lightboxUrl,
    mediaGallery,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    emojiPickerPosition,
    fullEmojiPickerPosition,
    isPlusMenuOpen,
    isSearchActive,
    isLoggedIn,
  ]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const handlePopState = () => {
      overlayGuardPushed.current = false;

      const {
        isSelectModeActive: curSelect,
        selectedMessageCount: curCount,
        isDeleteConfirmationVisible: curDel,
        isReportModalVisible: curRep,
        lightboxUrl: curLight,
        isMediaGalleryOpen: curMediaGallery,
        isUserListVisible: curUsers,
        replyingTo: curReply,
        showGifPicker: curGif,
        isEmojiPickerOpen: curEmoji,
        isFullEmojiPickerOpen: curFullEmoji,
        isPlusMenuOpen: curPlus,
      } = stateRef.current;

      if (curDel) {
        setIsDeleteConfirmationVisible(false);
      } else if (curRep) {
        setIsReportModalVisible(false);
        setReportError('');
        setIsSubmittingReport(false);
      } else if (curFullEmoji) {
        setFullEmojiPickerPosition(null);
        messageIdForFullEmojiPickerRef.current = null;
      } else if (curSelect || curCount > 0) {
        setSelectedMessages([]);
        setIsSelectModeActive(false);
      } else if (curGif) {
        closeGifPicker();
      } else if (curEmoji) {
        closeEmojiPicker(true);
      } else if (curPlus) {
        setIsPlusMenuOpen(false);
      } else if (curMediaGallery) {
        closeMediaGallery?.();
      } else if (curLight) {
        setLightboxUrl(null);
      } else if (curUsers) {
        setIsUserListVisible(false);
      } else if (isSearchActive) {
        setChatSearchQuery('');
        setActiveSearchQuery('');
        handleCloseSearch();
      } else if (curReply) {
        setReplyingTo(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    closeEmojiPicker,
    closeGifPicker,
    closeMediaGallery,
    handleCloseSearch,
    isLoggedIn,
    isSearchActive,
    setActiveSearchQuery,
    setChatSearchQuery,
    setFullEmojiPickerPosition,
    setIsDeleteConfirmationVisible,
    setIsPlusMenuOpen,
    setIsReportModalVisible,
    setIsSelectModeActive,
    setIsSubmittingReport,
    setIsUserListVisible,
    setLightboxUrl,
    setReportError,
    setSelectedMessages,
    messageIdForFullEmojiPickerRef,
    setReplyingTo,
  ]);

  return { overlayGuardPushed };
}
