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
async function resolveUsernameCollision({ roomId, username, userId, ip, userAgent, roomState, viaTempLink = false }, res) {
  if (!username) return true;

  const { onlineUsers, pendingDisconnects, filePickerPresenceByUsername } = roomState;
  const normalised = username.trim().toLowerCase();
  const takenUser = Array.from(onlineUsers.values()).find(
    u => u.username && u.username.trim().toLowerCase() === normalised && u.userId !== userId
  );

  if (!takenUser) {
    return true;
  }

  const isPending = pendingDisconnects?.has(takenUser.userId);
  const hasPickerGrace =
    filePickerPresenceByUsername?.has(normalised) &&
    filePickerPresenceByUsername.get(normalised).expiresAt > Date.now();
  const existingFp = userFingerprints.get(takenUser.userId);
  const sameIp = existingFp && existingFp.ips && existingFp.ips.has(ip);

  if (isPending || hasPickerGrace || sameIp) {
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
  const { password, username, userId, fingerprint, roomId = 'me' } = req.body;
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

  // Check login lockdown (but allow already logged-in users)
  if (!loggedInUsers.has(userId)) {
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
  if (roomId === 'me' && password === process.env.CLIENT_PASSWORD) {
    isPasswordValid = true;
  } else if (roomId === 'global') {
    isPasswordValid = true;
  } else {
    const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
    if (room && (!room.isPrivate || room.joinPassword === password)) {
      isPasswordValid = true;
    }
  }

  if (isPasswordValid) {
    // If the client sends a username, verify it is not already in use.
    if (username) {
      const roomState = { onlineUsers, pendingDisconnects, filePickerPresenceByUsername };
      const allowed = await resolveUsernameCollision({
        roomId, username, userId, ip, userAgent, roomState, viaTempLink: false
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

    // Track as logged in
    loggedInUsers.set(userId, { userId, username: username?.trim(), loginTime: new Date(), ip, userAgent });

    resetPasswordAttempts(req.passwordRateLimitKey);
    res.status(200).json({ success: true });
  } else {
    recordFailedPasswordAttempt(req.passwordRateLimitKey, req);
    await AuditLog.create({ roomId, type: 'join_failed_password', details: { userId, username }, ip, userAgent });
    _broadcastToAdmins(roomId, 'audit_log', { roomId, type: 'join_failed_password', details: { userId, username }, ip, timestamp: new Date() });
    _broadcastToAdmins(roomId, 'activity', `Join attempt failed: Incorrect password for user '${username || 'Unknown'}'.`);
    res.status(401).json({ success: false, error: 'Incorrect password.' });
  }
});

// --- Temp Link Auth Verification ---
router.post('/api/auth/verify-temp', authLimiter, async (req, res) => {
  const { token, username, userId, fingerprint } = req.body;
  const ip = extractIp(req);
  const userAgent = req.headers['user-agent'] || '';

  if (!token || !username?.trim() || !userId) {
    return res.status(400).json({ success: false, error: 'Token, username, and userId are required.' });
  }

  // Validate token format before querying — crypto.randomBytes(32).hex() always produces 64 hex chars
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ success: false, error: 'This link is invalid or has expired.' });
  }

  // Find and validate the temp link — use $eq to prevent NoSQL injection
  const tempLink = await TempLink.findOne({ token: { $eq: token } });
  if (!tempLink) {
    // Cannot audit log without knowing the roomId reliably, but we can return 404
    return res.status(404).json({ success: false, error: 'This link is invalid or has expired.' });
  }

  const roomId = tempLink.roomId;
  const { onlineUsers, loggedInUsers, pendingDisconnects, filePickerPresenceByUsername } = getRoomState(roomId);

  // Check if user is blocked
  const blockCheck = await isUserBlocked(roomId, userId, ip, userAgent, fingerprint);
  if (blockCheck.blocked) {
    await AuditLog.create({
      roomId,
      type: 'join_failed_blocked',
      details: { userId, username, reason: blockCheck.reason, viaTempLink: true },
      ip, userAgent,
    });
    _broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_blocked', details: { userId, username, reason: blockCheck.reason }, ip, timestamp: new Date() });
    return res.status(403).json({ success: false, error: 'You have been blocked from this chat room.' });
  }
  if (tempLink.isRevoked) {
    await AuditLog.create({ roomId, type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username, reason: 'revoked' }, ip, userAgent });
    _broadcastToAdmins(roomId, 'activity', `User '${username || 'Unknown'}' attempted to join via revoked access link.`);
    return res.status(410).json({ success: false, error: 'This link has been revoked.' });
  }

  if (new Date() > tempLink.expiresAt) {
    await AuditLog.create({ roomId, type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username, reason: 'expired' }, ip, userAgent });
    _broadcastToAdmins(roomId, 'activity', `User '${username || 'Unknown'}' attempted to join via expired access link.`);
    return res.status(410).json({ success: false, error: 'This link has expired.' });
  }

  // Check username availability
  const roomState = { onlineUsers, pendingDisconnects, filePickerPresenceByUsername };
  const allowed = await resolveUsernameCollision({
    roomId, username, userId, ip, userAgent, roomState, viaTempLink: true
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

  // Record usage
  tempLink.usedBy.push({ username: username.trim(), joinedAt: new Date() });
  await tempLink.save();

  await AuditLog.create({ roomId, type: 'temp_link_used', details: { token: token.substring(0, 8) + '...', userId, username: username.trim() }, ip, userAgent });
  _broadcastToAdmins(roomId, 'audit_log', { type: 'temp_link_used', details: { userId, username: username.trim() }, timestamp: new Date() });
  _broadcastToAdmins(roomId, 'activity', `User '${username.trim()}' joined via temporary access link.`);

  // Track as logged in
  loggedInUsers.set(userId, { userId, username: username.trim(), loginTime: new Date(), ip, userAgent, viaTempLink: true });

  res.status(200).json({ success: true, roomId });
});

// --- Username Availability Check ---
// Returns { available: true } if the username is not currently in use by any online user.
// Accepts optional `userId` to exclude the requesting user's own existing session.
router.get('/api/users/check-username', authLimiter, (req, res) => {
  const { username, userId, roomId = 'me' } = req.query;
  const { onlineUsers } = getRoomState(roomId);
  
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required.' });
  }
  const normalised = username.trim().toLowerCase();
  const taken = Array.from(onlineUsers.values()).some(
    u => u.username && u.username.trim().toLowerCase() === normalised && u.userId !== userId
  );
  res.json({ available: !taken });
});

module.exports = router;
module.exports.setBroadcast = setBroadcast;
