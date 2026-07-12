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
