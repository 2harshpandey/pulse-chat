'use strict';

const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const logger = require('../logger');
const { getRoomState } = require('../state');

/**
 * Send a typed message to every authenticated admin WebSocket client in a room.
 */
/**
 * Send a typed message to every authenticated admin WebSocket client in a room.
 * For room-specific events (roomId !== 'me' && roomId !== 'global'), also relays
 * to super admin clients ('me') with room context for comprehensive live monitoring.
 */
const broadcastToAdmins = (roomId, type, data) => {
  const { adminClients } = getRoomState(roomId);
  const targetRoomClients = (adminClients && adminClients.size > 0) ? Array.from(adminClients) : [];

  let superAdminClients = [];
  if (roomId !== 'me' && roomId !== 'global') {
    const superState = getRoomState('me');
    if (superState && superState.adminClients && superState.adminClients.size > 0) {
      superAdminClients = Array.from(superState.adminClients);
    }
  }

  const allTargets = new Set([...targetRoomClients, ...superAdminClients]);
  if (allTargets.size === 0) return;

  try {
    const regularMessage = JSON.stringify({ type, data, roomId });
    const superAdminActivityMessage = (type === 'activity' && typeof data === 'string' && !data.includes(`[Room: ${roomId}]`))
      ? JSON.stringify({ type, data: `[Room: ${roomId}] ${data}`, roomId })
      : regularMessage;

    allTargets.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        if (superAdminClients.includes(client) && !targetRoomClients.includes(client)) {
          client.send(superAdminActivityMessage);
        } else {
          client.send(regularMessage);
        }
      }
    });
  } catch (err) {
    logger.error('Error in broadcastToAdmins stringify:', err.message);
  }
};

/**
 * Broadcast the current online-users list to every client in a room.
 */
const broadcastOnlineUsers = (wss, roomId) => {
  const { onlineUsers, typingUsers } = getRoomState(roomId);
  const users = Array.from(onlineUsers.values()).map(user => {
    const rawActivity = typingUsers.get(user.userId);
    const activity = rawActivity || undefined;
    return {
      ...user,
      isTyping: Boolean(activity),
      activity,
    };
  });
  try {
    const message = JSON.stringify({ type: 'online_users', data: users });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
        client.send(message);
      }
    });
  } catch (err) {
    logger.error('Error in broadcastOnlineUsers stringify:', err.message);
  }
};

/**
 * Broadcast a raw message object to every connected client in a room.
 */
const broadcast = (wss, roomId, message) => {
  try {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
        client.send(data);
      }
    });
  } catch (err) {
    logger.error('Error in broadcast stringify:', err.message);
  }
};

/**
 * Log-file watcher — safely reads the last ~1MB (up to 1,000 lines) of pulse-activity.log and broadcasts to admins.
 * Debounced and only runs if at least one admin client is actively connected.
 */
let logDebounceTimer = null;
const startLogWatcher = () => {
  const logFilePath = path.join(__dirname, '..', 'pulse-activity.log');

  if (!fs.existsSync(logFilePath)) {
    try {
      fs.writeFileSync(logFilePath, '');
    } catch (_) {}
  }

  try {
    fs.watch(logFilePath, (eventType) => {
      if (eventType === 'change') {
        if (logDebounceTimer) return;
        logDebounceTimer = setTimeout(() => {
          logDebounceTimer = null;
          const { roomStates } = require('../state');
          let hasAdmins = false;
          for (const state of roomStates.values()) {
            if (state.adminClients && state.adminClients.size > 0) {
              hasAdmins = true;
              break;
            }
          }
          if (!hasAdmins) return;

          // Read up to 1MB of the file instead of loading the entire file into memory
          fs.stat(logFilePath, (statErr, stats) => {
            if (statErr || !stats) return;
            const bufferSize = Math.min(stats.size, 1048576);
            if (bufferSize === 0) return;

            const buffer = Buffer.alloc(bufferSize);
            let fd;
            try {
              fd = fs.openSync(logFilePath, 'r');
              fs.readSync(fd, buffer, 0, bufferSize, stats.size - bufferSize);
              let rawText = buffer.toString('utf8');
              if (stats.size > bufferSize) {
                const firstNewline = rawText.indexOf('\n');
                if (firstNewline !== -1) {
                  rawText = rawText.slice(firstNewline + 1);
                }
              }
              const lines = rawText.split('\n').filter(Boolean).slice(-1000).join('\n');
              const payload = { type: 'server_logs', data: lines };
              broadcastToAdmins('me', payload.type, payload.data);
            } catch (readErr) {
              // Ignore or log error without throwing
            } finally {
              if (fd) {
                try { fs.closeSync(fd); } catch (_) {}
              }
            }
          });
        }, 3000);
      }
    });
  } catch (err) {
    logger.warn('Could not start log watcher:', err.message);
  }
};

module.exports = {
  broadcastToAdmins,
  broadcastOnlineUsers,
  broadcast,
  startLogWatcher,
};
