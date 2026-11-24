import React from 'react';
import styled, { keyframes } from 'styled-components';

const cardEnter = keyframes`
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const statusPulse = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 0.9;
  }
  50% {
    transform: scale(1.25);
    opacity: 0.45;
  }
`;

const gentleFloat = keyframes`
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-3px);
  }
`;

const OverlayBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 950;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(248, 250, 252, 0.84);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);

  [data-theme='dark'] & {
    background: rgba(9, 13, 22, 0.86);
  }
`;

const Card = styled.div`
  width: min(100%, 400px);
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 20px;
  padding: 2rem 1.75rem 1.75rem;
  box-shadow: var(--shadow-modal);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: ${cardEnter} 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;

  @media (max-width: 480px) {
    padding: 1.75rem 1.35rem 1.5rem;
    border-radius: 18px;
  }
`;

const IconContainer = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
  color: var(--accent-blue);
`;

const FloatingSvg = styled.svg`
  width: 32px;
  height: 32px;
  animation: ${gentleFloat} 3.6s ease-in-out infinite;
`;

const ActiveDot = styled.span`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-blue);

  &::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 1.5px solid var(--accent-blue);
    animation: ${statusPulse} 2.2s ease-in-out infinite;
  }
`;

const Title = styled.h2`
  margin: 0 0 0.5rem 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-heading);
`;

const Description = styled.p`
  margin: 0 0 1.5rem 0;
  font-size: 0.89rem;
  line-height: 1.5;
  color: var(--text-secondary);
`;

const ActionsRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
`;

const PrimaryButton = styled.button`
  width: 100%;
  padding: 0.72rem 1.25rem;
  border-radius: 12px;
  border: none;
  background: var(--accent-blue);
  color: #ffffff;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.25);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;

  &:hover {
    background: var(--accent-blue-hover);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.32);
  }

  &:active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 2px solid var(--border-focus);
    outline-offset: 2px;
  }
`;

const SecondaryLink = styled.a`
  width: 100%;
  padding: 0.58rem 1rem;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-subtle);
  }
`;

export interface OtherTabOverlayProps {
  isOpen: boolean;
  onUseHere: () => void;
}

export const OtherTabOverlay: React.FC<OtherTabOverlayProps> = ({ isOpen, onUseHere }) => {
  if (!isOpen) return null;

  return (
    <OverlayBackdrop role="dialog" aria-modal="true" aria-labelledby="other-tab-title">
      <Card>
        <IconContainer aria-hidden="true">
          <FloatingSvg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="7" width="14" height="13" rx="2.5" />
            <path d="M7 10h14" />
            <path d="M17 7V5.5A2.5 2.5 0 0 0 14.5 3h-9A2.5 2.5 0 0 0 3 5.5v9A2.5 2.5 0 0 0 5.5 17H7" />
          </FloatingSvg>
          <ActiveDot />
        </IconContainer>

        <Title id="other-tab-title">Pulse Chat is open in another tab</Title>
        <Description>
          This chat session can only stay active in one tab or window at a time to keep your messages and live connection in sync.
        </Description>

        <ActionsRow>
          <PrimaryButton type="button" onClick={onUseHere}>
            Use Here
          </PrimaryButton>
          <SecondaryLink href="/">
            Return Home
          </SecondaryLink>
        </ActionsRow>
      </Card>
    </OverlayBackdrop>
  );
};
