import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Message } from '../types';
import {
  PHOTO_LIGHTBOX_MIN_SCALE,
  PHOTO_LIGHTBOX_MAX_SCALE,
  PHOTO_LIGHTBOX_STEP,
  PHOTO_LIGHTBOX_WHEEL_SENSITIVITY,
} from '../constants';
import { sendClientDiagnostic } from '../telemetry';

export function useChatLightbox() {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const lightboxOpenedAtRef = useRef<number>(0);
  const [mediaGallery, setMediaGallery] = useState<{
    items: Message[];
    initialIndex: number;
  } | null>(null);

  const openMediaGallery = useCallback((items: Message[], initialIndex: number = 0) => {
    sendClientDiagnostic('media_gallery_open', { totalItems: items.length, initialIndex });
    setMediaGallery({ items, initialIndex });
  }, []);

  const closeMediaGallery = useCallback(() => {
    sendClientDiagnostic('media_gallery_close');
    setMediaGallery(null);
    setLightboxUrl(null);
  }, []);
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
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tapStartRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastDoubleTapTimeRef = useRef<number>(0);
  const lastLightboxTouchTimeRef = useRef<number>(0);

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

  const openLightbox = useCallback((url: string, canonicalUrl?: string) => {
    lightboxOpenedAtRef.current = Date.now();
    sendClientDiagnostic('photo_lightbox_open', { mediaUrl: canonicalUrl || url });
    setLightboxTransform({ scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 });
    setLightboxUrl(url);
    const fallbackMsg: Message = {
      id: canonicalUrl || url,
      userId: '',
      username: '',
      text: '',
      timestamp: new Date().toISOString(),
      type: (url.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image') as any,
      url,
    };
    setMediaGallery({ items: [fallbackMsg], initialIndex: 0 });
  }, []);

  const closeLightbox = useCallback(() => {
    const duration = lightboxOpenedAtRef.current > 0
      ? Math.round((Date.now() - lightboxOpenedAtRef.current) / 1000)
      : 0;
    sendClientDiagnostic('photo_lightbox_close', { durationViewedSeconds: duration });
    setLightboxUrl(null);
    setMediaGallery(null);
  }, []);

  const canZoomOutLightbox = lightboxTransform.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001;
  const canZoomInLightbox = lightboxTransform.scale < PHOTO_LIGHTBOX_MAX_SCALE - 0.001;

  const handleLightboxZoomIn = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setLightboxTransform((prev) => {
        const nextScale = Math.min(PHOTO_LIGHTBOX_MAX_SCALE, prev.scale + PHOTO_LIGHTBOX_STEP);
        const nextOffset = clampLightboxOffset(nextScale, prev.x, prev.y);
        sendClientDiagnostic(
          'photo_lightbox_zoom',
          { scale: Math.round(nextScale * 100) / 100, method: 'button_zoom_in' },
          { debounceMs: 400, debounceKey: 'lightbox_zoom' }
        );
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
        sendClientDiagnostic(
          'photo_lightbox_zoom',
          { scale: Math.round(nextScale * 100) / 100, method: 'button_zoom_out' },
          { debounceMs: 400, debounceKey: 'lightbox_zoom' }
        );
        return { scale: nextScale, ...nextOffset };
      });
    },
    [clampLightboxOffset]
  );

  useEffect(() => {
    const frame = lightboxFrameRef.current;
    if (!frame || !lightboxUrl) return;

    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
      const delta = -e.deltaY * PHOTO_LIGHTBOX_WHEEL_SENSITIVITY;
      setLightboxTransform((prev) => {
        const nextScale = Math.min(
          PHOTO_LIGHTBOX_MAX_SCALE,
          Math.max(PHOTO_LIGHTBOX_MIN_SCALE, prev.scale + delta)
        );
        const nextOffset = clampLightboxOffset(nextScale, prev.x, prev.y);
        sendClientDiagnostic(
          'photo_lightbox_zoom',
          { scale: Math.round(nextScale * 100) / 100, method: 'mouse_wheel' },
          { debounceMs: 400, debounceKey: 'lightbox_zoom' }
        );
        return { scale: nextScale, ...nextOffset };
      });
    };

    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      frame.removeEventListener('wheel', onWheel);
    };
  }, [lightboxUrl, clampLightboxOffset]);

  const handleLightboxWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Native non-passive listener attached to lightboxFrameRef handles wheel events and calls preventDefault().
      // React synthetic wheel events are passive at the root, so avoid calling preventDefault here.
      e.stopPropagation();
    },
    []
  );

  const handleLightboxDoubleTap = useCallback(
    (clientX?: number, clientY?: number) => {
      const now = Date.now();
      if (now - lastDoubleTapTimeRef.current < 250) {
        return;
      }
      lastDoubleTapTimeRef.current = now;

      setIsLightboxInteracting(false);
      lightboxPointersRef.current.clear();
      lightboxDragRef.current = null;
      lightboxPinchRef.current = null;
      lastTapRef.current = null;
      tapStartRef.current = null;

      setLightboxTransform((prev) => {
        const isCurrentlyZoomed = prev.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.05;
        if (isCurrentlyZoomed) {
          return { scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 };
        }

        const targetScale = Math.min(PHOTO_LIGHTBOX_MAX_SCALE, 2.5);
        if (clientX !== undefined && clientY !== undefined && lightboxFrameRef.current) {
          const rect = lightboxFrameRef.current.getBoundingClientRect();
          const focalX = clientX - (rect.left + rect.width / 2);
          const focalY = clientY - (rect.top + rect.height / 2);
          const targetX = -focalX * (targetScale - 1);
          const targetY = -focalY * (targetScale - 1);
          const clamped = clampLightboxOffset(targetScale, targetX, targetY);
          return { scale: targetScale, ...clamped };
        }
        return { scale: targetScale, x: 0, y: 0 };
      });
    },
    [clampLightboxOffset]
  );

  const handleLightboxDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      // Guard against synthetic emulated dblclick events dispatched by mobile browsers after touch tap
      if (Date.now() - lastLightboxTouchTimeRef.current < 600) {
        return;
      }
      handleLightboxDoubleTap(e.clientX, e.clientY);
    },
    [handleLightboxDoubleTap]
  );

  const handleLightboxPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') {
        lastLightboxTouchTimeRef.current = Date.now();
      }
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
        tapStartRef.current = null;
      } else if (pointers.length === 1) {
        lightboxDragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startOffsetX: lightboxTransformRef.current.x,
          startOffsetY: lightboxTransformRef.current.y,
        };
        tapStartRef.current = {
          time: Date.now(),
          x: e.clientX,
          y: e.clientY,
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

  const handleLightboxPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') {
        lastLightboxTouchTimeRef.current = Date.now();
      }
      lightboxPointersRef.current.delete(e.pointerId);

      if (tapStartRef.current) {
        const dx = Math.abs(e.clientX - tapStartRef.current.x);
        const dy = Math.abs(e.clientY - tapStartRef.current.y);
        const dt = Date.now() - tapStartRef.current.time;

        if (dx < 18 && dy < 18 && dt < 400) {
          const now = Date.now();
          if (lastTapRef.current) {
            const timeSinceLastTap = now - lastTapRef.current.time;
            const distFromLastTap = Math.hypot(
              e.clientX - lastTapRef.current.x,
              e.clientY - lastTapRef.current.y
            );

            if (timeSinceLastTap >= 40 && timeSinceLastTap <= 400 && distFromLastTap < 50) {
              lastTapRef.current = null;
              tapStartRef.current = null;
              handleLightboxDoubleTap(e.clientX, e.clientY);
              return;
            }
          }
          lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
        } else {
          lastTapRef.current = null;
        }
        tapStartRef.current = null;
      }

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
    },
    [handleLightboxDoubleTap]
  );

  const handleLightboxImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setLightboxNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  return {
    lightboxUrl,
    setLightboxUrl,
    lightboxTransform,
    isLightboxInteracting,
    canZoomInLightbox,
    canZoomOutLightbox,
    lightboxFrameRef,
    lightboxImageRef,
    openLightbox,
    closeLightbox,
    handleLightboxZoomIn,
    handleLightboxZoomOut,
    handleLightboxWheel,
    handleLightboxPointerDown,
    handleLightboxPointerMove,
    handleLightboxPointerUp,
    handleLightboxPointerCancel: handleLightboxPointerUp,
    handleLightboxDoubleClick,
    handleLightboxDoubleTap,
    handleLightboxImageLoad,
    mediaGallery,
    openMediaGallery,
    closeMediaGallery,
  };
}
