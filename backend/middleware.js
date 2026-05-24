// --- Rate Limiters, Admin Auth Middleware, and Shared Request Helpers ---

const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const logger = require('./logger');
const { filterValidReactions } = require('./reactions');
const BlockedUser = require('./models/blockedUser');
const LoginLockdown = require('./models/loginLockdown');

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
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  // Handle bare IPv4+port:     "1.2.3.4:5678"  → "1.2.3.4"
  // Handle bracketed IPv6+port: "[::1]:5678"   → "::1"
  const cleaned = raw
    .replace(/^\[(.+)\]:\d+$/, '$1')  // [IPv6]:port  → IPv6
    .replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1'); // IPv4:port → IPv4
  return ipKeyGenerator(cleaned);
};

// Clean IP for use inside route/WS handlers (not for rate-limiter key generation).
const extractIp = (req) => {
  const raw = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  return raw.replace(/^\[(.+)\]:\d+$/, '$1').replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1');
};

// --- Rate Limiters ---
// Prevent brute-force and abuse on public/sensitive endpoints.

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // max 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Too many requests, please try again later.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Too many uploads, please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Too many requests, please try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Too many requests, please try again later.' },
});

// --- Admin Auth Middleware ---

// Middleware for admin authentication
const adminAuth = (req, res, next) => {
  const password = req.headers['x-admin-password'];
  if (password && password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Middleware for super-admin actions requiring a secret key
const adminSecretAuth = (req, res, next) => {
  const receivedSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_SECRET;

  if (receivedSecret && expectedSecret && receivedSecret === expectedSecret) {
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

// Check if a user is blocked by any fingerprint match
const isUserBlocked = async (userId, ip, userAgent, deviceFingerprint) => {
  // Type-guard: reject non-string values to prevent NoSQL injection via query objects
  if (typeof userId !== 'string') return { blocked: false };

  // Check by userId first (fastest) — use $eq to prevent NoSQL injection
  const blockedByUserId = await BlockedUser.findOne({ userId: { $eq: userId }, isBlocked: true });
  if (blockedByUserId) return { blocked: true, reason: 'User ID is blocked', blockedUser: blockedByUserId };

  // Check by IP
  if (ip && ip !== 'unknown' && typeof ip === 'string') {
    const blockedByIp = await BlockedUser.findOne({ 'fingerprints.ips': { $eq: ip }, isBlocked: true });
    if (blockedByIp) return { blocked: true, reason: 'IP address is blocked', blockedUser: blockedByIp };
  }

  // Check by device hash
  if (deviceFingerprint) {
    const hash = generateDeviceHash({ ...deviceFingerprint, userAgent });
    const blockedByHash = await BlockedUser.findOne({ 'fingerprints.deviceHashes': { $eq: hash }, isBlocked: true });
    if (blockedByHash) return { blocked: true, reason: 'Device is blocked', blockedUser: blockedByHash };
  }

  return { blocked: false };
};

// Check if login lockdown is active
const isLoginLocked = async () => {
  const lockdown = await LoginLockdown.findOne({ isActive: true }).sort({ createdAt: -1 });
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

module.exports = {
  getClientIp,
  extractIp,
  authLimiter,
  uploadLimiter,
  apiLimiter,
  adminLimiter,
  adminAuth,
  adminSecretAuth,
  generateDeviceHash,
  isUserBlocked,
  isLoginLocked,
  toClientMessage,
};
