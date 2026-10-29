import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  PHOTO_LIGHTBOX_MIN_SCALE,
  PHOTO_LIGHTBOX_MAX_SCALE,
  PHOTO_LIGHTBOX_STEP,
  PHOTO_LIGHTBOX_WHEEL_SENSITIVITY,
} from '../constants';

export interface UsePhotoZoomReturn {
  transform: { scale: number; x: number; y: number };
  setTransform: React.Dispatch<React.SetStateAction<{ scale: number; x: number; y: number }>>;
  isInteracting: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  isZoomed: boolean;
  frameRef: React.RefObject<HTMLDivElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  resetZoom: () => void;
  handleZoomIn: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleZoomOut: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  handlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLElement>) => void;
  handleDoubleTap: (clientX?: number, clientY?: number) => void;
  handleImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export function usePhotoZoom(): UsePhotoZoomReturn {
  const [transform, setTransform] = useState<{ scale: number; x: number; y: number }>({
    scale: PHOTO_LIGHTBOX_MIN_SCALE,
    x: 0,
    y: 0,
  });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const transformRef = useRef(transform);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    focalImageX: number;
    focalImageY: number;
  } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tapStartRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastDoubleTapTimeRef = useRef<number>(0);
  const lastTouchTimeRef = useRef<number>(0);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const clampOffset = useCallback(
    (scale: number, x: number, y: number) => {
      const frame = frameRef.current;
      const natural = naturalSize;
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
    [naturalSize]
  );

  const isZoomed = transform.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001;
  const canZoomOut = transform.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001;
  const canZoomIn = transform.scale < PHOTO_LIGHTBOX_MAX_SCALE - 0.001;

  const resetZoom = useCallback(() => {
    setTransform({ scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 });
    setIsInteracting(false);
    pointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    lastTapRef.current = null;
    tapStartRef.current = null;
  }, []);

  const handleDoubleTap = useCallback(
    (clientX?: number, clientY?: number) => {
      const now = Date.now();
      if (now - lastDoubleTapTimeRef.current < 250) {
        return;
      }
      lastDoubleTapTimeRef.current = now;

      // Ensure gesture state is clean so CSS transition smoothly animates the zoom
      setIsInteracting(false);
      pointersRef.current.clear();
      dragRef.current = null;
      pinchRef.current = null;
      lastTapRef.current = null;
      tapStartRef.current = null;

      setTransform((prev) => {
        const isCurrentlyZoomed = prev.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.05;
        if (isCurrentlyZoomed) {
          // Restore to normal unzoomed state
          return { scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 };
        }

        // Double tap zooms in to 2.5x (or max scale)
        const targetScale = Math.min(PHOTO_LIGHTBOX_MAX_SCALE, 2.5);
        if (clientX !== undefined && clientY !== undefined && frameRef.current) {
          const rect = frameRef.current.getBoundingClientRect();
          const focalX = clientX - (rect.left + rect.width / 2);
          const focalY = clientY - (rect.top + rect.height / 2);
          const targetX = -focalX * (targetScale - 1);
          const targetY = -focalY * (targetScale - 1);
          const clamped = clampOffset(targetScale, targetX, targetY);
          return { scale: targetScale, ...clamped };
        }
        return { scale: targetScale, x: 0, y: 0 };
      });
    },
    [clampOffset]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      // Guard against synthetic emulated dblclick events dispatched by mobile browsers after touch tap
      if (Date.now() - lastTouchTimeRef.current < 600) {
        return;
      }
      handleDoubleTap(e.clientX, e.clientY);
    },
    [handleDoubleTap]
  );

  const handleZoomIn = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setTransform((prev) => {
        const nextScale = Math.min(PHOTO_LIGHTBOX_MAX_SCALE, prev.scale + PHOTO_LIGHTBOX_STEP);
        const nextOffset = clampOffset(nextScale, prev.x, prev.y);
        return { scale: nextScale, ...nextOffset };
      });
    },
    [clampOffset]
  );

  const handleZoomOut = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setTransform((prev) => {
        const nextScale = Math.max(PHOTO_LIGHTBOX_MIN_SCALE, prev.scale - PHOTO_LIGHTBOX_STEP);
        const nextOffset = clampOffset(nextScale, prev.x, prev.y);
        return { scale: nextScale, ...nextOffset };
      });
    },
    [clampOffset]
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
      const delta = -e.deltaY * PHOTO_LIGHTBOX_WHEEL_SENSITIVITY;
      setTransform((prev) => {
        const nextScale = Math.min(
          PHOTO_LIGHTBOX_MAX_SCALE,
          Math.max(PHOTO_LIGHTBOX_MIN_SCALE, prev.scale + delta)
        );
        const nextOffset = clampOffset(nextScale, prev.x, prev.y);
        return { scale: nextScale, ...nextOffset };
      });
    };

    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      frame.removeEventListener('wheel', onWheel);
    };
  }, [clampOffset]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Native non-passive listener attached to frameRef handles wheel zooming safely.
      // We prevent bubbling without calling e.preventDefault() on passive React synthetic events.
      e.stopPropagation();
    },
    []
  );

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      lastTouchTimeRef.current = Date.now();
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setIsInteracting(true);

    const pointers = Array.from(pointersRef.current.values());
    if (pointers.length === 2) {
      const [p1, p2] = pointers;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchRef.current = {
        startDistance: dist,
        startScale: transformRef.current.scale,
        focalImageX: (p1.x + p2.x) / 2,
        focalImageY: (p1.y + p2.y) / 2,
      };
      dragRef.current = null;
      tapStartRef.current = null;
    } else if (pointers.length === 1) {
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startOffsetX: transformRef.current.x,
        startOffsetY: transformRef.current.y,
      };
      tapStartRef.current = {
        time: Date.now(),
        x: e.clientX,
        y: e.clientY,
      };
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pointers = Array.from(pointersRef.current.values());
      if (pointers.length === 2 && pinchRef.current) {
        const [p1, p2] = pointers;
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const pinch = pinchRef.current;
        const scaleFactor = dist / pinch.startDistance;
        const nextScale = Math.min(
          PHOTO_LIGHTBOX_MAX_SCALE,
          Math.max(PHOTO_LIGHTBOX_MIN_SCALE, pinch.startScale * scaleFactor)
        );
        const offset = clampOffset(
          nextScale,
          transformRef.current.x,
          transformRef.current.y
        );
        setTransform({ scale: nextScale, ...offset });
      } else if (pointers.length === 1 && dragRef.current) {
        const drag = dragRef.current;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        const offset = clampOffset(
          transformRef.current.scale,
          drag.startOffsetX + dx,
          drag.startOffsetY + dy
        );
        setTransform((prev) => ({ ...prev, ...offset }));
      }
    },
    [clampOffset]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') {
        lastTouchTimeRef.current = Date.now();
      }
      pointersRef.current.delete(e.pointerId);

      // Check for tap / double tap gesture
      if (tapStartRef.current) {
        const dx = Math.abs(e.clientX - tapStartRef.current.x);
        const dy = Math.abs(e.clientY - tapStartRef.current.y);
        const dt = Date.now() - tapStartRef.current.time;

        // Tolerant tap detection: finger movement < 18px and tap duration < 400ms
        if (dx < 18 && dy < 18 && dt < 400) {
          const now = Date.now();
          if (lastTapRef.current) {
            const timeSinceLastTap = now - lastTapRef.current.time;
            const distFromLastTap = Math.hypot(
              e.clientX - lastTapRef.current.x,
              e.clientY - lastTapRef.current.y
            );

            // Double tap detected: second tap within 40ms-400ms and within 50px
            if (timeSinceLastTap >= 40 && timeSinceLastTap <= 400 && distFromLastTap < 50) {
              lastTapRef.current = null;
              tapStartRef.current = null;
              handleDoubleTap(e.clientX, e.clientY);
              return;
            }
          }
          lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
        } else {
          // Moved too far to be a tap; treat as drag/pan gesture
          lastTapRef.current = null;
        }
        tapStartRef.current = null;
      }

      if (pointersRef.current.size === 0) {
        setIsInteracting(false);
        dragRef.current = null;
        pinchRef.current = null;
      } else if (pointersRef.current.size === 1) {
        const [remainingId, point] = Array.from(pointersRef.current.entries())[0];
        dragRef.current = {
          pointerId: remainingId,
          startX: point.x,
          startY: point.y,
          startOffsetX: transformRef.current.x,
          startOffsetY: transformRef.current.y,
        };
        pinchRef.current = null;
      }
    },
    [handleDoubleTap]
  );

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  return {
    transform,
    setTransform,
    isInteracting,
    canZoomIn,
    canZoomOut,
    isZoomed,
    frameRef,
    imageRef,
    resetZoom,
    handleZoomIn,
    handleZoomOut,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel: handlePointerUp,
    handleDoubleClick,
    handleDoubleTap,
    handleImageLoad,
  };
}
