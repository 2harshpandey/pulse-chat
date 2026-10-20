'use strict';

const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const logger = require('../logger');
const { getRoomState } = require('../state');

/**
 * Send a typed message to every authenticated admin WebSocket client in a room.
 */
const broadcastToAdmins = (roomId, type, data) => {
  const message = JSON.stringify({ type, data });
  const { adminClients } = getRoomState(roomId);
  logger.info(`Broadcasting to ${adminClients.size} admin client(s) in room ${roomId}: ${message}`);
  adminClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      logger.info(`Admin client not open. State: ${client.readyState}`);
    }
  });
};

/**
 * Broadcast the current online-users list to every client in a room.
 */
const broadcastOnlineUsers = (wss, roomId) => {
  const { onlineUsers, typingUsers } = getRoomState(roomId);
  const users = Array.from(onlineUsers.values()).map(user => {
    const rawActivity = typingUsers.get(user.userId);
    const activity = rawActivity === 'gif_selecting' ? 'gif_selecting' : (rawActivity ? 'typing' : undefined);
    return {
      ...user,
      isTyping: Boolean(activity),
      activity,
    };
  });
  const message = JSON.stringify({ type: 'online_users', data: users });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(message);
    }
  });
};

/**
 * Broadcast a raw message object to every connected client in a room.
 */
const broadcast = (wss, roomId, message) => {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(data);
    }
  });
};

/**
 * Log-file watcher — tails pulse-activity.log and broadcasts new lines to admins.
 */
const startLogWatcher = () => {
  const logFilePath = path.join(__dirname, '..', 'pulse-activity.log');

  if (!fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, '');
  }

  fs.watch(logFilePath, (eventType) => {
    if (eventType === 'change') {
      fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) return;
        const lines = data.split('\n').slice(-200).join('\n');
        const payload = { type: 'server_logs', data: lines };
        
        // Broadcast to admins in all rooms for server logs
        const { roomStates } = require('../state');
        for (const roomId of roomStates.keys()) {
          broadcastToAdmins(roomId, payload.type, payload.data);
        }
      });
    }
  });
};

module.exports = {
  broadcastToAdmins,
  broadcastOnlineUsers,
  broadcast,
  startLogWatcher,
};
