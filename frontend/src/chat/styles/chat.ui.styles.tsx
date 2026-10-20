import styled from 'styled-components';
import {
  systemMsgFade,
  scrollBtnBounce,
  newMessageBadgeGlow,
  modalSlideUp
} from './chat.animations';

export const MessageText = styled.p`
  user-select: text; /* Allow selection on PC */
  white-space: pre-wrap;
  word-wrap: break-word;
  cursor: text;
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.35;
  .emoji-standalone {
    display: inline-block;
    font-size: 1.8rem;
    line-height: 1.15;
    letter-spacing: 0.02em;
    vertical-align: -0.1em;
  }
  .emoji-inline {
    display: inline-block;
    font-size: 1.32em;
    vertical-align: -0.1em;
  }
  @media (max-width: 768px) {
    user-select: none; /* Disable selection on mobile */
    font-size: 0.9rem;
    .emoji-standalone {
      font-size: 1.5rem;
      line-height: 1.2;
    }
    .emoji-inline {
      font-size: 1.32em;
    }
  }
`;

export const SystemMessage = styled.div`
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

export const ScrollToBottomButton = styled.button<{ $isVisible: boolean }>`
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
  touch-action: manipulation;
  user-select: none;
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease;
  opacity: ${props => props.$isVisible ? 1 : 0};
  transform: ${props => props.$isVisible ? 'scale(1)' : 'scale(0.5)'};
  pointer-events: ${props => props.$isVisible ? 'auto' : 'none'};
  z-index: 20;

  svg {
    width: 24px;
    height: 24px;
    stroke: var(--text-secondary);
    strokeWidth: 2.5;
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

export const NewMessagesBadge = styled.span<{ $isVisible: boolean }>`
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

export const DiscardDialog = styled.div`
  width: min(90vw, 380px);
  background: var(--bg-elevated);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: ${modalSlideUp} 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.08);
  border: 1px solid var(--border-primary);
  [data-theme='dark'] & {
    box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.25);
  }
`;

export const DiscardTitle = styled.h3`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-heading);
  text-align: center;
`;

export const DiscardActions = styled.div`
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
`;

export const DiscardBtnCancel = styled.button`
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-secondary);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 24px;
  border-radius: 12px;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { background: var(--bg-hover); transform: translateY(-1px); }
  &:active { transform: scale(0.96); }
`;

export const DiscardBtnConfirm = styled.button`
  background: linear-gradient(135deg, #EF4444, #DC2626);
  color: white;
  border: none;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(239, 68, 68, 0.35); filter: brightness(1.1); }
  &:active { transform: scale(0.96); }
`;
