// --- Auth Routes ---
// POST /api/auth/verify        — password auth
// POST /api/auth/verify-temp   — temp-link auth
// GET  /api/users/check-username — username availability

const express = require('express');
const router = express.Router();
const AuditLog = require('../models/auditLog');
const TempLink = require('../models/tempLink');
const {
  onlineUsers,
  loggedInUsers,
  userFingerprints,
} = require('../state');
const {
  authLimiter,
  extractIp,
  generateDeviceHash,
  isUserBlocked,
  isLoginLocked,
} = require('../middleware');

// broadcastToAdmins is injected at startup via initRoutes(); stored here.
let _broadcastToAdmins = () => {};
const setBroadcast = (broadcastToAdmins) => { _broadcastToAdmins = broadcastToAdmins; };

// --- Client Auth Verification ---
router.post('/api/auth/verify', authLimiter, async (req, res) => {
  const { password, username, userId, fingerprint } = req.body;
  const ip = extractIp(req);
  const userAgent = req.headers['user-agent'] || '';

  // Check if user is blocked
  const blockCheck = await isUserBlocked(userId, ip, userAgent, fingerprint);
  if (blockCheck.blocked) {
    await AuditLog.create({
      type: 'join_failed_blocked',
      details: { userId, username, reason: blockCheck.reason, blockedUsername: blockCheck.blockedUser?.username },
      ip, userAgent,
    });
    _broadcastToAdmins('audit_log', { type: 'join_failed_blocked', details: { userId, username, reason: blockCheck.reason }, ip, timestamp: new Date() });
    return res.status(403).json({ success: false, error: 'You have been blocked from this chat room.' });
  }

  // Check login lockdown (but allow already logged-in users)
  if (!loggedInUsers.has(userId)) {
    const lockCheck = await isLoginLocked();
    if (lockCheck.locked) {
      await AuditLog.create({
        type: 'join_failed_lockdown',
        details: { userId, username },
        ip, userAgent,
      });
      _broadcastToAdmins('audit_log', { type: 'join_failed_lockdown', details: { userId, username }, ip, timestamp: new Date() });
      return res.status(403).json({ success: false, error: 'New logins are temporarily disabled. Please try again later.' });
    }
  }

  if (password && password === process.env.CLIENT_PASSWORD) {
    // If the client sends a username, verify it is not already in use.
    if (username) {
      const normalised = username.trim().toLowerCase();
      const taken = Array.from(onlineUsers.values()).some(
        u => u.username.trim().toLowerCase() === normalised && u.userId !== userId
      );
      if (taken) {
        await AuditLog.create({ type: 'join_failed_username_taken', details: { userId, username }, ip, userAgent });
        return res.status(409).json({ success: false, error: 'That username is already in use. Please choose a different one.' });
      }
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

    res.status(200).json({ success: true });
  } else {
    await AuditLog.create({ type: 'join_failed_password', details: { userId, username }, ip, userAgent });
    _broadcastToAdmins('audit_log', { type: 'join_failed_password', details: { userId, username }, ip, timestamp: new Date() });
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

  // Check if user is blocked
  const blockCheck = await isUserBlocked(userId, ip, userAgent, fingerprint);
  if (blockCheck.blocked) {
    await AuditLog.create({
      type: 'join_failed_blocked',
      details: { userId, username, reason: blockCheck.reason, viaTempLink: true },
      ip, userAgent,
    });
    _broadcastToAdmins('audit_log', { type: 'join_failed_blocked', details: { userId, username, reason: blockCheck.reason }, ip, timestamp: new Date() });
    return res.status(403).json({ success: false, error: 'You have been blocked from this chat room.' });
  }

  // Validate token format before querying — crypto.randomBytes(32).hex() always produces 64 hex chars
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ success: false, error: 'This link is invalid or has expired.' });
  }

  // Find and validate the temp link — use $eq to prevent NoSQL injection
  const tempLink = await TempLink.findOne({ token: { $eq: token } });
  if (!tempLink) {
    await AuditLog.create({ type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username }, ip, userAgent });
    return res.status(404).json({ success: false, error: 'This link is invalid or has expired.' });
  }

  if (tempLink.isRevoked) {
    await AuditLog.create({ type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username, reason: 'revoked' }, ip, userAgent });
    return res.status(410).json({ success: false, error: 'This link has been revoked.' });
  }

  if (new Date() > tempLink.expiresAt) {
    await AuditLog.create({ type: 'temp_link_expired_attempt', details: { token: token.substring(0, 8) + '...', userId, username, reason: 'expired' }, ip, userAgent });
    return res.status(410).json({ success: false, error: 'This link has expired.' });
  }

  // Check username availability
  const normalised = username.trim().toLowerCase();
  const taken = Array.from(onlineUsers.values()).some(
    u => u.username.trim().toLowerCase() === normalised && u.userId !== userId
  );
  if (taken) {
    return res.status(409).json({ success: false, error: 'That username is already in use. Please choose a different one.' });
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

  // Record usage
  tempLink.usedBy.push({ username: username.trim(), joinedAt: new Date() });
  await tempLink.save();

  await AuditLog.create({ type: 'temp_link_used', details: { token: token.substring(0, 8) + '...', userId, username: username.trim() }, ip, userAgent });
  _broadcastToAdmins('audit_log', { type: 'temp_link_used', details: { userId, username: username.trim() }, timestamp: new Date() });

  // Track as logged in
  loggedInUsers.set(userId, { userId, username: username.trim(), loginTime: new Date(), ip, userAgent, viaTempLink: true });

  res.status(200).json({ success: true });
});

// --- Username Availability Check ---
// Returns { available: true } if the username is not currently in use by any online user.
// Accepts optional `userId` to exclude the requesting user's own existing session.
router.get('/api/users/check-username', authLimiter, (req, res) => {
  const { username, userId } = req.query;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required.' });
  }
  const normalised = username.trim().toLowerCase();
  const taken = Array.from(onlineUsers.values()).some(
    u => u.username.trim().toLowerCase() === normalised && u.userId !== userId
  );
  res.json({ available: !taken });
});

module.exports = router;
module.exports.setBroadcast = setBroadcast;
