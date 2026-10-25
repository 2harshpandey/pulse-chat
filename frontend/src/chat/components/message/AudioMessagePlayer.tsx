import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import styled, { css } from 'styled-components';
import type { Message } from '../../types';
import { sanitizeMediaUrl, downloadFile, formatMediaSize } from '../../utils';
import { renderTextWithLinks } from '../../renderMessage';
import { MessageText } from '../../ChatStyledComponents';
import { speedBounce } from '../../styles/chat.animations';

// --- Global Audio Coordinator ---
// Ensures only one audio message plays at a time across the entire chat.
type AudioPauseListener = () => void;
class AudioPlaybackCoordinator {
  private activeId: string | null = null;
  private pauseActive: AudioPauseListener | null = null;

  play(id: string, pauseFn: AudioPauseListener) {
    if (this.activeId && this.activeId !== id && this.pauseActive) {
      try { this.pauseActive(); } catch {}
    }
    this.activeId = id;
    this.pauseActive = pauseFn;
  }

  stop(id?: string) {
    if (!id || this.activeId === id) {
      if (this.pauseActive) {
        try { this.pauseActive(); } catch {}
      }
      this.activeId = null;
      this.pauseActive = null;
    }
  }
}
export const audioCoordinator = new AudioPlaybackCoordinator();

// Helper to format seconds as m:ss
export const formatAudioDuration = (totalSeconds: number): string => {
  if (!totalSeconds || isNaN(totalSeconds) || !isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00';
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Generates a deterministic, natural waveform for any audio without precomputed waveform data
export const generateDeterministicWaveform = (seedStr: string, barsCount = 34): number[] => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < barsCount; i++) {
    // Generate organic voice-like bar heights
    const pseudoRandom = Math.abs(Math.sin(hash + i * 1.35));
    const envelope = Math.sin((i / (barsCount - 1)) * Math.PI);
    const height = 0.18 + 0.72 * (pseudoRandom * 0.7 + envelope * 0.3);
    bars.push(Math.round(Math.max(0.16, Math.min(0.96, height)) * 100) / 100);
  }
  return bars;
};

// --- STYLED COMPONENTS ---

const PlayerContainer = styled.div<{ $sender: 'me' | 'other' }>`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 250px;
  max-width: 340px;
  padding: 6px 2px 2px 2px;
  user-select: none;

  @media (max-width: 480px) {
    min-width: 210px;
    max-width: 100%;
  }
`;

const PlayerMainRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
`;

const PlayPauseButton = styled.button<{ $sender: 'me' | 'other'; $isPlaying: boolean }>`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  outline: none;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);

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
    margin-left: ${p => p.$isPlaying ? '0' : '2px'};
  }
`;

const WaveformWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 6px;
`;

const WaveformBarsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 2.5px;
  height: 30px;
  width: 100%;
  cursor: pointer;
  padding: 4px 0;
  touch-action: none;
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
    border-radius: 6px;
  }
`;

const WaveformBar = styled.div<{ $isPlayed: boolean; $sender: 'me' | 'other'; $heightPct: number }>`
  flex: 1;
  min-width: 2px;
  max-width: 4.5px;
  height: ${p => Math.max(12, Math.round(p.$heightPct * 100))}%;
  border-radius: 9999px;
  transition: height 0.15s ease, background-color 0.15s ease, transform 0.12s ease;

  &:hover {
    transform: scaleY(1.15);
  }

  /* --- SENDER: ME (User's own bubble: Blue background in BOTH Dark & Light modes) --- */
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

  /* --- SENDER: OTHER (Other user's bubble: Light in light mode, Dark grey in dark mode) --- */
  /* Dark mode */
  &[data-sender='other'] {
    background-color: rgba(148, 163, 184, 0.38);
  }
  &[data-sender='other'][data-played='true'] {
    background-color: #3B82F6;
  }
  /* Light mode: crisp blue for played, clean slate grey for unplayed */
  [data-theme='light'] &[data-sender='other'] {
    background-color: rgba(100, 116, 139, 0.35);
  }
  [data-theme='light'] &[data-sender='other'][data-played='true'] {
    background-color: #2563EB;
  }
`;

const InfoRow = styled.div<{ $sender: 'me' | 'other' }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 0.74rem;
  font-weight: 500;

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

const TimerText = styled.span`
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
`;

const RightControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SpeedButton = styled.button<{ $sender: 'me' | 'other'; $isBouncing?: boolean; $isBoosted?: boolean }>`
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

  /* --- SENDER: ME (Written speed like 1x and gauge icon must be WHITE in BOTH light & dark modes) --- */
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

  /* --- SENDER: OTHER (Keep distinct theme colors for other users) --- */
  &[data-sender='other'] {
    background: ${p => p.$isBoosted ? '#3B82F6' : 'rgba(59, 130, 246, 0.12)'};
    color: ${p => p.$isBoosted ? '#ffffff' : '#2563eb'};
    border: 1.5px solid ${p => p.$isBoosted ? '#3B82F6' : 'rgba(59, 130, 246, 0.35)'};
    box-shadow: ${p => p.$isBoosted ? '0 2px 10px rgba(59, 130, 246, 0.35)' : '0 1px 3px rgba(0, 0, 0, 0.05)'};

    svg {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      transition: transform 0.2s ease;
    }

    [data-theme='dark'] & {
      background: ${p => p.$isBoosted ? '#3B82F6' : 'rgba(59, 130, 246, 0.16)'};
      color: ${p => p.$isBoosted ? '#ffffff' : '#60a5fa'};
      border-color: ${p => p.$isBoosted ? '#3B82F6' : 'rgba(96, 165, 250, 0.4)'};
    }

    &:hover {
      background: ${p => p.$isBoosted ? '#2563EB' : 'rgba(59, 130, 246, 0.22)'};
      border-color: #3b82f6;
      color: ${p => p.$isBoosted ? '#ffffff' : '#1d4ed8'};
      transform: translateY(-1px) scale(1.06);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
      svg { transform: rotate(20deg); }
    }
  }

  &:active {
    transform: scale(0.93);
  }
`;

const MicTypeBadge = styled.span<{ $sender: 'me' | 'other' }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  opacity: 0.8;

  &[data-sender='me'] {
    color: rgba(255, 255, 255, 0.9);
    svg { stroke: rgba(255, 255, 255, 0.9); }
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

export interface AudioMessagePlayerProps {
  msg: Message;
  sender?: 'me' | 'other';
  isSelectModeActive?: boolean;
}

export const AudioMessagePlayer: React.FC<AudioMessagePlayerProps> = ({
  msg,
  sender = 'other',
  isSelectModeActive = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState<number>(() => msg.duration || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [isSpeedBouncing, setIsSpeedBouncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fallback / Precomputed waveform bars
  const waveformBars = useMemo(() => {
    if (Array.isArray(msg.waveform) && msg.waveform.length >= 16) {
      return msg.waveform;
    }
    return generateDeterministicWaveform(msg.id || msg.url || 'pulse_voice', 34);
  }, [msg.waveform, msg.id, msg.url]);

  const sanitizedSrc = useMemo(() => {
    return sanitizeMediaUrl(msg.url || '');
  }, [msg.url]);

  // Handle global coordinator pause
  const handleCoordinatorPause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  // Sync duration when loaded
  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playbackSpeed !== 1) {
      try { audio.playbackRate = playbackSpeed; } catch {}
    }
    if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
      setAudioDuration(audio.duration);
      if (!isPlaying && audio.currentTime !== 0) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
    } else if (audio.duration === Infinity && (!msg.duration || msg.duration <= 0)) {
      // Chromium WebM duration fix: seek to end then reset, only if duration wasn't already provided
      const onSeekEnd = () => {
        audio.removeEventListener('timeupdate', onSeekEnd);
        if (audio.duration && isFinite(audio.duration)) {
          setAudioDuration(audio.duration);
        }
        audio.currentTime = 0;
        setCurrentTime(0);
      };
      audio.addEventListener('timeupdate', onSeekEnd);
      audio.currentTime = 1e101;
    } else if (msg.duration && msg.duration > 0) {
      setAudioDuration(msg.duration);
      if (!isPlaying && audio.currentTime !== 0) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
    }
    setIsLoading(false);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioDuration > 0 && audio.currentTime > audioDuration && !isPlaying) {
      return;
    }
    setCurrentTime(audio.currentTime);
    if (!audioDuration || !isFinite(audioDuration)) {
      if (audio.duration && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    audioCoordinator.stop(msg.id);
  };

  const togglePlayPause = (e: React.MouseEvent) => {
    if (isSelectModeActive) return;
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      audioCoordinator.stop(msg.id);
    } else {
      audioCoordinator.play(msg.id, handleCoordinatorPause);
      setIsLoading(true);
      audio.play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setIsLoading(false);
        });
    }
  };

  const handleSpeedCycle = (e: React.MouseEvent) => {
    if (isSelectModeActive) return;
    e.stopPropagation();
    setIsSpeedBouncing(true);
    setTimeout(() => setIsSpeedBouncing(false), 260);
    const speeds: (1 | 1.5 | 2)[] = [1, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const seekToPosition = (clientX: number) => {
    const container = waveformRef.current;
    const audio = audioRef.current;
    if (!container || !audio) return;

    const rect = container.getBoundingClientRect();
    if (!rect.width || rect.width <= 0) return;

    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const targetRatio = clickX / rect.width;
    const effectiveDuration = audioDuration || (audio.duration && isFinite(audio.duration) ? audio.duration : 0);
    if (!effectiveDuration || !isFinite(effectiveDuration)) return;

    const newTime = targetRatio * effectiveDuration;
    try {
      audio.currentTime = newTime;
    } catch {}
    setCurrentTime(newTime);
  };

  const handleWaveformClick = (e: React.MouseEvent) => {
    if (isSelectModeActive) return;
    e.stopPropagation();
    seekToPosition(e.clientX);
  };

  const pointerCleanupsRef = useRef<(() => void) | null>(null);

  const handleWaveformPointerDown = (e: React.PointerEvent) => {
    if (isSelectModeActive) return;
    e.stopPropagation();
    seekToPosition(e.clientX);

    if (pointerCleanupsRef.current) {
      pointerCleanupsRef.current();
    }

    const onPointerMove = (moveEvt: PointerEvent) => {
      seekToPosition(moveEvt.clientX);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      pointerCleanupsRef.current = null;
    };

    pointerCleanupsRef.current = onPointerUp;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pointerCleanupsRef.current) {
        pointerCleanupsRef.current();
      }
      if (audioRef.current && !audioRef.current.paused) {
        try { audioRef.current.pause(); } catch {}
      }
      audioCoordinator.stop(msg.id);
    };
  }, [msg.id]);

  // Calculate playback percentage for dual-color waveform
  const effectiveTotal = audioDuration || (audioRef.current?.duration && isFinite(audioRef.current.duration) ? audioRef.current.duration : 0);
  const progressRatio = effectiveTotal > 0 ? Math.min(1, Math.max(0, currentTime / effectiveTotal)) : 0;
  const activeBarIndex = currentTime > 0 ? Math.floor(progressRatio * waveformBars.length) : -1;

  // Time label: shows elapsed time during playback / seeking, or total duration when idle at 0
  const displayTimer = isPlaying || currentTime > 0
    ? formatAudioDuration(currentTime)
    : formatAudioDuration(effectiveTotal);

  return (
    <PlayerContainer $sender={sender} data-sender={sender}>
      <audio
        ref={audioRef}
        src={sanitizedSrc}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={() => {
          setIsPlaying(false);
          setIsLoading(false);
        }}
      />

      <PlayerMainRow>
        <PlayPauseButton
          type="button"
          $sender={sender}
          data-sender={sender}
          $isPlaying={isPlaying}
          onClick={togglePlayPause}
          title={isPlaying ? 'Pause' : 'Play voice message'}
          aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1.5" />
              <rect x="14" y="5" width="4" height="14" rx="1.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="7 4 20 12 7 20 7 4" />
            </svg>
          )}
        </PlayPauseButton>

        <WaveformWrapper>
          <WaveformBarsContainer
            ref={waveformRef}
            onClick={handleWaveformClick}
            onPointerDown={handleWaveformPointerDown}
            title="Seek audio position"
            role="slider"
            aria-label="Seek audio position"
            aria-valuemin={0}
            aria-valuemax={effectiveTotal}
            aria-valuenow={currentTime}
            aria-valuetext={displayTimer}
            tabIndex={0}
            data-quote-swipe-ignore="true"
            onKeyDown={(e) => {
              if (isSelectModeActive) return;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                if (audioRef.current) {
                  const newTime = Math.min(effectiveTotal, currentTime + 5);
                  audioRef.current.currentTime = newTime;
                  setCurrentTime(newTime);
                }
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                if (audioRef.current) {
                  const newTime = Math.max(0, currentTime - 5);
                  audioRef.current.currentTime = newTime;
                  setCurrentTime(newTime);
                }
              }
            }}
          >
            {waveformBars.map((heightPct, idx) => (
              <WaveformBar
                key={idx}
                $sender={sender}
                data-sender={sender}
                $isPlayed={idx <= activeBarIndex}
                data-played={idx <= activeBarIndex ? 'true' : 'false'}
                $heightPct={heightPct}
              />
            ))}
          </WaveformBarsContainer>

          <InfoRow $sender={sender} data-sender={sender}>
            <TimerText>{displayTimer}</TimerText>

            <RightControls>
              <MicTypeBadge $sender={sender} data-sender={sender} title="Voice message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                {msg.size ? formatMediaSize(msg.size) : null}
              </MicTypeBadge>

              <SpeedButton
                type="button"
                $sender={sender}
                data-sender={sender}
                $isBouncing={isSpeedBouncing}
                $isBoosted={playbackSpeed > 1}
                onClick={handleSpeedCycle}
                title={`Playback speed: ${playbackSpeed}x (Click to cycle 1x → 1.5x → 2x)`}
                aria-label={`Playback speed: ${playbackSpeed}x. Click to cycle speed.`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 14l3-3" />
                  <path d="M3.34 19a10 10 0 1 1 17.32 0" />
                </svg>
                <span>{playbackSpeed}x</span>
              </SpeedButton>
            </RightControls>
          </InfoRow>
        </WaveformWrapper>
      </PlayerMainRow>

      {msg.text && (
        <MessageText style={{ paddingTop: '0.45rem', margin: 0 }}>
          {renderTextWithLinks(msg.text, sender)}
        </MessageText>
      )}
    </PlayerContainer>
  );
};
