import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import type { Message, Gif, ReplyContext } from '../types';
import type { UserProfile } from '../../UserContext';
import { MAX_MESSAGE_LENGTH, INITIAL_FIRST_ITEM_INDEX } from '../constants';
import {
  isGiphyUrl,
  chooseReadableFilename,
  sanitizeFilename,
  normalizeOverlayText,
  resolveApiBaseUrl,
  revokeBlobUrl,
} from '../utils';
import { transferManager } from '../TransferManager';
import { useChatDrafts } from './useChatDrafts';
import { useChatEmojiPicker } from './useChatEmojiPicker';

interface UseChatComposerProps {
  inputMessage: string;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  inputMessageRef: React.MutableRefObject<string>;
  userId: string;
  roomId: string;
  userProfile: UserProfile | null | undefined;
  ws: React.MutableRefObject<WebSocket | null>;
  apiBase: string;
  isMobileView: boolean;
  stableViewportHeightRef: React.MutableRefObject<number>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputOverlayRef: React.RefObject<HTMLDivElement | null>;
  skipNextInputLayoutSyncRef: React.MutableRefObject<boolean>;
  syncInputLayerLayout: (textarea?: HTMLTextAreaElement | null, value?: string, shouldMaintainBottom?: boolean) => void;
  resetInputLayerHeight: () => void;
  syncInputOverlayScroll: () => void;
  handleTyping: () => void;
  setPresenceActivity: (act: 'typing' | 'gif_selecting' | null) => void;
  editingMessageId: string | null;
  setEditingMessageId: (id: string | null) => void;
  priorDraftBeforeEdit: string;
  handleCancelEdit: () => void;
  replyingTo: Message | null;
  setReplyingTo: (msg: Message | null) => void;
  stagedFile: File | null;
  setStagedFile: (f: File | null) => void;
  stagedFiles: File[];
  setStagedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  showFilePreview: boolean;
  setShowFilePreview: (show: boolean) => void;
  previewCaption: string;
  setPreviewCaption: (cap: string) => void;
  setPreviewActiveIndex: (idx: number) => void;
  preMediaDraft: string;
  setPreMediaDraft: (draft: string) => void;
  stageFilesForPreview: (files: File[]) => Promise<void>;
  handleRequestCloseFilePreview: () => void;
  stagedGif: Gif | null;
  setStagedGif: (g: Gif | null) => void;
  closeGifPicker: () => void;
  gifPickerRef: React.RefObject<HTMLDivElement | null>;
  lightboxUrl: string | null;
  closeLightbox: () => void;
  isSelectModeActive: boolean;
  isDeleteConfirmationVisible: boolean;
  isUserListVisible: boolean;
  deleteMenuRef: React.RefObject<HTMLDivElement | null>;
  setActiveDeleteMenu: (id: string | null) => void;
  messagesRef: React.MutableRefObject<Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  appendMessageToWindow: (msg: Message) => void;
  hasMoreNewerMessagesRef: React.MutableRefObject<boolean>;
  jumpToLatestMessages: () => Promise<void>;
  activeSearchQuery: string;
  chatSearchQuery: string;
  isSearchActive: boolean;
  resetSearch: () => void;
  forceScrollToBottomAsync: (allowDuringSuppression?: boolean) => void;
  scrollToBottom: (behavior?: 'auto' | 'smooth', force?: boolean) => void;
  syncBottomStateFromScroller: () => void;
  quoteJumpReturnStackRef: React.MutableRefObject<string[]>;
  scrollToLoadedMessage: (id: string, behavior?: 'auto' | 'smooth', force?: boolean) => boolean;
  setNewMessagesWhileScrolledUp: React.Dispatch<React.SetStateAction<number>>;
  clearQuoteJumpSuppression: () => void;
  lastPingAtRef: React.MutableRefObject<number>;
  setHasMoreOlderMessages: (hasMore: boolean) => void;
  setOldestLoadedAt: (cursor: string | null) => void;
  setFirstItemIndex: (valOrUpdater: number | ((prev: number) => number)) => void;
}

export function useChatComposer({
  inputMessage,
  setInputMessage,
  inputMessageRef,
  userId,
  roomId,
  userProfile,
  ws,
  isMobileView,
  stableViewportHeightRef,
  chatContainerRef,
  messageInputRef,
  inputOverlayRef,
  skipNextInputLayoutSyncRef,
  syncInputLayerLayout,
  resetInputLayerHeight,
  syncInputOverlayScroll,
  handleTyping,
  setPresenceActivity,
  editingMessageId,
  setEditingMessageId,
  priorDraftBeforeEdit,
  handleCancelEdit,
  replyingTo,
  setReplyingTo,
  stagedFile,
  setStagedFile,
  stagedFiles,
  setStagedFiles,
  showFilePreview,
  setShowFilePreview,
  previewCaption,
  setPreviewCaption,
  setPreviewActiveIndex,
  setPreMediaDraft,
  stageFilesForPreview,
  handleRequestCloseFilePreview,
  stagedGif,
  setStagedGif,
  closeGifPicker,
  gifPickerRef,
  lightboxUrl,
  closeLightbox,
  isSelectModeActive,
  isDeleteConfirmationVisible,
  isUserListVisible,
  deleteMenuRef,
  setActiveDeleteMenu,
  messagesRef,
  setMessages,
  appendMessageToWindow,
  hasMoreNewerMessagesRef,
  jumpToLatestMessages,
  activeSearchQuery,
  chatSearchQuery,
  isSearchActive,
  resetSearch,
  forceScrollToBottomAsync,
  scrollToBottom,
  syncBottomStateFromScroller,
  quoteJumpReturnStackRef,
  scrollToLoadedMessage,
  setNewMessagesWhileScrolledUp,
  clearQuoteJumpSuppression,
  lastPingAtRef,
  setHasMoreOlderMessages,
  setOldestLoadedAt,
  setFirstItemIndex,
}: UseChatComposerProps) {

  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null!);
  const plusButtonRef = useRef<HTMLButtonElement>(null!);
  const {
    emojiPickerPosition,
    setEmojiPickerPosition,
    emojiPickerRef,
    emojiButtonRef,
    keyboardWasOpenBeforeEmojiRef,
    closeEmojiPicker,
    handleOpenEmojiPicker,
    handleEmojiClick,
  } = useChatEmojiPicker({
    setInputMessage,
    messageInputRef,
  });

  useChatDrafts({
    userId,
    userProfile,
    inputMessage,
    setInputMessage,
  });

  // Input layout sync on value change
  useLayoutEffect(() => {
    if (skipNextInputLayoutSyncRef.current) {
      skipNextInputLayoutSyncRef.current = false;
      return;
    }
    if (inputMessage) {
      syncInputLayerLayout(messageInputRef.current, inputMessage, true);
    } else {
      resetInputLayerHeight();
    }
  }, [inputMessage, messageInputRef, resetInputLayerHeight, skipNextInputLayoutSyncRef, syncInputLayerLayout]);

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
  }, [closeEmojiPicker, closeGifPicker, deleteMenuRef, gifPickerRef, setActiveDeleteMenu]);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showFilePreview) {
          handleRequestCloseFilePreview();
        } else if (lightboxUrl) {
          closeLightbox();
        } else if (editingMessageId) {
          handleCancelEdit();
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
    replyingTo,
    showFilePreview,
    setReplyingTo,
    lightboxUrl,
  ]);

  // WhatsApp-style auto-focus (desktop only)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement === messageInputRef.current) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible || isUserListVisible) return;
      if (isMobileView) return;
      messageInputRef.current?.focus();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSelectModeActive, lightboxUrl, isDeleteConfirmationVisible, isUserListVisible, isMobileView, messageInputRef]);

  // Reset input helper
  const resetInput = useCallback(() => {
    setInputMessage('');
    setPreMediaDraft('');
    setReplyingTo(null);
    setStagedFile(null);
    stagedFiles.forEach(revokeBlobUrl);
    setStagedFiles([]);
    setStagedGif(null);
    setShowFilePreview(false);
    setPreviewCaption('');
    setPreviewActiveIndex(0);
    resetInputLayerHeight();
    setPresenceActivity(null);
  }, [
    resetInputLayerHeight,
    setPreMediaDraft,
    setPresenceActivity,
    setPreviewActiveIndex,
    setPreviewCaption,
    setReplyingTo,
    setShowFilePreview,
    setStagedFile,
    setStagedFiles,
    setStagedGif,
    stagedFiles,
  ]);

  // Send from preview modal
  const handleSendFromPreview = async () => {
    if (stagedFiles.length === 0) {
      console.warn('[Composer] handleSendFromPreview aborted: no staged files');
      return;
    }
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('[Composer] handleSendFromPreview aborted: WebSocket not connected/open', {
        wsExists: Boolean(ws.current),
        readyState: ws.current?.readyState,
      });
      return;
    }
    if (!userProfile) {
      console.warn('[Composer] handleSendFromPreview aborted: missing userProfile');
      return;
    }

    if (hasMoreNewerMessagesRef.current) {
      await jumpToLatestMessages();
    }

    let replyContext: ReplyContext | undefined = undefined;
    if (replyingTo) {
      const { type } = replyingTo;
      if (type === 'system_notification') { setReplyingTo(null); return; }
      let replyText = replyingTo.text || 'Message';
      if (!replyingTo.text) {
        if (isGiphyUrl(replyingTo.url)) replyText = 'GIF';
        else if (replyingTo.type === 'image') replyText = 'Image';
        else if (replyingTo.type === 'video') replyText = 'Video';
      }
      replyContext = { id: replyingTo.id, username: replyingTo.username, text: replyText, type, url: replyingTo.url, isDeleted: replyingTo.isDeleted, deletedBy: replyingTo.deletedBy };
    }

    const caption = previewCaption.trim();

    for (let i = 0; i < stagedFiles.length; i++) {
      const file = stagedFiles[i];
      const tempId = Date.now().toString() + '_' + i;
      const fileType: 'image' | 'video' | 'file' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';

      const message: Message = {
        id: tempId,
        userId,
        username: userProfile?.username || '',
        type: fileType,
        url: URL.createObjectURL(file),
        originalName: file.name,
        size: file.size,
        text: i === 0 ? caption : undefined,
        timestamp: new Date().toISOString(),
        replyingTo: i === 0 ? replyContext : undefined,
        isUploading: true,
      };
      appendMessageToWindow(message);
      forceScrollToBottomAsync(true);

      transferManager.startUpload(tempId, file, roomId, resolveApiBaseUrl(), userId, message)
        .then(uploadedFileData => {
          const finalMessage = {
            ...message,
            ...uploadedFileData,
            originalName: chooseReadableFilename(uploadedFileData.originalName, message.originalName),
            isUploading: false,
            id: uploadedFileData.id,
            text: i === 0 ? caption : undefined,
          };
          setMessages(prev => prev.map(m => m.id === tempId ? finalMessage : m));
          ws.current?.send(JSON.stringify(finalMessage));
        })
        .catch(error => {
          if (error.message === 'Aborted') return;
          console.error('File upload failed!', error);
          const errorText = error instanceof Error && error.message ? error.message : (typeof error === 'string' ? error : 'Upload failed');
          setMessages(prev => prev.map(m => m.id === tempId ? {
            ...message,
            url: '',
            isUploading: false,
            uploadError: true,
            originalName: sanitizeFilename(message.originalName || file.name, 'file'),
            text: errorText,
          } : m));
        });
    }

    resetInput();
  };

  // Send message
  const handleSendMessage = async () => {
    if (editingMessageId) {
      const trimmed = inputMessage.trim();
      if (trimmed && ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'edit',
          messageId: editingMessageId,
          newText: trimmed,
          roomId,
        }));
      }
      setEditingMessageId(null);
      setInputMessage(priorDraftBeforeEdit);
      resetInputLayerHeight();
      requestAnimationFrame(() => { messageInputRef.current?.focus(); });
      return;
    }

    if (stagedFiles.length > 0) {
      handleSendFromPreview();
      return;
    }

    if (!stagedFile && !stagedGif && !inputMessage.trim()) return;
    if (inputMessage.length > MAX_MESSAGE_LENGTH) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !userProfile) return;
    if (Date.now() - lastPingAtRef.current > 25000) return;

    if (hasMoreNewerMessagesRef.current) {
      await jumpToLatestMessages();
    }

    if (activeSearchQuery || chatSearchQuery || isSearchActive) {
      resetSearch();
    }

    const tempId = Date.now().toString();
    let replyContext: ReplyContext | undefined = undefined;
    if (replyingTo) {
      const { type } = replyingTo;
      if (type === 'system_notification') {
        setReplyingTo(null);
        return;
      }

      let replyText = replyingTo.text || 'Message';
      if (!replyingTo.text) {
        if (isGiphyUrl(replyingTo.url)) {
          replyText = 'GIF';
        } else if (replyingTo.type === 'image') {
          replyText = 'Image';
        } else if (replyingTo.type === 'video') {
          replyText = 'Video';
        }
      }
      replyContext = {
        id: replyingTo.id,
        username: replyingTo.username,
        text: replyText,
        type,
        url: replyingTo.url,
        isDeleted: replyingTo.isDeleted,
        deletedBy: replyingTo.deletedBy,
      };
    }

    if (stagedFile) {
      const message: Message = {
        id: tempId,
        userId,
        username: userProfile?.username || '',
        type: stagedFile.type.startsWith('image/') ? 'image' : stagedFile.type.startsWith('video/') ? 'video' : 'file',
        url: URL.createObjectURL(stagedFile),
        originalName: stagedFile.name,
        size: stagedFile.size,
        text: inputMessage,
        timestamp: new Date().toISOString(),
        replyingTo: replyContext,
        isUploading: true,
      };
      appendMessageToWindow(message);
      forceScrollToBottomAsync(true);

      transferManager.startUpload(tempId, stagedFile, roomId, resolveApiBaseUrl(), userId, message)
        .then(uploadedFileData => {
          const finalMessage = {
            ...message,
            ...uploadedFileData,
            originalName: chooseReadableFilename(uploadedFileData.originalName, message.originalName),
            isUploading: false,
            id: uploadedFileData.id,
          };
          setMessages(prev => prev.map(m => m.id === tempId ? finalMessage : m));
          ws.current?.send(JSON.stringify(finalMessage));
        })
        .catch(error => {
          if (error.message === 'Aborted') return;
          console.error('File upload failed!', error);
          const errorText = error instanceof Error && error.message ? error.message : 'Upload failed';
          setMessages(prev => prev.map(m => m.id === tempId ? {
            ...message,
            url: '',
            isUploading: false,
            uploadError: true,
            originalName: sanitizeFilename(message.originalName || stagedFile.name, 'file'),
            text: errorText,
          } : m));
        });

      const hadReply = !!replyingTo;
      resetInput();
      if (hadReply) forceScrollToBottomAsync();
    } else if (stagedGif) {
      const gifMessage: Message = {
        id: Date.now().toString(),
        userId,
        username: userProfile?.username || '',
        type: 'image',
        url: stagedGif.url,
        text: inputMessage,
        timestamp: new Date().toISOString(),
        replyingTo: replyContext,
      };
      appendMessageToWindow(gifMessage);
      forceScrollToBottomAsync(true);
      ws.current?.send(JSON.stringify({ ...gifMessage, roomId }));
      const hadReply = !!replyingTo;
      resetInput();
      if (hadReply) forceScrollToBottomAsync();
    } else {
      const textMessage: Message = {
        id: Date.now().toString(),
        userId,
        username: userProfile?.username || '',
        type: 'text',
        text: inputMessage,
        timestamp: new Date().toISOString(),
        replyingTo: replyContext,
      };
      appendMessageToWindow(textMessage);
      forceScrollToBottomAsync(true);
      ws.current?.send(JSON.stringify({ ...textMessage, roomId }));
      const hadReply = !!replyingTo;
      resetInput();
      if (hadReply) forceScrollToBottomAsync();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    skipNextInputLayoutSyncRef.current = true;
    setInputMessage(nextValue);
    handleTyping();
    syncInputLayerLayout(e.target, nextValue, true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && editingMessageId) {
      e.preventDefault();
      handleCancelEdit();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isMobileView) return;
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const pastedText = clipboardData.getData('text');
    const textarea = e.currentTarget;

    const collectedFiles = new Map<string, File>();
    const addCollectedFile = (file: File | null) => {
      if (!file) return;

      const mime = file.type || 'application/octet-stream';
      const extensionFromMime = mime.includes('/') ? mime.split('/')[1].split('+')[0] : 'bin';
      const safeExt = (extensionFromMime || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
      const hasName = Boolean(file.name && file.name.trim());
      const fileName = hasName ? file.name : `pasted-${Date.now()}.${safeExt}`;
      const normalized = hasName
        ? file
        : new File([file], fileName, { type: mime, lastModified: Date.now() });

      const key = `${normalized.name}:${normalized.size}:${normalized.type}`;
      if (!collectedFiles.has(key)) collectedFiles.set(key, normalized);
    };

    Array.from(clipboardData.files || []).forEach((file) => addCollectedFile(file));

    Array.from(clipboardData.items || []).forEach((item) => {
      if (item.kind !== 'file') return;
      if (!item.type || !item.type.startsWith('image/')) return;
      addCollectedFile(item.getAsFile());
    });

    const fileArr = Array.from(collectedFiles.values());
    if (fileArr.length === 0) {
      if (!pastedText) return;

      e.preventDefault();
      const selectionStart = textarea.selectionStart ?? inputMessage.length;
      const selectionEnd = textarea.selectionEnd ?? selectionStart;
      const nextValue = `${inputMessage.slice(0, selectionStart)}${pastedText}${inputMessage.slice(selectionEnd)}`.slice(0, MAX_MESSAGE_LENGTH);
      const nextCaretPosition = Math.min(selectionStart + pastedText.length, nextValue.length);

      skipNextInputLayoutSyncRef.current = true;
      setInputMessage(nextValue);
      textarea.value = nextValue;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
        textarea.scrollTop = textarea.scrollHeight;
        if (inputOverlayRef.current) inputOverlayRef.current.scrollTop = inputOverlayRef.current.scrollHeight;
        requestAnimationFrame(() => {
          textarea.scrollTop = textarea.scrollHeight;
          if (inputOverlayRef.current) inputOverlayRef.current.scrollTop = inputOverlayRef.current.scrollHeight;
        });
      });
      handleTyping();
      syncInputLayerLayout(textarea, nextValue, true);
      return;
    }

    e.preventDefault();
    stageFilesForPreview(fileArr);
  };

  const handleClearChat = useCallback(() => {
    if (window.confirm('Are you sure you want to clear the chat? All messages will be hidden for you on this device.')) {
      localStorage.setItem(`pulseClearTimestamp_${userId}`, Date.now().toString());
      setMessages([]);
      setHasMoreOlderMessages(false);
      setOldestLoadedAt(null);
      setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
    }
  }, [setFirstItemIndex, setHasMoreOlderMessages, setMessages, setOldestLoadedAt, userId]);

  const handleHeaderButtonPointerDown = useCallback((e: React.PointerEvent) => {
    if (isMobileView) {
      const vvHeight = window.visualViewport?.height || window.innerHeight;
      const isKeyboardLikelyOpen = (stableViewportHeightRef.current - vvHeight) > 96;
      if (isKeyboardLikelyOpen) {
        e.preventDefault();
      } else {
        messageInputRef.current?.blur();
      }
    } else {
      e.preventDefault();
    }
  }, [isMobileView, messageInputRef, stableViewportHeightRef]);

  const handleChatAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== chatContainerRef.current) return;
    if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible) return;
    if (isMobileView) return;
    messageInputRef.current?.focus();
  }, [chatContainerRef, isDeleteConfirmationVisible, isMobileView, isSelectModeActive, lightboxUrl, messageInputRef]);

  const handleScrollToBottomButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const latestMessageId = messagesRef.current[messagesRef.current.length - 1]?.id || null;
    let returnTargetId: string | null = null;
    while (quoteJumpReturnStackRef.current.length > 0) {
      const candidate = quoteJumpReturnStackRef.current.pop() || null;
      if (!candidate) continue;
      if (latestMessageId && candidate === latestMessageId) continue;
      returnTargetId = candidate;
      break;
    }

    if (returnTargetId && scrollToLoadedMessage(returnTargetId, 'auto', true)) {
      return;
    }

    setNewMessagesWhileScrolledUp(0);
    clearQuoteJumpSuppression();

    if (hasMoreNewerMessagesRef.current) {
      jumpToLatestMessages();
      return;
    }

    scrollToBottom('auto', true);
    requestAnimationFrame(() => syncBottomStateFromScroller());
    window.setTimeout(() => syncBottomStateFromScroller(), 80);
    window.setTimeout(() => syncBottomStateFromScroller(), 220);
    window.setTimeout(() => syncBottomStateFromScroller(), 500);
  }, [
    clearQuoteJumpSuppression,
    hasMoreNewerMessagesRef,
    jumpToLatestMessages,
    messagesRef,
    quoteJumpReturnStackRef,
    scrollToBottom,
    scrollToLoadedMessage,
    setNewMessagesWhileScrolledUp,
    syncBottomStateFromScroller,
  ]);

  const normalizedOverlayMessage = useMemo(() => normalizeOverlayText(inputMessage), [inputMessage]);

  return {
    inputMessage,
    setInputMessage,
    inputMessageRef,
    normalizedOverlayMessage,
    isPlusMenuOpen,
    setIsPlusMenuOpen,
    plusMenuRef,
    plusButtonRef,
    emojiButtonRef,
    emojiPickerRef,
    emojiPickerPosition,
    keyboardWasOpenBeforeEmojiRef,
    closeEmojiPicker,
    handleOpenEmojiPicker,
    handleEmojiClick,
    handleInputChange,
    handleInputKeyDown,
    handlePaste,
    handleSendMessage,
    handleSendFromPreview,
    resetInput,
    handleClearChat,
    handleHeaderButtonPointerDown,
    handleChatAreaClick,
    handleScrollToBottomButtonClick,
  };
}
