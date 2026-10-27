import React, { useState, useRef, useEffect } from 'react';
import styled, { css } from 'styled-components';
import {
  fadeInScale,
  modalSlideUp,
  gifItemReveal,
  subtleSlideUp,
  sidebarItemSlide,
  bounce,
  slideIn,
  replySlideIn,
  reactionPickerSlideIn,
  staggerFadeIn,
  emojiPopTap,
  reactionsModalFadeIn,
  reactionsContentSlideUp,
  userRowFadeIn,
  reactionBounceIn,
  countBump,
  soundwaveBar,
  activityIconPulse
} from './chat.animations';
import { MessageBubble } from './chat.layout.styles';

export const GifPickerModal = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50;
  animation: ${fadeInScale} 0.3s ease-out forwards;
`;
export const GifPickerContent = styled.div`
  background: var(--bg-elevated); width: 90%; max-width: 500px; height: 70%; max-height: 600px; border-radius: 12px; display: flex; flex-direction: column; transition: background-color 0.3s ease;
  animation: ${modalSlideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  box-shadow: 0 25px 60px rgba(0,0,0,0.3);
  overflow: hidden;
`;
export const GifSearchBar = styled.input`
  width: 100%; border: none; border-bottom: 1px solid var(--border-primary); padding: 1rem; font-size: 1rem; background: transparent; color: var(--text-primary); transition: border-color 0.3s ease, box-shadow 0.3s ease;
  &:focus { outline: none; border-bottom-color: var(--accent-blue); box-shadow: 0 1px 0 0 var(--accent-blue); } &::placeholder { color: var(--text-muted); }
`;
export const GifGrid = styled.div`
  flex-grow: 1; overflow-y: auto; padding: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;
`;
export const GifGridItem = styled.img`
  width: 100%; height: 120px; object-fit: cover; border-radius: 8px; cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: ${gifItemReveal} 0.3s ease-out both;
  &:hover { transform: scale(1.06); box-shadow: 0 4px 16px rgba(0,0,0,0.15); border-radius: 10px; }
  &:active { transform: scale(0.96); }
`;

export const UserSidebar = styled.aside<{ $isVisible: boolean }>`
  width: 240px;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border-primary);
  padding: 1.5rem 1rem;
  overflow-y: hidden;
  transition: background-color 0.3s ease, border-color 0.3s ease;
  flex-shrink: 0;
  user-select: none;
  @media (min-width: 769px) and (pointer: fine) {
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
  @media (max-width: 768px), (pointer: coarse) {
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

// Transparent backdrop behind the sidebar on mobile - clicking it closes the panel
export const SidebarBackdrop = styled.div<{ $isVisible: boolean }>`
  display: none;
  @media (max-width: 768px), (pointer: coarse) {
    display: ${props => props.$isVisible ? 'block' : 'none'};
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 39;
  }
`;

export const UserList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  margin-top: 0.5rem;
  flex-grow: 1; /* Allow UserList to take up available space */
  overflow-y: auto; /* Enable scrolling for the user list */
`;

export const UserListItem = styled.li<{ index: number }>`
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

export const MobileUserListToggle = styled.button<{ $isOpen?: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;

  @media (max-width: 768px), (pointer: coarse) {
    display: flex;
    &:hover { 
      transform: scale(1.15); 
      border-color: rgba(59, 130, 246, 0.5); 
      background: rgba(59, 130, 246, 0.1);
      color: var(--text-primary);
      box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4); 
    }
    &:active { transform: scale(0.9); }
    svg {
      width: 18px;
      height: 18px;
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      transform: ${props => props.$isOpen ? 'rotate(20deg)' : 'rotate(0deg)'};
    }
  }
`;

export const ThemeToggleBtn = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  &:hover { 
    transform: scale(1.15); 
    border-color: rgba(59, 130, 246, 0.5); 
    background: rgba(59, 130, 246, 0.1);
    color: var(--text-primary);
    box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4); 
  }
  &:active { transform: scale(0.9); }
  svg { width: 18px; height: 18px; transition: transform 0.5s cubic-bezier(0.34,1.56,0.64,1); }
  &:hover svg { transform: rotate(30deg); }
`;

export const ClearChatButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 15px;
  margin-top: 1rem;
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);

  &:hover {
    background-color: var(--bg-hover);
    border-color: rgba(59, 130, 246, 0.3);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.08);
  }

  &:active {
    transform: translateY(0) scale(0.97);
  }

  svg {
    width: 20px;
    height: 20px;
    stroke: currentColor;
    strokeWidth: 2;
    strokeLinecap: round;
    strokeLinejoin: round;
    transition: transform 0.3s ease;
  }
  &:hover svg { transform: rotate(10deg) scale(1.1); }
`;

export const LogoutButton = styled.button`
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
    strokeWidth: 2;
    strokeLinecap: round;
    strokeLinejoin: round;
    transition: transform 0.3s ease;
  }
  &:hover svg { transform: translateX(3px); }
`;

export const PremiumCopyButton = styled.button<{ $copied?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 14px 16px 10px;
  margin-top: 1rem;
  background: ${p => p.$copied
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'};
  color: ${p => p.$copied ? '#fff' : 'var(--text-primary)'};
  border: 1px solid ${p => p.$copied ? 'rgba(16,185,129,0.35)' : 'rgba(148,163,184,0.18)'};
  border-radius: 12px;
  cursor: pointer;
  box-shadow: ${p => p.$copied
    ? '0 4px 18px rgba(16,185,129,0.3)'
    : '0 2px 10px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'};
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
  letter-spacing: 0;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 70%);
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-2px);
    border-color: ${p => p.$copied ? 'rgba(16,185,129,0.5)' : 'rgba(148,163,184,0.35)'};
    box-shadow: ${p => p.$copied
      ? '0 8px 24px rgba(16,185,129,0.4)'
      : '0 6px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.09)'};
  }

  &:active {
    transform: translateY(1px) scale(0.98);
  }

  [data-theme='light'] & {
    background: ${p => p.$copied
      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
      : 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)'};
    color: ${p => p.$copied ? '#ffffff' : 'var(--text-primary)'};
    border-color: ${p => p.$copied ? 'rgba(16,185,129,0.35)' : 'var(--border-secondary)'};
    box-shadow: ${p => p.$copied
      ? '0 4px 18px rgba(16,185,129,0.25)'
      : '0 2px 8px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8)'};

    &::after {
      background: ${p => p.$copied
        ? 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.2) 0%, transparent 70%)'
        : 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.8) 0%, transparent 70%)'};
    }

    &:hover {
      background: ${p => p.$copied
        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        : 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)'};
      border-color: ${p => p.$copied ? 'rgba(16,185,129,0.5)' : 'rgba(59, 130, 246, 0.4)'};
      box-shadow: ${p => p.$copied
        ? '0 8px 24px rgba(16,185,129,0.35)'
        : '0 6px 18px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)'};
    }
  }
`;

export const PremiumCopyNumber = styled.span`
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: inherit;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
`;

export const PremiumCopyLabel = styled.span<{ $copied?: boolean }>`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-top: 2px;
  color: ${p => p.$copied ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)'};
  transition: color 0.3s ease;

  [data-theme='light'] & {
    color: ${p => p.$copied ? 'rgba(255,255,255,0.95)' : 'var(--text-secondary)'};
  }

  svg {
    width: 12px;
    height: 12px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
  }
`;

export const BouncingDots = styled.div`
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

export const SoundwaveBars = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 14px;
  padding: 0 1px;

  & > span {
    display: inline-block;
    width: 2.5px;
    height: 14px;
    background-color: var(--accent-indigo, #6366f1);
    border-radius: 2px;
    transform-origin: center bottom;
    animation: ${soundwaveBar} 0.85s ease-in-out infinite alternate;
  }

  & > span:nth-child(1) { animation-delay: 0s; }
  & > span:nth-child(2) { animation-delay: 0.2s; }
  & > span:nth-child(3) { animation-delay: 0.4s; }
  & > span:nth-child(4) { animation-delay: 0.15s; }
`;

export const ActivityIconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-indigo, #6366f1);
  animation: ${activityIconPulse} 1.6s ease-in-out infinite;
  flex-shrink: 0;
  width: 16px;
  height: 16px;

  svg {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    display: block;
  }
`;

export const TypingIndicatorContainer = styled.div`
  min-height: 26px;
  padding: 2px 1rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: ${slideIn} 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  transition: color 0.3s ease, min-height 0.2s ease, opacity 0.2s ease;
  overflow: hidden;

  strong {
    font-weight: 600;
    color: var(--text-primary);
  }

  .typing-part {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .typing-divider {
    opacity: 0.45;
    margin: 0 3px;
    font-weight: 700;
  }
`;

export const ReplyPreviewContainer = styled.div`
  padding: 10px 1rem; border-bottom: 1px solid var(--border-primary); background-color: var(--bg-tertiary); display: flex; align-items: center; gap: 10px; overflow: hidden; transition: background-color 0.3s ease, border-color 0.3s ease;
  cursor: pointer;
  animation: ${replySlideIn} 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
`;

export const ReplyText = styled.div`
  flex-grow: 1; font-size: 0.9rem; color: var(--text-secondary); min-width: 0; overflow: hidden;
  p { font-weight: bold; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  span { opacity: 0.8; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

export const QuotedMessageContainer = styled.div<{ $sender: 'me' | 'other' }>`
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
  touch-action: manipulation;
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

export const QuotedMediaThumb = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.26);
  border: 1px solid rgba(148, 163, 184, 0.35);
  position: relative;

  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

export const LinkPreviewCard = styled.a<{ $sender: 'me' | 'other' }>`
  display: flex;
  flex-direction: row;
  text-decoration: none;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 4px;
  background: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.18)' : 'var(--bg-hover)'};
  border: 1px solid ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.18)' : 'var(--border-primary)'};
  height: 96px;
  width: 26rem;
  max-width: 100%;
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  &:hover { opacity: 0.95; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
  ${props => props.$sender === 'other' && `
    [data-theme='dark'] & { background: #253348; border-color: rgba(255,255,255,0.08); }
  `}
`;

export const LinkPreviewImageWrapper = styled.div`
  width: 96px;
  min-width: 96px;
  position: relative;
  overflow: hidden;
  background: rgba(0,0,0,0.04);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  [data-theme='dark'] & {
    background: rgba(255,255,255,0.04);
  }
`;

export const LinkPreviewImage = styled.img`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
`;

export const LinkPreviewBody = styled.div`
  padding: 6px 8px;
  min-width: 0;
  flex: 1;
  border-left: 1px solid rgba(255,255,255,0.12);

  [data-theme='light'] & {
    border-left-color: rgba(15, 23, 42, 0.09);
  }
`;

export const LinkPreviewSiteName = styled.p<{ $sender: 'me' | 'other' }>`
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

export const LinkPreviewTitle = styled.p<{ $sender: 'me' | 'other' }>`
  margin: 0 0 3px;
  font-size: 0.83rem;
  font-weight: 600;
  color: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.95)' : 'var(--text-primary)'};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

export const LinkPreviewDesc = styled.p<{ $sender: 'me' | 'other' }>`
  margin: 0;
  font-size: 0.76rem;
  color: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)'};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

export const ReactionPicker = styled.div<{ $sender: 'me' | 'other' }>`
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

export const ReactionEmoji = styled.button<{ $isPlusIcon?: boolean }>`
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

export const ReactionsPopupModal = styled.div`
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

export const ReactionsPopupContent = styled.div`
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

export const ReactionsPopupHeader = styled.div`
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

export const ReactionTab = styled.button<{ active: boolean }>`
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

export const ReactionsUserList = styled.div`
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

export const UserAvatar = styled.div`
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

export const ReactionUserRow = styled.div`
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

export const ReactionEmojiSpan = styled.span`
  font-size: 15px;
  margin-right: -2px;
  display: inline-block;
  animation: ${reactionBounceIn} 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  transition: transform 0.15s ease;

  &:nth-child(1) { animation-delay: 0s; }
  &:nth-child(2) { animation-delay: 0.06s; }
  &:nth-child(3) { animation-delay: 0.12s; }
`;

export const ReactionCountSpan = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: 6px;
  display: inline-block;
  animation: ${countBump} 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
  font-variant-numeric: tabular-nums;
`;

export const MessageActions = styled.div`
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
     ANY descendant in the DOM tree - including this div even though it
     visually sits above the bubble.  So there is zero hover gap. */
  ${MessageBubble}:hover & { opacity: 1; pointer-events: all; transform: translateY(0) scale(1); }
  [data-theme='dark'] & {
    box-shadow: 0 2px 10px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06);
  }
`;

export const ActionButton = styled.button`
  background: none; border: none; font-size: 16px; cursor: pointer; padding: 4px; color: var(--text-secondary);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); border-radius: 50%;
  &:hover { color: var(--text-primary); transform: scale(1.15); background: var(--bg-hover); }
  &:active { transform: scale(0.9); }
`;

export const ReactionsPopup = ({
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
                <div style={{ flexGrow: 1 }}>
                  <p style={{ fontWeight: 'bold' }}>{displayName}</p>
                  {userId === currentUserId && (
                    <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Click to remove</span>
                  )}
                </div>
                <span style={{ fontSize: '24px' }}>{emoji}</span>
              </ReactionUserRow>
            )
          })}
        </ReactionsUserList>
      </ReactionsPopupContent>
    </ReactionsPopupModal>
  );
};

export const ConfirmationModal = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000;
  animation: ${reactionsModalFadeIn} 0.2s ease-out forwards;
`;

export const ConfirmationContent = styled.div`
  background: var(--bg-elevated); padding: 2rem; border-radius: 16px; text-align: center; transition: background-color 0.3s ease, color 0.3s ease;
  animation: ${modalSlideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  box-shadow: 0 25px 60px rgba(0,0,0,0.2);
  border: 1px solid var(--border-primary);
  [data-theme='dark'] & { box-shadow: 0 25px 60px rgba(0,0,0,0.5); }
  h3 { margin-bottom: 1rem; color: var(--text-heading); }
  div { display: flex; gap: 1rem; justify-content: center; }
`;

export const ReportModal = styled.div`
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

export const ReportDialog = styled.div`
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

export const ReportTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  color: var(--text-heading);
`;

export const ReportSubtext = styled.p`
  margin: 0;
  font-size: 0.86rem;
  color: var(--text-secondary);
`;

export const ReportMessageMeta = styled.div`
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

export const ReportReasonInput = styled.textarea`
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

export const ReportReasonMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.76rem;
  color: var(--text-muted);
`;

export const ReportError = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: #ef4444;
`;

export const ReportActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
`;
