// --- CHAT CONSTANTS ---

/** WhatsApp-equivalent message character limit. */
export const MAX_MESSAGE_LENGTH = 5000;

export const getInputDraftKey = (userId: string, roomId?: string): string => {
  const cleanRoom = typeof roomId === 'string' && roomId.trim() ? roomId.trim() : '';
  return cleanRoom ? `pulseInputDraft_${cleanRoom}_${userId}` : `pulseInputDraft_${userId}`;
};

export const isDesktopInteractionDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
};

export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isWindowsDesktop = /Windows NT/i.test(userAgent);
  const isMacDesktop = /Macintosh/i.test(userAgent) && !(typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  const isLinuxDesktop = /Linux/i.test(userAgent) && !/Android/i.test(userAgent) && !/jsdom/i.test(userAgent);

  // Desktop operating systems (Windows, macOS desktop, desktop Linux) are never touch-only devices
  if (isWindowsDesktop || isMacDesktop || isLinuxDesktop) {
    return false;
  }

  const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  if (typeof window.matchMedia === 'function') {
    // If ANY fine pointer (mouse/trackpad) or hover capability exists, this is a desktop/laptop environment
    const hasFinePointer = Boolean(
      window.matchMedia('(any-pointer: fine)')?.matches ||
      window.matchMedia('(pointer: fine)')?.matches
    );
    const canHover = Boolean(
      window.matchMedia('(any-hover: hover)')?.matches ||
      window.matchMedia('(hover: hover)')?.matches
    );

    // Desktop and laptop environments with mouse/trackpad or hover are NOT touch-only devices
    if (hasFinePointer || canHover) {
      return false;
    }

    const hasCoarsePointer = Boolean(
      window.matchMedia('(pointer: coarse)')?.matches ||
      window.matchMedia('(any-pointer: coarse)')?.matches
    );
    if (hasCoarsePointer && !hasFinePointer) {
      return true;
    }
  }

  const hasTouchCapability =
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0);

  return Boolean(isMobileUserAgent && hasTouchCapability);
};

export const INITIAL_HISTORY_BATCH_SIZE = 80;
export const HISTORY_PAGE_SIZE = 50;

/**
 * Maximum number of messages kept in React state at any time.
 * When prepending older messages pushes the array above this cap,
 * messages are evicted from the tail (newest end) of the window.
 * Symmetric eviction from the head happens on forward (newer) loads.
 * 200 gives ~10 viewport-heights of buffer on both sides.
 */
export const MAX_MESSAGES_WINDOW = 200;

/**
 * Pixels from the BOTTOM of the scroller at which we start loading
 * newer messages (when the user has scrolled back down after going up).
 * Kept intentionally large so the restore feels instant.
 */
export const NEWER_LOAD_TRIGGER_PX = 2500;

/**
 * Minimum ms between two consecutive startReached triggers.
 * Virtuoso fires startReached on EVERY scroll frame when the user is near the
 * top. Without a cooldown we can repeatedly prepend near the threshold, which
 * causes visible anchor adjustments during slow upward scroll. A 1.5 s cooldown
 * means we only prepend once the user has slowed/stopped.
 */
export const START_REACHED_COOLDOWN_MS = 250;

export const INITIAL_FIRST_ITEM_INDEX = 1000000;

// No-op loggers — swap for real loggers during debugging
export const scrollLog = (..._args: unknown[]) => {};
export const quoteLog = (..._args: unknown[]) => {};
export const quoteWarn = (..._args: unknown[]) => {};

export const MAX_LINK_PREVIEW_CACHE_ENTRIES = 250;

export const MAX_NEW_MESSAGE_INDICATOR_COUNT = 99;
export const MAX_LOADED_MEDIA_TRACKING = 800;
export const MAX_QUOTE_JUMP_STACK_DEPTH = 64;
export const MAX_QUOTE_AUTO_LOAD_PAGES = 120;

export const PHOTO_LIGHTBOX_MIN_SCALE = 1;
export const PHOTO_LIGHTBOX_MAX_SCALE = 5;
export const PHOTO_LIGHTBOX_STEP = 0.28;
export const PHOTO_LIGHTBOX_WHEEL_SENSITIVITY = 0.00145;

export const LONG_PRESS_CANCEL_MOVE_PX = 12;
export const LONG_PRESS_DURATION_MS = 370;

export const MIN_REPORT_REASON_LENGTH = 5;
export const MAX_REPORT_REASON_LENGTH = 500;

/** Playback speed options for the video player. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Canonical reaction set. Keep this list UTF-8 clean and shared by every quick-reaction picker. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export type QuickReaction = typeof QUICK_REACTIONS[number];

export type ReactionUser = { userId: string; username: string; isAlbum?: boolean };
export type ReactionMap = Record<string, ReactionUser[]>;

const FORBIDDEN_REACTION_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

export const normalizeReactionEmoji = (emoji: unknown): string | null => {
  if (typeof emoji !== 'string') return null;
  const normalized = emoji.trim().normalize('NFC');
  if (!normalized || normalized.length > 20 || FORBIDDEN_REACTION_KEYS.has(normalized)) return null;
  return normalized;
};

export const filterValidReactions = (rawReactions: unknown): ReactionMap => {
  if (!rawReactions || typeof rawReactions !== 'object') return {};

  const safeMap = new Map<string, ReactionUser[]>();
  const entries: [string, any][] = rawReactions instanceof Map
    ? Array.from(rawReactions.entries())
    : Object.entries(rawReactions as Record<string, unknown>);

  for (const [rawEmoji, users] of entries) {
    const emoji = normalizeReactionEmoji(rawEmoji);
    if (!emoji || !Array.isArray(users)) continue;

    const validUsers = users
      .map((user: any): ReactionUser | null => {
        if (typeof user === 'string') return { userId: user, username: user };
        if (!user || typeof user !== 'object' || typeof user.userId !== 'string') return null;
        return {
          userId: user.userId,
          username: typeof user.username === 'string' ? user.username : user.userId,
          ...(user.isAlbum ? { isAlbum: true } : {}),
        };
      })
      .filter((user): user is ReactionUser => Boolean(user));

    if (validUsers.length > 0) {
      const existing = safeMap.get(emoji) || [];
      safeMap.set(emoji, [...existing, ...validUsers]);
    }
  }

  return Object.fromEntries(safeMap);
};
