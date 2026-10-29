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
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : null;

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
    if (!origin || !allowedOrigins || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
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

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !allowedOrigins || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'x-admin-secret', 'x-room-id', 'x-user-id', 'x-session-token', 'x-room-password', 'Range'],
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

app.use('/', authRouter);
app.use('/', require('./routes/admin')(wss, broadcasts));
app.use('/', require('./routes/media')(wss, broadcasts));
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
