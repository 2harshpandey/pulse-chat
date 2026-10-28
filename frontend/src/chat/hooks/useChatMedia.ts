import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Message, PresenceActivity } from '../types';
import {
  MAX_LOADED_MEDIA_TRACKING,
  getInputDraftKey,
} from '../constants';
import {
  sanitizeMediaUrl,
  fetchBlobWithProgress,
  chooseReadableFilename,
  getMediaCacheLookupKey,
  getPresenceActivityForFiles,
  revokeBlobUrl,
} from '../utils';
import { getCachedMediaBlob, setCachedMediaBlob } from '../../mediaCache';
import { transferManager } from '../TransferManager';
import { useChatLightbox } from './useChatLightbox';
import { useChatGifPicker } from './useChatGifPicker';

export const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return resolve(file);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1920;
      const MAX_HEIGHT = 1080;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) return resolve(file);
        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(file);
    };
  });
};

interface UseChatMediaProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  userId: string;
  apiBase: string;
  roomId: string;
  isLoggedIn: boolean;
  isDesktopInteraction: boolean;
  inputMessage: string;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  resetInputLayerHeight: () => void;
  ws: React.MutableRefObject<WebSocket | null>;
  setPresenceActivity: (act: PresenceActivity | null) => void;
  startSendingActivity?: (act: PresenceActivity) => void;
  stopSendingActivity?: () => void;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function useChatMedia({
  messages,
  setMessages,
  userId,
  apiBase,
  roomId,
  isLoggedIn,
  isDesktopInteraction,
  inputMessage,
  setInputMessage,
  resetInputLayerHeight,
  ws,
  setPresenceActivity,
  startSendingActivity,
  stopSendingActivity,
  messageInputRef,
}: UseChatMediaProps) {
  // Staged Files & Previews
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [isDiscardConfirmationVisible, setIsDiscardConfirmationVisible] = useState(false);
  const [previewActiveIndex, setPreviewActiveIndex] = useState(0);
  const [previewCaption, setPreviewCaption] = useState('');
  const [preMediaDraft, setPreMediaDraft] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const previewCaptionInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Sub-hook: GIF Picker
  const gifPicker = useChatGifPicker({
    apiBase,
    setPresenceActivity,
    messageInputRef,
    isDesktopInteraction,
    onGifSelectCallback: () => {
      setStagedFile(null);
      setStagedFiles([]);
      setShowFilePreview(false);
    },
  });

  // Sub-hook: Lightbox
  const lightbox = useChatLightbox();

  // Media Loading & Hydration
  const [loadedMediaMessageIds, setLoadedMediaMessageIds] = useState<string[]>([]);
  const [mediaLoadProgressById, setMediaLoadProgressById] = useState<Record<string, number>>({});
  const [loadedMediaSrcById, setLoadedMediaSrcById] = useState<Record<string, string>>({});
  const [downloadProgressById, setDownloadProgressById] = useState<Record<string, number>>({});

  const mediaLoadInFlightRef = useRef<Set<string>>(new Set());
  const mediaBlobUrlMapRef = useRef<Map<string, string>>(new Map());
  const mediaCacheHydrationInFlightRef = useRef<Set<string>>(new Set());
  const mediaLoadAbortControllersRef = useRef(new Map<string, AbortController>());
  const isNativeFilePickerOpenRef = useRef(false);

  // Native file picker tracking
  const notifyNativeFilePickerOpen = useCallback(() => {
    isNativeFilePickerOpenRef.current = true;
    window.setTimeout(() => {
      isNativeFilePickerOpenRef.current = false;
    }, 120000);
    try {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'file_picker_open', ttlMs: 120000, roomId }));
      }
    } catch (_) {
      // Best effort
    }
  }, [ws, roomId]);

  const markNativeFilePickerClosed = useCallback(() => {
    isNativeFilePickerOpenRef.current = false;
    try {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'file_picker_close', roomId }));
      }
    } catch (_) {
      // Best effort
    }
  }, [ws, roomId]);

  useEffect(() => {
    const primaryInput = fileInputRef.current;
    const addInput = addFileInputRef.current;
    if (primaryInput) primaryInput.addEventListener('cancel', markNativeFilePickerClosed);
    if (addInput) addInput.addEventListener('cancel', markNativeFilePickerClosed);
    return () => {
      if (primaryInput) primaryInput.removeEventListener('cancel', markNativeFilePickerClosed);
      if (addInput) addInput.removeEventListener('cancel', markNativeFilePickerClosed);
    };
  }, [markNativeFilePickerClosed]);

  // Stage files helper
  const stageFilesForPreview = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const carriedCaption = inputMessage;
      setPreMediaDraft(carriedCaption);

      const compressedFiles = await Promise.all(files.map(compressImage));
      setStagedFiles(compressedFiles);
      setPreviewActiveIndex(0);
      setPreviewCaption(carriedCaption);
      if (carriedCaption) {
        setInputMessage('');
        localStorage.removeItem(getInputDraftKey(userId));
        resetInputLayerHeight();
      }
      setShowFilePreview(true);
      gifPicker.setStagedGif(null);
    },
    [inputMessage, resetInputLayerHeight, setInputMessage, userId, gifPicker]
  );

  const closeFilePreviewAndRestoreDraft = useCallback(() => {
    setShowFilePreview(false);
    stagedFiles.forEach(revokeBlobUrl);
    setStagedFiles([]);
    setStagedFile(null);
    setPreviewActiveIndex(0);
    setIsDiscardConfirmationVisible(false);

    if (preMediaDraft) {
      setInputMessage(preMediaDraft);
      localStorage.setItem(getInputDraftKey(userId), preMediaDraft);
      setPreMediaDraft('');
    }
    setPreviewCaption('');
    setPresenceActivity(null);
  }, [preMediaDraft, setInputMessage, userId, setPresenceActivity, stagedFiles]);

  const handleRequestCloseFilePreview = useCallback(() => {
    if (stagedFiles.length > 0 || previewCaption) {
      setIsDiscardConfirmationVisible(true);
    } else {
      closeFilePreviewAndRestoreDraft();
    }
  }, [stagedFiles.length, previewCaption, closeFilePreviewAndRestoreDraft]);

  // Drag and drop overlay
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const fileArr = Array.from(files);
        stageFilesForPreview(fileArr);
      }
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [stageFilesForPreview]);

  // Desktop typing inside preview caption
  useEffect(() => {
    if (!showFilePreview || stagedFiles.length === 0 || !isDesktopInteraction) return;
    requestAnimationFrame(() => {
      const input = previewCaptionInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [isDesktopInteraction, showFilePreview, stagedFiles.length]);

  // Sync loaded media src and cleanup
  useEffect(() => {
    const liveMessageIds = new Set(messages.map((m) => m.id));

    setLoadedMediaSrcById((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [messageId, src] of Object.entries(prev)) {
        if (liveMessageIds.has(messageId)) {
          next[messageId] = src;
        } else {
          changed = true;
          const blobUrl = mediaBlobUrlMapRef.current.get(messageId);
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            mediaBlobUrlMapRef.current.delete(messageId);
          }
        }
      }
      return changed ? next : prev;
    });

    setMediaLoadProgressById((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [messageId, progress] of Object.entries(prev)) {
        if (liveMessageIds.has(messageId)) next[messageId] = progress;
        else changed = true;
      }
      return changed ? next : prev;
    });

    setDownloadProgressById((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [messageId, progress] of Object.entries(prev)) {
        if (liveMessageIds.has(messageId)) next[messageId] = progress;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [messages]);

  // Hydrate cached media blobs
  useEffect(() => {
    if (!isLoggedIn || messages.length === 0) return;
    let isCancelled = false;
    const loadedMessageIds = new Set(loadedMediaMessageIds);

    messages.forEach((message) => {
      if (!message?.id || !message?.url) return;
      if (message.isUploading) return;
      if (message.type !== 'image' && message.type !== 'video') return;
      if (loadedMessageIds.has(message.id)) return;
      if (Object.prototype.hasOwnProperty.call(loadedMediaSrcById, message.id)) return;
      if (mediaLoadInFlightRef.current.has(message.id)) return;

      const safeUrl = sanitizeMediaUrl(message.url);
      if (!safeUrl) return;

      const lookupKey = getMediaCacheLookupKey(message.id, safeUrl);
      if (mediaCacheHydrationInFlightRef.current.has(lookupKey)) return;
      mediaCacheHydrationInFlightRef.current.add(lookupKey);

      void getCachedMediaBlob(userId, message.id, safeUrl)
        .then((cachedBlob) => {
          if (isCancelled || !cachedBlob || cachedBlob.size <= 0) return;

          const objectUrl = URL.createObjectURL(cachedBlob);
          const previousBlobUrl = mediaBlobUrlMapRef.current.get(message.id);
          if (previousBlobUrl && previousBlobUrl !== objectUrl) {
            URL.revokeObjectURL(previousBlobUrl);
          }
          mediaBlobUrlMapRef.current.set(message.id, objectUrl);

          setLoadedMediaSrcById((prev) => ({ ...prev, [message.id]: objectUrl }));
          setLoadedMediaMessageIds((prev) => {
            if (prev.includes(message.id)) return prev;
            const next = [...prev, message.id];
            return next.length > MAX_LOADED_MEDIA_TRACKING
              ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
              : next;
          });
        })
        .finally(() => {
          mediaCacheHydrationInFlightRef.current.delete(lookupKey);
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [messages, loadedMediaMessageIds, loadedMediaSrcById, isLoggedIn, userId]);

  // Request media load
  const handleRequestMediaLoad = useCallback(
    (messageId: string, mediaUrl?: string, allowCancel: boolean = true) => {
      if (!messageId || !mediaUrl) return;
      if (loadedMediaMessageIds.includes(messageId)) return;
      if (mediaLoadInFlightRef.current.has(messageId)) {
        if (!allowCancel) return;
        mediaLoadAbortControllersRef.current.get(messageId)?.abort();
        mediaLoadAbortControllersRef.current.delete(messageId);
        mediaLoadInFlightRef.current.delete(messageId);
        setMediaLoadProgressById((prev) => {
          const { [messageId]: _discard, ...rest } = prev;
          return rest;
        });
        return;
      }

      const safeUrl = sanitizeMediaUrl(mediaUrl);
      if (!safeUrl) {
        setLoadedMediaMessageIds((prev) => {
          if (prev.includes(messageId)) return prev;
          const next = [...prev, messageId];
          return next.length > MAX_LOADED_MEDIA_TRACKING
            ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
            : next;
        });
        return;
      }

      const abortController = new AbortController();
      mediaLoadAbortControllersRef.current.set(messageId, abortController);
      mediaLoadInFlightRef.current.add(messageId);
      setMediaLoadProgressById((prev) => ({ ...prev, [messageId]: 0.02 }));

      void (async () => {
        try {
          const cachedBlob = await getCachedMediaBlob(userId, messageId, safeUrl);
          if (abortController.signal.aborted) return;

          if (cachedBlob && cachedBlob.size > 0) {
            const objectUrl = URL.createObjectURL(cachedBlob);
            const previousBlobUrl = mediaBlobUrlMapRef.current.get(messageId);
            if (previousBlobUrl) URL.revokeObjectURL(previousBlobUrl);
            mediaBlobUrlMapRef.current.set(messageId, objectUrl);
            setLoadedMediaSrcById((prev) => ({ ...prev, [messageId]: objectUrl }));

            setLoadedMediaMessageIds((prev) => {
              if (prev.includes(messageId)) return prev;
              const next = [...prev, messageId];
              return next.length > MAX_LOADED_MEDIA_TRACKING
                ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
                : next;
            });
            return;
          }

          const blob = await fetchBlobWithProgress(
            safeUrl,
            (progress) => {
              setMediaLoadProgressById((prev) => {
                if (!(messageId in prev)) return prev;
                return { ...prev, [messageId]: Math.max(0.02, Math.min(1, progress)) };
              });
            },
            abortController.signal
          );

          if (abortController.signal.aborted) return;

          const objectUrl = URL.createObjectURL(blob);
          const previousBlobUrl = mediaBlobUrlMapRef.current.get(messageId);
          if (previousBlobUrl) URL.revokeObjectURL(previousBlobUrl);
          mediaBlobUrlMapRef.current.set(messageId, objectUrl);
          setLoadedMediaSrcById((prev) => ({ ...prev, [messageId]: objectUrl }));

          void setCachedMediaBlob(userId, messageId, safeUrl, blob);

          setLoadedMediaMessageIds((prev) => {
            if (prev.includes(messageId)) return prev;
            const next = [...prev, messageId];
            return next.length > MAX_LOADED_MEDIA_TRACKING
              ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
              : next;
          });
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          setLoadedMediaMessageIds((prev) => {
            if (prev.includes(messageId)) return prev;
            const next = [...prev, messageId];
            return next.length > MAX_LOADED_MEDIA_TRACKING
              ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
              : next;
          });
        } finally {
          mediaLoadInFlightRef.current.delete(messageId);
          setMediaLoadProgressById((prev) => {
            if (!(messageId in prev)) return prev;
            const { [messageId]: _discard, ...rest } = prev;
            return rest;
          });
        }
      })();
    },
    [userId]
  );

  const handleRequestDownload = useCallback((messageId: string, mediaUrl: string, filename: string) => {
    if (!messageId || !mediaUrl) return;
    const transfer = transferManager.getTransfer(messageId);
    if (transfer?.type === 'download' && transfer?.state === 'downloading') {
      transferManager.pauseTransfer(messageId);
    } else if (transfer?.type === 'download' && transfer?.state === 'paused') {
      transferManager.resumeDownload(messageId, filename);
    } else {
      void transferManager.startDownload(messageId, mediaUrl, filename);
    }
  }, []);

  const handleResumeUpload = useCallback(
    (messageId: string) => {
      const targetMessage = messages.find((m) => m.id === messageId);
      const activity: PresenceActivity =
        targetMessage?.type === 'audio'
          ? 'sending_audio'
          : targetMessage?.type === 'image'
          ? (targetMessage.url && /\.gif($|\?)/i.test(targetMessage.url) ? 'sending_gif' : 'sending_photo')
          : targetMessage?.type === 'video'
          ? 'sending_video'
          : 'sending_file';

      startSendingActivity?.(activity);

      transferManager
        .resumeUpload(messageId, roomId, apiBase, userId)
        ?.catch((error) => {
          if (error.message === 'Aborted') return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, uploadError: true, text: error.message || 'Upload failed' }
                : m
            )
          );
        })
        .then((uploadedFileData) => {
          if (!uploadedFileData) return;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === messageId) {
                const finalMessage = {
                  ...m,
                  ...uploadedFileData,
                  originalName: chooseReadableFilename(uploadedFileData.originalName, m.originalName),
                  isUploading: false,
                  id: uploadedFileData.id,
                };
                ws.current?.send(JSON.stringify({ ...finalMessage, clientTempId: messageId }));
                return finalMessage;
              }
              if (m.replyingTo && m.replyingTo.id === messageId) {
                return {
                  ...m,
                  replyingTo: {
                    ...m.replyingTo,
                    id: uploadedFileData.id,
                    url: uploadedFileData.url || m.replyingTo.url,
                    type: uploadedFileData.type && uploadedFileData.type !== 'system_notification' ? uploadedFileData.type : m.replyingTo.type,
                  }
                };
              }
              return m;
            })
          );
        })
        .finally(() => {
          stopSendingActivity?.();
        });
    },
    [apiBase, messages, roomId, setMessages, startSendingActivity, stopSendingActivity, userId, ws]
  );

  const handleCancelUpload = useCallback((messageId: string) => {
    transferManager.pauseTransfer(messageId);
  }, []);

  useEffect(() => {
    return () => {
      mediaLoadAbortControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      mediaLoadAbortControllersRef.current.clear();

      mediaBlobUrlMapRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      mediaBlobUrlMapRef.current.clear();
    };
  }, []);

  return {
    stagedFile,
    setStagedFile,
    stagedFiles,
    setStagedFiles,
    showFilePreview,
    setShowFilePreview,
    isDiscardConfirmationVisible,
    setIsDiscardConfirmationVisible,
    previewActiveIndex,
    setPreviewActiveIndex,
    previewCaption,
    setPreviewCaption,
    preMediaDraft,
    setPreMediaDraft,
    fileInputRef,
    addFileInputRef,
    previewCaptionInputRef,
    isDragging,
    // GIF Picker delegation
    stagedGif: gifPicker.stagedGif,
    setStagedGif: gifPicker.setStagedGif,
    showGifPicker: gifPicker.showGifPicker,
    setShowGifPicker: gifPicker.setShowGifPicker,
    gifResults: gifPicker.gifResults,
    gifSearchTerm: gifPicker.gifSearchTerm,
    setGifSearchTerm: gifPicker.setGifSearchTerm,
    gifError: gifPicker.gifError,
    setGifError: gifPicker.setGifError,
    setGifFetchKey: gifPicker.setGifFetchKey,
    isLoadingGifs: gifPicker.isLoadingGifs,
    gifPickerRef: gifPicker.gifPickerRef,
    gifSearchInputRef: gifPicker.gifSearchInputRef,
    gifPickerOpenedAtRef: gifPicker.gifPickerOpenedAtRef,
    keyboardWasOpenBeforeGifRef: gifPicker.keyboardWasOpenBeforeGifRef,
    openGifPicker: gifPicker.openGifPicker,
    closeGifPicker: gifPicker.closeGifPicker,
    handleGifSelect: gifPicker.handleGifSelect,
    // Lightbox delegation
    lightboxUrl: lightbox.lightboxUrl,
    setLightboxUrl: lightbox.setLightboxUrl,
    lightboxTransform: lightbox.lightboxTransform,
    isLightboxInteracting: lightbox.isLightboxInteracting,
    canZoomInLightbox: lightbox.canZoomInLightbox,
    canZoomOutLightbox: lightbox.canZoomOutLightbox,
    lightboxFrameRef: lightbox.lightboxFrameRef,
    lightboxImageRef: lightbox.lightboxImageRef,
    openLightbox: lightbox.openLightbox,
    closeLightbox: lightbox.closeLightbox,
    handleLightboxZoomIn: lightbox.handleLightboxZoomIn,
    handleLightboxZoomOut: lightbox.handleLightboxZoomOut,
    handleLightboxWheel: lightbox.handleLightboxWheel,
    handleLightboxPointerDown: lightbox.handleLightboxPointerDown,
    handleLightboxPointerMove: lightbox.handleLightboxPointerMove,
    handleLightboxPointerUp: lightbox.handleLightboxPointerUp,
    handleLightboxPointerCancel: lightbox.handleLightboxPointerCancel,
    handleLightboxImageLoad: lightbox.handleLightboxImageLoad,
    mediaGallery: lightbox.mediaGallery,
    openMediaGallery: lightbox.openMediaGallery,
    closeMediaGallery: lightbox.closeMediaGallery,
    // Media loading and transfers
    userId,
    loadedMediaMessageIds,
    setLoadedMediaMessageIds,
    loadedMediaMessageSet: useMemo(() => new Set(loadedMediaMessageIds), [loadedMediaMessageIds]),
    mediaLoadProgressById,
    loadedMediaSrcById,
    downloadProgressById,
    isNativeFilePickerOpenRef,
    notifyNativeFilePickerOpen,
    markNativeFilePickerClosed,
    stageFilesForPreview,
    closeFilePreviewAndRestoreDraft,
    handleRequestCloseFilePreview,
    handleRequestMediaLoad,
    handleRequestDownload,
    handleResumeUpload,
    handleCancelUpload,
    setPresenceActivity,
  };
}
