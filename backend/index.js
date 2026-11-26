'use strict';

require('dotenv').config();
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const logger = require('./logger');
const connectDB = require('./db');
const ChatState = require('./models/chatState');
const { getRoomState } = require('./state');
const { apiLimiter, diagnosticLimiter } = require('./middleware');
const { initWebSocket } = require('./websocket');
const authRouter = require('./routes/auth');
const roomsRouter = require('./routes/rooms');

// Process-level safety: log uncaught rejections and exceptions without crashing process
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason: reason instanceof Error ? reason.stack : reason });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception thrown:', { error: err.stack || err.message });
});

// ---------------------------------------------------------------------------
// Cloudinary — configure once at startup so every module that imports
// cloudinary.v2 (security.js, media.js) picks up the credentials.
// ---------------------------------------------------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------------------------------------------------------------------------
// Global configuration & Allowed Origins
// ---------------------------------------------------------------------------
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : null;

const isOriginAllowed = (origin, req) => {
  // Allow requests without an origin header (same-origin GETs, curl, server-to-server, mobile native)
  if (!origin) return true;

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  // Always allow genuine same-origin browser requests (POST/WS send Origin matching Host)
  const rawHost = req?.headers?.host;
  if (rawHost && typeof rawHost === 'string') {
    const reqHost = rawHost.split(',')[0].trim().toLowerCase();
    if (reqHost && parsedOrigin.host.toLowerCase() === reqHost) {
      return true;
    }
  }

  // Explicit opt-in via ALLOWED_ORIGINS
  if (allowedOrigins && allowedOrigins.length > 0) {
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return true;
    }
  }

  // In non-production environments, permit local/LAN dev servers and unset ALLOWED_ORIGINS
  if (process.env.NODE_ENV !== 'production') {
    if (!allowedOrigins || allowedOrigins.length === 0) {
      return true;
    }
    const hostname = parsedOrigin.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return true;
    }
  }

  return false;
};

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  maxPayload: 1024 * 1024, // 1MB maximum frame size to prevent OOM denial-of-service
  verifyClient: (info, callback) => {
    const origin = info.origin || info.req.headers.origin;
    if (isOriginAllowed(origin, info.req)) {
      return callback(true);
    }
    logger.warn(`Blocked cross-origin WebSocket connection from disallowed origin: ${origin}`);
    return callback(false, 403, 'Blocked by CORS policy');
  },
});
const PORT = process.env.PORT || 8080;

// Trust the first reverse proxy (Azure App Service / Load Balancer).
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// on every rate-limited request because Azure's proxy injects X-Forwarded-For
// but Express defaults to ignoring it. This single setting fixes rate-limiter
// crashes that cause HTTP endpoints (auth, messages, uploads, deletes) to
// return 500, which in turn breaks the send button, scrolling, and reconnection.
app.set('trust proxy', 1);

// Safely patch express.request prototype 'ip' getter to ensure it NEVER throws
// Node.js ERR_INVALID_IP_ADDRESS or evaluates proxy-addr on destroyed/undefined sockets.
const originalIpGetter = Object.getOwnPropertyDescriptor(express.request, 'ip')?.get;
Object.defineProperty(express.request, 'ip', {
  configurable: true,
  enumerable: true,
  get() {
    try {
      const socketIp = this.socket?.remoteAddress || this.connection?.remoteAddress;
      if (!socketIp) return '127.0.0.1';
      const resolved = originalIpGetter ? originalIpGetter.call(this) : socketIp;
      if (!resolved || resolved === 'undefined' || resolved === 'unknown') {
        return socketIp || '127.0.0.1';
      }
      return resolved;
    } catch (_) {
      return this.socket?.remoteAddress || this.connection?.remoteAddress || '127.0.0.1';
    }
  },
});

// Ensure req.ip is safely resolved and memoized on request arrival.
// When clients abruptly disconnect, navigate away, or rapidly refresh, Node.js tears down
// the underlying TCP socket. If req.ip is evaluated after socket destruction, Express's
// proxy-addr getter encounters an undefined socket address and throws/logs
// "invalid IP address: undefined". Caching the resolved IP (or falling back to '127.0.0.1')
// guarantees rate limiters, loggers, and route guards never encounter an undefined IP.
app.use((req, _res, next) => {
  const socketIp = req.socket?.remoteAddress || req.connection?.remoteAddress;
  let resolvedIp = '127.0.0.1';
  try {
    resolvedIp = (socketIp ? req.ip : null) || socketIp || '127.0.0.1';
  } catch (_) {
    resolvedIp = socketIp || '127.0.0.1';
  }
  if (!resolvedIp || resolvedIp === 'undefined' || resolvedIp === 'unknown') {
    resolvedIp = '127.0.0.1';
  }
  Object.defineProperty(req, 'ip', {
    value: resolvedIp,
    configurable: true,
    writable: true,
  });
  next();
});

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.giphy.com", "https://*.ytimg.com", "https://*.google.com"],
      mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com"],
      connectSrc: ["'self'", "wss:", "ws:", "https://res.cloudinary.com", "https://*.giphy.com"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin, req)) {
    logger.warn(`Blocked cross-origin HTTP request from disallowed origin: ${origin}`);
    return callback(new Error(`Blocked by CORS policy: origin '${origin}' is not allowed`));
  }
  const hasExplicitOrigins = Boolean(allowedOrigins && allowedOrigins.length > 0 && !allowedOrigins.includes('*'));
  return callback(null, {
    origin: true,
    credentials: hasExplicitOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'x-admin-secret', 'x-room-id', 'x-user-id', 'x-session-token', 'x-room-password', 'Range'],
  });
}));
app.use(express.json({ limit: '1mb' }));
app.use(apiLimiter);

// ---------------------------------------------------------------------------
// WebSocket — initialise before routes so broadcast helpers are available
// ---------------------------------------------------------------------------
const broadcasts = initWebSocket(wss);
const { broadcastToAdmins } = broadcasts;

// Inject broadcast into routers and middleware for audit-log & activity fan-out
authRouter.setBroadcast(broadcastToAdmins);
require('./middleware').setBroadcast(broadcastToAdmins);
roomsRouter.setBroadcast(broadcastToAdmins);

// ---------------------------------------------------------------------------
// Route mounting
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.status(200).send('OK'));
app.get('/', (_req, res) => res.send('Pulse Chat Server is running!'));

const sanitizeDiagnosticDetails = (details) => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const clean = {};
  const entries = Object.entries(details).slice(0, 5);
  for (const [key, val] of entries) {
    const safeKey = String(key).replace(/[\r\n]/g, '').trim().slice(0, 32);
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      clean[safeKey] = typeof val === 'string' ? val.replace(/[\r\n]/g, '').slice(0, 128) : val;
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
};

// Non-blocking diagnostic telemetry endpoint (for page beacons & background telemetry)
app.post('/api/telemetry/diagnostic', diagnosticLimiter, (req, res) => {
  try {
    const diag = req.body || {};
    const cleanStr = (val, max = 64) => String(val || '').replace(/[\r\n]/g, '').trim().slice(0, max);
    const eventName = cleanStr(diag.event || diag.action, 64) || 'client_action';
    const username = cleanStr(diag.username, 50) || 'Anonymous';
    const roomId = cleanStr(diag.roomId, 50) || 'unknown';
    logger.info(`[Client-Diag] [Room: ${roomId}] ${username}: ${eventName}`, {
      telemetry: true,
      roomId,
      userId: cleanStr(diag.userId, 64),
      username,
      details: sanitizeDiagnosticDetails(diag.details)
    });
  } catch (_) {}
  res.status(204).end();
});

// Database readiness check: fail closed with 503 instead of hanging or returning unhandled errors when DB is disconnected
app.use('/api', (_req, res, next) => {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database service is currently unavailable. Please try again shortly.' });
  }
  next();
});

app.use('/', authRouter);
app.use('/', require('./routes/admin')(wss, broadcasts));
app.use('/', require('./routes/media')(wss, broadcasts));
app.use('/', require('./routes/messageLifecycle')(wss, broadcasts));
app.use('/', require('./routes/messages'));
app.use('/', require('./routes/gifs'));
app.use('/', require('./routes/linkPreview'));
app.use('/', require('./routes/download'));
app.use('/api/rooms', roomsRouter);

// ---------------------------------------------------------------------------
// Load persisted chat state from MongoDB
// ---------------------------------------------------------------------------
const loadGlobalChatState = async () => {
  try {
    const states = await ChatState.find({});
    states.forEach(state => {
      if (state.frontendHiddenBefore) {
        const roomState = getRoomState(state.roomId);
        roomState.frontendHiddenBefore = new Date(state.frontendHiddenBefore);
      }
    });
    logger.info(`Loaded chat state for ${states.length} rooms.`);
  } catch (err) {
    logger.error('Failed to load chat states:', err);
  }
};

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const startServer = async () => {
  await connectDB();
  await loadGlobalChatState();

  server.listen(PORT, () => {
    logger.info(`Server is listening on port ${PORT}`);
  });

  // Extend the default HTTP socket timeout to 10 minutes.
  // Node.js's built-in default is 5 minutes, but reverse proxies (Azure App Service,
  // nginx) often enforce their own 230-second idle timeout. The final upload chunk
  // triggers a Cloudinary upload that can take 1-3 minutes for large videos on slow
  // mobile connections. Without this, the proxy cuts the connection before the
  // Cloudinary response arrives, causing the frontend to see 'Failed to fetch' and
  // permanently fail the upload with no retry possible.
  server.setTimeout(10 * 60 * 1000); // 10 minutes
  server.keepAliveTimeout = 10 * 60 * 1000;
  server.headersTimeout = 10 * 60 * 1000 + 5000; // Must be > keepAliveTimeout
};

startServer();
