// --- Shared In-Memory State ---
// Single source of truth for all runtime Maps/Sets shared across
// route modules and the WebSocket handler. Grouped by roomId.

const roomStates = new Map(); // Map<roomId, RoomState>

class RoomState {
  constructor(roomId) {
    this.roomId = roomId;
    this.onlineUsers = new Map();       // Map<userId, { userId, username }>
    this.typingUsers = new Map();       // Map<userId, 'typing' | 'gif_selecting'>
    this.typingTimeouts = new Map();    // Map<userId, NodeJS.Timeout>
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

// Global level states (not per room)
const userFingerprints = new Map();  // Map<userId, { ips: Set, userAgents: Set, deviceHashes: Set, ... }>

// Periodic in-memory state hygiene (runs hourly and on-demand) to prevent memory creep
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

  // Prune idle custom room states (excluding 'me' and 'global') to prevent memory leaks from arbitrary room IDs
  for (const [roomId, state] of roomStates.entries()) {
    if (roomId === 'me' || roomId === 'global') continue;
    if (state.frontendHiddenBefore) continue;
    const isIdle =
      state.onlineUsers.size === 0 &&
      state.adminClients.size === 0 &&
      state.loggedInUsers.size === 0 &&
      state.pendingDisconnects.size === 0 &&
      state.typingUsers.size === 0;
    if (isIdle) {
      roomStates.delete(roomId);
    }
  }
};

// Interval is set below after getCachedRoom is defined, so it also prunes the room cache.

const getRoomState = (roomId) => {
  if (!roomId) roomId = 'me';
  if (roomStates.size >= 1000 && !roomStates.has(roomId)) {
    pruneStaleState();
  }
  if (!roomStates.has(roomId)) {
    roomStates.set(roomId, new RoomState(roomId));
  }
  return roomStates.get(roomId);
};

const deleteRoomState = (roomId) => {
  if (!roomId || roomId === 'me' || roomId === 'global') return;
  const state = roomStates.get(roomId);
  if (state) {
    state.onlineUsers.clear();
    state.loggedInUsers.clear();
    state.typingUsers.clear();
    if (state.typingTimeouts) {
      for (const timer of state.typingTimeouts.values()) {
        try { clearTimeout(timer); } catch (_) {}
      }
      state.typingTimeouts.clear();
    }
    if (state.pendingDisconnects) {
      for (const timer of state.pendingDisconnects.values()) {
        try { clearTimeout(timer); } catch (_) {}
      }
      state.pendingDisconnects.clear();
    }
    state.filePickerPresenceGrace.clear();
    if (state.filePickerPresenceByUsername) {
      state.filePickerPresenceByUsername.clear();
    }
    state.pinnedMessages = [];
    roomStates.delete(roomId);
  }
  invalidateCachedRoom(roomId);
};

// --- Tuning Constants ---
const INITIAL_HISTORY_BATCH_SIZE = 80;
const DEFAULT_HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 500;
const MIN_REPORT_REASON_LENGTH = 5;
const MAX_REPORT_REASON_LENGTH = 500;
const MAX_REPORTED_JOIN_HISTORY = 25;

// --- Issue 16: Room Metadata Cache ---
// Room documents change infrequently (name, password, alias) but are looked up on every
// HTTP request and WebSocket event. This simple TTL cache eliminates N+1 DB round trips.
// Lazy-require Room model to avoid circular dependency issues at startup.
const _roomMetaCache = new Map(); // idOrAlias -> { room: Object, ts: number }
const ROOM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getCachedRoom = async (idOrAlias) => {
  if (!idOrAlias || typeof idOrAlias !== 'string') return null;
  const hit = _roomMetaCache.get(idOrAlias);
  if (hit && (Date.now() - hit.ts) < ROOM_CACHE_TTL_MS) return hit.room;

  let Room;
  try { Room = require('./models/room'); } catch { return null; }

  const room = await Room.findOne({ $or: [{ id: idOrAlias }, { alias: idOrAlias }] }).lean();
  if (room) {
    const entry = { room, ts: Date.now() };
    _roomMetaCache.set(room.id, entry);
    if (room.alias) _roomMetaCache.set(room.alias, entry);
  }
  return room;
};

const invalidateCachedRoom = (idOrAlias) => {
  if (!idOrAlias) return;
  const hit = _roomMetaCache.get(idOrAlias);
  if (hit?.room) {
    _roomMetaCache.delete(hit.room.id);
    if (hit.room.alias) _roomMetaCache.delete(hit.room.alias);
  }
  _roomMetaCache.delete(idOrAlias);
};

// Single combined hourly prune: room state + room metadata cache
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    pruneStaleState();
    const cutoff = Date.now() - ROOM_CACHE_TTL_MS;
    for (const [key, entry] of _roomMetaCache.entries()) {
      if (entry.ts < cutoff) _roomMetaCache.delete(key);
    }
  }, 60 * 60 * 1000).unref();
}

module.exports = {
  roomStates,
  getRoomState,
  deleteRoomState,
  userFingerprints,
  getCachedRoom,
  invalidateCachedRoom,
  INITIAL_HISTORY_BATCH_SIZE,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
  MIN_REPORT_REASON_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_REPORTED_JOIN_HISTORY,
};
