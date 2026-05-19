import React from 'react';
import type { Message } from './types';
import { sanitizeMediaUrl } from './utils';
import { VideoPlayer } from './VideoPlayer';

export const MediaDisplay = ({ msg, openLightbox }: { msg: Message, openLightbox: (url: string) => void }) => {
  const isVideo = msg.type === 'video' || msg.url?.match(/\.(mp4|webm|mov)$/i);
  const isImage = msg.type === 'image' || msg.url?.match(/\.(jpeg|jpg|gif|png|svg)$/i);

  if (isImage && msg.url) {
    return <img src={sanitizeMediaUrl(msg.url)} alt={msg.originalName} onClick={() => { const u = sanitizeMediaUrl(msg.url); if (u) openLightbox(u); }} onDoubleClick={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} />;
  }

  if (isVideo && msg.url) {
    return <VideoPlayer src={msg.url} />;
  }
  return null;
};