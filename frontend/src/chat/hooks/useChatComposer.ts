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
  extractFilesFromClipboard,
  reconcileUploadedMessageInList,
} from '../utils';
import { classifyUploadFile } from '../../shared/mediaTypes';
import { transferManager } from '../TransferManager';
import type { PreUploadRecord } from './useChatMedia';
import { useChatDrafts } from './useChatDrafts';
import { useChatEmojiPicker } from './useChatEmojiPicker';
import { useComposerShortcuts } from './useComposerShortcuts';

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
  editingMessageOriginalText?: string;
  priorDraftBeforeEdit: string;
  handleStartEdit?: (message: Message) => void;
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
  consumePreUpload?: (file: File) => PreUploadRecord | undefined;
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
  safeSend?: (payload: any) => boolean;
}

export function useChatComposer({
  inputMessage,
  setInputMessage,
  inputMessageRef,
  userId,
  roomId,
  userProfile,
  ws,
  safeSend: safeSendProp,
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
  editingMessageOriginalText,
  priorDraftBeforeEdit,
  handleStartEdit,
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
  consumePreUpload,
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
    onTyping: handleTyping,
  });

  const { clearDraftOnLogout } = useChatDrafts({
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

  const { tryEditLastSentMessage } = useComposerShortcuts({
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
    stagedFilesCount: stagedFiles.length,
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
  });

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
    handleTyping(null);
  }, [
    handleTyping,
    resetInputLayerHeight,
    setPreMediaDraft,
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
    if (safeSendProp) {
      return safeSendProp(payload);
    }
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
  }, [safeSendProp, ws]);

  const buildReplyContext = useCallback((): ReplyContext | undefined => {
    if (!replyingTo) return undefined;
    const { type } = replyingTo;
    if (type === 'system_notification') {
      setReplyingTo(null);
      return undefined;
    }
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
      else replyText = 'Message';
    }
    const resolvedReplyDuration =
      replyingTo.duration ||
      (replyingTo.id ? audioDurationCache.get(replyingTo.id) : undefined) ||
      (replyingTo.url ? audioDurationCache.get(replyingTo.url) : undefined);
    return {
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
  }, [replyingTo, setReplyingTo]);

  const reconcileAndBroadcastUpload = ({
    tempId,
    message,
    uploadedFileData,
    preserveDuration,
    preserveText,
    fixedType,
    revokeLocalBlobDelayMs,
  }: {
    tempId: string;
    message: Message;
    uploadedFileData: any;
    preserveDuration?: number;
    preserveText?: { text: string | undefined };
    fixedType?: Message['type'];
    revokeLocalBlobDelayMs?: number;
  }) => {
    if (uploadedFileData.id && preserveDuration) {
      setAudioDurationCache(uploadedFileData.id, preserveDuration);
      if (uploadedFileData.url) setAudioDurationCache(uploadedFileData.url, preserveDuration);
    }
    const finalMessage: Message = {
      ...message,
      ...uploadedFileData,
      originalName: chooseReadableFilename(uploadedFileData.originalName, message.originalName),
      isUploading: false,
      id: uploadedFileData.id,
      clientTempId: tempId,
      localBlobUrl: message.localBlobUrl,
      ...(preserveDuration !== undefined ? { duration: preserveDuration } : {}),
      ...(preserveText !== undefined ? { text: preserveText.text } : {}),
      ...(fixedType ? { type: fixedType } : {}),
      ...(message.waveform || uploadedFileData.waveform
        ? { waveform: message.waveform || uploadedFileData.waveform }
        : {}),
    };
    setMessages(prev => reconcileUploadedMessageInList(prev, tempId, finalMessage));
    if (replyingTo?.id === tempId) setReplyingTo(finalMessage);
    const { localBlobUrl: _omittedBlob, ...broadcastPayload } = finalMessage;
    safeSend({ ...broadcastPayload, clientTempId: tempId, roomId });
    if (revokeLocalBlobDelayMs && message.localBlobUrl) {
      const blobToRevoke = message.localBlobUrl;
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobToRevoke);
          createdBlobUrlsRef.current.delete(blobToRevoke);
        } catch (_) {}
      }, revokeLocalBlobDelayMs);
    }
  };

  const handleUploadFailure = (
    tempId: string,
    file: File,
    message: Message,
    logLabel: string,
    error: any
  ) => {
    if (error?.message === 'Aborted') return;
    console.error(logLabel, error);
    const errorText = error instanceof Error && error.message ? error.message : (typeof error === 'string' ? error : 'Upload failed');
    setMessages(prev => prev.map(m => m.id === tempId ? {
      ...message,
      url: '',
      isUploading: false,
      uploadError: true,
      originalName: sanitizeFilename(message.originalName || file.name, 'file'),
      text: errorText,
    } : m));
  };

  const dispatchOptimisticMediaUpload = ({
    tempId,
    file,
    message,
    activity,
    preserveDuration,
    preserveText,
    fixedType,
    revokeLocalBlobDelayMs,
    logLabel,
  }: {
    tempId: string;
    file: File;
    message: Message;
    activity: PresenceActivity;
    preserveDuration?: number;
    preserveText?: { text: string | undefined };
    fixedType?: Message['type'];
    revokeLocalBlobDelayMs?: number;
    logLabel: string;
  }) => {
    appendMessageToWindow(message);
    forceScrollToBottomAsync(true);
    startSendingActivity(activity);

    transferManager.startUpload(tempId, file, roomId, resolveApiBaseUrl(), userId, message)
      .then(uploadedFileData => {
        reconcileAndBroadcastUpload({
          tempId,
          message,
          uploadedFileData,
          preserveDuration,
          preserveText,
          fixedType,
          revokeLocalBlobDelayMs,
        });
      })
      .catch(error => {
        handleUploadFailure(tempId, file, message, logLabel, error);
      })
      .finally(() => {
        stopSendingActivity();
      });
  };

  // Send from preview modal
  const isSendingPreviewRef = useRef(false);
  const handleSendFromPreview = async () => {
    if (isSendingPreviewRef.current) return;
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

    isSendingPreviewRef.current = true;
    try {
      if (hasMoreNewerMessagesRef.current) {
        await jumpToLatestMessages();
      }

      const replyContext = buildReplyContext();
      const caption = previewCaption.trim();
      const batchActivity = getPresenceActivityForFiles(stagedFiles);
      const apiBase = resolveApiBaseUrl();

      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        const pre = consumePreUpload?.(file);
        const usePre = Boolean(pre && (pre.status === 'completed' || pre.status === 'uploading'));
        const tempId = usePre && pre ? pre.uploadId : `${Date.now()}_${i}`;
        const fileType = classifyUploadFile(file);
        const isAudio = fileType === 'audio';

        const fileUrl = registerBlobUrl(URL.createObjectURL(file));
        let audioDuration: number | undefined = undefined;
        if (isAudio) {
          audioDuration = (await resolveAudioDuration(fileUrl, tempId)) || undefined;
          if (audioDuration) setAudioDurationCache(tempId, audioDuration);
        }

        const itemText = i === 0 ? caption : undefined;
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
          text: itemText,
          timestamp: new Date().toISOString(),
          replyingTo: i === 0 ? replyContext : undefined,
          isUploading: true,
        };

        if (usePre && pre) {
          appendMessageToWindow(message);
          forceScrollToBottomAsync(true);
          startSendingActivity(batchActivity);

          const resolveUploadedData = async () => {
            const uploadRes = pre.status === 'completed' && pre.result ? pre.result : await pre.promise;
            if (!uploadRes?.isPreUpload) return uploadRes;
            return transferManager.commitPreUpload(uploadRes.id, roomId, apiBase, userId, {
              text: itemText,
              duration: audioDuration,
            });
          };

          if (pre.status === 'uploading') {
            transferManager.promotePreUpload(tempId, file, roomId, message);
          }

          resolveUploadedData()
            .then(uploadedFileData => {
              reconcileAndBroadcastUpload({
                tempId,
                message,
                uploadedFileData,
                preserveDuration: audioDuration,
                preserveText: { text: itemText },
              });
            })
            .catch(error => {
              if (error?.status === 404) {
                // Pre-upload expired before Send; cleanly re-upload without failing user
                return transferManager.startUpload(tempId, file, roomId, apiBase, userId, message)
                  .then(uploadedFileData => {
                    reconcileAndBroadcastUpload({
                      tempId,
                      message,
                      uploadedFileData,
                      preserveDuration: audioDuration,
                      preserveText: { text: itemText },
                    });
                  })
                  .catch(err => handleUploadFailure(tempId, file, message, 'File upload failed!', err));
              }
              handleUploadFailure(tempId, file, message, 'File upload failed!', error);
            })
            .finally(() => {
              stopSendingActivity();
            });
        } else {
          dispatchOptimisticMediaUpload({
            tempId,
            file,
            message,
            activity: batchActivity,
            preserveDuration: audioDuration,
            preserveText: { text: itemText },
            logLabel: 'File upload failed!',
          });
        }
      }

      resetInput();
    } finally {
      isSendingPreviewRef.current = false;
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (editingMessageId) {
      const trimmed = inputMessage.trim();
      const originalMessage = messagesRef?.current?.find(
        (m) => m.id === editingMessageId || (m as any)._id === editingMessageId
      );
      const originalText = (originalMessage?.text || editingMessageOriginalText || '').trim();

      // If nothing is changed (or changed but reverted back to original text before saving):
      if (!trimmed || trimmed === originalText) {
        handleCancelEdit();
        return;
      }

      safeSend({
        type: 'edit',
        messageId: editingMessageId,
        newText: trimmed,
        roomId,
      });

      handleCancelEdit();
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
    const replyContext = buildReplyContext();

    if (stagedFile) {
      const fileType = classifyUploadFile(stagedFile);
      const isAudio = fileType === 'audio';

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
      dispatchOptimisticMediaUpload({
        tempId,
        file: stagedFile,
        message,
        activity: getPresenceActivityForFile(stagedFile),
        preserveDuration: audioDuration,
        logLabel: 'File upload failed!',
      });

      const hadReply = !!replyingTo;
      resetInput();
      if (hadReply) forceScrollToBottomAsync();
    } else if (stagedGif) {
      startSendingActivity('sending_gif');
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
    const replyContext = buildReplyContext();

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

    dispatchOptimisticMediaUpload({
      tempId,
      file: audioFile,
      message,
      activity: 'sending_audio',
      preserveDuration: durationSeconds || undefined,
      fixedType: 'audio',
      revokeLocalBlobDelayMs: 60000,
      logLabel: 'Voice note upload failed!',
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
    if (nextValue.trim().length > 0) {
      handleTyping();
    } else {
      handleTyping(null);
    }
    syncInputLayerLayout(e.target, nextValue, true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent && ((e.nativeEvent as any).isComposing || (e as any).keyCode === 229)) {
      return;
    }
    if (e.key === 'Escape' && editingMessageId) {
      e.preventDefault();
      e.stopPropagation();
      handleCancelEdit();
      handleTyping(null);
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (tryEditLastSentMessage()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    const isEnter =
      e.key === 'Enter' ||
      e.keyCode === 13 ||
      (e.nativeEvent && (e.nativeEvent as any).code === 'Enter') ||
      (e.nativeEvent && (e.nativeEvent as any).code === 'NumpadEnter');
    if (!isEnter) return;

    if (e.nativeEvent && ((e.nativeEvent as any).isComposing || (e as any).keyCode === 229)) {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      handleSendMessage();
      return;
    }
    if (!e.shiftKey) {
      const isMobileOS = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
      );
      if (isMobileOS && isTouchDevice()) return;
      e.preventDefault();
      handleSendMessage();
    }
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
      if (nextValue.trim().length > 0) {
        handleTyping();
      }
      syncInputLayerLayout(textarea, nextValue, true);
      return;
    }

    e.preventDefault();
    stageFilesForPreview(fileArr);
  };

  const handleClearChat = useCallback(() => {
    if (window.confirm('Are you sure you want to clear the chat? All messages will be hidden for you on this device.')) {
      const roomKey = roomId || 'me';
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          localStorage.setItem(`pulseClearTimestamp_${userId}_${roomKey}`, Date.now().toString());
        }
      } catch (_) {}
      setMessages([]);
      setHasMoreOlderMessages(false);
      setOldestLoadedAt(null);
      setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pulse:chat_cleared', { detail: { roomId: roomKey } }));
      }
    }
  }, [setFirstItemIndex, setHasMoreOlderMessages, setMessages, setOldestLoadedAt, userId, roomId]);

  const handleHeaderButtonPointerDown = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleChatAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== chatContainerRef.current) return;
    if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible) return;
    const isMobileOS = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
    );
    if (isMobileOS && isTouchDevice()) {
      // Leave the touch virtual keyboard in its current state when tapping empty chat space.
      return;
    }
    messageInputRef.current?.focus();
  }, [chatContainerRef, isDeleteConfirmationVisible, isSelectModeActive, lightboxUrl, messageInputRef]);

  const handleScrollToBottomButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Do NOT blur messageInputRef or activeElement here.
    // This allows the virtual keyboard to remain open across all browsers (including Firefox)
    // while scrolling the chat directly to the bottom without interruption.

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
    messageInputRef,
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
    clearDraftOnLogout,
    handleClearChat,
    handleHeaderButtonPointerDown,
    handleChatAreaClick,
    handleScrollToBottomButtonClick,
  };
}
