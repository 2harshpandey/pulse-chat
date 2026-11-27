import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SPEEDS } from './constants';
import { sanitizeMediaUrl, isNonTouchDevice } from './utils';
import { sendClientDiagnostic } from './telemetry';
import {
  VideoPlayerWrapper, CVPContainer, CVPControls, CVPTimelineWrapper, CVPTimelineTrack,
  CVPTimelineFill, CVPTimelineThumb, CVPBottomRow, CVPIconBtn, CVPTime, CVPSpeedBtn,
  CVPVolumeWrapper, CVPDoubleTapOverlay, CVPTapIndicator, CVPCenterPlayBtn,
} from './ChatStyledComponents';

const formatTime = (s: number): string => {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export interface VideoPlayerProps {
  src: string;
  fallbackUrl?: string;
  onPointerDown?: () => void;
  onFullscreenEnter?: () => void;
  isUploading?: boolean;
  onLoadedData?: () => void;
  isSelectModeActive?: boolean;
  autoPlay?: boolean;
  isGalleryMode?: boolean;
  timestamp?: string | number;
}

const RECENT_RETRY_DELAYS_MS = [1000, 1500, 2000, 2500, 3000, 3000, 4000, 4000, 5000, 5000, 5000, 5000];
const STANDARD_RETRY_DELAYS_MS = [500, 1000];

const SpinnerSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 34, height: 34 }}>
    <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.22)" strokeWidth="2.5" />
    <path
      d="M12 3a9 9 0 0 1 9 9"
      stroke="#ffffff"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 12 12"
        to="360 12 12"
        dur="0.85s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
);

export const VideoPlayer = ({
  src,
  fallbackUrl,
  onPointerDown,
  onFullscreenEnter,
  isUploading,
  onLoadedData,
  isSelectModeActive,
  autoPlay = false,
  isGalleryMode = false,
  timestamp,
}: VideoPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null!);
  const videoRef = useRef<HTMLVideoElement>(null!);
  const timelineWrapperRef = useRef<HTMLDivElement>(null!);
  const timelineFillRef = useRef<HTMLDivElement>(null);
  const timelineThumbRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const [effectiveSrc, setEffectiveSrc] = useState(src);
  const [hasTriedFallback, setHasTriedFallback] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  durationRef.current = duration;
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(2); // 1x default
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);
  const [showCenterPlay, setShowCenterPlay] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const scrubSourceRef = useRef<'pointer' | 'mouse' | 'touch' | null>(null);
  const activeScrubPointerIdRef = useRef<number | null>(null);
  const scrubRectRef = useRef<DOMRect | null>(null);
  const scrubRafIdRef = useRef<number | null>(null);
  const isScrubRafPendingRef = useRef(false);
  const pendingScrubTimeRef = useRef(0);
  const scrubWindowCleanupRef = useRef<(() => void) | null>(null);
  const wasPlayingBeforeScrubRef = useRef(false);
  const seekThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekSentAtRef = useRef(-1000);
  const queuedSeekTimeRef = useRef<number | null>(null);
  const lastCommittedSecondRef = useRef(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const retryCountRef = useRef(0);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef(0);
  const lastTapXRef = useRef(0);
  const lastPointerTypeRef = useRef<string>('mouse');
  const centerPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeDragCleanupRef = useRef<(() => void) | null>(null);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const isVolumeOpenRef = useRef(false);
  const isVolumeHoveredRef = useRef(false);
  const isVolumeDraggingRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const isMountedRef = useRef(true);
  const effectiveSrcRef = useRef(effectiveSrc);
  effectiveSrcRef.current = effectiveSrc;

  const isRecentUpload = useMemo(() => {
    if (!timestamp) return true;
    const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts < 5 * 60 * 1000;
  }, [timestamp]);
  const isRecentUploadRef = useRef(isRecentUpload);
  isRecentUploadRef.current = isRecentUpload;

  const applyVisualProgress = useCallback((timeSec: number, durSec: number) => {
    const safeDur = Number.isFinite(durSec) && durSec > 0 ? durSec : 0;
    const clamped = safeDur > 0 ? Math.max(0, Math.min(safeDur, timeSec)) : 0;
    const ratio = safeDur > 0 ? clamped / safeDur : 0;
    if (timelineFillRef.current) {
      timelineFillRef.current.style.transform = `scaleX(${ratio})`;
    }
    if (timelineThumbRef.current) {
      timelineThumbRef.current.style.left = `${ratio * 100}%`;
    }
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = `${formatTime(clamped)} / ${formatTime(safeDur)}`;
    }
  }, []);

  useEffect(() => {
    if (!isScrubbingRef.current) {
      applyVisualProgress(currentTime, duration);
    }
  }, [currentTime, duration, applyVisualProgress]);

  const flushVideoSeek = useCallback((targetTime: number, immediate: boolean) => {
    const v = videoRef.current;
    const dur = durationRef.current || v?.duration || 0;
    if (!v || dur <= 0) return;
    const clamped = Math.max(0, Math.min(dur, targetTime));

    if (immediate) {
      queuedSeekTimeRef.current = null;
      if (seekThrottleTimerRef.current) {
        clearTimeout(seekThrottleTimerRef.current);
        seekThrottleTimerRef.current = null;
      }
      v.currentTime = clamped;
      lastSeekSentAtRef.current = performance.now();
      return;
    }

    queuedSeekTimeRef.current = clamped;
    const elapsed = performance.now() - lastSeekSentAtRef.current;
    if (!v.seeking && elapsed >= 80) {
      queuedSeekTimeRef.current = null;
      v.currentTime = clamped;
      lastSeekSentAtRef.current = performance.now();
      return;
    }

    if (!seekThrottleTimerRef.current) {
      const waitMs = Math.max(16, 85 - elapsed);
      seekThrottleTimerRef.current = setTimeout(() => {
        seekThrottleTimerRef.current = null;
        if (!isScrubbingRef.current) return;
        const nextTime = queuedSeekTimeRef.current;
        const vid = videoRef.current;
        if (nextTime !== null && vid && !vid.seeking) {
          queuedSeekTimeRef.current = null;
          vid.currentTime = nextTime;
          lastSeekSentAtRef.current = performance.now();
        }
      }, waitMs);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setEffectiveSrc(src);
    setHasTriedFallback(false);
    setHasError(false);
    setIsRetrying(false);
    setIsBuffering(false);
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    isScrubRafPendingRef.current = false;
    scrubSourceRef.current = null;
    wasPlayingBeforeScrubRef.current = false;
    queuedSeekTimeRef.current = null;
    lastCommittedSecondRef.current = -1;
    pendingPlayRef.current = false;
    retryCountRef.current = 0;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [src]);

  const resetControlsTimer = useCallback(() => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    setShowControls(true);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        if (isVolumeOpenRef.current || isVolumeDraggingRef.current || isScrubbingRef.current) {
          resetControlsTimer();
          return;
        }
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Preserve playback position if src changes mid-playback (e.g. streaming -> cached blob)
  const prevSrcRef = useRef(effectiveSrc);
  const pendingResumeTimeRef = useRef(0);
  useEffect(() => {
    if (prevSrcRef.current !== effectiveSrc) {
      const video = videoRef.current;
      if (video && video.currentTime > 0.3 && !video.ended) {
        pendingResumeTimeRef.current = video.currentTime;
      }
      prevSrcRef.current = effectiveSrc;
      setHasError(false);
      retryCountRef.current = 0;
    }
  }, [effectiveSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const clearBufferingDelay = () => {
      if (bufferingDelayTimerRef.current) {
        clearTimeout(bufferingDelayTimerRef.current);
        bufferingDelayTimerRef.current = null;
      }
    };
    const onTimeUpdate = () => {
      if (isScrubbingRef.current) return;
      const t = video.currentTime;
      const d = video.duration || durationRef.current || 0;
      applyVisualProgress(t, d);
      const floored = Math.floor(t);
      if (floored !== lastCommittedSecondRef.current || video.paused) {
        lastCommittedSecondRef.current = floored;
        setCurrentTime(t);
      }
    };
    const onSeeked = () => {
      if (isScrubbingRef.current && queuedSeekTimeRef.current !== null && !video.seeking) {
        const nextTime = queuedSeekTimeRef.current;
        queuedSeekTimeRef.current = null;
        video.currentTime = nextTime;
        lastSeekSentAtRef.current = performance.now();
      }
    };
    const onLoadedMetadata = () => {
      durationRef.current = video.duration;
      setDuration(video.duration);
      setHasError(false);
      setIsRetrying(false);
      clearBufferingDelay();
      setIsBuffering(false);
      retryCountRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      const hadPendingResume = pendingResumeTimeRef.current > 0;
      if (hadPendingResume) {
        try {
          video.currentTime = pendingResumeTimeRef.current;
        } catch (_) {}
        applyVisualProgress(pendingResumeTimeRef.current, video.duration);
        pendingResumeTimeRef.current = 0;
      } else {
        applyVisualProgress(0, video.duration);
      }
      if (autoPlay || pendingPlayRef.current) {
        pendingPlayRef.current = false;
        const p = video.play();
        if (p) p.catch(() => {});
      } else if (!hadPendingResume) {
        video.currentTime = 0.01;
      }
    };
    const onCanPlay = () => {
      clearBufferingDelay();
      setIsBuffering(false);
      setIsRetrying(false);
      setHasError(false);
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        const p = video.play();
        if (p) p.catch(() => {});
      }
    };
    const onPlaying = () => {
      clearBufferingDelay();
      setIsBuffering(false);
      setIsRetrying(false);
      setHasError(false);
      pendingPlayRef.current = false;
    };
    const onWaiting = () => {
      if (!video.paused && !isScrubbingRef.current) {
        clearBufferingDelay();
        bufferingDelayTimerRef.current = setTimeout(() => {
          bufferingDelayTimerRef.current = null;
          if (!video.paused && !isScrubbingRef.current) {
            setIsBuffering(true);
          }
        }, 160);
      }
    };
    const onPlay = () => {
      if (isScrubbingRef.current) return;
      clearBufferingDelay();
      setIsPlaying(true);
      setIsBuffering(false);
      setIsRetrying(false);
      resetControlsTimer();
      sendClientDiagnostic('video_play', {
        src: sanitizeMediaUrl(effectiveSrcRef.current),
        duration: Math.round(video.duration || 0),
        currentTime: Math.round(video.currentTime),
      });
    };
    const onPause = () => {
      if (isScrubbingRef.current) return;
      clearBufferingDelay();
      setIsPlaying(false);
      setIsBuffering(false);
      setShowControls(true);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      sendClientDiagnostic('video_pause', {
        src: sanitizeMediaUrl(effectiveSrcRef.current),
        currentTime: Math.round(video.currentTime),
        duration: Math.round(video.duration || 0),
      });
    };
    const onEnded = () => {
      clearBufferingDelay();
      if (video.loop) {
        setIsPlaying(true);
        return;
      }
      setIsPlaying(false);
      setShowControls(true);
      sendClientDiagnostic('video_ended', {
        src: sanitizeMediaUrl(effectiveSrcRef.current),
        totalDuration: Math.round(video.duration || 0),
      });
    };
    const onVolumeChange = () => { setVolume(video.volume); setIsMuted(video.muted); };

    const scheduleRetry = (targetSrc: string) => {
      const delays = isRecentUploadRef.current ? RECENT_RETRY_DELAYS_MS : STANDARD_RETRY_DELAYS_MS;
      if (retryCountRef.current >= delays.length) {
        setIsRetrying(false);
        setIsBuffering(false);
        setHasError(true);
        return;
      }
      const delay = delays[retryCountRef.current];
      retryCountRef.current += 1;
      setIsRetrying(true);
      setHasError(false);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(async () => {
        if (!isMountedRef.current || !videoRef.current || effectiveSrcRef.current !== targetSrc) {
          return;
        }
        const safeTarget = sanitizeMediaUrl(targetSrc);
        if (safeTarget && /^https?:\/\//i.test(safeTarget) && typeof fetch === 'function') {
          try {
            const res = await fetch(safeTarget, { method: 'HEAD', cache: 'no-store' });
            if (!isMountedRef.current || !videoRef.current || effectiveSrcRef.current !== targetSrc) {
              return;
            }
            if (res.ok) {
              videoRef.current.load();
              return;
            }
            scheduleRetry(targetSrc);
            return;
          } catch {
            // CORS or network error: fall through to direct video.load()
          }
        }
        if (isMountedRef.current && videoRef.current && effectiveSrcRef.current === targetSrc) {
          videoRef.current.load();
        }
      }, delay);
    };

    const onError = () => {
      const currentSrc = video.src || effectiveSrcRef.current || '';
      sendClientDiagnostic('video_error', {
        src: sanitizeMediaUrl(currentSrc),
        error: video.error?.message || 'Video error',
      });
      // If a blob URL failed, and we have a fallback remote URL (e.g. Cloudinary stream), fallback immediately!
      if (fallbackUrl && currentSrc.startsWith('blob:') && !hasTriedFallback && fallbackUrl !== currentSrc) {
        setHasTriedFallback(true);
        setEffectiveSrc(fallbackUrl);
        return;
      }

      // blob: URLs that fail are dead references: retrying is pointless.
      if (currentSrc.startsWith('blob:')) {
        setIsRetrying(false);
        setIsBuffering(false);
        setHasError(true);
        return;
      }
      scheduleRetry(effectiveSrcRef.current);
    };
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('error', onError);
    return () => {
      clearBufferingDelay();
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('error', onError);
    };
  }, [resetControlsTimer, autoPlay, fallbackUrl, hasTriedFallback, applyVisualProgress]);

  // Fullscreen change tracking
  useEffect(() => {
    const handleFSChange = () => {
      const fsElement = (document.fullscreenElement || (document as any).webkitFullscreenElement) as Element | null;
      const container = containerRef.current;
      const isThisVideoFullscreen = Boolean(
        fsElement &&
        container &&
        (fsElement === container || container.contains(fsElement))
      );

      setIsFullscreen(isThisVideoFullscreen);
      if (!isThisVideoFullscreen && !fsElement) {
        // On exit: blur any focused element within the player to prevent 
        // focus-restoration from nudging the chat viewport.
        if (document.activeElement && container && container.contains(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    document.addEventListener('webkitfullscreenchange', handleFSChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFSChange);
      document.removeEventListener('webkitfullscreenchange', handleFSChange);
    };
  }, [onFullscreenEnter]);

  // Auto-pause video when scrolled off-screen (unless in PiP mode or gallery modal)
  useEffect(() => {
    if (isGalleryMode) return;
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          // Check if the video is currently the picture-in-picture element
          if (document.pictureInPictureElement !== video) {
            if (!video.paused) {
              video.pause();
            }
          }
        }
      });
    }, {
      threshold: 0,
    });

    observer.observe(video);

    return () => {
      observer.unobserve(video);
      observer.disconnect();
    };
  }, [isGalleryMode]);

  // Handle autoPlay on mount or src change
  useEffect(() => {
    if (autoPlay && videoRef.current) {
      const v = videoRef.current;
      const playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    }
  }, [autoPlay, src]);

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      if (centerPlayTimerRef.current) clearTimeout(centerPlayTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (volumeCloseTimerRef.current) clearTimeout(volumeCloseTimerRef.current);
      if (bufferingDelayTimerRef.current) clearTimeout(bufferingDelayTimerRef.current);
      if (seekThrottleTimerRef.current) clearTimeout(seekThrottleTimerRef.current);
      if (scrubRafIdRef.current !== null) cancelAnimationFrame(scrubRafIdRef.current);
      if (scrubWindowCleanupRef.current) scrubWindowCleanupRef.current();
      if (volumeDragCleanupRef.current) volumeDragCleanupRef.current();
    };
  }, []);
  useEffect(() => { resetControlsTimer(); }, [isPlaying, resetControlsTimer]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || isRetrying) return;
    // If the video is in an error state or has no data, reload and auto-play when ready
    if (hasError || v.readyState === 0) {
      setHasError(false);
      setIsBuffering(true);
      pendingPlayRef.current = true;
      retryCountRef.current = 0;
      v.load();
      v.play().catch(() => { });
      return;
    }
    if (v.paused) {
      if (bufferingDelayTimerRef.current) clearTimeout(bufferingDelayTimerRef.current);
      if (v.readyState < 3) {
        bufferingDelayTimerRef.current = setTimeout(() => {
          bufferingDelayTimerRef.current = null;
          if (videoRef.current && !videoRef.current.paused && videoRef.current.readyState < 3) {
            setIsBuffering(true);
          }
        }, 160);
      }
      v.play().catch(() => {
        if (bufferingDelayTimerRef.current) {
          clearTimeout(bufferingDelayTimerRef.current);
          bufferingDelayTimerRef.current = null;
        }
        // play() failed: reload and play once ready
        setIsBuffering(true);
        pendingPlayRef.current = true;
        v.load();
        v.play().catch(() => { });
      });
    } else {
      if (bufferingDelayTimerRef.current) {
        clearTimeout(bufferingDelayTimerRef.current);
        bufferingDelayTimerRef.current = null;
      }
      pendingPlayRef.current = false;
      setIsBuffering(false);
      v.pause();
    }
  };

  const skip = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    const dur = v.duration || durationRef.current || 0;
    const newTime = Math.min(Math.max(v.currentTime + sec, 0), dur);
    v.currentTime = newTime;
    applyVisualProgress(newTime, dur);
    lastCommittedSecondRef.current = Math.floor(newTime);
    setCurrentTime(newTime);
    resetControlsTimer();
    sendClientDiagnostic(
      'video_seek',
      { toTime: Math.round(newTime), duration: Math.round(dur) },
      { debounceMs: 400, debounceKey: 'video_seek' }
    );
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

  const cycleSpeed = () => {
    const nextIdx = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(nextIdx);
    if (videoRef.current) videoRef.current.playbackRate = SPEEDS[nextIdx];
    sendClientDiagnostic('video_speed_change', {
      speed: SPEEDS[nextIdx],
      src: sanitizeMediaUrl(src),
    });
  };

  const toggleFullscreen = () => {
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      onFullscreenEnter?.();
      (c.requestFullscreen?.() || (c as any).webkitRequestFullscreen?.())?.catch(() => { });
    } else {
      (document.exitFullscreen?.() || (document as any).webkitExitFullscreen?.())?.catch(() => { });
    }
  };

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch { }
  };

  const toggleLoop = () => {
    const v = videoRef.current;
    const next = !isLooping;
    setIsLooping(next);
    if (v) {
      v.loop = next;
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.loop = isLooping;
    }
  }, [isLooping]);

  const computeScrubTime = useCallback((clientX: number, fallbackEl?: HTMLElement | null): number => {
    let rect = scrubRectRef.current;
    if ((!rect || rect.width <= 0) && (fallbackEl || timelineWrapperRef.current)) {
      rect = (fallbackEl || timelineWrapperRef.current).getBoundingClientRect();
      if (rect.width > 0) scrubRectRef.current = rect;
    }
    const dur = durationRef.current || videoRef.current?.duration || 0;
    if (!rect || rect.width <= 0 || dur <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * dur;
  }, []);

  const finishScrub = useCallback((source: 'pointer' | 'mouse' | 'touch') => {
    if (!isScrubbingRef.current) return;
    if (scrubSourceRef.current && scrubSourceRef.current !== source) return;

    if (scrubWindowCleanupRef.current) {
      scrubWindowCleanupRef.current();
      scrubWindowCleanupRef.current = null;
    }

    isScrubRafPendingRef.current = false;
    if (scrubRafIdRef.current !== null) {
      cancelAnimationFrame(scrubRafIdRef.current);
      scrubRafIdRef.current = null;
    }

    const pointerId = activeScrubPointerIdRef.current;
    activeScrubPointerIdRef.current = null;
    if (pointerId !== null && timelineWrapperRef.current) {
      try {
        if (timelineWrapperRef.current.hasPointerCapture?.(pointerId)) {
          timelineWrapperRef.current.releasePointerCapture(pointerId);
        }
      } catch (_) {}
    }

    scrubSourceRef.current = null;
    scrubRectRef.current = null;
    const finalTime = pendingScrubTimeRef.current;
    const dur = durationRef.current || videoRef.current?.duration || 0;

    isScrubbingRef.current = false;
    setIsScrubbing(false);
    applyVisualProgress(finalTime, dur);
    lastCommittedSecondRef.current = Math.floor(finalTime);
    setCurrentTime(finalTime);
    flushVideoSeek(finalTime, true);

    if (wasPlayingBeforeScrubRef.current) {
      wasPlayingBeforeScrubRef.current = false;
      const p = videoRef.current?.play();
      if (p) p.catch(() => {});
    }
    resetControlsTimer();
  }, [applyVisualProgress, flushVideoSeek, resetControlsTimer]);

  const updateScrub = useCallback((source: 'pointer' | 'mouse' | 'touch', clientX: number, targetEl?: HTMLDivElement | null) => {
    if (!isScrubbingRef.current) return;
    if (scrubSourceRef.current && scrubSourceRef.current !== source) return;
    const newTime = computeScrubTime(clientX, targetEl);
    pendingScrubTimeRef.current = newTime;
    if (!isScrubRafPendingRef.current) {
      isScrubRafPendingRef.current = true;
      scrubRafIdRef.current = requestAnimationFrame(() => {
        isScrubRafPendingRef.current = false;
        scrubRafIdRef.current = null;
        applyVisualProgress(pendingScrubTimeRef.current, durationRef.current || videoRef.current?.duration || 0);
      });
    }
    flushVideoSeek(newTime, false);
  }, [applyVisualProgress, computeScrubTime, flushVideoSeek]);

  const beginScrub = useCallback((
    source: 'pointer' | 'mouse' | 'touch',
    clientX: number,
    targetEl: HTMLDivElement,
    pointerId?: number
  ) => {
    if (scrubSourceRef.current && scrubSourceRef.current !== source) return;
    const v = videoRef.current;
    const dur = durationRef.current || v?.duration || 0;
    if (isUploading || isRetrying || hasError || dur <= 0) return;

    const alreadyScrubbing = isScrubbingRef.current;
    scrubSourceRef.current = source;
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    scrubRectRef.current = targetEl.getBoundingClientRect();

    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    setShowControls(true);

    if (pointerId !== undefined) {
      activeScrubPointerIdRef.current = pointerId;
      try {
        targetEl.setPointerCapture?.(pointerId);
      } catch (_) {}
    }

    if (scrubWindowCleanupRef.current) {
      scrubWindowCleanupRef.current();
    }
    const onWinPointerMove = (evt: PointerEvent) => {
      if (activeScrubPointerIdRef.current !== null && evt.pointerId !== activeScrubPointerIdRef.current) return;
      updateScrub('pointer', evt.clientX, targetEl);
    };
    const onWinPointerUp = (evt: PointerEvent) => {
      if (activeScrubPointerIdRef.current !== null && evt.pointerId !== activeScrubPointerIdRef.current) return;
      finishScrub('pointer');
    };
    const onWinMouseMove = (evt: MouseEvent) => updateScrub('mouse', evt.clientX, targetEl);
    const onWinMouseUp = () => finishScrub('mouse');
    const onWinTouchMove = (evt: TouchEvent) => {
      if (evt.touches.length > 0) updateScrub('touch', evt.touches[0].clientX, targetEl);
    };
    const onWinTouchEnd = () => finishScrub('touch');
    window.addEventListener('pointermove', onWinPointerMove);
    window.addEventListener('pointerup', onWinPointerUp);
    window.addEventListener('pointercancel', onWinPointerUp);
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    window.addEventListener('touchmove', onWinTouchMove, { passive: true });
    window.addEventListener('touchend', onWinTouchEnd);
    window.addEventListener('touchcancel', onWinTouchEnd);
    scrubWindowCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWinPointerMove);
      window.removeEventListener('pointerup', onWinPointerUp);
      window.removeEventListener('pointercancel', onWinPointerUp);
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
      window.removeEventListener('touchmove', onWinTouchMove);
      window.removeEventListener('touchend', onWinTouchEnd);
      window.removeEventListener('touchcancel', onWinTouchEnd);
    };

    if (!alreadyScrubbing && v && !v.paused && !v.ended) {
      wasPlayingBeforeScrubRef.current = true;
      v.pause();
    }

    const newTime = computeScrubTime(clientX, targetEl);
    pendingScrubTimeRef.current = newTime;
    applyVisualProgress(newTime, dur);
    flushVideoSeek(newTime, false);
  }, [applyVisualProgress, computeScrubTime, finishScrub, flushVideoSeek, hasError, isRetrying, isUploading, updateScrub]);

  // Handle mouse wheel on speaker icon for volume control (desktop)
  const handleVolumeWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    v.volume = Math.min(1, Math.max(0, v.volume + delta));
    if (v.muted && v.volume > 0) v.muted = false;
  };

  const handleVolumeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    v.muted = val === 0;
  };

  const openVolumeMenu = useCallback(() => {
    if (volumeCloseTimerRef.current) {
      clearTimeout(volumeCloseTimerRef.current);
      volumeCloseTimerRef.current = null;
    }
    isVolumeHoveredRef.current = true;
    isVolumeOpenRef.current = true;
    setIsVolumeOpen(true);
    resetControlsTimer();
  }, [resetControlsTimer]);

  const scheduleVolumeClose = useCallback(() => {
    if (volumeCloseTimerRef.current) clearTimeout(volumeCloseTimerRef.current);
    volumeCloseTimerRef.current = setTimeout(() => {
      if (isVolumeDraggingRef.current || isVolumeHoveredRef.current) return;
      isVolumeOpenRef.current = false;
      setIsVolumeOpen(false);
    }, 140);
  }, []);

  const handleVolumeWrapperMouseLeave = useCallback(() => {
    isVolumeHoveredRef.current = false;
    scheduleVolumeClose();
  }, [scheduleVolumeClose]);

  const handleVolumeRangePointerDown = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (volumeCloseTimerRef.current) {
      clearTimeout(volumeCloseTimerRef.current);
      volumeCloseTimerRef.current = null;
    }
    if (volumeDragCleanupRef.current) {
      volumeDragCleanupRef.current();
    }
    isVolumeOpenRef.current = true;
    setIsVolumeOpen(true);
    resetControlsTimer();
    isVolumeDraggingRef.current = true;
    const endDrag = () => {
      isVolumeDraggingRef.current = false;
      if (volumeDragCleanupRef.current === cleanup) {
        volumeDragCleanupRef.current = null;
      }
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('mouseup', endDrag);
      if (!isVolumeHoveredRef.current) {
        scheduleVolumeClose();
      }
    };
    const cleanup = () => {
      isVolumeDraggingRef.current = false;
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('mouseup', endDrag);
    };
    volumeDragCleanupRef.current = cleanup;
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('mouseup', endDrag);
  }, [resetControlsTimer, scheduleVolumeClose]);

  const handleContainerTap = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks on control buttons
    if ((e.target as HTMLElement).closest('button, input, [data-cvp-controls]')) return;
    if (isSelectModeActive) return;

    const now = Date.now();
    const dt = now - lastTapTimeRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    const tapX = e.clientX - rect.left;
    const containerWidth = rect.width;

    if (dt < 350 && Math.abs(tapX - lastTapXRef.current) < containerWidth * 0.6) {
      // Double tap detected
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      const side = tapX < containerWidth / 2 ? 'left' : 'right';
      const skipSec = side === 'left' ? -10 : 10;
      skip(skipSec);
      setDoubleTapSide(side);
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      doubleTapTimerRef.current = setTimeout(() => setDoubleTapSide(null), 700);
      lastTapTimeRef.current = 0;
    } else {
      // Single tap
      lastTapTimeRef.current = now;
      lastTapXRef.current = tapX;
      const tapDelay = lastPointerTypeRef.current === 'touch' ? 160 : 200;
      doubleTapTimerRef.current = setTimeout(() => {
        const isTouchTap =
          lastPointerTypeRef.current === 'touch' ||
          window.matchMedia('(pointer: coarse)').matches;
        if (isTouchTap) {
          // On touch devices, single tap toggles controls visibility.
          if (showControls) {
            setShowControls(false);
            if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
          } else {
            resetControlsTimer();
          }
        } else {
          // Desktop behavior: toggle play/pause and show controls
          togglePlay();
          resetControlsTimer();
          // Show center play/pause indicator briefly
          if (centerPlayTimerRef.current) clearTimeout(centerPlayTimerRef.current);
          setShowCenterPlay(true);
          centerPlayTimerRef.current = setTimeout(() => setShowCenterPlay(false), 600);
        }
      }, tapDelay);
    }
  };

  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

  return (
    <VideoPlayerWrapper onContextMenu={(e) => e.preventDefault()} onPointerDown={() => onPointerDown?.()}>
      <CVPContainer
        ref={containerRef}
        onPointerDown={(e) => {
          lastPointerTypeRef.current = e.pointerType || 'mouse';
        }}
        onClick={handleContainerTap}
        onMouseMove={() => {
          if (lastPointerTypeRef.current !== 'touch') {
            resetControlsTimer();
          }
        }}
        data-cvp
        $isGalleryMode={isGalleryMode}
      >
        <video
          ref={videoRef}
          src={sanitizeMediaUrl(effectiveSrc)}
          preload="metadata"
          playsInline
          onLoadedData={onLoadedData}
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
        />

        {/* Processing overlay: shown while async server processing finishes for newly uploaded videos */}
        {!isUploading && isRetrying && !hasError && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.68)', color: 'rgba(255,255,255,0.9)', gap: '8px', pointerEvents: 'none',
          }}>
            <SpinnerSvg />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Processing video...</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)' }}>Preparing for playback</span>
          </div>
        )}

        {/* Buffering overlay: shown when playback is waiting for initial or buffered frames */}
        {!isUploading && !isRetrying && !hasError && isBuffering && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.9)', gap: '8px', pointerEvents: 'none',
          }}>
            <SpinnerSvg />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Loading video...</span>
          </div>
        )}

        {/* Error overlay: shown when the video src is unloadable after retries */}
        {!isUploading && !isRetrying && hasError && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.72)', color: 'rgba(255,255,255,0.7)', gap: '8px', pointerEvents: 'none',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              style={{ width: 36, height: 36, opacity: 0.7 }}>
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
              <polyline points="23 7 16 12 23 17 23 7" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Media unavailable</span>
          </div>
        )}

        {/* Double tap indicators */}
        <CVPDoubleTapOverlay $side={doubleTapSide === 'left' ? 'left' : null} style={{ left: 0 }}>
          <CVPTapIndicator>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
            </svg>
            10s
          </CVPTapIndicator>
        </CVPDoubleTapOverlay>
        <CVPDoubleTapOverlay $side={doubleTapSide === 'right' ? 'right' : null} style={{ right: 0 }}>
          <CVPTapIndicator>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
            </svg>
            10s
          </CVPTapIndicator>
        </CVPDoubleTapOverlay>

        {/* Center play/pause flash/button */}
        <CVPCenterPlayBtn
          $visible={!isUploading && !isRetrying && !isBuffering && !hasError && (!isPlaying || showCenterPlay || (isTouchDevice && showControls))}
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          }
        </CVPCenterPlayBtn>

        {/* Controls overlay */}
        <CVPControls
          $visible={showControls}
          data-cvp-controls
          data-quote-swipe-ignore
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            e.stopPropagation();
            resetControlsTimer();
          }}
        >
          {/* Timeline */}
          <CVPTimelineWrapper
            ref={timelineWrapperRef}
            data-cvp-timeline="true"
            data-scrubbing={isScrubbing ? 'true' : undefined}
            data-quote-swipe-ignore
            onPointerDown={(e) => {
              e.stopPropagation();
              beginScrub('pointer', e.clientX, e.currentTarget, e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!isScrubbingRef.current) return;
              if (activeScrubPointerIdRef.current !== null && e.pointerId !== activeScrubPointerIdRef.current) return;
              e.stopPropagation();
              updateScrub('pointer', e.clientX, e.currentTarget);
            }}
            onPointerUp={(e) => {
              if (activeScrubPointerIdRef.current !== null && e.pointerId !== activeScrubPointerIdRef.current) return;
              e.stopPropagation();
              finishScrub('pointer');
            }}
            onPointerCancel={(e) => {
              if (activeScrubPointerIdRef.current !== null && e.pointerId !== activeScrubPointerIdRef.current) return;
              e.stopPropagation();
              finishScrub('pointer');
            }}
            onLostPointerCapture={() => finishScrub('pointer')}
            onMouseDown={(e) => {
              e.stopPropagation();
              beginScrub('mouse', e.clientX, e.currentTarget);
            }}
            onMouseMove={(e) => {
              if (!isScrubbingRef.current) return;
              e.stopPropagation();
              updateScrub('mouse', e.clientX, e.currentTarget);
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              finishScrub('mouse');
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (e.touches.length > 0) {
                beginScrub('touch', e.touches[0].clientX, e.currentTarget);
              }
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              if (isScrubbingRef.current && e.touches.length > 0) {
                updateScrub('touch', e.touches[0].clientX, e.currentTarget);
              }
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              finishScrub('touch');
            }}
            onTouchCancel={(e) => {
              e.stopPropagation();
              finishScrub('touch');
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <CVPTimelineTrack $active={isScrubbing}>
              <CVPTimelineFill ref={timelineFillRef} data-cvp-timeline-fill="true" />
              <CVPTimelineThumb ref={timelineThumbRef} $active={isScrubbing} data-cvp-timeline-thumb="true" />
            </CVPTimelineTrack>
          </CVPTimelineWrapper>

          {/* Bottom row */}
          <CVPBottomRow>
            {/* Play/Pause */}
            <CVPIconBtn onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying
                ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              }
            </CVPIconBtn>

            {/* Skip back 10s - counter-clockwise arrow + crisp vector 10 */}
            <CVPIconBtn onClick={() => skip(-10)} title="Back 10s" aria-label="Back 10 seconds">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <polyline points="3 3.5 3 8 7.5 8" />
                <path d="M9.1 10.8L10.3 9.8V15" strokeWidth="1.6" />
                <rect x="12.1" y="9.8" width="3.2" height="5.2" rx="1.6" strokeWidth="1.6" />
              </svg>
            </CVPIconBtn>

            {/* Skip forward 10s - clockwise arrow + crisp vector 10 */}
            <CVPIconBtn onClick={() => skip(10)} title="Forward 10s" aria-label="Forward 10 seconds">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <polyline points="21 3.5 21 8 16.5 8" />
                <path d="M9.1 10.8L10.3 9.8V15" strokeWidth="1.6" />
                <rect x="12.1" y="9.8" width="3.2" height="5.2" rx="1.6" strokeWidth="1.6" />
              </svg>
            </CVPIconBtn>

            {/* Volume/Mute - desktop: hover shows vertical slider + mouse-wheel; mobile: tap toggles mute */}
            <CVPVolumeWrapper
              $volumeOpen={isVolumeOpen}
              data-volume-open={isVolumeOpen ? 'true' : undefined}
              onWheel={handleVolumeWheel}
              onMouseEnter={() => { if (isNonTouchDevice()) openVolumeMenu(); }}
              onMouseLeave={() => { if (isNonTouchDevice()) handleVolumeWrapperMouseLeave(); }}
            >
              <CVPIconBtn onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'} aria-label={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted || volume === 0
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
                }
              </CVPIconBtn>
              <div className="cvp-volume-slider-panel">
                <input
                  id="video-player-volume"
                  name="volume"
                  type="range"
                  className="cvp-vol-range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={isMuted ? 0 : volume}
                  onPointerDown={handleVolumeRangePointerDown}
                  onMouseDown={handleVolumeRangePointerDown}
                  onChange={handleVolumeSliderChange}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Volume"
                />
              </div>
            </CVPVolumeWrapper>

            {/* Time display */}
            <CVPTime ref={timeDisplayRef}>{formatTime(currentTime)} / {formatTime(duration)}</CVPTime>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Loop (fullscreen or gallery mode) */}
            {(isFullscreen || isGalleryMode) && (
              <CVPIconBtn
                $active={isLooping}
                onClick={toggleLoop}
                title={isLooping ? 'Loop on' : 'Loop off'}
                aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </CVPIconBtn>
            )}

            {/* Picture in Picture (fullscreen or gallery mode) */}
            {(isFullscreen || isGalleryMode) && (
              <CVPIconBtn
                className="cvp-pip-btn"
                onClick={togglePiP}
                title="Picture in Picture"
                aria-label="Picture in Picture"
                disabled={!document.pictureInPictureEnabled}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="14" rx="2" /><rect x="12" y="10" width="8" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.6" />
                </svg>
              </CVPIconBtn>
            )}

            {/* Playback speed */}
            <CVPSpeedBtn onClick={cycleSpeed} title="Playback speed" aria-label="Playback speed">
              {SPEEDS[speedIdx]}x
            </CVPSpeedBtn>

            {/* Fullscreen */}
            <CVPIconBtn onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
              }
            </CVPIconBtn>
          </CVPBottomRow>
        </CVPControls>
      </CVPContainer>
    </VideoPlayerWrapper>
  );
};
