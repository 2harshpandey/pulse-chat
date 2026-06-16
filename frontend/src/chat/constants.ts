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

export const INITIAL_FIRST_ITEM_INDEX = 1000000;

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

/** Canonical reaction set. Keep this list UTF-8 clean and shared by every quick-reaction picker. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export type QuickReaction = typeof QUICK_REACTIONS[number];

const QUICK_REACTION_SET = new Set<string>(QUICK_REACTIONS);

export type ReactionUser = { userId: string; username: string };
export type ReactionMap = Record<string, ReactionUser[]>;

export const normalizeReactionEmoji = (emoji: unknown): QuickReaction | null => {
  if (typeof emoji !== 'string') return null;
  const normalized = emoji.trim().normalize('NFC');
  return QUICK_REACTION_SET.has(normalized) ? normalized as QuickReaction : null;
};

export const filterValidReactions = (rawReactions: unknown): ReactionMap => {
  const normalizedReactions: ReactionMap = {};
  if (!rawReactions || typeof rawReactions !== 'object') return normalizedReactions;

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
        return { userId: user.userId, username: typeof user.username === 'string' ? user.username : user.userId };
      })
      .filter((user): user is ReactionUser => Boolean(user));

    if (validUsers.length > 0) {
      normalizedReactions[emoji] = [...(normalizedReactions[emoji] || []), ...validUsers];
    }
  }

  return normalizedReactions;
};
