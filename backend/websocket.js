'use strict';

const logger = require('./logger');
const { getRoomState } = require('./state');
const { getVisibleMessagesQuery } = require('./routes/media');

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
  setupAdmin,
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

  // --- WebSocket Heartbeat (Ping/Pong) ---
  const heartbeatInterval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
      if (ws.isAlive === false) {
        logger.warn('Heartbeat: Terminating dead connection.');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping(() => {});
      if (ws.readyState === 1 /* WebSocket.OPEN */) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    });
  }, 15000);

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

      if (parsedMessage.type !== 'admin_auth' && parsedMessage.type !== 'ping' && parsedMessage.type !== 'pong' && parsedMessage.type !== 'start_typing' && parsedMessage.type !== 'stop_typing' && parsedMessage.type !== 'client_diagnostic') {
        logger.info('Received message:', parsedMessage);
      }

      switch (parsedMessage.type) {
        case 'client_diagnostic':
          try {
            const diag = parsedMessage.data || parsedMessage;
            const eventName = diag.event || diag.action || 'client_action';
            const username = ws.user?.username || diag.username || 'Anonymous';
            const roomId = ws.roomId || diag.roomId || 'unknown';
            logger.info(`[Client-Diag] [Room: ${roomId}] ${username}: ${eventName}`, {
              telemetry: true,
              roomId,
              userId: ws.user?.userId || diag.userId,
              username,
              details: diag.details || diag
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
              const fn = diag.details?.filename ? ` '${diag.details.filename}'` : '';
              safeActivity = `User '${username}' downloaded file${fn}.`;
            }

            if (safeActivity && roomId && roomId !== 'unknown') {
              broadcastToAdmins(roomId, 'activity', safeActivity);
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
          await handleNewMessage({ ws, parsedMessage, wss, broadcastToAdmins, _broadcastOnlineUsers });
          break;
      }
    }

    if (isAdminConnection) {
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
