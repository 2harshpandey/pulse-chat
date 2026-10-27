import { createGlobalStyle, keyframes } from 'styled-components';

// --- GLOBAL STYLES ---
export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100svh; height: var(--app-height, 100svh); max-height: 100svh; max-height: var(--app-height, 100svh); width: 100%; overflow: hidden; overscroll-behavior: none; position: fixed; inset: 0; background-color: var(--bg-primary); }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: var(--bg-primary); color: var(--text-primary); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; transition: background-color 0.3s ease, color 0.3s ease; }
  * { -webkit-tap-highlight-color: transparent; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
  body.is-scrolling ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
`;

// --- KEYFRAMES ---

export const slideIn = keyframes`
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

export const fadeInScale = keyframes`
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
`;

export const lightboxControlReveal = keyframes`
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.86);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

/* - Premium Reaction Animations - */
export const reactionBounceIn = keyframes`
  0%   { transform: scale(0); opacity: 0; }
  50%  { transform: scale(1.3); opacity: 1; }
  70%  { transform: scale(0.9); }
  85%  { transform: scale(1.06); }
  100% { transform: scale(1); }
`;

export const reactionPillPop = keyframes`
  0%   { transform: scale(0.3) translateY(8px); opacity: 0; }
  60%  { transform: scale(1.08) translateY(-2px); opacity: 1; }
  80%  { transform: scale(0.97) translateY(1px); }
  100% { transform: scale(1) translateY(0); }
`;

export const staggerFadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px) scale(0.8); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

export const mediaLoadPulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.92; }
  50% { transform: scale(1.06); opacity: 1; }
`;

export const emojiPopTap = keyframes`
  0%   { transform: scale(1); }
  40%  { transform: scale(0.75); }
  70%  { transform: scale(1.25); }
  100% { transform: scale(1); }
`;

export const reactionPickerSlideIn = keyframes`
  0%   { opacity: 0; transform: scale(0.8) translateY(10px); }
  60%  { opacity: 1; transform: scale(1.03) translateY(-2px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
`;

export const countBump = keyframes`
  0%   { transform: scale(1); }
  50%  { transform: scale(1.35); color: var(--accent-blue); }
  100% { transform: scale(1); }
`;

export const quoteJumpHighlight = keyframes`
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

/* - Site-Wide Premium Animations - */
export const subtleSlideUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const inputFocusGlow = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
  50%  { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12); }
  100% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
`;

export const modalSlideUp = keyframes`
  0%   { opacity: 0; transform: translateY(30px) scale(0.95); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

export const gifItemReveal = keyframes`
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
`;

export const replySlideIn = keyframes`
  from { opacity: 0; transform: translateY(8px) scaleY(0.9); }
  to   { opacity: 1; transform: translateY(0) scaleY(1); }
`;

export const selectModeSlideUp = keyframes`
  from { opacity: 0; transform: translateY(100%); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const shimmerOverlay = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

export const speakerPulse = keyframes`
  0% { transform: scale(0.92); opacity: 0.45; }
  50% { transform: scale(1); opacity: 0.9; }
  100% { transform: scale(0.92); opacity: 0.45; }
`;

export const speakerWave = keyframes`
  0% { stroke-dashoffset: 16; opacity: 0.25; }
  60% { opacity: 0.9; }
  100% { stroke-dashoffset: 0; opacity: 0.25; }
`;

export const sendPulse = keyframes`
  0%   { transform: scale(1); }
  50%  { transform: scale(0.88); }
  100% { transform: scale(1); }
`;

export const systemMsgFade = keyframes`
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
`;

export const filePreviewEnter = keyframes`
  from { opacity: 0; backdrop-filter: blur(0px); }
  to   { opacity: 1; backdrop-filter: blur(24px); }
`;

export const sidebarItemSlide = keyframes`
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0); }
`;

export const scrollBtnBounce = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
`;

export const newMessageBadgeGlow = keyframes`
  0%, 100% { box-shadow: 0 3px 10px rgba(37, 99, 235, 0.35); }
  50%      { box-shadow: 0 5px 14px rgba(14, 165, 233, 0.48); }
`;

export const pulseBorderAnim = keyframes`
  0%, 100% { border-color: rgba(99, 179, 237, 0.5); box-shadow: 0 0 0 0 rgba(99, 179, 237, 0); }
  50% { border-color: rgba(147, 210, 255, 0.95); box-shadow: 0 0 28px 6px rgba(99, 179, 237, 0.18); }
`;

export const floatAnim = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
`;

export const reactionsModalFadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const reactionsContentSlideUp = keyframes`
  0%   { opacity: 0; transform: translateY(30px) scale(0.95); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

export const userRowFadeIn = keyframes`
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0); }
`;

export const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1.0); }
`;

export const videoFadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const controlsSlideUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const recordingBlink = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.85); }
`;

export const recordingBarSlideIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const micButtonPop = keyframes`
  0% { transform: scale(0.65) rotate(-24deg); opacity: 0; }
  60% { transform: scale(1.12) rotate(4deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
`;

export const speedBounce = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.22); }
  100% { transform: scale(1); }
`;

export const soundwaveBar = keyframes`
  0% { transform: scaleY(0.25); opacity: 0.45; }
  50% { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(0.35); opacity: 0.6; }
`;

export const activityIconPulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.12); opacity: 1; }
`;

