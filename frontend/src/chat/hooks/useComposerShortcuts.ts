import React, { useEffect, useCallback } from 'react';
import type { Message, Gif, PresenceActivity } from '../types';
import { isTouchDevice } from '../constants';
import { findLastEditableSentMessage } from '../utils';

interface UseComposerShortcutsProps {
  userId: string;
  inputMessage: string;
  inputMessageRef: React.MutableRefObject<string>;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  messagesRef: React.MutableRefObject<Message[]>;
  deleteMenuRef: React.RefObject<HTMLDivElement | null>;
  gifPickerRef: React.RefObject<HTMLDivElement | null>;
  plusMenuRef: React.RefObject<HTMLDivElement | null>;
  plusButtonRef: React.RefObject<HTMLButtonElement | null>;
  emojiPickerRef: React.RefObject<HTMLDivElement | null>;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
  isPlusMenuOpen: boolean;
  setIsPlusMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  emojiPickerPosition: { top: number; left: number } | null;
  closeEmojiPicker: (refocus?: boolean) => void;
  closeGifPicker: () => void;
  setActiveDeleteMenu: (id: string | null) => void;
  editingMessageId: string | null;
  handleStartEdit?: (message: Message) => void;
  handleCancelEdit: () => void;
  replyingTo: Message | null;
  setReplyingTo: (msg: Message | null) => void;
  stagedFile: File | null;
  stagedFilesCount: number;
  stagedGif: Gif | null;
  showFilePreview: boolean;
  handleRequestCloseFilePreview: () => void;
  lightboxUrl: string | null;
  closeLightbox: () => void;
  isSelectModeActive: boolean;
  isDeleteConfirmationVisible: boolean;
  isUserListVisible: boolean;
  isSearchActive: boolean;
  handleTyping: (activity?: PresenceActivity | null) => void;
  scrollToLoadedMessage: (id: string, behavior?: 'auto' | 'smooth', force?: boolean) => boolean;
}

/**
 * Wires outside-click menu dismissal and Escape / ArrowUp / focus keyboard shortcuts for the composer.
 */
export function useComposerShortcuts({
  userId,
  inputMessage,
  inputMessageRef,
  messageInputRef,
  messagesRef,
  deleteMenuRef,
  gifPickerRef,
  plusMenuRef,
  plusButtonRef,
  emojiPickerRef,
  emojiButtonRef,
  isPlusMenuOpen,
  setIsPlusMenuOpen,
  emojiPickerPosition,
  closeEmojiPicker,
  closeGifPicker,
  setActiveDeleteMenu,
  editingMessageId,
  handleStartEdit,
  handleCancelEdit,
  replyingTo,
  setReplyingTo,
  stagedFile,
  stagedFilesCount,
  stagedGif,
  showFilePreview,
  handleRequestCloseFilePreview,
  lightboxUrl,
  closeLightbox,
  isSelectModeActive,
  isDeleteConfirmationVisible,
  isUserListVisible,
  isSearchActive,
  handleTyping,
  scrollToLoadedMessage,
}: UseComposerShortcutsProps): { tryEditLastSentMessage: () => boolean } {
  // Click outside to close menus and pickers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      setTimeout(() => {
        const targetEl = event.target as Element;
        if (!targetEl.closest('.more-action-button')) {
          if (deleteMenuRef.current && !deleteMenuRef.current.contains(target)) setActiveDeleteMenu(null);
        }
        if (gifPickerRef.current && !gifPickerRef.current.contains(target)) closeGifPicker();
        if (
          plusMenuRef.current &&
          !plusMenuRef.current.contains(target) &&
          !plusButtonRef.current?.contains(target)
        ) {
          setIsPlusMenuOpen(false);
        }
        if (
          emojiPickerRef.current &&
          !emojiPickerRef.current.contains(target) &&
          !emojiButtonRef.current?.contains(target)
        ) {
          closeEmojiPicker(false);
        }
      }, 0);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [
    closeEmojiPicker,
    closeGifPicker,
    deleteMenuRef,
    emojiButtonRef,
    emojiPickerRef,
    gifPickerRef,
    plusButtonRef,
    plusMenuRef,
    setActiveDeleteMenu,
    setIsPlusMenuOpen,
  ]);

  const tryEditLastSentMessage = useCallback((): boolean => {
    if (!handleStartEdit || editingMessageId) return false;
    if ((inputMessageRef.current || inputMessage).length > 0) return false;
    if (stagedFile || stagedFilesCount > 0 || stagedGif || showFilePreview) return false;
    if (isSelectModeActive || lightboxUrl || isDeleteConfirmationVisible || isUserListVisible || isSearchActive) {
      return false;
    }

    const lastEditable = findLastEditableSentMessage(messagesRef.current, userId);
    if (!lastEditable) return false;

    if (replyingTo) {
      setReplyingTo(null);
    }
    if (emojiPickerPosition) {
      closeEmojiPicker(false);
    }
    if (isPlusMenuOpen) {
      setIsPlusMenuOpen(false);
    }

    handleStartEdit(lastEditable);
    handleTyping(null);
    if (lastEditable.id) {
      scrollToLoadedMessage?.(lastEditable.id, 'auto', false);
    }
    return true;
  }, [
    closeEmojiPicker,
    editingMessageId,
    emojiPickerPosition,
    handleStartEdit,
    handleTyping,
    inputMessage,
    inputMessageRef,
    isDeleteConfirmationVisible,
    isPlusMenuOpen,
    isSearchActive,
    isSelectModeActive,
    isUserListVisible,
    lightboxUrl,
    messagesRef,
    replyingTo,
    scrollToLoadedMessage,
    setIsPlusMenuOpen,
    setReplyingTo,
    showFilePreview,
    stagedFile,
    stagedFilesCount,
    stagedGif,
    userId,
  ]);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showFilePreview) {
          handleRequestCloseFilePreview();
        } else if (lightboxUrl) {
          closeLightbox();
        } else if (editingMessageId) {
          e.preventDefault();
          handleCancelEdit();
          handleTyping(null);
        } else if (replyingTo) {
          setReplyingTo(null);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    handleRequestCloseFilePreview,
    closeLightbox,
    editingMessageId,
    handleCancelEdit,
    handleTyping,
    replyingTo,
    showFilePreview,
    setReplyingTo,
    lightboxUrl,
  ]);

  // WhatsApp / Telegram-style keyboard shortcuts (desktop only):
  // - ArrowUp (when box is empty and body is focused): edit last sent message
  // - Printable character (when outside inputs): focus composer automatically
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e as any).isComposing || e.keyCode === 229) return;
      if (document.activeElement === messageInputRef.current) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (document.activeElement as HTMLElement)?.isContentEditable) return;
      if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible || isUserListVisible) return;
      const isMobileOS = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
      );
      if (isMobileOS && isTouchDevice()) return;

      if (e.key === 'ArrowUp' && !e.shiftKey) {
        if (document.activeElement === document.body && tryEditLastSentMessage()) {
          e.preventDefault();
        }
        return;
      }

      if (e.key.length !== 1) return;
      messageInputRef.current?.focus();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSelectModeActive, lightboxUrl, isDeleteConfirmationVisible, isUserListVisible, messageInputRef, tryEditLastSentMessage]);

  return { tryEditLastSentMessage };
}
