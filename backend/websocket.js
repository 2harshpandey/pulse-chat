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
      const parsedMessage = JSON.parse(message.toString());
      if (parsedMessage.type !== 'admin_auth' && parsedMessage.type !== 'ping' && parsedMessage.type !== 'pong' && parsedMessage.type !== 'start_typing' && parsedMessage.type !== 'stop_typing') {
        logger.info('Received message:', parsedMessage);
      }

      switch (parsedMessage.type) {
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
          await handleReact({ ws, parsedMessage, wss });
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
          await handlePinMessage({ ws, parsedMessage, broadcastPinnedMessages: _broadcastPinnedMessages, loadPinnedMessages });
          break;

        case 'unpin_message':
          await handleUnpinMessage({ ws, parsedMessage, broadcastPinnedMessages: _broadcastPinnedMessages });
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
    ws.on('message', handleClientMessage);

    ws.on('close', () => {
      handleSocketClose({ ws, wss, broadcastToAdmins, _broadcast, _broadcastOnlineUsers });
    });

    ws.on('error', (error) => logger.error('WebSocket Error:', { message: error.message }));
  });

  // Start the log file watcher
  startLogWatcher();

  return { broadcastToAdmins, broadcastOnlineUsers: _broadcastOnlineUsers, broadcast: _broadcast };
};

module.exports = { initWebSocket };
