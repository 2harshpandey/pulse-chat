import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SPEEDS } from './constants';
import { sanitizeMediaUrl } from './utils';
import {
  VideoPlayerWrapper, CVPContainer, CVPControls, CVPTimelineWrapper, CVPTimelineTrack,
  CVPTimelineFill, CVPTimelineThumb, CVPBottomRow, CVPIconBtn, CVPTime, CVPSpeedBtn,
  CVPVolumeWrapper, CVPDoubleTapOverlay, CVPTapIndicator, CVPCenterPlayBtn,
  DownloadProgressRing,
} from './ChatStyledComponents';

const formatTime = (s: number): string => {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export const VideoPlayer = ({ src, onPointerDown, onFullscreenEnter, isUploading, onLoadedData, isSelectModeActive }: { src: string; onPointerDown?: () => void; onFullscreenEnter?: () => void; isUploading?: boolean; onLoadedData?: () => void; isSelectModeActive?: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null!);
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(2); // 1x default
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);
  const [showCenterPlay, setShowCenterPlay] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [hasError, setHasError] = useState(false);
  const retryCountRef = useRef(0);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef(0);
  const lastTapXRef = useRef(0);
  const centerPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const resetControlsTimer = useCallback(() => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    setShowControls(true);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  // Reset error state when the source URL changes
  useEffect(() => {
    setHasError(false);
    retryCountRef.current = 0;
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      if (!isScrubbingRef.current) {
        setCurrentTime(video.currentTime);
      }
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setHasError(false);
      retryCountRef.current = 0;
      video.currentTime = 0.01;
    };
    const onPlay = () => { setIsPlaying(true); resetControlsTimer(); };
    const onPause = () => { setIsPlaying(false); setShowControls(true); if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current); };
    const onEnded = () => {
      if (video.loop) {
        setIsPlaying(true);
        return;
      }
      setIsPlaying(false);
      setShowControls(true);
    };
    const onVolumeChange = () => { setVolume(video.volume); setIsMuted(video.muted); };
    const onError = () => {
      // blob: URLs that fail are dead references — retrying is pointless.
      const currentSrc = video.src || '';
      if (currentSrc.startsWith('blob:')) {
        setHasError(true);
        return;
      }
      // Auto-retry up to 2 times for non-blob sources (real network errors)
      if (retryCountRef.current < 2) {
        retryCountRef.current += 1;
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.load();
          }
        }, 500 * retryCountRef.current);
      } else {
        setHasError(true);
      }
    };
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('error', onError);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('error', onError);
    };
  }, [resetControlsTimer]);

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

  // Auto-pause video when scrolled off-screen (unless in PiP mode)
  useEffect(() => {
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
  }, []);

  useEffect(() => { return () => { if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current); }; }, []);
  useEffect(() => { resetControlsTimer(); }, [isPlaying, resetControlsTimer]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    // If the video is in an error state or has no data, try reloading before playing
    if (hasError || v.readyState === 0) {
      setHasError(false);
      retryCountRef.current = 0;
      v.load();
      v.play().catch(() => { });
      return;
    }
    if (v.paused) {
      v.play().catch(() => {
        // play() failed — try forcing a reload and then playing
        v.load();
        v.play().catch(() => { });
      });
    } else {
      v.pause();
    }
  };

  const skip = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + sec, 0), v.duration || 0);
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

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    setCurrentTime(newTime);
    const v = videoRef.current;
    if (v && duration > 0) v.currentTime = newTime;
  };

  const handleScrubStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    isScrubbingRef.current = true;
    handleTimelineClick(e);
  };

  const handleScrubMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (isScrubbingRef.current) handleTimelineClick(e);
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
    isScrubbingRef.current = false;
  };

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
      doubleTapTimerRef.current = setTimeout(() => {
        const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
        if (isTouch) {
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
      }, 200);
    }
  };

  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

  return (
    <VideoPlayerWrapper onContextMenu={(e) => e.preventDefault()} onPointerDown={() => onPointerDown?.()}>
      <CVPContainer
        ref={containerRef}
        onClick={handleContainerTap}
        onMouseMove={resetControlsTimer}
        data-cvp
      >
        <video
          ref={videoRef}
          src={sanitizeMediaUrl(src)}
          preload="metadata"
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
        />

        {/* Error overlay — shown when the video src is unloadable (e.g. expired blob: URL) */}
        {hasError && (
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
          $visible={!isUploading && (!isPlaying || showCenterPlay || (isTouchDevice && showControls))}
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
          onTouchStart={resetControlsTimer}
        >
          {/* Timeline */}
          <CVPTimelineWrapper
            data-quote-swipe-ignore
            onMouseDown={(e) => handleScrubStart(e)}
            onMouseMove={(e) => handleScrubMove(e)}
            onMouseUp={handleScrubEnd}
            onMouseLeave={handleScrubEnd}
            onTouchStart={(e) => { handleScrubStart(e); e.stopPropagation(); }}
            onTouchMove={(e) => { handleScrubMove(e); e.stopPropagation(); }}
            onTouchEnd={handleScrubEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <CVPTimelineTrack>
              <CVPTimelineFill $pct={pct} />
              <CVPTimelineThumb $pct={pct} />
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

            {/* Skip back 10s - pure path-based icon, no <text> to avoid SVG clipping */}
            <CVPIconBtn onClick={() => skip(-10)} title="Back 10s" aria-label="Back 10 seconds">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.5 5A8.5 8.5 0 1 0 20 11.5" />
                <polyline points="12 3 9.5 5.5 12 8" />
                <text x="8.2" y="15" fontSize="4.8" fill="currentColor" stroke="none" fontWeight="800" fontFamily="system-ui,sans-serif">10</text>
              </svg>
            </CVPIconBtn>

            {/* Skip forward 10s - pure path-based icon */}
            <CVPIconBtn onClick={() => skip(10)} title="Forward 10s" aria-label="Forward 10 seconds">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.5 5A8.5 8.5 0 1 1 4 11.5" />
                <polyline points="12 3 14.5 5.5 12 8" />
                <text x="8.2" y="15" fontSize="4.8" fill="currentColor" stroke="none" fontWeight="800" fontFamily="system-ui,sans-serif">10</text>
              </svg>
            </CVPIconBtn>

            {/* Volume/Mute - desktop: hover shows vertical slider + mouse-wheel; mobile: tap toggles mute */}
            <CVPVolumeWrapper onWheel={handleVolumeWheel}>
              <CVPIconBtn onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'} aria-label={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted || volume === 0
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
                }
              </CVPIconBtn>
              <div className="cvp-volume-slider-panel">
                <input
                  type="range"
                  className="cvp-vol-range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeSliderChange}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Volume"
                />
              </div>
            </CVPVolumeWrapper>

            {/* Time display */}
            <CVPTime>{formatTime(currentTime)} / {formatTime(duration)}</CVPTime>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Loop (fullscreen only) */}
            {isFullscreen && (
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

            {/* Picture in Picture (fullscreen only) */}
            {isFullscreen && (
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
