import { useEffect, useRef } from 'react';
import { isTouchDevice } from '../constants';
import type { Message } from '../types';
import { getDeletedForMeIds, normalizeMessageId } from '../utils';

export const DEFAULT_TAB_TITLE = 'Pulse';
export const MAX_TAB_UNREAD_COUNT = 99;
const TAB_BADGE_PULSE_INTERVAL_MS = 1000;
const FAVICON_SIZE = 64;
const MAX_KNOWN_IDS_CACHE = 250;

interface SavedIconLinkDescriptor {
  rel: string;
  type: string;
  sizes: string;
  href: string;
}

export interface UseTabUnreadIndicatorProps {
  roomId: string;
  userId: string;
  enabled: boolean;
  baseTitle?: string;
}

export function formatUnreadTabTitle(unreadCount: number, baseTitle: string = DEFAULT_TAB_TITLE): string {
  const safeBase = baseTitle.trim() || DEFAULT_TAB_TITLE;
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) {
    return safeBase;
  }
  const rounded = Math.floor(unreadCount);
  const label = rounded > MAX_TAB_UNREAD_COUNT ? `${MAX_TAB_UNREAD_COUNT}+` : String(rounded);
  return `(${label}) ${safeBase}`;
}

function getMessageTimestampMs(msg?: Partial<Message> | null): number {
  if (!msg) return 0;
  const raw = msg.createdAt || msg.timestamp;
  if (!raw) return 0;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawFallbackPulseIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const pad = Math.round(size * 0.04);
  const iconSize = size - pad * 2;
  const grad = ctx.createLinearGradient(pad, pad, size - pad, size - pad);
  grad.addColorStop(0, '#60a5fa');
  grad.addColorStop(0.55, '#3b82f6');
  grad.addColorStop(1, '#2563eb');

  traceRoundedRect(ctx, pad, pad, iconSize, iconSize, Math.round(size * 0.24));
  ctx.fillStyle = grad;
  ctx.fill();

  // Signature Pulse ECG wave
  ctx.beginPath();
  ctx.moveTo(size * 0.16, size * 0.56);
  ctx.lineTo(size * 0.31, size * 0.56);
  ctx.lineTo(size * 0.39, size * 0.34);
  ctx.lineTo(size * 0.49, size * 0.72);
  ctx.lineTo(size * 0.57, size * 0.44);
  ctx.lineTo(size * 0.65, size * 0.56);
  ctx.lineTo(size * 0.84, size * 0.56);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2.5, Math.round(size * 0.065));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawSingleBadgedFaviconFrame(
  unreadCount: number,
  baseImage: HTMLImageElement | null,
  pulsePhase: 0 | 1
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);

  // Subtle inset bottom-left so the glowing badge never clips out of bounds
  const baseSize = 54;
  const baseX = 0;
  const baseY = FAVICON_SIZE - baseSize;

  if (baseImage && baseImage.complete && baseImage.naturalWidth > 0) {
    ctx.drawImage(baseImage, baseX, baseY, baseSize, baseSize);
  } else {
    ctx.save();
    ctx.translate(baseX, baseY);
    drawFallbackPulseIcon(ctx, baseSize);
    ctx.restore();
  }

  const label = unreadCount > MAX_TAB_UNREAD_COUNT
    ? `${MAX_TAB_UNREAD_COUNT}+`
    : String(Math.floor(unreadCount));
  const pillWidth = label.length >= 3 ? 42 : label.length === 2 ? 35 : 30;
  const pillHeight = 30;
  const pillX = FAVICON_SIZE - pillWidth - 1;
  const pillY = 1;
  const pillRadius = pillHeight / 2;

  // Soft animated glow halo on peak phase
  ctx.save();
  traceRoundedRect(ctx, pillX - 1, pillY - 1, pillWidth + 2, pillHeight + 2, pillRadius + 1);
  ctx.strokeStyle = pulsePhase === 0 ? 'rgba(34, 211, 238, 0.55)' : 'rgba(59, 130, 246, 0.25)';
  ctx.lineWidth = pulsePhase === 0 ? 4 : 2;
  ctx.stroke();
  ctx.restore();

  // Dark cutout halo to cleanly separate badge from the blue icon and tab chrome
  traceRoundedRect(ctx, pillX, pillY, pillWidth, pillHeight, pillRadius);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Vibrant Pulse cyan/blue gradient badge
  const badgeGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillWidth, pillY + pillHeight);
  if (pulsePhase === 0) {
    badgeGrad.addColorStop(0, '#22d3ee');
    badgeGrad.addColorStop(0.55, '#06b6d4');
    badgeGrad.addColorStop(1, '#2563eb');
  } else {
    badgeGrad.addColorStop(0, '#3b82f6');
    badgeGrad.addColorStop(1, '#1d4ed8');
  }
  traceRoundedRect(ctx, pillX, pillY, pillWidth, pillHeight, pillRadius);
  ctx.fillStyle = badgeGrad;
  ctx.fill();

  // Crisp inner highlight rim
  ctx.strokeStyle = pulsePhase === 0 ? 'rgba(255, 255, 255, 0.92)' : 'rgba(191, 219, 254, 0.72)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Crisp unread count label
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${label.length >= 3 ? 16 : label.length === 2 ? 18 : 20}px "Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, pillX + pillWidth / 2, pillY + pillHeight / 2 + 1);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function renderBadgedFaviconFrames(
  unreadCount: number,
  baseImage: HTMLImageElement | null
): [string, string] | null {
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) return null;
  const frame0 = drawSingleBadgedFaviconFrame(unreadCount, baseImage, 0);
  const frame1 = drawSingleBadgedFaviconFrame(unreadCount, baseImage, 1);
  if (!frame0) return null;
  return [frame0, frame1 || frame0];
}

function isWindowOrTabIdle(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState === 'hidden') return true;
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true;
  return false;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches);
}

/**
 * Displays a Pulse-themed unread indicator and glowing favicon badge in the browser tab
 * whenever new incoming chat messages arrive while the user is in another tab, window, or app.
 * Automatically skips touch-only mobile/tablet devices where desktop tab indicators do not apply.
 */
export function useTabUnreadIndicator({
  roomId,
  userId,
  enabled,
  baseTitle,
}: UseTabUnreadIndicatorProps): void {
  const baseTitlePropRef = useRef<string | undefined>(baseTitle);
  const baseTitleRef = useRef<string>(baseTitle || DEFAULT_TAB_TITLE);
  const isAppliedRef = useRef(false);
  const unreadIdsRef = useRef<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const baselineTimestampMsRef = useRef<number>(0);
  const savedIconLinksRef = useRef<SavedIconLinkDescriptor[] | null>(null);
  const dynamicIconLinkRef = useRef<HTMLLinkElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const cachedFramesRef = useRef<{ count: number; frames: [string, string] | null }>({
    count: 0,
    frames: null,
  });
  const pulseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulsePhaseRef = useRef<0 | 1>(0);

  baseTitlePropRef.current = baseTitle;

  useEffect(() => {
    if (typeof document === 'undefined' || !baseTitle || !baseTitle.trim()) return;
    baseTitleRef.current = baseTitle.trim();
    if (isAppliedRef.current && unreadIdsRef.current.size > 0) {
      document.title = formatUnreadTabTitle(unreadIdsRef.current.size, baseTitleRef.current);
    }
  }, [baseTitle]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (!enabled || isTouchDevice()) {
      return;
    }

    let cancelled = false;

    const recordKnownId = (id: string) => {
      if (!id) return;
      if (knownIdsRef.current.has(id)) return;
      knownIdsRef.current.add(id);
      if (knownIdsRef.current.size > MAX_KNOWN_IDS_CACHE) {
        const oldest = knownIdsRef.current.values().next().value;
        if (oldest) {
          knownIdsRef.current.delete(oldest);
        }
      }
    };

    const stopPulseTimer = () => {
      if (pulseTimerRef.current) {
        clearInterval(pulseTimerRef.current);
        pulseTimerRef.current = null;
      }
    };

    const restoreOriginalIcons = () => {
      if (typeof document === 'undefined' || !document.head) return;
      if (dynamicIconLinkRef.current && dynamicIconLinkRef.current.parentNode) {
        dynamicIconLinkRef.current.parentNode.removeChild(dynamicIconLinkRef.current);
      }
      dynamicIconLinkRef.current = null;

      if (savedIconLinksRef.current && savedIconLinksRef.current.length > 0) {
        const currentIcons = document.head.querySelectorAll('link[rel*="icon"]');
        currentIcons.forEach((node) => node.parentNode?.removeChild(node));

        savedIconLinksRef.current.forEach((desc) => {
          const link = document.createElement('link');
          link.rel = desc.rel;
          if (desc.type) link.type = desc.type;
          if (desc.sizes) link.setAttribute('sizes', desc.sizes);
          link.href = desc.href;
          document.head.appendChild(link);
        });
        savedIconLinksRef.current = null;
      }
    };

    const applyFaviconFrame = (dataUrl: string | null) => {
      if (typeof document === 'undefined' || !document.head || !dataUrl) return;

      if (!savedIconLinksRef.current) {
        const existingIcons = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]'));
        savedIconLinksRef.current = existingIcons.map((el) => ({
          rel: el.getAttribute('rel') || 'icon',
          type: el.getAttribute('type') || '',
          sizes: el.getAttribute('sizes') || '',
          href: el.getAttribute('href') || '',
        }));
        existingIcons.forEach((el) => el.parentNode?.removeChild(el));
      }

      if (!dynamicIconLinkRef.current) {
        const badgeLink = document.createElement('link');
        badgeLink.rel = 'icon';
        badgeLink.type = 'image/png';
        badgeLink.setAttribute('sizes', `${FAVICON_SIZE}x${FAVICON_SIZE}`);
        badgeLink.setAttribute('data-pulse-tab-badge', 'true');
        document.head.appendChild(badgeLink);
        dynamicIconLinkRef.current = badgeLink;
      }

      if (dynamicIconLinkRef.current.href !== dataUrl) {
        dynamicIconLinkRef.current.href = dataUrl;
      }
    };

    const resetTitleAndIcons = () => {
      stopPulseTimer();
      pulsePhaseRef.current = 0;
      if (isAppliedRef.current) {
        document.title = baseTitleRef.current || DEFAULT_TAB_TITLE;
        restoreOriginalIcons();
        isAppliedRef.current = false;
      }
    };

    const syncIndicatorUI = () => {
      const count = unreadIdsRef.current.size;
      if (count <= 0) {
        resetTitleAndIcons();
        return;
      }

      if (!isAppliedRef.current) {
        if (baseTitlePropRef.current && baseTitlePropRef.current.trim()) {
          baseTitleRef.current = baseTitlePropRef.current.trim();
        } else {
          const currentTitle = document.title || DEFAULT_TAB_TITLE;
          baseTitleRef.current = currentTitle.startsWith('(') ? DEFAULT_TAB_TITLE : currentTitle;
        }
      }

      isAppliedRef.current = true;
      document.title = formatUnreadTabTitle(count, baseTitleRef.current);

      if (cachedFramesRef.current.count !== count || !cachedFramesRef.current.frames) {
        cachedFramesRef.current = {
          count,
          frames: renderBadgedFaviconFrames(count, baseImageRef.current),
        };
      }

      const frames = cachedFramesRef.current.frames;
      if (frames) {
        applyFaviconFrame(frames[pulsePhaseRef.current]);
        if (!pulseTimerRef.current && !prefersReducedMotion()) {
          pulseTimerRef.current = setInterval(() => {
            if (cancelled || unreadIdsRef.current.size <= 0) return;
            pulsePhaseRef.current = pulsePhaseRef.current === 0 ? 1 : 0;
            const currentFrames = cachedFramesRef.current.frames;
            if (currentFrames) {
              applyFaviconFrame(currentFrames[pulsePhaseRef.current]);
            }
          }, TAB_BADGE_PULSE_INTERVAL_MS);
        }
      }
    };

    const clearUnread = () => {
      if (unreadIdsRef.current.size > 0) {
        unreadIdsRef.current.clear();
      }
      resetTitleAndIcons();
    };

    const syncIdleOrClear = () => {
      if (!isWindowOrTabIdle()) {
        clearUnread();
      }
    };

    // Reset tracking when switching room/user session
    unreadIdsRef.current.clear();
    knownIdsRef.current.clear();
    baselineTimestampMsRef.current = 0;
    resetTitleAndIcons();

    // Preload crisp Pulse icon for zero-latency canvas badge rendering
    if (!baseImageRef.current && typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        baseImageRef.current = img;
        cachedFramesRef.current = { count: 0, frames: null };
        if (unreadIdsRef.current.size > 0) {
          syncIndicatorUI();
        }
      };
      img.src = '/favicon-32x32.png';
    }

    const handleNewMessage = (evt: Event) => {
      const detail = (evt as CustomEvent<{ message?: Message; roomId?: string }>).detail;
      if (!detail || !detail.message) return;
      if (detail.roomId && detail.roomId !== roomId) return;

      const msg = detail.message;
      const msgId = normalizeMessageId(msg.id || msg._id);
      if (msgId) {
        const alreadyKnown = knownIdsRef.current.has(msgId);
        recordKnownId(msgId);
        if (alreadyKnown) return;
      }

      const msgTs = getMessageTimestampMs(msg);
      if (msgTs > baselineTimestampMsRef.current) {
        baselineTimestampMsRef.current = msgTs;
      }

      if (msg.type === 'system_notification' || msg.userId === userId || msg.isDeleted) {
        return;
      }
      if (msgId && getDeletedForMeIds(userId).has(msgId)) {
        return;
      }

      if (!isWindowOrTabIdle()) {
        return;
      }

      const unreadKey = msgId || `msg_${Date.now()}_${unreadIdsRef.current.size + 1}`;
      unreadIdsRef.current.add(unreadKey);
      syncIndicatorUI();
    };

    const handleHistorySynced = (evt: Event) => {
      const detail = (evt as CustomEvent<{ messages?: Message[]; roomId?: string; isInitial?: boolean }>).detail;
      if (!detail || !Array.isArray(detail.messages)) return;
      if (detail.roomId && detail.roomId !== roomId) return;

      const deletedForMe = getDeletedForMeIds(userId);
      const isIdle = isWindowOrTabIdle();
      const shouldCountMissed = !detail.isInitial && isIdle;
      let addedUnread = false;
      let nextBaseline = baselineTimestampMsRef.current;

      for (const msg of detail.messages) {
        const msgId = normalizeMessageId(msg.id || msg._id);
        const alreadyKnown = msgId ? knownIdsRef.current.has(msgId) : false;
        if (msgId) {
          recordKnownId(msgId);
        }
        const msgTs = getMessageTimestampMs(msg);
        if (msgTs > nextBaseline) {
          nextBaseline = msgTs;
        }
        if (
          shouldCountMissed &&
          !alreadyKnown &&
          msgTs > baselineTimestampMsRef.current &&
          msg.type !== 'system_notification' &&
          msg.userId !== userId &&
          !msg.isDeleted &&
          (!msgId || !deletedForMe.has(msgId))
        ) {
          unreadIdsRef.current.add(msgId || `sync_${msgTs}_${unreadIdsRef.current.size + 1}`);
          addedUnread = true;
        }
      }

      baselineTimestampMsRef.current = nextBaseline;
      if (addedUnread) {
        syncIndicatorUI();
      } else if (!isIdle) {
        clearUnread();
      }
    };

    const handleMessageDeleted = (evt: Event) => {
      const detail = (evt as CustomEvent<{ ids?: string[] }>).detail;
      if (!detail || !Array.isArray(detail.ids) || unreadIdsRef.current.size === 0) return;
      let changed = false;
      for (const rawId of detail.ids) {
        const norm = normalizeMessageId(rawId);
        if (norm && unreadIdsRef.current.delete(norm)) {
          changed = true;
        }
      }
      if (changed) {
        syncIndicatorUI();
      }
    };

    const handleChatCleared = (evt: Event) => {
      const detail = (evt as CustomEvent<{ roomId?: string }>).detail;
      if (detail?.roomId && detail.roomId !== roomId) return;
      clearUnread();
    };

    document.addEventListener('visibilitychange', syncIdleOrClear);
    window.addEventListener('focus', syncIdleOrClear);
    window.addEventListener('blur', syncIdleOrClear);
    window.addEventListener('pulse:new_message', handleNewMessage);
    window.addEventListener('pulse:history_synced', handleHistorySynced);
    window.addEventListener('pulse:message_deleted', handleMessageDeleted);
    window.addEventListener('pulse:chat_cleared', handleChatCleared);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', syncIdleOrClear);
      window.removeEventListener('focus', syncIdleOrClear);
      window.removeEventListener('blur', syncIdleOrClear);
      window.removeEventListener('pulse:new_message', handleNewMessage);
      window.removeEventListener('pulse:history_synced', handleHistorySynced);
      window.removeEventListener('pulse:message_deleted', handleMessageDeleted);
      window.removeEventListener('pulse:chat_cleared', handleChatCleared);
      unreadIdsRef.current.clear();
      cachedFramesRef.current = { count: 0, frames: null };
      resetTitleAndIcons();
    };
  }, [roomId, userId, enabled]);
}
