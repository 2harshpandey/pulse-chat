'use strict';

const { WebSocket } = require('ws');
const logger = require('../logger');
const User = require('../models/user');
const Message = require('../models/message');
const Room = require('../models/room');
const AuditLog = require('../models/auditLog');
const { timingSafeEqualStr, verifyPassword, generateSessionToken, verifySignedSessionToken } = require('../security');
const { extractIp, generateDeviceHash, toClientMessage, isUserBlocked, isLoginLocked, toSafeLoggedInUserList } = require('../middleware');
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
  const rawUserId = parsedMessage.userId;
  const rawUsername = parsedMessage.username;
  const cleanRoomId = typeof parsedMessage.roomId === 'string' && parsedMessage.roomId.trim()
    ? parsedMessage.roomId.trim()
    : 'me';

  // Strict type & presence validation to prevent TypeErrors, session corruption, and NoSQL injection
  if (!rawUserId || typeof rawUserId !== 'string' || !rawUserId.trim() ||
      !rawUsername || typeof rawUsername !== 'string' || !rawUsername.trim()) {
    logger.warn('Rejected invalid user_join payload: missing or malformed userId/username');
    ws.send(JSON.stringify({ type: 'force_logout', message: 'Invalid credentials. Please log in again.' }));
    setTimeout(() => ws.terminate(), 300);
    return;
  }

  if (rawUsername.trim().length > 50 || rawUserId.trim().length > 64) {
    logger.warn('Rejected user_join payload: username or userId exceeds maximum allowed length');
    ws.send(JSON.stringify({ type: 'force_logout', message: 'Username cannot exceed 50 characters.' }));
    setTimeout(() => ws.terminate(), 300);
    return;
  }

  const userId = rawUserId.trim();
  const username = rawUsername.trim();
  let roomId = cleanRoomId;
  const fpData = parsedMessage.fingerprint;
  const rawSessionToken = parsedMessage.sessionToken;
  const sessionTokenProvided = typeof rawSessionToken === 'string' && rawSessionToken.trim() ? rawSessionToken.trim() : null;

  // Collect connection fingerprint early for authorization & session validation
  const wsIp = extractIp(req);
  const wsUa = req.headers['user-agent'] || '';
  ws.clientIp = wsIp;
  ws.clientUa = wsUa;

  // IMPORTANT: Do NOT assign ws.roomId or ws.userId yet!
  // Assigning ws.roomId before authorization creates an information-leak window where
  // unauthenticated sockets receive room broadcasts before being terminated.
  ws.roomId = null;
  ws.userId = null;
  ws.username = null;

  // Enforce room existence and lookup password requirements
  let requiresPassword = false;
  let roomDoc = null;
  if (roomId === 'me') {
    requiresPassword = Boolean(process.env.CLIENT_PASSWORD);
  } else if (roomId !== 'global') {
    try {
      roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
      if (!roomDoc) {
        logger.warn(`Rejected WebSocket join to non-existent room '${roomId}' by user '${username}'`);
        ws.send(JSON.stringify({ type: 'force_logout', message: 'Chat room does not exist.' }));
        setTimeout(() => ws.terminate(), 300);
        return;
      }
      // Do not allow joining private room via alias
      if (roomDoc.isPrivate && cleanRoomId !== roomDoc.id) {
        logger.warn(`Rejected WebSocket join to private room via alias '${cleanRoomId}' by user '${username}'`);
        ws.send(JSON.stringify({ type: 'force_logout', message: 'Chat room does not exist.' }));
        setTimeout(() => ws.terminate(), 300);
        return;
      }
      // Canonicalize roomId to roomDoc.id to prevent room state fragmentation across aliases
      roomId = roomDoc.id;
      if (roomDoc.isPrivate) {
        requiresPassword = true;
      }
    } catch (err) {
      logger.error('Failed to lookup room during user_join:', err);
      ws.send(JSON.stringify({ type: 'force_logout', message: 'Internal server error.' }));
      setTimeout(() => ws.terminate(), 300);
      return;
    }
  }

  const { onlineUsers, loggedInUsers, pendingDisconnects, typingUsers } = getRoomState(roomId);

  let activeSessionToken = null;
  const existingSession = loggedInUsers.get(userId);

  if (existingSession) {
    if (existingSession.sessionToken) {
      if (sessionTokenProvided && timingSafeEqualStr(sessionTokenProvided, existingSession.sessionToken)) {
        activeSessionToken = existingSession.sessionToken;
      }
    } else {
      // Legacy session without token: allow if IP matches and upgrade to cryptographic token
      if (existingSession.ip && existingSession.ip === wsIp) {
        activeSessionToken = generateSessionToken(userId, roomId);
        existingSession.sessionToken = activeSessionToken;
      }
    }
  }

  // Cross-restart or multi-instance fallback: verify signed token or check database User record
  if (!activeSessionToken && sessionTokenProvided) {
    const verified = verifySignedSessionToken(sessionTokenProvided);
    if (verified && verified.userId === userId && (verified.roomId === roomId || (cleanRoomId && verified.roomId === cleanRoomId))) {
      activeSessionToken = sessionTokenProvided;
      if (existingSession) {
        existingSession.sessionToken = activeSessionToken;
      }
    } else {
      try {
        const dbUser = await User.findOne({ roomId: String(roomId), userId: String(userId) }).lean();
        if (dbUser && dbUser.sessionToken && timingSafeEqualStr(sessionTokenProvided, dbUser.sessionToken)) {
          activeSessionToken = sessionTokenProvided;
          if (existingSession) {
            existingSession.sessionToken = activeSessionToken;
          }
        }
      } catch (_) {}
    }
  }

  if (requiresPassword) {
    let isAuthorized = Boolean(activeSessionToken);

    if (!isAuthorized && parsedMessage.password) {
      if (roomId === 'me') {
        isAuthorized = Boolean(process.env.CLIENT_PASSWORD && timingSafeEqualStr(parsedMessage.password, process.env.CLIENT_PASSWORD));
      } else if (roomDoc && roomDoc.joinPassword) {
        isAuthorized = verifyPassword(parsedMessage.password, roomDoc.joinPassword);
      }
      if (isAuthorized) {
        activeSessionToken = generateSessionToken(userId, roomId);
      }
    }

    if (!isAuthorized) {
      logger.warn(`Unauthorized WebSocket join attempt to private room '${roomId}' by user '${username}' (${userId}) from IP ${wsIp}`);
      ws.send(JSON.stringify({
        type: 'force_logout',
        message: 'Authentication required to enter this private room.'
      }));
      setTimeout(() => ws.terminate(), 300);
      return;
    }
  } else {
    // Public room or /me without password
    // Prevent an attacker from hijacking an active user's session without their sessionToken
    if (existingSession && existingSession.sessionToken && !activeSessionToken) {
      logger.warn(`Rejected session hijack attempt in room '${roomId}' for userId '${userId}' from IP ${wsIp}`);
      ws.send(JSON.stringify({
        type: 'force_logout',
        message: 'Invalid session token for this user. Please log in again.'
      }));
      setTimeout(() => ws.terminate(), 300);
      return;
    }

    if (!activeSessionToken) {
      if (sessionTokenProvided) {
        const verified = verifySignedSessionToken(sessionTokenProvided);
        if (verified && (verified.userId !== userId || verified.roomId !== roomId)) {
          // Token signature belongs to a different user/room — generate a fresh token for this user
          activeSessionToken = generateSessionToken(userId, roomId);
        } else {
          activeSessionToken = sessionTokenProvided;
        }
      } else {
        activeSessionToken = generateSessionToken(userId, roomId);
      }
    }
  }


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

  // Check login lockdown (allow already logged-in users to resume/reconnect)
  if (!loggedInUsers.has(userId)) {
    const lockCheck = await isLoginLocked(roomId);
    if (lockCheck.locked) {
      logger.warn(`User '${username}' attempted to join room ${roomId} via WebSocket while lockdown is active.`);
      ws.send(JSON.stringify({ type: 'force_logout', message: 'New logins are temporarily disabled. Please try again later.' }));
      await AuditLog.create({
        roomId,
        type: 'join_failed_lockdown',
        details: { userId, username, via: 'websocket' },
        ip: wsIp,
        userAgent: wsUa,
      });
      broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_lockdown', details: { userId, username, via: 'websocket' }, timestamp: new Date() });
      broadcastToAdmins(roomId, 'activity', `Join attempt rejected: User '${username}' attempted to join via WebSocket while lockdown is active.`);
      setTimeout(() => ws.terminate(), 300);
      return;
    }
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
        // Only terminate older socket if from the same IP, zombie connection, or verified by cryptographic session token
        const isTokenVerified = Boolean(activeSessionToken && existingSession?.sessionToken && timingSafeEqualStr(activeSessionToken, existingSession.sessionToken));
        if (client.clientIp === wsIp || client.isAlive === false || isTokenVerified) {
          logger.info(`Terminating older hanging socket for reconnecting user '${username}' (${userId}).`);
          client.terminate();
        } else {
          usernameTaken = true;
        }
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
        const prevLogged = loggedInUsers.get(pUserId);
        const prevFp = userFingerprints.get(pUserId);
        const isSameIp = Boolean(prevLogged?.ip && prevLogged.ip === wsIp);
        const isFpMatch = Boolean(wsIp && prevFp?.ips?.has(wsIp));
        if (isSameIp || isFpMatch || !prevLogged?.ip) {
          clearTimeout(timerId);
          pendingDisconnects.delete(pUserId);
          onlineUsers.delete(pUserId);
          reconnectedFromPending = true;
          break;
        }
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
    const roomState = getRoomState(roomId);
    if (roomState.typingTimeouts && roomState.typingTimeouts.has(userId)) {
      clearTimeout(roomState.typingTimeouts.get(userId));
      roomState.typingTimeouts.delete(userId);
    }
  }

  if (!loggedInUsers.has(userId)) {
    loggedInUsers.set(userId, {
      userId,
      username,
      sessionToken: activeSessionToken,
      loginTime: new Date(),
      ip: ws.clientIp,
      userAgent: ws.clientUa,
    });
  } else {
    const s = loggedInUsers.get(userId);
    if (activeSessionToken) {
      s.sessionToken = activeSessionToken;
    }
    s.username = username;
    s.ip = ws.clientIp;
    s.userAgent = ws.clientUa;
  }

  // Socket is now authenticated and safely bound to room
  ws.sessionToken = activeSessionToken;
  ws.userId = userId;
  ws.username = username;
  ws.roomId = roomId;

  // Send auth_success with sessionToken to client
  ws.send(JSON.stringify({
    type: 'auth_success',
    sessionToken: activeSessionToken,
    userId,
    username,
    roomId,
  }));


  User.findOneAndUpdate(
    { roomId: String(roomId), userId: String(userId) },
    {
      $set: {
        roomId: String(roomId),
        userId: String(userId),
        username: String(username),
        sessionToken: activeSessionToken,
        lastSeen: new Date(),
      },
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
  broadcastToAdmins(roomId, 'logged_in_users', toSafeLoggedInUserList(loggedInUsers));
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
  // Non-admin sockets can only log out their own authenticated session
  const logoutUserId = ws.isAdmin && typeof parsedMessage.userId === 'string' && parsedMessage.userId.trim()
    ? parsedMessage.userId.trim()
    : ws.userId;
  const roomId = ws.roomId || 'me';
  if (logoutUserId) {
    const { loggedInUsers, onlineUsers, typingUsers, filePickerPresenceGrace, pendingDisconnects } = getRoomState(roomId);
    const logoutUser = loggedInUsers.get(logoutUserId) || onlineUsers.get(logoutUserId);
    const logoutUsername = logoutUser?.username || ws.username || 'Unknown';
    loggedInUsers.delete(logoutUserId);
    onlineUsers.delete(logoutUserId);
    typingUsers.delete(logoutUserId);
    const roomState = getRoomState(roomId);
    if (roomState.typingTimeouts && roomState.typingTimeouts.has(logoutUserId)) {
      clearTimeout(roomState.typingTimeouts.get(logoutUserId));
      roomState.typingTimeouts.delete(logoutUserId);
    }
    filePickerPresenceGrace.delete(logoutUserId);
    if (pendingDisconnects.has(logoutUserId)) {
      clearTimeout(pendingDisconnects.get(logoutUserId));
      pendingDisconnects.delete(logoutUserId);
    }
    logger.info(`User '${logoutUsername}' logged out explicitly from room ${roomId}.`);
    broadcastToAdmins(roomId, 'user_logged_out', { userId: logoutUserId, username: logoutUsername });
    broadcastToAdmins(roomId, 'logged_in_users', toSafeLoggedInUserList(loggedInUsers));
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
  'recording_audio',
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
    const roomState = getRoomState(ws.roomId);

    // Clear prior auto-expiration timer if active
    if (roomState.typingTimeouts && roomState.typingTimeouts.has(ws.userId)) {
      clearTimeout(roomState.typingTimeouts.get(ws.userId));
      roomState.typingTimeouts.delete(ws.userId);
    }

    roomState.typingUsers.set(ws.userId, activity);
    _broadcastOnlineUsers(ws.roomId);

    // Rolling auto-expiration: automatically prune typing indicator after 7s of inactivity
    if (roomState.typingTimeouts) {
      const timer = setTimeout(() => {
        if (roomState.typingUsers.has(ws.userId)) {
          roomState.typingUsers.delete(ws.userId);
          roomState.typingTimeouts.delete(ws.userId);
          _broadcastOnlineUsers(ws.roomId);
        }
      }, 7000);
      if (timer && typeof timer.unref === 'function') timer.unref();
      roomState.typingTimeouts.set(ws.userId, timer);
    }
  }
};

const handleStopTyping = ({ ws, _broadcastOnlineUsers }) => {
  if (ws.userId && ws.roomId) {
    const roomState = getRoomState(ws.roomId);
    if (roomState.typingTimeouts && roomState.typingTimeouts.has(ws.userId)) {
      clearTimeout(roomState.typingTimeouts.get(ws.userId));
      roomState.typingTimeouts.delete(ws.userId);
    }
    if (roomState.typingUsers.has(ws.userId)) {
      roomState.typingUsers.delete(ws.userId);
      _broadcastOnlineUsers(ws.roomId);
    }
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

    if (typingUsers.has(ws.userId)) {
      typingUsers.delete(ws.userId);
      const roomState = getRoomState(roomId);
      if (roomState.typingTimeouts && roomState.typingTimeouts.has(ws.userId)) {
        clearTimeout(roomState.typingTimeouts.get(ws.userId));
        roomState.typingTimeouts.delete(ws.userId);
      }
      _broadcastOnlineUsers(roomId);
    }

    const user = onlineUsers.get(ws.userId);
    const filePickerGraceUntil = filePickerPresenceGrace.get(ws.userId) || 0;
    const disconnectDelayMs = filePickerGraceUntil > Date.now() ? 120000 : 10000;
    logger.info(`User '${user.username}' disconnected. Starting ${Math.round(disconnectDelayMs / 1000)}s timer.`);

    const timerId = setTimeout(() => {
      logger.info(`User '${user.username}' truly left.`);
      onlineUsers.delete(ws.userId);
      typingUsers.delete(ws.userId);
      const stateOnExpiry = getRoomState(roomId);
      if (stateOnExpiry.typingTimeouts && stateOnExpiry.typingTimeouts.has(ws.userId)) {
        clearTimeout(stateOnExpiry.typingTimeouts.get(ws.userId));
        stateOnExpiry.typingTimeouts.delete(ws.userId);
      }
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
    if (timerId && typeof timerId.unref === 'function') timerId.unref();

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
