import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, Gif } from '../types';
import {
  PHOTO_LIGHTBOX_MIN_SCALE,
  PHOTO_LIGHTBOX_MAX_SCALE,
  PHOTO_LIGHTBOX_STEP,
  PHOTO_LIGHTBOX_WHEEL_SENSITIVITY,
  MAX_LOADED_MEDIA_TRACKING,
  getInputDraftKey,
} from '../constants';
import {
  sanitizeMediaUrl,
  fetchBlobWithProgress,
  chooseReadableFilename,
  sanitizeFilename,
  getMediaCacheLookupKey,
  revokeBlobUrl,
} from '../utils';
import { getCachedMediaBlob, setCachedMediaBlob } from '../../mediaCache';
import { transferManager } from '../TransferManager';

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
    img.onerror = () => resolve(file);
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
  setPresenceActivity: (act: 'typing' | 'gif_selecting' | null) => void;
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

  // Drag and Drop
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // GIF Picker
  const [stagedGif, setStagedGif] = useState<Gif | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifResults, setGifResults] = useState<Gif[]>([]);
  const [gifSearchTerm, setGifSearchTerm] = useState('');
  const [gifError, setGifError] = useState('');
  const [gifFetchKey, setGifFetchKey] = useState(0);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);

  const gifPickerRef = useRef<HTMLDivElement>(null!);
  const gifSearchInputRef = useRef<HTMLInputElement>(null);
  const gifPickerOpenedAtRef = useRef<number>(0);
  const keyboardWasOpenBeforeGifRef = useRef<boolean>(false);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxTransform, setLightboxTransform] = useState<{ scale: number; x: number; y: number }>({
    scale: PHOTO_LIGHTBOX_MIN_SCALE,
    x: 0,
    y: 0,
  });
  const [lightboxNaturalSize, setLightboxNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [isLightboxInteracting, setIsLightboxInteracting] = useState(false);

  const lightboxFrameRef = useRef<HTMLDivElement>(null);
  const lightboxImageRef = useRef<HTMLImageElement>(null);
  const lightboxTransformRef = useRef(lightboxTransform);
  const lightboxPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lightboxDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const lightboxPinchRef = useRef<{
    startDistance: number;
    startScale: number;
    focalImageX: number;
    focalImageY: number;
  } | null>(null);
  const lastLightboxTapRef = useRef<number>(0);

  // Media Loading & Hydration
  const [loadedMediaMessageIds, setLoadedMediaMessageIds] = useState<string[]>([]);
  const [mediaLoadProgressById, setMediaLoadProgressById] = useState<Record<string, number>>({});
  const [loadedMediaSrcById, setLoadedMediaSrcById] = useState<Record<string, string>>({});
  const [downloadProgressById, setDownloadProgressById] = useState<Record<string, number>>({});

  const mediaLoadInFlightRef = useRef<Set<string>>(new Set());
  const mediaBlobUrlMapRef = useRef<Map<string, string>>(new Map());
  const mediaCacheHydrationInFlightRef = useRef<Set<string>>(new Set());
  const downloadInFlightRef = useRef<Set<string>>(new Set());
  const downloadAbortControllersRef = useRef(new Map<string, AbortController>());
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
  const stageFilesForPreview = useCallback(async (files: File[]) => {
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
    setStagedGif(null);
  }, [inputMessage, resetInputLayerHeight, setInputMessage, userId]);

  const closeFilePreviewAndRestoreDraft = useCallback(() => {
    setShowFilePreview(false);
    setStagedFiles([]);
    setPreviewCaption('');
    setPreviewActiveIndex(0);
    setInputMessage(preMediaDraft);
    setPreMediaDraft('');
  }, [preMediaDraft, setInputMessage]);

  const handleRequestCloseFilePreview = useCallback(() => {
    if (stagedFiles.length > 0 || previewCaption) {
      setIsDiscardConfirmationVisible(true);
    } else {
      closeFilePreviewAndRestoreDraft();
    }
  }, [stagedFiles.length, previewCaption, closeFilePreviewAndRestoreDraft]);

  // GIF Picker effects
  useEffect(() => {
    if (!showGifPicker) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const doFetch = async () => {
      setIsLoadingGifs(true);
      setGifError('');
      try {
        const q = gifSearchTerm.trim();
        const url = q
          ? `${apiBase}/api/gifs/search?q=${encodeURIComponent(q)}`
          : `${apiBase}/api/gifs/trending`;

        const res = await fetch(url);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error || `Failed to fetch GIFs (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setGifResults(data || []);
      } catch (err: any) {
        if (cancelled) return;
        console.error('GIF fetch error', err);
        setGifError(err.message || 'Failed to load GIFs');
        setGifResults([]);
      } finally {
        if (!cancelled) setIsLoadingGifs(false);
      }
    };

    timer = setTimeout(doFetch, gifSearchTerm.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [showGifPicker, gifSearchTerm, gifFetchKey, apiBase]);

  useEffect(() => {
    if (showGifPicker) {
      setPresenceActivity('gif_selecting');
      return;
    }
    setGifSearchTerm('');
    setGifResults([]);
    setGifError('');
    setGifFetchKey(0);
    setIsLoadingGifs(false);
    setPresenceActivity(null);
    if (keyboardWasOpenBeforeGifRef.current) {
      messageInputRef.current?.focus();
      keyboardWasOpenBeforeGifRef.current = false;
    }
  }, [showGifPicker, setPresenceActivity, messageInputRef]);

  const openGifPicker = useCallback(() => {
    setGifSearchTerm('');
    setGifResults([]);
    setGifError('');
    setShowGifPicker(true);
  }, []);

  const closeGifPicker = useCallback(() => {
    setShowGifPicker(false);
    setGifSearchTerm('');
    setGifResults([]);
    setGifError('');
    setIsLoadingGifs(false);
  }, []);

  const handleGifSelect = useCallback((gif: Gif) => {
    setStagedGif(gif);
    setStagedFile(null);
    setStagedFiles([]);
    setShowFilePreview(false);
    closeGifPicker();
  }, [closeGifPicker]);

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

  // Desktop typing inside preview caption or GIF search
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

  useEffect(() => {
    if (!showGifPicker || !isDesktopInteraction) return;
    requestAnimationFrame(() => {
      const input = gifSearchInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [isDesktopInteraction, showGifPicker]);

  // Lightbox transforms & gestures
  useEffect(() => {
    lightboxTransformRef.current = lightboxTransform;
  }, [lightboxTransform]);

  const clampLightboxOffset = useCallback(
    (scale: number, x: number, y: number) => {
      const frame = lightboxFrameRef.current;
      const natural = lightboxNaturalSize;
      if (!frame || !natural || natural.width <= 0 || natural.height <= 0) {
        return { x, y };
      }
      const frameWidth = frame.clientWidth;
      const frameHeight = frame.clientHeight;
      if (!frameWidth || !frameHeight) return { x, y };

      const fitScale = Math.min(frameWidth / natural.width, frameHeight / natural.height);
      if (!Number.isFinite(fitScale) || fitScale <= 0) return { x, y };

      const displayedWidth = natural.width * fitScale * scale;
      const displayedHeight = natural.height * fitScale * scale;
      const maxX = Math.max(0, (displayedWidth - frameWidth) / 2);
      const maxY = Math.max(0, (displayedHeight - frameHeight) / 2);

      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [lightboxNaturalSize]
  );

  const openLightbox = useCallback((url: string) => {
    setLightboxTransform({ scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 });
    setLightboxUrl(url);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxUrl(null);
  }, []);

  const canZoomOutLightbox = lightboxTransform.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001;
  const canZoomInLightbox = lightboxTransform.scale < PHOTO_LIGHTBOX_MAX_SCALE - 0.001;

  const handleLightboxZoomIn = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setLightboxTransform((prev) => {
        const nextScale = Math.min(PHOTO_LIGHTBOX_MAX_SCALE, prev.scale + PHOTO_LIGHTBOX_STEP);
        const nextOffset = clampLightboxOffset(nextScale, prev.x, prev.y);
        return { scale: nextScale, ...nextOffset };
      });
    },
    [clampLightboxOffset]
  );

  const handleLightboxZoomOut = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setLightboxTransform((prev) => {
        const nextScale = Math.max(PHOTO_LIGHTBOX_MIN_SCALE, prev.scale - PHOTO_LIGHTBOX_STEP);
        const nextOffset = clampLightboxOffset(nextScale, prev.x, prev.y);
        return { scale: nextScale, ...nextOffset };
      });
    },
    [clampLightboxOffset]
  );

  const handleLightboxWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = -e.deltaY * PHOTO_LIGHTBOX_WHEEL_SENSITIVITY;
      setLightboxTransform((prev) => {
        const nextScale = Math.min(
          PHOTO_LIGHTBOX_MAX_SCALE,
          Math.max(PHOTO_LIGHTBOX_MIN_SCALE, prev.scale + delta)
        );
        const nextOffset = clampLightboxOffset(nextScale, prev.x, prev.y);
        return { scale: nextScale, ...nextOffset };
      });
    },
    [clampLightboxOffset]
  );

  const handleLightboxPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      lightboxPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setIsLightboxInteracting(true);

      const pointers = Array.from(lightboxPointersRef.current.values());
      if (pointers.length === 2) {
        const [p1, p2] = pointers;
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        lightboxPinchRef.current = {
          startDistance: dist,
          startScale: lightboxTransformRef.current.scale,
          focalImageX: (p1.x + p2.x) / 2,
          focalImageY: (p1.y + p2.y) / 2,
        };
        lightboxDragRef.current = null;
      } else if (pointers.length === 1) {
        lightboxDragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startOffsetX: lightboxTransformRef.current.x,
          startOffsetY: lightboxTransformRef.current.y,
        };
      }
    },
    []
  );

  const handleLightboxPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!lightboxPointersRef.current.has(e.pointerId)) return;
      lightboxPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pointers = Array.from(lightboxPointersRef.current.values());
      if (pointers.length === 2 && lightboxPinchRef.current) {
        const [p1, p2] = pointers;
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const pinch = lightboxPinchRef.current;
        const scaleFactor = dist / pinch.startDistance;
        const nextScale = Math.min(
          PHOTO_LIGHTBOX_MAX_SCALE,
          Math.max(PHOTO_LIGHTBOX_MIN_SCALE, pinch.startScale * scaleFactor)
        );
        const offset = clampLightboxOffset(
          nextScale,
          lightboxTransformRef.current.x,
          lightboxTransformRef.current.y
        );
        setLightboxTransform({ scale: nextScale, ...offset });
      } else if (pointers.length === 1 && lightboxDragRef.current) {
        const drag = lightboxDragRef.current;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        const offset = clampLightboxOffset(
          lightboxTransformRef.current.scale,
          drag.startOffsetX + dx,
          drag.startOffsetY + dy
        );
        setLightboxTransform((prev) => ({ ...prev, ...offset }));
      }
    },
    [clampLightboxOffset]
  );

  const handleLightboxPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    lightboxPointersRef.current.delete(e.pointerId);
    if (lightboxPointersRef.current.size === 0) {
      setIsLightboxInteracting(false);
      lightboxDragRef.current = null;
      lightboxPinchRef.current = null;
    } else if (lightboxPointersRef.current.size === 1) {
      const [remainingId, point] = Array.from(lightboxPointersRef.current.entries())[0];
      lightboxDragRef.current = {
        pointerId: remainingId,
        startX: point.x,
        startY: point.y,
        startOffsetX: lightboxTransformRef.current.x,
        startOffsetY: lightboxTransformRef.current.y,
      };
      lightboxPinchRef.current = null;
    }
  }, []);

  const handleLightboxImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setLightboxNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

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
    (messageId: string, mediaUrl?: string) => {
      if (!messageId || !mediaUrl) return;
      if (mediaLoadInFlightRef.current.has(messageId)) {
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
              if (m.id !== messageId) return m;
              const finalMessage = {
                ...m,
                ...uploadedFileData,
                originalName: chooseReadableFilename(uploadedFileData.originalName, m.originalName),
                isUploading: false,
                id: uploadedFileData.id,
              };
              ws.current?.send(JSON.stringify(finalMessage));
              return finalMessage;
            })
          );
        });
    },
    [apiBase, roomId, setMessages, userId, ws]
  );

  const handleCancelUpload = useCallback((messageId: string) => {
    transferManager.pauseTransfer(messageId);
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
    stagedGif,
    setStagedGif,
    showGifPicker,
    setShowGifPicker,
    gifResults,
    gifSearchTerm,
    setGifSearchTerm,
    gifError,
    setGifError,
    setGifFetchKey,
    isLoadingGifs,
    gifPickerRef,
    gifSearchInputRef,
    gifPickerOpenedAtRef,
    keyboardWasOpenBeforeGifRef,
    lightboxUrl,
    setLightboxUrl,
    lightboxTransform,
    isLightboxInteracting,
    canZoomInLightbox,
    canZoomOutLightbox,
    lightboxFrameRef,
    lightboxImageRef,
    loadedMediaMessageIds,
    setLoadedMediaMessageIds,
    mediaLoadProgressById,
    loadedMediaSrcById,
    downloadProgressById,
    isNativeFilePickerOpenRef,
    notifyNativeFilePickerOpen,
    markNativeFilePickerClosed,
    stageFilesForPreview,
    closeFilePreviewAndRestoreDraft,
    handleRequestCloseFilePreview,
    openGifPicker,
    closeGifPicker,
    handleGifSelect,
    openLightbox,
    closeLightbox,
    handleLightboxZoomIn,
    handleLightboxZoomOut,
    handleLightboxWheel,
    handleLightboxPointerDown,
    handleLightboxPointerMove,
    handleLightboxPointerUp,
    handleLightboxPointerCancel: handleLightboxPointerUp,
    handleLightboxImageLoad,
    handleRequestMediaLoad,
    handleRequestDownload,
    handleResumeUpload,
    handleCancelUpload,
  };
}
