import styled from 'styled-components';
import { videoFadeIn, controlsSlideUp } from './chat.animations';

export const VideoPlayerWrapper = styled.div`
  position: absolute;
  inset: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: inherit;
  overflow: hidden;

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    background: #000;
    border-radius: inherit;
  }
`;

export const CVPContainer = styled.div`
  --cvp-controls-padding: 4px 8px 6px;
  --cvp-row-gap: 2px;
  --cvp-icon-size: 16px;
  --cvp-icon-pad: 3px;
  --cvp-time-size: 0.6rem;
  --cvp-speed-font-size: 0.58rem;
  --cvp-speed-width: 40px;
  --cvp-speed-pad-y: 2px;
  --cvp-speed-pad-x: 5px;
  --cvp-timeline-height: 24px;
  --cvp-timeline-padding: 8px 0;
  --cvp-track-height: 3px;
  --cvp-thumb-size: 11px;
  --cvp-edge-pad-right: 4px;

  position: absolute;
  inset: 0;
  background: #000;
  border-radius: 0.75rem;
  /* clip-path keeps the video clipped to rounded corners without cutting
     absolutely-positioned controls children (overflow: hidden would clip them). */
  clip-path: inset(0 round 0.75rem);
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;

  /* Fullscreen: fill viewport, letterbox with object-fit: contain */
  &:fullscreen, &:-webkit-full-screen {
    border-radius: 0;
    width: 100vw;
    height: 100dvh;
    background: #000;
    clip-path: inset(0);

    --cvp-controls-padding: 9px 10px 11px;
    --cvp-row-gap: 2px;
    --cvp-icon-size: 18px;
    --cvp-icon-pad: 5px;
    --cvp-time-size: 0.74rem;
    --cvp-speed-font-size: 0.66rem;
    --cvp-speed-width: 42px;
    --cvp-speed-pad-y: 3px;
    --cvp-speed-pad-x: 6px;
    --cvp-timeline-height: 28px;
    --cvp-timeline-padding: 10px 0;
    --cvp-track-height: 4px;
    --cvp-thumb-size: 13px;
    --cvp-edge-pad-right: 2px;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    background: #000;
    animation: ${videoFadeIn} 0.3s ease;
    /* Prevent fullscreen video from overflowing on mobile portrait */
    max-width: 100%;
    max-height: 100%;
  }

  &:fullscreen video, &:-webkit-full-screen video {
    width: 100vw;
    height: 100dvh;
    max-width: 100vw;
    max-height: 100dvh;
    object-fit: contain;
  }
`;

export const CVPControls = styled.div<{ $visible: boolean }>`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%);
  padding: var(--cvp-controls-padding, 4px 6px 6px);
  display: flex;
  flex-direction: column;
  gap: 1px;
  opacity: ${p => p.$visible ? 1 : 0};
  transition: opacity 0.25s ease;
  pointer-events: ${p => p.$visible ? 'all' : 'none'};
  border-radius: 0 0 0.75rem 0.75rem;
  animation: ${controlsSlideUp} 0.2s ease;
  overflow: visible;
`;

export const CVPTimelineWrapper = styled.div`
  width: 100%;
  height: var(--cvp-timeline-height, 24px);
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: var(--cvp-timeline-padding, 8px 0);
  position: relative;
  /* Prevent the timeline drag from propagating to the message swipe gesture */
  touch-action: none;
`;

export const CVPTimelineTrack = styled.div`
  width: 100%;
  height: var(--cvp-track-height, 3px);
  background: rgba(255,255,255,0.3);
  border-radius: 2px;
  position: relative;
  overflow: visible;
`;

export const CVPTimelineFill = styled.div<{ $pct: number }>`
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: ${p => p.$pct}%;
  background: #3b82f6;
  border-radius: 2px;
  transition: width 0.1s linear;
`;

export const CVPTimelineThumb = styled.div<{ $pct: number }>`
  position: absolute;
  top: 50%;
  left: ${p => p.$pct}%;
  transform: translate(-50%, -50%);
  width: var(--cvp-thumb-size, 11px);
  height: var(--cvp-thumb-size, 11px);
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(0,0,0,0.5);
  transition: left 0.1s linear;
`;

export const CVPBottomRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--cvp-row-gap, 2px);
  flex-wrap: nowrap;
  min-width: 0;
  overflow: hidden;
  padding-right: var(--cvp-edge-pad-right, 2px);

  /* Shrink icon buttons on small frames */
  @media (max-width: 420px) {
    gap: 1px;
  }
`;

export const CVPIconBtn = styled.button<{ $active?: boolean }>`
  background: ${p => p.$active ? 'rgba(59,130,246,0.38)' : 'none'};
  border: none;
  color: #fff;
  cursor: pointer;
  padding: var(--cvp-icon-pad, 3px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.15s ease, transform 0.15s ease;
  flex-shrink: 0;
  svg { width: var(--cvp-icon-size, 16px); height: var(--cvp-icon-size, 16px); overflow: visible; }
  &:hover { background: rgba(255,255,255,0.15); transform: scale(1.12); }
  &:active { transform: scale(0.9); }
  &:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
`;

export const CVPTime = styled.span`
  font-size: var(--cvp-time-size, 0.6rem);
  color: rgba(255,255,255,0.9);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  font-weight: 500;
  flex-shrink: 0;
`;

export const CVPSpeedBtn = styled.button`
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.25);
  color: #fff;
  font-size: var(--cvp-speed-font-size, 0.58rem);
  font-weight: 700;
  padding: var(--cvp-speed-pad-y, 2px) var(--cvp-speed-pad-x, 5px);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  min-width: var(--cvp-speed-width, 40px);
  width: var(--cvp-speed-width, 40px);
  text-align: center;
  font-variant-numeric: tabular-nums;
  transition: background 0.15s ease;
  &:hover { background: rgba(255,255,255,0.25); }
`;

/* Volume slider wrapper - only shown on non-touch (pointer: fine) devices */
export const CVPVolumeWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;

  .cvp-volume-slider-panel {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: 28px;
    height: 80px;
    background: rgba(15,23,42,0.88);
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
    z-index: 10;
  }

  &:hover .cvp-volume-slider-panel,
  &:focus-within .cvp-volume-slider-panel {
    opacity: 1;
    pointer-events: all;
  }

  /* Only show volume panel on fine pointer (mouse) devices */
  @media (pointer: coarse) {
    .cvp-volume-slider-panel { display: none !important; }
  }

  input[type='range'].cvp-vol-range {
    -webkit-appearance: none;
    appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
    width: 4px;
    height: 64px;
    background: transparent;
    outline: none;
    cursor: pointer;
  }

  input[type='range'].cvp-vol-range::-webkit-slider-runnable-track {
    background: rgba(255,255,255,0.3);
    width: 4px;
    border-radius: 2px;
  }

  input[type='range'].cvp-vol-range::-moz-range-track {
    background: rgba(255,255,255,0.3);
    width: 4px;
    border-radius: 2px;
  }

  input[type='range'].cvp-vol-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: #fff;
    border-radius: 50%;
    margin-left: -4px;
    box-shadow: 0 0 3px rgba(0,0,0,0.4);
    transition: transform 0.1s ease;
  }

  input[type='range'].cvp-vol-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: #fff;
    border-radius: 50%;
    border: none;
    box-shadow: 0 0 3px rgba(0,0,0,0.4);
    cursor: pointer;
  }

  input[type='range'].cvp-vol-range::-webkit-slider-thumb:hover {
    transform: scale(1.25);
  }
`;

export const CVPDoubleTapOverlay = styled.div<{ $side: 'left' | 'right' | null }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${p => p.$side === 'left' ? '0' : 'auto'};
  right: ${p => p.$side === 'right' ? '0' : 'auto'};
  width: 35%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: ${p => p.$side ? 1 : 0};
  transition: opacity 0.25s ease;
`;

export const CVPTapIndicator = styled.div`
  background: rgba(255,255,255,0.18);
  border-radius: 50%;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  color: #fff;
  svg { width: 20px; height: 20px; }
`;

export const CVPCenterPlayBtn = styled.button<{ $visible: boolean }>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 56px;
  height: 56px;
  background: rgba(0,0,0,0.6);
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${p => p.$visible ? 1 : 0};
  transition: opacity 0.2s ease, transform 0.15s ease;
  pointer-events: ${p => p.$visible ? 'auto' : 'none'};
  cursor: pointer;
  z-index: 10;

  svg { width: 28px; height: 28px; color: #fff; }

  &:active {
    transform: translate(-50%, -50%) scale(0.92);
  }
  &:hover {
    background: rgba(0,0,0,0.75);
  }
`;

/* - Download Progress Ring (WhatsApp/Telegram style) - */
export const DownloadProgressRing = styled.div<{ $progress: number; $visible: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  display: ${p => p.$visible ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;

  & > svg.ring-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100% !important;
    height: 100% !important;
    transform: rotate(-90deg);
  }

  circle.track {
    fill: none;
    stroke: currentColor;
    opacity: 0.25;
    strokeWidth: 3;
  }

  circle.progress {
    fill: none;
    stroke: currentColor;
    strokeWidth: 3;
    strokeLinecap: round;
    stroke-dasharray: 100;
    stroke-dashoffset: ${p => 100 - (p.$progress * 100)};
    transition: stroke-dashoffset 0.15s linear;
  }

  .cancel-icon {
    position: relative;
    z-index: 1;
    color: currentColor;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cancel-icon > svg {
    width: 16px;
    height: 16px;
  }
`;
