import React from 'react';
import type { Message } from './types';
import { sanitizeMediaUrl } from './utils';
import { VideoPlayer } from './VideoPlayer';
import { MediaImageWrapper } from './ChatStyledComponents';

export const MediaDisplay = ({ msg, openLightbox }: { msg: Message, openLightbox: (url: string, canonicalUrl?: string) => void }) => {
  const isVideo = msg.type === 'video' || msg.url?.match(/\.(mp4|webm|mov)$/i);
  const isImage = msg.type === 'image' || msg.url?.match(/\.(jpeg|jpg|gif|png|svg)$/i);

  if (isImage && msg.url) {
    return (
      <MediaImageWrapper>
        <img src={sanitizeMediaUrl(msg.url)} alt={msg.originalName} onClick={() => { const u = sanitizeMediaUrl(msg.url); if (u) openLightbox(u, msg.url); }} onDoubleClick={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} />
      </MediaImageWrapper>
    );
  }

  if (isVideo && msg.url) {
    return <VideoPlayer src={msg.url} fallbackUrl={msg.url} />;
  }
  return null;
};