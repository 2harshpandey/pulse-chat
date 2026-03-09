require('dotenv').config();
const http = require('http');
const dns = require('dns');
const net = require('net');
const express = require('express');
const axios = require('axios');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const CloudinaryStorage = require('multer-storage-cloudinary').CloudinaryStorage;
const multer = require('multer');
const crypto = require('crypto');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const connectDB = require('./db');
const User = require('./models/user');
const Message = require('./models/message');
const MessageEvent = require('./models/messageEvent');
const TempLink = require('./models/tempLink');
const BlockedUser = require('./models/blockedUser');
const LoginLockdown = require('./models/loginLockdown');
const AuditLog = require('./models/auditLog');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Helper: returns true for loopback, private, and link-local IPs to prevent SSRF.
const isPrivateOrInternalIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 127 ||                           // loopback / unspecified
      (a === 169 && b === 254) ||                       // link-local / AWS metadata
      a === 10 ||                                        // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) ||              // 172.16.0.0/12
      (a === 192 && b === 168) ||                       // 192.168.0.0/16
      a >= 240                                           // reserved
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;         // loopback / unspecified
    if (/^f[cd]/i.test(l)) return true;                // fc00::/7 ULA private
    if (/^fe[89ab][0-9a-f]/i.test(l)) return true;     // fe80::/10 link-local
    if (l.startsWith('::ffff:')) return isPrivateOrInternalIp(l.slice(7)); // IPv4-mapped
    return false;
  }
  return true; // unknown format — block by default
};

// --- Rate Limiters ---
// Prevent brute-force and abuse on public/sensitive endpoints.

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

// --- Environment Variable Check ---
// Log a clear warning at startup if any critical secrets are missing.
const REQUIRED_ENV = ['MONGODB_URI', 'ADMIN_PASSWORD', 'CLIENT_PASSWORD', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
REQUIRED_ENV.forEach(key => {
    if (!process.env[key]) {
        logger.warn(`[STARTUP] Missing required environment variable: ${key}. Some features may not work.`);
    }
});


// --- Global Error Handlers (Safety Net) ---
// These are crucial for logging errors that would otherwise crash the server silently.
process.on('uncaughtException', (err, origin) => {
    logger.error('----- UNCAUGHT EXCEPTION -----');
    logger.error(`Caught exception: ${err}\n` + `Exception origin: ${origin}`);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('----- UNHANDLED REJECTION -----');
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});


// --- In-Memory Stores (For live data, not for persistence) ---
// messageHistory cache is removed to support infinite scroll. DB is now the source of truth.
const onlineUsers = new Map();
const typingUsers = new Map();
const adminClients = new Set();
const pendingDisconnects = new Map();

// Track logged-in users (persists across disconnects until explicit logout/force-logout)
// Map<userId, { userId, username, loginTime, ip, userAgent }>
const loggedInUsers = new Map();

// Track user fingerprints for robust blocking
// Map<userId, { ips: Set, userAgents: Set, screenResolution, platform, language, timezone, deviceHashes: Set }>
const userFingerprints = new Map();

// --- Helper: Generate device hash from fingerprint components ---
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

// --- Helper: Extract clean IP from request ---
const extractIp = (req) => {
  const raw = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  return raw.replace(/^\[(.+)\]:\d+$/, '$1').replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1');
};

// --- Helper: Check if a user is blocked by any fingerprint match ---
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

// --- Helper: Check if login lockdown is active ---
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

// --- Cloudinary & Multer Configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pulse-chat',
    resource_type: 'auto',
    use_filename: true,       // Preserve original filename in the Cloudinary public_id
    unique_filename: true,    // Append a short random suffix to avoid collisions
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }  // 100 MB max
});

// --- Server Setup ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 8080;

// Trust the first reverse proxy (Azure App Service / Load Balancer).
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// on every rate-limited request because Azure's proxy injects X-Forwarded-For
// but Express defaults to ignoring it. This single setting fixes rate-limiter
// crashes that cause HTTP endpoints (auth, messages, uploads, deletes) to
// return 500, which in turn breaks the send button, scrolling, and reconnection.
app.set('trust proxy', 1);

// --- WebSocket Heartbeat (Ping/Pong) ---
const heartbeatInterval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      logger.warn('Heartbeat: Terminating dead connection.');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 10000);

wss.on('close', function close() {
  clearInterval(heartbeatInterval);
});

// --- Middleware ---
// Allow all origins (the chat is public) while being explicit about which
// methods and headers are permitted so mobile-browser CORS preflight checks
// never fail due to an unrecognised header name.
app.use(cors({
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-password", "x-admin-secret"],
}));
app.use(express.json());

// --- Helper Functions ---
const broadcastToAdmins = (type, data) => {
  const message = JSON.stringify({ type, data });
  logger.info(`Broadcasting to ${adminClients.size} admin client(s): ${message}`);
  adminClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      logger.info(`Admin client not open. State: ${client.readyState}`);
    }
  });
};

const broadcastOnlineUsers = () => {
  const users = Array.from(onlineUsers.values()).map(user => ({
    ...user,
    isTyping: typingUsers.has(user.userId)
  }));
  const message = JSON.stringify({ type: 'online_users', data: users });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
};

const broadcast = (message) => {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
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

// Middleware for admin authentication
const adminAuth = (req, res, next) => {
    const password = req.headers['x-admin-password'];
    if (password && password === process.env.ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// --- Main Routes ---
app.get('/health', (req, res) => {
    // A simple health check endpoint for the hosting platform (Azure) to ping.
    res.status(200).send('OK');
});

app.get('/', (req, res) => res.send('Pulse Chat Server is running!'));

// --- Client Auth Verification ---
app.post('/api/auth/verify', authLimiter, async (req, res) => {
    const { password, username, userId, fingerprint } = req.body;
    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // Check if user is blocked
    const blockCheck = await isUserBlocked(userId, ip, userAgent, fingerprint);
    if (blockCheck.blocked) {
        await AuditLog.create({
            type: 'join_failed_blocked',
            details: { userId, username, reason: blockCheck.reason, blockedUsername: blockCheck.blockedUser?.username },
            ip, userAgent,
        });
        broadcastToAdmins('audit_log', { type: 'join_failed_blocked', details: { userId, username, reason: blockCheck.reason }, ip, timestamp: new Date() });
        return res.status(403).json({ success: false, error: 'You have been blocked from this chat room.' });
    }

    // Check login lockdown (but allow already logged-in users)
    if (!loggedInUsers.has(userId)) {
        const lockCheck = await isLoginLocked();
        if (lockCheck.locked) {
            await AuditLog.create({
                type: 'join_failed_lockdown',
                details: { userId, username },
                ip, userAgent,
            });
            broadcastToAdmins('audit_log', { type: 'join_failed_lockdown', details: { userId, username }, ip, timestamp: new Date() });
            return res.status(403).json({ success: false, error: 'New logins are temporarily disabled. Please try again later.' });
        }
    }

    if (password && password === process.env.CLIENT_PASSWORD) {
        // If the client sends a username, verify it is not already in use.
        if (username) {
            const normalised = username.trim().toLowerCase();
            const taken = Array.from(onlineUsers.values()).some(
                u => u.username.trim().toLowerCase() === normalised && u.userId !== userId
            );
            if (taken) {
                await AuditLog.create({ type: 'join_failed_username_taken', details: { userId, username }, ip, userAgent });
                return res.status(409).json({ success: false, error: 'That username is already in use. Please choose a different one.' });
            }
        }

        // Store fingerprint data
        if (fingerprint) {
            const existing = userFingerprints.get(userId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
            existing.ips.add(ip);
            existing.userAgents.add(userAgent);
            existing.screenResolution = fingerprint.screenResolution;
            existing.platform = fingerprint.platform;
            existing.language = fingerprint.language;
            existing.timezone = fingerprint.timezone;
            const hash = generateDeviceHash({ ...fingerprint, userAgent });
            existing.deviceHashes.add(hash);
            userFingerprints.set(userId, existing);
        }

        // Track as logged in
        loggedInUsers.set(userId, { userId, username: username?.trim(), loginTime: new Date(), ip, userAgent });

        res.status(200).json({ success: true });
    } else {
        await AuditLog.create({ type: 'join_failed_password', details: { userId, username }, ip, userAgent });
        broadcastToAdmins('audit_log', { type: 'join_failed_password', details: { userId, username }, ip, timestamp: new Date() });
        res.status(401).json({ success: false, error: 'Incorrect password.' });
    }
});

// --- Temp Link Auth Verification ---
app.post('/api/auth/verify-temp', authLimiter, async (req, res) => {
    const { token, username, userId, fingerprint } = req.body;
    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!token || !username?.trim() || !userId) {
        return res.status(400).json({ success: false, error: 'Token, username, and userId are required.' });
    }

    // Check if user is blocked
    const blockCheck = await isUserBlocked(userId, ip, userAgent, fingerprint);
    if (blockCheck.blocked) {
        await AuditLog.create({
            type: 'join_failed_blocked',
            details: { userId, username, reason: blockCheck.reason, viaTempLink: true },
            ip, userAgent,
        });
        broadcastToAdmins('audit_log', { type: 'join_failed_blocked', details: { userId, username, reason: blockCheck.reason }, ip, timestamp: new Date() });
        return res.status(403).json({ success: false, error: 'You have been blocked from this chat room.' });
    }

    // Validate token format before querying — crypto.randomBytes(32).hex() always produces 64 hex chars
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ success: false, error: 'This link is invalid or has expired.' });
    }

    // Find and validate the temp link — use $eq to prevent NoSQL injection
    const tempLink = await TempLink.findOne({ token: { $eq: token } });
    if (!tempLink) {
        await AuditLog.create({ type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username }, ip, userAgent });
        return res.status(404).json({ success: false, error: 'This link is invalid or has expired.' });
    }

    if (tempLink.isRevoked) {
        await AuditLog.create({ type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username, reason: 'revoked' }, ip, userAgent });
        return res.status(410).json({ success: false, error: 'This link has been revoked.' });
    }

    if (new Date() > tempLink.expiresAt) {
        await AuditLog.create({ type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username, reason: 'expired' }, ip, userAgent });
        return res.status(410).json({ success: false, error: 'This link has expired.' });
    }

    // Check username availability
    const normalised = username.trim().toLowerCase();
    const taken = Array.from(onlineUsers.values()).some(
        u => u.username.trim().toLowerCase() === normalised && u.userId !== userId
    );
    if (taken) {
        return res.status(409).json({ success: false, error: 'That username is already in use. Please choose a different one.' });
    }

    // Store fingerprint data
    if (fingerprint) {
        const existing = userFingerprints.get(userId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
        existing.ips.add(ip);
        existing.userAgents.add(userAgent);
        existing.screenResolution = fingerprint.screenResolution;
        existing.platform = fingerprint.platform;
        existing.language = fingerprint.language;
        existing.timezone = fingerprint.timezone;
        const hash = generateDeviceHash({ ...fingerprint, userAgent });
        existing.deviceHashes.add(hash);
        userFingerprints.set(userId, existing);
    }

    // Record usage
    tempLink.usedBy.push({ username: username.trim(), joinedAt: new Date() });
    await tempLink.save();

    await AuditLog.create({ type: 'temp_link_used', details: { token: token.substring(0, 8) + '...', userId, username: username.trim() }, ip, userAgent });
    broadcastToAdmins('audit_log', { type: 'temp_link_used', details: { userId, username: username.trim() }, timestamp: new Date() });

    // Track as logged in
    loggedInUsers.set(userId, { userId, username: username.trim(), loginTime: new Date(), ip, userAgent, viaTempLink: true });

    res.status(200).json({ success: true });
});

// --- Username Availability Check ---
// Returns { available: true } if the username is not currently in use by any online user.
// Accepts optional `userId` to exclude the requesting user's own existing session.
app.get('/api/users/check-username', authLimiter, (req, res) => {
    const { username, userId } = req.query;
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: 'Username is required.' });
    }
    const normalised = username.trim().toLowerCase();
    const taken = Array.from(onlineUsers.values()).some(
        u => u.username.trim().toLowerCase() === normalised && u.userId !== userId
    );
    res.json({ available: !taken });
});

app.post('/api/upload', uploadLimiter, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      logger.error(`Upload middleware error: ${err.message}`);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Max size is 100 MB.' });
      }
      return res.status(500).json({ error: `Upload failed: ${err.message}` });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    
    const { userId } = req.body;
    const username = onlineUsers.get(userId)?.username || 'Unknown';

    // Create a MessageEvent for the upload
    const event = new MessageEvent({
      type: 'upload',
      file: {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
      },
      userId,
      username,
      timestamp: new Date().toISOString(),
    });
    event.save();

    broadcastToAdmins('history', event);
    broadcastToAdmins('activity', `File '${req.file.originalname}' uploaded by '${username}'.`);

    logger.info(`File uploaded: ${req.file.originalname}`);

    // Determine file type from mimetype since Cloudinary resource_type
    // may return 'raw' for PDFs and other non-image/video files.
    let fileType = 'file';
    if (req.file.mimetype && req.file.mimetype.startsWith('image/')) fileType = 'image';
    else if (req.file.mimetype && req.file.mimetype.startsWith('video/')) fileType = 'video';

    res.status(200).json({
      id: req.file.filename,
      type: fileType,
      url: req.file.path,
      originalName: req.file.originalname,
      text: req.body.text,
    });
  });
});

app.delete('/api/delete/:id', apiLimiter, async (req, res) => {
  try {
    const messageId = req.params.id;
    if (!messageId) return res.status(400).json({ error: 'No message ID provided.' });
    logger.info(`Delete request for message ID: ${messageId}`);
    
    // Find message to delete from DB
    const messageToDelete = await Message.findOne({ id: messageId });

    if (messageToDelete && messageToDelete.url && messageToDelete.url.includes('cloudinary')) {
        const publicId = messageToDelete.id;
        if (publicId.includes('/')) {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
            await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
        }
    }
    
    await Message.deleteOne({ id: messageId });


    const deleteMessage = { type: 'delete', id: messageId };
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(deleteMessage));
    });

    res.status(200).json({ success: true, message: 'Message deleted.' });
  } catch (error) {
    logger.error('Delete error:', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

app.delete('/api/messages/all', adminLimiter, adminSecretAuth, async (req, res) => {
    try {
        await Message.deleteMany({});
        await MessageEvent.deleteMany({});

        
        broadcast({ type: 'chat_cleared' });
        
        logger.info('All messages and events have been permanently deleted by an admin.');
        broadcastToAdmins('activity', 'All messages and events have been permanently deleted.');

        res.status(200).json({ message: 'All messages and events have been permanently deleted.' });
    } catch (error) {
        logger.error('Error clearing all messages:', { message: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to clear all messages.' });
    }
});

// --- GIF API Routes ---
const TENOR_API_KEY = process.env.TENOR_API_KEY;
const TENOR_API_URL = 'https://tenor.googleapis.com/v2';

app.get('/api/gifs/trending', async (req, res) => {
  try {
    const response = await axios.get(`${TENOR_API_URL}/featured`, { params: { key: TENOR_API_KEY, limit: 20 } });
    const gifs = response.data.results.map((gif) => ({ id: gif.id, preview: gif.media_formats.tinygif.url, url: gif.media_formats.gif.url }));
    res.json(gifs);
  } catch (error) {
    logger.error('Error fetching trending GIFs:', { message: error.message });
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

app.get('/api/gifs/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    const response = await axios.get(`${TENOR_API_URL}/search`, { params: { key: TENOR_API_KEY, q: query, limit: 20 } });
    const gifs = response.data.results.map((gif) => ({ id: gif.id, preview: gif.media_formats.tinygif.url, url: gif.media_formats.gif.url }));
    res.json(gifs);
  } catch (error) {
    logger.error('Error searching GIFs:', { message: error.message });
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

// --- Link Preview ---
app.get('/api/link-preview', apiLimiter, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL parameter required' });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid URL' });

    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

    // Restrict to standard HTTP/HTTPS ports only — prevents using this as a port scanner.
    const port = parsedUrl.port;
    if (port && port !== '80' && port !== '443') return res.status(400).json({ error: 'Invalid URL' });

    const rawHostname = parsedUrl.hostname;
    const hostname = rawHostname.replace(/^www\./, '');

    // Resolve the hostname and block private/internal IPs to prevent SSRF.
    let resolvedIp;
    try { ({ address: resolvedIp } = await dns.promises.lookup(rawHostname)); }
    catch { return res.status(400).json({ error: 'Could not resolve hostname' }); }
    if (isPrivateOrInternalIp(resolvedIp)) return res.status(400).json({ error: 'Invalid URL' });

    const response = await axios.get(url, {
      timeout: 5000,
      maxContentLength: 1024 * 512,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      responseType: 'text',
    });
    const html = typeof response.data === 'string' ? response.data : String(response.data);
    const getOg = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']{0,500})["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']{0,500})["'][^>]+property=["']og:${prop}["']`, 'i'));
      return m ? m[1] : null;
    };
    const getTitle = () => { const m = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i); return m ? m[1].trim() : null; };
    const getMetaDesc = () => {
      const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,500})["']/i)
        || html.match(/<meta[^>]+content=["']([^"']{0,500})["'][^>]+name=["']description["']/i);
      return m ? m[1] : null;
    };
    res.json({ title: getOg('title') || getTitle(), description: getOg('description') || getMetaDesc(), image: getOg('image'), hostname, siteName: getOg('site_name') });
  } catch (error) {
    logger.error('Link preview fetch error:', { message: error.message });
    res.status(500).json({ error: 'Failed to fetch preview' });
  }
});

// --- Admin Routes ---
app.get('/api/admin/messages', adminLimiter, adminAuth, async (req, res) => {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(MAX_HISTORY);
    res.json(messages.reverse());
});

app.get('/api/admin/users', adminLimiter, adminAuth, async (req, res) => {
    const users = await User.find({}).sort({ createdAt: 1 }).lean();
    res.json(users);
});

app.get('/api/admin/history', adminLimiter, adminAuth, async (req, res) => {
    const events = await MessageEvent.find().sort({ createdAt: -1 });
    res.json(events);
});

app.get('/api/admin/server-logs', adminLimiter, adminAuth, (req, res) => {
  const logFilePath = path.join(__dirname, 'pulse-activity.log');
  fs.readFile(logFilePath, 'utf8', (err, data) => {
    if (err) {
      logger.error('Failed to read log file:', err);
      return res.status(500).send('Could not read server logs.');
    }
    const lines = data.split('\n').slice(-200).join('\n');
    res.type('text/plain').send(lines);
  });
});

// --- Temp Link Admin Routes ---
app.post('/api/admin/temp-links', adminLimiter, adminAuth, async (req, res) => {
    try {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        const tempLink = await TempLink.create({ token, expiresAt });
        
        await AuditLog.create({ type: 'temp_link_created', details: { token: token.substring(0, 8) + '...', expiresAt } });
        broadcastToAdmins('temp_link_created', tempLink);
        broadcastToAdmins('activity', `Temporary access link created. Expires at ${expiresAt.toLocaleTimeString()}.`);
        
        res.status(201).json(tempLink);
    } catch (error) {
        logger.error('Failed to create temp link:', error);
        res.status(500).json({ error: 'Failed to create temporary link.' });
    }
});

app.get('/api/admin/temp-links', adminLimiter, adminAuth, async (req, res) => {
    try {
        const links = await TempLink.find().sort({ createdAt: -1 }).limit(50);
        res.json(links);
    } catch (error) {
        logger.error('Failed to fetch temp links:', error);
        res.status(500).json({ error: 'Failed to fetch temporary links.' });
    }
});

app.post('/api/admin/temp-links/:id/revoke', adminLimiter, adminAuth, async (req, res) => {
    try {
        const link = await TempLink.findByIdAndUpdate(
            req.params.id,
            { isRevoked: true, revokedAt: new Date() },
            { new: true }
        );
        if (!link) return res.status(404).json({ error: 'Link not found.' });

        await AuditLog.create({ type: 'temp_link_revoked', details: { token: link.token.substring(0, 8) + '...' } });
        broadcastToAdmins('temp_link_revoked', link);
        broadcastToAdmins('activity', `Temporary access link revoked.`);

        res.json(link);
    } catch (error) {
        logger.error('Failed to revoke temp link:', error);
        res.status(500).json({ error: 'Failed to revoke link.' });
    }
});

// --- Logged-in Users Routes ---
app.get('/api/admin/logged-in-users', adminLimiter, adminAuth, (req, res) => {
    const users = Array.from(loggedInUsers.values());
    res.json(users);
});

// --- Force Logout Route ---
app.post('/api/admin/force-logout/:userId', adminLimiter, adminAuth, async (req, res) => {
    const { userId } = req.params;
    const targetUser = loggedInUsers.get(userId) || onlineUsers.get(userId);
    const username = targetUser?.username || 'Unknown';

    // Send force_logout to the specific user's WebSocket(s)
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.userId === userId && !client.isAdmin) {
            client.send(JSON.stringify({ type: 'force_logout', message: 'You have been logged out by an administrator.' }));
            setTimeout(() => client.terminate(), 500);
        }
    });

    // Remove from tracking maps
    onlineUsers.delete(userId);
    loggedInUsers.delete(userId);
    typingUsers.delete(userId);
    if (pendingDisconnects.has(userId)) {
        clearTimeout(pendingDisconnects.get(userId));
        pendingDisconnects.delete(userId);
    }

    await AuditLog.create({ type: 'user_force_logged_out', details: { userId, username } });
    broadcastToAdmins('user_force_logged_out', { userId, username });
    broadcastToAdmins('activity', `User '${username}' was force-logged out by admin.`);
    broadcastOnlineUsers();

    res.json({ success: true, message: `User '${username}' has been logged out.` });
});

// --- Force Logout All Route ---
app.post('/api/admin/force-logout-all', adminLimiter, adminAuth, async (req, res) => {
    const affectedUsers = [];
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && !client.isAdmin) {
            const uid = client.userId;
            const uname = (loggedInUsers.get(uid) || onlineUsers.get(uid))?.username || 'Unknown';
            affectedUsers.push({ userId: uid, username: uname });
            client.send(JSON.stringify({ type: 'force_logout', message: 'You have been logged out by an administrator.' }));
            setTimeout(() => client.terminate(), 500);
        }
    });
    // Clear all tracking
    onlineUsers.clear();
    loggedInUsers.clear();
    typingUsers.clear();
    pendingDisconnects.forEach(t => clearTimeout(t));
    pendingDisconnects.clear();

    await AuditLog.create({ type: 'force_logged_out_all', details: { count: affectedUsers.length, users: affectedUsers } });
    broadcastToAdmins('activity', `Admin force-logged out ALL ${affectedUsers.length} user(s).`);
    broadcastOnlineUsers();
    res.json({ success: true, message: `Force-logged out ${affectedUsers.length} user(s).` });
});

// --- Block/Unblock User Routes ---
app.post('/api/admin/block-user', adminLimiter, adminAuth, async (req, res) => {
    const { userId, username, reason } = req.body;
    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId is required and must be a string.' });

    try {
        // Gather all known fingerprints for this user
        const fp = userFingerprints.get(userId);
        const userInfo = loggedInUsers.get(userId) || onlineUsers.get(userId);
        
        const fingerprints = {
            ips: [],
            userAgents: [],
            deviceHashes: [],
            screenResolution: fp?.screenResolution || '',
            platform: fp?.platform || '',
            language: fp?.language || '',
            timezone: fp?.timezone || '',
        };

        if (fp) {
            fingerprints.ips = Array.from(fp.ips || []);
            fingerprints.userAgents = Array.from(fp.userAgents || []);
            fingerprints.deviceHashes = Array.from(fp.deviceHashes || []);
        }

        // Add current connection info if available
        if (userInfo?.ip && !fingerprints.ips.includes(userInfo.ip)) {
            fingerprints.ips.push(userInfo.ip);
        }
        if (userInfo?.userAgent && !fingerprints.userAgents.includes(userInfo.userAgent)) {
            fingerprints.userAgents.push(userInfo.userAgent);
        }

        // Also scan active WebSocket connections for this user's IP/UA
        wss.clients.forEach(client => {
            if (client.userId === userId && !client.isAdmin) {
                const wsIp = client._socket?.remoteAddress || '';
                const wsUa = client.upgradeReq?.headers?.['user-agent'] || '';
                if (wsIp && !fingerprints.ips.includes(wsIp)) fingerprints.ips.push(wsIp);
                if (wsUa && !fingerprints.userAgents.includes(wsUa)) fingerprints.userAgents.push(wsUa);
            }
        });

        // Create or update block entry — use $eq to prevent NoSQL injection
        let blockedUser = await BlockedUser.findOne({ userId: { $eq: userId } });
        if (blockedUser) {
            blockedUser.isBlocked = true;
            blockedUser.blockedAt = new Date();
            blockedUser.unblockedAt = null;
            blockedUser.username = username || blockedUser.username;
            blockedUser.reason = reason || '';
            // Merge fingerprints
            const mergedIps = new Set([...blockedUser.fingerprints.ips, ...fingerprints.ips]);
            const mergedUAs = new Set([...blockedUser.fingerprints.userAgents, ...fingerprints.userAgents]);
            const mergedHashes = new Set([...blockedUser.fingerprints.deviceHashes, ...fingerprints.deviceHashes]);
            blockedUser.fingerprints = {
                ...fingerprints,
                ips: Array.from(mergedIps),
                userAgents: Array.from(mergedUAs),
                deviceHashes: Array.from(mergedHashes),
            };
            await blockedUser.save();
        } else {
            blockedUser = await BlockedUser.create({
                userId,
                username: username || 'Unknown',
                fingerprints,
                reason: reason || '',
            });
        }

        // Force logout the blocked user immediately
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.userId === userId && !client.isAdmin) {
                client.send(JSON.stringify({ type: 'force_logout', message: 'You have been blocked from this chat room.' }));
                setTimeout(() => client.terminate(), 500);
            }
        });
        onlineUsers.delete(userId);
        loggedInUsers.delete(userId);
        typingUsers.delete(userId);

        await AuditLog.create({ type: 'user_blocked', details: { userId, username: username || 'Unknown', reason } });
        broadcastToAdmins('user_blocked', blockedUser);
        broadcastToAdmins('activity', `User '${username || 'Unknown'}' has been blocked.`);
        broadcastOnlineUsers();

        res.json({ success: true, blockedUser });
    } catch (error) {
        logger.error('Failed to block user:', error);
        res.status(500).json({ error: 'Failed to block user.' });
    }
});

app.post('/api/admin/unblock-user/:userId', adminLimiter, adminAuth, async (req, res) => {
    const { userId } = req.params;
    try {
        const blockedUser = await BlockedUser.findOneAndUpdate(
            { userId: { $eq: userId }, isBlocked: true },
            { isBlocked: false, unblockedAt: new Date() },
            { new: true }
        );
        if (!blockedUser) return res.status(404).json({ error: 'Blocked user not found.' });

        await AuditLog.create({ type: 'user_unblocked', details: { userId, username: blockedUser.username } });
        broadcastToAdmins('user_unblocked', blockedUser);
        broadcastToAdmins('activity', `User '${blockedUser.username}' has been unblocked.`);

        res.json({ success: true, blockedUser });
    } catch (error) {
        logger.error('Failed to unblock user:', error);
        res.status(500).json({ error: 'Failed to unblock user.' });
    }
});

app.get('/api/admin/blocked-users', adminLimiter, adminAuth, async (req, res) => {
    try {
        const blocked = await BlockedUser.find().sort({ blockedAt: -1 });
        res.json(blocked);
    } catch (error) {
        logger.error('Failed to fetch blocked users:', error);
        res.status(500).json({ error: 'Failed to fetch blocked users.' });
    }
});

// --- Login Lockdown Routes ---
app.post('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    const { type, customMinutes } = req.body;
    if (!type) return res.status(400).json({ error: 'Lockdown type is required.' });

    try {
        // Deactivate any existing lockdowns
        await LoginLockdown.updateMany({ isActive: true }, { isActive: false });

        let endTime = null;
        const now = new Date();
        switch (type) {
            case '1hr': endTime = new Date(now.getTime() + 60 * 60 * 1000); break;
            case '6hr': endTime = new Date(now.getTime() + 6 * 60 * 60 * 1000); break;
            case '12hr': endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000); break;
            case '1day': endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); break;
            case '3days': endTime = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); break;
            case 'indefinite': endTime = null; break;
            case 'custom':
                if (!customMinutes || customMinutes <= 0) return res.status(400).json({ error: 'Custom duration in minutes is required.' });
                endTime = new Date(now.getTime() + customMinutes * 60 * 1000);
                break;
            default: return res.status(400).json({ error: 'Invalid lockdown type.' });
        }

        const lockdown = await LoginLockdown.create({ type, endTime, isActive: true });

        await AuditLog.create({ type: 'lockdown_enabled', details: { type, endTime } });
        broadcastToAdmins('lockdown_update', lockdown);
        broadcastToAdmins('activity', `Login lockdown enabled: ${type}${endTime ? ` until ${endTime.toLocaleString()}` : ' (indefinite)'}.`);

        res.json(lockdown);
    } catch (error) {
        logger.error('Failed to enable login lockdown:', error);
        res.status(500).json({ error: 'Failed to enable lockdown.' });
    }
});

app.delete('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    try {
        await LoginLockdown.updateMany({ isActive: true }, { isActive: false });

        await AuditLog.create({ type: 'lockdown_disabled', details: {} });
        broadcastToAdmins('lockdown_update', { isActive: false });
        broadcastToAdmins('activity', `Login lockdown has been disabled.`);

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to disable login lockdown:', error);
        res.status(500).json({ error: 'Failed to disable lockdown.' });
    }
});

app.get('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    try {
        const lockdown = await LoginLockdown.findOne({ isActive: true }).sort({ createdAt: -1 });
        if (lockdown && lockdown.endTime && new Date() > lockdown.endTime) {
            lockdown.isActive = false;
            await lockdown.save();
            return res.json({ isActive: false });
        }
        res.json(lockdown || { isActive: false });
    } catch (error) {
        logger.error('Failed to fetch lockdown status:', error);
        res.status(500).json({ error: 'Failed to fetch lockdown status.' });
    }
});

// --- Audit Log Routes ---
app.get('/api/admin/audit-logs', adminLimiter, adminAuth, async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(200);
        res.json(logs);
    } catch (error) {
        logger.error('Failed to fetch audit logs:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
});

// Route for fetching paginated messages for infinite scroll
app.get('/api/messages', apiLimiter, async (req, res) => {
    try {
        const limit = 50;
        const { before } = req.query; // 'before' will be the 'createdAt' timestamp of the oldest message client-side

        const query = {};
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        
        res.json(messages.reverse()); // Send oldest-first, so client can simply prepend
    } catch (error) {
        logger.error('Failed to fetch paginated messages:', { message: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// --- WebSocket Connection Logic ---
wss.on('connection', (ws, req) => {
  // Heartbeat setup for the new connection
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const isAdminConnection = url.searchParams.get('admin') === 'true';

  if (isAdminConnection) {
    // Auth is done via the first WebSocket message to keep the password out of the URL (and server logs).
    ws.once('message', (rawData) => {
      try {
        const data = JSON.parse(rawData.toString());
        if (data.type === 'admin_auth' && data.password === process.env.ADMIN_PASSWORD) {
          ws.isAdmin = true;
          adminClients.add(ws);
          logger.info('An admin client authenticated and connected!');
          broadcastToAdmins('activity', 'An admin client connected to admin channel.');
          User.find().then(allDbUsers => {
            ws.send(JSON.stringify({ type: 'users', data: allDbUsers }));
          });
          // Send current logged-in users
          ws.send(JSON.stringify({ type: 'logged_in_users', data: Array.from(loggedInUsers.values()) }));
          // Send current online users
          ws.send(JSON.stringify({ type: 'online_users_admin', data: Array.from(onlineUsers.values()) }));
          ws.on('close', () => {
            adminClients.delete(ws);
            logger.info('An admin client disconnected from admin channel.');
            broadcastToAdmins('activity', 'An admin client disconnected from admin channel.');
          });
        } else {
          logger.warn('Admin auth failed: incorrect password.');
          ws.terminate();
        }
      } catch {
        ws.terminate();
      }
    });
    return;
  }

  logger.info('A new client connected!');

  ws.on('message', async (message) => {
    const parsedMessage = JSON.parse(message.toString());
    if (parsedMessage.type !== 'admin_auth') {
      logger.info('Received message:', parsedMessage);
    }

    switch (parsedMessage.type) {
      case 'user_join': {
        const { userId, username, fingerprint: fpData } = parsedMessage;
        ws.userId = userId;
        ws.username = username;

        // Collect connection fingerprint
        const wsIp = extractIp(req);
        const wsUa = req.headers['user-agent'] || '';
        ws.clientIp = wsIp;
        ws.clientUa = wsUa;

        // Store fingerprint data
        if (fpData || true) {
            const existing = userFingerprints.get(userId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
            existing.ips.add(wsIp);
            if (wsUa) existing.userAgents.add(wsUa);
            if (fpData) {
                existing.screenResolution = fpData.screenResolution || existing.screenResolution;
                existing.platform = fpData.platform || existing.platform;
                existing.language = fpData.language || existing.language;
                existing.timezone = fpData.timezone || existing.timezone;
                const hash = generateDeviceHash({ ...fpData, userAgent: wsUa });
                existing.deviceHashes.add(hash);
            }
            userFingerprints.set(userId, existing);
        }

        // Check if user is blocked (async)
        const blockResult = await isUserBlocked(userId, wsIp, wsUa, fpData);
        if (blockResult.blocked) {
            logger.warn(`Blocked user '${username}' attempted to join via WebSocket.`);
            ws.send(JSON.stringify({ type: 'force_logout', message: 'You have been blocked from this chat room.' }));
            await AuditLog.create({
                type: 'join_failed_blocked',
                details: { userId, username, reason: blockResult.reason, via: 'websocket' },
                ip: wsIp, userAgent: wsUa,
            });
            broadcastToAdmins('audit_log', { type: 'join_failed_blocked', details: { userId, username }, timestamp: new Date() });
            setTimeout(() => ws.terminate(), 300);
            return;
        }

        // --- Duplicate username guard (WebSocket-level, authoritative) ---
        // Check every currently-open, identified client (excluding this socket and
        // excluding a reconnect from the same userId) for a matching username.
        const trimmedLower = username.trim().toLowerCase();
        const usernameTaken = Array.from(wss.clients).some(
          client =>
            client !== ws &&
            client.readyState === WebSocket.OPEN &&
            !client.isAdmin &&
            client.username &&
            client.username.trim().toLowerCase() === trimmedLower &&
            client.userId !== userId   // same userId = reconnect/refresh, allow it
        );

        if (usernameTaken) {
          logger.warn(`Username '${username}' rejected — already in use.`);
          ws.send(JSON.stringify({
            type: 'username_taken',
            message: 'That username is already in use. Please choose a different one.',
          }));
          // Give the send buffer time to flush before terminating.
          setTimeout(() => ws.terminate(), 300);
          return;
        }
        // --- End duplicate guard ---

        if (pendingDisconnects.has(userId)) {
            clearTimeout(pendingDisconnects.get(userId));
            pendingDisconnects.delete(userId);
            logger.info(`User '${username}' rejoined (refresh).`);
        } else {
            logger.info(`User '${username}' joined.`);
            broadcast({
              type: 'system_notification',
              id: `system-${Date.now()}`,
              text: `${username} has joined the chat.`,
              timestamp: new Date().toISOString(),
            });
        }
        
        onlineUsers.set(userId, { userId, username });
        
        // Also track as logged in
        if (!loggedInUsers.has(userId)) {
            loggedInUsers.set(userId, { userId, username, loginTime: new Date(), ip: ws.clientIp, userAgent: ws.clientUa });
        }

        User.findOneAndUpdate(
          { userId },
          { userId, username, lastSeen: new Date() },
          { upsert: true, new: true }
        ).catch(err => logger.error('Failed to save user:', err));

        broadcastToAdmins('user_joined', { userId, username });
        broadcastToAdmins('activity', `User '${username}' connected.`);
        broadcastToAdmins('logged_in_users', Array.from(loggedInUsers.values()));
        broadcastOnlineUsers();

        Message.find().sort({ createdAt: 1 }).lean()
          .then(messages => {
            // Convert Mongoose Map fields to plain objects for JSON serialization.
            // .lean() may return Map instances for schema fields defined as `type: Map`,
            // which JSON.stringify converts to '{}'. We must explicitly convert them.
            const cleanMessages = messages.map(msg => {
              if (msg.reactions instanceof Map) {
                const reactionsPlain = {};
                for (const [k, v] of msg.reactions.entries()) {
                  reactionsPlain[k] = Array.isArray(v)
                    ? v.map(u => ({ userId: u.userId, username: u.username }))
                    : v;
                }
                return { ...msg, reactions: reactionsPlain };
              }
              return msg;
            });
            ws.send(JSON.stringify({ type: 'history', data: cleanMessages }));
          })
          .catch(err => logger.error('Failed to send initial history:', err));
        break;
      }
      case 'react': {
        const { messageId, userId, emoji } = parsedMessage;
        const username = onlineUsers.get(userId)?.username || 'Unknown';

        // IMPORTANT: Do NOT use .lean() here.
        // The reactions field is declared as `type: Map` in the Mongoose schema.
        // .lean() returns Mongoose Map fields as JavaScript Map instances, NOT plain
        // objects. JavaScript's `for...in` loop does NOT iterate over Map entries
        // (only own enumerable properties), so the previous approach silently failed
        // to find / remove existing reactions, permanently corrupting the state of
        // any message that received a custom-emoji reaction.
        //
        // Fix: fetch the full Mongoose document and use the Map API directly
        // (.entries(), .get(), .set(), .delete()), then call markModified + save().
        const messageDoc = await Message.findOne({ id: messageId });

        if (messageDoc) {
          // Initialise the Map if the field is missing.
          if (!messageDoc.reactions) {
            messageDoc.reactions = new Map();
          }

          let previousEmoji = null;

          // Iterate using the Map API — this correctly traverses all stored entries.
          for (const [e, users] of messageDoc.reactions.entries()) {
            if (Array.isArray(users)) {
              const userIndex = users.findIndex(u => u.userId === userId);
              if (userIndex > -1) {
                previousEmoji = e;
                const updatedUsers = users.filter((_, i) => i !== userIndex);
                if (updatedUsers.length === 0) {
                  messageDoc.reactions.delete(e);
                } else {
                  messageDoc.reactions.set(e, updatedUsers);
                }
                break; // A user can only have one reaction at a time.
              }
            }
          }

          // If the new emoji is not a toggle-off of the same emoji, add it.
          if (previousEmoji !== emoji) {
            const existing = Array.from(messageDoc.reactions.get(emoji) || []);
            existing.push({ userId, username });
            messageDoc.reactions.set(emoji, existing);
          }

          // markModified tells Mongoose the Map changed (required for mixed/map fields).
          messageDoc.markModified('reactions');
          await messageDoc.save();

          // Build a plain-object snapshot for the WebSocket broadcast.
          // JSON.stringify on a Map instance gives '{}' — we must convert explicitly.
          // We also map each subdocument to a plain { userId, username } object
          // to avoid leaking Mongoose internals to the frontend.
          const reactionsPlain = {};
          for (const [k, v] of messageDoc.reactions.entries()) {
            reactionsPlain[k] = v.map(u => ({ userId: u.userId, username: u.username }));
          }

          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'update', data: { id: messageId, reactions: reactionsPlain } }));
            }
          });
        }
        break;
      }      case 'edit': {
        const { messageId, newText } = parsedMessage;
        
        const msg = await Message.findOne({ id: messageId });
        if (!msg) return;
        const oldText = msg.text;
        
        // Update in DB
        await Message.updateOne({ id: messageId }, { $set: { text: newText, edited: true } });

        const updatedMsgForBroadcast = {
          ...msg.toObject(),
          text: newText,
          edited: true
        };

        User.findOne({ userId: ws.userId }).then(user => {
          const username = user ? user.username : 'Unknown';
          const event = new MessageEvent({
            type: 'edit',
            messageId,
            oldText,
            newText,
            userId: ws.userId,
            username,
            timestamp: new Date().toISOString(),
          });
          event.save();
          broadcastToAdmins('history', event);
          broadcastToAdmins('activity', `Message (ID: ${messageId}) edited by '${username}'. New text: "${newText}"`);
        });

        const updateMsg = { type: 'update', data: updatedMsgForBroadcast };
        wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(updateMsg)); });
        break;
      }
      case 'user_logout': {
        // Explicit logout from the client — remove from loggedInUsers
        // so the admin panel's "Logged-In Sessions" list stays accurate.
        const logoutUserId = parsedMessage.userId || ws.userId;
        if (logoutUserId) {
          const logoutUser = loggedInUsers.get(logoutUserId) || onlineUsers.get(logoutUserId);
          const logoutUsername = logoutUser?.username || ws.username || 'Unknown';
          loggedInUsers.delete(logoutUserId);
          onlineUsers.delete(logoutUserId);
          typingUsers.delete(logoutUserId);
          if (pendingDisconnects.has(logoutUserId)) {
            clearTimeout(pendingDisconnects.get(logoutUserId));
            pendingDisconnects.delete(logoutUserId);
          }
          logger.info(`User '${logoutUsername}' logged out explicitly.`);
          broadcastToAdmins('user_logged_out', { userId: logoutUserId, username: logoutUsername });
          broadcastToAdmins('logged_in_users', Array.from(loggedInUsers.values()));
          broadcastToAdmins('activity', `User '${logoutUsername}' logged out.`);
          broadcastOnlineUsers();

          // Broadcast system notification
          broadcast({
            type: 'system_notification',
            id: `system-${Date.now()}`,
            text: `${logoutUsername} has left the chat.`,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }
      case 'start_typing': {
        if (ws.userId) typingUsers.set(ws.userId, true);
        broadcastOnlineUsers();
        break;
      }
      case 'stop_typing': {
        if (ws.userId) typingUsers.delete(ws.userId);
        broadcastOnlineUsers();
        break;
      }
      case 'delete_for_everyone': {
        const { messageId } = parsedMessage;

        try {
            const originalMessage = await Message.findOne({ id: messageId }).lean();
            if (!originalMessage) return;

            const updatedMessage = await Message.findOneAndUpdate(
                { id: messageId },
                { 
                    $set: { 
                        text: undefined, 
                        url: undefined, 
                        originalName: undefined, 
                        reactions: undefined,
                        isDeleted: true,
                        deletedBy: ws.userId 
                    },
                    $unset: {
                        replyingTo: ""
                    }
                },
                { new: true }
            ).lean();
            
            User.findOne({ userId: ws.userId }).then(user => {
              const username = user ? user.username : 'Unknown';
              const event = new MessageEvent({
                type: 'delete_everyone',
                messageId,
                deletedContent: originalMessage,
                userId: ws.userId,
                username,
                timestamp: new Date().toISOString(),
              });
              event.save();
              broadcastToAdmins('history', event);
              broadcastToAdmins('activity', `Message (ID: ${messageId}) deleted by '${username}'.`);
            });
            
            const updateMsg = { type: 'update', data: updatedMessage };
            wss.clients.forEach(c => {
                if (c.readyState === WebSocket.OPEN) {
                    c.send(JSON.stringify(updateMsg));
                }
            });

        } catch (err) {
            logger.error('Failed to delete message for everyone:', err);
        }
        break;
      }
      default: { // New text/media message
        if (ws.userId && typingUsers.has(ws.userId)) {
          typingUsers.delete(ws.userId);
          broadcastOnlineUsers();
        }
        
        const messageDoc = new Message({
            ...parsedMessage,
            id: parsedMessage.id || Date.now().toString(),
            sender: ws.userId
        });
        messageDoc.save();

        User.findOne({ userId: ws.userId }).then(user => {
            const username = user ? user.username : 'Unknown';
            const event = new MessageEvent({
              type: 'create',
              message: messageDoc.toObject(),
              userId: ws.userId,
              username,
              timestamp: new Date().toISOString(),
            });
            event.save();
            broadcastToAdmins('history', event);
            broadcastToAdmins('activity', `New message from '${username}': "${messageDoc.text || '[Media]'}"`);
        });

        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageDoc));
          }
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws.userId && onlineUsers.has(ws.userId)) {
      const user = onlineUsers.get(ws.userId);
      logger.info(`User '${user.username}' disconnected. Starting 10s timer.`);
      
      const timerId = setTimeout(() => {
        logger.info(`User '${user.username}' truly left.`);
        onlineUsers.delete(ws.userId);
        typingUsers.delete(ws.userId);

        broadcast({
          type: 'system_notification',
          id: `system-${Date.now()}`,
          text: `${user.username} has left the chat.`,
          timestamp: new Date().toISOString(),
        });
        
        broadcastOnlineUsers();
        broadcastToAdmins('user_left', { userId: ws.userId });
        broadcastToAdmins('activity', `User '${user.username}' disconnected.`);
        pendingDisconnects.delete(ws.userId);
      }, 10000);

      pendingDisconnects.set(ws.userId, timerId);
    }
  });
  ws.on('error', (error) => logger.error('WebSocket Error:', { message: error.message }));
});

// --- Start Server ---
const startServer = async () => {
  await connectDB();
  
server.listen(PORT, () => {
    logger.info(`Server is listening on port ${PORT}`);
  });
};

startServer();


// Watch for changes in the log file and broadcast to admins
const logFilePath = path.join(__dirname, 'pulse-activity.log');

// Ensure log file exists before watching
if (!fs.existsSync(logFilePath)) {
  fs.writeFileSync(logFilePath, ''); // Create empty file
}

fs.watch(logFilePath, (eventType, filename) => {
  if (eventType === 'change') {
    fs.readFile(logFilePath, 'utf8', (err, data) => {
      if (err) {
        logger.error('Failed to read log file on change:', err);
        return;
      }
      const lines = data.split('\n').slice(-200).join('\n');
      const payload = { type: 'server_logs', data: lines };
      adminClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    });
  }
});