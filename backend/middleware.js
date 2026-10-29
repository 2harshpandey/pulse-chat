// --- Rate Limiters, Admin Auth Middleware, and Shared Request Helpers ---

const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const logger = require('./logger');
const { filterValidReactions } = require('./reactions');
const BlockedUser = require('./models/blockedUser');
const LoginLockdown = require('./models/loginLockdown');
const Room = require('./models/room');
const AuditLog = require('./models/auditLog');
const { timingSafeEqualStr, verifyPassword } = require('./security');

let _broadcastToAdmins = () => {};
const setBroadcast = (fn) => { if (typeof fn === 'function') _broadcastToAdmins = fn; };

// --- IP Helpers ---

// Azure App Service (and some other reverse proxies) sometimes appends the client
// port to the IP in X-Forwarded-For, e.g. "122.172.137.121:54061".
// express-rate-limit v8 performs strict IP validation and throws
// ERR_ERL_INVALID_IP_ADDRESS when it sees a port number.
//
// This custom key generator:
//  1. Strips any trailing port that Azure's proxy may inject.
//  2. Wraps the result with ipKeyGenerator() so express-rate-limit can
//     apply IPv6 subnet masking (avoids ERR_ERL_KEY_GEN_IPV6).
const getClientIp = (req) => {
  // After app.set('trust proxy', 1), req.ip is the authoritative value
  // cleaned and validated by Express. Do NOT manually re-read X-Forwarded-For
  // as that allows IP spoofing by injecting values into the header chain.
  let raw = '';
  try {
    raw = req.ip;
  } catch (_) {}
  // Fallback only to socket address (safe — not user-controlled)
  if (!raw) {
    raw = req.socket?.remoteAddress || '127.0.0.1';
  }
  // Handle bare IPv4+port:     "1.2.3.4:5678"  → "1.2.3.4"
  // Handle bracketed IPv6+port: "[::1]:5678"   → "::1"
  let cleaned = String(raw || '127.0.0.1')
    .replace(/^\[(.+)\]:\d+$/, '$1')  // [IPv6]:port  → IPv6
    .replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1'); // IPv4:port → IPv4
  if (!cleaned || cleaned === 'unknown' || cleaned === 'undefined') {
    cleaned = '127.0.0.1';
  }
  try {
    return ipKeyGenerator(cleaned);
  } catch (_) {
    return '127.0.0.1';
  }
};

// Clean IP for use inside route/WS handlers (not for rate-limiter key generation).
const extractIp = (req) => {
  // After app.set('trust proxy', 1), req.ip is the authoritative value.
  // Do NOT manually re-read X-Forwarded-For — that allows spoofing.
  // For raw WebSocket IncomingMessage objects where req.ip may be undefined,
  // fall back only to the socket's direct remote address (never user-controlled).
  let raw = '';
  try {
    raw = req.ip;
  } catch (_) {}
  if (!raw) {
    raw = req.socket?.remoteAddress || '127.0.0.1';
  }
  const cleaned = String(raw || '127.0.0.1')
    .replace(/^\[(.+)\]:\d+$/, '$1')
    .replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1');
  return (cleaned && cleaned !== 'undefined' && cleaned !== 'unknown') ? cleaned : '127.0.0.1';
};

// --- Rate Limiters ---
// Prevent brute-force and abuse on public/sensitive endpoints.

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                 // 100 attempts per window (avoids locking out shared NAT / office IPs)
  skipSuccessfulRequests: true, // Successful logins & room entries do not consume rate limit quota
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, default: true },
  keyGenerator: getClientIp,
  message: { error: 'Too many login attempts. Please wait a few minutes before trying again.' },
  handler: (req, res, _next, options) => {
    const ip = extractIp(req);
    const roomId = req.body?.roomId || req.body?.id || req.query?.roomId || req.headers['x-room-id'] || 'me';
    const userAgent = req.headers['user-agent'] || '';
    const username = req.body?.username || req.query?.username;
    AuditLog.create({
      roomId,
      type: 'join_failed_rate_limit',
      details: {
        reason: 'Too many authentication attempts (exceeded 100 requests per 15-minute window)',
        username,
      },
      ip,
      userAgent,
    }).then((entry) => {
      _broadcastToAdmins(roomId, 'audit_log', entry);
      _broadcastToAdmins(roomId, 'activity', `Security warning: Auth rate limit triggered on room '${roomId}' for IP ${ip}.`);
    }).catch(() => {});
    return res.status(options.statusCode).json(options.message);
  },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, default: true },
  keyGenerator: getClientIp,
  message: { error: 'Too many uploads, please try again later.' },
});

const chunkUploadLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 300,                 // 300 chunks per minute (allows fast chunked uploads)
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, default: true },
  keyGenerator: getClientIp,
  message: { error: 'Too many uploads, please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, default: true },
  keyGenerator: getClientIp,
  message: { error: 'Too many requests, please try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, default: true },
  keyGenerator: getClientIp,
  message: { error: 'Too many requests, please try again later.' },
});

const diagnosticLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 30,                  // 30 diagnostic telemetry reports per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, default: true },
  keyGenerator: getClientIp,
  message: { error: 'Too many diagnostic reports, please try again later.' },
});

// --- Password Attempt Rate Limiting ---
const passwordAttemptLocks = new Map(); // key: { count, lockUntil }

// Periodic cleanup of expired password attempt locks to prevent memory accumulation
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of passwordAttemptLocks.entries()) {
      if (v.lockUntil <= now && (!v.lastAttempt || now - v.lastAttempt > 10 * 60 * 1000)) {
        passwordAttemptLocks.delete(k);
      }
    }
  }, 10 * 60 * 1000).unref();
}

const checkPasswordRateLimit = (req, res, next) => {
  const ip = extractIp(req);
  const roomId = req.body?.roomId || req.body?.id || req.headers['x-room-id'] || 'me';
  const key = `${ip}_${roomId}`;

  // Prune expired entries if map grows large to prevent memory leak
  if (passwordAttemptLocks.size > 2000) {
    const now = Date.now();
    for (const [k, v] of passwordAttemptLocks.entries()) {
      if (v.lockUntil <= now) {
        passwordAttemptLocks.delete(k);
      }
    }
  }

  const record = passwordAttemptLocks.get(key);
  if (record && record.lockUntil > Date.now()) {
    const remaining = Math.ceil((record.lockUntil - Date.now()) / 1000);
    AuditLog.create({
      roomId,
      type: 'join_failed_rate_limit',
      details: {
        reason: `Temporary lockout active due to repeated failed attempts (${remaining}s remaining)`,
        remainingSeconds: remaining,
        username: req.body?.username,
      },
      ip,
      userAgent: req.headers['user-agent'] || '',
    }).then((entry) => {
      _broadcastToAdmins(roomId, 'audit_log', entry);
    }).catch(() => {});

    return res.status(429).json({ error: `Too many failed attempts. Locked out for ${remaining} seconds.` });
  }
  
  if (record && record.lockUntil <= Date.now()) {
    passwordAttemptLocks.delete(key);
  }
  
  req.passwordRateLimitKey = key;
  next();
};

const recordFailedPasswordAttempt = (key, req) => {
  const now = Date.now();
  let record = passwordAttemptLocks.get(key) || { count: 0, lockUntil: 0, lastAttempt: 0 };
  if (record.lastAttempt && (now - record.lastAttempt > 10 * 60 * 1000)) {
    record.count = 0;
  }
  record.count += 1;
  record.lastAttempt = now;
  if (record.count >= 5) {
    record.lockUntil = now + 60 * 1000; // 1 minute lockdown after 5 consecutive failures
    record.count = 0; // Reset count after lockdown starts so they get fresh tries later

    if (req) {
      const ip = extractIp(req);
      const roomId = req.body?.roomId || req.body?.id || req.headers['x-room-id'] || 'me';
      const userAgent = req.headers['user-agent'] || '';
      const username = req.body?.username;
      AuditLog.create({
        roomId,
        type: 'potential_bruteforce_detected',
        details: {
          attempts: 5,
          lockoutSeconds: 60,
          reason: '5 consecutive failed password attempts detected from this IP',
          username,
        },
        ip,
        userAgent,
      }).then((entry) => {
        _broadcastToAdmins(roomId, 'audit_log', entry);
        _broadcastToAdmins(roomId, 'activity', `Potential brute-force detected: IP ${ip} failed 5 consecutive password attempts on room '${roomId}'. Locked out for 60s.`);
      }).catch(() => {});
    }
  }
  passwordAttemptLocks.set(key, record);
};

const resetPasswordAttempts = (key) => {
  passwordAttemptLocks.delete(key);
};

// --- Admin Auth Middleware ---

// Middleware for admin authentication
const adminAuth = async (req, res, next) => {
  const password = typeof req.headers['x-admin-password'] === 'string' ? req.headers['x-admin-password'] : '';
  const rawRoomId = req.headers['x-room-id'];
  const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const ip = extractIp(req);
  const key = `${ip}_${roomId}`;
  req.passwordRateLimitKey = key;


  // Check lockout
  const record = passwordAttemptLocks.get(key);
  if (record && record.lockUntil > Date.now()) {
    const remaining = Math.ceil((record.lockUntil - Date.now()) / 1000);
    return res.status(429).json({ error: `Too many failed admin attempts. Locked out for ${remaining} seconds.` });
  }

  const handleFailure = () => {
    recordFailedPasswordAttempt(key, req);
    res.status(401).json({ error: 'Unauthorized' });
  };

  if (!password) {
    return handleFailure();
  }

  // Super Admin Impersonation: Global password unlocks any room
  if (process.env.ADMIN_PASSWORD && timingSafeEqualStr(password, process.env.ADMIN_PASSWORD)) {
    resetPasswordAttempts(key);
    if (roomId === 'me' || roomId === 'global') {
      req.roomId = roomId;
      req.isSuperAdmin = true;
      return next();
    } else {
      try {
        const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
        if (room) {
          req.roomId = room.id;
          req.isSuperAdmin = true;
          return next();
        } else {
          return res.status(404).json({ error: 'Room not found' });
        }
      } catch (error) {
        logger.error('Error in adminAuth super admin check:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  try {
    const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
    if (room && verifyPassword(password, room.adminPassword)) {
      resetPasswordAttempts(key);
      req.roomId = room.id;
      return next();
    }
    handleFailure();
  } catch (error) {
    logger.error('Error in adminAuth middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware for super-admin actions requiring a secret key
const adminSecretAuth = (req, res, next) => {
  const receivedSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_SECRET;

  if (receivedSecret && expectedSecret && timingSafeEqualStr(receivedSecret, expectedSecret)) {
    next();
  } else {
    logger.warn('Unauthorized attempt to access a secret-protected admin route.');
    res.status(403).json({ error: 'Forbidden' });
  }
};

// --- Device Fingerprinting ---

// Generate device hash from fingerprint components
const generateDeviceHash = (components) => {
  const str = [
    components.userAgent || '',
    components.screenResolution || '',
    components.platform || '',
    components.language || '',
    components.timezone || '',
  ].join('|');
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
};

// --- Block / Lockdown Checks ---

// Check if a user is blocked by any fingerprint match (single indexed query)
const isUserBlocked = async (roomId, userId, ip, userAgent, deviceFingerprint) => {
  if (!roomId) roomId = 'me';
  roomId = String(roomId).trim();

  let canonicalRoomId = roomId;
  if (roomId !== 'me' && roomId !== 'global') {
    try {
      const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
      if (room) canonicalRoomId = room.id;
    } catch (_) {}
  }
  const roomIds = (canonicalRoomId !== roomId) ? [canonicalRoomId, roomId] : [canonicalRoomId];

  const conditions = [];

  if (typeof userId === 'string' && userId.trim()) {
    conditions.push({ userId: { $eq: userId.trim() } });
  }

  if (ip && ip !== 'unknown' && typeof ip === 'string') {
    conditions.push({ 'fingerprints.ips': { $eq: ip } });
  }

  if (deviceFingerprint) {
    const hash = generateDeviceHash({ ...deviceFingerprint, userAgent });
    if (hash) {
      conditions.push({ 'fingerprints.deviceHashes': { $eq: hash } });
    }
  }

  if (conditions.length === 0) {
    return { blocked: false };
  }

  const blockedUser = await BlockedUser.findOne({
    roomId: { $in: roomIds },
    isBlocked: true,
    $or: conditions,
  }).lean();

  if (blockedUser) {
    let reason = 'User is blocked';
    if (typeof userId === 'string' && userId.trim() && blockedUser.userId === userId.trim()) {
      reason = 'User ID is blocked';
    } else if (ip && blockedUser.fingerprints?.ips?.includes(ip)) {
      reason = 'IP address is blocked';
    } else {
      reason = 'Device is blocked';
    }
    return { blocked: true, reason, blockedUser };
  }

  return { blocked: false };
};

// Check if login lockdown is active
const isLoginLocked = async (roomId) => {
  if (!roomId) roomId = 'me';
  roomId = String(roomId).trim();

  let canonicalRoomId = roomId;
  if (roomId !== 'me' && roomId !== 'global') {
    try {
      const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
      if (room) canonicalRoomId = room.id;
    } catch (_) {}
  }
  const roomIds = (canonicalRoomId !== roomId) ? [canonicalRoomId, roomId] : [canonicalRoomId];

  const lockdown = await LoginLockdown.findOne({ roomId: { $in: roomIds }, isActive: true }).sort({ createdAt: -1 });
  if (!lockdown) return { locked: false };

  // Check if lockdown has expired
  if (lockdown.endTime && new Date() > lockdown.endTime) {
    lockdown.isActive = false;
    await lockdown.save();
    return { locked: false };
  }

  return { locked: true, lockdown };
};

// --- Message Serialisation ---

// Convert Mongoose Map reactions to plain objects before JSON serialization and
// drop any legacy/corrupt reaction keys so mojibake can never leak to clients.
const toClientMessage = (msg) => {
  if (!msg) return msg;
  const plain = typeof msg.toObject === 'function' ? msg.toObject() : msg;
  return { ...plain, reactions: filterValidReactions(plain.reactions) };
};

// Strips sensitive bearer session tokens before transmitting logged-in user lists to admin clients
const toSafeLoggedInUserList = (loggedInUsers) => {
  if (!loggedInUsers) return [];
  const list = loggedInUsers instanceof Map ? Array.from(loggedInUsers.values()) : Array.from(loggedInUsers);
  return list.map(({ sessionToken, ...safeInfo }) => safeInfo);
};

const isPasswordLocked = (key) => {
  const record = passwordAttemptLocks.get(key);
  if (record && record.lockUntil > Date.now()) {
    return Math.ceil((record.lockUntil - Date.now()) / 1000);
  }
  return 0;
};

module.exports = {
  extractIp,
  authLimiter,
  uploadLimiter,
  chunkUploadLimiter,
  apiLimiter,
  adminLimiter,
  diagnosticLimiter,
  checkPasswordRateLimit,
  recordFailedPasswordAttempt,
  resetPasswordAttempts,
  isPasswordLocked,
  toSafeLoggedInUserList,
  adminAuth,
  adminSecretAuth,
  generateDeviceHash,
  isUserBlocked,
  isLoginLocked,
  toClientMessage,
  setBroadcast,
};
