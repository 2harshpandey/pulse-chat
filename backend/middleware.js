// --- Rate Limiters, Admin Auth Middleware, and Shared Request Helpers ---

const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const logger = require('./logger');
const { filterValidReactions } = require('./reactions');
const BlockedUser = require('./models/blockedUser');
const LoginLockdown = require('./models/loginLockdown');
const Room = require('./models/room');
const AuditLog = require('./models/auditLog');
const { getCachedRoom, invalidateCachedRoom } = require('./state');
const { timingSafeEqualStr, hashPasswordAsync, verifyPasswordAsync } = require('./security');

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
    raw = req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
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
    raw = req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
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
  skip: (req) => req.path === '/api/upload/chunk',
  message: { error: 'Too many requests, please try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
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

const resolveCanonicalRoomTarget = async (rawRoomId) => {
  const clean = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const lower = clean.toLowerCase();
  if (lower === 'me' || lower === 'global') {
    return { clean, canonicalId: lower, canonicalLockKey: lower, room: null };
  }
  let room = null;
  try {
    room = await getCachedRoom(clean);
  } catch (_) {}
  const canonicalId = room?.id ? String(room.id).trim() : clean;
  return {
    clean,
    canonicalId,
    canonicalLockKey: canonicalId.toLowerCase(),
    room,
  };
};

const resolveCanonicalLockRoomKey = async (rawRoomId) => {
  const { canonicalLockKey } = await resolveCanonicalRoomTarget(rawRoomId);
  return canonicalLockKey;
};

const checkPasswordRateLimit = async (req, res, next) => {
  try {
    const ip = extractIp(req);
    const rawRoomId = req.body?.roomId || req.body?.id || req.headers['x-room-id'] || 'me';
    const roomId = await resolveCanonicalLockRoomKey(rawRoomId);
    const key = `${ip}_${roomId}`;

    // Prune expired entries if map grows large to prevent memory leak
    if (passwordAttemptLocks.size > 2000) {
      const now = Date.now();
      for (const [k, v] of passwordAttemptLocks.entries()) {
        if ((v.lockUntil > 0 && v.lockUntil <= now) || (!v.lastAttempt || now - v.lastAttempt > 10 * 60 * 1000)) {
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

    if (record && record.lockUntil > 0 && record.lockUntil <= Date.now()) {
      passwordAttemptLocks.delete(key);
    }

    req.passwordRateLimitKey = key;
    next();
  } catch (err) {
    next(err);
  }
};

const incrementLockoutCounter = (key, { maxAttempts, lockDurationMs, onLockout }) => {
  const now = Date.now();
  const record = passwordAttemptLocks.get(key) || { count: 0, lockUntil: 0, lastAttempt: 0 };
  if (record.lastAttempt && (now - record.lastAttempt > 10 * 60 * 1000)) {
    record.count = 0;
  }
  record.count += 1;
  record.lastAttempt = now;
  if (record.count >= maxAttempts) {
    record.lockUntil = now + lockDurationMs;
    record.count = 0; // Reset count after lockdown starts so callers get fresh tries after expiry
    if (typeof onLockout === 'function') {
      onLockout();
    }
  }
  passwordAttemptLocks.set(key, record);
};

const recordFailedPasswordAttempt = (key, req) => {
  incrementLockoutCounter(key, {
    maxAttempts: 5,
    lockDurationMs: 60 * 1000,
    onLockout: () => {
      if (!req) return;
      const ip = extractIp(req);
      const roomId = req.body?.roomId || req.body?.id || req.headers?.['x-room-id'] || 'me';
      const userAgent = req.headers?.['user-agent'] || '';
      const username = typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 100) : undefined;
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
    },
  });
};

const recordFailedAdminAttempt = (key, req) => {
  incrementLockoutCounter(key, {
    maxAttempts: 3,
    lockDurationMs: 180 * 1000,
    onLockout: () => {
      if (!req) return;
      const ip = extractIp(req);
      const roomId = req.body?.roomId || req.body?.id || req.headers?.['x-room-id'] || 'me';
      const userAgent = req.headers?.['user-agent'] || '';
      AuditLog.create({
        roomId,
        type: 'potential_admin_bruteforce',
        details: {
          attempts: 3,
          lockoutSeconds: 180,
          reason: '3 consecutive failed admin password attempts detected from this IP',
        },
        ip,
        userAgent,
      }).then((entry) => {
        _broadcastToAdmins(roomId, 'audit_log', entry);
        _broadcastToAdmins(roomId, 'activity', `Admin security alert: IP ${ip} failed 3 consecutive admin attempts on room '${roomId}'. Locked out for 180s.`);
      }).catch(() => {});
    },
  });
};

const resetPasswordAttempts = (key) => {
  passwordAttemptLocks.delete(key);
};

const getGlobalAdminLockKey = (ip) => `${ip || '127.0.0.1'}_global_admin`;

const getAdminLockRemainingSeconds = (roomKey, ip) => {
  const now = Date.now();
  const roomRec = passwordAttemptLocks.get(roomKey);
  const globalRec = passwordAttemptLocks.get(getGlobalAdminLockKey(ip));
  const roomRem = roomRec && roomRec.lockUntil > now ? Math.ceil((roomRec.lockUntil - now) / 1000) : 0;
  const globalRem = globalRec && globalRec.lockUntil > now ? Math.ceil((globalRec.lockUntil - now) / 1000) : 0;
  return Math.max(roomRem, globalRem);
};

const checkAdminPasswordRateLimit = (req, res, next) => {
  return checkPasswordRateLimit(req, res, (err) => {
    if (err) return next(err);
    const ip = extractIp(req);
    const remaining = isPasswordLocked(getGlobalAdminLockKey(ip));
    if (remaining > 0) {
      return res.status(429).json({ error: `Too many failed admin attempts. Locked out for ${remaining} seconds.` });
    }
    next();
  });
};

const recordFailedAdminAttemptAcrossScope = (roomKey, ip, req) => {
  recordFailedAdminAttempt(roomKey, req);
  const globalKey = getGlobalAdminLockKey(ip);
  if (globalKey !== roomKey) {
    // Pass null req to avoid duplicate AuditLog entries for the same failed request
    recordFailedAdminAttempt(globalKey, null);
  }
};

const resetAdminAttemptsAcrossScope = (roomKey, ip) => {
  resetPasswordAttempts(roomKey);
  resetPasswordAttempts(getGlobalAdminLockKey(ip));
};

// --- Admin Auth Middleware ---

const createAdminAuth = ({ auditOnFailure = false } = {}) => async (req, res, next) => {
  const password = typeof req.headers['x-admin-password'] === 'string' ? req.headers['x-admin-password'] : '';
  const rawRoomId = req.headers['x-room-id'];
  const { canonicalId, canonicalLockKey, room } = await resolveCanonicalRoomTarget(rawRoomId);
  const ip = extractIp(req);
  const key = `${ip}_${canonicalLockKey}`;
  req.passwordRateLimitKey = key;

  // Check lockout (both room-specific and cross-room global admin bucket)
  const remaining = getAdminLockRemainingSeconds(key, ip);
  if (remaining > 0) {
    return res.status(429).json({ error: `Too many failed admin attempts. Locked out for ${remaining} seconds.` });
  }

  const handleFailure = () => {
    recordFailedAdminAttemptAcrossScope(key, ip, req);
    if (auditOnFailure) {
      const userAgent = req.headers?.['user-agent'] || '';
      const logRoomId = canonicalId || 'unknown';
      AuditLog.create({
        roomId: logRoomId,
        type: 'admin_auth_failed',
        details: { reason: 'Incorrect admin password' },
        ip,
        userAgent,
      }).then((entry) => {
        _broadcastToAdmins(logRoomId, 'audit_log', entry);
        _broadcastToAdmins(logRoomId, 'activity', `Security warning: Failed admin operation attempt for room '${logRoomId}'.`);
      }).catch(() => {});
    }
    res.status(401).json({ error: 'Unauthorized' });
  };

  if (!password) {
    return handleFailure();
  }

  const isDefaultRoom = canonicalId === 'me' || canonicalId === 'global';

  // Super Admin Impersonation: Global password unlocks any existing room
  if (process.env.ADMIN_PASSWORD && timingSafeEqualStr(password, process.env.ADMIN_PASSWORD)) {
    resetAdminAttemptsAcrossScope(key, ip);
    if (isDefaultRoom) {
      req.roomId = canonicalId;
      req.isSuperAdmin = true;
      return next();
    }
    if (room) {
      req.roomId = room.id;
      req.isSuperAdmin = true;
      return next();
    }
    return res.status(404).json({ error: 'Room not found' });
  }

  try {
    if (room && await verifyPasswordAsync(password, room.adminPassword)) {
      resetAdminAttemptsAcrossScope(key, ip);
      if (room.adminPassword && !String(room.adminPassword).startsWith('scrypt$')) {
        try {
          const upgradedHash = await hashPasswordAsync(password);
          await Room.updateOne({ id: room.id }, { $set: { adminPassword: upgradedHash } });
          invalidateCachedRoom(room.id);
          if (room.alias) invalidateCachedRoom(room.alias);
        } catch (upgradeErr) {
          logger.error('Failed to upgrade legacy admin password:', upgradeErr);
        }
      }
      req.roomId = room.id;
      return next();
    }
    handleFailure();
  } catch (error) {
    logger.error('Error in adminAuth middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware for admin authentication
const adminAuth = createAdminAuth({ auditOnFailure: false });
const adminAuthWithAudit = createAdminAuth({ auditOnFailure: true });

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
  const { clean, canonicalId } = await resolveCanonicalRoomTarget(roomId);
  const roomIds = (canonicalId !== clean) ? [canonicalId, clean] : [canonicalId];

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
  const { clean, canonicalId } = await resolveCanonicalRoomTarget(roomId);
  const roomIds = (canonicalId !== clean) ? [canonicalId, clean] : [canonicalId];

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

// Strip hidden/deleted message payload fields before sending to regular chat clients
// (admin endpoints still use toClientMessage to inspect retained hidden messages).
const toPublicClientMessage = (msg) => {
  const clientMsg = toClientMessage(msg);
  if (!clientMsg || (!clientMsg.isDeleted && !clientMsg.vanished)) {
    return clientMsg;
  }
  const { text: _t, url: _u, originalName: _o, size: _s, duration: _d, waveform: _w, ...safeTombstone } = clientMsg;
  return safeTombstone;
};

// Strips sensitive bearer session tokens and token hashes before transmitting logged-in user lists to admin clients
const toSafeLoggedInUserList = (loggedInUsers) => {
  if (!loggedInUsers) return [];
  const list = loggedInUsers instanceof Map ? Array.from(loggedInUsers.values()) : Array.from(loggedInUsers);
  return list.map(({ sessionToken, sessionTokenHash, ...safeInfo }) => safeInfo);
};

const isPasswordLocked = (key) => {
  const record = passwordAttemptLocks.get(key);
  if (record && record.lockUntil > Date.now()) {
    return Math.ceil((record.lockUntil - Date.now()) / 1000);
  }
  return 0;
};

module.exports = {
  getClientIp,
  extractIp,
  authLimiter,
  uploadLimiter,
  chunkUploadLimiter,
  apiLimiter,
  adminLimiter,
  diagnosticLimiter,
  checkPasswordRateLimit,
  checkAdminPasswordRateLimit,
  recordFailedPasswordAttempt,
  recordFailedAdminAttempt,
  recordFailedAdminAttemptAcrossScope,
  resetPasswordAttempts,
  resetAdminAttemptsAcrossScope,
  getGlobalAdminLockKey,
  getAdminLockRemainingSeconds,
  isPasswordLocked,
  toSafeLoggedInUserList,
  adminAuth,
  adminAuthWithAudit,
  adminSecretAuth,
  generateDeviceHash,
  isUserBlocked,
  isLoginLocked,
  toClientMessage,
  toPublicClientMessage,
  setBroadcast,
};
