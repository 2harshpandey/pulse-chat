import styled, { css } from 'styled-components';
import {
  subtleSlideUp,
  mediaLoadPulse,
  filePreviewEnter,
  fadeInScale,
  reactionPillPop,
  lightboxControlReveal,
  replySlideIn
} from './chat.animations';

export const FileAttachmentCard = styled.div`
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
  width: 100%;
  box-sizing: border-box;
  max-width: 320px;
  animation: ${subtleSlideUp} 0.3s ease-out forwards;
  &:hover { 
    background: rgba(0,0,0,0.13); 
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }
  &:active { transform: scale(0.98); }
  svg { flex-shrink: 0; transition: transform 0.2s ease; }
  &:hover svg { transform: scale(1.05); }
`;

export const FileAttachmentMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
`;

export const FileAttachmentName = styled.span`
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.2;
  word-break: break-all;
  opacity: 0.9;
`;

export const FileAttachmentDetails = styled.span`
  font-size: 0.69rem;
  font-weight: 500;
  letter-spacing: 0.03em;
  opacity: 0.72;
  text-transform: uppercase;
`;

export const MediaContent = styled.div`
  user-select: none;
  p { 
    margin-bottom: 0.5rem; 
    padding: 0 0.2rem;
  }
  p + div, p + img, p + video { margin-top: 0.5rem; }
`;

const mediaFrameStyles = css`
  position: relative;
  display: block;
  width: clamp(208px, 58vw, 320px);
  min-height: clamp(208px, 58vw, 320px);
  max-width: 100%;
  flex: 0 0 auto;
  aspect-ratio: 1 / 1;
  border-radius: 0.75rem;
  overflow: hidden;

  @media (max-width: 768px) {
    width: clamp(192px, 70vw, 260px);
    min-height: clamp(192px, 70vw, 260px);
  }

  @media (max-width: 420px) {
    width: clamp(176px, 72vw, 236px);
    min-height: clamp(176px, 72vw, 236px);
  }
`;

/* Absolutely-positioned download button that appears over images and videos */
export const MediaDownloadOverlayBtn = styled.button`
  position: absolute;
  top: 8px;
  left: 8px;
  width: 36px;
  height: 36px;
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
  opacity: 1;
  transition: background 0.15s;
  z-index: 4;
  svg { width: 15px; height: 15px; }
  &:hover { background: rgba(0, 0, 0, 0.72); }
  &:disabled { cursor: default; }
  @media (max-width: 768px) { width: 32px; height: 32px; }
`;

/* Uniform frame wrapper for media objects to prevent scroll glitches during lazy load */
export const MediaImageWrapper = styled.div`
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
`;

/* Wrapper div for video player + top-left download overlay. */
export const MediaVideoWrapperDiv = styled.div`
  ${mediaFrameStyles}
  background: #000;

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    background: #000;
    border-radius: 0.75rem;
  }
`;

export const MediaLoadGate = styled.button<{ $isLoading: boolean, $isUploadGate?: boolean }>`
  position: absolute;
  inset: 0;
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
  color: #f8fafc;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  overflow: hidden;
  isolation: isolate;
  z-index: 2;
  transition: transform 0.18s ease, filter 0.18s ease;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: ${p => p.$isUploadGate ? 'none' : (p.$isLoading
    ? 'radial-gradient(circle at 24% 20%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 48%), linear-gradient(162deg, rgba(2, 6, 23, 0.38), rgba(15, 23, 42, 0.22))'
    : 'radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 45%), linear-gradient(160deg, rgba(15, 23, 42, 0.82), rgba(30, 41, 59, 0.74))')};
    transition: background 0.22s ease;
  }

  & > * {
    position: relative;
    z-index: 1;
  }

  &:hover {
    transform: scale(1.012);
    filter: brightness(${p => p.$isLoading ? 1.04 : 1.08});
  }

  &:active {
    transform: scale(0.985);
  }
`;

export const MediaLoadIcon = styled.span`
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

export const MediaLoadLabel = styled.span`
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  opacity: 0.95;
  text-align: center;
  padding: 0 0.35rem;
`;

export const MediaLoadPreview = styled.img<{ $isLoading: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 0.75rem;
  pointer-events: none;
  user-select: none;
  opacity: ${p => p.$isLoading ? 0.92 : 0.66};
  transform: scale(${p => p.$isLoading ? 1.02 : 1});
  filter: ${p => p.$isLoading ? 'saturate(1.08) contrast(1.03)' : 'saturate(0.92) brightness(0.74)'};
  transition: opacity 0.24s ease, transform 0.24s ease, filter 0.24s ease;
  z-index: 1;
`;

export const MediaSizeBadge = styled.span`
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 4;
  pointer-events: none;
  padding: 0.22rem 0.52rem;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: rgba(248, 250, 252, 0.95);
  background: rgba(15, 23, 42, 0.58);
  border: 1px solid rgba(148, 163, 184, 0.42);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  box-shadow: 0 6px 18px rgba(2, 6, 23, 0.25);

  @media (max-width: 768px) {
    font-size: 0.62rem;
    padding: 0.2rem 0.48rem;
  }
`;

/* Small inline download button for videos and file cards */
export const InlineDownloadBtn = styled.button`
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

/* - WhatsApp-style File Preview Modal - */
export const FilePreviewModal = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: #1b2430;
  color: white;
  animation: ${filePreviewEnter} 0.3s ease-out forwards;
`;

export const FilePreviewModalHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  background: rgba(0,0,0,0.25);
  flex-shrink: 0;
`;

export const FilePreviewModalClose = styled.button`
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

export const FilePreviewModalFilename = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 0.92rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
`;

export const FilePreviewModalBody = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 20px;
  min-height: 0;
  animation: ${fadeInScale} 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
`;

export const FilePreviewModalFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(0,0,0,0.25);
  flex-shrink: 0;
`;

export const FilePreviewThumbStrip = styled.div`
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

export const FilePreviewThumb = styled.button<{ $active?: boolean }>`
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

export const FilePreviewAddBtn = styled.button`
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

export const FilePreviewRemoveBtn = styled.button`
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

export const FilePreviewCaptionInput = styled.input`
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

export const FilePreviewSendBtn = styled.button`
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

export const FilePreviewNoPreview = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  background: rgba(0,0,0,0.2);
  border-radius: 16px;
  svg { width: 72px; height: 72px; stroke: rgba(255,255,255,0.35); strokeWidth: 1.2; }
  p { font-size: 1rem; opacity: 0.6; }
  span { font-size: 0.82rem; opacity: 0.4; text-transform: uppercase; }
`;

export const ConfirmationButton = styled.button`
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

export const ReactionsContainer = styled.div<{ $sender: 'me' | 'other' }>`
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

export const Lightbox = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  animation: ${fadeInScale} 0.22s ease-out forwards;
`;

export const LightboxCloseButton = styled.button`
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 14px);
  left: calc(env(safe-area-inset-left, 0px) + 14px);
  width: 44px;
  height: 44px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 999px;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.76));
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1002;
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5), 0 0 0 1px rgba(148, 163, 184, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: ${lightboxControlReveal} 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;

  &:hover {
    transform: translateY(-1px) scale(1.04);
    box-shadow: 0 14px 28px rgba(2, 6, 23, 0.58), 0 0 0 1px rgba(186, 230, 253, 0.34);
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.82));
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    strokeWidth: 2.4;
    strokeLinecap: round;
    strokeLinejoin: round;
  }

  @media (max-width: 768px) {
    width: 40px;
    height: 40px;
    top: calc(env(safe-area-inset-top, 0px) + 10px);
    left: calc(env(safe-area-inset-left, 0px) + 10px);
  }
`;

export const LightboxFrame = styled.div<{ $isZoomed?: boolean }>`
  position: relative;
  width: min(92vw, 1280px);
  height: min(90dvh, 920px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.44);
  box-shadow: 0 28px 90px rgba(2, 6, 23, 0.6);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;

  @media (max-width: 768px) {
    width: 100%;
    height: 100%;
    border-radius: 12px;
  }
`;

export const LightboxImage = styled.img<{ $isZoomed: boolean; $isInteracting: boolean }>`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center center;
  will-change: transform;
  transition: ${props => props.$isInteracting ? 'none' : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)'};
  cursor: ${props => props.$isZoomed ? 'move' : 'default'};
`;

export const LightboxToolbar = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.74);
  border: 1px solid rgba(148, 163, 184, 0.35);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);

  @media (max-width: 1024px), (pointer: coarse), (any-pointer: coarse) {
    display: none;
  }
`;

export const LightboxZoomButton = styled.button`
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(226, 232, 240, 0.14);
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.16s ease, background-color 0.16s ease, opacity 0.16s ease;

  &:hover {
    background: rgba(226, 232, 240, 0.26);
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    transform: none;
  }

  svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    strokeWidth: 2.2;
    strokeLinecap: round;
    strokeLinejoin: round;
  }
`;

export const DeleteMenu = styled.div`
  background: var(--bg-elevated); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); overflow: hidden; border: 1px solid var(--border-primary); pointer-events: all; transition: background-color 0.3s ease;
  animation: ${fadeInScale} 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  min-width: 160px;
  [data-theme='dark'] & { box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
`;

export const DeleteMenuItem = styled.button`
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

export const FilePreviewContainer = styled.div`
  padding: 10px 1rem; border-top: 1px solid var(--border-primary); display: flex; align-items: center; gap: 10px; background-color: var(--bg-tertiary); transition: background-color 0.3s ease, border-color 0.3s ease;
  animation: ${replySlideIn} 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
`;

export const FilePreviewImage = styled.img`
  width: 50px; height: 50px; border-radius: 8px; object-fit: cover;
`;

export const FilePreviewInfo = styled.div`
  flex-grow: 1; font-size: 0.9rem; color: var(--text-secondary);
`;

export const CancelPreviewButton = styled.button`
  background: var(--bg-hover); border-radius: 50%; border: none; width: 30px; height: 30px; min-width: 30px; min-height: 30px; flex-shrink: 0; cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; color: var(--text-primary);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { background-color: var(--border-primary); transform: scale(1.1) rotate(90deg); }
  &:active { transform: scale(0.9); }
`;

/* ══════════════════════════════════════════
   WhatsApp / Telegram Media Group (Album) Grid
   ══════════════════════════════════════════ */
export const MediaGroupGrid = styled.div<{ $count: number }>`
  display: grid;
  gap: 3px;
  width: clamp(230px, 68vw, 320px);
  border-radius: 0.75rem;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.08);
  user-select: none;

  ${props => {
    if (props.$count === 2) {
      return css`
        grid-template-columns: 1fr 1fr;
        aspect-ratio: 16 / 10;
      `;
    }
    if (props.$count === 3) {
      return css`
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        aspect-ratio: 1 / 1;
        & > :first-child {
          grid-row: span 2;
        }
      `;
    }
    // 4 or more
    return css`
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      aspect-ratio: 1 / 1;
    `;
  }}

  @media (max-width: 768px) {
    width: clamp(210px, 72vw, 280px);
  }

  @media (max-width: 420px) {
    width: clamp(190px, 75vw, 250px);
  }
`;

export const MediaGroupTile = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.15);

  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:hover img, &:hover video {
    transform: scale(1.04);
  }
`;

export const MediaGroupOverflowOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  transition: background 0.2s ease;
  z-index: 2;

  &:hover {
    background: rgba(0, 0, 0, 0.68);
  }
`;

export const MediaPlayBadge = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 1;

  svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
    margin-left: 2px;
  }
`;

export const MediaVideoCornerTag = styled.div`
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #ffffff;
  pointer-events: none;
  z-index: 1;

  svg {
    width: 11px;
    height: 11px;
    fill: currentColor;
  }
`;

/* ══════════════════════════════════════════
   Fullscreen Media Gallery Modal
   ══════════════════════════════════════════ */
export const MediaGalleryOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ${fadeInScale} 0.22s ease-out forwards;
  user-select: none;
`;

export const MediaGalleryHeader = styled.div`
  height: 56px;
  padding: 0 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  z-index: 10;
  background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%);
`;

export const MediaGalleryInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #ffffff;
`;

export const MediaGalleryCounter = styled.span`
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(8px);
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.825rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  border: 1px solid rgba(255, 255, 255, 0.15);
`;

export const MediaGalleryMeta = styled.span`
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
  @media (max-width: 480px) {
    display: none;
  }
`;

export const MediaGalleryActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const MediaGalleryActionBtn = styled.button`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.24);
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
    stroke-width: 2.2;
    fill: none;
  }
`;

export const MediaGalleryViewport = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  overflow: hidden;
  padding: 0 1rem;
`;

export const MediaGalleryNavBtn = styled.button<{ $direction: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  ${props => props.$direction === 'left' ? 'left: 20px;' : 'right: 20px;'}
  transform: translateY(-50%);
  z-index: 10;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    background: rgba(255, 255, 255, 0.28);
    transform: translateY(-50%) scale(1.1);
  }
  &:active {
    transform: translateY(-50%) scale(0.95);
  }

  svg {
    width: 22px;
    height: 22px;
    stroke: currentColor;
    stroke-width: 2.4;
    fill: none;
  }

  /* User requirement: "on non touch devices only those buttons should show" */
  @media (hover: none) and (pointer: coarse) {
    display: none;
  }
`;

export const MediaGallerySlide = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: pan-y;

  img {
    max-width: 90vw;
    max-height: 72vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    outline: none;
  }

  @media (max-width: 768px) {
    img {
      max-width: 96vw;
      max-height: 70vh;
    }
  }
`;

export const MediaGalleryVideoWrapper = styled.div`
  position: relative;
  width: min(90vw, 1000px);
  height: min(72vh, 600px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  background: #000;

  @media (max-width: 768px) {
    width: 96vw;
    height: min(70vh, 520px);
  }
`;

export const MediaGalleryBottom = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 1rem 16px;
  background: linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%);
  flex-shrink: 0;
  z-index: 10;
`;

export const MediaGalleryCaption = styled.div`
  max-width: 640px;
  text-align: center;
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.9rem;
  line-height: 1.4;
  padding: 4px 14px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  word-break: break-word;
`;

export const MediaGalleryThumbsRow = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  max-width: 92vw;
  padding: 4px;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

export const MediaGalleryThumb = styled.div<{ $active: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition: all 0.2s ease;
  border: 2px solid ${props => props.$active ? '#3b82f6' : 'transparent'};
  opacity: ${props => props.$active ? 1 : 0.5};
  transform: ${props => props.$active ? 'scale(1.08)' : 'scale(1)'};
  box-shadow: ${props => props.$active ? '0 0 12px rgba(59, 130, 246, 0.6)' : 'none'};

  &:hover {
    opacity: 0.9;
  }

  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;
