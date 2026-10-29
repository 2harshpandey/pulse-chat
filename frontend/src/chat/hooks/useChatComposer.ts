import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import type { Message, Gif, ReplyContext, PresenceActivity } from '../types';
import type { UserProfile } from '../../UserContext';
import { MAX_MESSAGE_LENGTH, INITIAL_FIRST_ITEM_INDEX, isTouchDevice } from '../constants';
import {
  isGiphyUrl,
  chooseReadableFilename,
  sanitizeFilename,
  normalizeOverlayText,
  resolveApiBaseUrl,
  revokeBlobUrl,
  audioDurationCache,
  setAudioDurationCache,
  resolveAudioDuration,
  getPresenceActivityForFile,
  getPresenceActivityForFiles,
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
  handleTyping: (activity?: PresenceActivity | null) => void;
  setPresenceActivity: (act: PresenceActivity | null) => void;
  startSendingActivity: (act: PresenceActivity) => void;
  stopSendingActivity: () => void;
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
  handleTyping,
  setPresenceActivity,
  startSendingActivity,
  stopSendingActivity,
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
  setHasMoreOlderMessages,
  setOldestLoadedAt,
  setFirstItemIndex,
}: UseChatComposerProps) {

  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null!);
  const plusButtonRef = useRef<HTMLButtonElement>(null!);
  const pendingWsQueueRef = useRef<string[]>([]);
  const isWsConnectingListenerAttachedRef = useRef<boolean>(false);
  const createdBlobUrlsRef = useRef<Set<string>>(new Set());

  const registerBlobUrl = useCallback((url: string): string => {
    createdBlobUrlsRef.current.add(url);
    if (createdBlobUrlsRef.current.size > 20) {
      const oldest = createdBlobUrlsRef.current.values().next().value;
      if (oldest) {
        createdBlobUrlsRef.current.delete(oldest);
        try {
          URL.revokeObjectURL(oldest);
        } catch (_) {}
      }
    }
    return url;
  }, []);

  useEffect(() => {
    return () => {
      createdBlobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      });
      createdBlobUrlsRef.current.clear();
    };
  }, []);

  const {
    emojiPickerPosition,
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
    roomId,
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
      if (isTouchDevice()) return;
      messageInputRef.current?.focus();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSelectModeActive, lightboxUrl, isDeleteConfirmationVisible, isUserListVisible, messageInputRef]);

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

  // Safe WebSocket payload transmission: handles open sockets and flushes when connecting in strict FIFO order
  const safeSend = useCallback((payload: any) => {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const socket = ws.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        while (pendingWsQueueRef.current.length > 0) {
          const queued = pendingWsQueueRef.current.shift();
          if (queued) socket.send(queued);
        }
        socket.send(data);
        return true;
      } catch (e) {
        console.warn('Failed to send WebSocket payload immediately:', e);
      }
    } else if (socket && socket.readyState === WebSocket.CONNECTING) {
      pendingWsQueueRef.current.push(data);
      if (!isWsConnectingListenerAttachedRef.current) {
        isWsConnectingListenerAttachedRef.current = true;
        const cleanup = () => {
          isWsConnectingListenerAttachedRef.current = false;
          socket.removeEventListener('open', onOpen);
          socket.removeEventListener('close', cleanup);
          socket.removeEventListener('error', cleanup);
        };
        const onOpen = () => {
          try {
            while (pendingWsQueueRef.current.length > 0) {
              const queued = pendingWsQueueRef.current.shift();
              if (queued) socket.send(queued);
            }
          } catch (_) {}
          cleanup();
        };
        socket.addEventListener('open', onOpen);
        socket.addEventListener('close', cleanup);
        socket.addEventListener('error', cleanup);
      }
      return false;
    }
    return false;
  }, [ws]);

  // Send from preview modal
  const handleSendFromPreview = async () => {
    if (stagedFiles.length === 0) {
      console.warn('[Composer] handleSendFromPreview aborted: no staged files');
      return;
    }
    if (!ws.current || (ws.current.readyState !== WebSocket.OPEN && ws.current.readyState !== WebSocket.CONNECTING)) {
      console.warn('[Composer] handleSendFromPreview aborted: WebSocket not connected/connecting', {
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
      if (type === 'system_notification') {
        setReplyingTo(null);
      } else {
        const isGroupReply = Boolean(
          replyingTo.isGroup ||
          replyingTo.type === 'group' ||
          (typeof replyingTo.mediaCount === 'number' && replyingTo.mediaCount > 1)
        );
        const groupCount = replyingTo.mediaCount || 2;
        let replyText = replyingTo.text || '';
        if (isGroupReply) {
          if (!replyText || replyText.trim().length === 0) {
            replyText = `${groupCount} media`;
          }
        } else if (!replyText) {
          if (isGiphyUrl(replyingTo.url)) replyText = 'GIF';
          else if (replyingTo.type === 'image') replyText = 'Image';
          else if (replyingTo.type === 'video') replyText = 'Video';
          else if (replyingTo.type === 'audio') replyText = 'Voice Message';
          else if (replyingTo.type === 'file') replyText = replyingTo.originalName || 'File';
          else if (replyingTo.type === 'poll') replyText = replyingTo.poll?.question || 'Poll';
          else replyText = 'Message';
        }
        const resolvedReplyDuration = replyingTo.duration ||
          (replyingTo.id ? audioDurationCache.get(replyingTo.id) : undefined) ||
          (replyingTo.url ? audioDurationCache.get(replyingTo.url) : undefined);
        replyContext = {
          id: replyingTo.id,
          username: replyingTo.username,
          text: replyText,
          type: isGroupReply ? 'group' : type,
          url: isGroupReply ? undefined : replyingTo.url,
          duration: resolvedReplyDuration,
          isDeleted: replyingTo.isDeleted,
          deletedBy: replyingTo.deletedBy,
          isGroup: isGroupReply ? true : undefined,
          mediaCount: isGroupReply ? groupCount : undefined,
        };
      }
    }

    const caption = previewCaption.trim();
    const batchActivity = getPresenceActivityForFiles(stagedFiles);

    for (let i = 0; i < stagedFiles.length; i++) {
      const file = stagedFiles[i];
      const tempId = Date.now().toString() + '_' + i;
      const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(jpeg|jpg|png|gif|svg|webp)$/i.test(file.name);
      const isVideo = !isAudio && (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name));
      const fileType: 'image' | 'video' | 'file' | 'audio' = isImage
        ? 'image'
        : isVideo
        ? 'video'
        : isAudio
        ? 'audio'
        : 'file';

      const fileUrl = registerBlobUrl(URL.createObjectURL(file));
      let audioDuration: number | undefined = undefined;
      if (isAudio) {
        audioDuration = (await resolveAudioDuration(fileUrl, tempId)) || undefined;
        if (audioDuration) setAudioDurationCache(tempId, audioDuration);
      }

      const message: Message = {
        id: tempId,
        clientTempId: tempId,
        localBlobUrl: fileUrl,
        userId,
        username: userProfile?.username || '',
        type: fileType,
        url: fileUrl,
        originalName: file.name,
        size: file.size,
        duration: audioDuration,
        text: i === 0 ? caption : undefined,
        timestamp: new Date().toISOString(),
        replyingTo: i === 0 ? replyContext : undefined,
        isUploading: true,
      };
      appendMessageToWindow(message);
      forceScrollToBottomAsync(true);

      startSendingActivity(batchActivity);

      transferManager.startUpload(tempId, file, roomId, resolveApiBaseUrl(), userId, message)
        .then(uploadedFileData => {
          if (uploadedFileData.id && audioDuration) {
            setAudioDurationCache(uploadedFileData.id, audioDuration);
            if (uploadedFileData.url) setAudioDurationCache(uploadedFileData.url, audioDuration);
          }
          const finalMessage: Message = {
            ...message,
            ...uploadedFileData,
            duration: audioDuration,
            originalName: chooseReadableFilename(uploadedFileData.originalName, message.originalName),
            isUploading: false,
            id: uploadedFileData.id,
            clientTempId: tempId,
            localBlobUrl: fileUrl,
            text: i === 0 ? caption : undefined,
          };
          setMessages(prev => prev.map(m => {
            if (m.id === tempId) return finalMessage;
            if (m.replyingTo && m.replyingTo.id === tempId) {
              const isGroup = Boolean(m.replyingTo.isGroup || m.replyingTo.type === 'group');
              return {
                ...m,
                replyingTo: {
                  ...m.replyingTo,
                  id: finalMessage.id,
                  url: isGroup ? undefined : (finalMessage.url || m.replyingTo.url),
                  type: isGroup ? 'group' : (finalMessage.type !== 'system_notification' ? finalMessage.type : m.replyingTo.type),
                }
              };
            }
            return m;
          }));
          if (replyingTo?.id === tempId) setReplyingTo(finalMessage);
          const { localBlobUrl: _omittedBlob, ...broadcastPayload } = finalMessage;
          safeSend({ ...broadcastPayload, clientTempId: tempId, roomId });
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
        })
        .finally(() => {
          stopSendingActivity();
        });
    }

    resetInput();
  };

  // Send message
  const handleSendMessage = async () => {
    if (editingMessageId) {
      const trimmed = inputMessage.trim();
      if (trimmed) {
        safeSend({
          type: 'edit',
          messageId: editingMessageId,
          newText: trimmed,
          roomId,
        });
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
    if (!ws.current || (ws.current.readyState !== WebSocket.OPEN && ws.current.readyState !== WebSocket.CONNECTING) || !userProfile) return;

    if (hasMoreNewerMessagesRef.current) {
      await jumpToLatestMessages();
    }

    if (activeSearchQuery || chatSearchQuery || isSearchActive) {
      resetSearch();
    }

    const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let replyContext: ReplyContext | undefined = undefined;
    if (replyingTo) {
      const { type } = replyingTo;
      if (type === 'system_notification') {
        setReplyingTo(null);
      } else {
        const isGroupReply = Boolean(
          replyingTo.isGroup ||
          replyingTo.type === 'group' ||
          (typeof replyingTo.mediaCount === 'number' && replyingTo.mediaCount > 1)
        );
        const groupCount = replyingTo.mediaCount || 2;
        let replyText = replyingTo.text || '';
        if (isGroupReply) {
          if (!replyText || replyText.trim().length === 0) {
            replyText = `${groupCount} media`;
          }
        } else if (!replyText) {
          if (isGiphyUrl(replyingTo.url)) {
            replyText = 'GIF';
          } else if (replyingTo.type === 'image') {
            replyText = 'Image';
          } else if (replyingTo.type === 'video') {
            replyText = 'Video';
          } else if (replyingTo.type === 'audio') {
            replyText = 'Voice Message';
          } else if (replyingTo.type === 'file') {
            replyText = replyingTo.originalName || 'File';
          } else if (replyingTo.type === 'poll') {
            replyText = replyingTo.poll?.question || 'Poll';
          } else {
            replyText = 'Message';
          }
        }
        const resolvedReplyDuration = replyingTo.duration ||
          (replyingTo.id ? audioDurationCache.get(replyingTo.id) : undefined) ||
          (replyingTo.url ? audioDurationCache.get(replyingTo.url) : undefined);
        replyContext = {
          id: replyingTo.id,
          username: replyingTo.username,
          text: replyText,
          type: isGroupReply ? 'group' : type,
          url: isGroupReply ? undefined : replyingTo.url,
          duration: resolvedReplyDuration,
          isDeleted: replyingTo.isDeleted,
          deletedBy: replyingTo.deletedBy,
          isGroup: isGroupReply ? true : undefined,
          mediaCount: isGroupReply ? groupCount : undefined,
        };
      }
    }

    if (stagedFile) {
      const isAudio = stagedFile.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i.test(stagedFile.name);
      const isImage = stagedFile.type.startsWith('image/') || /\.(jpeg|jpg|png|gif|svg|webp)$/i.test(stagedFile.name);
      const isVideo = !isAudio && (stagedFile.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(stagedFile.name));
      const fileType: 'image' | 'video' | 'file' | 'audio' = isImage
        ? 'image'
        : isVideo
        ? 'video'
        : isAudio
        ? 'audio'
        : 'file';

      const fileUrl = registerBlobUrl(URL.createObjectURL(stagedFile));
      let audioDuration: number | undefined = undefined;
      if (isAudio) {
        audioDuration = (await resolveAudioDuration(fileUrl, tempId)) || undefined;
        if (audioDuration) setAudioDurationCache(tempId, audioDuration);
      }

      const message: Message = {
        id: tempId,
        clientTempId: tempId,
        localBlobUrl: fileUrl,
        userId,
        username: userProfile?.username || '',
        type: fileType,
        url: fileUrl,
        originalName: stagedFile.name,
        size: stagedFile.size,
        duration: audioDuration,
        text: inputMessage,
        timestamp: new Date().toISOString(),
        replyingTo: replyContext,
        isUploading: true,
      };
      appendMessageToWindow(message);
      forceScrollToBottomAsync(true);

      const fileActivity = getPresenceActivityForFile(stagedFile);
      startSendingActivity(fileActivity);

      transferManager.startUpload(tempId, stagedFile, roomId, resolveApiBaseUrl(), userId, message)
        .then(uploadedFileData => {
          if (uploadedFileData.id && audioDuration) {
            setAudioDurationCache(uploadedFileData.id, audioDuration);
            if (uploadedFileData.url) setAudioDurationCache(uploadedFileData.url, audioDuration);
          }
          const finalMessage: Message = {
            ...message,
            ...uploadedFileData,
            duration: audioDuration,
            originalName: chooseReadableFilename(uploadedFileData.originalName, message.originalName),
            isUploading: false,
            id: uploadedFileData.id,
            clientTempId: tempId,
            localBlobUrl: fileUrl,
          };
          setMessages(prev => prev.map(m => {
            if (m.id === tempId) return finalMessage;
            if (m.replyingTo && m.replyingTo.id === tempId) {
              const isGroup = Boolean(m.replyingTo.isGroup || m.replyingTo.type === 'group');
              return {
                ...m,
                replyingTo: {
                  ...m.replyingTo,
                  id: finalMessage.id,
                  url: isGroup ? undefined : (finalMessage.url || m.replyingTo.url),
                  type: isGroup ? 'group' : (finalMessage.type !== 'system_notification' ? finalMessage.type : m.replyingTo.type),
                }
              };
            }
            return m;
          }));
          if (replyingTo?.id === tempId) setReplyingTo(finalMessage);
          const { localBlobUrl: _omittedBlob, ...broadcastPayload } = finalMessage;
          safeSend({ ...broadcastPayload, clientTempId: tempId, roomId });
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
        })
        .finally(() => {
          stopSendingActivity();
        });

      const hadReply = !!replyingTo;
      resetInput();
      if (hadReply) forceScrollToBottomAsync();
    } else if (stagedGif) {
      startSendingActivity('sending_gif');
      const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const gifMessage: Message = {
        id: tempId,
        clientTempId: tempId,
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
      safeSend({ ...gifMessage, clientTempId: tempId, roomId });
      stopSendingActivity();
      const hadReply = !!replyingTo;
      resetInput();
      if (hadReply) forceScrollToBottomAsync();
    } else {
      const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const textMessage: Message = {
        id: tempId,
        clientTempId: tempId,
        userId,
        username: userProfile?.username || '',
        type: 'text',
        text: inputMessage,
        timestamp: new Date().toISOString(),
        replyingTo: replyContext,
      };
      appendMessageToWindow(textMessage);
      forceScrollToBottomAsync(true);
      safeSend({ ...textMessage, clientTempId: tempId, roomId });
      const hadReply = !!replyingTo;
      resetInput();
      if (hadReply) forceScrollToBottomAsync();
    }
  };

  // Send recorded voice note
  const handleSendVoiceNote = async (audioFile: File, durationSeconds: number, waveform?: number[]) => {
    if (!ws.current || (ws.current.readyState !== WebSocket.OPEN && ws.current.readyState !== WebSocket.CONNECTING) || !userProfile) return;

    if (hasMoreNewerMessagesRef.current) {
      await jumpToLatestMessages();
    }

    if (activeSearchQuery || chatSearchQuery || isSearchActive) {
      resetSearch();
    }

    const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let replyContext: ReplyContext | undefined = undefined;
    if (replyingTo) {
      const { type } = replyingTo;
      if (type === 'system_notification') {
        setReplyingTo(null);
      } else {
        const isGroupReply = Boolean(
          replyingTo.isGroup ||
          replyingTo.type === 'group' ||
          (typeof replyingTo.mediaCount === 'number' && replyingTo.mediaCount > 1)
        );
        const groupCount = replyingTo.mediaCount || 2;
        let replyText = replyingTo.text || '';
        if (isGroupReply) {
          if (!replyText || replyText.trim().length === 0) {
            replyText = `${groupCount} media`;
          }
        } else if (!replyText) {
          if (isGiphyUrl(replyingTo.url)) {
            replyText = 'GIF';
          } else if (replyingTo.type === 'image') {
            replyText = 'Image';
          } else if (replyingTo.type === 'video') {
            replyText = 'Video';
          } else if (replyingTo.type === 'audio') {
            replyText = 'Voice Message';
          } else if (replyingTo.type === 'file') {
            replyText = replyingTo.originalName || 'File';
          } else if (replyingTo.type === 'poll') {
            replyText = replyingTo.poll?.question || 'Poll';
          } else {
            replyText = 'Message';
          }
        }
        const resolvedReplyDuration = replyingTo.duration ||
          (replyingTo.id ? audioDurationCache.get(replyingTo.id) : undefined) ||
          (replyingTo.url ? audioDurationCache.get(replyingTo.url) : undefined);
        replyContext = {
          id: replyingTo.id,
          username: replyingTo.username,
          text: replyText,
          type: isGroupReply ? 'group' : type,
          url: isGroupReply ? undefined : replyingTo.url,
          duration: resolvedReplyDuration,
          isDeleted: replyingTo.isDeleted,
          deletedBy: replyingTo.deletedBy,
          isGroup: isGroupReply ? true : undefined,
          mediaCount: isGroupReply ? groupCount : undefined,
        };
      }
    }

    if (durationSeconds) {
      setAudioDurationCache(tempId, durationSeconds);
    }

    const localBlobUrl = registerBlobUrl(URL.createObjectURL(audioFile));
    const message: Message = {
      id: tempId,
      clientTempId: tempId,
      localBlobUrl,
      userId,
      username: userProfile?.username || '',
      type: 'audio',
      url: localBlobUrl,
      originalName: audioFile.name,
      size: audioFile.size,
      duration: durationSeconds,
      waveform,
      text: '',
      timestamp: new Date().toISOString(),
      replyingTo: replyContext,
      isUploading: true,
    };

    appendMessageToWindow(message);
    forceScrollToBottomAsync(true);

    startSendingActivity('sending_audio');

    transferManager.startUpload(tempId, audioFile, roomId, resolveApiBaseUrl(), userId, message)
      .then(uploadedFileData => {
        if (uploadedFileData.id && durationSeconds) {
          setAudioDurationCache(uploadedFileData.id, durationSeconds);
          if (uploadedFileData.url) setAudioDurationCache(uploadedFileData.url, durationSeconds);
        }
        const finalMessage: Message = {
          ...message,
          ...uploadedFileData,
          originalName: chooseReadableFilename(uploadedFileData.originalName, message.originalName),
          isUploading: false,
          id: uploadedFileData.id,
          clientTempId: tempId,
          localBlobUrl,
          type: 'audio',
          duration: durationSeconds,
          waveform: waveform || uploadedFileData.waveform,
        };
        setMessages(prev => prev.map(m => {
          if (m.id === tempId) return finalMessage;
          if (m.replyingTo && m.replyingTo.id === tempId) {
            return {
              ...m,
              replyingTo: {
                ...m.replyingTo,
                id: finalMessage.id,
                url: finalMessage.url || m.replyingTo.url,
                type: 'audio',
              }
            };
          }
          return m;
        }));
        if (replyingTo?.id === tempId) setReplyingTo(finalMessage);
        const { localBlobUrl: _omittedBlob, ...broadcastPayload } = finalMessage;
        safeSend({ ...broadcastPayload, clientTempId: tempId, roomId });
        if (localBlobUrl) {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(localBlobUrl);
              createdBlobUrlsRef.current.delete(localBlobUrl);
            } catch (_) {}
          }, 60000);
        }
      })
      .catch(error => {
        if (error.message === 'Aborted') return;
        console.error('Voice note upload failed!', error);
        const errorText = error instanceof Error && error.message ? error.message : 'Upload failed';
        setMessages(prev => prev.map(m => m.id === tempId ? {
          ...message,
          url: '',
          isUploading: false,
          uploadError: true,
          originalName: sanitizeFilename(message.originalName || audioFile.name, 'file'),
          text: errorText,
        } : m));
      })
      .finally(() => {
        stopSendingActivity();
      });

    const hadReply = !!replyingTo;
    setReplyingTo(null);
    setPresenceActivity(null);
    if (hadReply) forceScrollToBottomAsync();
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
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isTouchDevice()) return;
      e.preventDefault();
      handleSendMessage();
    }
  };

  const extractFilesFromClipboard = (clipboardData: DataTransfer): File[] => {
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
      addCollectedFile(item.getAsFile());
    });

    return Array.from(collectedFiles.values());
  };

  // Global window paste handler: allows pasting photos/videos/media even when the chat input box is not highlighted
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (messageInputRef.current && (e.target === messageInputRef.current || messageInputRef.current.contains(e.target as Node))) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target !== messageInputRef.current) {
        return;
      }

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const fileArr = extractFilesFromClipboard(clipboardData);
      if (fileArr.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        stageFilesForPreview(fileArr);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [stageFilesForPreview, messageInputRef]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const pastedText = clipboardData.getData('text');
    const textarea = e.currentTarget;

    const fileArr = extractFilesFromClipboard(clipboardData);
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
      const roomKey = roomId || 'me';
      localStorage.setItem(`pulseClearTimestamp_${userId}_${roomKey}`, Date.now().toString());
      setMessages([]);
      setHasMoreOlderMessages(false);
      setOldestLoadedAt(null);
      setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
    }
  }, [setFirstItemIndex, setHasMoreOlderMessages, setMessages, setOldestLoadedAt, userId, roomId]);

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
    if (isTouchDevice()) return;
    messageInputRef.current?.focus();
  }, [chatContainerRef, isDeleteConfirmationVisible, isSelectModeActive, lightboxUrl, messageInputRef]);

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
    handleSendVoiceNote,
    handleSendFromPreview,
    resetInput,
    handleClearChat,
    handleHeaderButtonPointerDown,
    handleChatAreaClick,
    handleScrollToBottomButtonClick,
  };
}
