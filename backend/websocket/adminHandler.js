'use strict';

const User = require('../models/user');
const Room = require('../models/room');
const logger = require('../logger');
const { getRoomState } = require('../state');

/**
 * Configure and register an authenticated admin client.
 */
const setupAdmin = (ws, roomId, adminClients, loggedInUsers, onlineUsers, broadcastToAdmins, loadPinnedMessages) => {
  ws.isAdmin = true;
  ws.roomId = roomId;
  adminClients.add(ws);
  logger.info(`An admin client authenticated and connected to room ${roomId}!`);
  logger.info(`Online users snapshot for admin (room ${roomId}): ${onlineUsers.size} user(s)`);
  broadcastToAdmins(roomId, 'activity', `An admin client connected to admin channel.`);
  User.find({ roomId }).then(allDbUsers => {
    ws.send(JSON.stringify({ type: 'users', data: allDbUsers }));
  });
  loadPinnedMessages(roomId).then(() => {
    ws.send(JSON.stringify({
      type: 'pinned_messages_update',
      data: getRoomState(roomId).pinnedMessages
    }));
  });
  // Send current logged-in users
  ws.send(JSON.stringify({ type: 'logged_in_users', data: Array.from(loggedInUsers.values()) }));
  // Send current online users
  ws.send(JSON.stringify({ type: 'online_users_admin', data: Array.from(onlineUsers.values()) }));
  ws.on('close', () => {
    adminClients.delete(ws);
    logger.info(`An admin client disconnected from admin channel (room ${roomId}).`);
    broadcastToAdmins(roomId, 'activity', `An admin client disconnected from admin channel.`);
  });
};

/**
 * Handle initial admin authentication handshake message.
 */
const handleAdminAuth = (ws, rawData, broadcastToAdmins, loadPinnedMessages, handleClientMessage) => {
  try {
    const data = JSON.parse(rawData.toString());
    logger.info(`Admin auth attempt: roomId=${data.roomId}, type=${data.type}, hasPassword=${!!data.password}`);
    if (data.type === 'admin_auth' && data.roomId) {
      const roomId = data.roomId;
      const { adminClients, loggedInUsers, onlineUsers } = getRoomState(roomId);
      
      let isValid = false;
      if (data.password === process.env.ADMIN_PASSWORD) {
        isValid = true;
      } else {
        Room.findOne({ id: roomId }).then(room => {
          if (room && room.adminPassword === data.password) {
            setupAdmin(ws, roomId, adminClients, loggedInUsers, onlineUsers, broadcastToAdmins, loadPinnedMessages);
            ws.on('message', handleClientMessage);
          } else {
            logger.warn(`Admin auth failed for room ${roomId}: room found=${!!room}, password match=${room ? room.adminPassword === data.password : 'N/A'}`);
            ws.terminate();
          }
        }).catch((err) => {
          logger.error(`Admin auth DB error for room ${roomId}:`, err);
          ws.terminate();
        });
        return;
      }
      
      if (isValid) {
        setupAdmin(ws, roomId, adminClients, loggedInUsers, onlineUsers, broadcastToAdmins, loadPinnedMessages);
        ws.on('message', handleClientMessage);
      }
    } else {
      logger.warn('Admin auth failed: missing data.', { type: data.type, hasRoomId: !!data.roomId });
      ws.terminate();
    }
  } catch (err) {
    logger.error('Admin auth exception:', err);
    ws.terminate();
  }
};

module.exports = {
  setupAdmin,
  handleAdminAuth,
};
