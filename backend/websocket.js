'use strict';

const logger = require('./logger');
const { getRoomState } = require('./state');
const { getVisibleMessagesQuery } = require('./routes/media');
const { extractIp } = require('./middleware');

const {
  broadcastToAdmins,
  broadcastOnlineUsers,
  broadcast,
  startLogWatcher,
} = require('./websocket/broadcast');

const {
  broadcastPinnedMessages,
  loadPinnedMessages,
  startPinExpirationWatcher,
  unpinIfPinned,
  clearAllPins,
} = require('./websocket/pinnedManager');

const {
  handleAdminAuth,
} = require('./websocket/adminHandler');

const {
  handleUserJoin,
  handleUserLogout,
  handleFilePickerOpen,
  handleFilePickerClose,
  handleStartTyping,
  handleStopTyping,
  handleSocketClose,
} = require('./websocket/presenceHandler');

const {
  handleReact,
  handleEdit,
  handleReportUser,
  handlePinMessage,
  handleUnpinMessage,
  handleDeleteForEveryone,
  handleNewMessage,
} = require('./websocket/messageHandler');

function getWebSocketLogLabel(msg) {
  if (!msg || typeof msg !== 'object') return 'Incoming WebSocket event:';
  const type = msg.type;
  switch (type) {
    case 'message': {
      const mediaType = msg.message?.type || msg.messageType;
      if (mediaType === 'image' || mediaType === 'photo') return 'New photo message:';
      if (mediaType === 'video') return 'New video message:';
      if (mediaType === 'audio' || mediaType === 'voice') return 'New voice message:';
      if (mediaType === 'media_group' || mediaType === 'album') return 'New media album message:';
      if (mediaType === 'file' || mediaType === 'document') return 'New file message:';
      return 'New chat message:';
    }
    case 'file_picker_open':
      return 'File picker opened:';
    case 'file_picker_close':
      return 'File picker closed:';
    case 'react':
      return 'Reaction event:';
    case 'user_join':
      return 'User join request:';
    case 'delete_message':
      return 'Delete message request:';
    case 'delete_for_me':
      return 'Delete-for-me request:';
    case 'edit_message':
      return 'Edit message request:';
    case 'poll_vote':
      return 'Poll vote event:';
    case 'create_poll':
      return 'Create poll event:';
    case 'pin_message':
      return 'Pin message request:';
    case 'unpin_message':
      return 'Unpin message request:';
    case 'clear_chat':
      return 'Clear chat request:';
    case 'hide_chat_for_everyone':
      return 'Hide chat request:';
    case 'start_typing':
      return 'Typing started:';
    case 'stop_typing':
      return 'Typing stopped:';
    case 'album_download_cancel':
      return 'Album download cancelled:';
    case 'telemetry':
    case 'client_diagnostic':
      return 'Client telemetry event:';
    case 'error':
      return 'Client error event:';
    default: {
      if (typeof type === 'string' && type.trim()) {
        const readable = type
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return `${readable} event:`;
      }
      return 'Incoming WebSocket event:';
    }
  }
}

/**
 * Initialise all WebSocket logic on the given server instance.
 *
 * @param {import('ws').WebSocketServer} wss
 * @returns {{ broadcastToAdmins: Function, broadcastOnlineUsers: Function, broadcast: Function }}
 */
const initWebSocket = (wss) => {
  // Curry helpers that need `wss`
  const _broadcastOnlineUsers = (roomId) => broadcastOnlineUsers(wss, roomId);
  const _broadcast = (roomId, message) => broadcast(wss, roomId, message);
  const _broadcastPinnedMessages = (roomId) => broadcastPinnedMessages(wss, roomId);
  const _unpinIfPinned = (roomId, messageIds) => unpinIfPinned(wss, roomId, messageIds);
  const _clearAllPins = (roomId) => clearAllPins(wss, roomId);

  // Build the curried getVisibleMessagesQuery using state's getter
  const _getVisibleMessagesQuery = (roomId) => {
    return getVisibleMessagesQuery(() => getRoomState(roomId).frontendHiddenBefore)();
  };

  // Issue 4: Per-IP cap on unauthenticated admin WebSocket connections (prevents FD exhaustion DoS)
  const adminConnectionCounts = new Map(); // ip -> count
  // Periodic cleanup of stale entries (connections that disconnected silently)
  setInterval(() => {
    for (const [ip, count] of adminConnectionCounts.entries()) {
      if (count <= 0) adminConnectionCounts.delete(ip);
    }
  }, 5 * 60 * 1000).unref();

  // --- WebSocket Heartbeat (Ping/Pong) ---
  const heartbeatInterval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
      if (ws.isAlive === false) {
        logger.warn('Heartbeat: Terminating dead connection.');
        return ws.terminate();
      }
      ws.isAlive = false;
      try {
        ws.ping(() => {});
      } catch (_) {}
      if (ws.readyState === 1 /* WebSocket.OPEN */) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (_) {}
      }
    });
  }, 15000);
  if (heartbeatInterval && typeof heartbeatInterval.unref === 'function') {
    heartbeatInterval.unref();
  }

  wss.on('close', function close() {
    clearInterval(heartbeatInterval);
  });

  // --- Auto-Expiration Check for Pinned Messages ---
  startPinExpirationWatcher(wss);

  // --- WebSocket Connection Logic ---
  wss.on('connection', (ws, req) => {
    if (req.socket && typeof req.socket.setNoDelay === 'function') {
      req.socket.setNoDelay(true);
    }
    ws.isAlive = true;
    ws.clientIp = extractIp(req);
    ws.clientUa = req.headers['user-agent'] || '';
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const isAdminConnection = url.searchParams.get('admin') === 'true';

    async function handleClientMessage(message) {
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(message.toString());
      } catch (err) {
        logger.warn('Failed to parse WebSocket message JSON:', { error: err.message });
        return;
      }
      if (!parsedMessage || typeof parsedMessage !== 'object') return;
      ws.isAlive = true;

      // Per-socket rate limiter: max 50 frames per second to prevent DoS flooding
      const now = Date.now();
      if (!ws.rateLimitWindow || now - ws.rateLimitWindow > 1000) {
        ws.rateLimitWindow = now;
        ws.frameCount = 1;
      } else {
        ws.frameCount += 1;
        if (ws.frameCount > 50) {
          if (ws.frameCount === 51) {
            logger.warn(`Rate limit exceeded for WebSocket client (user: ${ws.userId || 'unjoined'}, ip: ${ws.clientIp})`);
            ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded. Please slow down.' }));
          }
          return;
        }
      }

      if (parsedMessage.type !== 'admin_auth' && parsedMessage.type !== 'ping' && parsedMessage.type !== 'pong' && parsedMessage.type !== 'start_typing' && parsedMessage.type !== 'stop_typing' && parsedMessage.type !== 'client_diagnostic') {
        // Issue 17: Log only safe metadata, never the message body (text/url/replyingTo) to avoid PII in logs
        logger.info(getWebSocketLogLabel(parsedMessage), {
          type: parsedMessage.type,
          roomId: ws.roomId,
          userId: ws.userId,
        });
      }

      // Disallow sending user actions prior to successful user_join
      if (
        parsedMessage.type !== 'user_join' &&
        parsedMessage.type !== 'ping' &&
        parsedMessage.type !== 'pong'
      ) {
        if ((!ws.isAdmin && !ws.userId) || !ws.roomId) {
          logger.warn(`Rejected WebSocket frame '${parsedMessage.type}' from unjoined socket`);
          ws.send(JSON.stringify({ type: 'error', message: 'You must join a room before sending events.' }));
          return;
        }
      }

      switch (parsedMessage.type) {
        case 'ping':
          ws.isAlive = true;
          if (ws.readyState === 1 /* WebSocket.OPEN */) {
            try { ws.send(JSON.stringify({ type: 'pong' })); } catch (_) {}
          }
          break;

        case 'pong':
          ws.isAlive = true;
          break;

        case 'client_diagnostic':
          try {
            if (!ws.roomId || !ws.userId) break;
            const diag = parsedMessage.data || parsedMessage;
            const eventName = typeof diag.event === 'string' ? diag.event.slice(0, 50) : (typeof diag.action === 'string' ? diag.action.slice(0, 50) : 'client_action');
            const username = ws.username || ws.user?.username || 'Anonymous';
            const roomId = ws.roomId;
            logger.info(`[Client-Diag] [Room: ${roomId}] ${username}: ${eventName}`, {
              telemetry: true,
              roomId,
              userId: ws.userId,
              username,
            });

            // Safe, non-sensitive live activity notifications for room moderators & super admins
            let safeActivity = null;
            if (eventName === 'audio_error') {
              safeActivity = `Audio/voice playback error for user '${username}'.`;
            } else if (eventName === 'video_error') {
              safeActivity = `Video playback issue for user '${username}'.`;
            } else if (eventName === 'voice_record_error') {
              safeActivity = `Voice recording issue for user '${username}'.`;
            } else if (eventName === 'voice_record_complete') {
              const dur = diag.details?.durationSeconds ? ` (${Math.round(diag.details.durationSeconds)}s)` : '';
              safeActivity = `User '${username}' recorded a voice note${dur}.`;
            } else if (eventName === 'album_zip_download_error') {
              safeActivity = `Media album download error for user '${username}'.`;
            } else if (eventName === 'album_zip_download_complete') {
              safeActivity = `User '${username}' completed downloading an album.`;
            } else if (eventName === 'file_download_complete') {
              const fn = typeof diag.details?.filename === 'string' ? ` '${diag.details.filename.slice(0, 50)}'` : '';
              safeActivity = `User '${username}' downloaded file${fn}.`;
            }

            if (safeActivity && ws.roomId && ws.userId) {
              broadcastToAdmins(ws.roomId, 'activity', safeActivity);
            }
          } catch (_) {}
          break;

        case 'user_join':
          await handleUserJoin({
            ws,
            req,
            parsedMessage,
            wss,
            broadcastToAdmins,
            _broadcast,
            _broadcastOnlineUsers,
            loadPinnedMessages,
            _getVisibleMessagesQuery,
          });
          break;

        case 'react':
          await handleReact({ ws, parsedMessage, wss, broadcastToAdmins });
          break;

        case 'edit':
          await handleEdit({ ws, parsedMessage, wss, broadcastToAdmins });
          break;

        case 'file_picker_open':
          handleFilePickerOpen({ ws, parsedMessage });
          break;

        case 'file_picker_close':
          handleFilePickerClose({ ws });
          break;

        case 'user_logout':
          handleUserLogout({ ws, parsedMessage, broadcastToAdmins, _broadcast, _broadcastOnlineUsers });
          break;

        case 'start_typing':
          handleStartTyping({ ws, parsedMessage, _broadcastOnlineUsers });
          break;

        case 'stop_typing':
          handleStopTyping({ ws, _broadcastOnlineUsers });
          break;

        case 'report_user':
          await handleReportUser({ ws, parsedMessage, broadcastToAdmins });
          break;

        case 'pin_message':
          await handlePinMessage({ ws, parsedMessage, broadcastPinnedMessages: _broadcastPinnedMessages, loadPinnedMessages, broadcastToAdmins });
          break;

        case 'unpin_message':
          await handleUnpinMessage({ ws, parsedMessage, wss, broadcastPinnedMessages: _broadcastPinnedMessages, broadcastToAdmins });
          break;

        case 'delete_for_everyone':
          await handleDeleteForEveryone({ ws, parsedMessage, wss, broadcastToAdmins });
          break;

        default:
          // Issue 11: Only route recognized chat message types to handleNewMessage.
          // Unknown type strings would still trigger DB queries (session lookup, reply resolution)
          // which can be abused as a DoS amplifier even with the 50 frame/s per-socket limit.
          {
            const CHAT_MSG_TYPES = new Set(['message', 'text', 'image', 'video', 'audio', 'file', 'gif', 'poll']);
            if (!CHAT_MSG_TYPES.has(parsedMessage.type)) {
              logger.warn(`Ignored unknown WebSocket message type '${parsedMessage.type}' from user ${ws.userId || 'unjoined'} in room ${ws.roomId || 'none'}`);
              break;
            }
            await handleNewMessage({ ws, parsedMessage, wss, broadcastToAdmins, _broadcastOnlineUsers });
          }
          break;
      }
    }

    // Enforce handshake timeout for unjoined/unauthenticated sockets to prevent connection exhaustion
    const joinTimeout = setTimeout(() => {
      if (!ws.userId && !ws.isAdmin) {
        logger.warn(`Unauthenticated socket connection timed out from IP: ${ws.clientIp}`);
        try {
          ws.send(JSON.stringify({ type: 'force_logout', message: 'Connection handshake timed out.' }));
          ws.close(1008, 'Handshake timeout');
        } catch (_) {}
        setTimeout(() => ws.terminate(), 500);
      }
    }, 25000);
    if (joinTimeout && typeof joinTimeout.unref === 'function') joinTimeout.unref();

    if (isAdminConnection) {
      // Issue 4: Enforce per-IP cap on admin WebSocket connections before authentication
      const adminIp = ws.clientIp || '127.0.0.1';
      const currentCount = (adminConnectionCounts.get(adminIp) || 0) + 1;
      adminConnectionCounts.set(adminIp, currentCount);
      if (currentCount > 5) {
        logger.warn(`Admin WS connection limit exceeded for IP ${adminIp} (count: ${currentCount}). Closing.`);
        adminConnectionCounts.set(adminIp, Math.max(0, currentCount - 1));
        try {
          ws.close(1008, 'Too many admin connections from this IP.');
        } catch (_) {}
        return;
      }
      ws.on('close', () => {
        const c = adminConnectionCounts.get(adminIp) || 1;
        adminConnectionCounts.set(adminIp, Math.max(0, c - 1));
      });
      ws.once('message', (rawData) => {
        handleAdminAuth(ws, rawData, broadcastToAdmins, loadPinnedMessages, handleClientMessage);
      });
      return;
    }

    logger.info('A new client connected!');
    ws.on('message', (data) => {
      handleClientMessage(data).catch((err) => {
        logger.error('WebSocket client message error:', { message: err.message, stack: err.stack });
      });
    });

    ws.on('close', () => {
      clearTimeout(joinTimeout);
      handleSocketClose({ ws, wss, broadcastToAdmins, _broadcast, _broadcastOnlineUsers });
    });

    ws.on('error', (error) => logger.error('WebSocket Error:', { message: error.message }));
  });

  // Start the log file watcher
  startLogWatcher();

  return {
    broadcastToAdmins,
    broadcastOnlineUsers: _broadcastOnlineUsers,
    broadcast: _broadcast,
    broadcastPinnedMessages: _broadcastPinnedMessages,
    unpinIfPinned: _unpinIfPinned,
    clearAllPins: _clearAllPins,
  };
};

module.exports = { initWebSocket };
