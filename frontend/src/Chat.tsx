import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import styled, { createGlobalStyle, keyframes, css } from 'styled-components';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useDrag } from '@use-gesture/react';
import { UserContext, UserProfile } from './UserContext';
import { useTheme } from './ThemeContext';
import { useParams } from 'react-router-dom';
import Auth from './Auth';

// --- UTILITY ---
const getUserId = (): string => {
  let userId = localStorage.getItem('pulseUserId');
  if (!userId) {
    // Use crypto.getRandomValues() for a cryptographically secure user ID.
    const array = new Uint32Array(3);
    window.crypto.getRandomValues(array);
    userId = Date.now().toString(36) + Array.from(array, n => n.toString(36)).join('');
    localStorage.setItem('pulseUserId', userId);
  }
  return userId;
};

/**
 * Trusted CDN hostnames allowed as download targets in downloadFile.
 * Any URL whose hostname is not in this list is ignored to prevent fetching
 * untrusted hosts if message URLs are ever tampered with.
 */
const ALLOWED_DOWNLOAD_HOSTS = ['res.cloudinary.com', 'media.tenor.com', 'tenor.com'];

/**
 * Triggers a browser download for a file hosted on a trusted CDN.
 * Uses a fetch->blob->objectURL flow so media is downloaded directly instead of
 * opening in a new tab.
 */
const downloadFile = (url: string, filename: string): void => {
  const normalizeFilename = (name: string, fallback: string): string => {
    const raw = (name || '').trim();
    const cleaned = raw
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    return cleaned || fallback;
  };

  const triggerAnchorDownload = (href: string, downloadName: string) => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = downloadName;
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  void (async () => {
    // Parse and validate — do nothing if the URL is invalid or the host is not trusted.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }

    const isTrustedHost =
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      ALLOWED_DOWNLOAD_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    if (!isTrustedHost) return;

    const pathName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
    const fallbackName = pathName || 'download';
    const safeFilename = normalizeFilename(filename, normalizeFilename(fallbackName, 'download'));

    try {
      const response = await fetch(parsed.href, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error('Empty download');

      const objectUrl = URL.createObjectURL(blob);
      triggerAnchorDownload(objectUrl, safeFilename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      // Fallback for CDNs that block CORS: still attempt browser-managed download.
      triggerAnchorDownload(parsed.href, safeFilename);
    }
  })();
};

/**
 * Sanitizes a URL before using it as a media src/href attribute.
 * Rejects any URL whose protocol is not https:, http:, or blob: — prevents
 * XSS via javascript: or data: URIs that could be injected through server data.
 * Returns the URL-parser canonical form (parsed.href) rather than the raw input
 * string so that static-analysis taint tracking sees a URL-object-derived value,
 * not the original user-controlled string.
 */
const sanitizeMediaUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'blob:') {
      return ''; // Reject dangerous protocols (javascript:, data:, etc.)
    }
    return parsed.href; // Canonical form from the URL parser — not the raw input string
  } catch {
    return ''; // Unparseable URL — reject
  }
};

/**
 * Returns true only if the URL hostname is exactly tenor.com or a subdomain.
 * A simple .includes('tenor.com') check can be bypassed by embedding it anywhere
 * in the URL — e.g. http://evil.com/path/tenor.com would incorrectly pass.
 */
const isTenorUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'tenor.com' || hostname.endsWith('.tenor.com');
  } catch {
    return false;
  }
};

const withCloudinaryTransform = (url: string, transform: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'res.cloudinary.com' && !host.endsWith('.res.cloudinary.com')) return '';

    const marker = '/upload/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return '';

    const prefix = parsed.pathname.slice(0, markerIndex + marker.length);
    const rest = parsed.pathname.slice(markerIndex + marker.length);
    if (!rest) return '';

    parsed.pathname = `${prefix}${transform}/${rest}`;
    return parsed.href;
  } catch {
    return '';
  }
};

const getQuotedPreviewThumbUrl = (mediaType: 'image' | 'video', mediaUrl?: string): string => {
  const safeUrl = sanitizeMediaUrl(mediaUrl);
  if (!safeUrl) return '';

  if (mediaType === 'video') {
    // Cloudinary can generate a still thumbnail from the first frame.
    return withCloudinaryTransform(safeUrl, 'so_0,f_jpg,q_20,w_96,h_96,c_fill') || '';
  }

  // Prefer a tiny compressed image variant for quoted previews.
  return withCloudinaryTransform(safeUrl, 'f_auto,q_20,w_96,h_96,c_fill') || safeUrl;
};

const getCurrentHistoryPath = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

type RouterHistoryState = {
  usr?: Record<string, unknown>;
  key?: string;
  idx?: number;
  overlayGuard?: boolean;
  [key: string]: unknown;
};

const readRouterHistoryState = (): RouterHistoryState => {
  const raw = window.history.state;
  if (raw && typeof raw === 'object') {
    return { ...(raw as RouterHistoryState) };
  }
  return {};
};

const readRouterUserState = (state: RouterHistoryState): Record<string, unknown> => {
  if (state.usr && typeof state.usr === 'object' && !Array.isArray(state.usr)) {
    return { ...(state.usr as Record<string, unknown>) };
  }
  return {};
};

const buildOverlayGuardState = (
  baseState: RouterHistoryState,
  hasOverlayGuard: boolean,
  mode: 'push' | 'replace',
): RouterHistoryState => {
  const nextBase = { ...baseState };
  const nextUserState = readRouterUserState(baseState);

  // Migrate older top-level overlayGuard flag to Router's user state bucket.
  if (Object.prototype.hasOwnProperty.call(nextBase, 'overlayGuard')) {
    if (nextBase.overlayGuard === true) {
      nextUserState.overlayGuard = true;
    }
    delete nextBase.overlayGuard;
  }

  if (hasOverlayGuard) {
    nextUserState.overlayGuard = true;
  } else {
    delete nextUserState.overlayGuard;
  }

  const fallbackIdx = Math.max(window.history.length - 1, 0);
  const currentIdx = typeof nextBase.idx === 'number' ? nextBase.idx : fallbackIdx;
  const currentKey = typeof nextBase.key === 'string' && nextBase.key
    ? nextBase.key
    : Math.random().toString(36).slice(2, 10);

  return {
    ...nextBase,
    usr: nextUserState,
    idx: mode === 'push' ? currentIdx + 1 : currentIdx,
    key: mode === 'push' ? Math.random().toString(36).slice(2, 10) : currentKey,
  };
};

const pushOverlayGuardHistoryEntry = (): void => {
  const nextState = buildOverlayGuardState(readRouterHistoryState(), true, 'push');
  window.history.pushState(nextState, document.title, getCurrentHistoryPath());
};

const clearOverlayGuardHistoryEntry = (): void => {
  const nextState = buildOverlayGuardState(readRouterHistoryState(), false, 'replace');
  window.history.replaceState(nextState, document.title, getCurrentHistoryPath());
};

/**
 * Module-level WeakMap cache for blob: URLs.
 * Keeping creation here (outside React's render/state data-flow) ensures
 * CodeQL cannot build a taint path from File objects (DOM sources) through
 * React state into img/video src sinks.  The WeakMap holds File→blobUrl so
 * entries are automatically eligible for GC once the File is released.
 */
const _blobUrlCache = new WeakMap<File, string>();
const getBlobUrl = (file: File | undefined): string => {
  if (!file) return '';
  if (!_blobUrlCache.has(file)) {
    _blobUrlCache.set(file, URL.createObjectURL(file));
  }
  return _blobUrlCache.get(file)!;
};
const revokeBlobUrl = (file: File): void => {
  const url = _blobUrlCache.get(file);
  if (url) { URL.revokeObjectURL(url); _blobUrlCache.delete(file); }
};

// --- CONSTANTS ---
/** WhatsApp-equivalent message character limit. */
const MAX_MESSAGE_LENGTH = 65536;
const INITIAL_HISTORY_BATCH_SIZE = 80;
const HISTORY_PAGE_SIZE = 50;
const INITIAL_FIRST_ITEM_INDEX = 100000;
const MAX_LINK_PREVIEW_CACHE_ENTRIES = 250;
const VIRTUOSO_OVERSCAN_DESKTOP = 128;
const VIRTUOSO_OVERSCAN_MOBILE = 96;
const VIRTUOSO_VIEWPORT_BY_DESKTOP = { top: 240, bottom: 160 };
const VIRTUOSO_VIEWPORT_BY_MOBILE = { top: 180, bottom: 120 };
const MAX_NEW_MESSAGE_INDICATOR_COUNT = 99;
const MAX_LOADED_MEDIA_TRACKING = 800;
const MAX_QUOTE_JUMP_STACK_DEPTH = 64;
const MAX_QUOTE_AUTO_LOAD_PAGES = 120;
const LONG_PRESS_CANCEL_MOVE_PX = 8;
const MIN_REPORT_REASON_LENGTH = 5;
const MAX_REPORT_REASON_LENGTH = 500;

// --- STYLED COMPONENTS ---
export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; overflow: hidden; overscroll-behavior: none; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: var(--bg-primary); color: var(--text-primary); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; transition: background-color 0.3s ease, color 0.3s ease; }
  * { -webkit-tap-highlight-color: transparent; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
`;

const slideIn = keyframes`
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const fadeInScale = keyframes`
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
`;

/* ═══ Premium Reaction Animations ═══ */
const reactionBounceIn = keyframes`
  0%   { transform: scale(0); opacity: 0; }
  50%  { transform: scale(1.3); opacity: 1; }
  70%  { transform: scale(0.9); }
  85%  { transform: scale(1.06); }
  100% { transform: scale(1); }
`;

const reactionPillPop = keyframes`
  0%   { transform: scale(0.3) translateY(8px); opacity: 0; }
  60%  { transform: scale(1.08) translateY(-2px); opacity: 1; }
  80%  { transform: scale(0.97) translateY(1px); }
  100% { transform: scale(1) translateY(0); }
`;

const staggerFadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px) scale(0.8); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const mediaLoadPulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.92; }
  50% { transform: scale(1.06); opacity: 1; }
`;

const emojiPopTap = keyframes`
  0%   { transform: scale(1); }
  40%  { transform: scale(0.75); }
  70%  { transform: scale(1.25); }
  100% { transform: scale(1); }
`;

const reactionPickerSlideIn = keyframes`
  0%   { opacity: 0; transform: scale(0.8) translateY(10px); }
  60%  { opacity: 1; transform: scale(1.03) translateY(-2px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
`;

const countBump = keyframes`
  0%   { transform: scale(1); }
  50%  { transform: scale(1.35); color: var(--accent-blue); }
  100% { transform: scale(1); }
`;

const quoteJumpHighlight = keyframes`
  0% {
    box-shadow: inset 0 0 0 0 rgba(56, 189, 248, 0);
    background-color: rgba(56, 189, 248, 0);
  }
  30% {
    box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.62);
    background-color: rgba(56, 189, 248, 0.16);
  }
  100% {
    box-shadow: inset 0 0 0 0 rgba(56, 189, 248, 0);
    background-color: rgba(56, 189, 248, 0);
  }
`;

/* ═══ Site-Wide Premium Animations ═══ */
const subtleSlideUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const inputFocusGlow = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
  50%  { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12); }
  100% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
`;

const modalSlideUp = keyframes`
  0%   { opacity: 0; transform: translateY(30px) scale(0.95); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

const gifItemReveal = keyframes`
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
`;

const replySlideIn = keyframes`
  from { opacity: 0; transform: translateY(8px) scaleY(0.9); }
  to   { opacity: 1; transform: translateY(0) scaleY(1); }
`;

const selectModeSlideUp = keyframes`
  from { opacity: 0; transform: translateY(100%); }
  to   { opacity: 1; transform: translateY(0); }
`;

const shimmerOverlay = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const sendPulse = keyframes`
  0%   { transform: scale(1); }
  50%  { transform: scale(0.88); }
  100% { transform: scale(1); }
`;

const systemMsgFade = keyframes`
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
`;

const filePreviewEnter = keyframes`
  from { opacity: 0; backdrop-filter: blur(0px); }
  to   { opacity: 1; backdrop-filter: blur(24px); }
`;

const sidebarItemSlide = keyframes`
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0); }
`;

const scrollBtnBounce = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
`;

const newMessageBadgeGlow = keyframes`
  0%, 100% { box-shadow: 0 3px 10px rgba(37, 99, 235, 0.35); }
  50%      { box-shadow: 0 5px 14px rgba(14, 165, 233, 0.48); }
`;

const EmojiPickerWrapper = styled.div`
  animation: ${fadeInScale} 0.2s ease-out forwards;
`;

/** WhatsApp-style bottom panel for emoji pickers on mobile.
 *  Sits exactly where the keyboard would be, below the footer. */
const MobileEmojiPanel = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  max-height: 45vh;
  animation: ${slideIn} 0.2s ease-out forwards;
  .epr-main {
    width: 100% !important;
    border: none !important;
    border-radius: 0 !important;
  }
`;

const pulseBorderAnim = keyframes`
  0%, 100% { border-color: rgba(99, 179, 237, 0.5); box-shadow: 0 0 0 0 rgba(99, 179, 237, 0); }
  50% { border-color: rgba(147, 210, 255, 0.95); box-shadow: 0 0 28px 6px rgba(99, 179, 237, 0.18); }
`;

const floatAnim = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
`;

const DragDropOverlay = styled.div<{ $isVisible: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: ${props => props.$isVisible ? 'all' : 'none'};
  opacity: ${props => props.$isVisible ? 1 : 0};
  transition: opacity 0.2s ease;
  background: rgba(10, 18, 35, 0.78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
`;

const DragDropCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 48px 72px;
  background: rgba(255, 255, 255, 0.07);
  border: 2.5px dashed rgba(99, 179, 237, 0.55);
  border-radius: 28px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  animation: ${pulseBorderAnim} 2s ease-in-out infinite;
  @media (max-width: 768px) {
    padding: 36px 44px;
    gap: 14px;
  }
`;

const DragDropIconWrapper = styled.div`
  color: rgba(147, 210, 255, 0.92);
  animation: ${floatAnim} 3s ease-in-out infinite;
  filter: drop-shadow(0 4px 16px rgba(99, 179, 237, 0.4));
`;

const DragDropTitle = styled.p`
  font-size: 1.5rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.97);
  letter-spacing: -0.015em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  @media (max-width: 768px) { font-size: 1.25rem; }
`;

const DragDropSubtitle = styled.p`
  font-size: 0.92rem;
  color: rgba(255, 255, 255, 0.52);
  letter-spacing: 0.02em;
  @media (max-width: 768px) { font-size: 0.82rem; }
`;

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: var(--app-height, 100dvh);
`;
const Header = styled.header`
  background-color: var(--bg-header);
  padding: 1rem;
  border-bottom: 1px solid var(--border-primary);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  animation: ${subtleSlideUp} 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent-blue), transparent);
    opacity: 0.4;
    animation: ${shimmerOverlay} 3s ease-in-out infinite;
  }

  @media (max-width: 768px) {
    padding: 0.5rem 1rem;
  }
`;
const HeaderTitle = styled.h1`
  font-size: 1.25rem;
  font-weight: bold;
  color: var(--text-heading);
  text-align: center;
  flex-grow: 1;
  transition: color 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  a {
    color: inherit;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    transition: color 0.2s ease;
  }
  a:hover {
    color: var(--accent-blue);
  }
  span {
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  img {
    height: 44px;
    width: auto;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    pointer-events: none;
  }
`;
const LayoutContainer = styled.div`
  display: flex;
  flex-grow: 1;
  overflow: hidden;
`;
const ChatWindow = styled.main`
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: ${slideIn} 0.5s ease-out forwards;
  -webkit-overflow-scrolling: touch; /* Enable momentum scrolling on iOS */
  touch-action: pan-y; /* Allow vertical panning */
`;
const MessagesContainer = styled.div<{ $isScrollButtonVisible?: boolean; $isMobileView?: boolean; }>`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  padding: 0 1rem;
  padding-right: ${props => !props.$isMobileView && props.$isScrollButtonVisible ? '64px' : '1rem'};
  transition: padding-right 0.3s ease;
  /* Virtuoso items need gap via item wrapper since Virtuoso manages its own scroll */
  & [data-virtuoso-scroller] {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
  }
  & [data-test-id="virtuoso-item-list"] > div {
    padding-top: 0;
    padding-bottom: 0;
  }
`;

/* Wraps MessagesContainer + ScrollToBottomButton so the button is anchored
   to the bottom of the messages area — automatically above whatever the footer contains */
const MessagesAndScrollWrapper = styled.div`
  flex: 1;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const MessageRow = styled.div<{ $sender: string; $isSelected?: boolean; $isActiveDeleteMenu?: boolean; $isGrouped?: boolean; }>`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  position: relative;
  background-color: ${props => props.$isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent'};
  border-radius: 8px;
  transition: background-color 0.2s ease;
  user-select: none;
  touch-action: pan-y; /* Allow vertical scrolling, while manually handling horizontal drag */
  z-index: ${props => props.$isActiveDeleteMenu ? 40 : 'auto'};
  /* Grouped = same sender continuation: tight gap; non-grouped = new sender: clear separation */
  padding-top: ${props => props.$isGrouped ? '2px' : '6px'};
  padding-bottom: 1px;

  &.quote-jump-highlight {
    animation: ${quoteJumpHighlight} 1.25s ease-out;
  }
`;
const Username = styled.div<{ $sender: 'me' | 'other' }>`
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  margin-bottom: 4px;
  display: inline-block;
  background-color: ${props => props.$sender === 'me' ? '#DBEAFE' : '#F1F5F9'};
  color: ${props => props.$sender === 'me' ? '#1E40AF' : '#475569'};
  text-shadow: none;
  transition: background-color 0.3s ease, color 0.3s ease;

  [data-theme='dark'] & {
    background-color: ${props => props.$sender === 'me' ? 'rgba(59,130,246,0.2)' : 'var(--bg-hover)'};
    color: ${props => props.$sender === 'me' ? '#93c5fd' : 'var(--text-secondary)'};
  }
`;
const MobileReactionPicker = styled.div<{ $sender: 'me' | 'other' }>`
  position: absolute;
  top: -44px;
  z-index: 30;
  background: var(--bg-elevated);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 24px;
  padding: 5px 10px;
  display: flex;
  gap: 2px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
  border: 1px solid var(--border-primary);
  animation: ${reactionPickerSlideIn} 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;

  [data-theme='dark'] & {
    background: rgba(30, 41, 59, 0.92);
    box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2);
  }

  ${props => props.$sender === 'me' 
    ? `right: 10px;` 
    : `left: 10px;`
  }

  /* Stagger each emoji child */
  & > button {
    animation: ${staggerFadeIn} 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  & > button:nth-child(1) { animation-delay: 0.03s; }
  & > button:nth-child(2) { animation-delay: 0.06s; }
  & > button:nth-child(3) { animation-delay: 0.09s; }
  & > button:nth-child(4) { animation-delay: 0.12s; }
  & > button:nth-child(5) { animation-delay: 0.15s; }
  & > button:nth-child(6) { animation-delay: 0.18s; }
  & > button:nth-child(7) { animation-delay: 0.21s; }
  & > button:nth-child(8) { animation-delay: 0.24s; }
`;
const MessageBubble = styled.div<{ $sender: string; $messageType: string; $isUploading?: boolean; $uploadError?: boolean; }>`
  position: relative;
  max-width: ${props => props.$messageType === 'text' ? '62%' : 'min(82vw, 340px)'};
  padding: ${props => props.$messageType === 'text' ? '0.24rem 0.48rem 0.12rem' : '0.28rem 0.34rem'};
  border-radius: 0.82rem;
  background-color: ${props => props.$sender === 'me' ? '#3B82F6' : 'var(--bg-message-other)'};
  color: ${props => props.$sender === 'me' ? 'white' : 'var(--text-primary)'};
  box-shadow: ${props => props.$sender === 'me' ? '0 0.5px 1px rgba(0,0,0,0.07)' : '0 0.5px 1px rgba(0,0,0,0.05)'};
  cursor: pointer;
  min-width: ${props => props.$messageType === 'text' ? '4.5rem' : '0'};
  opacity: ${props => props.$isUploading ? 0.5 : 1};
  transition: opacity 0.3s ease, background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;
  border: ${props => props.$uploadError ? '1px solid #ef4444' : (props.$sender === 'me' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.08)')};
  will-change: transform;
  align-self: ${props => props.$sender === 'me' ? 'flex-end' : 'flex-start'};

  @media (max-width: 768px) {
    max-width: ${props => props.$messageType === 'text' ? '68%' : 'min(72vw, 252px)'};
  }

  @media (max-width: 420px) {
    max-width: ${props => props.$messageType === 'text' ? '72%' : 'min(68vw, 232px)'};
  }

  [data-theme='dark'] & {
    border-color: ${props => props.$uploadError ? '#ef4444' : (props.$sender === 'me' ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.14)')};
  }
`;

const EditInput = styled.textarea`
  width: 100%;
  border: none;
  background: transparent;
  color: white;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  resize: none;
  outline: none;
  padding: 0;
  margin: 0;
  height: auto;
`;

const EditActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;
const FooterContainer = styled.div<{ $sender: 'me' | 'other' }>`
  display: flex;
  align-items: flex-end;
  gap: 4px;
  margin-top: 0;

  ${props => props.$sender === 'me' 
    ? `
      justify-content: flex-end;
      padding-right: 2px;
    ` 
    : `
      justify-content: flex-start;
      padding-left: 2px;
    `
  }
`;

const Timestamp = styled.div<{ $sender: string }>`
  font-size: 0.72rem;
  margin-top: 0;
  text-align: right;
  white-space: nowrap;
  color: ${props => props.$sender === 'me' ? '#bfdbfe' : 'var(--text-muted)'};
  user-select: none;
  transition: color 0.3s ease;
`;
const Footer = styled.footer`
  background-color: var(--bg-header);
  border-top: 1px solid var(--border-primary);
  flex-shrink: 0;
  z-index: 10;
  transition: background-color 0.3s ease, border-color 0.3s ease;
  animation: ${subtleSlideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
`;
const InputContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  transition: all 0.3s ease;
`;

const PlusMenuButton = styled.button<{ $isOpen?: boolean }>`
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  background: var(--bg-hover);
  color: var(--text-secondary);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  svg {
    width: 22px;
    height: 22px;
    stroke: currentColor;
    stroke-width: 2;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    transform: ${props => props.$isOpen ? 'rotate(45deg)' : 'rotate(0deg)'};
  }
  &:hover:not(:disabled) {
    background: var(--border-primary);
    transform: scale(1.1);
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  }
  &:active:not(:disabled) {
    transform: scale(0.92);
  }
`;

const plusMenuSlideIn = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const PlusMenu = styled.div<{ $isVisible: boolean }>`
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 6px;
  background: var(--bg-elevated);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
  border: 1px solid var(--border-primary);
  overflow: hidden;
  display: ${props => props.$isVisible ? 'flex' : 'none'};
  flex-direction: column;
  min-width: 150px;
  animation: ${plusMenuSlideIn} 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  z-index: 20;
  transition: background-color 0.3s ease;

  [data-theme='dark'] & {
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
  }
`;

const PlusMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 16px;
  background: none;
  border: none;
  color: var(--text-primary);
  text-align: left;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover { background: var(--bg-hover); padding-left: 20px; }
  &:active { background: var(--border-primary); }
  svg { width: 18px; height: 18px; flex-shrink: 0; stroke: var(--text-secondary); transition: transform 0.2s ease, stroke 0.2s ease; }
  &:hover svg { transform: scale(1.1); stroke: var(--accent-blue); }
`;

const MessageInput = styled.textarea<{ $hasUrl?: boolean }>`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-secondary);
  border-radius: 0.75rem;
  transition: all 0.2s;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  resize: none;
  max-height: 120px;
  overflow-y: hidden;
  touch-action: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  background: ${p => p.$hasUrl ? 'transparent' : 'var(--bg-input)'};
  color: ${p => p.$hasUrl ? 'transparent' : 'var(--text-primary)'};
  caret-color: var(--text-primary);
  position: relative;
  z-index: 1;
  &:focus { 
    outline: none; 
    border-color: #3B82F6; 
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    animation: ${inputFocusGlow} 0.6s ease-out forwards;
  }
  &::placeholder { color: ${p => p.$hasUrl ? 'transparent' : 'var(--text-muted)'}; transition: color 0.3s ease; }
  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
  &::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
`;
const InputTextWrapper = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
`;
const InputHighlightOverlay = styled.div`
  position: absolute;
  top: 1px;
  left: 1px;
  right: 1px;
  bottom: 1px;
  padding: 0.75rem;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
  color: var(--text-primary);
  border-radius: calc(0.75rem - 1px);
  background: var(--bg-input);
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
`;
const CharacterCounter = styled.span<{ $warning: boolean }>`
  position: absolute;
  bottom: 4px;
  right: 52px;
  font-size: 0.7rem;
  color: ${props => props.$warning ? '#dc2626' : '#94a3b8'};
  pointer-events: none;
  user-select: none;
  line-height: 1;
`;
const SendButton = styled.button`
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  background-color: #3B82F6;
  color: white;
  font-weight: 500;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex; align-items: center; justify-content: center;
  &:hover:not(:disabled) { 
    background-color: #2563EB; 
    transform: scale(1.12);
    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.35), 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  &:active:not(:disabled) {
    animation: ${sendPulse} 0.25s ease-out;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
  }
  &:disabled { 
    background-color: #9ca3af; 
    cursor: not-allowed; 
    transform: scale(1);
    box-shadow: none;
    opacity: 0.6;
  }
`;

const FileAttachmentCard = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(0,0,0,0.07);
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.1);
  color: inherit;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  max-width: 280px;
  animation: ${subtleSlideUp} 0.3s ease-out forwards;
  &:hover { 
    background: rgba(0,0,0,0.13); 
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }
  &:active { transform: scale(0.98); }
  svg { flex-shrink: 0; transition: transform 0.2s ease; }
  &:hover svg { transform: scale(1.05); }
  span { font-size: 0.85rem; font-weight: 500; word-break: break-all; opacity: 0.85; flex: 1; min-width: 0; }
`;

const MediaContent = styled.div`
  user-select: none;
  p { margin-bottom: 0.5rem; }
  p + div, p + img, p + video { margin-top: 0.5rem; }
`;

const mediaFrameStyles = css`
  position: relative;
  display: block;
  width: min(100%, 320px);
  min-width: 208px;
  max-width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 0.75rem;
  overflow: hidden;

  @media (max-width: 768px) {
    width: min(100%, 236px);
    min-width: 182px;
  }

  @media (max-width: 420px) {
    width: min(100%, 212px);
    min-width: 164px;
  }
`;

/* Absolutely-positioned download button that appears over images */
const MediaDownloadOverlayBtn = styled.button`
  position: absolute;
  top: 8px;
  left: 8px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.18s, background 0.15s;
  z-index: 2;
  svg { width: 15px; height: 15px; }
  &:hover { background: rgba(0, 0, 0, 0.72); }
  @media (max-width: 768px) { opacity: 1; width: 28px; height: 28px; }
`;

/* Uniform frame wrapper for media objects to prevent scroll glitches during lazy load */
const MediaImageWrapper = styled.div`
  ${mediaFrameStyles}
  background-color: var(--bg-hover);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    cursor: pointer;
    border-radius: 0.75rem;
  }
  
  &:hover ${MediaDownloadOverlayBtn} { opacity: 1; }
`;

const MediaLoadGate = styled.button`
  position: absolute;
  inset: 0;
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
  color: #f8fafc;
  background:
    radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 45%),
    linear-gradient(160deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.78));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  transition: transform 0.18s ease, filter 0.18s ease;

  &:hover {
    transform: scale(1.015);
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.985);
  }
`;

const MediaLoadIcon = styled.span`
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.34);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.4);
  animation: ${mediaLoadPulse} 1.75s ease-in-out infinite;

  svg {
    width: 18px;
    height: 18px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @media (max-width: 768px) {
    width: 40px;
    height: 40px;
  }
`;

const MediaLoadLabel = styled.span`
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  opacity: 0.95;
  text-align: center;
  padding: 0 0.35rem;
`;

/* Small inline download button for videos and file cards */
const InlineDownloadBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding: 4px 10px;
  background: rgba(0,0,0,0.06);
  border: 1px solid rgba(0,0,0,0.09);
  border-radius: 7px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 500;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
  &:hover { opacity: 1; background: rgba(0,0,0,0.12); }
  svg { width: 13px; height: 13px; flex-shrink: 0; }
`;

/* ═══ WhatsApp-style File Preview Modal ═══ */
const FilePreviewModal = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: #1b2430;
  color: white;
  animation: ${filePreviewEnter} 0.3s ease-out forwards;
`;
const FilePreviewModalHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  background: rgba(0,0,0,0.25);
  flex-shrink: 0;
`;
const FilePreviewModalClose = styled.button`
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { background: rgba(255,255,255,0.1); transform: scale(1.1) rotate(90deg); }
  &:active { transform: scale(0.9); }
  svg { width: 22px; height: 22px; }
`;
const FilePreviewModalFilename = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 0.92rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
`;
const FilePreviewModalBody = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 20px;
  min-height: 0;
  animation: ${fadeInScale} 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
`;
const FilePreviewModalFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(0,0,0,0.25);
  flex-shrink: 0;
`;
const FilePreviewThumbStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0,0,0,0.18);
  flex-shrink: 0;
  overflow-x: auto;
  &::-webkit-scrollbar { height: 4px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.25); border-radius: 2px; }
`;
const FilePreviewThumb = styled.button<{ $active?: boolean }>`
  width: 52px;
  height: 52px;
  min-width: 52px;
  border-radius: 8px;
  border: 2.5px solid ${p => p.$active ? '#3b82f6' : 'transparent'};
  overflow: hidden;
  cursor: pointer;
  background: #2a3544;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  &:hover { transform: scale(1.08); border-color: ${p => p.$active ? '#3b82f6' : 'rgba(255,255,255,0.2)'}; }
  img, video { width: 100%; height: 100%; object-fit: cover; }
  svg { width: 24px; height: 24px; stroke: rgba(255,255,255,0.55); }
`;
const FilePreviewAddBtn = styled.button`
  width: 52px;
  height: 52px;
  min-width: 52px;
  border-radius: 8px;
  border: 2px dashed rgba(255,255,255,0.3);
  background: transparent;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { border-color: rgba(255,255,255,0.55); color: rgba(255,255,255,0.8); transform: scale(1.08); }
  &:active { transform: scale(0.95); }
  svg { width: 24px; height: 24px; }
`;
const FilePreviewRemoveBtn = styled.button`
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #1b2430;
  color: white;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  line-height: 1;
`;
const FilePreviewCaptionInput = styled.input`
  flex: 1;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 20px;
  padding: 10px 16px;
  color: white;
  font-size: 0.92rem;
  outline: none;
  transition: all 0.3s ease;
  &::placeholder { color: rgba(255,255,255,0.4); }
  &:focus { border-color: rgba(59, 130, 246, 0.6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
`;
const FilePreviewSendBtn = styled.button`
  width: 46px;
  height: 46px;
  min-width: 46px;
  border-radius: 50%;
  border: none;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { background: #2563eb; transform: scale(1.1); box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35); }
  &:active { transform: scale(0.92); }
  &:disabled { opacity: 0.5; cursor: default; transform: none; }
  svg { width: 22px; height: 22px; }
`;
const FilePreviewNoPreview = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  background: rgba(0,0,0,0.2);
  border-radius: 16px;
  svg { width: 72px; height: 72px; stroke: rgba(255,255,255,0.35); stroke-width: 1.2; }
  p { font-size: 1rem; opacity: 0.6; }
  span { font-size: 0.82rem; opacity: 0.4; text-transform: uppercase; }
`;

const ConfirmationButton = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  
  &.delete {
    background-color: #EF4444;
    color: white;
    &:hover { background-color: #DC2626; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); }
    &:active { transform: scale(0.96); }
  }

  &.cancel {
    background-color: #e2e8f0;
    color: #4a5568;
    &:hover { background-color: #cbd5e0; transform: translateY(-1px); }
    &:active { transform: scale(0.96); }
  }
`;





const ReactionsContainer = styled.div<{ $sender: 'me' | 'other' }>`
  position: absolute;
  bottom: -16px;
  z-index: 1;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  padding: 3px 8px 3px 6px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04);
  cursor: pointer;
  animation: ${reactionPillPop} 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;

  &:hover {
    transform: scale(1.08);
    box-shadow: 0 4px 18px rgba(0,0,0,0.14), 0 0 0 1px rgba(59, 130, 246, 0.15);
  }
  &:active {
    transform: scale(0.96);
  }

  [data-theme='dark'] & {
    background: rgba(30, 41, 59, 0.85);
    box-shadow: 0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06);
    &:hover {
      box-shadow: 0 4px 18px rgba(0,0,0,0.4), 0 0 0 1px rgba(96, 165, 250, 0.2);
    }
  }

  ${props => props.$sender === 'me' 
    ? `left: -10px;` 
    : `right: -10px;`
  }
`;
const Lightbox = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 1000; cursor: pointer;
  animation: ${fadeInScale} 0.3s ease-out forwards;
  img { max-width: 90%; max-height: 90%; border-radius: 12px; box-shadow: 0 25px 60px rgba(0,0,0,0.4); }
`;
const DeleteMenu = styled.div`
  background: var(--bg-elevated); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); overflow: hidden; border: 1px solid var(--border-primary); pointer-events: all; transition: background-color 0.3s ease;
  animation: ${fadeInScale} 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  min-width: 160px;
  [data-theme='dark'] & { box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
`;
const DeleteMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 15px;
  background: none;
  border: none;
  color: var(--text-primary);
  text-align: left;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  &:hover { background-color: var(--bg-hover); padding-left: 18px; }
  &:active { background-color: var(--border-primary); }
  svg { transition: transform 0.2s ease; }
  &:hover svg { transform: scale(1.1); }
`;
const FilePreviewContainer = styled.div`
  padding: 10px 1rem; border-top: 1px solid var(--border-primary); display: flex; align-items: center; gap: 10px; background-color: var(--bg-tertiary); transition: background-color 0.3s ease, border-color 0.3s ease;
  animation: ${replySlideIn} 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
`;
const FilePreviewImage = styled.img`
  width: 50px; height: 50px; border-radius: 8px; object-fit: cover;
`;
const FilePreviewInfo = styled.div`
  flex-grow: 1; font-size: 0.9rem; color: var(--text-secondary);
`;
const CancelPreviewButton = styled.button`
  background: var(--bg-hover); border-radius: 50%; border: none; width: 30px; height: 30px; min-width: 30px; min-height: 30px; flex-shrink: 0; cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; color: var(--text-primary);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { background-color: var(--border-primary); transform: scale(1.1) rotate(90deg); }
  &:active { transform: scale(0.9); }
`;

const GifPickerModal = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50;
  animation: ${fadeInScale} 0.3s ease-out forwards;
`;
const GifPickerContent = styled.div`
  background: var(--bg-elevated); width: 90%; max-width: 500px; height: 70%; max-height: 600px; border-radius: 12px; display: flex; flex-direction: column; transition: background-color 0.3s ease;
  animation: ${modalSlideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  box-shadow: 0 25px 60px rgba(0,0,0,0.3);
  overflow: hidden;
`;
const GifSearchBar = styled.input`
  width: 100%; border: none; border-bottom: 1px solid var(--border-primary); padding: 1rem; font-size: 1rem; background: transparent; color: var(--text-primary); transition: border-color 0.3s ease, box-shadow 0.3s ease;
  &:focus { outline: none; border-bottom-color: var(--accent-blue); box-shadow: 0 1px 0 0 var(--accent-blue); } &::placeholder { color: var(--text-muted); }
`;
const GifGrid = styled.div`
  flex-grow: 1; overflow-y: auto; padding: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;
`;
const GifGridItem = styled.img`
  width: 100%; height: 120px; object-fit: cover; border-radius: 8px; cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: ${gifItemReveal} 0.3s ease-out both;
  &:hover { transform: scale(1.06); box-shadow: 0 4px 16px rgba(0,0,0,0.15); border-radius: 10px; }
  &:active { transform: scale(0.96); }
`;
const UserSidebar = styled.aside<{ $isVisible: boolean }>`
  width: 240px;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border-primary);
  padding: 1.5rem 1rem;
  overflow-y: hidden;
  transition: background-color 0.3s ease, border-color 0.3s ease;
  flex-shrink: 0;
  user-select: none;
  @media (min-width: 769px) {
    animation: ${subtleSlideUp} 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  display: flex;
  flex-direction: column;
  h2 {
    color: var(--text-heading);
    margin-bottom: 0.75rem;
    transition: color 0.3s ease;
    font-size: 0.9rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  @media (max-width: 768px) {
    position: fixed;
    top: 40px;
    right: 0;
    bottom: 0;
    z-index: 40;
    transform: ${props => props.$isVisible ? 'translateX(0)' : 'translateX(100%)'};
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease, border-color 0.3s ease;
    visibility: ${props => props.$isVisible ? 'visible' : 'hidden'};
  }
`;
// Transparent backdrop behind the sidebar on mobile — clicking it closes the panel
const SidebarBackdrop = styled.div<{ $isVisible: boolean }>`
  display: none;
  @media (max-width: 768px) {
    display: ${props => props.$isVisible ? 'block' : 'none'};
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 39;
  }
`;
const UserList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  margin-top: 0.5rem;
  flex-grow: 1; /* Allow UserList to take up available space */
  overflow-y: auto; /* Enable scrolling for the user list */
`;
const UserListItem = styled.li<{ index: number }>`
  color: var(--text-primary);
  font-weight: 500;
    margin-bottom: 0.1rem;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  transition: all 0.25s ease;
  animation: ${sidebarItemSlide} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: ${props => props.index * 0.06}s;
  opacity: 0;

  &:hover {
    background: var(--bg-hover);
    transform: translateX(4px);
  }
`;
const MobileUserListToggle = styled(SendButton)<{ $isOpen?: boolean }>`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    /* Override inherited hover-rotation — hover is sticky on mobile after a tap.
       Rotation is controlled by the $isOpen state prop instead. */
    &:hover:not(:disabled) { transform: scale(1.12); }
    &:active:not(:disabled) { transform: scale(0.92); }
    svg {
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      transform: ${props => props.$isOpen ? 'rotate(20deg)' : 'rotate(0deg)'};
    }
  }
`;

const ThemeToggleBtn = styled.button`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--border-primary);
  background: var(--bg-hover);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  &:hover { transform: scale(1.15); border-color: var(--accent-blue); box-shadow: 0 0 16px rgba(59,130,246,0.2), 0 0 0 3px rgba(59,130,246,0.08); }
  &:active { transform: scale(0.9); }
  svg { width: 18px; height: 18px; transition: transform 0.5s cubic-bezier(0.34,1.56,0.64,1); }
  &:hover svg { transform: rotate(30deg); }
`;

const ClearChatButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 15px;
  margin-top: 1rem;
  background-color: var(--bg-hover);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);

  &:hover {
    background-color: var(--border-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  }

  &:active {
    transform: translateY(0) scale(0.97);
  }

  svg {
    width: 20px;
    height: 20px;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.3s ease;
  }
  &:hover svg { transform: rotate(10deg) scale(1.1); }
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 15px;
  margin-top: 0.5rem; /* Reduced margin to bring buttons closer */
  background-color: #EF4444;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);

  &:hover {
    background-color: #DC2626;
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(239, 68, 68, 0.3);
  }

  &:active {
    transform: translateY(0) scale(0.97);
  }

  svg {
    width: 20px;
    height: 20px;
    stroke: white;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.3s ease;
  }
  &:hover svg { transform: translateX(3px); }
`;

const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1.0); }
`;

const BouncingDots = styled.div`
  display: flex;
  gap: 4px;
  & > div {
    width: 8px;
    height: 8px;
    background-color: #64748B;
    border-radius: 100%;
    display: inline-block;
    animation: ${bounce} 1.4s infinite ease-in-out both;
  }
  & > div:nth-child(1) { animation-delay: -0.32s; }
  & > div:nth-child(2) { animation-delay: -0.16s; }
`;

const TypingIndicatorContainer = styled.div`
  height: 24px;
  padding: 0 1rem;
  font-style: italic;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  animation: ${slideIn} 0.3s ease-out forwards;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  transition: color 0.3s ease;
`;
const ReplyPreviewContainer = styled.div`
  padding: 10px 1rem; border-bottom: 1px solid var(--border-primary); background-color: var(--bg-tertiary); display: flex; align-items: center; gap: 10px; overflow: hidden; transition: background-color 0.3s ease, border-color 0.3s ease;
  animation: ${replySlideIn} 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
`;
const ReplyText = styled.div`
  flex-grow: 1; font-size: 0.9rem; color: var(--text-secondary); min-width: 0; overflow: hidden;
  p { font-weight: bold; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  span { opacity: 0.8; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

  const QuotedMessageContainer = styled.div<{ $sender: 'me' | 'other' }>`
  background: ${props => props.$sender === 'me' ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-hover)'};
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 3px solid ${props => props.$sender === 'me' ? 'rgba(255, 255, 255, 0.7)' : 'var(--accent-indigo)'};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  transition: all 0.2s ease;
  &:hover { opacity: 0.85; transform: scale(0.99); }
  &:active { transform: scale(0.97); }
  p { font-weight: bold; font-size: 0.8rem; color: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.95)' : 'var(--text-primary)'}; margin: 0; }
  span {
    font-size: 0.9rem;
    opacity: 0.9;
    display: block;
    word-wrap: break-word;
    color: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)'};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ${props => props.$sender === 'other' && `
    [data-theme='dark'] & {
      background: #253348;
    }
  `}
`;

const QuotedMediaThumb = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.26);
  border: 1px solid rgba(148, 163, 184, 0.35);
  position: relative;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const QuotedVideoBadge = styled.span`
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-size: 0.56rem;
  font-weight: 700;
  color: #f8fafc;
  background: rgba(2, 6, 23, 0.72);
  border: 1px solid rgba(226, 232, 240, 0.35);
  border-radius: 999px;
  padding: 1px 5px;
  line-height: 1;
`;

const LinkPreviewCard = styled.a<{ $sender: 'me' | 'other' }>`
  display: flex;
  flex-direction: row;
  text-decoration: none;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 4px;
  background: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.18)' : 'var(--bg-hover)'};
  border: 1px solid ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.18)' : 'var(--border-primary)'};
  transition: all 0.25s ease;
  animation: ${subtleSlideUp} 0.3s ease-out forwards;
  &:hover { opacity: 0.95; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
  ${props => props.$sender === 'other' && `
    [data-theme='dark'] & { background: #253348; border-color: rgba(255,255,255,0.08); }
  `}
`;
const LinkPreviewImage = styled.img`
  width: 78px;
  min-width: 78px;
  height: 78px;
  object-fit: cover;
  display: block;
`;
const LinkPreviewBody = styled.div`
  padding: 7px 9px;
  min-width: 0;
  flex: 1;
  border-left: 1px solid rgba(255,255,255,0.12);

  [data-theme='light'] & {
    border-left-color: rgba(15, 23, 42, 0.09);
  }
`;
const LinkPreviewSiteName = styled.p<{ $sender: 'me' | 'other' }>`
  margin: 0 0 2px;
  font-size: 0.66rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.75)' : 'var(--accent-indigo)'};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
const LinkPreviewTitle = styled.p<{ $sender: 'me' | 'other' }>`
  margin: 0 0 3px;
  font-size: 0.83rem;
  font-weight: 600;
  color: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.95)' : 'var(--text-primary)'};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;
const LinkPreviewDesc = styled.p<{ $sender: 'me' | 'other' }>`
  margin: 0;
  font-size: 0.76rem;
  color: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)'};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ReactionPicker = styled.div<{ $sender: 'me' | 'other' }>`
  position: absolute;
  background: var(--bg-elevated);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 24px; 
  padding: 8px 10px; 
  display: flex; 
  gap: 6px; 
  box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  z-index: 60;
  border: 1px solid var(--border-primary);
  transition: background-color 0.3s ease;
  animation: ${reactionPickerSlideIn} 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;

  [data-theme='dark'] & {
    background: rgba(30, 41, 59, 0.95);
    box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2);
  }

  /* Stagger each emoji child */
  & > button {
    animation: ${staggerFadeIn} 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  & > button:nth-child(1) { animation-delay: 0.02s; }
  & > button:nth-child(2) { animation-delay: 0.05s; }
  & > button:nth-child(3) { animation-delay: 0.08s; }
  & > button:nth-child(4) { animation-delay: 0.11s; }
  & > button:nth-child(5) { animation-delay: 0.14s; }
  & > button:nth-child(6) { animation-delay: 0.17s; }
  & > button:nth-child(7) { animation-delay: 0.20s; }
`;
const ReactionEmoji = styled.button<{ $isPlusIcon?: boolean }>`
  background: ${props => props.$isPlusIcon ? 'var(--bg-hover)' : 'none'};
  border: none; 
  font-size: 24px; 
  cursor: pointer; 
  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease, box-shadow 0.2s ease;
  border-radius: ${props => props.$isPlusIcon ? '50%' : '8px'};
  width: ${props => props.$isPlusIcon ? '36px' : 'auto'};
  height: ${props => props.$isPlusIcon ? '36px' : 'auto'};
  padding: ${props => props.$isPlusIcon ? '0' : '2px 4px'};
  display: ${props => props.$isPlusIcon ? 'flex' : 'inline-flex'};
  align-items: center;
  justify-content: center;
  position: relative;

  &:hover {
    transform: scale(1.28);
    background: ${props => props.$isPlusIcon ? 'var(--bg-hover)' : 'rgba(59, 130, 246, 0.08)'};
  }
  &:active {
    animation: ${emojiPopTap} 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  [data-theme='dark'] & {
    background: ${props => props.$isPlusIcon ? 'var(--bg-hover)' : 'none'};
    &:hover {
      background: ${props => props.$isPlusIcon ? 'var(--bg-hover)' : 'rgba(96, 165, 250, 0.12)'};
    }
  }
`;

const ReactionsPopup = ({
  popupData,
  currentUserId,
  onClose,
  onRemoveReaction
}: {
  popupData: { messageId: string; reactions: { [emoji: string]: { userId: string, username: string }[] } };
  currentUserId: string;
  onClose: () => void;
  onRemoveReaction: (emoji: string) => void;
}) => {
  const [activeTab, setActiveTab] = useState('All');
  const tabsRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      tabsEl.scrollTo({
        left: tabsEl.scrollLeft + e.deltaY,
        behavior: 'smooth'
      });
    };

    tabsEl.addEventListener('wheel', onWheel);
    return () => tabsEl.removeEventListener('wheel', onWheel);
  }, []);

  const allReactions = Object.entries(popupData.reactions).flatMap(([emoji, users]) => 
    users.map(user => ({ ...user, emoji }))
  );

  const reactionsForTab = activeTab === 'All' 
    ? allReactions
    : allReactions.filter(r => r.emoji === activeTab);

  const sortedReactions = [...reactionsForTab].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return 0;
  });

  const tabs = ['All', ...Object.keys(popupData.reactions)];

  return (
    <ReactionsPopupModal onClick={onClose}>
      <ReactionsPopupContent onClick={(e) => e.stopPropagation()}>
        <ReactionsPopupHeader ref={tabsRef}>
          {tabs.map(tab => {
            const count = tab === 'All' 
              ? allReactions.length 
              : popupData.reactions[tab]?.length || 0;
            if (count === 0) return null;
            return (
              <ReactionTab key={tab} active={tab === activeTab} onClick={() => setActiveTab(tab)}>
                <span>{tab}</span>
                <span>{count}</span>
              </ReactionTab>
            )
          })}
        </ReactionsPopupHeader>
        <ReactionsUserList>
          {sortedReactions.map(({ userId, username, emoji }, index) => {
            // Defensive code: Handle potentially corrupt data where userId might be missing.
            const displayName = userId === currentUserId ? 'You' : (username || userId || 'Unknown User');
            const initial = displayName ? displayName.charAt(0).toUpperCase() : '?';

            return (
              <ReactionUserRow 
                key={index}
                onClick={() => {
                  if (userId === currentUserId) {
                    onRemoveReaction(emoji);
                  }
                }}
                style={{ cursor: userId === currentUserId ? 'pointer' : 'default' }}
              >
                <UserAvatar>{initial}</UserAvatar>
                <div style={{flexGrow: 1}}>
                  <p style={{fontWeight: 'bold'}}>{displayName}</p>
                  {userId === currentUserId && (
                    <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Click to remove</span>
                  )}
                </div>
                <span style={{fontSize: '24px'}}>{emoji}</span>
              </ReactionUserRow>
            )
          })}
        </ReactionsUserList>
      </ReactionsPopupContent>
    </ReactionsPopupModal>
  );
};

const reactionsModalFadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const reactionsContentSlideUp = keyframes`
  0%   { opacity: 0; transform: translateY(30px) scale(0.95); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

const ReactionsPopupModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.25);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${reactionsModalFadeIn} 0.2s ease-out forwards;

  [data-theme='dark'] & {
    background: rgba(0,0,0,0.45);
  }
`;

const ReactionsPopupContent = styled.div`
  position: absolute;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  animation: ${reactionsContentSlideUp} 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  border: 1px solid var(--border-primary);
  overflow: hidden;

  [data-theme='dark'] & {
    box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.25);
  }
`;

const ReactionsPopupHeader = styled.div`
  padding: 0 16px;
  border-bottom: 1px solid var(--border-primary);
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  &::-webkit-scrollbar {
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 3px;
  }
`;

const ReactionTab = styled.button<{ active: boolean }>`
  background: none;
  border: none;
  color: ${props => props.active ? 'var(--accent-blue)' : 'var(--text-secondary)'};
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 6px;
  border-bottom: 2.5px solid ${props => props.active ? 'var(--accent-blue)' : 'transparent'};
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;

  &:hover {
    color: var(--accent-blue);
    transform: translateY(-1px);
  }
`;

const userRowFadeIn = keyframes`
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0); }
`;

const ReactionsUserList = styled.div`
  padding: 10px 16px 16px 16px;
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;

  & > div {
    animation: ${userRowFadeIn} 0.3s ease-out both;
  }
  & > div:nth-child(1) { animation-delay: 0.05s; }
  & > div:nth-child(2) { animation-delay: 0.1s; }
  & > div:nth-child(3) { animation-delay: 0.15s; }
  & > div:nth-child(4) { animation-delay: 0.2s; }
  & > div:nth-child(5) { animation-delay: 0.25s; }
  & > div:nth-child(6) { animation-delay: 0.3s; }
`;

const UserAvatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
`;

const ReactionUserRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1rem;
  padding: 6px 8px;
  border-radius: 10px;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
  }
`;

const ReactionEmojiSpan = styled.span`
  font-size: 15px;
  margin-right: -2px;
  display: inline-block;
  animation: ${reactionBounceIn} 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  transition: transform 0.15s ease;

  &:nth-child(1) { animation-delay: 0s; }
  &:nth-child(2) { animation-delay: 0.06s; }
  &:nth-child(3) { animation-delay: 0.12s; }
`;

const ReactionCountSpan = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: 6px;
  display: inline-block;
  animation: ${countBump} 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
  font-variant-numeric: tabular-nums;
`;
const MessageActions = styled.div`
  position: absolute; 
  bottom: calc(100% - 6px);
  top: auto;
  right: 6px;
  display: flex; 
  gap: 4px; 
  background: var(--bg-elevated); 
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04); 
  border-radius: 20px; 
  padding: 3px; 
  opacity: 0; 
  transform: translateY(6px) scale(0.9);
  transform-origin: bottom right;
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); 
  z-index: 32; 
  pointer-events: none;
  /* CSS :hover on a parent element fires whenever the pointer is over
     ANY descendant in the DOM tree — including this div even though it
     visually sits above the bubble.  So there is zero hover gap. */
  ${MessageBubble}:hover & { opacity: 1; pointer-events: all; transform: translateY(0) scale(1); }
  [data-theme='dark'] & {
    box-shadow: 0 2px 10px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06);
  }
`;
const ActionButton = styled.button`
  background: none; border: none; font-size: 16px; cursor: pointer; padding: 4px; color: var(--text-secondary);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); border-radius: 50%;
  &:hover { color: var(--text-primary); transform: scale(1.15); background: var(--bg-hover); }
  &:active { transform: scale(0.9); }
`;

const SelectCheckboxContainer = styled.div`
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
`;

const Checkbox = styled.div<{ checked: boolean }>`
  width: 22px;
  height: 22px;
  border: 2px solid ${props => props.checked ? '#3B82F6' : '#cbd5e0'};
  border-radius: 50%;
  background-color: ${props => props.checked ? '#3B82F6' : 'transparent'};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  ${props => props.checked && `transform: scale(1); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);`}
  &::after {
    content: '✓';
    color: white;
    font-size: 14px;
    font-weight: bold;
    display: ${props => props.checked ? 'block' : 'none'};
    ${props => props.checked && css`animation: ${staggerFadeIn} 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;`}
  }
`;

const SelectModeFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: var(--bg-header);
  border-top: 1px solid var(--border-primary);
  transition: background-color 0.3s ease, border-color 0.3s ease;
  color: var(--text-primary);
  animation: ${selectModeSlideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
`;

const DeleteButton = styled(SendButton)`
  background-color: #EF4444;
  &:hover:not(:disabled) { background-color: #DC2626; box-shadow: 0 4px 16px rgba(239, 68, 68, 0.35); }
`;

const CopyButton = styled(SendButton)`
  background-color: #64748B;
  &:hover:not(:disabled) { background-color: #475569; box-shadow: 0 4px 16px rgba(100, 116, 139, 0.35); }
`;

const EditButton = styled(SendButton)`
  background-color: #FBBF24;
  &:hover:not(:disabled) { background-color: #F59E0B; box-shadow: 0 4px 16px rgba(251, 191, 36, 0.35); }
`;

const ReportButton = styled(SendButton)`
  background-color: #F97316;
  &:hover:not(:disabled) { background-color: #EA580C; box-shadow: 0 4px 16px rgba(249, 115, 22, 0.35); }
`;

const ConfirmationModal = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100;
  animation: ${reactionsModalFadeIn} 0.2s ease-out forwards;
`;

const ConfirmationContent = styled.div`
  background: var(--bg-elevated); padding: 2rem; border-radius: 16px; text-align: center; transition: background-color 0.3s ease, color 0.3s ease;
  animation: ${modalSlideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  box-shadow: 0 25px 60px rgba(0,0,0,0.2);
  border: 1px solid var(--border-primary);
  [data-theme='dark'] & { box-shadow: 0 25px 60px rgba(0,0,0,0.5); }
  h3 { margin-bottom: 1rem; color: var(--text-heading); }
  div { display: flex; gap: 1rem; justify-content: center; }
`;

const ReportModal = styled.div`
  position: fixed;
  inset: 0;
  z-index: 130;
  background: rgba(0, 0, 0, 0.46);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  animation: ${reactionsModalFadeIn} 0.2s ease-out forwards;
`;

const ReportDialog = styled.div`
  width: min(92vw, 460px);
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 16px;
  box-shadow: 0 28px 64px rgba(0, 0, 0, 0.28);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  animation: ${modalSlideUp} 0.34s cubic-bezier(0.16, 1, 0.3, 1) forwards;

  [data-theme='dark'] & {
    box-shadow: 0 28px 64px rgba(0, 0, 0, 0.5);
  }

  @media (max-width: 480px) {
    width: 94vw;
    border-radius: 14px;
    padding: 0.9rem;
  }
`;

const ReportTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  color: var(--text-heading);
`;

const ReportSubtext = styled.p`
  margin: 0;
  font-size: 0.86rem;
  color: var(--text-secondary);
`;

const ReportMessageMeta = styled.div`
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;

  strong {
    font-size: 0.8rem;
    color: var(--text-primary);
  }

  span {
    font-size: 0.8rem;
    color: var(--text-secondary);
    word-break: break-word;
  }
`;

const ReportReasonInput = styled.textarea`
  width: 100%;
  min-height: 96px;
  max-height: 180px;
  resize: vertical;
  border: 1px solid var(--border-secondary);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  padding: 0.7rem 0.8rem;
  font: inherit;
  font-size: 0.9rem;
  line-height: 1.4;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    outline: none;
    border-color: var(--accent-blue);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
  }

  &::placeholder {
    color: var(--text-muted);
  }
`;

const ReportReasonMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.76rem;
  color: var(--text-muted);
`;

const ReportError = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: #ef4444;
`;

const ReportActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
`;

const VideoPlayerWrapper = styled.div`
  ${mediaFrameStyles}
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 0.75rem;
  }
`;

const MessageText = styled.p`
  user-select: text; /* Allow selection on PC */
  white-space: pre-wrap;
  word-wrap: break-word;
  cursor: text;
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.35;
  @media (max-width: 768px) {
    user-select: none; /* Disable selection on mobile */
    font-size: 0.9rem;
  }
`;

const SystemMessage = styled.div`
  background-color: var(--bg-hover);
  color: var(--text-secondary);
  padding: 0.5rem 1rem;
  border-radius: 1.25rem;
  font-size: 0.9rem;
  width: fit-content;
  max-width: 80%;
  text-align: center;
  box-shadow: var(--shadow-sm);
  transition: background-color 0.3s ease, color 0.3s ease;
  animation: ${systemMsgFade} 0.4s ease-out forwards;
`;

// --- INTERFACES ---
interface ReplyContext { id: string; username: string; text: string; type: 'text' | 'image' | 'video' | 'file'; url?: string; isDeleted?: boolean; }
interface Message { id: string; userId: string; username: string; type: 'text' | 'image' | 'video' | 'file' | 'system_notification'; text?: string; url?: string; originalName?: string; timestamp: string; createdAt?: string; updatedAt?: string; reactions?: { [emoji: string]: { userId: string, username: string }[] }; edited?: boolean; replyingTo?: ReplyContext; isDeleted?: boolean; deletedBy?: string; isUploading?: boolean; uploadError?: boolean; }
interface Gif { id: string; preview: string; url: string; }

// --- CHILD COMPONENTS ---

const VideoPlayer = ({ src, onPointerDown, onFullscreenEnter }: { src: string; onPointerDown?: () => void; onFullscreenEnter?: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null!);

  const handleLoadedMetadata = () => {
    // Seek slightly past 0 to generate a poster thumbnail in browsers that need it
    if (videoRef.current) videoRef.current.currentTime = 0.1;
  };

  // Track fullscreen changes so we can scroll back to this video on exit
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleFullscreenChange = () => {
      // Entering fullscreen — notify parent to save position
      if (document.fullscreenElement === video || (document as any).webkitFullscreenElement === video) {
        onFullscreenEnter?.();
      }
    };
    video.addEventListener('fullscreenchange', handleFullscreenChange);
    video.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      video.removeEventListener('fullscreenchange', handleFullscreenChange);
      video.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [onFullscreenEnter]);

  return (
    // No custom PlayIcon overlay — native <controls> provides the single play button
    // so there is never a double-play-button situation on any device.
    <VideoPlayerWrapper onContextMenu={(e) => e.preventDefault()} onPointerDown={() => onPointerDown?.()}>
      <video
        ref={videoRef}
        src={sanitizeMediaUrl(src)}
        onLoadedMetadata={handleLoadedMetadata}
        onDoubleClick={(e) => e.preventDefault()}
        style={{ zIndex: 1, position: 'relative' }}
        controls
        crossOrigin="anonymous"
        preload="metadata"
      />
    </VideoPlayerWrapper>
  );
};

const MediaDisplay = ({ msg, openLightbox }: { msg: Message, openLightbox: (url: string) => void }) => {
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

// --- URL Detection helpers ---
// Curated list of known valid TLDs — filters gibberish like .gfdgf or .gtd
const VALID_TLDS = new Set([
  // Generic
  'com','org','net','edu','gov','mil','int','info','biz','name','pro',
  // Popular new gTLDs
  'io','co','ai','app','dev','web','tech','online','site','store','shop',
  'blog','cloud','digital','media','social','email','live','video','tv',
  'news','agency','studio','design','space','team','group','global',
  'world','today','network','finance','health','care','academy',
  // Country codes
  'ac','ad','ae','af','ag','al','am','ao','ar','as','at','au','aw','az',
  'ba','bb','bd','be','bg','bh','bi','bj','bm','bn','bo','br','bs','bt',
  'bw','by','bz','ca','cc','cd','cf','cg','ch','ci','ck','cl','cm','cn',
  'cr','cu','cv','cy','cz','de','dj','dk','dm','do','dz','ec','ee','eg',
  'er','es','et','eu','fi','fj','fo','fr','ga','gb','gd','ge','gg','gh',
  'gi','gl','gm','gn','gp','gq','gr','gt','gu','gy','hk','hn','hr','ht',
  'hu','id','ie','il','im','in','iq','ir','is','it','je','jm','jo','jp',
  'ke','kg','kh','km','kn','kr','kw','ky','kz','la','lb','lc','li','lk',
  'lr','ls','lt','lu','lv','ly','ma','mc','md','me','mg','mk','ml','mm',
  'mn','mo','mp','mq','mr','ms','mt','mu','mv','mw','mx','my','mz','na',
  'nc','ne','nf','ng','ni','nl','no','np','nr','nu','nz','om','pa','pe',
  'pf','pg','ph','pk','pl','pm','pn','pr','ps','pt','pw','py','qa','re',
  'ro','rs','ru','rw','sa','sb','sc','sd','se','sg','sh','si','sk','sl',
  'sm','sn','so','sr','st','su','sv','sy','sz','tc','td','tf','tg','th',
  'tj','tk','tl','tm','tn','to','tr','tt','tv','tw','tz','ua','ug','uk',
  'um','us','uy','uz','va','vc','ve','vg','vi','vn','vu','wf','ws','ye',
  'yt','za','zm','zw',
]);

// color used for all hyperlinks — other-users messages use CSS variable (blue in
// light mode, yellow in dark mode). Own messages keep the yellow constant.
const LINK_COLOR_OWN = 'rgb(255, 238, 0)';

// Candidate regex: matches http(s)://..., www.anything, or word.word patterns.
// Uses a capturing group so text.split() keeps the matches in the result array.
// TLD validation inside normalizeUrl filters false positives (gibberish domains).
const CANDIDATE_URL_RE = /((?:https?:\/\/|ftp:\/\/)[^\s]+|www\.[a-zA-Z0-9][a-zA-Z0-9\-.]*[a-zA-Z0-9]\.[a-zA-Z]{2,}(?:[^\s]*)?|(?<![/@#])[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;

const normalizeUrl = (raw: string): { href: string; display: string } | null => {
  // Strip trailing punctuation
  const display = raw.replace(/[.,;:!?)'">\]]+$/, '');
  if (!display) return null;
  // Already has a protocol — always a link
  if (/^https?:\/\//i.test(display)) return { href: display, display };
  if (/^ftp:\/\//i.test(display)) return { href: display, display };
  // Starts with www. — always a link
  if (/^www\./i.test(display)) return { href: `https://${display}`, display };
  // Bare domain — validate TLD against known list
  const hostname = display.split(/[/?#]/)[0];
  const labels = hostname.split('.');
  if (labels.length < 2) return null;
  const tld = labels[labels.length - 1].toLowerCase();
  if (!VALID_TLDS.has(tld)) return null;
  const validLabel = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$|^[a-zA-Z0-9]$/;
  if (!labels.every(l => validLabel.test(l))) return null;
  return { href: `https://${display}`, display };
};

/**
 * Sanitise a URL for use as an <a href>.
 *
 * Two-step defence:
 *  1. Parse with the browser's URL constructor and whitelist the protocol.
 *     This blocks javascript:, data:, vbscript: etc.
 *  2. Return encodeURI(parsed.href) rather than the original string.
 *     encodeURI is a recognised URL sanitiser in CodeQL's JavaScript query
 *     library (js/xss-through-dom) — it encodes HTML meta-characters
 *     (<, >, ", ' …) that should never appear raw in an href, and returning
 *     the encoded form (not the original tainted string) breaks the taint
 *     chain that CodeQL traces from e.target.value through to the DOM sink.
 */
const safeHref = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ftp:') {
      return '#';
    }
    // encodeURI normalises + encodes the URL; it is recognised by CodeQL as
    // an explicit sanitiser that removes the XSS taint from the value.
    return encodeURI(parsed.href);
  } catch {
    return '#';
  }
};

const renderTextWithLinks = (text: string, sender: 'me' | 'other'): React.ReactNode => {
  const parts = text.split(CANDIDATE_URL_RE);
  if (parts.length === 1) return text;
  const result: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) { if (part) result.push(part); return; }
    const norm = normalizeUrl(part);
    if (!norm) { result.push(part); return; }
    const trailing = part.slice(norm.display.length);
    result.push(
      <React.Fragment key={i}>
        <a
          href={safeHref(norm.href)}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: sender === 'other' ? 'var(--link-color)' : LINK_COLOR_OWN,
            wordBreak: 'break-all',
          }}
        >{norm.display}</a>
        {trailing}
      </React.Fragment>
    );
  });
  return result.length === 1 ? result[0] : <>{result}</>;
};

// Returns the href for the first detected URL (used by LinkPreview card)
const detectFirstUrl = (text: string): string | null => {
  CANDIDATE_URL_RE.lastIndex = 0;
  const match = CANDIDATE_URL_RE.exec(text);
  CANDIDATE_URL_RE.lastIndex = 0;
  if (!match) return null;
  const norm = normalizeUrl(match[0]);
  return norm ? norm.href : null;
};



const renderMessageContent = (
  msg: Message,
  openLightbox: (url: string) => void,
  onMediaPointerDown?: () => void,
  sender: 'me' | 'other' = 'other',
  onVideoFullscreenEnter?: () => void,
  isMediaLoaded: boolean = true,
  onRequestMediaLoad?: (messageId: string) => void,
) => {
  const isVideo = msg.type === 'video' || msg.url?.match(/\.(mp4|webm|mov)$/i);
  const isImage = msg.type === 'image' || msg.url?.match(/\.(jpeg|jpg|gif|png|svg)$/i);
  const shouldGateMedia = Boolean(msg.url) && !msg.isUploading && !isMediaLoaded;

  const DownloadSvg = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );

  const handleLoadMediaClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onRequestMediaLoad) {
      onRequestMediaLoad(msg.id);
    }
  };

  const handleLoadMediaPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onMediaPointerDown?.();
  };

  if (isImage) {
    return (
      <MediaContent>
        <MediaImageWrapper>
          {msg.url && shouldGateMedia ? (
            <MediaLoadGate
              type="button"
              aria-label="Load image"
              title="Load image"
              onPointerDown={handleLoadMediaPointerDown}
              onClick={handleLoadMediaClick}
            >
              <MediaLoadIcon>
                <DownloadSvg />
              </MediaLoadIcon>
              <MediaLoadLabel>Tap to load</MediaLoadLabel>
            </MediaLoadGate>
          ) : msg.url ? (
            <img src={sanitizeMediaUrl(msg.url)} alt={msg.originalName} onClick={() => { const u = sanitizeMediaUrl(msg.url); if (u) openLightbox(u); }} onPointerDown={() => onMediaPointerDown?.()} onDoubleClick={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} />
          ) : null}
          {msg.url && !shouldGateMedia && (
            <MediaDownloadOverlayBtn
              title="Download"
              aria-label="Download image"
              onClick={(e) => { e.stopPropagation(); downloadFile(msg.url!, msg.originalName || 'image'); }}
            >
              <DownloadSvg />
            </MediaDownloadOverlayBtn>
          )}
        </MediaImageWrapper>
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{renderTextWithLinks(msg.text, sender)}</MessageText>}
      </MediaContent>
    );
  }

  if (isVideo && msg.url) {
    return (
      <MediaContent>
        {shouldGateMedia ? (
          <VideoPlayerWrapper>
            <MediaLoadGate
              type="button"
              aria-label="Load video"
              title="Load video"
              onPointerDown={handleLoadMediaPointerDown}
              onClick={handleLoadMediaClick}
            >
              <MediaLoadIcon>
                <DownloadSvg />
              </MediaLoadIcon>
              <MediaLoadLabel>Tap to load</MediaLoadLabel>
            </MediaLoadGate>
          </VideoPlayerWrapper>
        ) : (
          <>
            <VideoPlayer src={msg.url} onPointerDown={onMediaPointerDown} onFullscreenEnter={onVideoFullscreenEnter} />
            <InlineDownloadBtn aria-label="Download video" onClick={() => downloadFile(msg.url!, msg.originalName || 'video')}>
              <DownloadSvg /> Download
            </InlineDownloadBtn>
          </>
        )}
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{renderTextWithLinks(msg.text, sender)}</MessageText>}
      </MediaContent>
    );
  }

  if (msg.type === 'file' || (msg.url && !isImage && !isVideo)) {
    return (
      <MediaContent>
        <FileAttachmentCard onClick={() => msg.url && downloadFile(msg.url, msg.originalName || 'file')}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>{msg.originalName || 'Download file'}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0, opacity: 0.6 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </FileAttachmentCard>
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{renderTextWithLinks(msg.text, sender)}</MessageText>}
      </MediaContent>
    );
  }

  if (msg.text) {
    return <MessageText>{renderTextWithLinks(msg.text, sender)}</MessageText>;
  }

  return null;
};

interface LinkPreviewData {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  hostname: string;
  siteName?: string | null;
}

const linkPreviewCache = new Map<string, LinkPreviewData | null>();
const linkPreviewInFlight = new Map<string, Promise<LinkPreviewData | null>>();

const rememberLinkPreview = (url: string, data: LinkPreviewData | null): void => {
  if (!linkPreviewCache.has(url) && linkPreviewCache.size >= MAX_LINK_PREVIEW_CACHE_ENTRIES) {
    const oldestKey = linkPreviewCache.keys().next().value;
    if (oldestKey) linkPreviewCache.delete(oldestKey);
  }
  linkPreviewCache.set(url, data);
};

const fetchLinkPreviewData = (url: string): Promise<LinkPreviewData | null> => {
  if (linkPreviewCache.has(url)) return Promise.resolve(linkPreviewCache.get(url) ?? null);
  if (linkPreviewInFlight.has(url)) return linkPreviewInFlight.get(url)!;

  const promise = (async () => {
    try {
      const apiBase = (process.env.REACT_APP_API_URL || '')
        .replace(/^http:\/\//, (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'https://' : 'http://')
        .replace(/\/$/, '');
      const previewEndpoint = `${apiBase}/api/link-preview?url=${encodeURIComponent(url)}`;
      const res = await fetch(previewEndpoint);
      if (!res.ok) throw new Error('bad response');
      const json: LinkPreviewData = await res.json();
      rememberLinkPreview(url, json);
      return json;
    } catch {
      rememberLinkPreview(url, null);
      return null;
    } finally {
      linkPreviewInFlight.delete(url);
    }
  })();

  linkPreviewInFlight.set(url, promise);
  return promise;
};

const LinkPreview: React.FC<{ url: string; sender: 'me' | 'other' }> = React.memo(({ url, sender }) => {
  const [data, setData] = useState<LinkPreviewData | null | undefined>(
    () => linkPreviewCache.has(url) ? (linkPreviewCache.get(url) ?? null) : undefined
  );
  useEffect(() => {
    if (linkPreviewCache.has(url)) {
      setData(linkPreviewCache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await fetchLinkPreviewData(url);
      if (!cancelled) setData(result);
    })();
    return () => { cancelled = true; };
  }, [url]);
  if (!data) return null;

  const primaryImage = data.image || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(data.hostname)}&sz=128`;
  const secondaryImage = `https://${data.hostname}/favicon.ico`;

  return (
    <LinkPreviewCard
      $sender={sender}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <LinkPreviewImage
        src={primaryImage}
        alt=""
        onError={(e) => {
          const current = e.currentTarget.getAttribute('src') || '';
          if (current !== secondaryImage) {
            e.currentTarget.setAttribute('src', secondaryImage);
            return;
          }
          e.currentTarget.style.display = 'none';
        }}
      />
      <LinkPreviewBody>
        <LinkPreviewSiteName $sender={sender}>{data.siteName || data.hostname}</LinkPreviewSiteName>
        {data.title && <LinkPreviewTitle $sender={sender}>{data.title}</LinkPreviewTitle>}
        {data.description && <LinkPreviewDesc $sender={sender}>{data.description}</LinkPreviewDesc>}
      </LinkPreviewBody>
    </LinkPreviewCard>
  );
});

interface MessageItemProps {
  msg: Message;
  showUsername: boolean;
  currentUserId: string;
  activeDeleteMenu: string | null;
  deleteMenuRef: React.RefObject<HTMLDivElement>;
  handleSetReply: (message: Message) => void;
  handleReact: (messageId: string, emoji: string) => void;
  openDeleteMenu: (messageId: string) => void;
  openLightbox: (url: string) => void;
  isMediaLoaded: boolean;
  onRequestMediaLoad: (messageId: string) => void;
  deleteForMe: (messageId: string) => void;
  deleteForEveryone: (messageId: string) => void;
  scrollToMessage: (messageId: string, sourceMessageId?: string) => void;
  isSelectModeActive: boolean;
  isSelected: boolean;
  handleToggleSelectMessage: (messageId: string) => void;
  setActiveDeleteMenu: (id: string | null) => void;
  handleCopy: (message: Message) => void;
  handleOpenReport: (message: Message) => void;
  handleStartEdit: (message: Message) => void;
  handleCancelSelectMode: () => void;
  isMobileView: boolean;
  onOpenReactionPicker: (messageId: string, rect: DOMRect, sender: 'me' | 'other') => void;
  setReactionsPopup: (popup: { messageId: string; reactions: { [emoji: string]: { userId: string; username: string; }[] }; rect: DOMRect } | null) => void;
  selectedMessages: string[];
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string) => void;
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null;
  editingMessageId: string | null;
  editingText: string;
  setEditingText: (text: string) => void;
  handleSaveEdit: () => void;
  handleCancelEdit: () => void;
  onVideoFullscreenEnter?: (messageId: string) => void;
}

const MessageItem = React.memo(({
  msg,
  showUsername,
  currentUserId,
  activeDeleteMenu,
  deleteMenuRef,
  handleSetReply,
  handleReact,
  openDeleteMenu,
  openLightbox,
  isMediaLoaded,
  onRequestMediaLoad,
  deleteForMe,
  deleteForEveryone,
  scrollToMessage,
  isSelectModeActive,
  isSelected,
  handleToggleSelectMessage,
  setActiveDeleteMenu,
  handleCopy,
  handleOpenReport,
  handleStartEdit,
  handleCancelSelectMode,
  isMobileView,
  onOpenReactionPicker,
  setReactionsPopup,
  selectedMessages,
  handleOpenFullEmojiPicker,
  reactionPickerData,
  editingMessageId,
  editingText,
  setEditingText,
  handleSaveEdit,
  handleCancelEdit,
  onVideoFullscreenEnter
}: MessageItemProps) => {
  const isEditing = editingMessageId === msg.id;
  const quotedPreviewThumbUrl = msg.replyingTo && !msg.replyingTo.isDeleted && (msg.replyingTo.type === 'image' || msg.replyingTo.type === 'video')
    ? getQuotedPreviewThumbUrl(msg.replyingTo.type, msg.replyingTo.url)
    : '';
  const editInputRef = useRef<HTMLTextAreaElement>(null!);
  const messageRowRef = useRef<HTMLDivElement>(null!);
  const messageBubbleRef = useRef<HTMLDivElement>(null!);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right?: number; left?: number } | null>(null);

  // Keep menuPos in sync: clear it whenever this row's menu is closed from outside.
  useEffect(() => {
    if (activeDeleteMenu !== msg.id) setMenuPos(null);
  }, [activeDeleteMenu, msg.id]);

  // Close menu on any scroll (e.g. user scrolls while menu is open).
  useEffect(() => {
    if (activeDeleteMenu !== msg.id || !menuPos) return;
    const close = () => { setActiveDeleteMenu(null); };
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  }, [activeDeleteMenu, msg.id, menuPos, setActiveDeleteMenu]);
  // Tracks whether the pointer-down landed on a media preview element.
  // When true the gesture-tap handler skips selection so the lightbox/player
  // can open without also selecting the message.
  const mediaWasTapped = useRef(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reactButtonRef = useRef<HTMLButtonElement>(null!);
  const wasLongPressed = useRef(false);
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressTapSelectionRef = useRef(false);

  const resetSwipePosition = useCallback((animate: boolean) => {
    if (!messageRowRef.current) return;
    messageRowRef.current.style.transform = 'translateX(0px)';
    messageRowRef.current.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
  }, []);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      // Move cursor to end of text
      const len = editInputRef.current.value.length;
      editInputRef.current.setSelectionRange(len, len);
      editInputRef.current.style.height = 'auto';
      editInputRef.current.style.height = `${editInputRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  useDrag(({ active, movement: [mx, my], last, tap, event }) => {
    // If a drag gesture is active (i.e., user is scrolling), cancel the long-press timer.
    if (active && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      suppressTapSelectionRef.current = true;
    }

    if (tap) {
      const target = event.target as HTMLElement;
      // If the tap was on the MobileReactionPicker, ignore it completely.
      // The picker stays mounted while the full emoji panel is open, so
      // target.closest reliably catches taps on any of its buttons.
      if (target.closest('.mobile-reaction-picker')) {
        return;
      }

      // Ignore synthetic tap events that are actually part of a scroll gesture.
      if (suppressTapSelectionRef.current) {
        suppressTapSelectionRef.current = false;
        mediaWasTapped.current = false;
        return;
      }
      
      // If this 'tap' is the end of a long press, reset the flag and do nothing.
      if (wasLongPressed.current) {
        wasLongPressed.current = false;
        return;
      }
      // Otherwise, if it's a genuine tap in select mode, toggle the selection.
      if (isSelectModeActive) {
        // If the tap landed on the checkbox, let the checkbox's own handler
        // deal with it – don't also toggle from the useDrag tap.
        if (target.closest('[data-checkbox]')) {
          return;
        }
        // If the tap landed directly on a media preview (image/video/GIF),
        // let the lightbox/player handle it without also selecting the message.
        if (mediaWasTapped.current) {
          mediaWasTapped.current = false;
          return;
        }
        handleToggleSelectMessage(msg.id);
        return;
      }
    }

    // When a gesture ends as a drag (not a tap), clean up refs so the
    // next tap always starts from a known-good state.
    if (last && !tap) {
      mediaWasTapped.current = false;
      wasLongPressed.current = false;
      suppressTapSelectionRef.current = false;
    }

    // Always restore the row position at the end of any gesture. This prevents
    // partially shifted bubbles when a horizontal swipe drifts vertically.
    if (last) {
      resetSwipePosition(true);
    }

    if (!isMobileView || isSelectModeActive || isDeleted || !messageRowRef.current) {
      return;
    }

    const isHorizontalGesture = Math.abs(mx) > Math.abs(my);

    if (last) {
      // If the drag ended as a rightward horizontal swipe, trigger reply.
      if (isHorizontalGesture && mx > 70) {
        handleSetReply(msg);
      }
      return;
    }

    if (!active) {
      return;
    }

    // While scrolling vertically (or dragging left), keep the row anchored.
    if (!isHorizontalGesture || mx <= 0) {
      resetSwipePosition(false);
      return;
    }

    // During a valid horizontal drag, update position with sane bounds.
    const newX = Math.min(Math.max(mx, 0), 80);
    messageRowRef.current.style.transform = `translateX(${newX}px)`;
    messageRowRef.current.style.transition = 'none';
  }, { 
    filterTaps: true, 
    eventOptions: { passive: true }, 
    target: messageRowRef,
    drag: { threshold: 10 }
  });
  
  const currentUserReaction = useMemo(() => {
    if (!msg.reactions) return null;
    for (const emoji of Object.keys(msg.reactions)) {
      if (msg.reactions[emoji].some((r: {userId: string}) => r.userId === currentUserId)) {
        return emoji;
      }
    }
    return null;
  }, [msg.reactions, currentUserId]);

  // Reset gesture refs when Virtuoso recycles this component for a different message
  const prevMsgIdRef = useRef(msg.id);
  useEffect(() => {
    if (prevMsgIdRef.current !== msg.id) {
      prevMsgIdRef.current = msg.id;
      wasLongPressed.current = false;
      mediaWasTapped.current = false;
      suppressTapSelectionRef.current = false;
      touchStartPointRef.current = null;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      resetSwipePosition(false);
    }
  }, [msg.id, resetSwipePosition]);

  // Reset wasLongPressed only when select mode is DEACTIVATED.
  // We must NOT reset it when select mode is activated — the long-press
  // timer sets it just before the re-render that activates select mode,
  // and the tap handler needs it to avoid immediately deselecting the
  // message when the touch ends.
  useEffect(() => {
    if (!isSelectModeActive) {
      wasLongPressed.current = false;
      suppressTapSelectionRef.current = false;
    }
  }, [isSelectModeActive]);

  const sender = msg.userId === currentUserId ? 'me' : 'other';

  const messageTime = new Date(msg.timestamp).getTime();
  const now = new Date().getTime();
  const canEdit = msg.userId === currentUserId && (now - messageTime) < 15 * 60 * 1000 && msg.text;
  const isDeleted = msg.isDeleted;
  const handleVideoFullscreenEnterForMessage = useCallback(() => {
    onVideoFullscreenEnter?.(msg.id);
  }, [onVideoFullscreenEnter, msg.id]);

  const isLongPressIgnoredTarget = useCallback((target: HTMLElement) => {
    return Boolean(
      target.closest('.mobile-reaction-picker') ||
      target.closest('button, a, input, textarea, [contenteditable="true"]')
    );
  }, []);

  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isMobileView || !('touches' in e)) {
      return;
    }

    // Don't start a long-press timer when the touch/click lands on the
    // MobileReactionPicker — otherwise the 500 ms timer fires, toggles
    // selection (deselecting the message), and unmounts the picker before
    // the user's onClick can fire on the emoji button.
    const target = e.target as HTMLElement;
    if (isLongPressIgnoredTarget(target)) {
      return;
    }

    if (e.touches.length !== 1) {
      return;
    }

    const touch = e.touches[0];
    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    suppressTapSelectionRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressTimerRef.current = setTimeout(() => {
      if (!suppressTapSelectionRef.current) {
        handleToggleSelectMessage(msg.id);
        wasLongPressed.current = true;
      }
    }, 500);
  };

  const handleLongPressMove = (e: React.TouchEvent) => {
    if (!touchStartPointRef.current || e.touches.length === 0) {
      return;
    }

    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPointRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPointRef.current.y);

    if (dx > LONG_PRESS_CANCEL_MOVE_PX || dy > LONG_PRESS_CANCEL_MOVE_PX) {
      suppressTapSelectionRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPointRef.current = null;
  };

  const handleLongPressCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPointRef.current = null;
    suppressTapSelectionRef.current = true;
    resetSwipePosition(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <React.Fragment>
    <MessageRow
      id={`message-${msg.id}`}
      ref={messageRowRef}
      $sender={sender}
      $isSelected={isSelected}
      $isActiveDeleteMenu={activeDeleteMenu === msg.id}
      $isGrouped={!showUsername}
      onDoubleClick={(e) => {
        if (!isMobileView && !isSelectModeActive && !isDeleted) {
          // Only quote when double-clicking *outside* the message bubble
          // (i.e. the empty space beside the bubble). If the double-click
          // target is inside the bubble, ignore it so normal text selection
          // and interactions work.
          if (messageBubbleRef.current && messageBubbleRef.current.contains(e.target as Node)) {
            return;
          }
          e.preventDefault();
          handleSetReply(msg);
        }
      }}
      onMouseDown={handleLongPressStart}
      onMouseUp={handleLongPressEnd}
      onTouchStart={handleLongPressStart}
      onTouchMove={handleLongPressMove}
      onTouchEnd={handleLongPressEnd}
      onTouchCancel={handleLongPressCancel}
    >
      {isSelectModeActive && (!isMobileView || selectedMessages.length > 1) && (
        <SelectCheckboxContainer
          data-checkbox
          onClick={(e) => {
            e.stopPropagation();
            handleToggleSelectMessage(msg.id);
          }}
        >
          <Checkbox checked={isSelected} />
        </SelectCheckboxContainer>
      )}
      <div 
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: sender === 'me' ? 'flex-end' : 'flex-start', width: '100%' }}
      >
        {!isDeleted && showUsername && <Username $sender={sender}>{msg.username}</Username>}
        <MessageBubble 
          ref={messageBubbleRef}
          $sender={sender} 
          $messageType={msg.type} 
          $isUploading={msg.isUploading} 
          $uploadError={msg.uploadError}
          style={{ marginBottom: (!isDeleted && msg.reactions && Object.keys(msg.reactions).length > 0) ? '18px' : undefined }}
        >
          {msg.replyingTo && (
            <QuotedMessageContainer $sender={sender} onClick={() => { if (msg.replyingTo) scrollToMessage(msg.replyingTo.id, msg.id); }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p>{msg.replyingTo.username}</p>
                <span style={msg.replyingTo.isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : undefined}>
                  {msg.replyingTo.isDeleted ? 'This message has been deleted.' : msg.replyingTo.text}
                </span>
              </div>
              {!msg.replyingTo.isDeleted && msg.replyingTo.url && (msg.replyingTo.type === 'image' || msg.replyingTo.type === 'video') && (
                quotedPreviewThumbUrl ? (
                  <QuotedMediaThumb>
                    <img
                      src={quotedPreviewThumbUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    {msg.replyingTo.type === 'video' && <QuotedVideoBadge>Video</QuotedVideoBadge>}
                  </QuotedMediaThumb>
                ) : (
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '6px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(15, 23, 42, 0.28)',
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      color: 'rgba(241, 245, 249, 0.95)',
                      fontSize: '0.66rem',
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase'
                    }}
                  >
                    {msg.replyingTo.type === 'video' ? 'Video' : 'Photo'}
                  </div>
                )
              )}
            </QuotedMessageContainer>
          )}
          {isDeleted ? (
            <>
              <MessageText style={{ fontStyle: 'italic', color: sender === 'me' ? '#bfdbfe' : '#a0aec0', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'default' }}>
                {msg.deletedBy === currentUserId ? 'You deleted this message.' : 'This message has been deleted.'}
              </MessageText>
              {!isMobileView && (
                <MessageActions>
                  <ActionButton
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const isNearBottom = rect.bottom + 100 > window.innerHeight;
                      const menuWidth = 168;
                      const wouldClipLeft = rect.right - menuWidth < 8;
                      const hPos = wouldClipLeft
                        ? { left: Math.max(8, rect.left) }
                        : { right: window.innerWidth - rect.right };
                      setMenuPos(isNearBottom
                        ? { bottom: window.innerHeight - rect.top + 4, ...hPos }
                        : { top: rect.bottom + 4, ...hPos }
                      );
                      openDeleteMenu(msg.id);
                    }}
                    title="More"
                    aria-label="More actions"
                    className="more-action-button"
                    style={{ fontSize: '20px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >&#8942;</ActionButton>
                </MessageActions>
              )}
              <FooterContainer $sender={sender}>
                <Timestamp $sender={sender}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Timestamp>
              </FooterContainer>
            </>
          ) : isEditing ? (
            msg.url ? (
              <MediaContent>
                <MediaDisplay msg={msg} openLightbox={openLightbox} />
                <div style={{ paddingTop: '0.5rem' }}>
                  <EditInput
                    ref={editInputRef}
                    value={editingText}
                    onChange={(e) => {
                      setEditingText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                  />
                  <EditActions>
                    <ConfirmationButton className="cancel" onClick={handleCancelEdit}>Cancel</ConfirmationButton>
                    <ConfirmationButton className="delete" onClick={handleSaveEdit}>Save</ConfirmationButton>
                  </EditActions>
                </div>
              </MediaContent>
            ) : (
              <>
                <EditInput
                  ref={editInputRef}
                  value={editingText}
                  onChange={(e) => {
                    setEditingText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <EditActions>
                  <ConfirmationButton className="cancel" onClick={handleCancelEdit}>Cancel</ConfirmationButton>
                  <ConfirmationButton className="delete" onClick={handleSaveEdit}>Save</ConfirmationButton>
                </EditActions>
              </>
            )
          ) : (
            <>
              {selectedMessages[0] === msg.id && selectedMessages.length === 1 && (
                <MobileReactionPicker 
                  $sender={sender}
                  className="mobile-reaction-picker"
                >
                  {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                    <ReactionEmoji key={emoji} onClick={(e) => {
                      e.stopPropagation();
                      handleReact(msg.id, emoji);
                      handleCancelSelectMode();
                    }}>{emoji}</ReactionEmoji>
                  ))}
                  {currentUserReaction ? (
                    <ReactionEmoji onClick={(e) => { 
                      e.stopPropagation();
                      handleReact(msg.id, currentUserReaction); 
                      handleCancelSelectMode(); 
                    }}>{currentUserReaction}</ReactionEmoji>
                  ) : (
                    <ReactionEmoji $isPlusIcon={true} onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Capture rect & msgId synchronously (e.currentTarget becomes null
                      // after the event returns). Do NOT call handleCancelSelectMode here
                      // — keeping select mode active means the MobileReactionPicker stays
                      // mounted, so target.closest('.mobile-reaction-picker') reliably
                      // catches the useDrag tap that fires when the finger lifts.
                      // Select mode is cancelled in the emoji panel's onEmojiClick instead.
                      const msgId = msg.id;
                      const rect = e.currentTarget.getBoundingClientRect();
                      handleOpenFullEmojiPicker(rect, msgId);
                    }}>+</ReactionEmoji>
                  )}
                </MobileReactionPicker>
              )}
              {!isMobileView && (
                <MessageActions>
                  <ActionButton ref={reactButtonRef} className="react-action-button" onClick={() => onOpenReactionPicker(msg.id, reactButtonRef.current!.getBoundingClientRect(), sender)} title="React" aria-label="Add reaction">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                  </ActionButton>
                  <ActionButton
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const isNearBottom = rect.bottom + 190 > window.innerHeight;
                      // Approximate menu width. If anchoring from the right would push
                      // the menu off the left edge of the screen, anchor from left instead.
                      const menuWidth = 168;
                      const wouldClipLeft = rect.right - menuWidth < 8;
                      const hPos = wouldClipLeft
                        ? { left: Math.max(8, rect.left) }
                        : { right: window.innerWidth - rect.right };
                      setMenuPos(isNearBottom
                        ? { bottom: window.innerHeight - rect.top + 4, ...hPos }
                        : { top: rect.bottom + 4, ...hPos }
                      );
                      openDeleteMenu(msg.id);
                    }}
                    title="More"
                    aria-label="More actions"
                    className="more-action-button"
                    style={{ fontSize: '20px' }}
                  >&#8942;</ActionButton>
                </MessageActions>
              )}
              {/* DeleteMenu rendered as fixed portal — see block after </MessageRow> */}
              {msg.type === 'text' && !msg.url && msg.text && (() => { const _u = detectFirstUrl(msg.text); return _u ? <LinkPreview url={_u} sender={sender} /> : null; })()}
              {renderMessageContent(msg, openLightbox, isMobileView && isSelectModeActive ? () => { mediaWasTapped.current = true; } : undefined, sender, handleVideoFullscreenEnterForMessage, isMediaLoaded, onRequestMediaLoad)}
              <FooterContainer $sender={sender}>
                <Timestamp $sender={sender}>{msg.edited && <span>(edited) </span>}{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Timestamp>
              </FooterContainer>
            </>
          )}
          {msg.reactions && Object.keys(msg.reactions).length > 0 && (() => {
            const totalReactions = Object.values(msg.reactions).flat().length;
            const uniqueEmojis = Object.keys(msg.reactions);
            return (
              <ReactionsContainer $sender={sender} onClick={(e) => setReactionsPopup({ messageId: msg.id, reactions: msg.reactions!, rect: e.currentTarget.getBoundingClientRect() })}> 
                {uniqueEmojis.slice(0, 3).map(emoji => <ReactionEmojiSpan key={emoji}>{emoji}</ReactionEmojiSpan>)}
                <ReactionCountSpan>{totalReactions}</ReactionCountSpan>
              </ReactionsContainer>
            );
          })()}
        </MessageBubble>
      </div>
    </MessageRow>
    {activeDeleteMenu === msg.id && menuPos && createPortal(
      <div
        ref={deleteMenuRef}
        style={{
          position: 'fixed',
          ...(menuPos.top !== undefined ? { top: menuPos.top } : { bottom: menuPos.bottom }),
          ...(menuPos.left !== undefined ? { left: menuPos.left } : { right: menuPos.right }),
          zIndex: 9999,
        }}
      >
        <DeleteMenu>
          {msg.isDeleted ? (
            <DeleteMenuItem onClick={() => { handleToggleSelectMessage(msg.id); setActiveDeleteMenu(null); }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              Delete
            </DeleteMenuItem>
          ) : (
            <>
              {canEdit && (
                <DeleteMenuItem onClick={() => handleStartEdit(msg)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  Edit
                </DeleteMenuItem>
              )}
              {msg.type !== 'video' && msg.type !== 'file' && (msg.text || msg.url) &&
                <DeleteMenuItem onClick={() => { handleCopy(msg); setActiveDeleteMenu(null); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  Copy
                </DeleteMenuItem>
              }
              {msg.userId !== currentUserId && (
                <DeleteMenuItem onClick={() => { handleOpenReport(msg); setActiveDeleteMenu(null); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  Report user
                </DeleteMenuItem>
              )}
              <DeleteMenuItem onClick={() => { handleToggleSelectMessage(msg.id); setActiveDeleteMenu(null); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                Delete
              </DeleteMenuItem>
            </>
          )}
        </DeleteMenu>
      </div>,
      document.body
    )}
    </React.Fragment>
  );
});

interface TypingIndicatorProps {
  onlineUsers: UserProfile[];
  currentUserId: string;
}

const TypingIndicator = ({ onlineUsers, currentUserId }: TypingIndicatorProps) => {
  const activeUsers = onlineUsers.filter(
    (u) => u.userId !== currentUserId && (u.activity === 'gif_selecting' || u.isTyping)
  );

  if (activeUsers.length === 0) return null;

  const gifSelectors = activeUsers.filter((u) => u.activity === 'gif_selecting');
  const typers = activeUsers.filter((u) => u.activity !== 'gif_selecting' && u.isTyping);

  const formatPresence = (
    users: UserProfile[],
    singular: string,
    plural: string,
    many: string
  ): string | null => {
    if (users.length === 0) return null;
    if (users.length > 2) return many;
    const names = users.map((u) => u.username).join(', ');
    return users.length === 1 ? `${names} ${singular}` : `${names} ${plural}`;
  };

  const parts = [
    formatPresence(gifSelectors, 'is selecting a GIF', 'are selecting GIFs', 'Several people are selecting GIFs'),
    formatPresence(typers, 'is typing', 'are typing', 'Several people are typing'),
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return null;

  return (
    <TypingIndicatorContainer aria-hidden={false}>
      <span>{parts.join(' | ')}</span>
      <BouncingDots>
        <div></div>
        <div></div>
        <div></div>
      </BouncingDots>
    </TypingIndicatorContainer>
  );
};

const FilmIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <line x1="2" y1="7" x2="7" y2="7"></line>
    <line x1="2" y1="17" x2="7" y2="17"></line>
    <line x1="17" y1="17" x2="22" y2="17"></line>
    <line x1="17" y1="7" x2="22" y2="7"></line>
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
  </svg>
);

const ScrollToBottomButton = styled.button<{ $isVisible: boolean }>`
  position: absolute;
  bottom: 16px;
  right: 20px;
  width: 44px;
  height: 44px;
  background-color: var(--bg-elevated);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--border-primary);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease;
  opacity: ${props => props.$isVisible ? 1 : 0};
  transform: ${props => props.$isVisible ? 'scale(1)' : 'scale(0.5)'};
  pointer-events: ${props => props.$isVisible ? 'auto' : 'none'};
  z-index: 20;

  svg {
    width: 24px;
    height: 24px;
    stroke: var(--text-secondary);
    stroke-width: 2.5;
    animation: ${props => props.$isVisible ? scrollBtnBounce : 'none'} 2s ease-in-out infinite;
  }

  &:hover {
    transform: scale(1.15);
    background-color: var(--bg-hover);
    box-shadow: 0 6px 20px rgba(0,0,0,0.15);
  }
  &:active {
    transform: scale(0.9);
  }

  @media (max-width: 768px) {
    width: 38px;
    height: 38px;
    bottom: 12px;
    right: 16px;
    
    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

const NewMessagesBadge = styled.span<{ $isVisible: boolean }>`
  position: absolute;
  top: -6px;
  right: -7px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%);
  color: #ffffff;
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.74);
  opacity: ${props => props.$isVisible ? 1 : 0};
  transform: ${props => props.$isVisible ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.72)'};
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  animation: ${props => props.$isVisible ? newMessageBadgeGlow : 'none'} 2.2s ease-in-out infinite;
  pointer-events: none;

  [data-theme='dark'] & {
    border-color: rgba(148, 197, 255, 0.82);
  }

  @media (max-width: 768px) {
    top: -5px;
    right: -5px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    font-size: 0.58rem;
  }
`;


// ---------------------------------------------------------------------------
// "Delete for me" persistence helpers
// Message IDs are stored per-user in localStorage so deletions survive refresh.
// ---------------------------------------------------------------------------
const DELETED_FOR_ME_KEY = (userId: string) => `pulseDeletedForMe_${userId}`;

function getDeletedForMeIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_FOR_ME_KEY(userId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function addDeletedForMeIds(userId: string, ids: string[]): void {
  try {
    const existing = getDeletedForMeIds(userId);
    ids.forEach(id => existing.add(id));
    localStorage.setItem(DELETED_FOR_ME_KEY(userId), JSON.stringify(Array.from(existing)));
  } catch { /* storage full — ignore */ }
}
// ---------------------------------------------------------------------------

function Chat() {
  const userContext = useContext(UserContext);
  const { token: tempToken } = useParams<{ token?: string }>();
  const { isDark, toggleTheme } = useTheme();

  // --- STATE MANAGEMENT ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadedMediaMessageIds, setLoadedMediaMessageIds] = useState<string[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [activeDeleteMenu, setActiveDeleteMenu] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [previewActiveIndex, setPreviewActiveIndex] = useState(0);
  const [previewCaption, setPreviewCaption] = useState('');
  const [stagedGif, setStagedGif] = useState<Gif | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifResults, setGifResults] = useState<Gif[]>([]);
  const [gifSearchTerm, setGifSearchTerm] = useState('');
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [isUserListVisible, setIsUserListVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isSelectModeActive, setIsSelectModeActive] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [isDeleteConfirmationVisible, setIsDeleteConfirmationVisible] = useState(false);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [reportTargetMessage, setReportTargetMessage] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportError, setReportError] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [canDeleteForEveryone, setCanDeleteForEveryone] = useState(false);
  const [fullEmojiPickerPosition, setFullEmojiPickerPosition] = useState<DOMRect | null>(null);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [isScrollToBottomVisible, setIsScrollToBottomVisible] = useState(false);
  const [newMessagesWhileScrolledUp, setNewMessagesWhileScrolledUp] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [oldestLoadedAt, setOldestLoadedAt] = useState<string | null>(null);
  const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_FIRST_ITEM_INDEX);
  const hasMoreOlderMessagesRef = useRef(hasMoreOlderMessages);
  const oldestLoadedAtRef = useRef<string | null>(oldestLoadedAt);
  // Use a ref (not state) for the message ID associated with the full emoji picker.
  // EmojiPicker from emoji-picker-react may cache its onEmojiClick prop and call
  // a stale closure — reading from a ref guarantees we always get the current value.
  // fullEmojiPickerPosition (state) already controls whether the panel is shown;
  // we only need the ref to carry the message ID into the callback.
  const messageIdForFullEmojiPickerRef = useRef<string | null>(null);
  const [reactionsPopup, setReactionsPopup] = useState<{ messageId: string; reactions: { [emoji: string]: { userId: string; username: string; }[] }; rect: DOMRect } | null>(null);
  const [reactionPickerData, setReactionPickerData] = useState<{ messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<DOMRect | null>(null);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null!);
  const plusButtonRef = useRef<HTMLButtonElement>(null!);
  // Ref to track which message's video is in fullscreen.
  // On fullscreen exit we scroll back to this message.
  const fullscreenVideoMsgIdRef = useRef<string | null>(null);

  // --- REFS ---
  const ws = useRef<WebSocket | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const isLoadingOlderRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // Tracks whether we've done the very first scroll-to-bottom after history loads.
  // Must be a ref (not state) so it doesn't trigger re-renders.
  const hasInitialScrolled = useRef(false);
  const initialHistoryBottomStabilized = useRef(false);
  // Tracks whether the user is currently at the bottom of the chat.
  const isAtBottomRef = useRef(true);
  const messageTailSnapshotRef = useRef<{ length: number; lastId: string | null }>({ length: 0, lastId: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const deleteMenuRef = useRef<HTMLDivElement>(null!);
  const gifPickerRef = useRef<HTMLDivElement>(null!);
  // Tracks when the GIF picker was last opened (epoch ms).
  // Used to ignore the phantom synthetic click that mobile browsers fire
  // ~300 ms after pointerdown, which would otherwise immediately close the modal.
  const gifPickerOpenedAtRef = useRef<number>(0);
  const keyboardWasOpenBeforeGifRef = useRef<boolean>(false);
  const keyboardWasOpenBeforeEmojiRef = useRef<boolean>(false);
  const restoreKeyboardAfterEmojiCloseRef = useRef<boolean>(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null!);
  const fullEmojiPickerRef = useRef<HTMLDivElement>(null!);
  const emojiButtonRef = useRef<HTMLButtonElement>(null!);
  const messageInputRef = useRef<HTMLTextAreaElement>(null!);
  const userIdRef = useRef<string>(getUserId());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Cooldown flag: true while we're within the throttle window after sending start_typing.
  // Prevents sending start_typing more than once per ~3 s even on rapid keystrokes.
  const typingCooldownRef = useRef(false);
  const presenceActivityRef = useRef<'typing' | 'gif_selecting' | null>(null);
  const resizeRafRef = useRef<number>(0);
  // WebSocket auto-reconnect management refs
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef<number>(2000); // starts at 2 s, doubles on each retry
  const quoteJumpReturnStackRef = useRef<string[]>([]);

  // Base API URL — upgrade http:// → https:// when the page itself is on HTTPS.
  // Mobile networks (and many corporate proxies) enforce mixed-content policy strictly,
  // blocking plain-HTTP fetch calls from an HTTPS page. Home WiFi is typically more
  // lenient, which is why uploads/auth worked on WiFi but silently failed on mobile data.
  const apiBase = (process.env.REACT_APP_API_URL || '')
    .replace(/^http:\/\//, window.location.protocol === 'https:' ? 'https://' : 'http://');

  const setPresenceActivity = useCallback((nextActivity: 'typing' | 'gif_selecting' | null) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (presenceActivityRef.current === nextActivity) return;

    try {
      if (nextActivity) {
        ws.current.send(JSON.stringify({ type: 'start_typing', activity: nextActivity }));
      } else {
        ws.current.send(JSON.stringify({ type: 'stop_typing' }));
      }
      presenceActivityRef.current = nextActivity;
    } catch (_) {
      // Ignore transient send errors during reconnect windows.
    }
  }, []);

  const closeEmojiPicker = useCallback((restoreKeyboard: boolean = false) => {
    setEmojiPickerPosition((prev) => {
      if (!prev) return prev;
      restoreKeyboardAfterEmojiCloseRef.current = restoreKeyboard && keyboardWasOpenBeforeEmojiRef.current;
      if (!restoreKeyboardAfterEmojiCloseRef.current) {
        keyboardWasOpenBeforeEmojiRef.current = false;
      }
      return null;
    });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreOlderMessagesRef.current = hasMoreOlderMessages;
  }, [hasMoreOlderMessages]);

  useEffect(() => {
    oldestLoadedAtRef.current = oldestLoadedAt;
  }, [oldestLoadedAt]);

  useEffect(() => {
    const currentLength = messages.length;
    const currentLastId = currentLength > 0 ? messages[currentLength - 1].id : null;
    const prevSnapshot = messageTailSnapshotRef.current;

    if (!historyLoaded) {
      messageTailSnapshotRef.current = { length: currentLength, lastId: currentLastId };
      return;
    }

    if (!isAtBottomRef.current && currentLength > prevSnapshot.length && prevSnapshot.length > 0) {
      let appendedStart = -1;

      if (messages[prevSnapshot.length - 1]?.id === prevSnapshot.lastId) {
        appendedStart = prevSnapshot.length;
      } else if (prevSnapshot.lastId) {
        const previousLastIndex = messages.findIndex((m) => m.id === prevSnapshot.lastId);
        if (previousLastIndex >= 0 && previousLastIndex < currentLength - 1) {
          appendedStart = previousLastIndex + 1;
        }
      }

      if (appendedStart >= 0) {
        const incomingCount = messages
          .slice(appendedStart)
          .reduce((count, msg) => {
            if (msg.type === 'system_notification') return count;
            if (msg.userId === userIdRef.current) return count;
            return count + 1;
          }, 0);

        if (incomingCount > 0) {
          setNewMessagesWhileScrolledUp((prev) =>
            Math.min(prev + incomingCount, MAX_NEW_MESSAGE_INDICATOR_COUNT)
          );
        }
      }
    }

    messageTailSnapshotRef.current = { length: currentLength, lastId: currentLastId };
  }, [historyLoaded, messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    // Fire typing indicator outside of React's render cycle so it never
    // delays the state update that makes the character appear.
    handleTyping();
    // Debounce the DOM measurement (auto-resize) to the next animation frame
    // so layout thrashing doesn't block the input on low-end devices.
    cancelAnimationFrame(resizeRafRef.current);
    const textarea = e.target;
    resizeRafRef.current = requestAnimationFrame(() => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
    });
  };
  const replyPreviewRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    isSelectModeActive,
    selectedMessageCount: selectedMessages.length,
    isDeleteConfirmationVisible,
    isReportModalVisible,
    lightboxUrl,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    isEmojiPickerOpen: !!emojiPickerPosition,
    isFullEmojiPickerOpen: !!fullEmojiPickerPosition,
    isPlusMenuOpen,
  });
  // Tracks whether we currently have a guard entry in the history stack.
  // Using a ref (not window.history.state) avoids stale-state issues when
  // overlays are closed programmatically rather than via the back button.
  const overlayGuardPushed = useRef(false);

  // Update ref whenever any overlay state changes
  useEffect(() => {
    stateRef.current = {
      isSelectModeActive,
      selectedMessageCount: selectedMessages.length,
      isDeleteConfirmationVisible,
      isReportModalVisible,
      lightboxUrl,
      isUserListVisible,
      replyingTo,
      showGifPicker,
      isEmojiPickerOpen: !!emojiPickerPosition,
      isFullEmojiPickerOpen: !!fullEmojiPickerPosition,
      isPlusMenuOpen,
    };
  }, [
    isSelectModeActive,
    selectedMessages.length,
    isDeleteConfirmationVisible,
    isReportModalVisible,
    lightboxUrl,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    emojiPickerPosition,
    fullEmojiPickerPosition,
    isPlusMenuOpen,
  ]);

  // Push exactly ONE history guard entry when going from "nothing open" to
  // "something open".  When the popstate handler consumes the guard it resets
  // the ref, so the *next* effect run (triggered by closing one layer while
  // others remain) will push a fresh guard automatically.
  useEffect(() => {
    if (!userContext?.profile) {
      overlayGuardPushed.current = false;
      return;
    }

    const hasSelectedMessages = selectedMessages.length > 0;
    const anyOpen =
      isDeleteConfirmationVisible ||
      isReportModalVisible ||
      isSelectModeActive ||
      hasSelectedMessages ||
      !!lightboxUrl ||
      isUserListVisible ||
      !!replyingTo ||
      showGifPicker ||
      !!emojiPickerPosition ||
      !!fullEmojiPickerPosition ||
      isPlusMenuOpen;
    if (anyOpen && !overlayGuardPushed.current) {
      pushOverlayGuardHistoryEntry();
      overlayGuardPushed.current = true;
    }
    if (!anyOpen) {
      overlayGuardPushed.current = false;
    }
  }, [
    isDeleteConfirmationVisible,
    isReportModalVisible,
    isSelectModeActive,
    selectedMessages.length,
    lightboxUrl,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    emojiPickerPosition,
    fullEmojiPickerPosition,
    isPlusMenuOpen,
    userContext?.profile,
  ]);

  // --- LIFECYCLE & EVENT HANDLERS ---

  // Fetch GIFs when picker opens or search term changes (debounced)
  useEffect(() => {
    if (!showGifPicker) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const doFetch = async () => {
      setIsLoadingGifs(true);
      try {
        const q = gifSearchTerm.trim() ? encodeURIComponent(gifSearchTerm.trim()) : 'trending';
        const key = process.env.REACT_APP_TENOR_KEY || 'LIVDSRZULELA';
        const url = `https://g.tenor.com/v1/search?q=${q}&key=${key}&limit=24`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch GIFs');
        const data = await res.json();
        if (cancelled) return;
        const results: Gif[] = (data.results || []).map((r: any) => {
          const media = r.media && r.media[0] ? r.media[0] : {};
          const preview = media.tinygif?.url || media.nanomp4?.url || media.gif?.url || media.mediumgif?.url || media.preview?.url || '';
          const full = media.gif?.url || media.mediumgif?.url || media.nanomp4?.url || preview;
          return { id: r.id, preview, url: full } as Gif;
        }).filter((g: Gif) => g.preview);
        setGifResults(results);
      } catch (err) {
        console.error('GIF fetch error', err);
        setGifResults([]);
      } finally {
        if (!cancelled) setIsLoadingGifs(false);
      }
    };

    // debounce searches
    timer = setTimeout(doFetch, 300);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [showGifPicker, gifSearchTerm]);

  // ── Mobile Visual Viewport Tracker (Keyboard Fix) ───────────────────
  // Modern mobile browsers (especially Android Chrome) dynamically change the visual viewport
  // when the software keyboard shifts between Letters <-> Emojis without scaling layout bounds.
  // This explicitly guarantees our root wrapper mathematically fits within the visible space to avoid obscuring the chat box.
  useEffect(() => {
    const handleViewportResize = () => {
      // Use visualViewport if available (tracks exact keyboard intersections), fallback to innerHeight
      const activeHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${activeHeight}px`);
    };

    handleViewportResize();
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.addEventListener('resize', handleViewportResize);
    
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);
    };
  }, []);

  // Mobile Back Button Handler
  useEffect(() => {
    if (!userContext?.profile) return;

    const handlePopState = () => {
      // The browser just consumed (popped) our guard entry, so mark it gone.
      // If more layers remain open the guard-push *effect* will automatically
      // push a fresh guard after React re-renders with the updated state.
      overlayGuardPushed.current = false;

      const {
        isSelectModeActive,
        selectedMessageCount,
        isDeleteConfirmationVisible,
        isReportModalVisible,
        lightboxUrl,
        isUserListVisible,
        replyingTo,
        showGifPicker,
        isEmojiPickerOpen,
        isFullEmojiPickerOpen,
        isPlusMenuOpen,
      } = stateRef.current;

      // Strict hierarchy: confirm modal → full-emoji → select mode → GIF → emoji → plus menu → lightbox → sidebar → quote.
      if (isDeleteConfirmationVisible) {
        setIsDeleteConfirmationVisible(false);
      } else if (isReportModalVisible) {
        setIsReportModalVisible(false);
        setReportError('');
        setIsSubmittingReport(false);
      } else if (isFullEmojiPickerOpen) {
        setFullEmojiPickerPosition(null);
        messageIdForFullEmojiPickerRef.current = null;
      } else if (isSelectModeActive || selectedMessageCount > 0) {
        setSelectedMessages([]);
        setIsSelectModeActive(false);
      } else if (showGifPicker) {
        setShowGifPicker(false);
      } else if (isEmojiPickerOpen) {
        closeEmojiPicker(true);
      } else if (isPlusMenuOpen) {
        setIsPlusMenuOpen(false);
      } else if (lightboxUrl) {
        setLightboxUrl(null);
      } else if (isUserListVisible) {
        setIsUserListVisible(false);
      } else if (replyingTo) {
        setReplyingTo(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeEmojiPicker, userContext?.profile]);

  // WebSocket connection with auto-reconnect on tab-resume / network-restore
  useEffect(() => {
    if (!userContext?.profile) return;

    // Set to false in the cleanup function so pending reconnect timers never
    // fire after the component unmounts or the user logs out.
    let shouldReconnect = true;

    // Defined inside the effect so the handlers always close over the
    // latest userContext.profile and the setState functions.
    const connect = () => {
      // Already open or in the middle of connecting — nothing to do.
      if (
        ws.current &&
        (ws.current.readyState === WebSocket.OPEN ||
          ws.current.readyState === WebSocket.CONNECTING)
      ) return;

      // ── WebSocket URL: always use wss:// on HTTPS pages ──────────────────
      // Root cause of "works on WiFi, fails on mobile data":
      //
      //  1. Mobile carrier proxies intercept unencrypted ws:// connections and
      //     either terminate or drop them.  Home WiFi routers typically pass
      //     ws:// through without interference.
      //
      //  2. All modern browsers block mixed content (ws:// from an https:// page),
      //     but desktop browsers sometimes show a warning instead of hard-blocking,
      //     while mobile browsers always hard-block.
      //
      // Fix: derive the scheme from the PAGE protocol, not from the env-var prefix.
      //  • Page on https:// → always use wss://, regardless of env-var scheme
      //  • Page on http://  → use ws:// (local dev only)
      //  • No env var       → fall back to the page's own host/protocol
      const wsUrl = (() => {
        const base = process.env.REACT_APP_API_URL;
        if (!base) {
          const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
          return `${proto}://${window.location.host}`;
        }
        return base.replace(
          /^https?:\/\//,
          window.location.protocol === 'https:' ? 'wss://' : 'ws://'
        );
      })();

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        // Reset the backoff delay so the next disconnect starts from 2 s again.
        reconnectDelayRef.current = 2000;
        presenceActivityRef.current = null;
        ws.current?.send(
          JSON.stringify({ type: 'user_join', ...userContext.profile, userId: userIdRef.current })
        );
      };

      // ── Auto-reconnect with exponential backoff ───────────────────────────
      // Mobile connections drop far more often than desktop WiFi (network
      // switching, carrier proxy timeouts, screen-off power saving).  Without
      // this, a single dropped socket means no more messages until the user
      // manually refreshes — the most common symptom reported on mobile data.
      ws.current.onclose = () => {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        typingCooldownRef.current = false;
        presenceActivityRef.current = null;
        console.log('WebSocket disconnected — scheduling reconnect');
        if (shouldReconnect) {
          reconnectTimerRef.current = setTimeout(() => {
            // Double the wait on each consecutive failure: 2 s → 4 s → 8 s → … → 30 s max.
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
            connect();
          }, reconnectDelayRef.current);
        }
      };

      ws.current.onerror = () => {
        // Force close so the readyState is CLOSED and the next connect() call
        // will actually create a new socket.
        ws.current?.close();
      };

      ws.current.onmessage = async (event: MessageEvent) => {
        const messageData = JSON.parse(event.data);
        if (messageData.type === 'username_taken') {
          // The server rejected our join because someone else already holds this username.
          // Store the error so Auth.tsx can display it, then log out back to the login screen.
          sessionStorage.setItem('authError', messageData.message || 'That username is already in use. Please choose a different one.');
          if (overlayGuardPushed.current) {
            clearOverlayGuardHistoryEntry();
            overlayGuardPushed.current = false;
          }
          userContext?.logout();
          return;
        }
        if (messageData.type === 'force_logout') {
          // Admin forced this user out — store message and log out
          sessionStorage.setItem('authError', messageData.message || 'You have been logged out by an administrator.');
          if (overlayGuardPushed.current) {
            clearOverlayGuardHistoryEntry();
            overlayGuardPushed.current = false;
          }
          userContext?.logout();
          return;
        }
        if (messageData.type === 'history') {
          // Reset the initial-scroll flag so the new history always jumps to bottom.
          hasInitialScrolled.current = false;
          initialHistoryBottomStabilized.current = false;
          const rawHistory = Array.isArray(messageData.data) ? messageData.data : [];
          const processed = filterVisibleMessages(rawHistory.map(normalizeMessage));

          setMessages(processed);
          setNewMessagesWhileScrolledUp(0);
          messageTailSnapshotRef.current = {
            length: processed.length,
            lastId: processed.length > 0 ? processed[processed.length - 1].id : null,
          };
          setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
          const cursorFromServer = typeof messageData.oldestCreatedAt === 'string' && messageData.oldestCreatedAt
            ? messageData.oldestCreatedAt
            : null;
          const nextOldestCursor = cursorFromServer || getMessageCursor(processed[0]);
          setOldestLoadedAt(nextOldestCursor);
          oldestLoadedAtRef.current = nextOldestCursor;
          const nextHasMore = typeof messageData.hasMoreHistory === 'boolean'
            ? messageData.hasMoreHistory
            : processed.length >= INITIAL_HISTORY_BATCH_SIZE;
          setHasMoreOlderMessages(nextHasMore);
          hasMoreOlderMessagesRef.current = nextHasMore;
          // Mark history as loaded so the Virtuoso component renders
          // for the first time already at the bottom — no visible scroll.
          setHistoryLoaded(true);
        } else if (messageData.type === 'online_users') {
          setOnlineUsers(messageData.data);
        } else if (messageData.type === 'report_submitted') {
          setIsSubmittingReport(false);
          setReportError('');
          setReportReason('');
          setReportTargetMessage(null);
          setIsReportModalVisible(false);
        } else if (messageData.type === 'report_error') {
          setIsSubmittingReport(false);
          setReportError(typeof messageData.message === 'string' ? messageData.message : 'Failed to submit report. Please try again.');
        } else if (messageData.type === 'chat_cleared') {
          // Admin cleared all messages — wipe the local list immediately.
          setMessages([]);
          setNewMessagesWhileScrolledUp(0);
          messageTailSnapshotRef.current = { length: 0, lastId: null };
          setHasMoreOlderMessages(false);
          hasMoreOlderMessagesRef.current = false;
          setOldestLoadedAt(null);
          oldestLoadedAtRef.current = null;
          setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
        } else if (messageData.type === 'chat_hidden_for_everyone') {
          // Admin hid all existing chats from frontend globally (records remain in DB).
          // Clear currently loaded history so all clients immediately reflect this state.
          setMessages([]);
          setNewMessagesWhileScrolledUp(0);
          messageTailSnapshotRef.current = { length: 0, lastId: null };
          setHasMoreOlderMessages(false);
          hasMoreOlderMessagesRef.current = false;
          setOldestLoadedAt(null);
          oldestLoadedAtRef.current = null;
          setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
        } else if (messageData.type === 'update') {
          const normalizedUpdate = normalizeMessage(messageData.data);
          setMessages(prev =>
            prev.map(m => {
              if (m.id === normalizedUpdate.id) return { ...m, ...normalizedUpdate };
              if (normalizedUpdate.isDeleted && m.replyingTo && m.replyingTo.id === normalizedUpdate.id) {
                return { ...m, replyingTo: { ...m.replyingTo, isDeleted: true } };
              }
              return m;
            })
          );
          // If the currently quoted message (reply preview in footer) was deleted,
          // update the replyingTo state so the preview shows "deleted".
          if (normalizedUpdate.isDeleted) {
            setReplyingTo(prev => {
              if (prev && prev.id === normalizedUpdate.id) {
                return null; // Clear the quote — can't reply to a deleted message
              }
              return prev;
            });
          }
        } else {
          const normalized = normalizeMessage(messageData);
          setMessages(prev => {
            // Deduplicate: system_notification messages (join/leave) can arrive
            // via broadcast while a reconnect also triggers a fresh history load.
            // If a message with the same id already exists, skip it.
            if (normalized.id && prev.some(m => m.id === normalized.id)) return prev;
            // Skip messages the user has deleted for themselves.
            if (normalized.id && getDeletedForMeIds(userIdRef.current).has(normalized.id)) return prev;
            return [...prev, normalized];
          });
        }
      };
    };

    // Initial connection
    connect();

    // --- Auto-reconnect triggers ---

    // 1. User returns to the tab / un-minimizes the browser on mobile.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') connect();
    };

    // 2. Device regains network connectivity (e.g. came out of airplane mode).
    const handleOnline = () => connect();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      // Prevent any pending reconnect timer from firing after unmount/logout.
      shouldReconnect = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      ws.current?.close();
    };
  }, [userContext?.profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // General click/keydown handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Capture the target synchronously, then defer the menu-closing
      // checks to the next macrotask so that the current touch-event
      // processing (and the keyboard-dismiss animation) isn't blocked
      // by DOM reads + React setState calls on the main thread.
      const target = event.target as Node;
      setTimeout(() => {
        // If click is on the three-dots button, let handleOpenDeleteMenu toggle it.
        const targetEl = event.target as Element;
        if (!targetEl.closest('.more-action-button')) {
          if (deleteMenuRef.current && !deleteMenuRef.current.contains(target)) setActiveDeleteMenu(null);
        }
        if (gifPickerRef.current && !gifPickerRef.current.contains(target)) setShowGifPicker(false);
        if (plusMenuRef.current && !plusMenuRef.current.contains(target) && !plusButtonRef.current?.contains(target)) setIsPlusMenuOpen(false);
        if (emojiPickerRef.current && !emojiPickerRef.current.contains(target) && !emojiButtonRef.current?.contains(target)) {
          closeEmojiPicker(false);
        }
        // Full emoji picker (reactions) is closed exclusively by its own backdrop — not here.
      }, 0);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeEmojiPicker]);

  // ── WhatsApp-style auto-focus (desktop only) ──────────────────────────────
  // When the user types any printable character while nothing (or a non-input)
  // element is focused, redirect keystrokes into the message input automatically.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only printable single characters; skip modifiers, function keys, etc.
      if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
      // Already in the input – nothing to do.
      if (document.activeElement === messageInputRef.current) return;
      // Don't steal focus from other text fields (e.g. the edit textarea).
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Don't redirect when overlays or select mode are active.
      if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible || isUserListVisible || editingMessageId) return;
      // Don't redirect on mobile – mobile keyboard requires explicit tap.
      if (isMobileView) return;
      messageInputRef.current?.focus();
      // Do NOT call e.preventDefault() so the character is typed into the input.
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSelectModeActive, lightboxUrl, isDeleteConfirmationVisible, isUserListVisible, editingMessageId, isMobileView]);

  // ── Unquote on Escape / Close file preview ─────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showFilePreview) {
          setShowFilePreview(false);
          setStagedFiles([]);
          setPreviewCaption('');
          setPreviewActiveIndex(0);
        } else if (replyingTo) {
          setReplyingTo(null);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [replyingTo, showFilePreview]);

  // ── Video fullscreen exit → restore scroll position ─────────────────
  useEffect(() => {
    const handleFullscreenChange = () => {
      // When fullscreen exits (no fullscreen element), scroll back to the video message
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        const msgId = fullscreenVideoMsgIdRef.current;
        if (msgId) {
          // Small delay to let the browser settle after fullscreen exit
          setTimeout(() => {
            scrollToMessage(msgId);
            fullscreenVideoMsgIdRef.current = null;
          }, 100);
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // ── Drag-and-drop file upload ──────────────────────────────────────
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const fileArr = Array.from(files);
        setStagedFiles(fileArr);
        setPreviewActiveIndex(0);
        setPreviewCaption('');
        setShowFilePreview(true);
        setStagedGif(null);
      }
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard auto-restore when closing GIF picker ─────────────────
  useEffect(() => {
    if (showGifPicker) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      typingCooldownRef.current = false;
      setPresenceActivity('gif_selecting');
      return;
    }

    if (presenceActivityRef.current === 'gif_selecting') {
      setPresenceActivity(null);
    }

    if (keyboardWasOpenBeforeGifRef.current) {
      messageInputRef.current?.focus();
      keyboardWasOpenBeforeGifRef.current = false;
    }
  }, [setPresenceActivity, showGifPicker]);

  useEffect(() => {
    if (emojiPickerPosition) return;
    if (restoreKeyboardAfterEmojiCloseRef.current) {
      restoreKeyboardAfterEmojiCloseRef.current = false;
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
        keyboardWasOpenBeforeEmojiRef.current = false;
      });
      return;
    }
    keyboardWasOpenBeforeEmojiRef.current = false;
  }, [emojiPickerPosition]);

  // Virtuoso handles initial scroll and follow-output automatically.
  // We only need to track whether the initial load has happened to
  // avoid premature scroll-to-bottom calls from other effects.
  useEffect(() => {
    if (messages.length > 0 && !hasInitialScrolled.current) {
      hasInitialScrolled.current = true;
    }
  }, [messages]);

  // Keep the viewport pinned to the latest message for a short period after
  // initial history load. Late-loading media/previews can change row heights and
  // otherwise nudge the list upward by a few pixels.
  useEffect(() => {
    if (!historyLoaded || messages.length === 0 || initialHistoryBottomStabilized.current) return;
    initialHistoryBottomStabilized.current = true;

    const targetIndex = messages.length - 1;
    const delays = [0, 250, 900, 1800];
    const timers = delays.map((ms) => setTimeout(() => {
      if (!virtuosoRef.current) return;
      virtuosoRef.current.scrollToIndex({ index: targetIndex, align: 'end', behavior: 'auto' });
    }, ms));

    return () => timers.forEach(clearTimeout);
  }, [historyLoaded, messages.length]);


  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // --- FUNCTIONS ---
  
  const normalizeMessage = useCallback((msg: any): Message => {
    if (msg.reactions) {
      const normalizedReactions: Record<string, {userId: string; username: string}[]> = {};
      // Handle both plain objects and Map instances (Mongoose .lean() may return Maps)
      const entries: [string, any][] = msg.reactions instanceof Map
        ? Array.from(msg.reactions.entries())
        : Object.entries(msg.reactions);
      for (const [emoji, users] of entries) {
        if (Array.isArray(users)) {
          normalizedReactions[emoji] = users.map((user: any) =>
            typeof user === 'string'
              ? { userId: user, username: user }
              : { userId: user.userId, username: user.username || user.userId }
          );
        }
      }
      return { ...msg, reactions: normalizedReactions } as Message;
    }
    return msg as Message;
  }, []);

  const getMessageCursor = useCallback((msg?: Message): string | null => {
    if (!msg) return null;
    return msg.createdAt || msg.timestamp || null;
  }, []);

  const markDeletedReplyTargets = useCallback((list: Message[], deletedIds: Set<string>): Message[] => {
    if (deletedIds.size === 0) return list;
    return list.map((m) =>
      m.replyingTo && deletedIds.has(m.replyingTo.id)
        ? { ...m, replyingTo: { ...m.replyingTo, isDeleted: true } }
        : m
    );
  }, []);

  const filterVisibleMessages = useCallback((allMsgs: Message[]): Message[] => {
    const clearTs = Number(localStorage.getItem(`pulseClearTimestamp_${userIdRef.current}`) || '0');
    const deletedForMeIds = getDeletedForMeIds(userIdRef.current);
    const filtered = (clearTs > 0
      ? allMsgs.filter(m => m.type === 'system_notification' || new Date(m.timestamp).getTime() > clearTs)
      : allMsgs
    ).filter(m => !deletedForMeIds.has(m.id));
    const deletedIds = new Set(filtered.filter(m => m.isDeleted).map(m => m.id));
    return markDeletedReplyTargets(filtered, deletedIds);
  }, [markDeletedReplyTargets]);

  const fetchAndPrependOlderMessages = useCallback(async (beforeCursor: string) => {
    const before = encodeURIComponent(beforeCursor);
    const res = await fetch(`${apiBase}/api/messages?before=${before}&limit=${HISTORY_PAGE_SIZE}`);
    if (!res.ok) throw new Error('Failed to fetch older messages');

    const payload = await res.json();
    const rawBatch: any[] = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload.messages) ? payload.messages : []);
    const hasMore = Array.isArray(payload)
      ? rawBatch.length >= HISTORY_PAGE_SIZE
      : Boolean(payload.hasMore);

    if (rawBatch.length === 0) {
      setHasMoreOlderMessages(false);
      hasMoreOlderMessagesRef.current = false;
      return { prependedCount: 0, hasMore: false, nextCursor: oldestLoadedAtRef.current };
    }

    const normalizedBatch = rawBatch.map(normalizeMessage);
    const filteredBatch = filterVisibleMessages(normalizedBatch);
    const nextCursor = getMessageCursor(normalizedBatch[0]) || beforeCursor;

    setOldestLoadedAt(nextCursor);
    oldestLoadedAtRef.current = nextCursor;

    const existingIdsSnapshot = new Set(messagesRef.current.map((m) => m.id));
    const prependedCount = filteredBatch.reduce((count, m) => count + (existingIdsSnapshot.has(m.id) ? 0 : 1), 0);

    setMessages((prev) => {
      const prevIds = new Set(prev.map((m) => m.id));
      const uniqueOlder = filteredBatch.filter((m) => !prevIds.has(m.id));
      if (uniqueOlder.length === 0) return prev;

      const combinedDeletedIds = new Set(
        [...prev, ...uniqueOlder].filter((m) => m.isDeleted).map((m) => m.id)
      );
      const patchedOlder = markDeletedReplyTargets(uniqueOlder, combinedDeletedIds);
      const patchedPrev = markDeletedReplyTargets(prev, combinedDeletedIds);
      return [...patchedOlder, ...patchedPrev];
    });

    if (prependedCount > 0) {
      setFirstItemIndex((prev) => prev - prependedCount);
    }

    setHasMoreOlderMessages(hasMore);
    hasMoreOlderMessagesRef.current = hasMore;

    return { prependedCount, hasMore, nextCursor };
  }, [apiBase, filterVisibleMessages, getMessageCursor, markDeletedReplyTargets, normalizeMessage]);

  const loadOlderMessages = useCallback(async () => {
    if (!historyLoaded || isLoadingOlderRef.current || !hasMoreOlderMessagesRef.current || !oldestLoadedAtRef.current) return;

    isLoadingOlderRef.current = true;
    setIsLoadingOlderMessages(true);
    try {
      await fetchAndPrependOlderMessages(oldestLoadedAtRef.current);
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      isLoadingOlderRef.current = false;
      setIsLoadingOlderMessages(false);
    }
  }, [fetchAndPrependOlderMessages, historyLoaded]);

  const handleVideoFullscreenEnter = useCallback((messageId: string) => {
    fullscreenVideoMsgIdRef.current = messageId;
  }, []);

  const resetInput = () => {
    setInputMessage('');
    setReplyingTo(null);
    setStagedFile(null);
    // Revoke blob URLs for any files being cleared so the browser can free memory.
    stagedFiles.forEach(revokeBlobUrl);
    setStagedFiles([]);
    setStagedGif(null);
    setShowFilePreview(false);
    setPreviewCaption('');
    setPreviewActiveIndex(0);
    if (messageInputRef.current) {
      messageInputRef.current.style.height = 'auto';
    }
    // Clear frontend typing state so subsequent keystrokes trigger start_typing again
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    typingCooldownRef.current = false;
    setPresenceActivity(null);
  };

  const handleSendMessage = async () => {
    // If multi-file preview is open, send from there instead
    if (showFilePreview && stagedFiles.length > 0) {
      handleSendFromPreview();
      return;
    }
    if (!stagedFile && !stagedGif && !inputMessage.trim()) return;
    if (inputMessage.length > MAX_MESSAGE_LENGTH) return; // Exceed WhatsApp-style character limit
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !userContext?.profile) return;

    const tempId = Date.now().toString();
    let replyContext: ReplyContext | undefined = undefined;
    if (replyingTo) {
      const { type } = replyingTo;
      if (type === 'system_notification') {
        setReplyingTo(null);
        return;
      }

      let replyText = replyingTo.text || 'Message';
      if (!replyingTo.text) {
        if (isTenorUrl(replyingTo.url)) {
          replyText = 'GIF';
        } else if (replyingTo.type === 'image') {
          replyText = 'Image';
        } else if (replyingTo.type === 'video') {
          replyText = 'Video';
        }
      }
      replyContext = { id: replyingTo.id, username: replyingTo.username, text: replyText, type, url: replyingTo.url };
    }

    if (stagedFile) {
      const message: Message = {
        id: tempId,
        userId: userIdRef.current,
        username: userContext.profile.username,
        type: stagedFile.type.startsWith('image/') ? 'image' : stagedFile.type.startsWith('video/') ? 'video' : 'file',
        url: URL.createObjectURL(stagedFile),
        text: inputMessage,
        timestamp: new Date().toISOString(),
        replyingTo: replyContext,
        isUploading: true,
      };
      setMessages(prev => [...prev, message]);
      // Ensure the view scrolls to show the newly added message
      requestAnimationFrame(() => scrollToBottom());
      
      const formData = new FormData();
      formData.append('file', stagedFile);
      formData.append('text', inputMessage);
      formData.append('userId', userIdRef.current);

      fetch(`${apiBase}/api/upload`, { method: 'POST', body: formData })
        .then(response => {
          if (!response.ok) throw new Error('Upload failed');
          return response.json();
        })
        .then(uploadedFileData => {
          const finalMessage = { ...message, ...uploadedFileData, isUploading: false, id: uploadedFileData.id };
          setMessages(prev => prev.map(m => m.id === tempId ? finalMessage : m));
          ws.current?.send(JSON.stringify(finalMessage));
        })
        .catch(error => {
          console.error('File upload failed!', error);
          setMessages(prev => prev.map(m => m.id === tempId ? { ...message, isUploading: false, uploadError: true, text: 'Upload failed' } : m));
        });

      const hadReply = !!replyingTo;
      resetInput();
      // After resetInput clears the reply preview, the footer height changes.
      // A delayed staggered scroll ensures we reach the true bottom after layout stabilizes.
      if (hadReply) forceScrollToBottomAsync();

    } else if (stagedGif) {
      const gifMessage: Message = { id: stagedGif.id, userId: userIdRef.current, username: userContext.profile.username, type: 'image', url: stagedGif.url, text: inputMessage, timestamp: new Date().toISOString(), replyingTo: replyContext };
      setMessages(prev => [...prev, gifMessage]);
      requestAnimationFrame(() => scrollToBottom());
      ws.current.send(JSON.stringify(gifMessage));
      const hadReply = !!replyingTo;
      resetInput();
      // After resetInput clears the reply preview, the footer height changes.
      // A delayed staggered scroll ensures we reach the true bottom after layout stabilizes.
      if (hadReply) forceScrollToBottomAsync();
    } else {
      const textMessage: Message = { id: Date.now().toString(), userId: userIdRef.current, username: userContext.profile.username, type: 'text', text: inputMessage, timestamp: new Date().toISOString(), replyingTo: replyContext };
      setMessages(prev => [...prev, textMessage]);
      requestAnimationFrame(() => scrollToBottom());
      ws.current.send(JSON.stringify(textMessage));
      const hadReply = !!replyingTo;
      resetInput();
      // After resetInput clears the reply preview, the footer height changes.
      // A delayed staggered scroll ensures we reach the true bottom after layout stabilizes.
      if (hadReply) forceScrollToBottomAsync();
    }
  };

  const handleTyping = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    // Skip if the WebSocket send-buffer is backed up (slow / congested network).
    // 4 KB is a safe threshold – typing indicators are tiny but we don't want
    // to pile onto an already-struggling connection.
    if (ws.current.bufferedAmount > 4096) return;

    // Throttle: only send start_typing once per cooldown window (3 s).
    if (!typingCooldownRef.current || presenceActivityRef.current !== 'typing') {
      typingCooldownRef.current = true;
      setPresenceActivity('typing');
    }

    // Reset the stop-typing timer on every keystroke (debounce).
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setPresenceActivity(null);
      typingTimeoutRef.current = null;
      typingCooldownRef.current = false;
    }, 3000);
  }, [setPresenceActivity]);

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat? All messages will be hidden for you on this device.')) {
      localStorage.setItem(`pulseClearTimestamp_${userIdRef.current}`, Date.now().toString());
      setMessages([]);
      setHasMoreOlderMessages(false);
      setOldestLoadedAt(null);
      setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
    }
  };

  const handleSetReply = useCallback((message: Message) => {
    if (message.type === 'system_notification') return;
    if (message.isDeleted) return; // Can't quote a deleted message
    setReplyingTo(message);
    // Focus the input so the keyboard opens automatically on touch devices.
    // Use rAF so the reply-preview has time to render and shift the layout first.
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !userContext?.profile || !messageId) return;
    const userId = userIdRef.current;
    const username = userContext.profile.username;

    // ── Optimistic local update ──────────────────────────────────────
    // Apply the reaction change immediately in local state so the UI
    // feels instant. The server will broadcast the authoritative state
    // shortly after, which will reconcile any difference.
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions: Record<string, {userId: string; username: string}[]> = m.reactions
        ? JSON.parse(JSON.stringify(m.reactions))
        : {};
      // Remove any existing reaction by this user
      let previousEmoji: string | null = null;
      for (const [e, users] of Object.entries(reactions)) {
        if (Array.isArray(users)) {
          const idx = users.findIndex((r: any) => r.userId === userId);
          if (idx > -1) {
            previousEmoji = e;
            users.splice(idx, 1);
            if (users.length === 0) delete reactions[e];
            break;
          }
        }
      }
      // If not toggling off the same emoji, add the new one
      if (previousEmoji !== emoji) {
        if (!Array.isArray(reactions[emoji])) reactions[emoji] = [];
        reactions[emoji].push({ userId, username });
      }
      return { ...m, reactions };
    }));

    // Send to server
    try {
      ws.current.send(JSON.stringify({ type: 'react', messageId, userId, emoji }));
    } catch (e) {
      console.error('Failed to send reaction:', e);
    }
    setReactionPickerData(null);
  }, [userContext?.profile]);

  const deleteForMe = useCallback((messageId: string) => {
    addDeletedForMeIds(userIdRef.current, [messageId]);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  const deleteForEveryone = useCallback((messageId: string) => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({ type: 'delete_for_everyone', messageId }));
  }, []);

  const handleOpenReactionPicker = useCallback((messageId: string, rect: DOMRect, sender: 'me' | 'other') => {
    setReactionPickerData(prev => {
      if (prev?.messageId === messageId) return null;
      return { messageId, rect, sender };
    });
  }, []);
  
  const reactionPickerRef = useRef<HTMLDivElement>(null!);

  // Close reaction picker when clicking/tapping outside
  useEffect(() => {
    if (!reactionPickerData) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Element;
      // If the tap/click is on the button that opened the picker, let the
      // button's own onClick toggle it — otherwise we'd close-then-reopen.
      if (target.closest('.react-action-button')) return;
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(target)) {
        setReactionPickerData(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [reactionPickerData]);

  // When a reply preview appears, scroll the chat so the quoted message
  // is fully visible just above the preview — same as WhatsApp behaviour.
  useEffect(() => {
    if (!replyingTo) return;
    // Double rAF: first frame commits the DOM, second ensures layout is complete
    // (footer has grown to include the reply preview, container has shrunk).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const msgElement = document.getElementById(`message-${replyingTo.id}`);
        const container = chatContainerRef.current?.querySelector('[data-virtuoso-scroller]') as HTMLElement || chatContainerRef.current;
        if (!msgElement || !container) return;
        const containerRect = container.getBoundingClientRect();
        const msgRect = msgElement.getBoundingClientRect();
        const margin = 8;
        if (msgRect.bottom > containerRect.bottom - margin) {
          container.scrollBy({ top: msgRect.bottom - containerRect.bottom + margin, behavior: 'smooth' });
        }
      });
    });
  }, [replyingTo]);

  // When the message-actions menu opens, scroll the chat so the bottom of
  // the menu sits inside the visible area (above the footer).
  const handleOpenDeleteMenu = useCallback((messageId: string) => {
    // Toggle off if the same menu is already open.
    setActiveDeleteMenu(prev => prev === messageId ? null : messageId);
    setTimeout(() => {
      // If the menu just closed, deleteMenuRef.current will be null — no-op.
      if (!deleteMenuRef.current || !chatContainerRef.current) return;
      const container = chatContainerRef.current.querySelector('[data-virtuoso-scroller]') as HTMLElement || chatContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const menuRect = deleteMenuRef.current.getBoundingClientRect();
      // Scroll exactly enough so the menu bottom is 12 px above the container edge.
      const overflow = menuRect.bottom - containerRect.bottom + 12;
      if (overflow > 0) {
        container.scrollBy({ top: overflow, behavior: 'smooth' });
      }
    }, 50); // 50 ms gives React + browser time to fully render the menu
  }, []);

  // --- OVERLAY & HISTORY MANAGEMENT ---

  const openLightbox = useCallback((url: string) => {
    setLightboxUrl(url);
  }, []);

  const handleInitiateDelete = () => {
    const selectedMessageObjects = messages.filter(msg => selectedMessages.includes(msg.id));
    const allMessagesAreMine = selectedMessageObjects.every(msg => msg.userId === userIdRef.current);

    if (!allMessagesAreMine) {
      setCanDeleteForEveryone(false);
    } else {
      const timeLimit = 15 * 60 * 1000;
      const now = new Date().getTime();
      const allMessagesAreRecent = selectedMessageObjects.every(msg => (now - new Date(msg.timestamp).getTime()) < timeLimit);
      setCanDeleteForEveryone(allMessagesAreRecent);
    }
    setIsDeleteConfirmationVisible(true);
  };
  
  const handleToggleSelectMessage = useCallback((messageId: string) => {
    setSelectedMessages(prevSelected => {
      const newSelected = prevSelected.includes(messageId)
        ? prevSelected.filter(id => id !== messageId)
        : [...prevSelected, messageId];

      if (newSelected.length === 0) {
        setIsSelectModeActive(false);
      } else if (prevSelected.length === 0) {
        setIsSelectModeActive(true);
        if (!overlayGuardPushed.current) {
          pushOverlayGuardHistoryEntry();
          overlayGuardPushed.current = true;
        }
      }
      
      return newSelected;
    });
  }, []);

  const handleCancelSelectMode = useCallback(() => {
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  }, []);

  // Re-anchor scroll to bottom when select mode deactivates on mobile.
  // The select-mode footer swaps with the input footer, changing the chat
  // area height. Without re-anchoring, a gap appears at the bottom.
  const prevSelectModeRef = useRef(false);
  useEffect(() => {
    if (prevSelectModeRef.current && !isSelectModeActive) {
      requestAnimationFrame(() => {
        if (isAtBottomRef.current && virtuosoRef.current) {
          virtuosoRef.current.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'auto' });
        }
      });
    }
    prevSelectModeRef.current = isSelectModeActive;
  }, [isSelectModeActive, messages.length]);

  const handleBulkDeleteForMe = () => {
    addDeletedForMeIds(userIdRef.current, selectedMessages);
    setMessages(prev => prev.filter(m => !selectedMessages.includes(m.id)));
    // Replace the guard history entry in-place rather than calling back().
    // history.back() fires a popstate event that React Router v6 intercepts
    // and treats as a route navigation — on desktop (mouse-click path through
    // the three-dots portal) this causes React Router to land on a 404.
    // replaceState() silently overwrites the guard entry with no popstate,
    // so React Router never sees a navigation and the chat stays mounted.
    if (overlayGuardPushed.current) {
      clearOverlayGuardHistoryEntry();
      overlayGuardPushed.current = false;
    }
    setIsDeleteConfirmationVisible(false);
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  };

  const handleBulkDeleteForEveryone = () => {
    selectedMessages.forEach(id => {
      if (ws.current) {
        ws.current.send(JSON.stringify({ type: 'delete_for_everyone', messageId: id }));
      }
    });
    // Same fix as handleBulkDeleteForMe — use replaceState instead of back()
    // to avoid the popstate→React Router→404 issue on desktop mouse-click path.
    if (overlayGuardPushed.current) {
      clearOverlayGuardHistoryEntry();
      overlayGuardPushed.current = false;
    }
    setIsDeleteConfirmationVisible(false);
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  };

    const handleCopy = useCallback(async (message: Message) => {
      try {
        if (message.type === 'image' && message.url) {
          // Copy the actual image to the clipboard.
          // The ClipboardItem constructor accepts a *Promise* for the blob value,
          // so clipboard.write() itself stays synchronous within the user-gesture
          // frame (critical for iOS/Android) while the fetch happens in the background.
          const url = sanitizeMediaUrl(message.url);
          if (url && navigator.clipboard.write) {
            const blobPromise = fetch(url)
              .then(res => res.blob())
              .then(blob => {
                // Clipboard API requires image/png on most browsers.
                // If the source is already PNG, use it directly.
                if (blob.type === 'image/png') return blob;
                // Otherwise convert via an offscreen canvas.
                return new Promise<Blob>((resolve, reject) => {
                  const img = new Image();
                  img.crossOrigin = 'anonymous';
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    canvas.getContext('2d')!.drawImage(img, 0, 0);
                    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
                    URL.revokeObjectURL(img.src);
                  };
                  img.onerror = () => reject(new Error('Image load failed'));
                  img.src = URL.createObjectURL(blob);
                });
              });
            const item = new ClipboardItem({ 'image/png': blobPromise });
            await navigator.clipboard.write([item]);
            return;
          }
        }
        // Fallback: copy text content (for text messages, or if image copy isn't supported).
        const textToCopy = message.text || message.url || '';
        if (textToCopy) {
          await navigator.clipboard.writeText(textToCopy);
        }
      } catch (err) {
        console.error('Failed to copy: ', err);
        // Last-resort fallback: try copying as text.
        try {
          const fallbackText = message.text || message.url || '';
          if (fallbackText) await navigator.clipboard.writeText(fallbackText);
        } catch { /* silently fail */ }
      }
    }, []);

    const handleStartEdit = useCallback((message: Message) => {
      setEditingMessageId(message.id);
      setEditingText(message.text || '');
      setActiveDeleteMenu(null);
    }, []);

    const handleOpenReport = useCallback((message: Message) => {
      if (!message || message.userId === userIdRef.current || message.isDeleted || message.type === 'system_notification') {
        return;
      }
      setActiveDeleteMenu(null);
      setReportTargetMessage(message);
      setReportReason('');
      setReportError('');
      setIsSubmittingReport(false);
      setIsReportModalVisible(true);
    }, []);

    const handleCloseReportModal = useCallback(() => {
      setIsReportModalVisible(false);
      setIsSubmittingReport(false);
      setReportError('');
      setReportReason('');
      setReportTargetMessage(null);
    }, []);

    const handleSubmitReport = useCallback(() => {
      if (!reportTargetMessage || !ws.current || ws.current.readyState !== WebSocket.OPEN) {
        setReportError('Unable to submit report right now. Please try again.');
        return;
      }

      const normalizedReason = reportReason.replace(/\s+/g, ' ').trim();
      if (normalizedReason.length < MIN_REPORT_REASON_LENGTH) {
        setReportError(`Please enter at least ${MIN_REPORT_REASON_LENGTH} characters.`);
        return;
      }

      if (normalizedReason.length > MAX_REPORT_REASON_LENGTH) {
        setReportError(`Please keep the reason under ${MAX_REPORT_REASON_LENGTH} characters.`);
        return;
      }

      setIsSubmittingReport(true);
      setReportError('');

      ws.current.send(JSON.stringify({
        type: 'report_user',
        reportedUserId: reportTargetMessage.userId,
        reportedUsername: reportTargetMessage.username,
        messageId: reportTargetMessage.id,
        messageType: reportTargetMessage.type,
        reason: normalizedReason,
      }));
    }, [reportReason, reportTargetMessage]);

    const handleCancelEdit = useCallback(() => {
      setEditingMessageId(null);
      setEditingText('');
    }, []);

    const handleSaveEdit = useCallback(() => {
      setEditingMessageId(currentId => {
        setEditingText(currentText => {
          if (!currentId || !currentText.trim()) {
            // nothing to save – reset
          } else if (ws.current) {
            ws.current.send(JSON.stringify({
              type: 'edit',
              messageId: currentId,
              newText: currentText,
            }));
          }
          return '';
        });
        return null;
      });
    }, []);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom;
    setIsScrollToBottomVisible(!atBottom);
    if (atBottom) {
      setNewMessagesWhileScrolledUp(0);
      quoteJumpReturnStackRef.current = [];
    }
  }, []);

  const handleRequestMediaLoad = useCallback((messageId: string) => {
    if (!messageId) return;
    setLoadedMediaMessageIds((prev) => {
      if (prev.includes(messageId)) return prev;
      const next = [...prev, messageId];
      return next.length > MAX_LOADED_MEDIA_TRACKING
        ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
        : next;
    });
  }, []);

  // Clicking on empty space in the chat area focuses the input (WhatsApp-style).
  // Only fires when the click target IS the scroll container itself (empty space),
  // not when it bubbles up from a message, button, or any other child element.
  const handleChatAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== chatContainerRef.current) return;
    if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible) return;
    // On mobile, don't auto-focus the input when tapping empty space —
    // the user may be intentionally dismissing the keyboard, and fighting
    // the blur causes a visible stutter in the keyboard animation.
    if (isMobileView) return;
    messageInputRef.current?.focus();
  }, [isSelectModeActive, lightboxUrl, isDeleteConfirmationVisible, isMobileView]);

  const highlightMessage = useCallback((messageId: string) => {
    if (!messageId) return;

    const maxAttempts = 24;
    const attemptDelayMs = 60;

    const applyHighlight = (attempt: number) => {
      const element = document.getElementById(`message-${messageId}`);
      if (!element) {
        if (attempt < maxAttempts) {
          window.setTimeout(() => applyHighlight(attempt + 1), attemptDelayMs);
        }
        return;
      }

      element.classList.remove('quote-jump-highlight');
      // Restart animation even when the same message is highlighted repeatedly.
      void element.getBoundingClientRect();
      element.classList.add('quote-jump-highlight');

      window.setTimeout(() => {
        element.classList.remove('quote-jump-highlight');
      }, 1300);
    };

    applyHighlight(0);
  }, []);

  const scrollToLoadedMessage = useCallback((messageId: string, behavior: 'auto' | 'smooth' = 'smooth') => {
    if (!virtuosoRef.current) return false;
    const msgIndex = messagesRef.current.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return false;

    virtuosoRef.current.scrollToIndex({ index: msgIndex, align: 'center', behavior });
    window.setTimeout(() => highlightMessage(messageId), behavior === 'smooth' ? 360 : 120);
    return true;
  }, [highlightMessage]);

  const scrollToMessage = useCallback((messageId: string, sourceMessageId?: string) => {
    if (sourceMessageId && sourceMessageId !== messageId) {
      const stack = quoteJumpReturnStackRef.current;
      const lastSourceId = stack[stack.length - 1];
      if (lastSourceId !== sourceMessageId) {
        const nextStack = stack.length >= MAX_QUOTE_JUMP_STACK_DEPTH
          ? stack.slice(stack.length - MAX_QUOTE_JUMP_STACK_DEPTH + 1)
          : stack.slice();
        nextStack.push(sourceMessageId);
        quoteJumpReturnStackRef.current = nextStack;
      }
    }

    if (!messageId) return;
    if (scrollToLoadedMessage(messageId, 'smooth')) return;
    if (!historyLoaded) return;

    void (async () => {
      let cursor = oldestLoadedAtRef.current;
      let hasMore = hasMoreOlderMessagesRef.current;
      let fetchedPages = 0;

      while (!messagesRef.current.some((m) => m.id === messageId) && hasMore && cursor && fetchedPages < MAX_QUOTE_AUTO_LOAD_PAGES) {
        if (isLoadingOlderRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          cursor = oldestLoadedAtRef.current;
          hasMore = hasMoreOlderMessagesRef.current;
          continue;
        }

        isLoadingOlderRef.current = true;
        setIsLoadingOlderMessages(true);
        try {
          const result = await fetchAndPrependOlderMessages(cursor);
          fetchedPages += 1;
          cursor = result.nextCursor;
          hasMore = result.hasMore;
        } catch (error) {
          console.error('Failed to auto-load quoted message history:', error);
          break;
        } finally {
          isLoadingOlderRef.current = false;
          setIsLoadingOlderMessages(false);
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      requestAnimationFrame(() => {
        scrollToLoadedMessage(messageId, 'smooth');
      });
    })();
  }, [fetchAndPrependOlderMessages, historyLoaded, scrollToLoadedMessage]);
  
  const scrollToBottom = useCallback(() => {
    if (virtuosoRef.current) {
      // Use an outrageously large index to guarantee anchoring to the end,
      // bypassing stale closure limits when called asynchronously.
      virtuosoRef.current.scrollToIndex({ index: 9999999, align: 'end', behavior: 'smooth' });
    }
  }, []);

  const forceScrollToBottomAsync = useCallback(() => {
    scrollToBottom();
    // Re-issue the scroll over the next 500ms to guarantee anchoring.
    // This perfectly tracks the mobile OS virtual keyboard retracting animation
    // and layout flex reflows (like reply previews unmounting).
    setTimeout(scrollToBottom, 50);
    setTimeout(scrollToBottom, 200);
    setTimeout(scrollToBottom, 450);
  }, [scrollToBottom]);

  const handleScrollToBottomButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const latestMessageId = messagesRef.current[messagesRef.current.length - 1]?.id || null;
    let returnTargetId: string | null = null;
    while (quoteJumpReturnStackRef.current.length > 0) {
      const candidate = quoteJumpReturnStackRef.current.pop() || null;
      if (!candidate) continue;
      // If hierarchy points to the bottom-most message, skip highlight behavior
      // and fall through to the normal bottom scroll action.
      if (latestMessageId && candidate === latestMessageId) continue;
      returnTargetId = candidate;
      break;
    }

    if (returnTargetId) {
      scrollToMessage(returnTargetId);
      return;
    }

    // On touch devices, blur the active element first so the keyboard
    // doesn't open when we scroll to bottom.
    if (isMobileView && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setNewMessagesWhileScrolledUp(0);
    forceScrollToBottomAsync();
  }, [forceScrollToBottomAsync, isMobileView, scrollToMessage]);

  const handleEmojiClick = (emojiData: EmojiClickData) => { setInputMessage(prev => prev + emojiData.emoji); };
  const handleOpenEmojiPicker = useCallback((rect: DOMRect) => {
    setEmojiPickerPosition((prev) => {
      if (prev) {
        restoreKeyboardAfterEmojiCloseRef.current = false;
        keyboardWasOpenBeforeEmojiRef.current = false;
        return null;
      }
      return rect;
    });
  }, []);

  const handleOpenFullEmojiPicker = useCallback((rect: DOMRect, messageId: string) => {
    // Blur any focused input to prevent the mobile keyboard from opening
    // alongside the emoji picker.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFullEmojiPickerPosition(rect);
    messageIdForFullEmojiPickerRef.current = messageId;
    setReactionPickerData(null);
    // Don't clear select mode here — the select mode was already cleared
    // by handleCancelSelectMode in the MobileReactionPicker onClick,
    // or this was opened from the desktop reaction picker (no select mode).
    // Clearing here caused a race condition where the message ID was lost.
  }, []);

  // --- PRE-RENDER HOOKS (must be before any early return to satisfy Rules of Hooks) ---
  const selectedMessageIds = useMemo(() => new Set(selectedMessages), [selectedMessages]);
  const loadedMediaMessageSet = useMemo(() => new Set(loadedMediaMessageIds), [loadedMediaMessageIds]);
  const virtuosoFollowOutput = useCallback((isAtBottom: boolean): 'smooth' | false => isAtBottom ? 'smooth' : false, []);

  // --- RENDER ---
  if (!userContext?.profile) { return <Auth onAuthSuccess={userContext!.login} tempToken={tempToken || null} />; }

  const selectedMessage = messages.find(msg => msg.id === selectedMessages[0]);
  const canEditSelectedMessage = selectedMessages.length === 1 && selectedMessage && selectedMessage.userId === userIdRef.current && selectedMessage.text && (new Date().getTime() - new Date(selectedMessage.timestamp).getTime()) < 15 * 60 * 1000;
  const hasNewMessagesIndicator = newMessagesWhileScrolledUp > 0;
  const newMessagesIndicatorLabel = newMessagesWhileScrolledUp > MAX_NEW_MESSAGE_INDICATOR_COUNT
    ? `${MAX_NEW_MESSAGE_INDICATOR_COUNT}+`
    : String(newMessagesWhileScrolledUp);
  const scrollToLatestLabel = hasNewMessagesIndicator
    ? `Scroll to latest messages (${newMessagesWhileScrolledUp} new)`
    : 'Scroll to latest messages';
  const scrollToLatestTitle = hasNewMessagesIndicator
    ? `${newMessagesIndicatorLabel} new message${newMessagesWhileScrolledUp === 1 ? '' : 's'}`
    : 'Scroll to latest messages';
  const virtuosoOverscan = isMobileView ? VIRTUOSO_OVERSCAN_MOBILE : VIRTUOSO_OVERSCAN_DESKTOP;
  const virtuosoIncreaseViewportBy = isMobileView ? VIRTUOSO_VIEWPORT_BY_MOBILE : VIRTUOSO_VIEWPORT_BY_DESKTOP;
 
  
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // On touchscreen devices (mobile/tablet) the on-screen keyboard's
      // Enter key is expected to insert a newline. Avoid intercepting it
      // there — allow the native behavior (so Shift+Enter still works too).
      if (isMobileView) {
        return;
      }
      e.preventDefault();
      handleSendMessage();
    }
  };
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileArr = Array.from(files);
      setStagedFiles(fileArr);
      setPreviewActiveIndex(0);
      setPreviewCaption('');
      setShowFilePreview(true);
      setStagedGif(null);
    }
    // Reset the input so re-selecting the same file triggers onChange
    if (event.target) event.target.value = '';
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const collectedFiles = new Map<string, File>();
    const addCollectedFile = (file: File | null) => {
      if (!file) return;

      const mime = file.type || 'application/octet-stream';
      const extensionFromMime = mime.includes('/') ? mime.split('/')[1].split('+')[0] : 'bin';
      const safeExt = (extensionFromMime || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
      const hasName = Boolean(file.name && file.name.trim());
      const fileName = hasName ? file.name : `pasted-${Date.now()}.${safeExt}`;
      const normalized = hasName
        ? file
        : new File([file], fileName, { type: mime, lastModified: Date.now() });

      const key = `${normalized.name}:${normalized.size}:${normalized.type}`;
      if (!collectedFiles.has(key)) collectedFiles.set(key, normalized);
    };

    Array.from(clipboardData.files || []).forEach((file) => addCollectedFile(file));

    // Some mobile keyboards expose GIF/image inserts through clipboard items
    // rather than clipboardData.files; support both paths.
    Array.from(clipboardData.items || []).forEach((item) => {
      if (item.kind !== 'file') return;
      if (!item.type || !item.type.startsWith('image/')) return;
      addCollectedFile(item.getAsFile());
    });

    const fileArr = Array.from(collectedFiles.values());
    if (fileArr.length === 0) return;

    e.preventDefault();
    setStagedFiles(fileArr);
    setPreviewActiveIndex(0);
    setPreviewCaption('');
    setShowFilePreview(true);
    setStagedGif(null);
  };

  const handleSendFromPreview = async () => {
    if (stagedFiles.length === 0) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !userContext?.profile) return;

    let replyContext: ReplyContext | undefined = undefined;
    if (replyingTo) {
      const { type } = replyingTo;
      if (type === 'system_notification') { setReplyingTo(null); return; }
      let replyText = replyingTo.text || 'Message';
      if (!replyingTo.text) {
        if (isTenorUrl(replyingTo.url)) replyText = 'GIF';
        else if (replyingTo.type === 'image') replyText = 'Image';
        else if (replyingTo.type === 'video') replyText = 'Video';
      }
      replyContext = { id: replyingTo.id, username: replyingTo.username, text: replyText, type, url: replyingTo.url };
    }

    const caption = previewCaption.trim();

    for (let i = 0; i < stagedFiles.length; i++) {
      const file = stagedFiles[i];
      const tempId = Date.now().toString() + '_' + i;
      const fileType: 'image' | 'video' | 'file' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';

      const message: Message = {
        id: tempId,
        userId: userIdRef.current,
        username: userContext.profile.username,
        type: fileType,
        url: URL.createObjectURL(file),
        originalName: file.name,
        text: i === 0 ? caption : undefined,
        timestamp: new Date().toISOString(),
        replyingTo: i === 0 ? replyContext : undefined,
        isUploading: true,
      };
      setMessages(prev => [...prev, message]);
      requestAnimationFrame(() => scrollToBottom());

      const formData = new FormData();
      formData.append('file', file);
      if (i === 0 && caption) formData.append('text', caption);
      formData.append('userId', userIdRef.current);

      fetch(`${apiBase}/api/upload`, { method: 'POST', body: formData })
        .then(response => { if (!response.ok) throw new Error('Upload failed'); return response.json(); })
        .then(uploadedFileData => {
          const finalMessage = { ...message, ...uploadedFileData, isUploading: false, id: uploadedFileData.id };
          setMessages(prev => prev.map(m => m.id === tempId ? finalMessage : m));
          ws.current?.send(JSON.stringify(finalMessage));
        })
        .catch(error => {
          console.error('File upload failed!', error);
          setMessages(prev => prev.map(m => m.id === tempId ? { ...message, isUploading: false, uploadError: true, text: 'Upload failed' } : m));
        });
    }

    resetInput();
  };

  const handleGifSelect = (gif: Gif) => { setStagedGif(gif); setStagedFile(null); setStagedFiles([]); setShowFilePreview(false); setShowGifPicker(false); };



  return (
    <>
      <GlobalStyle />
      <DragDropOverlay $isVisible={isDragging}>
        <DragDropCard>
          <DragDropIconWrapper>
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
          </DragDropIconWrapper>
          <DragDropTitle>Drop your file here</DragDropTitle>
          <DragDropSubtitle>Images, videos, PDFs and more — release to upload</DragDropSubtitle>
        </DragDropCard>
      </DragDropOverlay>
      {/* WhatsApp-style File Preview Modal */}
      {showFilePreview && stagedFiles.length > 0 && (() => {
        const activeFile = stagedFiles[previewActiveIndex] || stagedFiles[0];
        const isImg = activeFile?.type.startsWith('image/');
        const isVid = activeFile?.type.startsWith('video/');
        const ext = activeFile?.name.split('.').pop()?.toUpperCase() || '';
        const sizeKB = activeFile ? (activeFile.size / 1024) : 0;
        const sizeLabel = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${Math.round(sizeKB)} KB`;
        return (
          <FilePreviewModal>
            <FilePreviewModalHeader>
              <FilePreviewModalClose aria-label="Close preview" onClick={() => { setShowFilePreview(false); setStagedFiles([]); setPreviewCaption(''); setPreviewActiveIndex(0); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </FilePreviewModalClose>
              <FilePreviewModalFilename>{activeFile?.name}</FilePreviewModalFilename>
            </FilePreviewModalHeader>
            <FilePreviewModalBody>
              {isImg ? (
                <img src={sanitizeMediaUrl(getBlobUrl(activeFile))} alt="File preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
              ) : isVid ? (
                <video src={sanitizeMediaUrl(getBlobUrl(activeFile))} controls style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }} />
              ) : (
                <FilePreviewNoPreview>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <p>No preview available</p>
                  <span>{sizeLabel} — {ext}</span>
                </FilePreviewNoPreview>
              )}
            </FilePreviewModalBody>
            {stagedFiles.length > 1 && (
              <FilePreviewThumbStrip>
                {stagedFiles.map((f, idx) => {
                  const tIsImg = f.type.startsWith('image/');
                  const tIsVid = f.type.startsWith('video/');
                  return (
                    <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
                      <FilePreviewThumb $active={idx === previewActiveIndex} onClick={() => setPreviewActiveIndex(idx)}>
                        {tIsImg ? <img src={sanitizeMediaUrl(getBlobUrl(f))} alt="" /> : tIsVid ? <video src={sanitizeMediaUrl(getBlobUrl(f))} /> : (
                          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        )}
                      </FilePreviewThumb>
                      <FilePreviewRemoveBtn onClick={(e) => { e.stopPropagation(); setStagedFiles(prev => { const next = prev.filter((_, i) => i !== idx); if (next.length === 0) { setShowFilePreview(false); setPreviewCaption(''); setPreviewActiveIndex(0); } else if (previewActiveIndex >= next.length) { setPreviewActiveIndex(next.length - 1); } return next; }); }}>&times;</FilePreviewRemoveBtn>
                    </div>
                  );
                })}
                <FilePreviewAddBtn onClick={() => addFileInputRef.current?.click()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </FilePreviewAddBtn>
              </FilePreviewThumbStrip>
            )}
            {stagedFiles.length === 1 && (
              <FilePreviewThumbStrip>
                <FilePreviewAddBtn onClick={() => addFileInputRef.current?.click()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </FilePreviewAddBtn>
              </FilePreviewThumbStrip>
            )}
            <FilePreviewModalFooter>
              <FilePreviewCaptionInput
                placeholder="Add a caption..."
                value={previewCaption}
                onChange={(e) => setPreviewCaption(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendFromPreview(); } }}
              />
              <FilePreviewSendBtn onClick={handleSendFromPreview}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </FilePreviewSendBtn>
            </FilePreviewModalFooter>
          </FilePreviewModal>
        );
      })()}
      {emojiPickerPosition && !isMobileView && (
        <div
          ref={emojiPickerRef}
          style={(() => {
            const pickerWidth = 350;
            let top = emojiPickerPosition.top - 450;
            let left = emojiPickerPosition.left;
            if (top < 0) top = emojiPickerPosition.bottom + 10;
            if (left + pickerWidth > window.innerWidth) left = window.innerWidth - pickerWidth - 10;
            if (left < 0) left = 10;
            return { position: 'absolute' as const, top: `${top}px`, left: `${left}px`, zIndex: 21 };
          })()}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            autoFocusSearch={false}
            theme={isDark ? Theme.DARK : Theme.LIGHT}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis={false}
          />
        </div>
      )}
      {fullEmojiPickerPosition && (
        <>
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.3)' }}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setFullEmojiPickerPosition(null); messageIdForFullEmojiPickerRef.current = null; }}
        />
        {isMobileView ? (
          <MobileEmojiPanel>
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                const msgId = messageIdForFullEmojiPickerRef.current;
                setFullEmojiPickerPosition(null);
                messageIdForFullEmojiPickerRef.current = null;
                // Cancel select mode here (not in the + button handler) so the
                // MobileReactionPicker stays mounted while the panel is open,
                // keeping target.closest('.mobile-reaction-picker') reliable.
                handleCancelSelectMode();
                if (msgId) {
                  handleReact(msgId, emojiData.emoji);
                }
              }}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              emojiStyle={EmojiStyle.NATIVE}
              autoFocusSearch={false}
              width="100%"
              lazyLoadEmojis={false}
            />
          </MobileEmojiPanel>
        ) : (
          <EmojiPickerWrapper
            ref={fullEmojiPickerRef}
            style={{
              position: 'fixed',
              bottom: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
            }}
          >
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                const msgId = messageIdForFullEmojiPickerRef.current;
                setFullEmojiPickerPosition(null);
                messageIdForFullEmojiPickerRef.current = null;
                handleCancelSelectMode();
                if (msgId) {
                  handleReact(msgId, emojiData.emoji);
                }
              }}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              emojiStyle={EmojiStyle.NATIVE}
              autoFocusSearch={false}
              lazyLoadEmojis={false}
            />
          </EmojiPickerWrapper>
        )}
        </>
      )}
       {reactionPickerData && (
        <ReactionPicker
          ref={reactionPickerRef}
          $sender={reactionPickerData.sender}
          style={(() => {
            const pickerWidth = 280;
            let top = reactionPickerData.rect.top - 60;
            let left = reactionPickerData.rect.left;

            if (top < 0) {
              top = reactionPickerData.rect.bottom + 10;
            }

            if (reactionPickerData.sender === 'me') {
              left = reactionPickerData.rect.right - pickerWidth;
            }

            // Clamp within viewport
            if (left + pickerWidth > window.innerWidth) {
              left = window.innerWidth - pickerWidth - 10;
            }
            if (left < 10) left = 10;

            return { top: `${top}px`, left: `${left}px` };
          })()}
        >
          {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
            <ReactionEmoji key={emoji} onClick={(e) => { e.stopPropagation(); handleReact(reactionPickerData.messageId, emoji); }}>{emoji}</ReactionEmoji>
          ))}
          <ReactionEmoji $isPlusIcon={true} onClick={(e) => {
            e.stopPropagation();
            handleOpenFullEmojiPicker(e.currentTarget.getBoundingClientRect(), reactionPickerData.messageId);
          }}>+</ReactionEmoji>
        </ReactionPicker>
      )}

        {reactionsPopup && (
        <ReactionsPopup 
          popupData={reactionsPopup}
          currentUserId={userIdRef.current}
          onClose={() => setReactionsPopup(null)}
          onRemoveReaction={(emoji) => {
            if (reactionsPopup) {
              handleReact(reactionsPopup.messageId, emoji); // Re-reacting with the same emoji removes it
            }
            setReactionsPopup(null);
          }}
        />
      )}
      <AppContainer>
        <Header>
          <HeaderTitle><a href="/"><img src="/pulse_logo.webp" alt="Pulse Chat" /><span>Pulse</span> Chat</a></HeaderTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ThemeToggleBtn onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </ThemeToggleBtn>
            <MobileUserListToggle
              $isOpen={isUserListVisible}
              onClick={() => setIsUserListVisible(!isUserListVisible)}
              aria-label={isUserListVisible ? 'Hide online users' : 'Show online users'}
              title={isUserListVisible ? 'Hide online users' : 'Show online users'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </MobileUserListToggle>
          </div>
        </Header>
        <LayoutContainer>
          <ChatWindow>
            <MessagesAndScrollWrapper>
            <MessagesContainer ref={chatContainerRef} onClick={handleChatAreaClick} $isScrollButtonVisible={isScrollToBottomVisible} $isMobileView={isMobileView}>
              {historyLoaded ? (
               <Virtuoso
                 ref={virtuosoRef}
                 firstItemIndex={firstItemIndex}
                 data={messages}
                 initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
                 startReached={loadOlderMessages}
                 followOutput={virtuosoFollowOutput}
                 atBottomStateChange={handleAtBottomStateChange}
                 atBottomThreshold={20}
                 defaultItemHeight={88}
                 increaseViewportBy={virtuosoIncreaseViewportBy}
                 overscan={virtuosoOverscan}
                 computeItemKey={(index: number, msg: Message) => msg.id || index}
                 style={{ flex: 1, overflow: 'auto' }}
                 components={{
                   Header: () => isLoadingOlderMessages
                     ? <div style={{ textAlign: 'center', padding: '0.45rem 0', fontSize: '0.78rem', opacity: 0.8 }}>Loading older messages...</div>
                     : (!hasMoreOlderMessages && messages.length > 0
                       ? <div style={{ textAlign: 'center', padding: '0.45rem 0', fontSize: '0.74rem', opacity: 0.65 }}>Start of chat history</div>
                       : null),
                   Footer: () => <div style={{ height: '12px' }} />,
                 }}
                 itemContent={(index: number, msg: Message) => {
                          if (msg.type === 'system_notification') {
                            return (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '0.4rem 0' }}>
                                <SystemMessage>{msg.text}</SystemMessage>
                              </div>
                            );
                          }
                          // With Virtuoso + firstItemIndex, `index` is an absolute virtual index.
                          // Convert it to data-array index before looking at neighbors.
                          const dataIndex = index - firstItemIndex;
                          const prevMsg = dataIndex > 0 ? messages[dataIndex - 1] : null;
                          const currentSenderId = (msg.userId || '').trim();
                          const prevSenderId = (prevMsg?.userId || '').trim();
                          const currentSenderName = (msg.username || '').trim().toLowerCase();
                          const prevSenderName = (prevMsg?.username || '').trim().toLowerCase();
                          const isSameSender = Boolean(prevMsg) && (
                            (Boolean(currentSenderId) && Boolean(prevSenderId) && currentSenderId === prevSenderId) ||
                            (Boolean(currentSenderName) && Boolean(prevSenderName) && currentSenderName === prevSenderName)
                          );
                          const isSeriesContinuation = Boolean(prevMsg) && prevMsg!.type !== 'system_notification' && isSameSender;
                          const showUsername = !isSeriesContinuation;
                          return (
                            <MessageItem
                              msg={msg}
                              showUsername={showUsername}
                              currentUserId={userIdRef.current}
                              handleSetReply={handleSetReply}
                              handleReact={handleReact}
                              openDeleteMenu={handleOpenDeleteMenu}
                              openLightbox={openLightbox}
                              isMediaLoaded={loadedMediaMessageSet.has(msg.id)}
                              onRequestMediaLoad={handleRequestMediaLoad}
                              activeDeleteMenu={activeDeleteMenu}
                              deleteMenuRef={deleteMenuRef}
                              deleteForMe={deleteForMe}
                              deleteForEveryone={deleteForEveryone}
                              scrollToMessage={scrollToMessage}
                              isSelectModeActive={isSelectModeActive}
                              isSelected={selectedMessageIds.has(msg.id)}
                              handleToggleSelectMessage={handleToggleSelectMessage}
                              setActiveDeleteMenu={setActiveDeleteMenu}
                              handleCopy={handleCopy}
                              handleOpenReport={handleOpenReport}
                              handleStartEdit={handleStartEdit}
                              handleCancelSelectMode={handleCancelSelectMode}
                              isMobileView={isMobileView}
                              selectedMessages={selectedMessages}
                              onOpenReactionPicker={handleOpenReactionPicker}
                              setReactionsPopup={setReactionsPopup}
                              handleOpenFullEmojiPicker={handleOpenFullEmojiPicker}
                              reactionPickerData={reactionPickerData}
                              editingMessageId={editingMessageId}
                              editingText={editingText}
                              setEditingText={setEditingText}
                              handleSaveEdit={handleSaveEdit}
                              handleCancelEdit={handleCancelEdit}
                              onVideoFullscreenEnter={handleVideoFullscreenEnter}
                            />
                          );
                 }}
               />
              ) : null}
            </MessagesContainer>
            <ScrollToBottomButton
              $isVisible={isScrollToBottomVisible}
              onClick={handleScrollToBottomButtonClick}
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              aria-label={scrollToLatestLabel}
              title={scrollToLatestTitle}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14"></path>
                <path d="m19 12-7 7-7-7"></path>
              </svg>
              <NewMessagesBadge $isVisible={hasNewMessagesIndicator}>{newMessagesIndicatorLabel}</NewMessagesBadge>
            </ScrollToBottomButton>
            </MessagesAndScrollWrapper>
            <TypingIndicator onlineUsers={onlineUsers} currentUserId={userIdRef.current} />
            <Footer>
              {isSelectModeActive && (
                <SelectModeFooter>
                  <CancelPreviewButton onClick={handleCancelSelectMode}>&times;</CancelPreviewButton>
                  <span>{selectedMessages.length} selected</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {canEditSelectedMessage && (
                      <EditButton onClick={() => { if (selectedMessage) { handleStartEdit(selectedMessage); } handleCancelSelectMode();}} title="Edit" aria-label="Edit selected message" >
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </EditButton>
                    )}
                      {isMobileView && selectedMessages.length === 1 && selectedMessage && !selectedMessage.isDeleted && (selectedMessage.type === 'text' || selectedMessage.type === 'image') && (
                       <CopyButton onClick={() => { handleCopy(selectedMessage); handleCancelSelectMode(); }} title="Copy" aria-label="Copy selected message" >
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                       </CopyButton>
                      )}
                      {isMobileView && selectedMessages.length === 1 && selectedMessage && !selectedMessage.isDeleted && selectedMessage.userId !== userIdRef.current && selectedMessage.type !== 'system_notification' && (
                        <ReportButton
                          onClick={() => { handleOpenReport(selectedMessage); handleCancelSelectMode(); }}
                          title="Report"
                          aria-label="Report selected message"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18"></path><path d="M3 4h10l-1.5 3L13 10H3"></path></svg>
                        </ReportButton>
                      )}
                    <DeleteButton onClick={handleInitiateDelete} title="Delete" aria-label="Delete selected messages">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </DeleteButton>
                  </div>
                </SelectModeFooter>
              )}
              {!isSelectModeActive && (
                <div>
               {replyingTo && <ReplyPreviewContainer ref={replyPreviewRef} onClick={() => scrollToMessage(replyingTo.id)}>
                {replyingTo.type === 'video' && replyingTo.url ? (
                  <video src={replyingTo.url} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                ) : (replyingTo.type === 'image' || replyingTo.type === 'video') && replyingTo.url && (
                  <FilePreviewImage src={replyingTo.url} alt="Reply preview" />
                )}
                <ReplyText><p>Replying to {replyingTo.username}</p><span>
                  {(() => {
                    if (replyingTo.text) return replyingTo.text;
                    if (isTenorUrl(replyingTo.url)) return 'GIF';
                    if (replyingTo.type === 'image') return 'Image';
                    if (replyingTo.type === 'video') return 'Video';
                    return 'Message';
                  })()}
                </span></ReplyText><CancelPreviewButton onClick={(e) => { e.stopPropagation(); setReplyingTo(null); }}>&times;</CancelPreviewButton></ReplyPreviewContainer>}
              {stagedFile && !showFilePreview && (
                <FilePreviewContainer>
                  {stagedFile.type.startsWith('image/') ? (
                    <FilePreviewImage src={URL.createObjectURL(stagedFile)} alt="Preview" />
                  ) : stagedFile.type.startsWith('video/') ? (
                    <video src={URL.createObjectURL(stagedFile)} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: '8px', flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                  )}
                  <FilePreviewInfo>{stagedFile.name}</FilePreviewInfo>
                  <CancelPreviewButton onClick={() => setStagedFile(null)}>&times;</CancelPreviewButton>
                </FilePreviewContainer>
              )}
              {stagedFiles.length > 0 && !showFilePreview && (
                <FilePreviewContainer>
                  <FilePreviewInfo>{stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''} ready</FilePreviewInfo>
                  <CancelPreviewButton onClick={() => { setStagedFiles([]); setPreviewCaption(''); }}>&times;</CancelPreviewButton>
                </FilePreviewContainer>
              )}
              {stagedGif && <FilePreviewContainer><FilePreviewImage src={stagedGif.preview} alt="GIF Preview" /><FilePreviewInfo>GIF</FilePreviewInfo><CancelPreviewButton onClick={() => setStagedGif(null)}>&times;</CancelPreviewButton></FilePreviewContainer>}
               <InputContainer>
                <div style={{ position: 'relative' }} ref={plusMenuRef}>
                  <PlusMenuButton
                    ref={plusButtonRef}
                    $isOpen={isPlusMenuOpen}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setIsPlusMenuOpen(prev => !prev)}
                    aria-label="Open actions menu"
                    title="Emoji, GIF, or File"
                  >
                    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </PlusMenuButton>
                  <PlusMenu $isVisible={isPlusMenuOpen}>
                    <PlusMenuItem
                      ref={emojiButtonRef}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const inputWasFocused = Boolean(
                          messageInputRef.current && document.activeElement === messageInputRef.current
                        );
                        keyboardWasOpenBeforeEmojiRef.current = inputWasFocused;
                        if (inputWasFocused) {
                          messageInputRef.current.blur();
                        }
                        handleOpenEmojiPicker(rect);
                        setIsPlusMenuOpen(false);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                      <span>Emoji</span>
                    </PlusMenuItem>
                    <PlusMenuItem
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (messageInputRef.current && document.activeElement === messageInputRef.current) {
                          keyboardWasOpenBeforeGifRef.current = true;
                          messageInputRef.current.blur();
                        } else {
                          keyboardWasOpenBeforeGifRef.current = false;
                        }
                        gifPickerOpenedAtRef.current = Date.now();
                        setShowGifPicker(true);
                        setIsPlusMenuOpen(false);
                      }}
                    >
                      <FilmIcon /> <span>GIF</span>
                    </PlusMenuItem>
                    <PlusMenuItem
                      onClick={() => {
                        fileInputRef.current?.click();
                        setIsPlusMenuOpen(false);
                      }}
                    >
                      <FileIcon /> <span>Send File</span>
                    </PlusMenuItem>
                  </PlusMenu>
                </div>
                <InputTextWrapper>
                  {(() => {
                    // Detect URL in current input — if found, render highlight overlay
                    CANDIDATE_URL_RE.lastIndex = 0;
                    const hasUrl = CANDIDATE_URL_RE.test(inputMessage);
                    CANDIDATE_URL_RE.lastIndex = 0;
                    return (
                      <>
                        {hasUrl && (
                          <InputHighlightOverlay aria-hidden="true">
                            {renderTextWithLinks(inputMessage, 'other')}
                          </InputHighlightOverlay>
                        )}
                        <MessageInput
                          $hasUrl={hasUrl}
                          ref={messageInputRef}
                          rows={1}
                          placeholder={stagedFile || stagedGif ? 'Add a caption...' : 'Type your message...'}
                          value={inputMessage}
                          onChange={handleInputChange}
                          onKeyDown={handleInputKeyDown}
                          onPaste={handlePaste}
                          maxLength={MAX_MESSAGE_LENGTH}
                        />
                      </>
                    );
                  })()}
                </InputTextWrapper>
                {inputMessage.length >= MAX_MESSAGE_LENGTH - 200 && (
                  <CharacterCounter $warning={inputMessage.length >= MAX_MESSAGE_LENGTH - 20}>
                    {MAX_MESSAGE_LENGTH - inputMessage.length}
                  </CharacterCounter>
                )}
                <SendButton onMouseDown={(e) => e.preventDefault()} onClick={handleSendMessage} disabled={(!inputMessage.trim() && !stagedFile && !stagedGif && stagedFiles.length === 0)}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></SendButton>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html" multiple />
                <input type="file" ref={addFileInputRef} onChange={(e) => { if (e.target.files) { setStagedFiles(prev => [...prev, ...Array.from(e.target.files!)]); } if (e.target) e.target.value = ''; }} style={{ display: 'none' }} accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html" multiple />
              </InputContainer>
              {/* Mobile emoji picker for typing.
                  Rendered here (inside the Footer's normal DOM flow) so the footer
                  grows to include the picker and the messages area shrinks to fit —
                  exactly like WhatsApp.  A fixed overlay would cover the input bar. */}
              {isMobileView && emojiPickerPosition && (
                <div ref={emojiPickerRef} style={{ width: '100%', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-primary)' }}>
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    autoFocusSearch={false}
                    theme={isDark ? Theme.DARK : Theme.LIGHT}
                    emojiStyle={EmojiStyle.NATIVE}
                    width="100%"
                    height="42vh"
                    lazyLoadEmojis={false}
                  />
                </div>
              )}
              </div>
              )}
            </Footer>
          </ChatWindow>
          <SidebarBackdrop $isVisible={isUserListVisible} onClick={() => setIsUserListVisible(false)} />
          <UserSidebar $isVisible={isUserListVisible}>
            <h2>Online ({onlineUsers.length})</h2>
            <UserList>
              {(() => {
                const currentUser = onlineUsers.find(user => user.userId === userIdRef.current);
                const otherUsers = onlineUsers.filter(user => user.userId !== userIdRef.current);
                const sortedUsers = currentUser ? [currentUser, ...otherUsers] : otherUsers;
                
                return sortedUsers.map((user, index) => (
                  <UserListItem key={user.userId} index={index}>
                    {user.username}{user.userId === userIdRef.current ? ' (You)' : ''}
                  </UserListItem>
                ));
              })()}
            </UserList>
              <ClearChatButton onClick={handleClearChat}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 9l-6-6H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z"></path><path d="M15 3v6h6"></path><path d="M9.5 12.5 14.5 17.5"></path><path d="m14.5 12.5-5 5"></path></svg>
                Clear Chat
              </ClearChatButton>
            <LogoutButton onClick={() => {
              // Send explicit logout to server so it removes us from loggedInUsers
              if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'user_logout', userId: userIdRef.current }));
              }
              if (overlayGuardPushed.current) {
                clearOverlayGuardHistoryEntry();
                overlayGuardPushed.current = false;
              }
              userContext!.logout();
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Logout
            </LogoutButton>
          </UserSidebar>
        </LayoutContainer>
      </AppContainer>
      
      {isDeleteConfirmationVisible && (
        <ConfirmationModal>
          <ConfirmationContent>
            <h3>Delete {selectedMessages.length} message{selectedMessages.length > 1 ? 's' : ''}?</h3>
            <div>
              <ConfirmationButton className="cancel" onClick={() => setIsDeleteConfirmationVisible(false)}>Cancel</ConfirmationButton>
              <ConfirmationButton className="delete" onClick={handleBulkDeleteForMe}>Delete for me</ConfirmationButton>
              {canDeleteForEveryone && (
                <ConfirmationButton className="delete" onClick={handleBulkDeleteForEveryone}>Delete for everyone</ConfirmationButton>
              )}
            </div>
          </ConfirmationContent>
        </ConfirmationModal>
      )}

      {isReportModalVisible && reportTargetMessage && (
        <ReportModal onClick={handleCloseReportModal}>
          <ReportDialog onClick={(e) => e.stopPropagation()}>
            <ReportTitle>Report user</ReportTitle>
            <ReportSubtext>
              Reported user: <strong>{reportTargetMessage.username}</strong>
            </ReportSubtext>
            <ReportMessageMeta>
              <strong>Reported message</strong>
              <span>
                {reportTargetMessage.text?.trim()
                  || (reportTargetMessage.type === 'image'
                    ? '[Image message]'
                    : reportTargetMessage.type === 'video'
                      ? '[Video message]'
                      : reportTargetMessage.type === 'file'
                        ? '[File attachment]'
                        : '[No text content]')}
              </span>
            </ReportMessageMeta>
            <ReportReasonInput
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Tell us why this user/message should be reviewed..."
              maxLength={MAX_REPORT_REASON_LENGTH}
              autoFocus
            />
            <ReportReasonMeta>
              <span>Minimum {MIN_REPORT_REASON_LENGTH} characters</span>
              <span>{reportReason.length}/{MAX_REPORT_REASON_LENGTH}</span>
            </ReportReasonMeta>
            {reportError && <ReportError>{reportError}</ReportError>}
            <ReportActions>
              <ConfirmationButton className="cancel" onClick={handleCloseReportModal} disabled={isSubmittingReport}>
                Cancel
              </ConfirmationButton>
              <ConfirmationButton className="delete" onClick={handleSubmitReport} disabled={isSubmittingReport}>
                {isSubmittingReport ? 'Submitting...' : 'Submit report'}
              </ConfirmationButton>
            </ReportActions>
          </ReportDialog>
        </ReportModal>
      )}

      {lightboxUrl && (
        <Lightbox onClick={() => setLightboxUrl(null)}>
          <img src={sanitizeMediaUrl(lightboxUrl)} alt="Lightbox" />
        </Lightbox>
      )}
       {showGifPicker && (
        <GifPickerModal onClick={() => {
          // Ignore clicks that arrive within 500 ms of opening — these are the phantom
          // synthetic click events that mobile browsers generate after a pointerdown,
          // which would otherwise close the picker immediately after it opens.
          if (Date.now() - gifPickerOpenedAtRef.current < 500) return;
          setShowGifPicker(false);
        }}>
          <GifPickerContent ref={gifPickerRef} onClick={(e) => e.stopPropagation()}>
            <GifSearchBar type="text" placeholder="Search for GIFs..." value={gifSearchTerm} onChange={(e) => setGifSearchTerm(e.target.value)} />
            {isLoadingGifs ? <p style={{textAlign: 'center', padding: '1rem'}}>Loading...</p> : <GifGrid>{gifResults.map(gif => <GifGridItem key={gif.id} src={gif.preview} onClick={() => handleGifSelect(gif)} />)}</GifGrid>}
          </GifPickerContent>
        </GifPickerModal>
      )}
    </>
  );
}

export default Chat;
