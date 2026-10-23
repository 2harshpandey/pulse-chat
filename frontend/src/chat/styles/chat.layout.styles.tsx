import styled, { css } from 'styled-components';
import {
  fadeInScale, slideIn, subtleSlideUp, shimmerOverlay, speakerPulse, speakerWave,
  inputFocusGlow, sendPulse, staggerFadeIn, reactionPickerSlideIn,
  quoteJumpHighlight, pulseBorderAnim, floatAnim, selectModeSlideUp
} from './chat.animations';

// --- EMOJI PANEL ---
export const EmojiPickerWrapper = styled.div`
  animation: ${fadeInScale} 0.2s ease-out forwards;
`;

/** WhatsApp-style bottom panel for emoji pickers on mobile.
 *  Sits exactly where the keyboard would be, below the footer. */
export const MobileEmojiPanel = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  max-height: 45dvh;
  animation: ${slideIn} 0.2s ease-out forwards;
  .epr-main {
    width: 100% !important;
    border: none !important;
    border-radius: 0 !important;
  }
`;

// --- DRAG & DROP OVERLAY ---
export const DragDropOverlay = styled.div<{ $isVisible: boolean }>`
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

export const DragDropCard = styled.div`
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

export const DragDropIconWrapper = styled.div`
  color: rgba(147, 210, 255, 0.92);
  animation: ${floatAnim} 3s ease-in-out infinite;
  filter: drop-shadow(0 4px 16px rgba(99, 179, 237, 0.4));
`;

export const DragDropTitle = styled.p`
  font-size: 1.5rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.97);
  letter-spacing: -0.015em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  @media (max-width: 768px) { font-size: 1.25rem; }
`;

export const DragDropSubtitle = styled.p`
  font-size: 0.92rem;
  color: rgba(255, 255, 255, 0.52);
  letter-spacing: 0.02em;
  @media (max-width: 768px) { font-size: 0.82rem; }
`;

// --- APP LAYOUT ---
export const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100svh;
  height: var(--app-height, 100svh);
  max-height: 100svh;
  max-height: var(--app-height, 100svh);
  width: 100%;
  position: absolute;
  top: var(--app-offset-top, 0px);
  left: 0;
  right: 0;
  overflow: hidden;
`;

export const Header = styled.header`
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

export const HeaderTitle = styled.h1`
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
  .hide-on-narrow {
    @media (max-width: 480px) {
      display: none;
    }
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

export const SoundToggleButton = styled.button<{ $enabled: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-secondary);
  background: ${p => p.$enabled
    ? 'rgba(59, 130, 246, 0.1)'
    : 'var(--bg-secondary)'};
  color: ${p => p.$enabled ? 'var(--text-primary)' : 'var(--text-secondary)'};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  border-color: ${p => p.$enabled ? 'rgba(59, 130, 246, 0.5)' : 'var(--border-secondary)'};
  &:hover { 
    transform: scale(1.15); 
    border-color: rgba(59, 130, 246, 0.5); 
    background: rgba(59, 130, 246, 0.1);
    color: var(--text-primary);
    box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4); 
  }
  &:active { transform: scale(0.9); }
  @media (max-width: 768px) { width: 40px; height: 40px; }
`;

export const SoundToggleIcon = styled.svg<{ $enabled: boolean; $animate: boolean }>`
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  .speaker-core {
    animation: ${p => p.$animate ? css`${speakerPulse} 0.7s ease-in-out` : 'none'};
    transform-origin: center;
    opacity: ${p => p.$enabled ? 1 : 0.6};
  }
  .speaker-wave {
    animation: ${p => p.$animate ? css`${speakerWave} 0.7s ease-in-out` : 'none'};
    stroke-dasharray: 14;
    stroke-dashoffset: 0;
    opacity: ${p => p.$enabled ? 1 : 0};
    transition: opacity 0.2s ease;
  }
  .speaker-muted {
    opacity: ${p => p.$enabled ? 0 : 1};
    transition: opacity 0.2s ease;
  }
`;

// --- PINNED BANNER ---
export const PinnedBannerContainer = styled.div`
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  z-index: 40;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;

  &:hover {
    background: var(--bg-hover);
  }
`;

export const PinnedBannerIconWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--accent-blue);
`;

export const PinnedCycleIndicator = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 14px;
  justify-content: center;
`;

export const PinnedCycleSegment = styled.div<{ $active: boolean }>`
  width: 3px;
  flex-grow: 1;
  background-color: ${props => props.$active ? 'var(--accent-blue)' : 'rgba(148, 163, 184, 0.3)'};
  border-radius: 2px;
  transition: background-color 0.2s ease;
`;

export const PinnedBannerContentWrapper = styled.div`
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

export const PinnedBannerLabel = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-blue);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const PinnedBannerText = styled.span`
  font-size: 0.9rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const MessagePinIconWrapper = styled.div<{ $sender?: string }>`
  position: absolute;
  top: -6px;
  right: -6px;
  background: ${props => props.$sender === 'me' ? '#FBBF24' : 'var(--accent-blue)'};
  color: ${props => props.$sender === 'me' ? '#1E3A8A' : 'white'};
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  z-index: 2;
  
  svg {
    width: 10px;
    height: 10px;
  }
`;

// --- CHAT LAYOUT ---
export const LayoutContainer = styled.div`
  display: flex;
  flex-grow: 1;
  overflow: hidden;
`;

export const ChatWindow = styled.main`
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: ${slideIn} 0.5s ease-out forwards;
  -webkit-overflow-scrolling: touch; /* Enable momentum scrolling on iOS */
  touch-action: pan-y; /* Allow vertical panning */
`;

export const MessagesContainer = styled.div<{ $isScrollButtonVisible?: boolean; $isMobileView?: boolean; }>`
  position: relative;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overflow-anchor: auto;
  overscroll-behavior-y: none;
  padding: 0 1rem;
  padding-right: ${props => !props.$isMobileView && props.$isScrollButtonVisible ? '64px' : '1rem'};
  transition: none;
  /* Virtuoso items need gap via item wrapper since Virtuoso manages its own scroll */
  & [data-virtuoso-scroller] {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: auto;
    overflow-anchor: none;
    overscroll-behavior-y: none;
    scroll-behavior: auto !important;
  }
  & [data-test-id="virtuoso-item-list"] {
    overflow-anchor: none;
  }
  & [data-test-id="virtuoso-item-list"] > div {
    padding-top: 0;
    padding-bottom: 0;
  }
`;

/* Wraps MessagesContainer + ScrollToBottomButton so the button is anchored
   to the bottom of the messages area - automatically above whatever the footer contains */
export const MessagesAndScrollWrapper = styled.div`
  flex: 1;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overflow-anchor: none;
`;

export const MessageRow = styled.div<{ $sender: string; $isSelected?: boolean; $isActiveDeleteMenu?: boolean; $isGrouped?: boolean; }>`
  contain: layout style;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  position: relative;
  background-color: ${props => props.$isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent'};
  border-radius: 8px;
  /* Keep row paint deterministic while Virtuoso recycles DOM nodes.
     Animated row-level transitions can look like shaking during fast scroll. */
  transition: none;
  user-select: none;
  touch-action: pan-y; /* Allow vertical scrolling, while manually handling horizontal drag */
  transform: translateZ(0);
  will-change: transform;
  z-index: ${props => props.$isActiveDeleteMenu ? 40 : 'auto'};
  /* Fixed padding prevents layout thrashing during scroll when Virtuoso recycles rows.
     The variable padding-top based on grouping was causing 4px shifts as rows were recycled,
     creating visible jitter during mobile scroll. Use consistent spacing instead. */
  padding-top: 3px;
  padding-bottom: 1px;

  &, & * {
    transition: none !important;
    animation: none !important;
  }

  &.quote-jump-highlight {
    animation: ${quoteJumpHighlight} 1.25s ease-out !important;
  }
`;

export const Username = styled.div<{ $sender: 'me' | 'other' }>`
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  margin-bottom: 4px;
  margin-right: ${props => props.$sender === 'me' ? '8px' : '0'};
  display: inline-block;
  background-color: ${props => props.$sender === 'me' ? '#DBEAFE' : '#F1F5F9'};
  color: ${props => props.$sender === 'me' ? '#1E40AF' : '#475569'};
  text-shadow: none;
  transition: none;

  [data-theme='dark'] & {
    background-color: ${props => props.$sender === 'me' ? 'rgba(59,130,246,0.2)' : 'var(--bg-hover)'};
    color: ${props => props.$sender === 'me' ? '#93c5fd' : 'var(--text-secondary)'};
  }
`;

export const MobileReactionPicker = styled.div<{ $sender: 'me' | 'other' }>`
  position: absolute;
  top: -44px;
  z-index: 30;
  
  .hide-mobile-picker & {
    display: none !important;
  }
  
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

export const MessageBubble = styled.div<{ $sender: string; $messageType: string; $isUploading?: boolean; $uploadError?: boolean; }>`
  position: relative;
  max-width: ${props => props.$messageType === 'text' ? '62%' : props.$messageType === 'file' ? 'min(84vw, 296px)' : 'min(84vw, 356px)'};
    padding: ${props => props.$messageType === 'text' ? '0.24rem 0.48rem 0.12rem' : '0.28rem 0.34rem'};
  border-radius: 0.82rem;
  background-color: ${props => props.$sender === 'me' ? '#3B82F6' : 'var(--bg-message-other)'};
  color: ${props => props.$sender === 'me' ? 'white' : 'var(--text-primary)'};
  box-shadow: ${props => props.$sender === 'me' ? '0 0.5px 1px rgba(0,0,0,0.07)' : '0 0.5px 1px rgba(0,0,0,0.05)'};
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  min-width: ${props => props.$messageType === 'text' ? '4.5rem' : '0'};
    /* Keep message geometry and paint stable while virtualized rows are recycled.
      Animated transitions here can look like shaking/blinking during fast scroll. */
    transition: none;
  border: ${props => props.$sender === 'me' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.08)'};
  will-change: auto;
  align-self: ${props => props.$sender === 'me' ? 'flex-end' : 'flex-start'};
  margin-right: ${props => props.$sender === 'me' ? '8px' : '0'};

  @media (max-width: 768px) {
    max-width: ${props => props.$messageType === 'text' ? '68%' : 'min(76vw, 272px)'};
  }

  @media (max-width: 420px) {
    max-width: ${props => props.$messageType === 'text' ? '72%' : 'min(72vw, 248px)'};
  }

  [data-theme='dark'] & {
    border-color: ${props => props.$sender === 'me' ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.14)'};
  }
`;

/* - Premium Edit Context Banner (shown above the main composer) - */
const editSlideIn = css`
  @keyframes editSlideIn {
    from { opacity: 0; transform: translateY(6px) scaleY(0.92); }
    to   { opacity: 1; transform: translateY(0) scaleY(1); }
  }
`;

export const EditPreviewContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 1rem;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.08) 0%,
    rgba(59, 130, 246, 0.06) 100%
  );
  border-top: 1px solid rgba(99, 102, 241, 0.22);
  border-bottom: 1px solid rgba(99, 102, 241, 0.12);
  animation: editSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  position: relative;
  overflow: hidden;
  ${editSlideIn}

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, #6366f1, #3b82f6);
    border-radius: 0 2px 2px 0;
  }

  [data-theme='dark'] & {
    background: linear-gradient(
      135deg,
      rgba(99, 102, 241, 0.13) 0%,
      rgba(59, 130, 246, 0.09) 100%
    );
    border-top-color: rgba(99, 102, 241, 0.3);
    border-bottom-color: rgba(99, 102, 241, 0.18);
  }
`;

export const EditPreviewIcon = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(59, 130, 246, 0.14));
  border: 1px solid rgba(99, 102, 241, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #6366f1;

  [data-theme='dark'] & {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(59, 130, 246, 0.2));
    border-color: rgba(99, 102, 241, 0.4);
    color: #818cf8;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

export const EditPreviewText = styled.div`
  flex: 1;
  min-width: 0;
  overflow: hidden;

  p {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #6366f1;
    margin: 0 0 2px;

    [data-theme='dark'] & {
      color: #818cf8;
    }
  }

  span {
    font-size: 0.88rem;
    color: var(--text-secondary);
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.85;
  }
`;

export const EditPreviewDismiss = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(99, 102, 241, 0.1);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 1.1rem;
  line-height: 1;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

  &:hover {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    transform: scale(1.12) rotate(90deg);
  }

  &:active {
    transform: scale(0.9);
  }

  [data-theme='dark'] & {
    background: rgba(99, 102, 241, 0.15);
    &:hover {
      background: rgba(239, 68, 68, 0.18);
    }
  }
`;

export const FooterContainer = styled.div<{ $sender: 'me' | 'other' }>`
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

export const Timestamp = styled.div<{ $sender: string }>`
  font-size: 0.72rem;
  margin-top: 0;
  text-align: right;
  white-space: nowrap;
  color: ${props => props.$sender === 'me' ? '#bfdbfe' : 'var(--text-muted)'};
  user-select: none;
  transition: none;
`;

export const Footer = styled.footer`
  background-color: var(--bg-header);
  border-top: 1px solid var(--border-primary);
  flex-shrink: 0;
  z-index: 10;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  transition: background-color 0.3s ease, border-color 0.3s ease;
  animation: ${subtleSlideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
`;

export const InputContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  transition: all 0.3s ease;
`;

const plusMenuSlideInKf = css`
  @keyframes plusMenuSlideIn {
    from { opacity: 0; transform: translateY(8px) scale(0.92); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
`;

export const PlusMenuButton = styled.button<{ $isOpen?: boolean }>`
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
    strokeWidth: 2;
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

export const PlusMenu = styled.div<{ $isVisible: boolean }>`
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
  animation: plusMenuSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  z-index: 20;
  transition: background-color 0.3s ease;
  ${plusMenuSlideInKf}

  [data-theme='dark'] & {
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
  }
`;

export const PlusMenuItem = styled.button`
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

export const MessageInput = styled.textarea<{ $hasUrl?: boolean }>`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-secondary);
  border-radius: 0.75rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  field-sizing: content;
  font-family: inherit;
  font-size: 1rem;
  line-height: 24px;
  letter-spacing: inherit;
  font-weight: inherit;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  box-sizing: border-box;
  resize: none;
  max-height: 120px;
  overflow-y: hidden;
  scrollbar-gutter: stable;
  touch-action: manipulation;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  background: ${p => p.$hasUrl ? 'transparent' : 'var(--bg-input)'};
  color: ${p => p.$hasUrl ? 'transparent' : 'var(--text-primary)'};
  caret-color: var(--text-primary);
  position: relative;
  z-index: 1;
  &::selection {
    color: ${p => p.$hasUrl ? 'transparent' : 'var(--text-primary)'} !important;
    background: rgba(50, 150, 255, 0.4);
  }
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

export const InputTextWrapper = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
`;

export const InputHighlightOverlay = styled.div`
  position: absolute;
  top: 1px;
  left: 1px;
  right: 1px;
  bottom: 1px;
  padding: 0.75rem;
  font-family: inherit;
  font-size: 1rem;
  line-height: 24px;
  letter-spacing: inherit;
  font-weight: inherit;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  color: var(--text-primary);
  border-radius: calc(0.75rem - 1px);
  background: var(--bg-input);
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  max-height: 120px;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 0;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: transparent; }
`;

export const CharacterCounter = styled.span<{ $warning: boolean }>`
  position: absolute;
  bottom: 4px;
  right: 52px;
  font-size: 0.7rem;
  color: ${props => props.$warning ? '#dc2626' : '#94a3b8'};
  pointer-events: none;
  user-select: none;
  line-height: 1;
`;

export const SendButton = styled.button`
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

// --- SELECT MODE ---
export const SelectModeFooter = styled.div`
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

export const DeleteButton = styled(SendButton)`
  background-color: #EF4444;
  &:hover:not(:disabled) { background-color: #DC2626; box-shadow: 0 4px 16px rgba(239, 68, 68, 0.35); }
`;

export const CopyButton = styled(SendButton)`
  background-color: #64748B;
  &:hover:not(:disabled) { background-color: #475569; box-shadow: 0 4px 16px rgba(100, 116, 139, 0.35); }
`;

export const EditButton = styled(SendButton)`
  background-color: #FBBF24;
  &:hover:not(:disabled) { background-color: #F59E0B; box-shadow: 0 4px 16px rgba(251, 191, 36, 0.35); }
`;

export const ReportButton = styled(SendButton)`
  background-color: #F97316;
  &:hover:not(:disabled) { background-color: #EA580C; box-shadow: 0 4px 16px rgba(249, 115, 22, 0.35); }
`;

export const DownloadAllButton = styled(SendButton)`
  background-color: #3B82F6;
  &:hover:not(:disabled) { background-color: #2563EB; box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35); }
`;

export const SelectCheckboxContainer = styled.div`
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
`;

export const Checkbox = styled.div<{ checked: boolean }>`
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
    content: '\\2713';
    color: white;
    font-size: 14px;
    font-weight: bold;
    display: ${props => props.checked ? 'block' : 'none'};
    ${props => props.checked && css`animation: ${staggerFadeIn} 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;`}
  }
`;
