import styled, { css, keyframes } from 'styled-components';
import { speedBounce } from './chat.animations';

const audioShake = keyframes`
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
`;

export const PlayerContainer = styled.div<{ $sender: 'me' | 'other' }>`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 250px;
  max-width: 340px;
  padding: 6px 2px 2px 2px;
  user-select: none;

  @media (max-width: 480px) {
    min-width: 0;
    max-width: 100%;
    width: 100%;
  }
`;

export const AudioPlayerCard = styled.div<{ $sender: 'me' | 'other'; $hasCaption?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  transition: all 0.2s ease;

  ${p => p.$hasCaption ? `
    padding: 10px 12px;
    border-radius: 14px;
    background: ${p.$sender === 'me'
      ? 'rgba(0, 0, 0, 0.14)'
      : 'rgba(255, 255, 255, 0.05)'};
    border: 1px solid ${p.$sender === 'me'
      ? 'rgba(255, 255, 255, 0.18)'
      : 'rgba(148, 163, 184, 0.18)'};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

    [data-theme='light'] & {
      background: ${p.$sender === 'me'
        ? 'rgba(255, 255, 255, 0.16)'
        : 'rgba(0, 0, 0, 0.035)'};
      border: 1px solid ${p.$sender === 'me'
        ? 'rgba(255, 255, 255, 0.28)'
        : 'rgba(0, 0, 0, 0.08)'};
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    }
  ` : `
    padding: 2px 0;
  `}
`;

export const AudioCaptionContainer = styled.div<{ $sender: 'me' | 'other' }>`
  width: 100%;
  margin-top: 8px;
  padding: 8px 8px 2px 8px;
  border-top: 1px solid ${p => p.$sender === 'me'
    ? 'rgba(255, 255, 255, 0.24)'
    : 'rgba(148, 163, 184, 0.22)'};
  word-break: break-word;

  [data-theme='light'] & {
    border-top: 1px solid ${p => p.$sender === 'me'
      ? 'rgba(255, 255, 255, 0.32)'
      : 'rgba(0, 0, 0, 0.08)'};
  }

  p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.45;
  }
`;

export const PlayPauseButton = styled.button<{
  $sender: 'me' | 'other';
  $isPlaying: boolean;
  $hasError?: boolean;
  $isShaking?: boolean;
}>`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: ${p => p.$hasError ? 'not-allowed' : 'pointer'};
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  outline: none;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);

  ${p => p.$isShaking && css`
    animation: ${audioShake} 0.4s ease-in-out;
  `}

  ${p => p.$hasError && css`
    opacity: 0.9;
    svg {
      color: #ef4444 !important;
      stroke: #ef4444 !important;
    }
    &:hover {
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
    }
  `}

  &[data-sender='me'] {
    background: rgba(255, 255, 255, 0.95);
    color: #1e293b;
  }

  &[data-sender='other'] {
    background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
    color: #ffffff;
  }

  [data-theme='light'] &[data-sender='me'] {
    background: rgba(255, 255, 255, 0.95);
    color: #0f172a;
  }

  [data-theme='light'] &[data-sender='other'] {
    background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
    color: #ffffff;
  }

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.38);
  }

  &:active {
    transform: scale(0.92);
  }

  svg {
    width: 20px;
    height: 20px;
    margin-left: ${p => p.$isPlaying || p.$hasError ? '0' : '2px'};
  }
`;

export const WaveformWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 6px;
`;

export const UnavailableTrack = styled.div<{ $sender: 'me' | 'other' }>`
  display: flex;
  align-items: center;
  height: 30px;
  width: 100%;
  padding: 2px 0;
  user-select: none;
`;

export const UnavailableBadge = styled.div<{ $sender: 'me' | 'other' }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;

  &[data-sender='me'] {
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.26);
    color: #fecaca;
    svg { stroke: #fca5a5; }
  }

  &[data-sender='other'] {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.28);
    color: #f87171;
    svg { stroke: #ef4444; }
  }

  [data-theme='light'] &[data-sender='other'] {
    background: rgba(254, 242, 242, 0.94);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #b91c1c;
    svg { stroke: #dc2626; }
  }

  svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }
`;

export const WaveformBarsContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2.5px;
  height: 30px;
  width: 100%;
  cursor: pointer;
  padding: 4px 0;
  touch-action: pan-y;
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
    border-radius: 6px;
  }
`;

export const WaveformBar = styled.div<{ $isPlayed: boolean; $sender: 'me' | 'other'; $heightPct: number }>`
  flex: 1;
  min-width: 2px;
  max-width: 4.5px;
  height: ${p => Math.max(12, Math.round(p.$heightPct * 100))}%;
  border-radius: 9999px;
  transition: height 0.15s ease, background-color 0.15s ease, transform 0.12s ease;

  &:hover {
    transform: scaleY(1.15);
  }

  &[data-sender='me'] {
    background-color: rgba(255, 255, 255, 0.42);
  }
  &[data-sender='me'][data-played='true'] {
    background-color: #ffffff;
  }
  [data-theme='light'] &[data-sender='me'] {
    background-color: rgba(255, 255, 255, 0.42);
  }
  [data-theme='light'] &[data-sender='me'][data-played='true'] {
    background-color: #ffffff;
  }

  &[data-sender='other'] {
    background-color: rgba(148, 163, 184, 0.38);
  }
  &[data-sender='other'][data-played='true'] {
    background-color: #3B82F6;
  }
  [data-theme='light'] &[data-sender='other'] {
    background-color: rgba(100, 116, 139, 0.35);
  }
  [data-theme='light'] &[data-sender='other'][data-played='true'] {
    background-color: #2563EB;
  }
`;

export const InfoRow = styled.div<{ $sender: 'me' | 'other' }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 0.74rem;
  font-weight: 500;
  min-width: 0;
  gap: 8px;
  box-sizing: border-box;

  &[data-sender='me'] {
    color: rgba(255, 255, 255, 0.9);
  }

  &[data-sender='other'] {
    color: var(--text-secondary);
  }

  [data-theme='light'] &[data-sender='me'] {
    color: rgba(255, 255, 255, 0.95);
  }

  [data-theme='light'] &[data-sender='other'] {
    color: #64748b;
  }
`;

export const TimerText = styled.span<{ $hasError?: boolean }>`
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  white-space: nowrap;
  flex-shrink: 0;

  ${p => p.$hasError && `
    opacity: 0.78;
  `}
`;

export const RightControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
`;

export const SpeedButton = styled.button<{ $sender: 'me' | 'other'; $isBouncing?: boolean; $isBoosted?: boolean }>`
  height: 26px;
  min-width: 52px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  user-select: none;
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  animation: ${p => p.$isBouncing ? speedBounce : 'none'} 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);

  &[data-sender='me'] {
    background: ${p => p.$isBoosted ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.18)'};
    color: #ffffff !important;
    border: 1.5px solid ${p => p.$isBoosted ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.45)'};
    box-shadow: ${p => p.$isBoosted ? '0 2px 8px rgba(0, 0, 0, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.08)'};

    svg {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      color: #ffffff !important;
      stroke: #ffffff !important;
      transition: transform 0.2s ease;
    }

    span {
      color: #ffffff !important;
    }

    &:hover {
      background: ${p => p.$isBoosted ? 'rgba(255, 255, 255, 0.38)' : 'rgba(255, 255, 255, 0.28)'};
      border-color: #ffffff;
      color: #ffffff !important;
      transform: translateY(-1px) scale(1.06);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
      svg { color: #ffffff !important; stroke: #ffffff !important; transform: rotate(20deg); }
      span { color: #ffffff !important; }
    }

    [data-theme='light'] & {
      color: #ffffff !important;
      svg { color: #ffffff !important; stroke: #ffffff !important; }
      span { color: #ffffff !important; }
    }
  }

  &[data-sender='other'] {
    background: ${p => p.$isBoosted ? '#3B82F6' : 'rgba(59, 130, 246, 0.16)'};
    color: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
    border: 1.5px solid ${p => p.$isBoosted ? '#3B82F6' : 'rgba(96, 165, 250, 0.4)'};
    box-shadow: ${p => p.$isBoosted ? '0 2px 10px rgba(59, 130, 246, 0.35)' : '0 1px 3px rgba(0, 0, 0, 0.05)'};

    svg {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      color: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
      stroke: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
      transition: transform 0.2s ease;
    }

    span {
      color: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
    }

    &:hover {
      background: ${p => p.$isBoosted ? '#2563EB' : 'rgba(59, 130, 246, 0.32)'};
      border-color: #93c5fd;
      color: #ffffff !important;
      transform: translateY(-1px) scale(1.06);
      box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
      svg {
        color: #ffffff !important;
        stroke: #ffffff !important;
        transform: rotate(20deg);
      }
      span {
        color: #ffffff !important;
      }
    }

    [data-theme='light'] & {
      background: ${p => p.$isBoosted ? '#3B82F6' : 'rgba(59, 130, 246, 0.12)'};
      color: ${p => p.$isBoosted ? '#ffffff' : '#2563eb'};
      border: 1.5px solid ${p => p.$isBoosted ? '#3B82F6' : 'rgba(59, 130, 246, 0.35)'};

      svg {
        color: ${p => p.$isBoosted ? '#ffffff' : '#2563eb'};
        stroke: ${p => p.$isBoosted ? '#ffffff' : '#2563eb'};
      }

      span {
        color: ${p => p.$isBoosted ? '#ffffff' : '#2563eb'};
      }

      &:hover {
        background: ${p => p.$isBoosted ? '#2563EB' : 'rgba(59, 130, 246, 0.22)'};
        border-color: #2563eb;
        color: ${p => p.$isBoosted ? '#ffffff' : '#000000'} !important;
        svg {
          color: ${p => p.$isBoosted ? '#ffffff' : '#000000'} !important;
          stroke: ${p => p.$isBoosted ? '#ffffff' : '#000000'} !important;
          transform: rotate(20deg);
        }
        span {
          color: ${p => p.$isBoosted ? '#ffffff' : '#000000'} !important;
        }
      }
    }

    [data-theme='dark'] & {
      background: ${p => p.$isBoosted ? '#3B82F6' : 'rgba(59, 130, 246, 0.16)'};
      color: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
      border-color: ${p => p.$isBoosted ? '#3B82F6' : 'rgba(96, 165, 250, 0.4)'};

      svg {
        color: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
        stroke: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
      }

      span {
        color: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
      }

      &:hover {
        background: ${p => p.$isBoosted ? '#2563EB' : 'rgba(59, 130, 246, 0.32)'};
        border-color: #93c5fd;
        color: #ffffff !important;
        svg {
          color: #ffffff !important;
          stroke: #ffffff !important;
          transform: rotate(20deg);
        }
        span {
          color: #ffffff !important;
        }
      }
    }
  }

  &:active {
    transform: scale(0.93);
  }
`;

export const MicTypeBadge = styled.span<{ $sender: 'me' | 'other' }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0.85;
  white-space: nowrap;
  flex-shrink: 0;

  &[data-sender='me'] {
    color: rgba(255, 255, 255, 0.9);
    svg { stroke: rgba(255, 255, 255, 0.9); }
  }

  svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }
`;
