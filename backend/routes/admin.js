// --- Admin Routes ---
// All routes require adminAuth middleware.
// wss is injected via the factory function for force-logout WebSocket sends.

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const logger = require('../logger');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const TempLink = require('../models/tempLink');
const BlockedUser = require('../models/blockedUser');
const LoginLockdown = require('../models/loginLockdown');
const AuditLog = require('../models/auditLog');
const User = require('../models/user');
const UserReport = require('../models/userReport');
const {
  onlineUsers,
  loggedInUsers,
  typingUsers,
  pendingDisconnects,
  userFingerprints,
  MAX_HISTORY,
} = require('../state');
const {
  adminLimiter,
  adminAuth,
  adminSecretAuth,
} = require('../middleware');
const { WebSocket } = require('ws');

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins, broadcastOnlineUsers, broadcast } = broadcasts;
  const router = express.Router();

  // --- Message / History ---
  router.get('/api/admin/messages', adminLimiter, adminAuth, async (req, res) => {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(MAX_HISTORY);
    res.json(messages.reverse());
  });

  router.get('/api/admin/users', adminLimiter, adminAuth, async (req, res) => {
    const users = await User.find({}).sort({ createdAt: 1 }).lean();
    res.json(users);
  });

  router.get('/api/admin/history', adminLimiter, adminAuth, async (req, res) => {
    const events = await MessageEvent.find().sort({ createdAt: -1 });
    res.json(events);
  });

  router.get('/api/admin/server-logs', adminLimiter, adminAuth, (req, res) => {
    const logFilePath = path.join(__dirname, '..', 'pulse-activity.log');
    fs.readFile(logFilePath, 'utf8', (err, data) => {
      if (err) {
        logger.error('Failed to read log file:', err);
        return res.status(500).send('Could not read server logs.');
      }
      const lines = data.split('\n').slice(-200).join('\n');
      res.type('text/plain').send(lines);
    });
  });

  // --- Temp Links ---
  router.post('/api/admin/temp-links', adminLimiter, adminAuth, async (req, res) => {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      const tempLink = await TempLink.create({ token, expiresAt });

      await AuditLog.create({ type: 'temp_link_created', details: { token: token.substring(0, 8) + '...', expiresAt } });
      broadcastToAdmins('temp_link_created', tempLink);
      broadcastToAdmins('activity', `Temporary access link created. Expires at ${expiresAt.toLocaleTimeString()}.`);

      res.status(201).json(tempLink);
    } catch (error) {
      logger.error('Failed to create temp link:', error);
      res.status(500).json({ error: 'Failed to create temporary link.' });
    }
  });

  router.get('/api/admin/temp-links', adminLimiter, adminAuth, async (req, res) => {
    try {
      const links = await TempLink.find().sort({ createdAt: -1 }).limit(50);
      res.json(links);
    } catch (error) {
      logger.error('Failed to fetch temp links:', error);
      res.status(500).json({ error: 'Failed to fetch temporary links.' });
    }
  });

  router.post('/api/admin/temp-links/:id/revoke', adminLimiter, adminAuth, async (req, res) => {
    try {
      const link = await TempLink.findByIdAndUpdate(
        req.params.id,
        { isRevoked: true, revokedAt: new Date() },
        { new: true }
      );
      if (!link) return res.status(404).json({ error: 'Link not found.' });

      await AuditLog.create({ type: 'temp_link_revoked', details: { token: link.token.substring(0, 8) + '...' } });
      broadcastToAdmins('temp_link_revoked', link);
      broadcastToAdmins('activity', `Temporary access link revoked.`);

      res.json(link);
    } catch (error) {
      logger.error('Failed to revoke temp link:', error);
      res.status(500).json({ error: 'Failed to revoke link.' });
    }
  });

  // --- Logged-in Users ---
  router.get('/api/admin/logged-in-users', adminLimiter, adminAuth, (req, res) => {
    const users = Array.from(loggedInUsers.values());
    res.json(users);
  });

  // --- Force Logout ---
  router.post('/api/admin/force-logout/:userId', adminLimiter, adminAuth, async (req, res) => {
    const { userId } = req.params;
    const targetUser = loggedInUsers.get(userId) || onlineUsers.get(userId);
    const username = targetUser?.username || 'Unknown';

    // Send force_logout to the specific user's WebSocket(s)
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.userId === userId && !client.isAdmin) {
        client.send(JSON.stringify({ type: 'force_logout', message: 'You have been logged out by an administrator.' }));
        setTimeout(() => client.terminate(), 500);
      }
    });

    // Remove from tracking maps
    onlineUsers.delete(userId);
    loggedInUsers.delete(userId);
    typingUsers.delete(userId);
    if (pendingDisconnects.has(userId)) {
      clearTimeout(pendingDisconnects.get(userId));
      pendingDisconnects.delete(userId);
    }

    await AuditLog.create({ type: 'user_force_logged_out', details: { userId, username } });
    broadcastToAdmins('user_force_logged_out', { userId, username });
    broadcastToAdmins('activity', `User '${username}' was force-logged out by admin.`);
    broadcastOnlineUsers();

    res.json({ success: true, message: `User '${username}' has been logged out.` });
  });

  // --- Force Logout All ---
  router.post('/api/admin/force-logout-all', adminLimiter, adminAuth, async (req, res) => {
    const affectedUsers = [];
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && !client.isAdmin) {
        const uid = client.userId;
        const uname = (loggedInUsers.get(uid) || onlineUsers.get(uid))?.username || 'Unknown';
        affectedUsers.push({ userId: uid, username: uname });
        client.send(JSON.stringify({ type: 'force_logout', message: 'You have been logged out by an administrator.' }));
        setTimeout(() => client.terminate(), 500);
      }
    });
    // Clear all tracking
    onlineUsers.clear();
    loggedInUsers.clear();
    typingUsers.clear();
    pendingDisconnects.forEach(t => clearTimeout(t));
    pendingDisconnects.clear();

    await AuditLog.create({ type: 'force_logged_out_all', details: { count: affectedUsers.length, users: affectedUsers } });
    broadcastToAdmins('activity', `Admin force-logged out ALL ${affectedUsers.length} user(s).`);
    broadcastOnlineUsers();
    res.json({ success: true, message: `Force-logged out ${affectedUsers.length} user(s).` });
  });

  // --- Block / Unblock User ---
  router.post('/api/admin/block-user', adminLimiter, adminAuth, async (req, res) => {
    const { userId, username, reason } = req.body;
    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId is required and must be a string.' });

    try {
      // Gather all known fingerprints for this user
      const fp = userFingerprints.get(userId);
      const userInfo = loggedInUsers.get(userId) || onlineUsers.get(userId);

      const fingerprints = {
        ips: [],
        userAgents: [],
        deviceHashes: [],
        screenResolution: fp?.screenResolution || '',
        platform: fp?.platform || '',
        language: fp?.language || '',
        timezone: fp?.timezone || '',
      };

      if (fp) {
        fingerprints.ips = Array.from(fp.ips || []);
        fingerprints.userAgents = Array.from(fp.userAgents || []);
        fingerprints.deviceHashes = Array.from(fp.deviceHashes || []);
      }

      // Add current connection info if available
      if (userInfo?.ip && !fingerprints.ips.includes(userInfo.ip)) {
        fingerprints.ips.push(userInfo.ip);
      }
      if (userInfo?.userAgent && !fingerprints.userAgents.includes(userInfo.userAgent)) {
        fingerprints.userAgents.push(userInfo.userAgent);
      }

      // Also scan active WebSocket connections for this user's IP/UA
      wss.clients.forEach(client => {
        if (client.userId === userId && !client.isAdmin) {
          const wsIp = client._socket?.remoteAddress || '';
          const wsUa = client.upgradeReq?.headers?.['user-agent'] || '';
          if (wsIp && !fingerprints.ips.includes(wsIp)) fingerprints.ips.push(wsIp);
          if (wsUa && !fingerprints.userAgents.includes(wsUa)) fingerprints.userAgents.push(wsUa);
        }
      });

      // Create or update block entry — use $eq to prevent NoSQL injection
      let blockedUser = await BlockedUser.findOne({ userId: { $eq: userId } });
      if (blockedUser) {
        blockedUser.isBlocked = true;
        blockedUser.blockedAt = new Date();
        blockedUser.unblockedAt = null;
        blockedUser.username = username || blockedUser.username;
        blockedUser.reason = reason || '';
        // Merge fingerprints
        const mergedIps = new Set([...blockedUser.fingerprints.ips, ...fingerprints.ips]);
        const mergedUAs = new Set([...blockedUser.fingerprints.userAgents, ...fingerprints.userAgents]);
        const mergedHashes = new Set([...blockedUser.fingerprints.deviceHashes, ...fingerprints.deviceHashes]);
        blockedUser.fingerprints = {
          ...fingerprints,
          ips: Array.from(mergedIps),
          userAgents: Array.from(mergedUAs),
          deviceHashes: Array.from(mergedHashes),
        };
        await blockedUser.save();
      } else {
        blockedUser = await BlockedUser.create({
          userId,
          username: username || 'Unknown',
          fingerprints,
          reason: reason || '',
        });
      }

      // Force logout the blocked user immediately
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.userId === userId && !client.isAdmin) {
          client.send(JSON.stringify({ type: 'force_logout', message: 'You have been blocked from this chat room.' }));
          setTimeout(() => client.terminate(), 500);
        }
      });
      onlineUsers.delete(userId);
      loggedInUsers.delete(userId);
      typingUsers.delete(userId);

      await AuditLog.create({ type: 'user_blocked', details: { userId, username: username || 'Unknown', reason } });
      broadcastToAdmins('user_blocked', blockedUser);
      broadcastToAdmins('activity', `User '${username || 'Unknown'}' has been blocked.`);
      broadcastOnlineUsers();

      res.json({ success: true, blockedUser });
    } catch (error) {
      logger.error('Failed to block user:', error);
      res.status(500).json({ error: 'Failed to block user.' });
    }
  });

  router.post('/api/admin/unblock-user/:userId', adminLimiter, adminAuth, async (req, res) => {
    const { userId } = req.params;
    try {
      const blockedUser = await BlockedUser.findOneAndUpdate(
        { userId: { $eq: userId }, isBlocked: true },
        { isBlocked: false, unblockedAt: new Date() },
        { new: true }
      );
      if (!blockedUser) return res.status(404).json({ error: 'Blocked user not found.' });

      await AuditLog.create({ type: 'user_unblocked', details: { userId, username: blockedUser.username } });
      broadcastToAdmins('user_unblocked', blockedUser);
      broadcastToAdmins('activity', `User '${blockedUser.username}' has been unblocked.`);

      res.json({ success: true, blockedUser });
    } catch (error) {
      logger.error('Failed to unblock user:', error);
      res.status(500).json({ error: 'Failed to unblock user.' });
    }
  });

  router.get('/api/admin/blocked-users', adminLimiter, adminAuth, async (req, res) => {
    try {
      const blocked = await BlockedUser.find().sort({ blockedAt: -1 });
      res.json(blocked);
    } catch (error) {
      logger.error('Failed to fetch blocked users:', error);
      res.status(500).json({ error: 'Failed to fetch blocked users.' });
    }
  });

  // --- Login Lockdown ---
  router.post('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    const { type, customMinutes } = req.body;
    if (!type) return res.status(400).json({ error: 'Lockdown type is required.' });

    try {
      // Deactivate any existing lockdowns
      await LoginLockdown.updateMany({ isActive: true }, { isActive: false });

      let endTime = null;
      const now = new Date();
      switch (type) {
        case '1hr': endTime = new Date(now.getTime() + 60 * 60 * 1000); break;
        case '6hr': endTime = new Date(now.getTime() + 6 * 60 * 60 * 1000); break;
        case '12hr': endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000); break;
        case '1day': endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); break;
        case '3days': endTime = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); break;
        case 'indefinite': endTime = null; break;
        case 'custom':
          if (!customMinutes || customMinutes <= 0) return res.status(400).json({ error: 'Custom duration in minutes is required.' });
          endTime = new Date(now.getTime() + customMinutes * 60 * 1000);
          break;
        default: return res.status(400).json({ error: 'Invalid lockdown type.' });
      }

      const lockdown = await LoginLockdown.create({ type, endTime, isActive: true });

      await AuditLog.create({ type: 'lockdown_enabled', details: { type, endTime } });
      broadcastToAdmins('lockdown_update', lockdown);
      broadcastToAdmins('activity', `Login lockdown enabled: ${type}${endTime ? ` until ${endTime.toLocaleString()}` : ' (indefinite)'}.`);

      res.json(lockdown);
    } catch (error) {
      logger.error('Failed to enable login lockdown:', error);
      res.status(500).json({ error: 'Failed to enable lockdown.' });
    }
  });

  router.delete('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    try {
      await LoginLockdown.updateMany({ isActive: true }, { isActive: false });

      await AuditLog.create({ type: 'lockdown_disabled', details: {} });
      broadcastToAdmins('lockdown_update', { isActive: false });
      broadcastToAdmins('activity', `Login lockdown has been disabled.`);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to disable login lockdown:', error);
      res.status(500).json({ error: 'Failed to disable lockdown.' });
    }
  });

  router.get('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    try {
      const lockdown = await LoginLockdown.findOne({ isActive: true }).sort({ createdAt: -1 });
      if (lockdown && lockdown.endTime && new Date() > lockdown.endTime) {
        lockdown.isActive = false;
        await lockdown.save();
        return res.json({ isActive: false });
      }
      res.json(lockdown || { isActive: false });
    } catch (error) {
      logger.error('Failed to fetch lockdown status:', error);
      res.status(500).json({ error: 'Failed to fetch lockdown status.' });
    }
  });

  // --- Audit Logs ---
  router.get('/api/admin/audit-logs', adminLimiter, adminAuth, async (req, res) => {
    try {
      const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(200);
      res.json(logs);
    } catch (error) {
      logger.error('Failed to fetch audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
  });

  // --- User Reports ---
  router.get('/api/admin/reports', adminLimiter, adminAuth, async (req, res) => {
    try {
      const reports = await UserReport.find().sort({ reportedAt: -1 }).limit(500).lean();
      res.json(reports);
    } catch (error) {
      logger.error('Failed to fetch user reports:', { message: error.message, stack: error.stack });
      res.status(500).json({ error: 'Failed to fetch user reports.' });
    }
  });

  return router;
};
