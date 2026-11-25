import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  VoicePreviewBarWrapper,
  VoicePreviewStatusDot,
  RecordingStatusIndicator,
  RecordingActionGroup,
  RecordingCancelBtn,
  RecordingPauseResumeBtn,
  VoicePreviewPlayBtn,
  VoicePreviewWaveformBox,
  VoicePreviewWaveformBar,
  VoicePreviewTimerSpan,
} from '../Chat.styles';
import { sanitizeMediaUrl } from '../utils';
import {
  audioCoordinator,
  formatAudioDuration,
  generateDeterministicWaveform,
} from './message/AudioMessagePlayer';

export interface VoiceNotePreviewBarProps {
  previewUrl: string;
  duration: number;
  waveform: number[];
  autoPlay?: boolean;
  initiallyPlaying?: boolean;
  externalAudioRef?: React.RefObject<HTMLAudioElement | null>;
  onDiscard: () => void;
  onResumeRecording?: () => void;
  onError?: (msg: string) => void;
}

export const VoiceNotePreviewBar: React.FC<VoiceNotePreviewBarProps> = ({
  previewUrl,
  duration,
  waveform,
  autoPlay = true,
  initiallyPlaying = false,
  externalAudioRef,
  onDiscard,
  onResumeRecording,
  onError,
}) => {
  const safePreviewUrl = useMemo(() => sanitizeMediaUrl(previewUrl), [previewUrl]);
  const baseBars = useMemo(() => {
    if (Array.isArray(waveform) && waveform.length > 0) {
      return waveform;
    }
    return generateDeterministicWaveform(safePreviewUrl || 'voice_preview', 32);
  }, [waveform, safePreviewUrl]);

  const bars = baseBars;

  const [isPlaying, setIsPlaying] = useState(() => Boolean(initiallyPlaying));
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(() => Math.max(1, duration || 1));

  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const resolvedAudioRef = externalAudioRef || internalAudioRef;
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isScrubbingRef = useRef(false);
  const scrubRectRef = useRef<DOMRect | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const scrubWindowCleanupRef = useRef<(() => void) | null>(null);
  const coordinatorIdRef = useRef(`voice_preview_${Math.random().toString(36).slice(2, 10)}`);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const isInternalAudioOwned = !externalAudioRef;

  useEffect(() => {
    setAudioDuration(Math.max(1, duration || 1));
  }, [duration]);

  const stopRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const pausePlayback = useCallback(() => {
    const audio = resolvedAudioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
    stopRaf();
    setIsPlaying(false);
  }, [resolvedAudioRef, stopRaf]);

  // Smooth rAF loop while playing so waveform bars advance cleanly even on short clips
  useEffect(() => {
    if (!isPlaying) {
      stopRaf();
      return;
    }
    let active = true;
    const tick = () => {
      if (!active) return;
      const audio = resolvedAudioRef.current;
      if (audio && !isScrubbingRef.current && pendingSeekTimeRef.current === null && audio.readyState >= 1) {
        setCurrentTime(audio.currentTime);
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      stopRaf();
    };
  }, [isPlaying, resolvedAudioRef, stopRaf]);

  const startPlayback = useCallback(() => {
    const audio = resolvedAudioRef.current;
    if (!audio || !safePreviewUrl) return;
    audioCoordinator.play(coordinatorIdRef.current, pausePlayback);
    const playPromise = audio.play();
    setIsPlaying(true);
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        setIsPlaying(false);
        audioCoordinator.stop(coordinatorIdRef.current);
      });
    }
  }, [pausePlayback, resolvedAudioRef, safePreviewUrl]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pausePlayback();
      audioCoordinator.stop(coordinatorIdRef.current);
    } else {
      startPlayback();
    }
  }, [isPlaying, pausePlayback, startPlayback]);

  // Sync metadata, progress, and playback events on whichever <audio> element is active
  useEffect(() => {
    const audio = resolvedAudioRef.current;
    if (!audio) return;

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setAudioDuration((prev) => Math.max(prev, Math.round(audio.duration)));
    }

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration((prev) => Math.max(prev, Math.round(audio.duration)));
      }
      if (pendingSeekTimeRef.current !== null) {
        try {
          audio.currentTime = pendingSeekTimeRef.current;
        } catch {}
        pendingSeekTimeRef.current = null;
      }
    };

    const handleTimeUpdate = () => {
      if (!isScrubbingRef.current && pendingSeekTimeRef.current === null && audio.readyState >= 1) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      stopRaf();
      audioCoordinator.stop(coordinatorIdRef.current);
    };

    const handleError = () => {
      setIsPlaying(false);
      stopRaf();
      audioCoordinator.stop(coordinatorIdRef.current);
      onError?.('Unable to preview recorded audio.');
    };

    const handlePlayRejected = () => {
      setIsPlaying(false);
      stopRaf();
      audioCoordinator.stop(coordinatorIdRef.current);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('pulse_play_failed', handlePlayRejected);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('pulse_play_failed', handlePlayRejected);
    };
  }, [onError, resolvedAudioRef, stopRaf]);

  // Load previewUrl when mounted without pre-started external playback.
  // Important: when using an externalAudioRef owned by ChatFooter, do NOT pause it in unmount cleanup
  // because React StrictMode's simulated unmount->remount would cancel the initial user-gesture play().
  useEffect(() => {
    const audio = resolvedAudioRef.current;
    if (!audio || !safePreviewUrl) return;
    setCurrentTime(0);
    pendingSeekTimeRef.current = null;
    if (initiallyPlaying) {
      setIsPlaying(true);
      audioCoordinator.play(coordinatorIdRef.current, pausePlayback);
    } else {
      if (audio.src !== safePreviewUrl) {
        audio.src = safePreviewUrl;
        try {
          audio.load();
        } catch {}
      }
      if (autoPlay) {
        startPlayback();
      }
    }
    return () => {
      stopRaf();
      if (isInternalAudioOwned) {
        pausePlayback();
        audioCoordinator.stop(coordinatorIdRef.current);
      } else {
        audioCoordinator.release(coordinatorIdRef.current);
      }
    };
  }, [
    safePreviewUrl,
    autoPlay,
    initiallyPlaying,
    isInternalAudioOwned,
    startPlayback,
    pausePlayback,
    resolvedAudioRef,
    stopRaf,
  ]);

  const commitSeekTime = useCallback((targetTime: number) => {
    const dur = Math.max(0.01, audioDuration);
    const clamped = Math.max(0, Math.min(dur, targetTime));
    setCurrentTime(clamped);
    const audio = resolvedAudioRef.current;
    if (audio) {
      if (audio.readyState >= 1) {
        try {
          audio.currentTime = clamped;
        } catch {}
        pendingSeekTimeRef.current = null;
      } else {
        pendingSeekTimeRef.current = clamped;
      }
    }
  }, [audioDuration, resolvedAudioRef]);

  const seekFromClientX = useCallback((clientX: number, fallbackEl?: HTMLElement | null) => {
    let rect = scrubRectRef.current;
    if ((!rect || rect.width <= 0) && (fallbackEl || waveformRef.current)) {
      rect = (fallbackEl || waveformRef.current)!.getBoundingClientRect();
      if (rect.width > 0) scrubRectRef.current = rect;
    }
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    commitSeekTime(ratio * Math.max(0.01, audioDuration));
  }, [audioDuration, commitSeekTime]);

  const finishWaveformScrub = useCallback(() => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    scrubRectRef.current = null;
    if (scrubWindowCleanupRef.current) {
      scrubWindowCleanupRef.current();
      scrubWindowCleanupRef.current = null;
    }
    const pid = activePointerIdRef.current;
    activePointerIdRef.current = null;
    if (pid !== null && waveformRef.current) {
      try {
        if (waveformRef.current.hasPointerCapture?.(pid)) {
          waveformRef.current.releasePointerCapture(pid);
        }
      } catch {}
    }
  }, []);

  const handleWaveformPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isScrubbingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    const targetEl = e.currentTarget;
    scrubRectRef.current = targetEl.getBoundingClientRect();
    try {
      targetEl.setPointerCapture?.(e.pointerId);
    } catch {}
    if (scrubWindowCleanupRef.current) {
      scrubWindowCleanupRef.current();
    }
    const onWinMove = (evt: PointerEvent) => {
      if (activePointerIdRef.current !== null && evt.pointerId !== activePointerIdRef.current) return;
      seekFromClientX(evt.clientX, targetEl);
    };
    const onWinUp = (evt: PointerEvent) => {
      if (activePointerIdRef.current !== null && evt.pointerId !== activePointerIdRef.current) return;
      finishWaveformScrub();
    };
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinUp);
    scrubWindowCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinUp);
    };
    seekFromClientX(e.clientX, targetEl);
  }, [finishWaveformScrub, seekFromClientX]);

  const handleWaveformPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    e.stopPropagation();
    seekFromClientX(e.clientX, e.currentTarget);
  }, [seekFromClientX]);

  useEffect(() => {
    return () => {
      if (scrubWindowCleanupRef.current) {
        scrubWindowCleanupRef.current();
        scrubWindowCleanupRef.current = null;
      }
    };
  }, []);

  const handleWaveformKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      commitSeekTime(currentTime + 2);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      commitSeekTime(currentTime - 2);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlayPause();
    }
  }, [commitSeekTime, currentTime, togglePlayPause]);

  const progressRatio = audioDuration > 0 ? Math.max(0, Math.min(1, currentTime / audioDuration)) : 0;
  const activeBarIndex = progressRatio > 0 ? Math.floor(progressRatio * bars.length) : -1;
  const displaySeconds = isPlaying || currentTime > 0 ? currentTime : audioDuration;

  return (
    <VoicePreviewBarWrapper role="region" aria-label="Voice message preview">
      {!externalAudioRef && (
        <audio
          ref={internalAudioRef}
          src={safePreviewUrl}
          preload="auto"
        />
      )}

      <RecordingActionGroup>
        <RecordingCancelBtn
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            pausePlayback();
            audioCoordinator.stop(coordinatorIdRef.current);
            onDiscard();
          }}
          title="Discard voice message"
          aria-label="Discard voice message"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </RecordingCancelBtn>

        <VoicePreviewPlayBtn
          type="button"
          $isPlaying={isPlaying}
          onMouseDown={(e) => e.preventDefault()}
          onClick={togglePlayPause}
          title={isPlaying ? 'Pause preview' : 'Play preview'}
          aria-label={isPlaying ? 'Pause voice preview' : 'Play voice preview'}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </VoicePreviewPlayBtn>

        <VoicePreviewWaveformBox
          ref={waveformRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek voice message preview"
          aria-valuemin={0}
          aria-valuemax={Math.round(audioDuration)}
          aria-valuenow={Math.round(currentTime)}
          title="Peek audio position"
          onPointerDown={handleWaveformPointerDown}
          onPointerMove={handleWaveformPointerMove}
          onPointerUp={(e) => {
            if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
            e.stopPropagation();
            finishWaveformScrub();
          }}
          onPointerCancel={finishWaveformScrub}
          onLostPointerCapture={finishWaveformScrub}
          onClick={(e) => {
            e.stopPropagation();
            if (!isScrubbingRef.current && (e.detail > 0 || e.clientX > 0)) {
              seekFromClientX(e.clientX, e.currentTarget);
            }
          }}
          onKeyDown={handleWaveformKeyDown}
        >
          {bars.map((lvl, idx) => {
            const isPlayed = progressRatio > 0 && idx <= activeBarIndex;
            const isCurrent = isPlaying && idx === activeBarIndex;
            return (
              <VoicePreviewWaveformBar
                key={idx}
                data-played={isPlayed ? 'true' : 'false'}
                data-current={isCurrent ? 'true' : 'false'}
                style={{ height: `${Math.max(14, Math.round((lvl || 0.2) * 100))}%` }}
              />
            );
          })}
        </VoicePreviewWaveformBox>

        <RecordingStatusIndicator>
          <VoicePreviewStatusDot $isPlaying={isPlaying} aria-hidden="true" />
          <VoicePreviewTimerSpan data-testid="voice-preview-timer">
            {formatAudioDuration(displaySeconds)}
          </VoicePreviewTimerSpan>
        </RecordingStatusIndicator>

        {onResumeRecording && (
          <RecordingPauseResumeBtn
            type="button"
            $isPaused={true}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              pausePlayback();
              audioCoordinator.stop(coordinatorIdRef.current);
              onResumeRecording();
            }}
            title="Resume recording"
            aria-label="Resume recording"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </RecordingPauseResumeBtn>
        )}
      </RecordingActionGroup>
    </VoicePreviewBarWrapper>
  );
};
