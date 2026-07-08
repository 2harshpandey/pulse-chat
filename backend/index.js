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
const { apiLimiter } = require('./middleware');
const { initWebSocket } = require('./websocket');
const authRouter = require('./routes/auth');
const roomsRouter = require('./routes/rooms');

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
// Server setup
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
// Allow all origins (the chat is public) while being explicit about which
// methods and headers are permitted so mobile-browser CORS preflight checks
// never fail due to an unrecognised header name.
app.use(helmet());
app.use(cors({
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'x-admin-secret', 'x-room-id'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(apiLimiter);

// ---------------------------------------------------------------------------
// WebSocket — initialise before routes so broadcast helpers are available
// ---------------------------------------------------------------------------
const broadcasts = initWebSocket(wss);
const { broadcastToAdmins, broadcastOnlineUsers, broadcast } = broadcasts;

// Inject broadcast into auth router (needs it for audit-log fan-out)
authRouter.setBroadcast(broadcastToAdmins);

// ---------------------------------------------------------------------------
// Route mounting
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.status(200).send('OK'));
app.get('/', (_req, res) => res.send('Pulse Chat Server is running!'));

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
