import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Message } from '../types';
import {
  PHOTO_LIGHTBOX_MIN_SCALE,
  PHOTO_LIGHTBOX_MAX_SCALE,
  PHOTO_LIGHTBOX_STEP,
  PHOTO_LIGHTBOX_WHEEL_SENSITIVITY,
} from '../constants';

export function useChatLightbox() {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [mediaGallery, setMediaGallery] = useState<{
    items: Message[];
    initialIndex: number;
  } | null>(null);

  const openMediaGallery = useCallback((items: Message[], initialIndex: number = 0) => {
    setMediaGallery({ items, initialIndex });
  }, []);

  const closeMediaGallery = useCallback(() => {
    setMediaGallery(null);
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
    handleLightboxImageLoad,
    mediaGallery,
    openMediaGallery,
    closeMediaGallery,
  };
}
