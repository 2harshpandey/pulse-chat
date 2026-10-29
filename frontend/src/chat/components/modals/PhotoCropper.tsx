import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sanitizeMediaUrl, getBlobUrl } from '../../utils';
import { CropToolbar, CropToolActionBtn, CropToolbarDivider } from '../../styles/chat.media.styles';

export interface CropRect {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

export interface CropStep {
  crop: CropRect;
  rotation: number; // cumulative degrees (e.g. 0, 90, 180, 270, -90, etc.)
}

export interface PhotoCropperProps {
  file: File;
  onCropChange: (isAdjusted: boolean, getCroppedFile: () => Promise<File | null>) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  canReset?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onReset?: () => void;
}

export const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Rotates a normalized crop rectangle 90 degrees clockwise.
 */
export const rotateCropRight = (c: CropRect): CropRect => {
  const nextX = Math.max(0, Math.min(1, 1 - c.y - c.h));
  const nextY = Math.max(0, Math.min(1, c.x));
  const nextW = Math.max(0.01, Math.min(1 - nextX, c.h));
  const nextH = Math.max(0.01, Math.min(1 - nextY, c.w));
  return {
    x: Math.round(nextX * 10000) / 10000,
    y: Math.round(nextY * 10000) / 10000,
    w: Math.round(nextW * 10000) / 10000,
    h: Math.round(nextH * 10000) / 10000,
  };
};

/**
 * Rotates a normalized crop rectangle 90 degrees counter-clockwise.
 */
export const rotateCropLeft = (c: CropRect): CropRect => {
  const nextX = Math.max(0, Math.min(1, c.y));
  const nextY = Math.max(0, Math.min(1, 1 - c.x - c.w));
  const nextW = Math.max(0.01, Math.min(1 - nextX, c.h));
  const nextH = Math.max(0.01, Math.min(1 - nextY, c.w));
  return {
    x: Math.round(nextX * 10000) / 10000,
    y: Math.round(nextY * 10000) / 10000,
    w: Math.round(nextW * 10000) / 10000,
    h: Math.round(nextH * 10000) / 10000,
  };
};

export const cropFileToCanvas = async (
  file: File,
  crop: CropRect,
  rotation: number = 0
): Promise<File | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) {
        resolve(null);
        return;
      }

      const rot = ((rotation % 360) + 360) % 360;
      const isTransposed = rot === 90 || rot === 270;
      const orientedW = isTransposed ? nh : nw;
      const orientedH = isTransposed ? nw : nh;

      // 1. Draw the rotated original image onto an intermediate canvas
      const orientedCanvas = document.createElement('canvas');
      orientedCanvas.width = orientedW;
      orientedCanvas.height = orientedH;
      const oCtx = orientedCanvas.getContext('2d');
      if (!oCtx) {
        resolve(null);
        return;
      }

      oCtx.save();
      if (rot === 90) {
        oCtx.translate(nh, 0);
        oCtx.rotate(Math.PI / 2);
      } else if (rot === 180) {
        oCtx.translate(nw, nh);
        oCtx.rotate(Math.PI);
      } else if (rot === 270) {
        oCtx.translate(0, nw);
        oCtx.rotate((3 * Math.PI) / 2);
      }
      oCtx.drawImage(img, 0, 0);
      oCtx.restore();

      // 2. Compute the crop bounding box on the oriented image
      const sx = Math.min(orientedW - 1, Math.max(0, Math.round(crop.x * orientedW)));
      const sy = Math.min(orientedH - 1, Math.max(0, Math.round(crop.y * orientedH)));
      const sw = Math.max(1, Math.min(orientedW - sx, Math.round(crop.w * orientedW)));
      const sh = Math.max(1, Math.min(orientedH - sy, Math.round(crop.h * orientedH)));

      // 3. Render cropped slice onto the final canvas
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(orientedCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            canvas.toBlob(
              (fallbackBlob) => {
                if (!fallbackBlob) {
                  resolve(null);
                  return;
                }
                const croppedFile = new File([fallbackBlob], file.name, {
                  type: 'image/png',
                  lastModified: Date.now(),
                });
                resolve(croppedFile);
              },
              'image/png'
            );
            return;
          }
          const croppedFile = new File([blob], file.name, {
            type: mimeType,
            lastModified: Date.now(),
          });
          resolve(croppedFile);
        },
        mimeType,
        0.95
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
};

export const PhotoCropper: React.FC<PhotoCropperProps> = ({
  file,
  onCropChange,
  canUndo: externalCanUndo,
  canRedo: externalCanRedo,
  canReset: externalCanReset,
  onUndo: externalOnUndo,
  onRedo: externalOnRedo,
  onReset: externalOnReset,
}) => {
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
  const [rotation, setRotation] = useState<number>(0);
  const [naturalSize, setNaturalSize] = useState<{ nw: number; nh: number }>({ nw: 1, nh: 1 });
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Step-by-step history buffer for undo/redo before pressing Done
  const [history, setHistory] = useState<CropStep[]>([{ crop: DEFAULT_CROP, rotation: 0 }]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);

  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;

  const onCropChangeRef = useRef(onCropChange);
  onCropChangeRef.current = onCropChange;

  // Reset internal state when file changes
  useEffect(() => {
    setCrop(DEFAULT_CROP);
    setRotation(0);
    setHistory([{ crop: DEFAULT_CROP, rotation: 0 }]);
    setHistoryIdx(0);
  }, [file]);

  // Pre-measure natural dimensions on mount or when file changes
  useEffect(() => {
    let active = true;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (active && img.naturalWidth && img.naturalHeight) {
        setNaturalSize({ nw: img.naturalWidth, nh: img.naturalHeight });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
    return () => {
      active = false;
    };
  }, [file]);

  const rotNormalized = ((rotation % 360) + 360) % 360;
  const isTransposed = rotNormalized === 90 || rotNormalized === 270;
  const orientedAspect =
    naturalSize.nw && naturalSize.nh
      ? isTransposed
        ? naturalSize.nh / naturalSize.nw
        : naturalSize.nw / naturalSize.nh
      : 1;

  // Responsive calculation of visual crop stage dimensions
  const updateBoxSize = useCallback(() => {
    const stage = stageWrapperRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const availW = Math.max(120, stageRect.width - 32);
    // Reserve space for the toolbar (approx 52px + margins/paddings)
    const availH = Math.max(120, stageRect.height - 84);

    let w: number;
    let h: number;
    if (availW / availH > orientedAspect) {
      // Height constrained
      h = Math.floor(availH);
      w = Math.floor(h * orientedAspect);
    } else {
      // Width constrained
      w = Math.floor(availW);
      h = Math.floor(w / orientedAspect);
    }
    setBoxSize({ w: Math.max(80, w), h: Math.max(80, h) });
  }, [orientedAspect]);

  useEffect(() => {
    updateBoxSize();
    const stage = stageWrapperRef.current;
    if (!stage) return;

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        updateBoxSize();
      });
      ro.observe(stage);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', updateBoxSize);
    return () => window.removeEventListener('resize', updateBoxSize);
  }, [updateBoxSize]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalSize({ nw: img.naturalWidth, nh: img.naturalHeight });
    }
  };

  const dragRef = useRef<{
    handle: string;
    startX: number;
    startY: number;
    startCrop: CropRect;
    cw: number;
    ch: number;
  } | null>(null);

  const checkIsAdjusted = (c: CropRect, rot: number) => {
    const cropChanged = c.x > 0.005 || c.y > 0.005 || c.w < 0.995 || c.h < 0.995;
    const rotated = ((rot % 360) + 360) % 360 !== 0;
    return cropChanged || rotated;
  };

  const getCropped = useCallback(() => {
    return cropFileToCanvas(file, cropRef.current, rotationRef.current);
  }, [file]);

  useEffect(() => {
    const isAdj = checkIsAdjusted(crop, rotation);
    onCropChangeRef.current(isAdj, getCropped);
  }, [crop, rotation, getCropped]);

  // Pointer drag handling for handles and crop box
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, handle: string) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...cropRef.current },
      cw: rect.width,
      ch: rect.height,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const { handle, startX, startY, startCrop, cw, ch } = dragRef.current;
    const dx = (e.clientX - startX) / cw;
    const dy = (e.clientY - startY) / ch;

    const minW = Math.max(0.05, 40 / cw);
    const minH = Math.max(0.05, 40 / ch);

    let next = { ...startCrop };

    if (handle === 'move') {
      const nextX = Math.max(0, Math.min(1 - startCrop.w, startCrop.x + dx));
      const nextY = Math.max(0, Math.min(1 - startCrop.h, startCrop.y + dy));
      next = { ...startCrop, x: nextX, y: nextY };
    } else if (handle === 'tl') {
      const newX = Math.min(startCrop.x + startCrop.w - minW, Math.max(0, startCrop.x + dx));
      const newY = Math.min(startCrop.y + startCrop.h - minH, Math.max(0, startCrop.y + dy));
      next = { x: newX, y: newY, w: startCrop.x + startCrop.w - newX, h: startCrop.y + startCrop.h - newY };
    } else if (handle === 't') {
      const newY = Math.min(startCrop.y + startCrop.h - minH, Math.max(0, startCrop.y + dy));
      next = { ...startCrop, y: newY, h: startCrop.y + startCrop.h - newY };
    } else if (handle === 'tr') {
      const newY = Math.min(startCrop.y + startCrop.h - minH, Math.max(0, startCrop.y + dy));
      const newW = Math.max(minW, Math.min(1 - startCrop.x, startCrop.w + dx));
      next = { x: startCrop.x, y: newY, w: newW, h: startCrop.y + startCrop.h - newY };
    } else if (handle === 'r') {
      const newW = Math.max(minW, Math.min(1 - startCrop.x, startCrop.w + dx));
      next = { ...startCrop, w: newW };
    } else if (handle === 'br') {
      const newW = Math.max(minW, Math.min(1 - startCrop.x, startCrop.w + dx));
      const newH = Math.max(minH, Math.min(1 - startCrop.y, startCrop.h + dy));
      next = { ...startCrop, w: newW, h: newH };
    } else if (handle === 'b') {
      const newH = Math.max(minH, Math.min(1 - startCrop.y, startCrop.h + dy));
      next = { ...startCrop, h: newH };
    } else if (handle === 'bl') {
      const newX = Math.min(startCrop.x + startCrop.w - minW, Math.max(0, startCrop.x + dx));
      const newH = Math.max(minH, Math.min(1 - startCrop.y, startCrop.h + dy));
      next = { x: newX, y: startCrop.y, w: startCrop.x + startCrop.w - newX, h: newH };
    } else if (handle === 'l') {
      const newX = Math.min(startCrop.x + startCrop.w - minW, Math.max(0, startCrop.x + dx));
      next = { ...startCrop, x: newX, w: startCrop.x + startCrop.w - newX };
    }

    setCrop(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        if (e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Safe fallback in case browser already released pointer
      }
      dragRef.current = null;

      // Commit completed drag as a new history step
      const lastStep = history[historyIdx];
      if (lastStep) {
        const prev = lastStep.crop;
        const cur = cropRef.current;
        const dx = Math.abs(cur.x - prev.x);
        const dy = Math.abs(cur.y - prev.y);
        const dw = Math.abs(cur.w - prev.w);
        const dh = Math.abs(cur.h - prev.h);

        if (dx > 0.002 || dy > 0.002 || dw > 0.002 || dh > 0.002) {
          const nextStep: CropStep = { crop: cur, rotation: rotationRef.current };
          const nextHistory = [...history.slice(0, historyIdx + 1), nextStep];
          setHistory(nextHistory);
          setHistoryIdx(nextHistory.length - 1);
        }
      }
    }
  };

  // Rotate 90 degrees Left (counter-clockwise)
  const handleRotateLeft = () => {
    const newRotation = rotation - 90;
    const newCrop = rotateCropLeft(crop);
    setCrop(newCrop);
    setRotation(newRotation);

    const nextStep: CropStep = { crop: newCrop, rotation: newRotation };
    const nextHistory = [...history.slice(0, historyIdx + 1), nextStep];
    setHistory(nextHistory);
    setHistoryIdx(nextHistory.length - 1);
  };

  // Rotate 90 degrees Right (clockwise)
  const handleRotateRight = () => {
    const newRotation = rotation + 90;
    const newCrop = rotateCropRight(crop);
    setCrop(newCrop);
    setRotation(newRotation);

    const nextStep: CropStep = { crop: newCrop, rotation: newRotation };
    const nextHistory = [...history.slice(0, historyIdx + 1), nextStep];
    setHistory(nextHistory);
    setHistoryIdx(nextHistory.length - 1);
  };

  // Step-by-step Undo
  const handleUndo = () => {
    if (historyIdx > 0) {
      const prevIdx = historyIdx - 1;
      const prevStep = history[prevIdx];
      setHistoryIdx(prevIdx);
      setCrop(prevStep.crop);
      setRotation(prevStep.rotation);
    }
    externalOnUndo?.();
  };

  // Step-by-step Redo
  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      const nextIdx = historyIdx + 1;
      const nextStep = history[nextIdx];
      setHistoryIdx(nextIdx);
      setCrop(nextStep.crop);
      setRotation(nextStep.rotation);
    }
    externalOnRedo?.();
  };

  // Reset to original uncropped, unrotated photo
  const handleReset = () => {
    const isCurrentlyDefault =
      !checkIsAdjusted(crop, rotation) && ((rotation % 360) + 360) % 360 === 0;
    if (!isCurrentlyDefault) {
      const nextStep: CropStep = { crop: DEFAULT_CROP, rotation: 0 };
      const nextHistory = [...history.slice(0, historyIdx + 1), nextStep];
      setHistory(nextHistory);
      setHistoryIdx(nextHistory.length - 1);
      setCrop(DEFAULT_CROP);
      setRotation(0);
    }
    externalOnReset?.();
  };

  // Keyboard shortcuts (Ctrl+Z for undo, Ctrl+Y or Ctrl+Shift+Z for redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIdx, history]);

  const canUndo = externalCanUndo !== undefined ? externalCanUndo : historyIdx > 0;
  const canRedo =
    externalCanRedo !== undefined ? externalCanRedo : historyIdx < history.length - 1;
  const canReset =
    externalCanReset !== undefined
      ? externalCanReset
      : historyIdx > 0 || checkIsAdjusted(crop, rotation);

  const handleDotStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    width: '13px',
    height: '13px',
    borderRadius: '50%',
    background: '#ffffff',
    border: '2px solid rgba(15, 23, 42, 0.85)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.75)',
    cursor,
    zIndex: 10,
    touchAction: 'none',
    transition: 'transform 0.15s ease',
  });

  return (
    <div
      ref={stageWrapperRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        userSelect: 'none',
        position: 'relative',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Visual Crop Stage Frame */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: boxSize.w ? `${boxSize.w}px` : 'min(88vw, 500px)',
          height: boxSize.h ? `${boxSize.h}px` : 'min(60vh, 380px)',
          maxWidth: '100%',
          maxHeight: 'calc(100% - 70px)',
          borderRadius: '10px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.65)',
          overflow: 'visible',
          transition: 'width 0.28s cubic-bezier(0.25, 1, 0.5, 1), height 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
      >
        {/* Overflow-clipped container for smoothly rotated image */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            borderRadius: '8px',
            pointerEvents: 'none',
          }}
        >
          <img
            ref={imgRef}
            src={sanitizeMediaUrl(getBlobUrl(file))}
            alt="Cropper preview"
            onLoad={handleImageLoad}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: isTransposed
                ? `${boxSize.h || 380}px`
                : `${boxSize.w || 500}px`,
              height: isTransposed
                ? `${boxSize.w || 500}px`
                : `${boxSize.h || 380}px`,
              maxWidth: 'none',
              maxHeight: 'none',
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition:
                'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1), width 0.32s cubic-bezier(0.25, 1, 0.5, 1), height 0.32s cubic-bezier(0.25, 1, 0.5, 1)',
              objectFit: 'cover',
              userSelect: 'none',
              display: 'block',
            }}
          />
        </div>

        {/* 4 Surrounding Dark Mask Overlays */}
        {/* Top Mask */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${crop.y * 100}%`,
            background: 'rgba(0, 0, 0, 0.65)',
            pointerEvents: 'none',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
          }}
        />
        {/* Bottom Mask */}
        <div
          style={{
            position: 'absolute',
            top: `${(crop.y + crop.h) * 100}%`,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            pointerEvents: 'none',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
          }}
        />
        {/* Left Mask */}
        <div
          style={{
            position: 'absolute',
            top: `${crop.y * 100}%`,
            left: 0,
            width: `${crop.x * 100}%`,
            height: `${crop.h * 100}%`,
            background: 'rgba(0, 0, 0, 0.65)',
            pointerEvents: 'none',
          }}
        />
        {/* Right Mask */}
        <div
          style={{
            position: 'absolute',
            top: `${crop.y * 100}%`,
            left: `${(crop.x + crop.w) * 100}%`,
            right: 0,
            height: `${crop.h * 100}%`,
            background: 'rgba(0, 0, 0, 0.65)',
            pointerEvents: 'none',
          }}
        />

        {/* Interactive Crop Box */}
        <div
          style={{
            position: 'absolute',
            top: `${crop.y * 100}%`,
            left: `${crop.x * 100}%`,
            width: `${crop.w * 100}%`,
            height: `${crop.h * 100}%`,
            border: '2px solid rgba(255, 255, 255, 0.95)',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.45), inset 0 0 12px rgba(0, 0, 0, 0.25)',
            cursor: 'move',
            touchAction: 'none',
          }}
          onPointerDown={(e) => handlePointerDown(e, 'move')}
        >
          {/* Rule-of-Thirds Grid Lines for precision visual framing */}
          <div
            style={{
              position: 'absolute',
              top: '33.33%',
              left: 0,
              right: 0,
              borderTop: '1px dashed rgba(255, 255, 255, 0.45)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '66.66%',
              left: 0,
              right: 0,
              borderTop: '1px dashed rgba(255, 255, 255, 0.45)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '33.33%',
              top: 0,
              bottom: 0,
              borderLeft: '1px dashed rgba(255, 255, 255, 0.45)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '66.66%',
              top: 0,
              bottom: 0,
              borderLeft: '1px dashed rgba(255, 255, 255, 0.45)',
              pointerEvents: 'none',
            }}
          />

          {/* 8 Circular Grab Handles */}
          {/* Top-Left */}
          <div
            style={{ ...handleDotStyle('nwse-resize'), top: '-6.5px', left: '-6.5px' }}
            onPointerDown={(e) => handlePointerDown(e, 'tl')}
          />
          {/* Top-Center */}
          <div
            style={{ ...handleDotStyle('ns-resize'), top: '-6.5px', left: 'calc(50% - 6.5px)' }}
            onPointerDown={(e) => handlePointerDown(e, 't')}
          />
          {/* Top-Right */}
          <div
            style={{ ...handleDotStyle('nesw-resize'), top: '-6.5px', right: '-6.5px' }}
            onPointerDown={(e) => handlePointerDown(e, 'tr')}
          />
          {/* Right-Center */}
          <div
            style={{ ...handleDotStyle('ew-resize'), top: 'calc(50% - 6.5px)', right: '-6.5px' }}
            onPointerDown={(e) => handlePointerDown(e, 'r')}
          />
          {/* Bottom-Right */}
          <div
            style={{ ...handleDotStyle('nwse-resize'), bottom: '-6.5px', right: '-6.5px' }}
            onPointerDown={(e) => handlePointerDown(e, 'br')}
          />
          {/* Bottom-Center */}
          <div
            style={{ ...handleDotStyle('ns-resize'), bottom: '-6.5px', left: 'calc(50% - 6.5px)' }}
            onPointerDown={(e) => handlePointerDown(e, 'b')}
          />
          {/* Bottom-Left */}
          <div
            style={{ ...handleDotStyle('nesw-resize'), bottom: '-6.5px', left: '-6.5px' }}
            onPointerDown={(e) => handlePointerDown(e, 'bl')}
          />
          {/* Left-Center */}
          <div
            style={{ ...handleDotStyle('ew-resize'), top: 'calc(50% - 6.5px)', left: '-6.5px' }}
            onPointerDown={(e) => handlePointerDown(e, 'l')}
          />
        </div>
      </div>

      {/* Pro Editing Toolbar: Undo, Redo, Rotate Left, Rotate Right, Reset */}
      <CropToolbar onClick={(e) => e.stopPropagation()}>
        {/* Undo Step */}
        <CropToolActionBtn
          type="button"
          title="Undo"
          aria-label="Undo crop step"
          disabled={!canUndo}
          onClick={handleUndo}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 18, height: 18 }}
          >
            <polyline points="9 14 4 9 9 4" />
            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
          <span style={{ fontSize: '0.85rem' }}>Undo</span>
        </CropToolActionBtn>

        {/* Redo Step */}
        <CropToolActionBtn
          type="button"
          title="Redo"
          aria-label="Redo crop step"
          disabled={!canRedo}
          onClick={handleRedo}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 18, height: 18 }}
          >
            <polyline points="15 14 20 9 15 4" />
            <path d="M4 20v-7a4 4 0 0 1 4-4h16" />
          </svg>
          <span style={{ fontSize: '0.85rem' }}>Redo</span>
        </CropToolActionBtn>

        <CropToolbarDivider />

        {/* Rotate 90° Left */}
        <CropToolActionBtn
          type="button"
          title="Rotate 90° left"
          aria-label="Rotate 90 degrees left"
          onClick={handleRotateLeft}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 18, height: 18 }}
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span style={{ fontSize: '0.85rem' }}>90° Left</span>
        </CropToolActionBtn>

        {/* Rotate 90° Right */}
        <CropToolActionBtn
          type="button"
          title="Rotate 90° right"
          aria-label="Rotate 90 degrees right"
          onClick={handleRotateRight}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 18, height: 18 }}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          <span style={{ fontSize: '0.85rem' }}>90° Right</span>
        </CropToolActionBtn>

        <CropToolbarDivider />

        {/* Reset to Original */}
        <CropToolActionBtn
          type="button"
          title="Reset"
          aria-label="Reset uncropped state"
          disabled={!canReset}
          onClick={handleReset}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 16, height: 16 }}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span style={{ fontSize: '0.85rem' }}>Reset</span>
        </CropToolActionBtn>
      </CropToolbar>
    </div>
  );
};
