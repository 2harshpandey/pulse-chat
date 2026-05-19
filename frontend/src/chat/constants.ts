// --- CHAT CONSTANTS ---

/** WhatsApp-equivalent message character limit. */
export const MAX_MESSAGE_LENGTH = 65536;

export const GIF_FETCH_LIMIT = 80;

export const getInputDraftKey = (userId: string): string => `pulseInputDraft_${userId}`;

export const isDesktopInteractionDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
};

export const INITIAL_HISTORY_BATCH_SIZE = 80;
export const HISTORY_PAGE_SIZE = 50;

/**
 * Minimum ms between two consecutive startReached triggers.
 * Virtuoso fires startReached on EVERY scroll frame when the user is near the
 * top. Without a cooldown we can repeatedly prepend near the threshold, which
 * causes visible anchor adjustments during slow upward scroll. A 1.5 s cooldown
 * means we only prepend once the user has slowed/stopped.
 */
export const START_REACHED_COOLDOWN_MS = 1500;

export const INITIAL_FIRST_ITEM_INDEX = 100000;

// No-op loggers — swap for real loggers during debugging
export const scrollLog = (..._args: unknown[]) => {};
export const quoteLog = (..._args: unknown[]) => {};
export const quoteWarn = (..._args: unknown[]) => {};

export const MAX_LINK_PREVIEW_CACHE_ENTRIES = 250;

export const VIRTUOSO_OVERSCAN_DESKTOP = 128;
export const VIRTUOSO_OVERSCAN_MOBILE = 96;
export const VIRTUOSO_VIEWPORT_BY_DESKTOP = { top: 240, bottom: 160 };
export const VIRTUOSO_VIEWPORT_BY_MOBILE = { top: 180, bottom: 120 };

export const MAX_NEW_MESSAGE_INDICATOR_COUNT = 99;
export const MAX_LOADED_MEDIA_TRACKING = 800;
export const MAX_QUOTE_JUMP_STACK_DEPTH = 64;
export const MAX_QUOTE_AUTO_LOAD_PAGES = 120;
export const QUOTE_JUMP_TARGET_TOP_RATIO = 0.42;

export const FULLSCREEN_RESTORE_VISIBILITY_MARGIN = 12;
export const FULLSCREEN_RESTORE_FALLBACK_DELAY_MS = 180;

export const PHOTO_LIGHTBOX_MIN_SCALE = 1;
export const PHOTO_LIGHTBOX_MAX_SCALE = 5;
export const PHOTO_LIGHTBOX_STEP = 0.28;
export const PHOTO_LIGHTBOX_WHEEL_SENSITIVITY = 0.00145;

export const LONG_PRESS_CANCEL_MOVE_PX = 8;

export const MIN_REPORT_REASON_LENGTH = 5;
export const MAX_REPORT_REASON_LENGTH = 500;

/** Playback speed options for the video player. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
