import React, { useState, useEffect, useRef, useContext, useLayoutEffect, useCallback } from 'react';
import styled, { createGlobalStyle, keyframes } from 'styled-components';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useDrag } from '@use-gesture/react';
import { UserContext, UserProfile } from './UserContext';
import Auth from './Auth';

// --- UTILITY ---
const getUserId = (): string => {
  let userId = localStorage.getItem('pulseUserId');
  if (!userId) {
    userId = Date.now().toString() + Math.random().toString(36).substring(2);
    localStorage.setItem('pulseUserId', userId);
  }
  return userId;
};

/**
 * Trusted CDN hostnames allowed as fetch targets in downloadFile.
 * Any URL whose hostname is not in this list is opened in a new tab instead of
 * fetched — prevents Server-Side Request Forgery (SSRF) if msg.url is ever set
 * to an internal network address.
 */
const ALLOWED_DOWNLOAD_HOSTS = ['res.cloudinary.com', 'media.tenor.com', 'tenor.com'];

/**
 * Fetches a file as a Blob and triggers a browser download with the correct filename.
 * The HTML `download` attribute is silently ignored by browsers for cross-origin URLs
 * (e.g. Cloudinary CDN), so we must fetch the blob and create a local object URL.
 * Falls back to opening in a new tab if the fetch fails or the host is not trusted.
 */
const downloadFile = async (url: string, filename: string): Promise<void> => {
  try {
    // Validate URL host against allowlist before fetching (SSRF prevention).
    let parsed: URL;
    try { parsed = new URL(url); } catch { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    const { hostname, protocol } = parsed;
    const isTrustedHost =
      (protocol === 'https:' || protocol === 'http:') &&
      ALLOWED_DOWNLOAD_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
    if (!isTrustedHost) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

/**
 * Sanitizes a URL before using it as a media src/href attribute.
 * Rejects any URL whose protocol is not https:, http:, or blob: — prevents
 * XSS via javascript: or data: URIs that could be injected through server data.
 */
const sanitizeMediaUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  if (url.startsWith('blob:')) return url; // createObjectURL URLs are always safe
  try {
    const { protocol } = new URL(url);
    return (protocol === 'https:' || protocol === 'http:') ? url : '';
  } catch {
    return '';
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

// --- STYLED COMPONENTS ---
export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; overflow: hidden; overscroll-behavior: none; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f7fafc; color: #2d3748; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  * { -webkit-tap-highlight-color: transparent; }
  /* Scrollbar styles for webkit browsers */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #a0aec0;
  }
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

const popIn = keyframes`
  0% { transform: scale(0.5); opacity: 0; }
  80% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); }
`;

const EmojiPickerWrapper = styled.div`
  animation: ${fadeInScale} 0.3s ease-out forwards;
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
  height: 100%;
`;
const Header = styled.header`
  background-color: white;
  padding: 1rem;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  z-index: 50; /* Increased z-index to be above the sidebar */
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background-color 0.3s ease;
  animation: ${slideIn} 0.5s ease-out forwards;

  @media (max-width: 768px) {
    padding: 0.5rem 1rem; /* Further reduced padding on mobile */
  }
`;
const HeaderTitle = styled.h1`
  font-size: 1.25rem;
  font-weight: bold;
  color: #2d3748;
  text-align: center;
  flex-grow: 1;
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
  gap: 1rem;
  overflow-y: auto;
  padding: 1rem;
  padding-right: ${props => !props.$isMobileView && props.$isScrollButtonVisible ? '64px' : '1rem'};
  transition: padding-right 0.3s ease;
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

const MessageRow = styled.div<{ $sender: string; $isSelected?: boolean; $isActiveDeleteMenu?: boolean; }>`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  background-color: ${props => props.$isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent'};
  border-radius: 8px;
  transition: background-color 0.2s ease;
  user-select: none;
  touch-action: pan-y; /* Allow vertical scrolling, while manually handling horizontal drag */
  z-index: ${props => props.$isActiveDeleteMenu ? 40 : 'auto'};
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
`;
const MobileReactionPicker = styled.div<{ $sender: 'me' | 'other' }>`
  position: absolute;
  top: -40px;
  z-index: 30;
  background: white;
  border-radius: 20px;
  padding: 4px 8px;
  display: flex;
  gap: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  animation: ${fadeInScale} 0.2s ease-out forwards;

  ${props => props.$sender === 'me' 
    ? `right: 10px;` 
    : `left: 10px;`
  }
`;
const MessageBubble = styled.div<{ $sender: string; $messageType: string; $isUploading?: boolean; $uploadError?: boolean; }>`
  position: relative;
  max-width: 75%;
  padding: 0.5rem 1rem;
  border-radius: 1.25rem;
  background-color: ${props => props.$sender === 'me' ? '#3B82F6' : 'white'};
  color: ${props => props.$sender === 'me' ? 'white' : '#2d3748'};
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  cursor: pointer;
  min-width: ${props => props.$messageType === 'text' ? '6rem' : '0'};
  opacity: ${props => props.$isUploading ? 0.5 : 1};
  transition: opacity 0.3s ease;
  border: ${props => props.$uploadError ? '2px solid red' : 'none'};
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
  gap: 8px;
  margin-top: 1px;

  ${props => props.$sender === 'me' 
    ? `
      justify-content: flex-end;
      padding-right: 6px;
    ` 
    : `
      justify-content: flex-start;
      padding-left: 6px;
    `
  }
`;

const Timestamp = styled.div<{ $sender: string }>`
  font-size: 0.75rem;
  margin-top: 0.1rem;
  text-align: right;
  white-space: nowrap;
  color: ${props => props.$sender === 'me' ? '#bfdbfe' : '#a0aec0'};
  user-select: none;
`;
const Footer = styled.footer`
  background-color: white;
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
  z-index: 10;
  transition: background-color 0.3s ease;
`;
const InputContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
`;

const ActionButtonsContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.5rem;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;
const MessageInput = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.75rem;
  transition: all 0.2s;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  resize: none;
  max-height: 120px;
  overflow-y: hidden;
  touch-action: auto; /* Allow native text selection */
  scrollbar-width: thin;
  scrollbar-color: #cbd5e0 transparent;
  &:focus { 
    outline: none; 
    border-color: #3B82F6; 
    box-shadow: 0 0 0 2px #bfdbfe; 
  }
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: #a0aec0;
  }
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
  transition: all 0.2s ease;
  display: flex; align-items: center; justify-content: center;
  &:hover { 
    background-color: #2563EB; 
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  &:disabled { 
    background-color: #9ca3af; 
    cursor: not-allowed; 
    transform: scale(1);
    box-shadow: none;
  }
`;
const AttachButton = styled(SendButton)`
    background-color: #e2e8f0;
    color: #4a5568;
    &:hover { 
      background-color: #cbd5e0; 
      transform: scale(1.1);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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
  transition: background 0.15s;
  max-width: 280px;
  &:hover { background: rgba(0,0,0,0.13); }
  svg { flex-shrink: 0; }
  span { font-size: 0.85rem; font-weight: 500; word-break: break-all; opacity: 0.85; flex: 1; min-width: 0; }
`;

const MediaContent = styled.div`
  user-select: none;
  animation: ${fadeInScale} 0.3s ease-out forwards;
  p { margin-bottom: 0.5rem; }
  img {
    max-width: 100%;
    border-radius: 0.75rem;
    cursor: pointer;
    display: block;
    @media (min-width: 769px) {
      max-width: 450px;
    }
  }
  p + div, p + img, p + video { margin-top: 0.5rem; }
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

/* Wraps an image so the download overlay button can be positioned within it */
const MediaImageWrapper = styled.div`
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  @media (min-width: 769px) { max-width: 450px; }
  &:hover ${MediaDownloadOverlayBtn} { opacity: 1; }
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
  transition: background 0.15s;
  &:hover { background: rgba(255,255,255,0.1); }
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
  transition: border-color 0.15s;
  flex-shrink: 0;
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
  transition: border-color 0.15s, color 0.15s;
  &:hover { border-color: rgba(255,255,255,0.55); color: rgba(255,255,255,0.8); }
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
  transition: border-color 0.15s;
  &::placeholder { color: rgba(255,255,255,0.4); }
  &:focus { border-color: rgba(255,255,255,0.35); }
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
  transition: background 0.15s, transform 0.15s;
  &:hover { background: #2563eb; transform: scale(1.05); }
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
  transition: background-color 0.2s;
  
  &.delete {
    background-color: #EF4444;
    color: white;
    &:hover { background-color: #DC2626; }
  }

  &.cancel {
    background-color: #e2e8f0;
    color: #4a5568;
    &:hover { background-color: #cbd5e0; }
  }
`;

const AttachmentMenuContainer = styled.div<{ isVisible: boolean }>`
  position: absolute;
  bottom: 100%;
  left: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 20;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  display: ${props => props.isVisible ? 'block' : 'none'};
  animation: ${slideIn} 0.2s ease-out forwards;
`;

const AttachmentMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 15px;
  background: none;
  border: none;
  color: #2d3748;
  text-align: left;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s;
  &:hover { background-color: #f7fafc; }
`;

const ReactionsContainer = styled.div<{ $sender: 'me' | 'other' }>`
  position: absolute;
  bottom: -16px;
  z-index: 1;
  display: flex;
  align-items: center;
  background: rgba(240, 242, 245, 0.8);
  backdrop-filter: blur(5px);
  border-radius: 15px;
  padding: 2px 5px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  cursor: pointer;
  animation: ${popIn} 0.2s ease-out forwards;

  ${props => props.$sender === 'me' 
    ? `left: -10px;` 
    : `right: -10px;`
  }
`;
const Lightbox = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; cursor: pointer;
  animation: ${fadeInScale} 0.3s ease-out forwards;
  img { max-width: 90%; max-height: 90%; border-radius: 8px; }
`;
const DeleteMenu = styled.div`
  position: absolute; top: 28px; right: 0; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 35; overflow: hidden; border: 1px solid #e2e8f0; pointer-events: all;
  animation: ${fadeInScale} 0.2s ease-out forwards;
`;
const DeleteMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 15px;
  background: none;
  border: none;
  color: #2d3748;
  text-align: left;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s;
  &:hover { background-color: #f7fafc; }
`;
const FilePreviewContainer = styled.div`
  padding: 10px 1rem; border-top: 1px solid #e2e8f0; display: flex; align-items: center; gap: 10px; background-color: #f7fafc;
`;
const FilePreviewImage = styled.img`
  width: 50px; height: 50px; border-radius: 8px; object-fit: cover;
`;
const FilePreviewInfo = styled.div`
  flex-grow: 1; font-size: 0.9rem; color: #4a5568;
`;
const CancelPreviewButton = styled.button`
  background: #e2e8f0; border-radius: 50%; border: none; width: 30px; height: 30px; min-width: 30px; min-height: 30px; flex-shrink: 0; cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;
  transition: background-color 0.2s;
  &:hover { background-color: #cbd5e0; }
`;
const EmojiButton = styled(SendButton)`
  background-color: #e2e8f0;
  color: #4a5568;
  &:hover { 
    background-color: #cbd5e0; 
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
`;
const GifPickerModal = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50;
  animation: ${fadeInScale} 0.3s ease-out forwards;
`;
const GifPickerContent = styled.div`
  background: white; width: 90%; max-width: 500px; height: 70%; max-height: 600px; border-radius: 8px; display: flex; flex-direction: column;
`;
const GifSearchBar = styled.input`
  width: 100%; border: none; border-bottom: 1px solid #e2e8f0; padding: 1rem; font-size: 1rem; &:focus { outline: none; }
`;
const GifGrid = styled.div`
  flex-grow: 1; overflow-y: auto; padding: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;
`;
const GifGridItem = styled.img`
  width: 100%; height: 120px; object-fit: cover; border-radius: 4px; cursor: pointer; transition: transform 0.2s;
  &:hover { transform: scale(1.05); }
`;
const UserSidebar = styled.aside<{ $isVisible: boolean }>`
  width: 240px;
  background: #f8fafc;
  border-left: 1px solid #e2e8f0;
  padding: 1.5rem 1rem;
  overflow-y: hidden; /* Hide overflow for the sidebar itself */
  transition: margin-right 0.3s ease, background-color 0.3s ease;
  flex-shrink: 0;
  user-select: none;
  animation: ${slideIn} 0.5s ease-out forwards;
  display: flex; /* Make it a flex container */
  flex-direction: column; /* Arrange children vertically */
  h2 {
    color: #1e293b;
  }
  @media (max-width: 768px) {
    position: fixed;
    top: 40px;
    right: 0;
    bottom: 0;
    margin-right: ${props => props.$isVisible ? '0' : '-240px'};
    z-index: 40;
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
  list-style: none; padding: 0; margin: 0;
  flex-grow: 1; /* Allow UserList to take up available space */
  overflow-y: auto; /* Enable scrolling for the user list */
`;
const UserListItem = styled.li<{ index: number }>`
  color: #1e293b;
  font-weight: 500;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: ${slideIn} 0.3s ease-out forwards;
  animation-delay: ${props => props.index * 0.1}s;
`;
const MobileUserListToggle = styled(AttachButton)`
  display: none;
  @media (max-width: 768px) { display: flex; }
`;

const ClearChatButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 15px;
  margin-top: 1rem;
  background-color: #64748B; /* A neutral gray */
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;

  &:hover {
    background-color: #475569;
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 20px;
    height: 20px;
    stroke: white;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
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
  transition: background-color 0.2s ease, transform 0.2s ease;

  &:hover {
    background-color: #DC2626;
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 20px;
    height: 20px;
    stroke: white;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
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
  color: #64748B;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: ${slideIn} 0.3s ease-out forwards;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
`;
const ReplyPreviewContainer = styled.div`
  padding: 10px 1rem; border-bottom: 1px solid #e2e8f0; background-color: #f7fafc; display: flex; align-items: center; gap: 10px; overflow: hidden;
`;
const ReplyText = styled.div`
  flex-grow: 1; font-size: 0.9rem; color: #4a5568; min-width: 0; overflow: hidden;
  p { font-weight: bold; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  span { opacity: 0.8; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

  const QuotedMessageContainer = styled.div<{ $sender: 'me' | 'other' }>`
  background: ${props => props.$sender === 'me' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.05)'};
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 3px solid ${props => props.$sender === 'me' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.1)'};
  cursor: pointer;
  p { font-weight: bold; font-size: 0.8rem; color: black; }
  span {
    font-size: 0.9rem;
    opacity: 0.9;
    display: block; /* Make it a block element */
    word-wrap: break-word; /* Ensure long words wrap */
    color: black;
  }
`;

const ReactionPicker = styled.div<{ $sender: 'me' | 'other' }>`
  position: absolute;
  background: white; 
  border-radius: 20px; 
  padding: 8px; 
  display: flex; 
  gap: 8px; 
  box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
  z-index: 60;
  animation: ${fadeInScale} 0.15s ease-out forwards;
`;
const ReactionEmoji = styled.button<{ $isPlusIcon?: boolean }>`
  background: ${props => props.$isPlusIcon ? '#e2e8f0' : 'none'}; 
  border: none; 
  font-size: 24px; 
  cursor: pointer; 
  transition: transform 0.1s ease, background-color 0.2s ease;
  border-radius: ${props => props.$isPlusIcon ? '50%' : '0'};
  width: ${props => props.$isPlusIcon ? '36px' : 'auto'};
  height: ${props => props.$isPlusIcon ? '36px' : 'auto'};
  display: ${props => props.$isPlusIcon ? 'flex' : 'inline-flex'};
  align-items: center;
  justify-content: center;
  &:hover { transform: scale(1.2); }
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

const ReactionsPopupModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.2);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ReactionsPopupContent = styled.div`
  position: absolute; // Changed from flex item to absolute
  background: white; // Dark background
  color: #2d3748; // Light text
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
  animation: ${popIn} 0.2s ease-out;
  border: 1px solid #e2e8f0;
`;

const ReactionsPopupHeader = styled.div`
  padding: 0 16px; // Remove vertical padding
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  gap: 16px;
  overflow-x: auto;
  // Custom scrollbar for a cleaner look
  scrollbar-width: thin;
  scrollbar-color: #cbd5e0 #f7fafc;
  &::-webkit-scrollbar {
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: #f7fafc;
  }
  &::-webkit-scrollbar-thumb {
    background-color: #cbd5e0;
    border-radius: 3px;
  }
`;

const ReactionTab = styled.button<{ active: boolean }>`
  background: none;
  border: none;
  color: ${props => props.active ? '#3B82F6' : '#4a5568'};
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 2px solid ${props => props.active ? '#3B82F6' : 'transparent'};
  transition: all 0.2s ease;

  &:hover {
    color: #3B82F6;
  }
`;

const ReactionsUserList = styled.div`
  padding: 8px 16px 16px 16px;
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const UserAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: #e2e8f0;
  color: #4a5568;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.9rem;
`;

const ReactionUserRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1rem;
`;

const ReactionEmojiSpan = styled.span`
  font-size: 15px;
  margin-right: -4px; /* Overlap emojis slightly */
`;

const ReactionCountSpan = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: #4a5568; // Darker text for readability
  margin-left: 8px;
`;
const MessageActions = styled.div`
  position: absolute; 
  top: -16px; 
  right: 12px; 
  display: flex; 
  gap: 8px; 
  background: white; 
  box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
  border-radius: 20px; 
  padding: 4px; 
  opacity: 0; 
  transition: all 0.2s ease; 
  z-index: 32; 
  pointer-events: none;
  ${MessageBubble}:hover & { opacity: 1; pointer-events: all; }
`;
const ActionButton = styled.button`
  background: none; border: none; font-size: 16px; cursor: pointer; padding: 4px; color: #4a5568;
  &:hover { color: #000; }
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
  border: 2px solid #cbd5e0;
  border-radius: 50%;
  background-color: ${props => props.checked ? '#3B82F6' : 'transparent'};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  &::after {
    content: '✓';
    color: white;
    font-size: 14px;
    font-weight: bold;
    display: ${props => props.checked ? 'block' : 'none'};
  }
`;

const SelectModeFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: white;
  border-top: 1px solid #e2e8f0;
`;

const DeleteButton = styled(SendButton)`
  background-color: #EF4444;
  &:hover { background-color: #DC2626; }
`;

const CopyButton = styled(SendButton)`
  background-color: #64748B;
  &:hover { background-color: #475569; }
`;

const EditButton = styled(SendButton)`
  background-color: #FBBF24;
  &:hover { background-color: #F59E0B; }
`;

const ConfirmationModal = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100;
  animation: ${fadeInScale} 0.3s ease-out forwards;
`;

const ConfirmationContent = styled.div`
  background: white; padding: 2rem; border-radius: 8px; text-align: center;
  h3 { margin-bottom: 1rem; }
  div { display: flex; gap: 1rem; justify-content: center; }
`;

const VideoPlayerWrapper = styled.div`
  position: relative;
  cursor: pointer;
  width: 100%;
  max-height: 60vh;
  border-radius: 0.75rem;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  @media (min-width: 769px) {
    max-width: 450px;
  }
`;
const PlayIcon = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 60px;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  pointer-events: none;
  transition: opacity 0.2s ease;
  &::after {
    content: '';
    display: block;
    width: 0;
    height: 0;
    border-top: 12px solid transparent;
    border-bottom: 12px solid transparent;
    border-left: 20px solid white;
    margin-left: 6px;
  }
`;

const MessageText = styled.p`
  user-select: text; /* Allow selection on PC */
  white-space: pre-wrap;
  word-wrap: break-word;
  cursor: text;
  @media (max-width: 768px) {
    user-select: none; /* Disable selection on mobile */
  }
`;

const SystemMessage = styled.div`
  align-self: center;
  background-color: #e9ecef;
  color: #495057;
  padding: 0.5rem 1rem;
  border-radius: 1.25rem;
  font-size: 0.9rem;
  margin: 0.5rem 0;
  width: fit-content;
  text-align: center;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
`;

// --- INTERFACES ---
interface ReplyContext { id: string; username: string; text: string; type: 'text' | 'image' | 'video' | 'file'; }
interface Message { id: string; userId: string; username: string; type: 'text' | 'image' | 'video' | 'file' | 'system_notification'; text?: string; url?: string; originalName?: string; timestamp: string; reactions?: { [emoji: string]: { userId: string, username: string }[] }; edited?: boolean; replyingTo?: ReplyContext; isDeleted?: boolean; deletedBy?: string; isUploading?: boolean; uploadError?: boolean; }
interface Gif { id: string; preview: string; url: string; }

// --- CHILD COMPONENTS ---

const VideoPlayer = ({ src, onPointerDown }: { src: string; onPointerDown?: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0.1; // Seek to a point to show a thumbnail
    }
  };

  return (
    <VideoPlayerWrapper onClick={handlePlayPause} onContextMenu={(e) => e.preventDefault()} onPointerDown={() => onPointerDown?.()}>
      {!isPlaying && <PlayIcon />}
      <video
        ref={videoRef}
        src={sanitizeMediaUrl(src)}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onDoubleClick={(e) => e.preventDefault()}
        style={{ width: '100%', maxHeight: '60vh', zIndex: 1, position: 'relative' }}
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

const renderMessageContent = (
  msg: Message,
  openLightbox: (url: string) => void,
  onMediaPointerDown?: () => void,
) => {
  const isVideo = msg.type === 'video' || msg.url?.match(/\.(mp4|webm|mov)$/i);
  const isImage = msg.type === 'image' || msg.url?.match(/\.(jpeg|jpg|gif|png|svg)$/i);

  const DownloadSvg = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );

  if (isImage) {
    return (
      <MediaContent>
        <MediaImageWrapper>
          <img src={sanitizeMediaUrl(msg.url)} alt={msg.originalName} onClick={() => { const u = sanitizeMediaUrl(msg.url); if (u) openLightbox(u); }} onPointerDown={() => onMediaPointerDown?.()} onDoubleClick={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} />
          {msg.url && (
            <MediaDownloadOverlayBtn
              title="Download"
              onClick={(e) => { e.stopPropagation(); downloadFile(msg.url!, msg.originalName || 'image'); }}
            >
              <DownloadSvg />
            </MediaDownloadOverlayBtn>
          )}
        </MediaImageWrapper>
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{msg.text}</MessageText>}
      </MediaContent>
    );
  }

  if (isVideo && msg.url) {
    return (
      <MediaContent>
        <VideoPlayer src={msg.url} onPointerDown={onMediaPointerDown} />
        <InlineDownloadBtn onClick={() => downloadFile(msg.url!, msg.originalName || 'video')}>
          <DownloadSvg /> Download
        </InlineDownloadBtn>
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{msg.text}</MessageText>}
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
        {msg.text && <MessageText style={{ paddingTop: '0.5rem' }}>{msg.text}</MessageText>}
      </MediaContent>
    );
  }

  if (msg.text) {
    return <MessageText>{msg.text}</MessageText>;
  }

  return null;
};

interface MessageItemProps {
  msg: Message;
  currentUserId: string;
  activeDeleteMenu: string | null;
  deleteMenuRef: React.RefObject<HTMLDivElement>;
  handleSetReply: (message: Message) => void;
  handleReact: (messageId: string, emoji: string) => void;
  openDeleteMenu: (messageId: string) => void;
  openLightbox: (url: string) => void;
  deleteForMe: (messageId: string) => void;
  deleteForEveryone: (messageId: string) => void;
  scrollToMessage: (messageId: string) => void;
  isSelectModeActive: boolean;
  isSelected: boolean;
  handleToggleSelectMessage: (messageId: string) => void;
  setActiveDeleteMenu: (id: string | null) => void;
  handleCopy: (message: Message) => void;
  handleStartEdit: (message: Message) => void;
  handleCancelSelectMode: () => void;
  isMobileView: boolean;
  onOpenReactionPicker: (messageId: string, rect: DOMRect, sender: 'me' | 'other') => void;
  setReactionsPopup: (popup: { messageId: string; reactions: { [emoji: string]: { userId: string; username: string; }[] }; rect: DOMRect } | null) => void;
  selectedMessages: string[];
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string) => void;
  getReactionByUserId: (messageId: string | undefined, userId: string) => string | null;
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null;
  editingMessageId: string | null;
  editingText: string;
  setEditingText: (text: string) => void;
  handleSaveEdit: () => void;
  handleCancelEdit: () => void;
}

const MessageItem = React.memo(({
  msg,
  currentUserId,
  activeDeleteMenu,
  deleteMenuRef,
  handleSetReply,
  handleReact,
  openDeleteMenu,
  openLightbox,
  deleteForMe,
  deleteForEveryone,
  scrollToMessage,
  isSelectModeActive,
  isSelected,
  handleToggleSelectMessage,
  setActiveDeleteMenu,
  handleCopy,
  handleStartEdit,
  handleCancelSelectMode,
  isMobileView,
  onOpenReactionPicker,
  setReactionsPopup,
  selectedMessages,
  handleOpenFullEmojiPicker,
  getReactionByUserId,
  reactionPickerData,
  editingMessageId,
  editingText,
  setEditingText,
  handleSaveEdit,
  handleCancelEdit
}: MessageItemProps) => {
  const isEditing = editingMessageId === msg.id;
  const editInputRef = useRef<HTMLTextAreaElement>(null!);
  const messageRowRef = useRef<HTMLDivElement>(null!);
  const messageBubbleRef = useRef<HTMLDivElement>(null!);
  // Tracks whether the pointer-down landed on a media preview element.
  // When true the gesture-tap handler skips selection so the lightbox/player
  // can open without also selecting the message.
  const mediaWasTapped = useRef(false);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.style.height = 'auto';
      editInputRef.current.style.height = `${editInputRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  useDrag(({ active, movement: [mx, my], last, tap, event }) => {
    // If a drag gesture is active (i.e., user is scrolling), cancel the long-press timer.
    if (active && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (tap) {
      const target = event.target as HTMLElement;
      // If the tap was on the reaction picker, ignore it completely.
      if (target.closest('.mobile-reaction-picker')) {
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

    // Reset the media-tap flag when a gesture ends as a drag (not a tap),
    // so a subsequent tap always starts clean.
    if (last && !tap) {
      mediaWasTapped.current = false;
    }

    // Only perform swipe-to-reply logic for horizontal swipes, not vertical scrolls.
    if (isMobileView && !isSelectModeActive && !isDeleted && messageRowRef.current && Math.abs(mx) > Math.abs(my)) {
      if (last) {
        // If the drag was far enough, trigger the reply action.
        if (mx > 70) {
          handleSetReply(msg);
        }
        // Animate the message back to its original position.
        messageRowRef.current.style.transform = 'translateX(0px)';
        messageRowRef.current.style.transition = 'transform 0.2s ease-out';
      } else {
        // During the drag, update the position.
        let newX = active ? mx : 0;
        if (newX < 0) newX = 0; // Prevent dragging left.
        if (newX > 80) newX = 80; // Cap the drag distance to 80px.

        messageRowRef.current.style.transform = `translateX(${newX}px)`;
        messageRowRef.current.style.transition = 'none';
      }
    }
  }, { 
    filterTaps: true, 
    eventOptions: { passive: true }, 
    target: messageRowRef,
    drag: { threshold: 10 }
  });
  
  const currentUserReaction = getReactionByUserId(msg.id, currentUserId);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reactButtonRef = useRef<HTMLButtonElement>(null!);
  const wasLongPressed = useRef(false);
  const sender = msg.userId === currentUserId ? 'me' : 'other';
  const [isMessageBubbleHovered, setIsMessageBubbleHovered] = useState(false);

  const messageTime = new Date(msg.timestamp).getTime();
  const now = new Date().getTime();
  const canEdit = msg.userId === currentUserId && (now - messageTime) < 15 * 60 * 1000 && msg.text;
  const isDeleted = msg.isDeleted;

  const handleLongPressStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      if (isMobileView) {
        handleToggleSelectMessage(msg.id);
        wasLongPressed.current = true;
      }
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
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
    <MessageRow
      id={`message-${msg.id}`}
      ref={messageRowRef}
      $sender={sender}
      $isSelected={isSelected}
      $isActiveDeleteMenu={activeDeleteMenu === msg.id}
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
      onTouchEnd={handleLongPressEnd}
    >
      {isSelectModeActive && (
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
        {!isDeleted && <Username $sender={sender}>{msg.username}</Username>}
        <MessageBubble 
          ref={messageBubbleRef}
          $sender={sender} 
          $messageType={msg.type} 
          $isUploading={msg.isUploading} 
          $uploadError={msg.uploadError}
          onMouseEnter={() => setIsMessageBubbleHovered(true)}
          onMouseLeave={() => setIsMessageBubbleHovered(false)}
        >
          {isDeleted ? (
            <MessageText style={{ fontStyle: 'italic', color: sender === 'me' ? '#bfdbfe' : '#a0aec0', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'default' }}>
              {msg.deletedBy === currentUserId ? 'You deleted this message.' : 'This message has been deleted.'}
            </MessageText>
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
              {msg.replyingTo && (
                <QuotedMessageContainer $sender={sender} onClick={() => { if (msg.replyingTo) scrollToMessage(msg.replyingTo.id); }}>
                  <p>{msg.replyingTo.username}</p>
                  <span>{msg.replyingTo.text}</span>
                </QuotedMessageContainer>
              )}
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
                    <ReactionEmoji $isPlusIcon={true} onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFullEmojiPicker(e.currentTarget.getBoundingClientRect(), msg.id);
                    }}>+</ReactionEmoji>
                  )}
                </MobileReactionPicker>
              )}
              {!isMobileView && isMessageBubbleHovered && ( // Only show on PC when message bubble is hovered
                <MessageActions>
                  <ActionButton ref={reactButtonRef} className="react-action-button" onClick={() => onOpenReactionPicker(msg.id, reactButtonRef.current!.getBoundingClientRect(), sender)} title="React">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                  </ActionButton>
                  <ActionButton onClick={() => openDeleteMenu(msg.id)} title="More" className="more-action-button" style={{ fontSize: '20px' }}>&#8942;</ActionButton>
                </MessageActions>
              )}
              {activeDeleteMenu === msg.id && (
                <DeleteMenu ref={deleteMenuRef}>
                  {canEdit && (
                    <DeleteMenuItem onClick={() => handleStartEdit(msg)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      Edit
                    </DeleteMenuItem>
                  )}
                  {(msg.text || msg.type === 'image') && 
                    <DeleteMenuItem onClick={() => { handleCopy(msg); setActiveDeleteMenu(null); }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      Copy
                    </DeleteMenuItem>
                  }
                  <DeleteMenuItem onClick={() => {
                    handleToggleSelectMessage(msg.id);
                    setActiveDeleteMenu(null);
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    Delete
                  </DeleteMenuItem>
                </DeleteMenu>
              )}
              {renderMessageContent(msg, openLightbox, isMobileView && isSelectModeActive ? () => { mediaWasTapped.current = true; } : undefined)}
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
  );
});

interface TypingIndicatorProps {
  onlineUsers: UserProfile[];
  currentUserId: string;
}

const TypingIndicator = ({ onlineUsers, currentUserId }: TypingIndicatorProps) => {
  const typers = onlineUsers.filter(u => u.isTyping && u.userId !== currentUserId);
  if (typers.length === 0) return null;

  const names = typers.map(u => u.username).join(', ');
  const text = typers.length > 2 ? 'Several people are typing' : (typers.length > 1 ? `${names} are typing` : `${names} is typing`);

  return (
    <TypingIndicatorContainer>
      <span>{text}</span>
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
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid #e2e8f0;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: opacity 0.3s ease, transform 0.3s ease;
  opacity: ${props => props.$isVisible ? 1 : 0};
  transform: ${props => props.$isVisible ? 'scale(1)' : 'scale(0.8)'};
  pointer-events: ${props => props.$isVisible ? 'auto' : 'none'};
  z-index: 20;

  svg {
    width: 24px;
    height: 24px;
    stroke: #4a5568;
    stroke-width: 2.5;
  }

  &:hover {
    transform: scale(1.1);
    background-color: white;
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


function Chat() {
  const userContext = useContext(UserContext);

  // --- STATE MANAGEMENT ---
  const [messages, setMessages] = useState<Message[]>([]);
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
  const [isAttachmentMenuVisible, setIsAttachmentMenuVisible] = useState(false);
  const [isSelectModeActive, setIsSelectModeActive] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [isDeleteConfirmationVisible, setIsDeleteConfirmationVisible] = useState(false);
  const [canDeleteForEveryone, setCanDeleteForEveryone] = useState(false);
  const [fullEmojiPickerPosition, setFullEmojiPickerPosition] = useState<DOMRect | null>(null);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [isScrollToBottomVisible, setIsScrollToBottomVisible] = useState(false);
  const [messageIdForFullEmojiPicker, setMessageIdForFullEmojiPicker] = useState<string | null>(null);
  const [reactionsPopup, setReactionsPopup] = useState<{ messageId: string; reactions: { [emoji: string]: { userId: string; username: string; }[] }; rect: DOMRect } | null>(null);
  const [reactionPickerData, setReactionPickerData] = useState<{ messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<DOMRect | null>(null);

  // --- REFS ---
  const ws = useRef<WebSocket | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether we've done the very first scroll-to-bottom after history loads.
  // Must be a ref (not state) so it doesn't trigger re-renders.
  const hasInitialScrolled = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const deleteMenuRef = useRef<HTMLDivElement>(null!);
  const gifPickerRef = useRef<HTMLDivElement>(null!);
  const attachmentMenuRef = useRef<HTMLDivElement>(null!);
  const attachmentButtonRef = useRef<HTMLButtonElement>(null!);
  const emojiPickerRef = useRef<HTMLDivElement>(null!);
  const emojiButtonRef = useRef<HTMLButtonElement>(null!);
  const messageInputRef = useRef<HTMLTextAreaElement>(null!);
  const userIdRef = useRef<string>(getUserId());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Cooldown flag: true while we're within the throttle window after sending start_typing.
  // Prevents sending start_typing more than once per ~3 s even on rapid keystrokes.
  const typingCooldownRef = useRef(false);
  const resizeRafRef = useRef<number>(0);

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
  const stateRef = useRef({ isSelectModeActive, isDeleteConfirmationVisible, lightboxUrl, isUserListVisible });
  // Tracks whether we currently have a guard entry in the history stack.
  // Using a ref (not window.history.state) avoids stale-state issues when
  // overlays are closed programmatically rather than via the back button.
  const overlayGuardPushed = useRef(false);

  // Update ref whenever any overlay state changes
  useEffect(() => {
    stateRef.current = { isSelectModeActive, isDeleteConfirmationVisible, lightboxUrl, isUserListVisible };
  }, [isSelectModeActive, isDeleteConfirmationVisible, lightboxUrl, isUserListVisible]);

  // Push exactly ONE history guard entry when going from "nothing open" to
  // "something open".  When the popstate handler consumes the guard it resets
  // the ref, so the *next* effect run (triggered by closing one layer while
  // others remain) will push a fresh guard automatically.
  useEffect(() => {
    const anyOpen = isDeleteConfirmationVisible || isSelectModeActive || !!lightboxUrl || isUserListVisible;
    if (anyOpen && !overlayGuardPushed.current) {
      window.history.pushState({ overlayGuard: true }, '');
      overlayGuardPushed.current = true;
    }
    if (!anyOpen) {
      overlayGuardPushed.current = false;
    }
  }, [isDeleteConfirmationVisible, isSelectModeActive, lightboxUrl, isUserListVisible]);

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

  // Mobile Back Button Handler
  useEffect(() => {
    const handlePopState = () => {
      // The browser just consumed (popped) our guard entry, so mark it gone.
      // If more layers remain open the guard-push *effect* will automatically
      // push a fresh guard after React re-renders with the updated state.
      overlayGuardPushed.current = false;

      const { isSelectModeActive, isDeleteConfirmationVisible, lightboxUrl, isUserListVisible } = stateRef.current;

      // Strict hierarchy: confirm modal → select mode → lightbox → sidebar.
      if (isDeleteConfirmationVisible) {
        setIsDeleteConfirmationVisible(false);
      } else if (isSelectModeActive) {
        setSelectedMessages([]);
        setIsSelectModeActive(false);
      } else if (lightboxUrl) {
        setLightboxUrl(null);
      } else if (isUserListVisible) {
        setIsUserListVisible(false);
      }
      // else: nothing open — the natural back navigation proceeds
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // WebSocket connection with auto-reconnect on tab-resume / network-restore
  useEffect(() => {
    if (!userContext?.profile) return;

    // Defined inside the effect so the handlers always close over the
    // latest userContext.profile and the setState functions.
    const connect = () => {
      // Already open or in the middle of connecting — nothing to do.
      if (
        ws.current &&
        (ws.current.readyState === WebSocket.OPEN ||
          ws.current.readyState === WebSocket.CONNECTING)
      ) return;

      ws.current = new WebSocket(
        process.env.REACT_APP_API_URL?.replace('http', 'ws') || 'ws://localhost:8080'
      );

      ws.current.onopen = () => {
        ws.current?.send(
          JSON.stringify({ type: 'user_join', ...userContext.profile, userId: userIdRef.current })
        );
      };

      ws.current.onclose = () => console.log('WebSocket disconnected');

      ws.current.onerror = () => {
        // Force close so the readyState is CLOSED and the next connect() call
        // will actually create a new socket.
        ws.current?.close();
      };

      ws.current.onmessage = (event: MessageEvent) => {
        const messageData = JSON.parse(event.data);
        if (messageData.type === 'history') {
          // Reset the initial-scroll flag so the new history always jumps to bottom.
          hasInitialScrolled.current = false;
          setMessages(messageData.data.map(normalizeMessage));
        } else if (messageData.type === 'online_users') {
          setOnlineUsers(messageData.data);
        } else if (messageData.type === 'update') {
          const normalizedUpdate = normalizeMessage(messageData.data);
          setMessages(prev =>
            prev.map(m => (m.id === normalizedUpdate.id ? { ...m, ...normalizedUpdate } : m))
          );
        } else {
          setMessages(prev => [...prev, normalizeMessage(messageData)]);
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
        if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(target) && !attachmentButtonRef.current?.contains(target)) setIsAttachmentMenuVisible(false);
        if (emojiPickerRef.current && !emojiPickerRef.current.contains(target) && !emojiButtonRef.current?.contains(target)) {
          setEmojiPickerPosition(null);
          setFullEmojiPickerPosition(null);
        }
      }, 0);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  useLayoutEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer || messages.length === 0) return;

    if (!hasInitialScrolled.current) {
      // ── INITIAL LOAD ──────────────────────────────────────────────────────
      // Force-scroll to the very bottom unconditionally.
      // The "near-bottom" guard MUST NOT apply here: on first load scrollTop is
      // 0 and scrollHeight is the full height of all history messages, so the
      // guard would always fail and leave the user stranded mid-chat.
      chatContainer.scrollTop = chatContainer.scrollHeight;
      hasInitialScrolled.current = true;

      // Images/media inside messages may finish loading AFTER this paint and
      // push scrollHeight higher. Schedule a second scroll for that case.
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });
      return;
    }

    // ── SUBSEQUENT MESSAGES ────────────────────────────────────────────────
    // Only auto-scroll if the user is already near the bottom (so we don't
    // yank them away from messages they're reading above).
    const { scrollHeight, clientHeight, scrollTop } = chatContainer;
    if (scrollHeight - scrollTop < clientHeight + 200) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);


  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // --- FUNCTIONS ---
  
  const normalizeMessage = (msg: any): Message => {
    if (msg.reactions) {
      Object.keys(msg.reactions).forEach(emoji => {
        msg.reactions[emoji] = msg.reactions[emoji].map((user: any) => 
          typeof user === 'string' ? { userId: user, username: user } : { userId: user.userId, username: user.username || user.userId }
        );
      });
    }
    return msg as Message;
  };

  const resetInput = () => {
    setInputMessage('');
    setReplyingTo(null);
    setStagedFile(null);
    setStagedFiles([]);
    setStagedGif(null);
    setShowFilePreview(false);
    setPreviewCaption('');
    setPreviewActiveIndex(0);
    if (messageInputRef.current) {
      messageInputRef.current.style.height = 'auto';
    }
  };

  const handleSendMessage = async () => {
    // If multi-file preview is open, send from there instead
    if (showFilePreview && stagedFiles.length > 0) {
      handleSendFromPreview();
      return;
    }
    if (!stagedFile && !stagedGif && !inputMessage.trim()) return;
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
        if (replyingTo.url?.includes('tenor.com')) {
          replyText = 'GIF';
        } else if (replyingTo.type === 'image') {
          replyText = 'Image';
        } else if (replyingTo.type === 'video') {
          replyText = 'Video';
        }
      }
      replyContext = { id: replyingTo.id, username: replyingTo.username, text: replyText, type };
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

      fetch(`${process.env.REACT_APP_API_URL}/api/upload`, { method: 'POST', body: formData })
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

      resetInput();

    } else if (stagedGif) {
      const gifMessage: Message = { id: stagedGif.id, userId: userIdRef.current, username: userContext.profile.username, type: 'image', url: stagedGif.url, text: inputMessage, timestamp: new Date().toISOString(), replyingTo: replyContext };
      setMessages(prev => [...prev, gifMessage]);
      requestAnimationFrame(() => scrollToBottom());
      ws.current.send(JSON.stringify(gifMessage));
      resetInput();
    } else {
      const textMessage: Message = { id: Date.now().toString(), userId: userIdRef.current, username: userContext.profile.username, type: 'text', text: inputMessage, timestamp: new Date().toISOString(), replyingTo: replyContext };
      setMessages(prev => [...prev, textMessage]);
      requestAnimationFrame(() => scrollToBottom());
      ws.current.send(JSON.stringify(textMessage));
      resetInput();
    }
  };

  const handleTyping = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    // Skip if the WebSocket send-buffer is backed up (slow / congested network).
    // 4 KB is a safe threshold – typing indicators are tiny but we don't want
    // to pile onto an already-struggling connection.
    if (ws.current.bufferedAmount > 4096) return;

    // Throttle: only send start_typing once per cooldown window (3 s).
    if (!typingCooldownRef.current) {
      typingCooldownRef.current = true;
      try { ws.current.send(JSON.stringify({ type: 'start_typing' })); } catch (_) { /* ignore send errors */ }
    }

    // Reset the stop-typing timer on every keystroke (debounce).
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      try { ws.current?.send(JSON.stringify({ type: 'stop_typing' })); } catch (_) { /* ignore */ }
      typingTimeoutRef.current = null;
      typingCooldownRef.current = false;
    }, 3000);
  }, []);

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat for this session?')) {
        setMessages([]);
    }
  };

  const handleSetReply = useCallback((message: Message) => {
    if (message.type === 'system_notification') return;
    if (message.isDeleted) return; // Can't quote a deleted message
    setReplyingTo(message);
  }, []);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!ws.current || !userContext?.profile) return;
    const reactionMessage = { type: 'react', messageId, userId: userIdRef.current, emoji };
    ws.current.send(JSON.stringify(reactionMessage));
    setReactionPickerData(null);
  }, [userContext?.profile]);

  const deleteForMe = useCallback((messageId: string) => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({ type: 'delete_for_me', messageId }));
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
        if (!msgElement || !chatContainerRef.current) return;
        const container = chatContainerRef.current;
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
      const container = chatContainerRef.current;
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
          window.history.pushState({ overlayGuard: true }, '');
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

  const handleBulkDeleteForMe = () => {
    setMessages(prev => prev.filter(m => !selectedMessages.includes(m.id)));
    // Pop the history state, then reset UI state
    window.history.back();
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
    // Pop the history state, then reset UI state
    window.history.back();
    setIsDeleteConfirmationVisible(false);
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  };

    const handleCopy = useCallback(async (message: Message) => {
      console.log('Attempting to copy message:', message);
      try {
        if (message.type === 'text' && message.text) {
          await navigator.clipboard.writeText(message.text);
          console.log('Text copied to clipboard successfully.');
        } else if ((message.type === 'image' || message.type === 'video') && message.url) {
          console.log('Attempting to copy media (image/video):', message.url);
          try {
            const response = await fetch(message.url);
            const blob = await response.blob();
  
            if (!blob.type.startsWith('image/')) {
              await navigator.clipboard.writeText(message.url);
              console.log('Copied URL for non-image type.');
              return;
            }
  
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = await createImageBitmap(blob);
            canvas.width = img.width;
            canvas.height = img.height;
            ctx!.drawImage(img, 0, 0);
  
            canvas.toBlob(async (pngBlob) => {
              if (pngBlob) {
                try {
                  await navigator.clipboard.write([
                    new ClipboardItem({
                      'image/png': pngBlob,
                    }),
                  ]);
                  console.log('Image copied to clipboard as PNG successfully.');
                } catch (copyErr) {
                  console.error('PNG copy failed, falling back to URL:', copyErr);
                  await navigator.clipboard.writeText(message.url!);
                }
              }
            }, 'image/png');
          } catch (e) {
            console.error('Could not copy image, falling back to URL:', e);
            await navigator.clipboard.writeText(message.url!);
          }
        }
      } catch (err) {
        console.error('Failed to copy content: ', err);
      }
    }, []);

    const handleStartEdit = useCallback((message: Message) => {
      setEditingMessageId(message.id);
      setEditingText(message.text || '');
      setActiveDeleteMenu(null);
    }, []);

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

    const getReactionByUserId = useCallback((messageId: string | undefined, userId: string): string | null => {
    if (!messageId) return null;
    const message = messages.find(m => m.id === messageId);
    if (!message || !message.reactions) return null;

    for (const emoji in message.reactions) {
      if (message.reactions[emoji].some(r => r.userId === userId)) {
        return emoji;
      }
    }
    return null;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrolledUp = (scrollHeight - scrollTop - clientHeight) > 20;
      setIsScrollToBottomVisible(isScrolledUp);
    }
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

  const scrollToMessage = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.transition = 'background-color 0.5s ease';
      element.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
      setTimeout(() => {
        element.style.backgroundColor = 'transparent';
      }, 1500);
    }
  }, []);
  
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => { setInputMessage(prev => prev + emojiData.emoji); };
  const handleOpenEmojiPicker = useCallback((rect: DOMRect) => {
    setEmojiPickerPosition(prev => prev ? null : rect);
  }, []);

  const handleOpenFullEmojiPicker = useCallback((rect: DOMRect, messageId: string) => {
    setFullEmojiPickerPosition(rect);
    setMessageIdForFullEmojiPicker(messageId);
    setReactionPickerData(null);
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  }, []);

  // --- RENDER ---
  if (!userContext?.profile) { return <Auth onAuthSuccess={userContext!.login} />; }

  const selectedMessage = messages.find(msg => msg.id === selectedMessages[0]);
  const canEditSelectedMessage = selectedMessages.length === 1 && selectedMessage && selectedMessage.userId === userIdRef.current && selectedMessage.text && (new Date().getTime() - new Date(selectedMessage.timestamp).getTime()) < 15 * 60 * 1000;
 
  
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
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      const fileArr = Array.from(files);
      setStagedFiles(fileArr);
      setPreviewActiveIndex(0);
      setPreviewCaption('');
      setShowFilePreview(true);
      setStagedGif(null);
    }
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
      replyContext = { id: replyingTo.id, username: replyingTo.username, text: replyText, type };
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

      fetch(`${process.env.REACT_APP_API_URL}/api/upload`, { method: 'POST', body: formData })
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

  const handleGifSelect = (gif: Gif) => { setStagedGif(gif); setStagedFile(null); setStagedFiles([]); setShowFilePreview(false); };



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
              <FilePreviewModalClose onClick={() => { setShowFilePreview(false); setStagedFiles([]); setPreviewCaption(''); setPreviewActiveIndex(0); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </FilePreviewModalClose>
              <FilePreviewModalFilename>{activeFile?.name}</FilePreviewModalFilename>
            </FilePreviewModalHeader>
            <FilePreviewModalBody>
              {isImg ? (
                <img src={sanitizeMediaUrl(URL.createObjectURL(activeFile))} alt="File preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
              ) : isVid ? (
                <video src={sanitizeMediaUrl(URL.createObjectURL(activeFile))} controls style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }} />
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
                        {tIsImg ? <img src={sanitizeMediaUrl(URL.createObjectURL(f))} alt="" /> : tIsVid ? <video src={sanitizeMediaUrl(URL.createObjectURL(f))} /> : (
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
      {emojiPickerPosition && (
        <div
          ref={emojiPickerRef}
          style={(() => {
            // On mobile, use fixed positioning anchored above the input area so
            // the picker is never covered by a keyboard or pushed off-screen.
            if (window.innerWidth <= 768) {
              return {
                position: 'fixed' as const,
                bottom: '70px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 21,
              };
            }
            const pickerWidth = 350;
            let top = emojiPickerPosition.top - 450;
            let left = emojiPickerPosition.left;

            if (top < 0) {
              top = emojiPickerPosition.bottom + 10;
            }

            if (left + pickerWidth > window.innerWidth) {
              left = window.innerWidth - pickerWidth - 10;
            }

            if (left < 0) {
              left = 10;
            }

            return { position: 'absolute' as const, top: `${top}px`, left: `${left}px`, zIndex: 21 };
          })()}
        >
          <EmojiPicker onEmojiClick={handleEmojiClick} autoFocusSearch={false} />
        </div>
      )}
      {fullEmojiPickerPosition && (
        <EmojiPickerWrapper
          ref={emojiPickerRef}
          style={(() => {
            const pickerWidth = 350; // Default width of the emoji picker
            let top = fullEmojiPickerPosition.bottom + 10;
            let left = fullEmojiPickerPosition.left;

            if (left + pickerWidth > window.innerWidth) {
              left = window.innerWidth - pickerWidth - 10;
            }

            if (left < 0) {
              left = 10;
            }

            return { 
              position: 'absolute', 
              top: `${top}px`, 
              left: `${left}px`, 
              zIndex: 31
            } as React.CSSProperties;
          })()}
        >
          <EmojiPicker onEmojiClick={(emojiData) => { handleReact(messageIdForFullEmojiPicker!, emojiData.emoji); setFullEmojiPickerPosition(null); setMessageIdForFullEmojiPicker(null); }} />
        </EmojiPickerWrapper>
      )}
       {reactionPickerData && (
        <ReactionPicker
          ref={reactionPickerRef}
          $sender={reactionPickerData.sender}
          style={(() => {
            const pickerWidth = 280; // Approximate width of the picker
            let top = reactionPickerData.rect.top - 60;
            let left = reactionPickerData.rect.left;

            if (top < 0) {
              top = reactionPickerData.rect.bottom + 10;
            }

            if (reactionPickerData.sender === 'me') {
              left = reactionPickerData.rect.right - pickerWidth;
            }

            return { top: `${top}px`, left: `${left}px` };
          })()}
        >
          {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
            <ReactionEmoji key={emoji} onClick={(e) => { e.stopPropagation(); handleReact(reactionPickerData.messageId, emoji); }}>{emoji}</ReactionEmoji>
          ))}
          
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
          <HeaderTitle>Pulse Chat</HeaderTitle>
          <MobileUserListToggle onClick={() => setIsUserListVisible(!isUserListVisible)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </MobileUserListToggle>
        </Header>
        <LayoutContainer>
          <ChatWindow>
            <MessagesAndScrollWrapper>
            <MessagesContainer ref={chatContainerRef} onScroll={handleScroll} onClick={handleChatAreaClick} $isScrollButtonVisible={isScrollToBottomVisible} $isMobileView={isMobileView}>
               {messages.map((msg: Message) => {
                          if (msg.type === 'system_notification') {
                            return <SystemMessage key={msg.id}>{msg.text}</SystemMessage>;
                          }
                          return (
                            <MessageItem
                              key={msg.id}
                              msg={msg}
                              currentUserId={userIdRef.current}
                              handleSetReply={handleSetReply}
                              handleReact={handleReact}
                              openDeleteMenu={handleOpenDeleteMenu}
                              openLightbox={openLightbox}
                              activeDeleteMenu={activeDeleteMenu}
                              deleteMenuRef={deleteMenuRef}
                              deleteForMe={deleteForMe}
                              deleteForEveryone={deleteForEveryone}
                              scrollToMessage={scrollToMessage}
                              isSelectModeActive={isSelectModeActive}
                              isSelected={selectedMessages.includes(msg.id)}
                              handleToggleSelectMessage={handleToggleSelectMessage}
                              setActiveDeleteMenu={setActiveDeleteMenu}
                              handleCopy={handleCopy}
                              handleStartEdit={handleStartEdit}
                              handleCancelSelectMode={handleCancelSelectMode}
                              isMobileView={isMobileView}
                              selectedMessages={selectedMessages}
                              onOpenReactionPicker={handleOpenReactionPicker}
                              setReactionsPopup={setReactionsPopup}
                              handleOpenFullEmojiPicker={handleOpenFullEmojiPicker}
                              getReactionByUserId={getReactionByUserId}
                              reactionPickerData={reactionPickerData}
                              editingMessageId={editingMessageId}
                              editingText={editingText}
                              setEditingText={setEditingText}
                              handleSaveEdit={handleSaveEdit}
      handleCancelEdit={handleCancelEdit}
                            />
                          );
                        })}
               <div ref={chatEndRef} />
            </MessagesContainer>
            <ScrollToBottomButton
              $isVisible={isScrollToBottomVisible}
              onClick={scrollToBottom}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14"></path>
                <path d="m19 12-7 7-7-7"></path>
              </svg>
            </ScrollToBottomButton>
            </MessagesAndScrollWrapper>
            <TypingIndicator onlineUsers={onlineUsers} currentUserId={userIdRef.current} />
            <Footer>
              {isSelectModeActive ? (
                <SelectModeFooter>
                  <CancelPreviewButton onClick={handleCancelSelectMode}>&times;</CancelPreviewButton>
                  <span>{selectedMessages.length} selected</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {canEditSelectedMessage && (
                      <EditButton onClick={() => { if (selectedMessage) { handleStartEdit(selectedMessage); } handleCancelSelectMode();}} title="Edit" >
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </EditButton>
                    )}
                      {isMobileView && selectedMessages.length === 1 && (
                       <CopyButton onClick={() => { if (selectedMessage) { handleCopy(selectedMessage); } handleCancelSelectMode(); }} title="Copy" >
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                       </CopyButton>
                      )}
                    <DeleteButton onClick={handleInitiateDelete} title="Delete">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </DeleteButton>
                  </div>
                </SelectModeFooter>
              ) : (
                 <>
              {replyingTo && <ReplyPreviewContainer ref={replyPreviewRef} onClick={() => scrollToMessage(replyingTo.id)}>
                {replyingTo.type === 'video' && replyingTo.url ? (
                  <video src={replyingTo.url} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                ) : (replyingTo.type === 'image' || replyingTo.type === 'video') && replyingTo.url && (
                  <FilePreviewImage src={replyingTo.url} alt="Reply preview" />
                )}
                <ReplyText><p>Replying to {replyingTo.username}</p><span>
                  {(() => {
                    if (replyingTo.text) return replyingTo.text;
                    if (replyingTo.url?.includes('tenor.com')) return 'GIF';
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
              {stagedGif && <FilePreviewContainer><FilePreviewImage src={stagedGif.preview} alt="GIF Preview" /><FilePreviewInfo>GIF selected</FilePreviewInfo><CancelPreviewButton onClick={() => setStagedGif(null)}>&times;</CancelPreviewButton></FilePreviewContainer>}
              <InputContainer>
                <ActionButtonsContainer>
                  <div style={{ position: 'relative' }}>
                    <EmojiButton
                      ref={emojiButtonRef}
                      onPointerDown={(e) => {
                        // Prevent the button from stealing focus — stops the
                        // browser from shifting focus away from the input.
                        e.preventDefault();
                        // Capture the button rect NOW, before any layout shift
                        // from keyboard dismissal changes the button position.
                        const rect = e.currentTarget.getBoundingClientRect();
                        // If the soft keyboard is open (input focused), dismiss it.
                        if (messageInputRef.current && document.activeElement === messageInputRef.current) {
                          messageInputRef.current.blur();
                        }
                        // Toggle the emoji picker immediately in the same event
                        // — no second tap needed even when the keyboard was open.
                        handleOpenEmojiPicker(rect);
                      }}
                    ><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg></EmojiButton>
                  </div>
                  <div style={{ position: 'relative' }} ref={attachmentMenuRef}>
                    <AttachButton onClick={() => setIsAttachmentMenuVisible(!isAttachmentMenuVisible)} ref={attachmentButtonRef}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></AttachButton>
                    <AttachmentMenuContainer isVisible={isAttachmentMenuVisible}>
                      <AttachmentMenuItem onClick={() => { setShowGifPicker(true); setIsAttachmentMenuVisible(false); }}>
                        <FilmIcon /> <span>GIF</span>
                      </AttachmentMenuItem>
                      <AttachmentMenuItem onClick={() => { fileInputRef.current?.click(); setIsAttachmentMenuVisible(false); }}>
                        <FileIcon /> <span style={{ whiteSpace: 'nowrap' }}>Send File</span>
                      </AttachmentMenuItem>
                    </AttachmentMenuContainer>
                  </div>
                </ActionButtonsContainer>
                <MessageInput
                  ref={messageInputRef}
                  rows={1}
                  placeholder={stagedFile || stagedGif ? 'Add a caption...' : 'Type your message...'}
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  onPaste={handlePaste}
                />
                <SendButton onMouseDown={(e) => e.preventDefault()} onClick={handleSendMessage} disabled={(!inputMessage.trim() && !stagedFile && !stagedGif && stagedFiles.length === 0)}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></SendButton>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html" multiple />
                <input type="file" ref={addFileInputRef} onChange={(e) => { if (e.target.files) { setStagedFiles(prev => [...prev, ...Array.from(e.target.files!)]); } if (e.target) e.target.value = ''; }} style={{ display: 'none' }} accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html" multiple />
              </InputContainer>
            </>
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
            <LogoutButton onClick={userContext!.logout}>
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

      {lightboxUrl && (
        <Lightbox onClick={() => setLightboxUrl(null)}>
          <img src={sanitizeMediaUrl(lightboxUrl)} alt="Lightbox" />
        </Lightbox>
      )}
       {showGifPicker && (
        <GifPickerModal onClick={() => setShowGifPicker(false)}>
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
