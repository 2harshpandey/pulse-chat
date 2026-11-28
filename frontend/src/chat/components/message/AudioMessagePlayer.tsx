import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Message } from '../../types';
import { sanitizeMediaUrl, formatMediaSize, audioDurationCache, setAudioDurationCache, isCloudinaryUrl, preserveKeyboardFocus, nonTouchTabIndex } from '../../utils';
import { renderTextWithLinks } from '../../utils/urlLinkUtils';
import { MessageText } from '../../ChatStyledComponents';
import { sendClientDiagnostic } from '../../telemetry';
import {
  PlayerContainer,
  AudioPlayerCard,
  AudioCaptionContainer,
  PlayPauseButton,
  WaveformWrapper,
  UnavailableTrack,
  UnavailableBadge,
  WaveformBarsContainer,
  WaveformBar,
  InfoRow,
  TimerText,
  RightControls,
  SpeedButton,
  MicTypeBadge,
} from '../../styles/chat.audio.styles';

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

  release(id: string) {
    if (this.activeId === id) {
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

  const coordinatorId = (msg as any).clientTempId || msg.id;
  const isSelf = sender === 'me';
  const hasLocalBlob = isSelf && Boolean(
    (msg.url && msg.url.startsWith('blob:')) ||
    (msg.isUploading && (msg as any).localBlobUrl)
  );

  // Retain the local blob URL (if available) strictly for the sender during upload
  // Transitioning to remote Cloudinary message never aborts playback for the sender,
  // but remote clients must never receive or attempt to load client-local blob URLs.
  const localBlobUrlRef = useRef<string | null>(
    hasLocalBlob ? ((msg.url && msg.url.startsWith('blob:')) ? msg.url : ((msg as any).localBlobUrl || null)) : null
  );

  if (hasLocalBlob && !localBlobUrlRef.current) {
    if (msg.url && msg.url.startsWith('blob:')) {
      localBlobUrlRef.current = msg.url;
    } else if ((msg as any).localBlobUrl) {
      localBlobUrlRef.current = (msg as any).localBlobUrl;
    }
  }

  if (!isSelf && localBlobUrlRef.current) {
    localBlobUrlRef.current = null;
  }

  const [hasFallbackToMp3, setHasFallbackToMp3] = useState(false);
  const [hasRevokedLocalBlob, setHasRevokedLocalBlob] = useState(false);

  const activeSrc = useMemo(() => {
    if (isSelf && !hasRevokedLocalBlob && localBlobUrlRef.current) {
      return localBlobUrlRef.current;
    }
    const cleanUrl = sanitizeMediaUrl(msg.url || '');
    if (hasFallbackToMp3 && cleanUrl && isCloudinaryUrl(cleanUrl) && /\.webm(\?|$)/i.test(cleanUrl)) {
      return cleanUrl.replace(/\.webm(\?|$)/i, '.mp3$1');
    }
    return cleanUrl;
  }, [isSelf, msg.url, hasFallbackToMp3, hasRevokedLocalBlob]);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState<number>(() => {
    if (msg.duration && msg.duration > 0) return msg.duration;
    if (msg.id && audioDurationCache.has(msg.id)) return audioDurationCache.get(msg.id)!;
    if (coordinatorId && audioDurationCache.has(coordinatorId)) return audioDurationCache.get(coordinatorId)!;
    if (msg.url && audioDurationCache.has(msg.url)) return audioDurationCache.get(msg.url)!;
    return 0;
  });
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [isSpeedBouncing, setIsSpeedBouncing] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const shakeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerShake = useCallback(() => {
    setIsShaking(true);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setIsShaking(false);
      shakeTimerRef.current = null;
    }, 450);
  }, []);

  useEffect(() => {
    setHasLoadError(false);
    setHasFallbackToMp3(false);
  }, [msg.url]);

  useEffect(() => {
    if (msg.duration && msg.duration > 0) {
      setAudioDuration(msg.duration);
      if (msg.id) setAudioDurationCache(msg.id, msg.duration);
      if (coordinatorId) setAudioDurationCache(coordinatorId, msg.duration);
      if (msg.url) setAudioDurationCache(msg.url, msg.duration);
    }
  }, [msg.id, coordinatorId, msg.url, msg.duration]);

  // Immediately buffer local blob recordings so clicking play is instantaneous
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeSrc && activeSrc.startsWith('blob:')) {
      try {
        audio.load();
      } catch {}
    }
  }, [activeSrc]);

  // Fallback / Precomputed waveform bars
  const waveformBars = useMemo(() => {
    if (Array.isArray(msg.waveform) && msg.waveform.length >= 16) {
      return msg.waveform;
    }
    return generateDeterministicWaveform((msg as any).clientTempId || msg.id || msg.url || 'pulse_voice', 34);
  }, [msg.waveform, (msg as any).clientTempId, msg.id, msg.url]);

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
      if (msg.id) setAudioDurationCache(msg.id, audio.duration);
      if (coordinatorId) setAudioDurationCache(coordinatorId, audio.duration);
      if (msg.url) setAudioDurationCache(msg.url, audio.duration);
      if (audio.paused && !isPlayingRef.current && audio.currentTime !== 0) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
    } else if (audio.duration === Infinity && (!msg.duration || msg.duration <= 0)) {
      // Chromium WebM duration fix: seek to end then reset, only if duration wasn't already provided
      const onSeekEnd = () => {
        audio.removeEventListener('timeupdate', onSeekEnd);
        if (audio.duration && isFinite(audio.duration)) {
          setAudioDuration(audio.duration);
          if (msg.id) setAudioDurationCache(msg.id, audio.duration);
          if (coordinatorId) setAudioDurationCache(coordinatorId, audio.duration);
          if (msg.url) setAudioDurationCache(msg.url, audio.duration);
        }
        if (audio.paused && !isPlayingRef.current) {
          audio.currentTime = 0;
          setCurrentTime(0);
        }
      };
      audio.addEventListener('timeupdate', onSeekEnd);
      audio.currentTime = 1e101;
    } else if (msg.duration && msg.duration > 0) {
      setAudioDuration(msg.duration);
      if (msg.id) setAudioDurationCache(msg.id, msg.duration);
      if (coordinatorId) setAudioDurationCache(coordinatorId, msg.duration);
      if (msg.url) setAudioDurationCache(msg.url, msg.duration);
      if (audio.paused && !isPlayingRef.current && audio.currentTime !== 0) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const effectiveTotal = audioDuration || (audio.duration && isFinite(audio.duration) ? audio.duration : 0);

    // In Chromium, MediaRecorder WebM blobs have duration Infinity, so native 'ended' doesn't fire.
    // Trigger clean end when currentTime reaches or passes known duration.
    if (effectiveTotal > 0 && audio.currentTime >= effectiveTotal) {
      handleEnded();
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
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    }
    setIsPlaying(false);
    setCurrentTime(0);
    audioCoordinator.stop(coordinatorId);
    sendClientDiagnostic('audio_ended', {
      messageId: msg.id,
      totalDuration: Math.round(audioDuration || 0),
    });
  };

  const pendingMp3AutoPlayRef = useRef(false);

  const handleAudioError = () => {
    sendClientDiagnostic('audio_error', {
      messageId: msg.id,
      url: msg.url,
      hasFallbackToMp3,
    });
    if (msg.isUploading || !activeSrc) {
      return;
    }
    if (localBlobUrlRef.current) {
      localBlobUrlRef.current = null;
      setHasRevokedLocalBlob(true);
      if (msg.url && !msg.url.startsWith('blob:') && audioRef.current) {
        audioRef.current.src = sanitizeMediaUrl(msg.url);
        try { audioRef.current.load(); } catch {}
        return;
      }
    }
    // If WebM playback failed (e.g. on iOS Safari / Apple devices), try MP3 version from Cloudinary
    if (!hasFallbackToMp3 && msg.url && isCloudinaryUrl(msg.url) && /\.webm(\?|$)/i.test(msg.url)) {
      if (isPlayingRef.current) {
        pendingMp3AutoPlayRef.current = true;
      }
      setHasFallbackToMp3(true);
      return;
    }
    setIsPlaying(false);
    setHasLoadError(true);
  };

  // When MP3 fallback activates once, load and auto-play the MP3 source if user initiated playback
  useEffect(() => {
    if (hasFallbackToMp3 && audioRef.current) {
      const shouldAutoPlay = pendingMp3AutoPlayRef.current || isPlayingRef.current;
      pendingMp3AutoPlayRef.current = false;
      try {
        audioRef.current.load();
        if (shouldAutoPlay) {
          audioRef.current.play().then(() => {
            setIsPlaying(true);
            setHasLoadError(false);
            sendClientDiagnostic('audio_play', {
              messageId: msg.id,
              currentTime: Math.round(audioRef.current?.currentTime || 0),
              duration: Math.round(audioDuration || 0),
              format: 'mp3_fallback',
            });
          }).catch((err) => {
            if (err?.name === 'AbortError') {
              setIsPlaying(false);
              return;
            }
            setIsPlaying(false);
            setHasLoadError(true);
            triggerShake();
          });
        }
      } catch {
        setIsPlaying(false);
        setHasLoadError(true);
        triggerShake();
      }
    }
  }, [hasFallbackToMp3, triggerShake]);

  const togglePlayPause = (e: React.MouseEvent) => {
    if (isSelectModeActive) return;
    e.stopPropagation();

    if (hasLoadError) {
      triggerShake();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      audioCoordinator.stop(coordinatorId);
      sendClientDiagnostic('audio_pause', {
        messageId: msg.id,
        currentTime: Math.round(currentTime),
        duration: Math.round(audioDuration || 0),
      });
    } else {
      audioCoordinator.play(coordinatorId, handleCoordinatorPause);

      if (audio.readyState === 0) {
        try { audio.load(); } catch {}
      }

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setHasLoadError(false);
            sendClientDiagnostic('audio_play', {
              messageId: msg.id,
              currentTime: Math.round(audio.currentTime),
              duration: Math.round(audioDuration || 0),
            });
          })
          .catch((err) => {
            if (err?.name === 'AbortError') {
              setIsPlaying(false);
              return;
            }
            console.warn('Audio playback error:', err);
            if (!hasFallbackToMp3 && msg.url && isCloudinaryUrl(msg.url) && /\.webm(\?|$)/i.test(msg.url)) {
              pendingMp3AutoPlayRef.current = true;
              setHasFallbackToMp3(true);
            } else if (!msg.isUploading && activeSrc) {
              setHasLoadError(true);
              triggerShake();
            }
            setIsPlaying(false);
          });
      } else {
        setIsPlaying(true);
        sendClientDiagnostic('audio_play', {
          messageId: msg.id,
          currentTime: Math.round(audio.currentTime),
          duration: Math.round(audioDuration || 0),
        });
      }
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
    sendClientDiagnostic('audio_speed_change', {
      messageId: msg.id,
      speed: nextSpeed,
    });
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
    sendClientDiagnostic(
      'audio_seek',
      { messageId: msg.id, toTime: Math.round(newTime), duration: Math.round(effectiveDuration) },
      { debounceMs: 400, debounceKey: `audio_seek_${msg.id}` }
    );
  };

  const handleWaveformClick = (e: React.MouseEvent) => {
    if (isSelectModeActive || hasLoadError) return;
    e.stopPropagation();
    seekToPosition(e.clientX);
  };

  const pointerCleanupsRef = useRef<(() => void) | null>(null);

  const handleWaveformPointerDown = (e: React.PointerEvent) => {
    if (isSelectModeActive || hasLoadError) return;
    e.preventDefault();
    if (e.pointerType !== 'touch') {
      e.stopPropagation();
    }
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
      if (shakeTimerRef.current) {
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = null;
      }
      if (pointerCleanupsRef.current) {
        pointerCleanupsRef.current();
      }
      if (audioRef.current && !audioRef.current.paused) {
        try { audioRef.current.pause(); } catch {}
      }
      audioCoordinator.stop(coordinatorId);
    };
  }, [coordinatorId]);

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
        src={activeSrc}
        preload={activeSrc && activeSrc.startsWith('blob:') ? 'auto' : 'metadata'}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleAudioError}
      />

      <AudioPlayerCard $sender={sender} data-sender={sender} $hasCaption={Boolean(msg.text)}>
        <PlayPauseButton
          type="button"
          $sender={sender}
          data-sender={sender}
          $isPlaying={isPlaying}
          $hasError={hasLoadError}
          $isShaking={isShaking}
          onPointerDown={preserveKeyboardFocus}
          onMouseDown={preserveKeyboardFocus}
          onClick={togglePlayPause}
          title={hasLoadError ? 'Audio unavailable on server' : (isPlaying ? 'Pause' : 'Play voice message')}
          aria-label={hasLoadError ? 'Audio unavailable on server' : (isPlaying ? 'Pause voice message' : 'Play voice message')}
        >
          {hasLoadError ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : isPlaying ? (
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
          {hasLoadError ? (
            <UnavailableTrack $sender={sender} data-sender={sender} title="Audio file unavailable on server">
              <UnavailableBadge $sender={sender} data-sender={sender}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>Unavailable</span>
              </UnavailableBadge>
            </UnavailableTrack>
          ) : (
            <WaveformBarsContainer
              ref={waveformRef}
              onClick={handleWaveformClick}
              onPointerDown={handleWaveformPointerDown}
              onMouseDown={preserveKeyboardFocus}
              title="Seek audio position"
              role="slider"
              aria-label="Seek audio position"
              aria-valuemin={0}
              aria-valuemax={effectiveTotal}
              aria-valuenow={currentTime}
              aria-valuetext={displayTimer}
              tabIndex={nonTouchTabIndex(0)}
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
          )}

          <InfoRow $sender={sender} data-sender={sender}>
            <TimerText $hasError={hasLoadError}>
              {displayTimer}
            </TimerText>

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

              {!hasLoadError && (
                <SpeedButton
                  type="button"
                  $sender={sender}
                  data-sender={sender}
                  $isBouncing={isSpeedBouncing}
                  $isBoosted={playbackSpeed > 1}
                  onPointerDown={preserveKeyboardFocus}
                  onMouseDown={preserveKeyboardFocus}
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
              )}
            </RightControls>
          </InfoRow>
        </WaveformWrapper>
      </AudioPlayerCard>

      {msg.text && (
        <AudioCaptionContainer $sender={sender} data-sender={sender}>
          <MessageText style={{ paddingTop: '0', margin: 0 }}>
            {renderTextWithLinks(msg.text, sender)}
          </MessageText>
        </AudioCaptionContainer>
      )}
    </PlayerContainer>
  );
};
