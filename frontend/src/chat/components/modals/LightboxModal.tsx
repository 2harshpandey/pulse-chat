import React from 'react';
import { PHOTO_LIGHTBOX_MIN_SCALE } from '../../constants';
import { sanitizeMediaUrl } from '../../utils';
import {
  Lightbox,
  LightboxCloseButton,
  LightboxFrame,
  LightboxImage,
  LightboxToolbar,
  LightboxZoomButton,
} from '../../Chat.styles';

export interface LightboxTransform {
  x: number;
  y: number;
  scale: number;
}

export interface LightboxModalProps {
  url: string | null;
  transform: LightboxTransform;
  isInteracting: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onClose: () => void;
  onZoomIn: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onZoomOut: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onWheel?: (e: React.WheelEvent<HTMLDivElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  frameRef?: React.RefObject<HTMLDivElement>;
  imageRef?: React.RefObject<HTMLImageElement>;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  url,
  transform,
  isInteracting,
  canZoomIn,
  canZoomOut,
  onClose,
  onZoomIn,
  onZoomOut,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onImageLoad,
  frameRef,
  imageRef,
}) => {
  if (!url) return null;

  const isZoomed = transform.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001;

  return (
    <Lightbox onClick={onClose}>
      <LightboxCloseButton
        type="button"
        aria-label="Close photo viewer"
        title="Close"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <svg viewBox="0 0 24 24">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </LightboxCloseButton>
      <LightboxFrame
        ref={frameRef}
        $isZoomed={isZoomed}
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <LightboxImage
          ref={imageRef}
          src={sanitizeMediaUrl(url)}
          alt="Photo viewer"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onLoad={onImageLoad}
          $isZoomed={isZoomed}
          $isInteracting={isInteracting}
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          }}
        />
        <LightboxToolbar onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <LightboxZoomButton
            type="button"
            title="Zoom out"
            aria-label="Zoom out"
            disabled={!canZoomOut}
            onClick={onZoomOut}
          >
            <svg viewBox="0 0 24 24">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </LightboxZoomButton>
          <LightboxZoomButton
            type="button"
            title="Zoom in"
            aria-label="Zoom in"
            disabled={!canZoomIn}
            onClick={onZoomIn}
          >
            <svg viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </LightboxZoomButton>
        </LightboxToolbar>
      </LightboxFrame>
    </Lightbox>
  );
};
