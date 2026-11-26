// --- Auth Routes ---
// POST /api/auth/verify        — password auth
// POST /api/auth/verify-temp   — temp-link auth
// GET  /api/users/check-username — username availability

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('../logger');
const AuditLog = require('../models/auditLog');
const TempLink = require('../models/tempLink');
const Room = require('../models/room');
const User = require('../models/user');
const { timingSafeEqualStr, verifyPasswordAsync, hashPasswordAsync, generateSessionToken, hashSessionToken, hasStoredSessionToken, matchesStoredSessionToken } = require('../security');
const {
  getRoomState,
  userFingerprints,
  invalidateCachedRoom,
} = require('../state');
const {
  authLimiter,
  extractIp,
  generateDeviceHash,
  isUserBlocked,
  isLoginLocked,
  checkPasswordRateLimit,
  recordFailedPasswordAttempt,
  resetPasswordAttempts,
} = require('../middleware');
const { isRoomAccessAllowed } = require('../roomAccess');
const { doesTokenMatchInMemorySession } = require('../sessionService');

// broadcastToAdmins is injected at startup via initRoutes(); stored here.
let _broadcastToAdmins = () => {};
const setBroadcast = (broadcastToAdmins) => { _broadcastToAdmins = broadcastToAdmins; };

/**
 * Resolves username collision during authentication (standard password or temp link).
 * If the username is already registered to another active session in the room,
 * verifies whether the incoming connection qualifies for re-authentication grace
 * (e.g., reconnection during disconnect window, mobile file picker grace, or same IP).
 * If allowed, clears the old disconnect timer and evicts the previous session from onlineUsers.
 * If rejected, logs the audit event, broadcasts the security alert, and returns a 409 response.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.username
 * @param {string} params.userId
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @param {Object} params.roomState - State object from getRoomState(roomId)
 * @param {boolean} [params.viaTempLink=false] - Whether auth is via temp-link
 * @param {Object} res - Express response object
 * @returns {Promise<boolean>} - True if allowed/resolved; false if rejected with 409
 */
async function resolveUsernameCollision({ roomId, username, userId, ip, userAgent, roomState, viaTempLink = false, fingerprint = null, incomingSessionToken = null }, res) {
  if (!username || typeof username !== 'string') return true;

  const { onlineUsers, pendingDisconnects, filePickerPresenceByUsername } = roomState;
  const normalised = username.trim().toLowerCase();

  let takenUser = null;
  for (const u of onlineUsers.values()) {
    if (u.username && u.username.trim().toLowerCase() === normalised && u.userId !== userId) {
      takenUser = u;
      break;
    }
  }

  if (!takenUser) {
    return true;
  }

  const isPending = pendingDisconnects?.has(takenUser.userId);
  const pickerGrace = filePickerPresenceByUsername?.get(normalised);
  const hasPickerGrace =
    pickerGrace && pickerGrace.expiresAt > Date.now();

  const prevLogged = roomState.loggedInUsers?.get(takenUser.userId);
  const incomingToken = typeof incomingSessionToken === 'string' && incomingSessionToken.trim() ? incomingSessionToken.trim() : null;
  const incomingHash = incomingToken ? hashSessionToken(incomingToken) : null;
  const isTokenMatch = Boolean(
    incomingToken && doesTokenMatchInMemorySession(prevLogged, incomingToken, incomingHash)
  );

  // Require cryptographic session token match; never fall back to low-entropy device fingerprints
  // or IP alone, which can be collided or spoofed to reclaim active usernames.
  const canReclaim = (isPending || hasPickerGrace) && isTokenMatch;

  if (canReclaim) {
    const authType = viaTempLink ? 'temp-link re-auth' : 're-auth';
    logger.info(`Allowing ${authType} for '${username}' (migrating userId from ${takenUser.userId} to ${userId})`);
    if (isPending) {
      clearTimeout(pendingDisconnects.get(takenUser.userId));
      pendingDisconnects.delete(takenUser.userId);
    }
    onlineUsers.delete(takenUser.userId);
    return true;
  }

  const details = { userId, username };
  if (viaTempLink) details.viaTempLink = true;

  await AuditLog.create({ roomId, type: 'join_failed_username_taken', details, ip, userAgent });
  _broadcastToAdmins(roomId, 'audit_log', { roomId, type: 'join_failed_username_taken', details, ip, timestamp: new Date() });
  const activityMsg = viaTempLink
    ? `Temp link join attempt failed: Username '${username}' is already in use.`
    : `Join attempt failed: Username '${username}' is already in use.`;
  _broadcastToAdmins(roomId, 'activity', activityMsg);

  res.status(409).json({ success: false, error: 'That username is already in use. Please choose a different one.' });
  return false;
}

const isTokenMatchingSession = ({ cleanIncoming, incomingTokenHash, session }) => {
  if (!cleanIncoming) return false;
  return doesTokenMatchInMemorySession(session, cleanIncoming, incomingTokenHash);
};

const resolveAuthenticatedUserId = async ({ userId, roomId, roomState, incomingToken, fingerprint = null, userAgent = '' }) => {
  const { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceGrace } = roomState;
  const cleanIncoming = typeof incomingToken === 'string' && incomingToken.trim() ? incomingToken.trim() : null;
  const incomingTokenHash = cleanIncoming ? hashSessionToken(cleanIncoming) : null;
  const activeSess = loggedInUsers.get(userId);

  let tokenMatches = isTokenMatchingSession({
    cleanIncoming,
    incomingTokenHash,
    session: activeSess,
    roomId,
    userId,
  });

  // Active online session conflict (including pendingDisconnects and file-picker grace):
  // block unless caller proves ownership via cryptographic sessionToken.
  if (onlineUsers.has(userId)) {
    if (!tokenMatches) {
      return { conflict: true, userId };
    }
    return { conflict: false, userId };
  }

  // Offline userId takeover guard: if userId has an existing session in memory or MongoDB,
  // verify ownership before reusing it. If caller lacks the matching token (e.g. attacker
  // attempting offline takeover, or a legitimate user whose local token was cleared/expired),
  // rotate to a fresh server-generated userId so the existing user's session and messages remain protected.
  let hasProtectedSession = Boolean(activeSess && (activeSess.sessionToken || activeSess.sessionTokenHash));
  if (!tokenMatches) {
    const dbUser = await User.findOne({ roomId: String(roomId), userId: String(userId) })
      .select('sessionToken sessionTokenHash sessionTokenHashes')
      .lean();
    if (hasStoredSessionToken(dbUser)) {
      hasProtectedSession = true;
      tokenMatches = Boolean(
        cleanIncoming && matchesStoredSessionToken(dbUser, cleanIncoming, incomingTokenHash)
      );
    }
  }

  if (hasProtectedSession && !tokenMatches) {
    const freshUserId = `u_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    logger.warn(`Prevented unauthenticated userId reuse in room '${roomId}' for '${userId}'; assigned fresh userId '${freshUserId}'.`);
    return { conflict: false, userId: freshUserId };
  }

  return { conflict: false, userId };
};

const enforceRoomEntryAccess = async ({
  res,
  roomId,
  userId,
  username,
  ip,
  userAgent,
  fingerprint,
  incomingToken,
  roomState,
  viaTempLink = false,
}) => {
  const { loggedInUsers } = roomState;
  const displayUsername = typeof username === 'string' ? username.trim() : '';

  const blockCheck = await isUserBlocked(roomId, userId, ip, userAgent, fingerprint);
  if (blockCheck.blocked) {
    const details = viaTempLink
      ? { userId, username: displayUsername, reason: blockCheck.reason, viaTempLink: true }
      : { userId, username: displayUsername || username, reason: blockCheck.reason, blockedUsername: blockCheck.blockedUser?.username };
    await AuditLog.create({
      roomId,
      type: 'join_failed_blocked',
      details,
      ip,
      userAgent,
    });
    _broadcastToAdmins(roomId, 'audit_log', {
      type: 'join_failed_blocked',
      details: { userId, username: displayUsername || username, reason: blockCheck.reason },
      ip,
      timestamp: new Date(),
    });
    if (!viaTempLink) {
      _broadcastToAdmins(roomId, 'activity', `Join attempt blocked: Blocked user '${username || 'Unknown'}' attempted to enter.`);
    }
    res.status(403).json({ success: false, error: 'You have been blocked from this chat room.' });
    return false;
  }

  // Allow already logged-in users to resume even under lockdown if they present a valid session token
  const existingSession = loggedInUsers.get(userId);
  const cleanIncoming = typeof incomingToken === 'string' && incomingToken.trim() ? incomingToken.trim() : null;
  const incomingTokenHash = cleanIncoming ? hashSessionToken(cleanIncoming) : null;
  const isResumingSession = Boolean(
    existingSession &&
    isTokenMatchingSession({
      cleanIncoming,
      incomingTokenHash,
      session: existingSession,
      roomId,
      userId,
    })
  );

  if (!isResumingSession) {
    const lockCheck = await isLoginLocked(roomId);
    if (lockCheck.locked) {
      const details = viaTempLink
        ? { userId, username: displayUsername, viaTempLink: true }
        : { userId, username };
      await AuditLog.create({
        roomId,
        type: 'join_failed_lockdown',
        details,
        ip,
        userAgent,
      });
      _broadcastToAdmins(roomId, 'audit_log', {
        type: 'join_failed_lockdown',
        details,
        ip,
        timestamp: new Date(),
      });
      _broadcastToAdmins(
        roomId,
        'activity',
        viaTempLink
          ? `Temp link join attempt rejected: User '${displayUsername}' attempted to join while lockdown is active.`
          : `Join attempt rejected: User '${username || 'Unknown'}' attempted to join while lockdown is active.`
      );
      res.status(403).json({ success: false, error: 'New logins are temporarily disabled. Please try again later.' });
      return false;
    }
  }

  return true;
};

const recordUserFingerprint = ({ effectiveUserId, fingerprint, ip, userAgent }) => {
  if (!fingerprint) return;
  const existing = userFingerprints.get(effectiveUserId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
  existing.ips.add(ip);
  existing.userAgents.add(userAgent);
  existing.screenResolution = fingerprint.screenResolution;
  existing.platform = fingerprint.platform;
  existing.language = fingerprint.language;
  existing.timezone = fingerprint.timezone;
  const hash = generateDeviceHash({ ...fingerprint, userAgent });
  existing.deviceHashes.add(hash);
  existing.lastSeen = Date.now();
  userFingerprints.set(effectiveUserId, existing);
};

const issueAuthenticatedSession = ({
  roomId,
  effectiveUserId,
  username,
  ip,
  userAgent,
  loggedInUsers,
  viaTempLink = false,
}) => {
  const cleanUsername = typeof username === 'string' ? username.trim() : undefined;
  const sessionToken = generateSessionToken(effectiveUserId, roomId);
  const sessionTokenHash = hashSessionToken(sessionToken);

  loggedInUsers.set(effectiveUserId, {
    userId: effectiveUserId,
    username: cleanUsername,
    sessionToken,
    sessionTokenHash,
    loginTime: new Date(),
    ip,
    userAgent,
    ...(viaTempLink ? { viaTempLink: true } : {}),
  });

  // Persist hashed session token to MongoDB User document (never store plaintext tokens).
  // Retain up to 5 recent hashes so multi-device/multi-tab sessions survive server restarts.
  User.findOneAndUpdate(
    { roomId: String(roomId), userId: String(effectiveUserId) },
    {
      $set: {
        roomId: String(roomId),
        userId: String(effectiveUserId),
        username: cleanUsername || 'Anonymous',
        sessionTokenHash,
        lastSeen: new Date(),
      },
      ...(sessionTokenHash ? {
        $push: {
          sessionTokenHashes: {
            $each: [sessionTokenHash],
            $slice: -5,
          },
        },
      } : {}),
      $unset: {
        sessionToken: 1,
      },
    },
    { upsert: true, new: true }
  ).catch((err) => logger.error(`Failed to persist User session in auth ${viaTempLink ? 'verify-temp' : 'verify'}:`, err));

  return sessionToken;
};

// --- Client Auth Verification ---
router.post('/api/auth/verify', authLimiter, checkPasswordRateLimit, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { password, username, userId, fingerprint, roomId: rawRoomId = 'me' } = body;

    // Strict type validation to prevent NoSQL injection and DoS crashes
    if (typeof rawRoomId !== 'string' || !rawRoomId.trim()) {
      return res.status(400).json({ success: false, error: 'Room ID must be a non-empty string.' });
    }
    const rawInputRoomId = rawRoomId.trim();
    let cleanRoomId = rawInputRoomId;
    let roomDoc = null;
    if (cleanRoomId.toLowerCase() === 'me') {
      cleanRoomId = 'me';
    } else if (cleanRoomId.toLowerCase() === 'global') {
      cleanRoomId = 'global';
    } else {
      roomDoc = await Room.findByIdOrAlias(cleanRoomId);
      if (!roomDoc) {
        return res.status(404).json({ success: false, error: 'Chat room does not exist.' });
      }
      cleanRoomId = roomDoc.id;
    }
    const roomId = cleanRoomId;

    if (!userId || typeof userId !== 'string' || !userId.trim() || userId.trim().length > 64 || !/^[a-zA-Z0-9_-]{1,64}$/.test(userId.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format.' });
    }
    if (username !== undefined) {
      if (typeof username !== 'string' || !username.trim()) {
        return res.status(400).json({ success: false, error: 'Username cannot be blank.' });
      }
      if (username.trim().length > 50) {
        return res.status(400).json({ success: false, error: 'Username cannot exceed 50 characters.' });
      }
    }
    if (password !== undefined && typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Password must be a string.' });
    }

    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const fullRoomState = getRoomState(roomId);
    const { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername } = fullRoomState;
    const incomingSessionToken = req.headers['x-session-token'] || body?.sessionToken;

    const entryAllowed = await enforceRoomEntryAccess({
      res,
      roomId,
      userId,
      username,
      ip,
      userAgent,
      fingerprint,
      incomingToken: incomingSessionToken,
      roomState: fullRoomState,
      viaTempLink: false,
    });
    if (!entryAllowed) return;

    let isPasswordValid = false;
    if (roomId === 'me') {
      if (!process.env.CLIENT_PASSWORD || timingSafeEqualStr(password || '', process.env.CLIENT_PASSWORD)) {
        isPasswordValid = true;
      }
    } else if (roomId === 'global') {
      isPasswordValid = true;
    } else {
      if (roomDoc && (!roomDoc.isPrivate || !roomDoc.joinPassword || await verifyPasswordAsync(password || '', roomDoc.joinPassword))) {
        isPasswordValid = true;
        if (roomDoc.isPrivate && roomDoc.joinPassword && !roomDoc.joinPassword.startsWith('scrypt$') && password) {
          roomDoc.joinPassword = await hashPasswordAsync(password);
          roomDoc.save().catch((err) => logger.error('Failed to upgrade legacy room password:', err));
          invalidateCachedRoom(roomDoc.id);
        }
      }
    }

    if (isPasswordValid) {
      const identityCheck = await resolveAuthenticatedUserId({
        userId,
        roomId,
        roomState: fullRoomState,
        incomingToken: incomingSessionToken,
        fingerprint,
        userAgent,
      });
      if (identityCheck.conflict) {
        return res.status(409).json({ success: false, error: 'That user session is already active. Please try again.' });
      }
      const effectiveUserId = identityCheck.userId;

      if (username) {
        const roomState = { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername };
        const allowed = await resolveUsernameCollision({
          roomId, username, userId: effectiveUserId, ip, userAgent, roomState, viaTempLink: false, fingerprint, incomingSessionToken
        }, res);
        if (!allowed) return;
      }

      recordUserFingerprint({ effectiveUserId, fingerprint, ip, userAgent });
      const sessionToken = issueAuthenticatedSession({
        roomId,
        effectiveUserId,
        username,
        ip,
        userAgent,
        loggedInUsers,
        viaTempLink: false,
      });

      resetPasswordAttempts(req.passwordRateLimitKey);
      res.status(200).json({ success: true, roomId, sessionToken, userId: effectiveUserId, username: username?.trim() });
    } else {
      recordFailedPasswordAttempt(req.passwordRateLimitKey, req);
      await AuditLog.create({ roomId, type: 'join_failed_password', details: { userId, username }, ip, userAgent });
      _broadcastToAdmins(roomId, 'audit_log', { roomId, type: 'join_failed_password', details: { userId, username }, ip, timestamp: new Date() });
      _broadcastToAdmins(roomId, 'activity', `Join attempt failed: Incorrect password for user '${username || 'Unknown'}'.`);
      res.status(401).json({ success: false, error: 'Incorrect password.' });
    }
  } catch (err) {
    logger.error('Error in /api/auth/verify:', err);
    res.status(500).json({ success: false, error: 'Internal authentication error.' });
  }
});

// --- Temp Link Auth Verification ---
router.post('/api/auth/verify-temp', authLimiter, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { token, username, userId, fingerprint, roomId: reqRoomId } = body;
    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'Token is required.' });
    }
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    if (!userId || typeof userId !== 'string' || !userId.trim() || userId.trim().length > 64 || !/^[a-zA-Z0-9_-]{1,64}$/.test(userId.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format.' });
    }

    // Validate token format before querying — crypto.randomBytes(32).hex() always produces 64 hex chars
    if (!/^[a-f0-9]{64}$/.test(token.trim())) {
      return res.status(400).json({ success: false, error: 'This link is invalid or has expired.' });
    }

    // Find and validate the temp link — use $eq to prevent NoSQL injection
    const tempLink = await TempLink.findOne({ token: { $eq: token.trim() } });
    if (!tempLink) {
      return res.status(404).json({ success: false, error: 'This link is invalid or has expired.' });
    }

    const roomId = tempLink.roomId;

    // Cross-room validation check: if client sent a roomId, ensure it matches the link's target room
    if (typeof reqRoomId === 'string' && reqRoomId.trim()) {
      const cleanReqRoomId = reqRoomId.trim();
      if (cleanReqRoomId !== roomId) {
        const roomDoc = await Room.findByIdOrAlias(roomId);
        const reqRoomDoc = await Room.findByIdOrAlias(cleanReqRoomId);
        const canonicalTempRoomId = roomDoc ? roomDoc.id : roomId;
        const canonicalReqRoomId = reqRoomDoc ? reqRoomDoc.id : cleanReqRoomId;
        if (canonicalTempRoomId !== canonicalReqRoomId) {
          return res.status(400).json({ success: false, error: 'This temporary link is not valid for the requested room.' });
        }
      }
    }

    const fullRoomState = getRoomState(roomId);
    const { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername } = fullRoomState;
    const incomingSessionToken = req.headers['x-session-token'] || body?.sessionToken;

    const entryAllowed = await enforceRoomEntryAccess({
      res,
      roomId,
      userId,
      username,
      ip,
      userAgent,
      fingerprint,
      incomingToken: incomingSessionToken,
      roomState: fullRoomState,
      viaTempLink: true,
    });
    if (!entryAllowed) return;

    if (tempLink.isRevoked) {
      await AuditLog.create({ roomId, type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username: username.trim(), reason: 'revoked' }, ip, userAgent });
      _broadcastToAdmins(roomId, 'activity', `User '${username.trim()}' attempted to join via revoked access link.`);
      return res.status(410).json({ success: false, error: 'This link has been revoked.' });
    }

    if (new Date() > tempLink.expiresAt) {
      await AuditLog.create({ roomId, type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username: username.trim(), reason: 'expired' }, ip, userAgent });
      _broadcastToAdmins(roomId, 'activity', `User '${username.trim()}' attempted to join via expired access link.`);
      return res.status(410).json({ success: false, error: 'This link has expired.' });
    }

    if (tempLink.maxUses && tempLink.useCount >= tempLink.maxUses) {
      await AuditLog.create({ roomId, type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username: username.trim(), reason: 'max_uses_reached' }, ip, userAgent });
      _broadcastToAdmins(roomId, 'activity', `User '${username.trim()}' attempted to join via temporary access link that has reached its usage limit.`);
      return res.status(410).json({ success: false, error: 'This access link has reached its maximum usage limit.' });
    }

    const identityCheck = await resolveAuthenticatedUserId({
      userId,
      roomId,
      roomState: fullRoomState,
      incomingToken: incomingSessionToken,
      fingerprint,
      userAgent,
    });
    if (identityCheck.conflict) {
      return res.status(409).json({ success: false, error: 'That user session is already active. Please try again.' });
    }
    const effectiveUserId = identityCheck.userId;

    const roomState = { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername };
    const allowed = await resolveUsernameCollision({
      roomId, username: username.trim(), userId: effectiveUserId, ip, userAgent, roomState, viaTempLink: true, fingerprint, incomingSessionToken
    }, res);
    if (!allowed) return;

    recordUserFingerprint({ effectiveUserId, fingerprint, ip, userAgent });

    // Record usage atomically and verify link was not revoked, expired in flight, or usage limit exceeded (capped to 50 most recent entries)
    const updatedTempLink = await TempLink.findOneAndUpdate(
      {
        _id: tempLink._id,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
        $or: [
          { maxUses: { $exists: false } },
          { maxUses: null },
          { $expr: { $lt: ['$useCount', '$maxUses'] } }
        ]
      },
      {
        $inc: { useCount: 1 },
        $push: {
          usedBy: {
            $each: [{ username: username.trim(), joinedAt: new Date() }],
            $slice: -50,
          },
        },
      },
      { new: true }
    );

    if (!updatedTempLink) {
      await AuditLog.create({
        roomId,
        type: 'temp_link_expired_attempt',
        details: { token: token.substring(0, 8) + '...', userId: effectiveUserId, username: username.trim(), reason: 'revoked_or_expired_in_flight' },
        ip,
        userAgent,
      });
      _broadcastToAdmins(roomId, 'activity', `User '${username.trim()}' attempted to join via revoked or expired access link.`);
      return res.status(410).json({ success: false, error: 'This link has expired or has reached its usage limit.' });
    }

    await AuditLog.create({ roomId, type: 'temp_link_used', details: { token: token.substring(0, 8) + '...', userId: effectiveUserId, username: username.trim() }, ip, userAgent });
    _broadcastToAdmins(roomId, 'audit_log', { type: 'temp_link_used', details: { userId: effectiveUserId, username: username.trim() }, timestamp: new Date() });
    _broadcastToAdmins(roomId, 'activity', `User '${username.trim()}' joined via temporary access link.`);

    const sessionToken = issueAuthenticatedSession({
      roomId,
      effectiveUserId,
      username,
      ip,
      userAgent,
      loggedInUsers,
      viaTempLink: true,
    });

    res.status(200).json({ success: true, roomId, sessionToken, userId: effectiveUserId, username: username.trim() });
  } catch (err) {
    logger.error('Error in /api/auth/verify-temp:', err);
    res.status(500).json({ success: false, error: 'Internal authentication error.' });
  }
});

// --- Username Availability Check ---
// Returns { available: true } if the username is not currently in use by any online user.
// Accepts optional `userId` to exclude the requesting user's own existing session.
router.get('/api/users/check-username', authLimiter, async (req, res) => {
  const { username } = req.query;
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  if (username.trim().length > 50) {
    return res.status(400).json({ error: 'Username cannot exceed 50 characters.' });
  }
  const rawUserId = req.query.userId;
  const safeUserId = typeof rawUserId === 'string' && rawUserId.trim() ? rawUserId.trim() : undefined;
  const rawRoomId = req.query.roomId;
  const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';

  const isAllowed = await isRoomAccessAllowed(roomId, req);
  if (!isAllowed) {
    return res.status(401).json({ error: 'Authentication required for this room.' });
  }

  let canonicalRoomId = roomId;
  if (roomId !== 'me' && roomId !== 'global') {
    try {
      const roomDoc = await Room.findByIdOrAlias(roomId, { lean: true });
      if (roomDoc) canonicalRoomId = roomDoc.id;
    } catch (_) {}
  }

  const { onlineUsers } = getRoomState(canonicalRoomId);
  const normalised = username.trim().toLowerCase();
  let taken = false;
  for (const u of onlineUsers.values()) {
    if (u.username && u.username.trim().toLowerCase() === normalised && (!safeUserId || u.userId !== safeUserId)) {
      taken = true;
      break;
    }
  }
  res.json({ available: !taken });
});

module.exports = router;
module.exports.setBroadcast = setBroadcast;
module.exports.resolveAuthenticatedUserId = resolveAuthenticatedUserId;
