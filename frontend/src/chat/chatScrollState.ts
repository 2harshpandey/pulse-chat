// Central chat scrolling state tracker.
// Allows any component (like message touch gesture handlers) to instantly detect
// when the chat container is scrolling or has recently scrolled.

let lastChatScrollTime = 0;
const scrollListeners = new Set<() => void>();

/**
 * Record that a chat scroll event occurred.
 * Immediately invokes all registered scroll listeners to cancel active gestures.
 */
export const recordChatScroll = (): void => {
  lastChatScrollTime = Date.now();
  for (const listener of scrollListeners) {
    try {
      listener();
    } catch (_) {}
  }
};

/**
 * Get the timestamp (ms) of the most recent chat scroll event.
 */
export const getLastChatScrollTime = (): number => {
  return lastChatScrollTime;
};

/**
 * Check if the chat is actively scrolling or was scrolling within the given threshold (default 250ms).
 */
export const isChatActivelyScrolling = (thresholdMs: number = 250): boolean => {
  return Date.now() - lastChatScrollTime < thresholdMs;
};

/**
 * Subscribe a callback to be executed synchronously the instant chat scrolling occurs.
 * Returns an unsubscribe cleanup function.
 */
export const onChatScroll = (callback: () => void): (() => void) => {
  scrollListeners.add(callback);
  return () => {
    scrollListeners.delete(callback);
  };
};

/**
 * Reset scroll state (primarily for unit tests).
 */
export const resetChatScrollStateForTesting = (): void => {
  lastChatScrollTime = 0;
  scrollListeners.clear();
};

