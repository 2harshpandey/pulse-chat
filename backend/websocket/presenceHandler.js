'use strict';

const mongoose = require('mongoose');
const { WebSocket } = require('ws');
const logger = require('../logger');
const User = require('../models/user');
const Message = require('../models/message');
const Room = require('../models/room');
const AuditLog = require('../models/auditLog');
const { timingSafeEqualStr, generateSessionToken, verifySignedSessionToken, hashSessionToken, hasStoredSessionToken } = require('../security');
const { verifyActiveSessionToken, doesTokenMatchInMemorySession } = require('../sessionService');
const { extractIp, generateDeviceHash, toPublicClientMessage, isUserBlocked, isLoginLocked, toSafeLoggedInUserList } = require('../middleware');
const {
  getRoomState,
  userFingerprints,
  INITIAL_HISTORY_BATCH_SIZE,
} = require('../state');

/**
 * Send an error/logout frame and schedule socket termination.
 */
const terminateJoinWithError = (ws, payload, delayMs = 300) => {
  try {
    ws.send(JSON.stringify(payload));
  } catch (_) {}
  setTimeout(() => ws.terminate(), delayMs);
};

/**
 * Shared token matcher for reclaiming another userId's picker-grace or pending-disconnect slot.
 */
const matchesTargetUserSessionToken = ({
  sessionTokenProvided,
  prevLogged,
}) => {
  if (!sessionTokenProvided) return false;
  const incomingHash = hashSessionToken(sessionTokenProvided);
  return doesTokenMatchInMemorySession(prevLogged, sessionTokenProvided, incomingHash);
};

/**
 * Resolve roomId to its canonical database ID and check if the room requires a password.
 */
const resolveJoinRoomTarget = async (ws, initialRoomId, username) => {
  const lowerRoomId = typeof initialRoomId === 'string' ? initialRoomId.trim().toLowerCase() : '';
  if (lowerRoomId === 'me') {
    return { ok: true, roomId: 'me', requiresPassword: Boolean(process.env.CLIENT_PASSWORD) };
  }
  if (lowerRoomId === 'global') {
    return { ok: true, roomId: 'global', requiresPassword: false };
  }
  try {
    const roomDoc = await Room.findByIdOrAlias(initialRoomId, { lean: true });
    if (!roomDoc) {
      logger.warn(`Rejected WebSocket join to non-existent room '${initialRoomId}' by user '${username}'`);
      terminateJoinWithError(ws, { type: 'force_logout', message: 'Chat room does not exist.' });
      return { ok: false };
    }
    return {
      ok: true,
      roomId: roomDoc.id,
      requiresPassword: Boolean(roomDoc.isPrivate && roomDoc.joinPassword),
    };
  } catch (err) {
    logger.error('Failed to lookup room during user_join:', err);
    terminateJoinWithError(ws, { type: 'force_logout', message: 'Internal server error.' });
    return { ok: false };
  }
};

/**
 * Verify in-memory or persisted session token, apply 7-day rolling rotation,
 * and enforce private/public room entry rules.
 */
const verifyOrIssueJoinSession = async ({
  ws,
  roomId,
  cleanRoomId,
  userId,
  username,
  requiresPassword,
  sessionTokenProvided,
  roomState,
  wsIp,
}) => {
  const { loggedInUsers } = roomState;
  let activeSessionToken = null;
  let shouldPersistNewTokenHash = false;
  let dbLookupError = null;
  const existingSession = loggedInUsers.get(userId);

  if (sessionTokenProvided) {
    const verifyRes = await verifyActiveSessionToken({
      roomId,
      rawRoomId: cleanRoomId || roomId,
      userId,
      sessionToken: sessionTokenProvided,
      roomState,
      ip: wsIp,
      fallbackUsername: username,
      hydrateIfMissing: false,
      preserveTimestampSession: false,
    });
    if (verifyRes.valid) {
      activeSessionToken = verifyRes.matchedToken || sessionTokenProvided;
      shouldPersistNewTokenHash = verifyRes.needsTokenHashPersist;
    } else if (verifyRes.dbError) {
      dbLookupError = verifyRes.dbError;
      logger.warn(`Database error during session verification fallback for user '${userId}' in room '${roomId}':`, { error: verifyRes.dbError?.message || verifyRes.dbError });
    }
  }

  // Rolling expiration: refresh signed session tokens older than 7 days on active visits
  if (activeSessionToken && typeof activeSessionToken === 'string' && activeSessionToken.startsWith('pls.')) {
    const tokenData = verifySignedSessionToken(activeSessionToken);
    if (tokenData && typeof tokenData.iat === 'number' && (Date.now() - tokenData.iat > 7 * 24 * 60 * 60 * 1000)) {
      activeSessionToken = generateSessionToken(userId, roomId);
      shouldPersistNewTokenHash = true;
      if (existingSession) {
        existingSession.sessionToken = activeSessionToken;
        existingSession.sessionTokenHash = hashSessionToken(activeSessionToken);
        if (!(existingSession.sessionTokens instanceof Set)) {
          existingSession.sessionTokens = new Set();
        }
        existingSession.sessionTokens.add(activeSessionToken);
      }
    }
  }

  if (requiresPassword) {
    const isAuthorized = Boolean(activeSessionToken);
    if (!isAuthorized && dbLookupError) {
      logger.warn(`Transient DB error aborted private-room auth for '${username}' (${userId}); closing socket cleanly for retry without wiping client session.`);
      terminateJoinWithError(ws, { type: 'error', message: 'Temporary server connection error. Reconnecting...' });
      return { ok: false };
    }
    if (!isAuthorized) {
      logger.warn(`Unauthorized WebSocket join attempt to private room '${roomId}' by user '${username}' (${userId}) from IP ${wsIp}`);
      terminateJoinWithError(ws, {
        type: 'force_logout',
        message: 'Authentication required to enter this private room. Please log in first.'
      });
      return { ok: false };
    }
  } else {
    if (existingSession && (existingSession.sessionToken || existingSession.sessionTokenHash) && !activeSessionToken) {
      logger.warn(`Rejected session hijack attempt in room '${roomId}' for userId '${userId}' from IP ${wsIp}`);
      terminateJoinWithError(ws, {
        type: 'force_logout',
        message: 'Invalid session token for this user. Please log in again.'
      });
      return { ok: false };
    }

    if (!activeSessionToken) {
      if (dbLookupError) {
        logger.warn(`Transient DB error aborted session verification for '${username}' (${userId}); closing socket cleanly for retry.`);
        terminateJoinWithError(ws, { type: 'error', message: 'Temporary server connection error. Reconnecting...' });
        return { ok: false };
      }
      try {
        const existingDbUser = await User.findOne({ roomId: String(roomId), userId: String(userId) })
          .select('sessionToken sessionTokenHash sessionTokenHashes')
          .lean();
        if (hasStoredSessionToken(existingDbUser)) {
          logger.warn(`Rejected unauthenticated session takeover in room '${roomId}' for userId '${userId}' from IP ${wsIp}`);
          terminateJoinWithError(ws, {
            type: 'force_logout',
            message: 'Invalid session token for this user. Please log in again.'
          });
          return { ok: false };
        }
      } catch (dbErr) {
        logger.error('Failed to verify persisted user session during user_join:', dbErr);
        terminateJoinWithError(ws, { type: 'error', message: 'Temporary server connection error. Reconnecting...' });
        return { ok: false };
      }
      activeSessionToken = generateSessionToken(userId, roomId);
      shouldPersistNewTokenHash = true;
    }
  }

  return { ok: true, activeSessionToken, shouldPersistNewTokenHash, existingSession };
};

/**
 * Record client fingerprint metadata and enforce room block & lockdown policies.
 */
const enforceJoinAccessPolicy = async ({ ws, roomId, userId, username, wsIp, wsUa, fpData, roomState, broadcastToAdmins }) => {
  const existingFp = userFingerprints.get(userId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
  existingFp.ips.add(wsIp);
  if (wsUa) existingFp.userAgents.add(wsUa);
  if (fpData && typeof fpData === 'object') {
    existingFp.screenResolution = fpData.screenResolution || existingFp.screenResolution;
    existingFp.platform = fpData.platform || existingFp.platform;
    existingFp.language = fpData.language || existingFp.language;
    existingFp.timezone = fpData.timezone || existingFp.timezone;
    existingFp.deviceHashes.add(generateDeviceHash({ ...fpData, userAgent: wsUa }));
  }
  existingFp.lastSeen = Date.now();
  userFingerprints.set(userId, existingFp);

  const blockResult = await isUserBlocked(roomId, userId, wsIp, wsUa, fpData);
  if (blockResult.blocked) {
    logger.warn(`Blocked user '${username}' attempted to join room ${roomId} via WebSocket.`);
    await AuditLog.create({
      roomId,
      type: 'join_failed_blocked',
      details: { userId, username, reason: blockResult.reason, via: 'websocket' },
      ip: wsIp,
      userAgent: wsUa,
    });
    broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_blocked', details: { userId, username }, timestamp: new Date() });
    terminateJoinWithError(ws, { type: 'force_logout', message: 'You have been blocked from this chat room.' });
    return false;
  }

  if (!roomState.loggedInUsers.has(userId)) {
    const lockCheck = await isLoginLocked(roomId);
    if (lockCheck.locked) {
      logger.warn(`User '${username}' attempted to join room ${roomId} via WebSocket while lockdown is active.`);
      await AuditLog.create({
        roomId,
        type: 'join_failed_lockdown',
        details: { userId, username, via: 'websocket' },
        ip: wsIp,
        userAgent: wsUa,
      });
      broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_lockdown', details: { userId, username, via: 'websocket' }, timestamp: new Date() });
      broadcastToAdmins(roomId, 'activity', `Join attempt rejected: User '${username}' attempted to join via WebSocket while lockdown is active.`);
      terminateJoinWithError(ws, { type: 'force_logout', message: 'New logins are temporarily disabled. Please try again later.' });
      return false;
    }
  }

  return true;
};

/**
 * Resolve conflicting active sockets, picker-grace slots, pending disconnects, and username uniqueness.
 */
const resolveJoinConflicts = ({
  ws,
  wss,
  roomId,
  cleanRoomId,
  userId,
  username,
  safeTabId,
  forceTakeover,
  sessionTokenProvided,
  activeSessionToken,
  existingSession,
  roomState,
  wsIp,
}) => {
  const { onlineUsers, loggedInUsers, pendingDisconnects } = roomState;
  const trimmedLower = username.trim().toLowerCase();
  const existingPickerGrace = roomState.filePickerPresenceByUsername?.get(trimmedLower);
  const isWithinPickerGrace = Boolean(existingPickerGrace && existingPickerGrace.expiresAt > Date.now());

  const conflictingClients = Array.from(wss.clients).filter(
    (client) =>
      client !== ws &&
      client.readyState === WebSocket.OPEN &&
      !client.isAdmin &&
      client.username &&
      client.roomId === roomId &&
      client.username.trim().toLowerCase() === trimmedLower
  );

  let usernameTaken = false;
  for (const client of conflictingClients) {
    if (client.userId === userId) {
      let isTokenVerified = Boolean(activeSessionToken && existingSession?.sessionToken && timingSafeEqualStr(activeSessionToken, existingSession.sessionToken));
      if (!isTokenVerified && activeSessionToken) {
        const verified = verifySignedSessionToken(activeSessionToken);
        if (verified && verified.userId === userId) {
          isTokenVerified = true;
        }
      }
      if (client.clientIp === wsIp || client.isAlive === false || isTokenVerified) {
        const isDifferentTab = Boolean(safeTabId && client.tabId && safeTabId !== client.tabId);
        const isClientHealthy = Boolean(
          client.isAlive !== false &&
          !client.terminatedByHeartbeat &&
          (!client.lastAppMessageAt || (Date.now() - client.lastAppMessageAt) < 20000)
        );
        if (isDifferentTab && isClientHealthy && !forceTakeover) {
          logger.info(`Displacing duplicate tab join for '${username}' (${userId}) to prevent reconnect loop.`);
          try {
            ws.send(JSON.stringify({
              type: 'session_displaced',
              reason: 'another_tab',
              message: 'This chat room is already open in another tab.',
            }));
          } catch (_) {}
          setTimeout(() => {
            try { ws.close(1000, 'another_tab'); } catch (_) {}
          }, 150);
          return { ok: false };
        }
        if (isDifferentTab) {
          logger.info(`Transferring active session for '${username}' (${userId}) to new tab.`);
          client.wasDisplaced = true;
          try {
            client.send(JSON.stringify({
              type: 'session_displaced',
              reason: 'another_tab',
              message: 'This chat session was opened in another tab.',
            }));
          } catch (_) {}
          setTimeout(() => {
            try { client.terminate(); } catch (_) {}
          }, 150);
        } else {
          logger.info(`Terminating older hanging socket for reconnecting user '${username}' (${userId}).`);
          client.terminate();
        }
      } else {
        usernameTaken = true;
      }
    } else if (
      isWithinPickerGrace &&
      matchesTargetUserSessionToken({
        sessionTokenProvided,
        prevLogged: loggedInUsers.get(client.userId),
        targetUserId: client.userId,
        roomId,
        cleanRoomId,
      })
    ) {
      logger.info(`Recovering file picker session for '${username}' (old userId: ${client.userId}, new userId: ${userId}).`);
      client.terminate();
    } else {
      usernameTaken = true;
    }
  }

  if (usernameTaken) {
    logger.warn(`Username '${username}' rejected — already in use.`);
    terminateJoinWithError(ws, { type: 'username_taken', message: 'That username is already in use. Please choose a different one.' });
    return { ok: false };
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
        const isTokenMatch = matchesTargetUserSessionToken({
          sessionTokenProvided,
          prevLogged: loggedInUsers.get(pUserId),
          targetUserId: pUserId,
          roomId,
          cleanRoomId,
        });
        if (isTokenMatch) {
          clearTimeout(timerId);
          pendingDisconnects.delete(pUserId);
          onlineUsers.delete(pUserId);
          reconnectedFromPending = true;
          break;
        }
        logger.warn(`Username '${username}' rejected — currently held in pending disconnect by another session.`);
        terminateJoinWithError(ws, { type: 'username_taken', message: 'That username is already in use. Please choose a different one.' });
        return { ok: false };
      }
    }
  }

  for (const u of onlineUsers.values()) {
    if (u.username && u.username.trim().toLowerCase() === trimmedLower && u.userId !== userId) {
      logger.warn(`Username '${username}' rejected — already taken by active user in room ${roomId}.`);
      terminateJoinWithError(ws, { type: 'username_taken', message: 'That username is already in use. Please choose a different one.' });
      return { ok: false };
    }
  }

  return { ok: true, reconnectedFromPending, isWithinPickerGrace, trimmedLower };
};

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
    return terminateJoinWithError(ws, { type: 'force_logout', message: 'Invalid credentials. Please log in again.' });
  }

  if (rawUsername.trim().length > 50 || rawUserId.trim().length > 64 || !/^[a-zA-Z0-9_-]{1,64}$/.test(rawUserId.trim())) {
    logger.warn('Rejected user_join payload: invalid userId format or excessive length');
    return terminateJoinWithError(ws, { type: 'force_logout', message: 'Invalid credentials. Please log in again.' });
  }

  // Database readiness check: fail closed if database is unavailable
  if (mongoose.connection.readyState !== 1) {
    logger.warn('Rejected WebSocket join: database is currently unavailable');
    return terminateJoinWithError(ws, { type: 'force_logout', message: 'Chat service is temporarily unavailable. Please try again shortly.' });
  }

  const userId = rawUserId.trim();
  const username = rawUsername.trim();
  const fpData = parsedMessage.fingerprint;
  const rawSessionToken = parsedMessage.sessionToken;
  const sessionTokenProvided = typeof rawSessionToken === 'string' && rawSessionToken.trim() ? rawSessionToken.trim() : null;

  const wsIp = extractIp(req);
  const wsUa = req.headers['user-agent'] || '';
  ws.clientIp = wsIp;
  ws.clientUa = wsUa;

  // IMPORTANT: Do NOT assign ws.roomId or ws.userId yet until authorization completes.
  ws.roomId = null;
  ws.userId = null;
  ws.username = null;

  const roomTarget = await resolveJoinRoomTarget(ws, cleanRoomId, username);
  if (!roomTarget.ok) return;
  const { roomId, requiresPassword } = roomTarget;

  const roomState = getRoomState(roomId);
  const { onlineUsers, loggedInUsers, pendingDisconnects, typingUsers } = roomState;

  const sessionAuth = await verifyOrIssueJoinSession({
    ws,
    roomId,
    cleanRoomId,
    userId,
    username,
    requiresPassword,
    sessionTokenProvided,
    roomState,
    wsIp,
  });
  if (!sessionAuth.ok) return;
  const { activeSessionToken, shouldPersistNewTokenHash, existingSession } = sessionAuth;

  const policyAllowed = await enforceJoinAccessPolicy({
    ws,
    roomId,
    userId,
    username,
    wsIp,
    wsUa,
    fpData,
    roomState,
    broadcastToAdmins,
  });
  if (!policyAllowed) return;

  const safeTabId = typeof parsedMessage.tabId === 'string' && parsedMessage.tabId.trim()
    ? parsedMessage.tabId.trim().slice(0, 64)
    : null;
  const forceTakeover = Boolean(parsedMessage.forceTakeover);

  // Abort gracefully before mutating existing sessions or disconnect timers
  // if the client closed the socket while async DB auth checks were in flight.
  if (ws.readyState !== 1) {
    logger.info(`Aborted join for '${username}' (${userId}) in room '${roomId}' — socket closed before join completed.`);
    return;
  }

  const conflictRes = resolveJoinConflicts({
    ws,
    wss,
    roomId,
    cleanRoomId,
    userId,
    username,
    safeTabId,
    forceTakeover,
    sessionTokenProvided,
    activeSessionToken,
    existingSession,
    roomState,
    wsIp,
  });
  if (!conflictRes.ok) return;
  const { reconnectedFromPending, isWithinPickerGrace, trimmedLower } = conflictRes;

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

  // Ensure no orphaned offline entries remain in onlineUsers before broadcasting room snapshot
  for (const [uid] of Array.from(onlineUsers.entries())) {
    if (uid === userId || pendingDisconnects.has(uid)) continue;
    const hasLiveSocket = Array.from(wss.clients).some(
      (c) => c.readyState <= 1 && c.roomId === roomId && c.userId === uid && !c.terminatedByHeartbeat
    );
    if (!hasLiveSocket) {
      onlineUsers.delete(uid);
      typingUsers.delete(uid);
    }
  }

  onlineUsers.set(userId, { userId, username });

  if (typingUsers.has(userId)) {
    typingUsers.delete(userId);
    if (roomState.typingTimeouts && roomState.typingTimeouts.has(userId)) {
      clearTimeout(roomState.typingTimeouts.get(userId));
      roomState.typingTimeouts.delete(userId);
    }
  }

  const tokenHash = activeSessionToken ? hashSessionToken(activeSessionToken) : null;
  if (!loggedInUsers.has(userId)) {
    loggedInUsers.set(userId, {
      userId,
      username,
      sessionToken: activeSessionToken,
      sessionTokenHash: tokenHash,
      sessionTokens: activeSessionToken ? new Set([activeSessionToken]) : new Set(),
      loginTime: new Date(),
      ip: ws.clientIp,
      userAgent: ws.clientUa,
    });
  } else {
    const s = loggedInUsers.get(userId);
    if (activeSessionToken) {
      s.sessionToken = activeSessionToken;
      s.sessionTokenHash = tokenHash;
      if (!(s.sessionTokens instanceof Set)) {
        s.sessionTokens = new Set();
      }
      s.sessionTokens.add(activeSessionToken);
      if (s.sessionTokens.size > 5) {
        const oldest = s.sessionTokens.values().next().value;
        s.sessionTokens.delete(oldest);
      }
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
  ws.tabId = safeTabId;

  ws.send(JSON.stringify({
    type: 'auth_success',
    sessionToken: activeSessionToken,
    userId,
    username,
    roomId,
  }));

  // Persist hashed session token to MongoDB User document (never store plaintext tokens)
  User.findOneAndUpdate(
    { roomId: String(roomId), userId: String(userId) },
    {
      $set: {
        roomId: String(roomId),
        userId: String(userId),
        username: String(username),
        sessionTokenHash: tokenHash,
        lastSeen: new Date(),
      },
      $unset: {
        sessionToken: 1,
      },
      $push: {
        ...(shouldPersistNewTokenHash && tokenHash ? {
          sessionTokenHashes: {
            $each: [tokenHash],
            $slice: -5,
          },
        } : {}),
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
      const cleanMessages = windowDesc.reverse().map(toPublicClientMessage);
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
    User.updateOne(
      { roomId: String(roomId), userId: String(logoutUserId) },
      { $unset: { sessionToken: 1, sessionTokenHash: 1, sessionTokenHashes: 1 } }
    ).catch(err => logger.error('Failed to clear sessionToken on logout:', err));
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

    const prevActivity = roomState.typingUsers.get(ws.userId);
    roomState.typingUsers.set(ws.userId, activity);

    // Broadcast only if activity changed or user was not actively typing/sending.
    // If activity is unchanged, this is a keep-alive heartbeat: renew expiration lease without redundant broadcast spam.
    if (prevActivity !== activity) {
      _broadcastOnlineUsers(ws.roomId);
    }

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
      client =>
        client !== ws &&
        client.readyState === 1 &&
        client.roomId === roomId &&
        client.userId === ws.userId &&
        client.isAlive !== false &&
        !client.terminatedByHeartbeat
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
    const hasPickerGrace = filePickerGraceUntil > Date.now();
    // If terminated by heartbeat after 35s+ of JS silence, expire presence rapidly instead of holding for another 10s
    const disconnectDelayMs = hasPickerGrace
      ? 120000
      : (ws.terminatedByHeartbeat ? 1500 : 10000);
    logger.info(`User '${user.username}' disconnected. Starting ${Math.round(disconnectDelayMs / 1000 * 10) / 10}s timer.`);

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
