// --- Shared In-Memory State ---
// Single source of truth for all runtime Maps/Sets shared across
// route modules and the WebSocket handler. Grouped by roomId.

const roomStates = new Map(); // Map<roomId, RoomState>

class RoomState {
  constructor(roomId) {
    this.roomId = roomId;
    this.onlineUsers = new Map();       // Map<userId, { userId, username }>
    this.typingUsers = new Map();       // Map<userId, 'typing' | 'gif_selecting'>
    this.adminClients = new Set();      // Set<WebSocket>
    this.pendingDisconnects = new Map(); // Map<userId, timerId>
    this.filePickerPresenceGrace = new Map(); // Map<userId, expiresAtMs>
    this.filePickerPresenceByUsername = new Map(); // Map<usernameLower, { userId, ip, expiresAt }>
    this.loggedInUsers = new Map();     // Map<userId, { userId, username, loginTime, ip, userAgent, viaTempLink? }>
    this.pinnedMessages = [];           // Array of pinned message objects
    this.pinnedMessagesLoaded = false;  // Boolean
    this.frontendHiddenBefore = null;   // Date | null
  }
}

const getRoomState = (roomId) => {
  if (!roomId) roomId = 'me';
  if (!roomStates.has(roomId)) {
    roomStates.set(roomId, new RoomState(roomId));
  }
  return roomStates.get(roomId);
};

// Global level states (not per room)
const userFingerprints = new Map();  // Map<userId, { ips: Set, userAgents: Set, deviceHashes: Set, ... }>

// Periodic in-memory state hygiene (runs hourly) to prevent memory creep
const pruneStaleState = () => {
  const now = Date.now();
  const maxAgeMs = 48 * 60 * 60 * 1000; // 48 hours

  // Cap global fingerprints to prevent unbounded heap growth
  if (userFingerprints.size > 1000) {
    const keysToDelete = Array.from(userFingerprints.keys()).slice(0, userFingerprints.size - 500);
    for (const key of keysToDelete) {
      userFingerprints.delete(key);
    }
  }

  // Prune per-room states
  for (const state of roomStates.values()) {
    // Prune expired file picker grace tokens
    for (const [userId, expiresAt] of state.filePickerPresenceGrace.entries()) {
      if (expiresAt < now) {
        state.filePickerPresenceGrace.delete(userId);
      }
    }
    if (state.filePickerPresenceByUsername) {
      for (const [usernameKey, info] of state.filePickerPresenceByUsername.entries()) {
        if (!info || info.expiresAt < now) {
          state.filePickerPresenceByUsername.delete(usernameKey);
        }
      }
    }

    // Prune inactive logged-in users who aren't online and logged in >48h ago
    for (const [userId, info] of state.loggedInUsers.entries()) {
      if (!state.onlineUsers.has(userId) && info.loginTime) {
        const age = now - new Date(info.loginTime).getTime();
        if (age > maxAgeMs) {
          state.loggedInUsers.delete(userId);
        }
      }
    }
  }
};

if (typeof setInterval !== 'undefined') {
  setInterval(pruneStaleState, 60 * 60 * 1000).unref();
}

// --- Tuning Constants ---
const INITIAL_HISTORY_BATCH_SIZE = 80;
const DEFAULT_HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 500;
const MAX_HISTORY = 5000;
const MIN_REPORT_REASON_LENGTH = 5;
const MAX_REPORT_REASON_LENGTH = 500;
const MAX_REPORTED_JOIN_HISTORY = 25;

module.exports = {
  roomStates,
  getRoomState,
  userFingerprints,
  INITIAL_HISTORY_BATCH_SIZE,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
  MAX_HISTORY,
  MIN_REPORT_REASON_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_REPORTED_JOIN_HISTORY,
};
