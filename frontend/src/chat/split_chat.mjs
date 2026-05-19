// split_chat.mjs — splits Chat.tsx into focused modules
// Run with: node frontend/src/chat/split_chat.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const chatPath = join(root, 'frontend/src/Chat.tsx');
const outDir = join(root, 'frontend/src/chat');

const src = readFileSync(chatPath, 'utf8');
const lines = src.split('\n');
const total = lines.length;
console.log(`Chat.tsx total lines: ${total}`);

// Helper: get lines [start..end] (1-based, inclusive)
function getLines(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

// ─── FILE 1: ChatStyledComponents.tsx ───────────────────────────────────────
// Lines 37–3041 (styled components + keyframes block 1)
// Lines 4722–4811 (ScrollToBottomButton + NewMessagesBadge)
const scContent = [
  `import styled, { createGlobalStyle, keyframes, css } from 'styled-components';`,
  ``,
  getLines(37, 3041),
  ``,
  getLines(4722, 4811),
].join('\n');
writeFileSync(join(outDir, 'ChatStyledComponents.tsx'), scContent, 'utf8');
console.log('✓ ChatStyledComponents.tsx written');

// ─── FILE 2: VideoPlayer.tsx ─────────────────────────────────────────────────
// Lines 3042–3463
const vpContent = [
  `import React, { useState, useEffect, useRef, useCallback } from 'react';`,
  `import { SPEEDS } from './constants';`,
  `import {`,
  `  VideoPlayerWrapper, CVPContainer, CVPControls, CVPTimelineWrapper, CVPTimelineTrack,`,
  `  CVPTimelineFill, CVPTimelineThumb, CVPBottomRow, CVPIconBtn, CVPTime, CVPSpeedBtn,`,
  `  CVPVolumeWrapper, CVPDoubleTapOverlay, CVPTapIndicator, CVPCenterPlayBtn,`,
  `  DownloadProgressRing,`,
  `} from './ChatStyledComponents';`,
  ``,
  getLines(3042, 3463),
].join('\n');
writeFileSync(join(outDir, 'VideoPlayer.tsx'), vpContent, 'utf8');
console.log('✓ VideoPlayer.tsx written');

// ─── FILE 3: MediaDisplay.tsx ────────────────────────────────────────────────
// Lines 3465–3477
const mdContent = [
  `import React from 'react';`,
  `import type { Message } from './types';`,
  `import { sanitizeMediaUrl } from './utils';`,
  `import { VideoPlayer } from './VideoPlayer';`,
  ``,
  getLines(3465, 3477),
].join('\n');
writeFileSync(join(outDir, 'MediaDisplay.tsx'), mdContent, 'utf8');
console.log('✓ MediaDisplay.tsx written');

// ─── FILE 4: renderMessage.tsx ───────────────────────────────────────────────
// Lines 3479–3829
const rmContent = [
  `import React from 'react';`,
  `import type { Message } from './types';`,
  `import {`,
  `  sanitizeMediaUrl, isTenorUrl, withCloudinaryTransform, getMediaGatePreviewUrl,`,
  `  formatMediaSize, getFileContainerLabel, buildDownloadProxyUrl,`,
  `  fetchBlobWithProgress, downloadFile,`,
  `} from './utils';`,
  `import {`,
  `  MediaContent, MediaImageWrapper, MediaVideoWrapperDiv, MediaLoadGate, MediaLoadPreview,`,
  `  MediaLoadIcon, MediaLoadLabel, MediaSizeBadge, MediaDownloadOverlayBtn,`,
  `  FileAttachmentCard, FileAttachmentMeta, FileAttachmentName, FileAttachmentDetails,`,
  `  MessageText, DownloadProgressRing,`,
  `} from './ChatStyledComponents';`,
  `import { VideoPlayer } from './VideoPlayer';`,
  `import { MediaDisplay } from './MediaDisplay';`,
  ``,
  getLines(3479, 3829),
].join('\n');
writeFileSync(join(outDir, 'renderMessage.tsx'), rmContent, 'utf8');
console.log('✓ renderMessage.tsx written');

// ─── FILE 5: LinkPreview.tsx ─────────────────────────────────────────────────
// Lines 3831–3929
const lpContent = [
  `import React, { useState, useEffect } from 'react';`,
  `import type { LinkPreviewData } from './types';`,
  `import { MAX_LINK_PREVIEW_CACHE_ENTRIES } from './constants';`,
  `import { resolveApiBaseUrl } from './utils';`,
  `import {`,
  `  LinkPreviewCard, LinkPreviewImage, LinkPreviewBody, LinkPreviewSiteName,`,
  `  LinkPreviewTitle, LinkPreviewDesc,`,
  `} from './ChatStyledComponents';`,
  ``,
  getLines(3831, 3929),
].join('\n');
writeFileSync(join(outDir, 'LinkPreview.tsx'), lpContent, 'utf8');
console.log('✓ LinkPreview.tsx written');

// ─── FILE 6: MessageItem.tsx ─────────────────────────────────────────────────
// Lines 3932–4658
const miContent = [
  `import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';`,
  `import { useDrag } from '@use-gesture/react';`,
  `import type { Message, MessageItemProps } from './types';`,
  `import { LONG_PRESS_CANCEL_MOVE_PX } from './constants';`,
  `import {`,
  `  getMessageElementId, getQuotedPreviewThumbUrl, wrapEmojis,`,
  `  sanitizeMediaUrl, getBlobUrl, revokeBlobUrl, getMediaCacheLookupKey,`,
  `  inferredContentLengthByUrlCache, resolveApiBaseUrl,`,
  `} from './utils';`,
  `import {`,
  `  MessageRow, MessageBubble, Username, FooterContainer, Timestamp,`,
  `  QuotedMessageContainer, QuotedMediaThumb, MessageActions, ActionButton,`,
  `  SelectCheckboxContainer, Checkbox, MobileReactionPicker, ReactionEmoji,`,
  `  ReactionsContainer, DeleteMenu, DeleteMenuItem, SystemMessage,`,
  `} from './ChatStyledComponents';`,
  `import { renderMessageContent } from './renderMessage';`,
  `import { LinkPreview } from './LinkPreview';`,
  `import { getCachedMediaBlob, setCachedMediaBlob } from '../mediaCache';`,
  ``,
  getLines(3932, 4658),
].join('\n');
writeFileSync(join(outDir, 'MessageItem.tsx'), miContent, 'utf8');
console.log('✓ MessageItem.tsx written');

// ─── FILE 7: TypingIndicator.tsx ─────────────────────────────────────────────
// Lines 4661–4720
const tiContent = [
  `import React from 'react';`,
  `import type { TypingIndicatorProps } from './types';`,
  `import { BouncingDots, TypingIndicatorContainer } from './ChatStyledComponents';`,
  ``,
  getLines(4661, 4720),
].join('\n');
writeFileSync(join(outDir, 'TypingIndicator.tsx'), tiContent, 'utf8');
console.log('✓ TypingIndicator.tsx written');

console.log('\nAll Phase A files written successfully.');
