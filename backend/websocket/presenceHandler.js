'use strict';

const { WebSocket } = require('ws');
const logger = require('../logger');
const User = require('../models/user');
const Message = require('../models/message');
const AuditLog = require('../models/auditLog');
const { extractIp, generateDeviceHash, toClientMessage, isUserBlocked } = require('../middleware');
const {
  getRoomState,
  userFingerprints,
  INITIAL_HISTORY_BATCH_SIZE,
} = require('../state');

/**
 * Handle user_join message from a client socket.
 */
const handleUserJoin = async ({
  ws,
  req,
  parsedMessage,
  wss,
  broadcastToAdmins,
  _broadcast,
  _broadcastOnlineUsers,
  loadPinnedMessages,
  _getVisibleMessagesQuery,
}) => {
  const { userId, username, fingerprint: fpData, roomId = 'me' } = parsedMessage;
  ws.userId = userId;
  ws.username = username;
  ws.roomId = roomId;

  const { onlineUsers, loggedInUsers, pendingDisconnects, typingUsers } = getRoomState(roomId);

  // Collect connection fingerprint
  const wsIp = extractIp(req);
  const wsUa = req.headers['user-agent'] || '';
  ws.clientIp = wsIp;
  ws.clientUa = wsUa;

  // Store fingerprint data
  if (fpData || true) {
    const existing = userFingerprints.get(userId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
    existing.ips.add(wsIp);
    if (wsUa) existing.userAgents.add(wsUa);
    if (fpData) {
      existing.screenResolution = fpData.screenResolution || existing.screenResolution;
      existing.platform = fpData.platform || existing.platform;
      existing.language = fpData.language || existing.language;
      existing.timezone = fpData.timezone || existing.timezone;
      const hash = generateDeviceHash({ ...fpData, userAgent: wsUa });
      existing.deviceHashes.add(hash);
    }
    userFingerprints.set(userId, existing);
  }

  // Check if user is blocked (async)
  const blockResult = await isUserBlocked(roomId, userId, wsIp, wsUa, fpData);
  if (blockResult.blocked) {
    logger.warn(`Blocked user '${username}' attempted to join room ${roomId} via WebSocket.`);
    ws.send(JSON.stringify({ type: 'force_logout', message: 'You have been blocked from this chat room.' }));
    await AuditLog.create({
      roomId,
      type: 'join_failed_blocked',
      details: { userId, username, reason: blockResult.reason, via: 'websocket' },
      ip: wsIp, userAgent: wsUa,
    });
    broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_blocked', details: { userId, username }, timestamp: new Date() });
    setTimeout(() => ws.terminate(), 300);
    return;
  }

  // Duplicate username guard & session takeover
  const trimmedLower = username.trim().toLowerCase();
  const roomState = getRoomState(roomId);
  const existingPickerGrace = roomState.filePickerPresenceByUsername?.get(trimmedLower);
  const isWithinPickerGrace = existingPickerGrace && existingPickerGrace.expiresAt > Date.now();

  const conflictingClients = Array.from(wss.clients).filter(
    client =>
      client !== ws &&
      client.readyState === WebSocket.OPEN &&
      !client.isAdmin &&
      client.username &&
      client.roomId === roomId &&
      client.username.trim().toLowerCase() === trimmedLower
  );

  let usernameTaken = false;
  if (conflictingClients.length > 0) {
    for (const client of conflictingClients) {
      if (client.userId === userId) {
        // Exact same user reconnecting/refreshing. Terminate older hanging socket to avoid duplicates.
        logger.info(`Terminating older hanging socket for reconnecting user '${username}' (${userId}).`);
        client.terminate();
      } else if (isWithinPickerGrace || (client.clientIp === wsIp && client.isAlive === false)) {
        // User opened native file picker on mobile, tab was killed/evicted by OS, or un-alive zombie.
        logger.info(`Recovering file picker session for '${username}' (old userId: ${client.userId}, new userId: ${userId}).`);
        client.terminate();
      } else {
        usernameTaken = true;
      }
    }
  }

  if (usernameTaken) {
    logger.warn(`Username '${username}' rejected — already in use.`);
    ws.send(JSON.stringify({
      type: 'username_taken',
      message: 'That username is already in use. Please choose a different one.',
    }));
    setTimeout(() => ws.terminate(), 300);
    return;
  }

  let reconnectedFromPending = false;
  if (pendingDisconnects.has(userId)) {
    clearTimeout(pendingDisconnects.get(userId));
    pendingDisconnects.delete(userId);
    reconnectedFromPending = true;
  } else {
    for (const [pUserId, timerId] of pendingDisconnects.entries()) {
      const pUser = onlineUsers.get(pUserId);
      if (pUser && pUser.username && pUser.username.trim().toLowerCase() === trimmedLower) {
        clearTimeout(timerId);
        pendingDisconnects.delete(pUserId);
        onlineUsers.delete(pUserId);
        reconnectedFromPending = true;
        break;
      }
    }
  }

  if (isWithinPickerGrace) {
    roomState.filePickerPresenceByUsername?.delete(trimmedLower);
  }

  if (reconnectedFromPending) {
    logger.info(`User '${username}' rejoined room ${roomId} (reconnect / refresh).`);
  } else {
    logger.info(`User '${username}' joined room ${roomId}.`);
    _broadcast(roomId, {
      type: 'system_notification',
      id: `system-${Date.now()}`,
      text: `${username} has joined the chat.`,
      timestamp: new Date().toISOString(),
    });
  }

  onlineUsers.set(userId, { userId, username });
  
  if (typingUsers.has(userId)) {
    typingUsers.delete(userId);
  }

  if (!loggedInUsers.has(userId)) {
    loggedInUsers.set(userId, { userId, username, loginTime: new Date(), ip: ws.clientIp, userAgent: ws.clientUa });
  }

  User.findOneAndUpdate(
    { roomId, userId },
    {
      $set: { roomId, userId, username, lastSeen: new Date() },
      $push: {
        joinHistory: {
          $each: [new Date()],
          $slice: -100,
        },
      },
    },
    { upsert: true, new: true }
  ).catch(err => logger.error('Failed to save user:', err));

  broadcastToAdmins(roomId, 'user_joined', { userId, username });
  broadcastToAdmins(
    roomId,
    'activity',
    reconnectedFromPending ? `User '${username}' reconnected (reconnect / refresh).` : `User '${username}' connected.`
  );
  broadcastToAdmins(roomId, 'logged_in_users', Array.from(loggedInUsers.values()));
  _broadcastOnlineUsers(roomId);

  Promise.all([
    Message.find({ roomId, ..._getVisibleMessagesQuery(roomId) }).sort({ createdAt: -1 }).limit(INITIAL_HISTORY_BATCH_SIZE + 1).lean(),
    loadPinnedMessages(roomId),
  ])
    .then(([messagesDesc]) => {
      const hasMoreHistory = messagesDesc.length > INITIAL_HISTORY_BATCH_SIZE;
      const windowDesc = hasMoreHistory
        ? messagesDesc.slice(0, INITIAL_HISTORY_BATCH_SIZE)
        : messagesDesc;
      const cleanMessages = windowDesc.reverse().map(toClientMessage);
      const oldestCreatedAt = cleanMessages.length > 0 ? cleanMessages[0].createdAt : null;
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'history',
          data: cleanMessages,
          hasMoreHistory,
          oldestCreatedAt,
        }));

        ws.send(JSON.stringify({
          type: 'pinned_messages_update',
          data: getRoomState(roomId).pinnedMessages
        }));
      }
    })
    .catch(err => logger.error('Failed to send initial history:', err));
};

/**
 * Handle user_logout message.
 */
const handleUserLogout = ({ ws, parsedMessage, broadcastToAdmins, _broadcast, _broadcastOnlineUsers }) => {
  const logoutUserId = parsedMessage.userId || ws.userId;
  const roomId = ws.roomId || 'me';
  if (logoutUserId) {
    const { loggedInUsers, onlineUsers, typingUsers, filePickerPresenceGrace, pendingDisconnects } = getRoomState(roomId);
    const logoutUser = loggedInUsers.get(logoutUserId) || onlineUsers.get(logoutUserId);
    const logoutUsername = logoutUser?.username || ws.username || 'Unknown';
    loggedInUsers.delete(logoutUserId);
    onlineUsers.delete(logoutUserId);
    typingUsers.delete(logoutUserId);
    filePickerPresenceGrace.delete(logoutUserId);
    if (pendingDisconnects.has(logoutUserId)) {
      clearTimeout(pendingDisconnects.get(logoutUserId));
      pendingDisconnects.delete(logoutUserId);
    }
    logger.info(`User '${logoutUsername}' logged out explicitly from room ${roomId}.`);
    broadcastToAdmins(roomId, 'user_logged_out', { userId: logoutUserId, username: logoutUsername });
    broadcastToAdmins(roomId, 'logged_in_users', Array.from(loggedInUsers.values()));
    broadcastToAdmins(roomId, 'activity', `User '${logoutUsername}' logged out.`);
    _broadcastOnlineUsers(roomId);

    _broadcast(roomId, {
      type: 'system_notification',
      id: `system-${Date.now()}`,
      text: `${logoutUsername} has left the chat.`,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Handle file picker presence grace.
 */
const handleFilePickerOpen = ({ ws, parsedMessage }) => {
  if (ws.userId && ws.roomId) {
    const ttlMs = Math.max(10000, Math.min(Number(parsedMessage.ttlMs) || 120000, 180000));
    const expiresAt = Date.now() + ttlMs;
    const roomState = getRoomState(ws.roomId);
    roomState.filePickerPresenceGrace.set(ws.userId, expiresAt);
    if (ws.username && roomState.filePickerPresenceByUsername) {
      roomState.filePickerPresenceByUsername.set(ws.username.trim().toLowerCase(), {
        userId: ws.userId,
        ip: ws.clientIp,
        expiresAt,
      });
    }
  }
};

const handleFilePickerClose = ({ ws }) => {
  if (ws.userId && ws.roomId) {
    const roomState = getRoomState(ws.roomId);
    roomState.filePickerPresenceGrace.delete(ws.userId);
    if (ws.username && roomState.filePickerPresenceByUsername) {
      roomState.filePickerPresenceByUsername.delete(ws.username.trim().toLowerCase());
    }
  }
};

const VALID_PRESENCE_ACTIVITIES = new Set([
  'typing',
  'gif_selecting',
  'sending_audio',
  'sending_photo',
  'sending_video',
  'sending_file',
  'sending_media',
  'sending_gif',
]);

/**
 * Handle typing and media sending presence updates.
 */
const handleStartTyping = ({ ws, parsedMessage, _broadcastOnlineUsers }) => {
  if (ws.userId && ws.roomId) {
    const raw = typeof parsedMessage.activity === 'string' ? parsedMessage.activity.trim() : '';
    const activity = VALID_PRESENCE_ACTIVITIES.has(raw) ? raw : 'typing';
    getRoomState(ws.roomId).typingUsers.set(ws.userId, activity);
    _broadcastOnlineUsers(ws.roomId);
  }
};

const handleStopTyping = ({ ws, _broadcastOnlineUsers }) => {
  if (ws.userId && ws.roomId) {
    getRoomState(ws.roomId).typingUsers.delete(ws.userId);
    _broadcastOnlineUsers(ws.roomId);
  }
};

/**
 * Handle socket disconnection with presence debounce grace period.
 */
const handleSocketClose = ({ ws, wss, broadcastToAdmins, _broadcast, _broadcastOnlineUsers }) => {
  const roomId = ws.roomId || 'me';
  const { onlineUsers, typingUsers, filePickerPresenceGrace, pendingDisconnects } = getRoomState(roomId);
  if (ws.userId && onlineUsers.has(ws.userId)) {
    const hasOtherActiveSocket = Array.from(wss.clients).some(
      client => client !== ws && client.readyState === 1 && client.roomId === roomId && client.userId === ws.userId
    );
    if (hasOtherActiveSocket) {
      return;
    }

    const user = onlineUsers.get(ws.userId);
    const filePickerGraceUntil = filePickerPresenceGrace.get(ws.userId) || 0;
    const disconnectDelayMs = filePickerGraceUntil > Date.now() ? 120000 : 10000;
    logger.info(`User '${user.username}' disconnected. Starting ${Math.round(disconnectDelayMs / 1000)}s timer.`);

    const timerId = setTimeout(() => {
      logger.info(`User '${user.username}' truly left.`);
      onlineUsers.delete(ws.userId);
      typingUsers.delete(ws.userId);
      filePickerPresenceGrace.delete(ws.userId);

      _broadcast(roomId, {
        type: 'system_notification',
        id: `system-${Date.now()}`,
        text: `${user.username} has left the chat.`,
        timestamp: new Date().toISOString(),
      });

      _broadcastOnlineUsers(roomId);
      broadcastToAdmins(roomId, 'user_left', { userId: ws.userId });
      broadcastToAdmins(roomId, 'activity', `User '${user.username}' disconnected.`);
      pendingDisconnects.delete(ws.userId);
    }, disconnectDelayMs);

    pendingDisconnects.set(ws.userId, timerId);
  }
};

module.exports = {
  handleUserJoin,
  handleUserLogout,
  handleFilePickerOpen,
  handleFilePickerClose,
  handleStartTyping,
  handleStopTyping,
  handleSocketClose,
};
