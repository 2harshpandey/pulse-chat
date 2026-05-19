// --- Shared In-Memory State ---
// Single source of truth for all runtime Maps/Sets shared across
// route modules and the WebSocket handler. No imports — pure data.

const onlineUsers = new Map();       // Map<userId, { userId, username }>
const typingUsers = new Map();       // Map<userId, 'typing' | 'gif_selecting'>
const adminClients = new Set();      // Set<WebSocket>
const pendingDisconnects = new Map(); // Map<userId, timerId>
const filePickerPresenceGrace = new Map(); // Map<userId, expiresAtMs>
const loggedInUsers = new Map();     // Map<userId, { userId, username, loginTime, ip, userAgent, viaTempLink? }>
const userFingerprints = new Map();  // Map<userId, { ips: Set, userAgents: Set, deviceHashes: Set, ... }>

// Mutable singleton — wrapped in getter/setter so all modules share the same reference.
let _frontendHiddenBefore = null;
const getFrontendHiddenBefore = () => _frontendHiddenBefore;
const setFrontendHiddenBefore = (v) => { _frontendHiddenBefore = v; };

// --- Tuning Constants ---
const INITIAL_HISTORY_BATCH_SIZE = 80;
const DEFAULT_HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY = 5000;
const GLOBAL_CHAT_STATE_KEY = 'global';
const MIN_REPORT_REASON_LENGTH = 5;
const MAX_REPORT_REASON_LENGTH = 500;
const MAX_REPORTED_JOIN_HISTORY = 25;

module.exports = {
  onlineUsers,
  typingUsers,
  adminClients,
  pendingDisconnects,
  filePickerPresenceGrace,
  loggedInUsers,
  userFingerprints,
  getFrontendHiddenBefore,
  setFrontendHiddenBefore,
  INITIAL_HISTORY_BATCH_SIZE,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
  MAX_HISTORY,
  GLOBAL_CHAT_STATE_KEY,
  MIN_REPORT_REASON_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_REPORTED_JOIN_HISTORY,
};
