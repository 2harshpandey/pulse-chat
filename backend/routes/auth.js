// --- Auth Routes ---
// POST /api/auth/verify        — password auth
// POST /api/auth/verify-temp   — temp-link auth
// GET  /api/users/check-username — username availability

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const AuditLog = require('../models/auditLog');
const TempLink = require('../models/tempLink');
const Room = require('../models/room');
const User = require('../models/user');
const { timingSafeEqualStr, verifyPassword, hashPassword, generateSessionToken } = require('../security');
const {
  getRoomState,
  userFingerprints,
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
const { isRoomAccessAllowed } = require('./messages');

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
async function resolveUsernameCollision({ roomId, username, userId, ip, userAgent, roomState, viaTempLink = false, fingerprint = null }, res) {
  if (!username || typeof username !== 'string') return true;

  const { onlineUsers, pendingDisconnects, filePickerPresenceByUsername } = roomState;
  const normalised = username.trim().toLowerCase();

  const takenUser = Array.from(onlineUsers.values()).find(
    u => u.username && u.username.trim().toLowerCase() === normalised && u.userId !== userId
  );

  if (!takenUser) {
    return true;
  }

  const isPending = pendingDisconnects?.has(takenUser.userId);
  const pickerGrace = filePickerPresenceByUsername?.get(normalised);
  const hasPickerGrace =
    pickerGrace && pickerGrace.expiresAt > Date.now();

  const prevLogged = roomState.loggedInUsers?.get(takenUser.userId);
  const prevFp = userFingerprints.get(takenUser.userId);
  const prevIp = prevLogged?.ip || pickerGrace?.ip;
  const isSameIp = Boolean(ip && prevIp && ip === prevIp);
  const isFpMatch = Boolean(ip && prevFp?.ips?.has(ip));
  const devHash = fingerprint ? generateDeviceHash({ ...fingerprint, userAgent }) : null;
  const isDeviceMatch = Boolean(devHash && prevFp?.deviceHashes?.has(devHash));

  const canReclaim = (isPending || hasPickerGrace) && (isSameIp || isFpMatch || isDeviceMatch);

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

// --- Client Auth Verification ---
router.post('/api/auth/verify', authLimiter, checkPasswordRateLimit, async (req, res) => {
  try {
    const { password, username, userId, fingerprint, roomId: rawRoomId = 'me' } = req.body;

    // Strict type validation to prevent NoSQL injection and DoS crashes
    if (typeof rawRoomId !== 'string' || !rawRoomId.trim()) {
      return res.status(400).json({ success: false, error: 'Room ID must be a non-empty string.' });
    }
    const rawInputRoomId = rawRoomId.trim();
    let cleanRoomId = rawInputRoomId;
    let roomDoc = null;
    if (cleanRoomId !== 'me' && cleanRoomId !== 'global') {
      roomDoc = await Room.findOne({ $or: [{ id: cleanRoomId }, { alias: cleanRoomId }] });
      if (!roomDoc) {
        return res.status(404).json({ success: false, error: 'Chat room does not exist.' });
      }
      // Do not allow joining private room via alias
      if (roomDoc.isPrivate && cleanRoomId !== roomDoc.id) {
        return res.status(404).json({ success: false, error: 'Chat room does not exist.' });
      }
      cleanRoomId = roomDoc.id;
    }
    const roomId = cleanRoomId;

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ success: false, error: 'User ID is required.' });
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

    const { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername } = getRoomState(roomId);

    // Check if user is blocked
    const blockCheck = await isUserBlocked(roomId, userId, ip, userAgent, fingerprint);
    if (blockCheck.blocked) {
      await AuditLog.create({
        roomId,
        type: 'join_failed_blocked',
        details: { userId, username, reason: blockCheck.reason, blockedUsername: blockCheck.blockedUser?.username },
        ip, userAgent,
      });
      _broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_blocked', details: { userId, username, reason: blockCheck.reason }, ip, timestamp: new Date() });
      _broadcastToAdmins(roomId, 'activity', `Join attempt blocked: Blocked user '${username || 'Unknown'}' attempted to enter.`);
      return res.status(403).json({ success: false, error: 'You have been blocked from this chat room.' });
    }

    // Check login lockdown (allow already logged-in users to resume only if valid session token is provided)
    let isResumingSession = false;
    const existingSession = loggedInUsers.get(userId);
    if (existingSession && existingSession.sessionToken) {
      const incomingToken = req.headers['x-session-token'] || req.body?.sessionToken;
      if (typeof incomingToken === 'string' && timingSafeEqualStr(incomingToken, existingSession.sessionToken)) {
        isResumingSession = true;
      }
    }

    if (!isResumingSession) {
      const lockCheck = await isLoginLocked(roomId);
      if (lockCheck.locked) {
        await AuditLog.create({
          roomId,
          type: 'join_failed_lockdown',
          details: { userId, username },
          ip, userAgent,
        });
        _broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_lockdown', details: { userId, username }, ip, timestamp: new Date() });
        _broadcastToAdmins(roomId, 'activity', `Join attempt rejected: User '${username || 'Unknown'}' attempted to join while lockdown is active.`);
        return res.status(403).json({ success: false, error: 'New logins are temporarily disabled. Please try again later.' });
      }
    }

    let isPasswordValid = false;
    if (roomId === 'me') {
      if (!process.env.CLIENT_PASSWORD || timingSafeEqualStr(password || '', process.env.CLIENT_PASSWORD)) {
        isPasswordValid = true;
      }
    } else if (roomId === 'global') {
      isPasswordValid = true;
    } else {
      if (roomDoc && (!roomDoc.isPrivate || (roomDoc.joinPassword && verifyPassword(password || '', roomDoc.joinPassword)))) {
        isPasswordValid = true;
        if (roomDoc.isPrivate && roomDoc.joinPassword && !roomDoc.joinPassword.startsWith('scrypt$') && password) {
          roomDoc.joinPassword = hashPassword(password);
          roomDoc.save().catch((err) => logger.error('Failed to upgrade legacy room password:', err));
        }
      }
    }

    if (isPasswordValid) {
      // If the client sends a username, verify it is not already in use.
      if (username) {
        const roomState = { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername };
        const allowed = await resolveUsernameCollision({
          roomId, username, userId, ip, userAgent, roomState, viaTempLink: false, fingerprint
        }, res);
        if (!allowed) return;
      }

      // Store fingerprint data
      if (fingerprint) {
        const existing = userFingerprints.get(userId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
        existing.ips.add(ip);
        existing.userAgents.add(userAgent);
        existing.screenResolution = fingerprint.screenResolution;
        existing.platform = fingerprint.platform;
        existing.language = fingerprint.language;
        existing.timezone = fingerprint.timezone;
        const hash = generateDeviceHash({ ...fingerprint, userAgent });
        existing.deviceHashes.add(hash);
        userFingerprints.set(userId, existing);
      }

      // Generate cryptographically secure session token
      const sessionToken = generateSessionToken(userId, roomId);

      // Track as logged in
      loggedInUsers.set(userId, {
        userId,
        username: username?.trim(),
        sessionToken,
        loginTime: new Date(),
        ip,
        userAgent,
      });

      // Persist session token to MongoDB User document for multi-instance / restart resilience
      User.findOneAndUpdate(
        { roomId: String(roomId), userId: String(userId) },
        {
          $set: {
            roomId: String(roomId),
            userId: String(userId),
            username: username ? String(username).trim() : 'Anonymous',
            sessionToken,
            lastSeen: new Date(),
          },
        },
        { upsert: true, new: true }
      ).catch((err) => logger.error('Failed to persist User session in auth verify:', err));

      resetPasswordAttempts(req.passwordRateLimitKey);
      res.status(200).json({ success: true, roomId, sessionToken, userId, username: username?.trim() });
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
    const { token, username, userId, fingerprint, roomId: reqRoomId } = req.body;
    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'Token is required.' });
    }
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ success: false, error: 'User ID is required.' });
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
        const roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
        const reqRoomDoc = await Room.findOne({ $or: [{ id: cleanReqRoomId }, { alias: cleanReqRoomId }] });
        const canonicalTempRoomId = roomDoc ? roomDoc.id : roomId;
        const canonicalReqRoomId = reqRoomDoc ? reqRoomDoc.id : cleanReqRoomId;
        if (canonicalTempRoomId !== canonicalReqRoomId) {
          return res.status(400).json({ success: false, error: 'This temporary link is not valid for the requested room.' });
        }
      }
    }

    const { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername } = getRoomState(roomId);

    // Check if user is blocked
    const blockCheck = await isUserBlocked(roomId, userId, ip, userAgent, fingerprint);
    if (blockCheck.blocked) {
      await AuditLog.create({
        roomId,
        type: 'join_failed_blocked',
        details: { userId, username: username.trim(), reason: blockCheck.reason, viaTempLink: true },
        ip, userAgent,
      });
      _broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_blocked', details: { userId, username: username.trim(), reason: blockCheck.reason }, ip, timestamp: new Date() });
      return res.status(403).json({ success: false, error: 'You have been blocked from this chat room.' });
    }
    // Check login lockdown (allow already logged-in users to resume only if valid session token is provided)
    let isResumingSession = false;
    const existingSession = loggedInUsers.get(userId);
    if (existingSession && existingSession.sessionToken) {
      const incomingToken = req.headers['x-session-token'] || req.body?.sessionToken;
      if (typeof incomingToken === 'string' && timingSafeEqualStr(incomingToken, existingSession.sessionToken)) {
        isResumingSession = true;
      }
    }

    if (!isResumingSession) {
      const lockCheck = await isLoginLocked(roomId);
      if (lockCheck.locked) {
        await AuditLog.create({
          roomId,
          type: 'join_failed_lockdown',
          details: { userId, username: username.trim(), viaTempLink: true },
          ip,
          userAgent,
        });
        _broadcastToAdmins(roomId, 'audit_log', {
          type: 'join_failed_lockdown',
          details: { userId, username: username.trim(), viaTempLink: true },
          ip,
          timestamp: new Date(),
        });
        _broadcastToAdmins(
          roomId,
          'activity',
          `Temp link join attempt rejected: User '${username.trim()}' attempted to join while lockdown is active.`
        );
        return res.status(403).json({ success: false, error: 'New logins are temporarily disabled. Please try again later.' });
      }
    }

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

    // Check username availability
    const roomState = { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername };
    const allowed = await resolveUsernameCollision({
      roomId, username: username.trim(), userId, ip, userAgent, roomState, viaTempLink: true, fingerprint
    }, res);
    if (!allowed) return;

    // Store fingerprint data
    if (fingerprint) {
      const existing = userFingerprints.get(userId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
      existing.ips.add(ip);
      existing.userAgents.add(userAgent);
      existing.screenResolution = fingerprint.screenResolution;
      existing.platform = fingerprint.platform;
      existing.language = fingerprint.language;
      existing.timezone = fingerprint.timezone;
      const hash = generateDeviceHash({ ...fingerprint, userAgent });
      existing.deviceHashes.add(hash);
      userFingerprints.set(userId, existing);
    }

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
        details: { token: token.substring(0, 8) + '...', userId, username: username.trim(), reason: 'revoked_or_expired_in_flight' },
        ip,
        userAgent,
      });
      _broadcastToAdmins(roomId, 'activity', `User '${username.trim()}' attempted to join via revoked or expired access link.`);
      return res.status(410).json({ success: false, error: 'This link has expired or has reached its usage limit.' });
    }

    await AuditLog.create({ roomId, type: 'temp_link_used', details: { token: token.substring(0, 8) + '...', userId, username: username.trim() }, ip, userAgent });
    _broadcastToAdmins(roomId, 'audit_log', { type: 'temp_link_used', details: { userId, username: username.trim() }, timestamp: new Date() });
    _broadcastToAdmins(roomId, 'activity', `User '${username.trim()}' joined via temporary access link.`);

    // Generate cryptographically secure session token
    const sessionToken = generateSessionToken(userId, roomId);

    // Track as logged in
    loggedInUsers.set(userId, {
      userId,
      username: username.trim(),
      sessionToken,
      loginTime: new Date(),
      ip,
      userAgent,
      viaTempLink: true,
    });

    // Persist session token to MongoDB User document for multi-instance / restart resilience
    User.findOneAndUpdate(
      { roomId: String(roomId), userId: String(userId) },
      {
        $set: {
          roomId: String(roomId),
          userId: String(userId),
          username: username.trim(),
          sessionToken,
          lastSeen: new Date(),
        },
      },
      { upsert: true, new: true }
    ).catch((err) => logger.error('Failed to persist User session in auth verify-temp:', err));

    res.status(200).json({ success: true, roomId, sessionToken, userId, username: username.trim() });
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
      const roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
      if (roomDoc) canonicalRoomId = roomDoc.id;
    } catch (_) {}
  }

  const { onlineUsers } = getRoomState(canonicalRoomId);
  const normalised = username.trim().toLowerCase();
  const taken = Array.from(onlineUsers.values()).some(
    u => u.username && u.username.trim().toLowerCase() === normalised && (!safeUserId || u.userId !== safeUserId)
  );
  res.json({ available: !taken });
});

module.exports = router;
module.exports.setBroadcast = setBroadcast;
