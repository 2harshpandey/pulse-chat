// fix_all_exports.mjs — fixes all missing exports and imports from Phase A
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');

function fix(relPath, fn) {
  const path = join(root, relPath);
  let content = readFileSync(path, 'utf8');
  const result = fn(content);
  writeFileSync(path, result, 'utf8');
  console.log(`✓ Fixed: ${relPath}`);
}

// ─── 1. ChatStyledComponents.tsx — add export to all top-level const ───
fix('frontend/src/chat/ChatStyledComponents.tsx', (c) => {
  // Replace "^const " with "export const " at start of lines
  return c.replace(/^const ([A-Za-z])/gm, 'export const $1');
});

// ─── 2. VideoPlayer.tsx — add export + sanitizeMediaUrl import ───
fix('frontend/src/chat/VideoPlayer.tsx', (c) => {
  // Add sanitizeMediaUrl to utils import
  c = c.replace(
    `import { SPEEDS } from './constants';`,
    `import { SPEEDS } from './constants';\nimport { sanitizeMediaUrl } from './utils';`
  );
  // Add export to VideoPlayer component
  c = c.replace(
    `\nconst VideoPlayer = (`,
    `\nexport const VideoPlayer = (`
  );
  return c;
});

// ─── 3. MediaDisplay.tsx — add export ───
fix('frontend/src/chat/MediaDisplay.tsx', (c) => {
  return c.replace(
    `\nconst MediaDisplay = (`,
    `\nexport const MediaDisplay = (`
  );
});

// ─── 4. renderMessage.tsx — add exports + wrapEmojis + VideoPlayerWrapper imports ───
fix('frontend/src/chat/renderMessage.tsx', (c) => {
  // Add wrapEmojis to utils imports
  c = c.replace(
    `  fetchBlobWithProgress, downloadFile,\n} from './utils';`,
    `  fetchBlobWithProgress, downloadFile, wrapEmojis,\n} from './utils';`
  );
  // Add VideoPlayerWrapper to ChatStyledComponents imports
  c = c.replace(
    `  MessageText, DownloadProgressRing,\n} from './ChatStyledComponents';`,
    `  MessageText, DownloadProgressRing, VideoPlayerWrapper,\n} from './ChatStyledComponents';`
  );
  // Export the functions
  c = c.replace(/^const (VALID_TLDS|LINK_COLOR_OWN|CANDIDATE_URL_RE|normalizeUrl|safeHref|renderTextWithLinks|detectFirstUrl|renderMessageContent) /gm, 'export const $1 ');
  return c;
});

// ─── 5. LinkPreview.tsx — add exports ───
fix('frontend/src/chat/LinkPreview.tsx', (c) => {
  c = c.replace(/^const (linkPreviewCache|linkPreviewInFlight|getLinkPreviewFallback|rememberLinkPreview|fetchLinkPreviewData|LinkPreview) /gm, 'export const $1 ');
  return c;
});

// ─── 6. MessageItem.tsx — add export + missing imports ───
fix('frontend/src/chat/MessageItem.tsx', (c) => {
  // Add missing imports to utils
  c = c.replace(
    `  getMessageElementId, getQuotedPreviewThumbUrl, wrapEmojis,\n  sanitizeMediaUrl, getBlobUrl, revokeBlobUrl, getMediaCacheLookupKey,\n  inferredContentLengthByUrlCache, resolveApiBaseUrl,\n} from './utils';`,
    `  getMessageElementId, getQuotedPreviewThumbUrl, wrapEmojis,\n  sanitizeMediaUrl, getBlobUrl, revokeBlobUrl, getMediaCacheLookupKey,\n  inferredContentLengthByUrlCache, resolveApiBaseUrl,\n  buildDownloadProxyUrl, normalizeMessageId, resolveReplyTargetId,\n} from './utils';`
  );
  // Add quoteLog to constants import
  c = c.replace(
    `import { LONG_PRESS_CANCEL_MOVE_PX } from './constants';`,
    `import { LONG_PRESS_CANCEL_MOVE_PX, quoteLog } from './constants';`
  );
  // Add missing styled components
  c = c.replace(
    `  ReactionsContainer, DeleteMenu, DeleteMenuItem, SystemMessage,\n} from './ChatStyledComponents';`,
    `  ReactionsContainer, DeleteMenu, DeleteMenuItem, SystemMessage,\n  MessageText, ReactionEmojiSpan, ReactionCountSpan,\n} from './ChatStyledComponents';`
  );
  // Add detectFirstUrl import from renderMessage
  c = c.replace(
    `import { renderMessageContent } from './renderMessage';`,
    `import { renderMessageContent, detectFirstUrl } from './renderMessage';`
  );
  // Add createPortal import
  c = c.replace(
    `import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';`,
    `import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';\nimport { createPortal } from 'react-dom';`
  );
  // Export MessageItem
  c = c.replace(
    `\nconst MessageItem = React.memo(`,
    `\nexport const MessageItem = React.memo(`
  );
  return c;
});

// ─── 7. TypingIndicator.tsx — add export + UserProfile import ───
fix('frontend/src/chat/TypingIndicator.tsx', (c) => {
  // Add UserProfile import
  c = c.replace(
    `import React from 'react';`,
    `import React from 'react';\nimport type { UserProfile } from '../UserContext';`
  );
  // Export all three components
  c = c.replace(/^const (TypingIndicator|FilmIcon|FileIcon) /gm, 'export const $1 ');
  return c;
});

// ─── 8. Chat.tsx — add CANDIDATE_URL_RE + renderTextWithLinks imports + re-export GlobalStyle ───
fix('frontend/src/Chat.tsx', (c) => {
  // Add CANDIDATE_URL_RE and renderTextWithLinks to renderMessage import
  c = c.replace(
    `import { renderMessageContent, detectFirstUrl } from './chat/renderMessage';`,
    `import { renderMessageContent, detectFirstUrl, CANDIDATE_URL_RE, renderTextWithLinks } from './chat/renderMessage';`
  );
  // Add re-export of GlobalStyle if not already there
  if (!c.includes('export { GlobalStyle }')) {
    c = c.replace(
      `} from './chat/ChatStyledComponents';`,
      `} from './chat/ChatStyledComponents';\nexport { GlobalStyle };`
    );
  }
  return c;
});

console.log('\nAll fixes applied. Run: cd frontend && npx tsc --noEmit');
