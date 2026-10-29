'use strict';

const User = require('../models/user');
const Room = require('../models/room');
const AuditLog = require('../models/auditLog');
const logger = require('../logger');
const { getRoomState } = require('../state');
const { timingSafeEqualStr, verifyPassword } = require('../security');
const { isPasswordLocked, recordFailedPasswordAttempt, resetPasswordAttempts, toSafeLoggedInUserList } = require('../middleware');

/**
 * Configure and register an authenticated admin client.
 */
const setupAdmin = (ws, roomId, adminClients, loggedInUsers, onlineUsers, broadcastToAdmins, loadPinnedMessages) => {
  ws.isAdmin = true;
  ws.roomId = roomId;
  ws.userId = ws.userId || 'admin';
  ws.username = ws.username || 'Admin';
  adminClients.add(ws);
  logger.info(`An admin client authenticated and connected to room ${roomId}!`);
  logger.info(`Online users snapshot for admin (room ${roomId}): ${onlineUsers.size} user(s)`);
  broadcastToAdmins(roomId, 'activity', `An admin client connected to admin channel.`);
  User.find({ roomId }).sort({ lastSeen: -1 }).limit(500).lean().then(allDbUsers => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'users', data: allDbUsers }));
    }
  }).catch((err) => logger.error('Failed to query users for admin:', err));

  loadPinnedMessages(roomId).then(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'pinned_messages_update',
        data: getRoomState(roomId).pinnedMessages
      }));
    }
  }).catch((err) => logger.error('Failed to load pinned messages for admin:', err));

  // Send current logged-in users (stripped of sensitive sessionToken)
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'logged_in_users', data: toSafeLoggedInUserList(loggedInUsers) }));
  }
  // Send current online users
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'online_users_admin', data: Array.from(onlineUsers.values()) }));
  }
  ws.on('close', () => {
    adminClients.delete(ws);
    logger.info(`An admin client disconnected from admin channel (room ${roomId}).`);
    broadcastToAdmins(roomId, 'activity', `An admin client disconnected from admin channel.`);
  });
};

/**
 * Handle initial admin authentication handshake message.
 */
const handleAdminAuth = async (ws, rawData, broadcastToAdmins, loadPinnedMessages, handleClientMessage) => {
  try {
    let data;
    try {
      data = JSON.parse(rawData.toString());
    } catch (parseErr) {
      logger.warn('Failed to parse admin auth JSON:', { error: parseErr.message });
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload.' }));
      return ws.terminate();
    }

    if (!data || typeof data !== 'object') {
      return ws.terminate();
    }

    const rawRoomId = data.roomId;
    const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
    const password = typeof data.password === 'string' ? data.password : '';
    const clientIp = ws.clientIp || 'unknown';

    logger.info(`Admin auth attempt: roomId=${roomId}, type=${data.type}, hasPassword=${Boolean(password)}`);
    if (data.type === 'admin_auth' && rawRoomId) {
      let targetRoom = null;
      if (roomId !== 'me' && roomId !== 'global') {
        try {
          targetRoom = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
        } catch (dbErr) {
          logger.error(`Admin auth DB lookup error for room ${roomId}:`, dbErr);
        }
        if (!targetRoom) {
          try {
            ws.send(JSON.stringify({ type: 'error', message: 'Chat room does not exist.' }));
          } catch (_) {}
          setTimeout(() => ws.terminate(), 300).unref();
          return;
        }
      }

      const canonicalRoomId = targetRoom ? targetRoom.id : roomId;
      const rateLimitKey = `${clientIp}_${canonicalRoomId}`;

      // Enforce lockout check against canonical room key
      const remainingSec = isPasswordLocked(rateLimitKey);
      if (remainingSec > 0) {
        logger.warn(`Admin auth blocked by lockout for IP ${clientIp} on room ${canonicalRoomId}`);
        try {
          ws.send(JSON.stringify({ type: 'error', message: `Too many failed attempts. Locked out for ${remainingSec} seconds.` }));
        } catch (_) {}
        setTimeout(() => ws.terminate(), 300).unref();
        return;
      }

      const { adminClients, loggedInUsers, onlineUsers } = getRoomState(canonicalRoomId);

      const onAuthFailure = () => {
        recordFailedPasswordAttempt(rateLimitKey, { ip: clientIp, headers: { 'user-agent': ws.clientUa } });
        AuditLog.create({
          roomId: canonicalRoomId,
          type: 'admin_auth_failed',
          details: { reason: 'Incorrect admin password via WebSocket' },
          ip: clientIp,
          userAgent: ws.clientUa || '',
        }).then((entry) => {
          broadcastToAdmins(canonicalRoomId, 'audit_log', entry);
        }).catch(() => {});
        logger.warn(`Admin auth failed for room ${canonicalRoomId} from IP ${clientIp}`);
        try {
          ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Incorrect admin password.' }));
        } catch (_) {}
        setTimeout(() => ws.terminate(), 300).unref();
      };

      let isValid = false;
      if (process.env.ADMIN_PASSWORD && timingSafeEqualStr(password, process.env.ADMIN_PASSWORD)) {
        isValid = true;
      } else if (targetRoom && (verifyPassword(password, targetRoom.adminPassword) || (process.env.ADMIN_PASSWORD && timingSafeEqualStr(password, process.env.ADMIN_PASSWORD)))) {
        isValid = true;
      }

      if (isValid) {
        resetPasswordAttempts(rateLimitKey);
        setupAdmin(ws, canonicalRoomId, adminClients, loggedInUsers, onlineUsers, broadcastToAdmins, loadPinnedMessages);
        ws.on('message', (msg) => {
          handleClientMessage(msg).catch((err) => logger.error('Admin message error:', err));
        });
      } else {
        onAuthFailure();
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
  handleAdminAuth,
};
