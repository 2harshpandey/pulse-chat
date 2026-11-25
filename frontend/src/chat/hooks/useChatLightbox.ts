import { useState, useRef, useCallback } from 'react';
import type { Message } from '../types';
import { sendClientDiagnostic } from '../telemetry';
import { isVideoMedia } from '../../shared/mediaTypes';
import { usePhotoZoom } from './usePhotoZoom';

export interface MediaGalleryState {
  items: Message[];
  initialIndex: number;
  autoPlayVideo?: boolean;
}

export function useChatLightbox() {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [mediaGallery, setMediaGallery] = useState<MediaGalleryState | null>(null);
  const lightboxOpenedAtRef = useRef<number>(0);

  const zoom = usePhotoZoom({
    active: Boolean(lightboxUrl),
    onZoomChange: (nextScale, method) => {
      sendClientDiagnostic(
        'photo_lightbox_zoom',
        { scale: Math.round(nextScale * 100) / 100, method },
        { debounceMs: 400, debounceKey: 'lightbox_zoom' }
      );
    },
  });

  const openMediaGallery = useCallback(
    (items: Message[], initialIndex: number = 0, options?: { autoPlayVideo?: boolean }) => {
      if (!items || items.length === 0) return;
      sendClientDiagnostic('media_gallery_open', { totalItems: items.length, initialIndex });
      setMediaGallery({
        items,
        initialIndex,
        autoPlayVideo: options?.autoPlayVideo ?? true,
      });
    },
    []
  );

  const closeMediaGallery = useCallback(() => {
    sendClientDiagnostic('media_gallery_close');
    setMediaGallery(null);
    setLightboxUrl(null);
  }, []);

  const openLightbox = useCallback((url: string, canonicalUrl?: string) => {
    lightboxOpenedAtRef.current = Date.now();
    sendClientDiagnostic('photo_lightbox_open', { mediaUrl: canonicalUrl || url });
    zoom.resetZoom();
    setLightboxUrl(url);
    const fallbackMsg: Message = {
      id: canonicalUrl || url,
      userId: '',
      username: '',
      text: '',
      timestamp: new Date().toISOString(),
      type: (isVideoMedia({ url }) ? 'video' : 'image') as any,
      url,
    };
    setMediaGallery({ items: [fallbackMsg], initialIndex: 0 });
  }, [zoom]);

  const closeLightbox = useCallback(() => {
    const duration = lightboxOpenedAtRef.current > 0
      ? Math.round((Date.now() - lightboxOpenedAtRef.current) / 1000)
      : 0;
    sendClientDiagnostic('photo_lightbox_close', { durationViewedSeconds: duration });
    setLightboxUrl(null);
    setMediaGallery(null);
  }, []);

  return {
    lightboxUrl,
    setLightboxUrl,
    lightboxTransform: zoom.transform,
    isLightboxInteracting: zoom.isInteracting,
    canZoomInLightbox: zoom.canZoomIn,
    canZoomOutLightbox: zoom.canZoomOut,
    lightboxFrameRef: zoom.frameRef,
    lightboxImageRef: zoom.imageRef,
    openLightbox,
    closeLightbox,
    handleLightboxZoomIn: zoom.handleZoomIn,
    handleLightboxZoomOut: zoom.handleZoomOut,
    handleLightboxWheel: zoom.handleWheel,
    handleLightboxPointerDown: zoom.handlePointerDown,
    handleLightboxPointerMove: zoom.handlePointerMove,
    handleLightboxPointerUp: zoom.handlePointerUp,
    handleLightboxPointerCancel: zoom.handlePointerCancel,
    handleLightboxDoubleClick: zoom.handleDoubleClick,
    handleLightboxDoubleTap: zoom.handleDoubleTap,
    handleLightboxImageLoad: zoom.handleImageLoad,
    mediaGallery,
    openMediaGallery,
    closeMediaGallery,
  };
}
