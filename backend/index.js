'use strict';

require('dotenv').config();
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const logger = require('./logger');
const connectDB = require('./db');
const ChatState = require('./models/chatState');
const { setFrontendHiddenBefore, GLOBAL_CHAT_STATE_KEY } = require('./state');
const { apiLimiter } = require('./middleware');
const { initWebSocket } = require('./websocket');
const authRouter = require('./routes/auth');

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
app.use(cors({
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'x-admin-secret'],
}));
app.use(express.json());
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

// ---------------------------------------------------------------------------
// Load persisted chat state from MongoDB
// ---------------------------------------------------------------------------
const loadGlobalChatState = async () => {
  try {
    const state = await ChatState.findOne({ key: GLOBAL_CHAT_STATE_KEY });
    if (state?.frontendHiddenBefore) {
      setFrontendHiddenBefore(new Date(state.frontendHiddenBefore));
      logger.info(`Loaded frontendHiddenBefore: ${state.frontendHiddenBefore}`);
    }
  } catch (err) {
    logger.error('Failed to load global chat state:', err);
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
};

startServer();
