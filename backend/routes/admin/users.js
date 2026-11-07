const express = require('express');
const logger = require('../../logger');
const User = require('../../models/user');
const BlockedUser = require('../../models/blockedUser');
const UserReport = require('../../models/userReport');
const AuditLog = require('../../models/auditLog');
const { getRoomState, userFingerprints } = require('../../state');
const { adminLimiter, adminAuth, extractIp, toSafeLoggedInUserList } = require('../../middleware');
const { WebSocket } = require('ws');

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins, broadcastOnlineUsers } = broadcasts;
  const router = express.Router();

  router.get('/api/admin/users', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);
    const users = await User.find({ roomId }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(users);
  });

  router.get('/api/admin/logged-in-users', adminLimiter, adminAuth, (req, res) => {
    const roomId = req.roomId;
    const { loggedInUsers } = getRoomState(roomId);
    res.json(toSafeLoggedInUserList(loggedInUsers));
  });

  router.post('/api/admin/force-logout/:userId', adminLimiter, adminAuth, async (req, res) => {
    const rawUserId = req.params.userId;
    if (!rawUserId || typeof rawUserId !== 'string' || !rawUserId.trim()) {
      return res.status(400).json({ error: 'Valid userId parameter is required.' });
    }
    const userId = rawUserId.trim();
    const roomId = req.roomId;
    const { loggedInUsers, onlineUsers, typingUsers, typingTimeouts, pendingDisconnects } = getRoomState(roomId);

    const targetUser = loggedInUsers.get(userId) || onlineUsers.get(userId);
    const username = targetUser?.username || 'Unknown';

    // Send force_logout to the specific user's WebSocket(s)
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.userId === userId && !client.isAdmin && client.roomId === roomId) {
        client.sessionToken = null;
        client.send(JSON.stringify({ type: 'force_logout', message: 'You have been logged out by an administrator.' }));
        setTimeout(() => client.terminate(), 500);
      }
    });

    // Remove from tracking maps
    onlineUsers.delete(userId);
    loggedInUsers.delete(userId);
    typingUsers.delete(userId);
    if (typingTimeouts && typingTimeouts.has(userId)) {
      clearTimeout(typingTimeouts.get(userId));
      typingTimeouts.delete(userId);
    }
    if (pendingDisconnects.has(userId)) {
      clearTimeout(pendingDisconnects.get(userId));
      pendingDisconnects.delete(userId);
    }

    // Invalidate session in MongoDB so the revoked token cannot re-authenticate
    await User.updateOne(
      { roomId: String(roomId), userId: String(userId) },
      { $unset: { sessionToken: 1, sessionTokenHash: 1 } }
    ).catch((err) => logger.error('Failed to clear sessionToken on force-logout:', err));

    await AuditLog.create({
      roomId,
      type: 'user_force_logged_out',
      details: { userId, username },
      ip: extractIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    broadcastToAdmins(roomId, 'user_force_logged_out', { userId, username });
    broadcastToAdmins(roomId, 'activity', `User '${username}' was force-logged out by admin.`);
    broadcastOnlineUsers(roomId);

    res.json({ success: true, message: `User '${username}' has been logged out.` });
  });

  router.post('/api/admin/force-logout-all', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    const { loggedInUsers, onlineUsers, typingUsers, typingTimeouts, pendingDisconnects } = getRoomState(roomId);

    const affectedUsers = [];
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && !client.isAdmin && client.roomId === roomId) {
        client.sessionToken = null;
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
    if (typingTimeouts) {
      typingTimeouts.forEach((t) => clearTimeout(t));
      typingTimeouts.clear();
    }
    pendingDisconnects.forEach((t) => clearTimeout(t));
    pendingDisconnects.clear();

    // Invalidate all sessions in MongoDB for this room
    await User.updateMany(
      { roomId: String(roomId) },
      { $unset: { sessionToken: 1, sessionTokenHash: 1 } }
    ).catch((err) => logger.error('Failed to clear sessionTokens on force-logout-all:', err));

    await AuditLog.create({
      roomId,
      type: 'force_logged_out_all',
      details: { count: affectedUsers.length, users: affectedUsers },
      ip: extractIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    broadcastToAdmins(roomId, 'activity', `Admin force-logged out ALL ${affectedUsers.length} user(s).`);
    broadcastOnlineUsers(roomId);
    res.json({ success: true, message: `Force-logged out ${affectedUsers.length} user(s).` });
  });

  router.post('/api/admin/block-user', adminLimiter, adminAuth, async (req, res) => {
    const { userId: rawUserId, username, reason } = req.body;
    const roomId = req.roomId;
    if (!rawUserId || typeof rawUserId !== 'string' || !rawUserId.trim()) {
      return res.status(400).json({ error: 'userId is required and must be a non-empty string.' });
    }
    const userId = rawUserId.trim();
    const safeUsername = typeof username === 'string' ? username.trim().slice(0, 100) : '';
    const safeReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';

    try {
      const { loggedInUsers, onlineUsers, typingUsers, typingTimeouts } = getRoomState(roomId);
      // Gather all known fingerprints for this user
      const fp = userFingerprints.get(userId);
      const userInfo = loggedInUsers.get(userId) || onlineUsers.get(userId);
      const resolvedUsername = safeUsername || userInfo?.username || 'Unknown';

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
      wss.clients.forEach((client) => {
        if (client.userId === userId && !client.isAdmin && client.roomId === roomId) {
          const wsIp = client.clientIp || client._socket?.remoteAddress || '';
          const wsUa = client.clientUa || '';
          if (wsIp && !fingerprints.ips.includes(wsIp)) fingerprints.ips.push(wsIp);
          if (wsUa && !fingerprints.userAgents.includes(wsUa)) fingerprints.userAgents.push(wsUa);
        }
      });

      // Create or update block entry — use $eq to prevent NoSQL injection
      let blockedUser = await BlockedUser.findOne({ roomId, userId: { $eq: userId } });
      if (blockedUser) {
        blockedUser.isBlocked = true;
        blockedUser.blockedAt = new Date();
        blockedUser.unblockedAt = null;
        blockedUser.username = resolvedUsername || blockedUser.username;
        blockedUser.reason = safeReason || blockedUser.reason || '';
        // Merge fingerprints defensively
        const existingIps = Array.isArray(blockedUser.fingerprints?.ips) ? blockedUser.fingerprints.ips : [];
        const existingUAs = Array.isArray(blockedUser.fingerprints?.userAgents) ? blockedUser.fingerprints.userAgents : [];
        const existingHashes = Array.isArray(blockedUser.fingerprints?.deviceHashes) ? blockedUser.fingerprints.deviceHashes : [];

        const mergedIps = new Set([...existingIps, ...fingerprints.ips]);
        const mergedUAs = new Set([...existingUAs, ...fingerprints.userAgents]);
        const mergedHashes = new Set([...existingHashes, ...fingerprints.deviceHashes]);
        blockedUser.fingerprints = {
          ips: Array.from(mergedIps),
          userAgents: Array.from(mergedUAs),
          deviceHashes: Array.from(mergedHashes),
          screenResolution: fingerprints.screenResolution || blockedUser.fingerprints?.screenResolution || '',
          platform: fingerprints.platform || blockedUser.fingerprints?.platform || '',
          language: fingerprints.language || blockedUser.fingerprints?.language || '',
          timezone: fingerprints.timezone || blockedUser.fingerprints?.timezone || '',
        };
        await blockedUser.save();
      } else {
        let priorFp = null;
        if (!fingerprints.screenResolution) {
          const priorBlock = await BlockedUser.findOne({ userId: { $eq: userId }, 'fingerprints.screenResolution': { $exists: true, $ne: '' } });
          if (priorBlock?.fingerprints) priorFp = priorBlock.fingerprints;
        }
        blockedUser = await BlockedUser.create({
          roomId,
          userId,
          username: resolvedUsername,
          fingerprints: {
            ...fingerprints,
            screenResolution: fingerprints.screenResolution || priorFp?.screenResolution || '',
            platform: fingerprints.platform || priorFp?.platform || '',
            language: fingerprints.language || priorFp?.language || '',
            timezone: fingerprints.timezone || priorFp?.timezone || '',
          },
          reason: safeReason,
        });
      }

      // Force logout the blocked user immediately
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.userId === userId && !client.isAdmin && client.roomId === roomId) {
          client.sessionToken = null;
          client.send(JSON.stringify({ type: 'force_logout', message: 'You have been blocked from this chat room.' }));
          setTimeout(() => client.terminate(), 500);
        }
      });
      onlineUsers.delete(userId);
      loggedInUsers.delete(userId);
      typingUsers.delete(userId);
      if (typingTimeouts && typingTimeouts.has(userId)) {
        clearTimeout(typingTimeouts.get(userId));
        typingTimeouts.delete(userId);
      }

      // Invalidate session in MongoDB so the blocked user's token cannot re-authenticate
      await User.updateOne(
        { roomId: String(roomId), userId: String(userId) },
        { $unset: { sessionToken: 1, sessionTokenHash: 1 } }
      ).catch((err) => logger.error('Failed to clear sessionToken on block-user:', err));

      await AuditLog.create({
        roomId,
        type: 'user_blocked',
        details: { userId, username: username || 'Unknown', reason },
        ip: extractIp(req),
        userAgent: req.headers['user-agent'] || '',
      });
      broadcastToAdmins(roomId, 'user_blocked', blockedUser);
      broadcastToAdmins(roomId, 'activity', `User '${username || 'Unknown'}' has been blocked.`);
      broadcastOnlineUsers(roomId);

      res.json({ success: true, blockedUser });
    } catch (error) {
      logger.error('Failed to block user:', error);
      res.status(500).json({ error: 'Failed to block user.' });
    }
  });

  router.post('/api/admin/unblock-user/:userId', adminLimiter, adminAuth, async (req, res) => {
    const rawUserId = req.params.userId;
    if (!rawUserId || typeof rawUserId !== 'string' || !rawUserId.trim()) {
      return res.status(400).json({ error: 'Valid userId parameter is required.' });
    }
    const userId = rawUserId.trim();
    const roomId = req.roomId;
    try {
      const blockedUser = await BlockedUser.findOneAndUpdate(
        { roomId, userId: { $eq: userId }, isBlocked: true },
        { isBlocked: false, unblockedAt: new Date() },
        { new: true }
      );
      if (!blockedUser) return res.status(404).json({ error: 'Blocked user not found.' });

      await AuditLog.create({
        roomId,
        type: 'user_unblocked',
        details: { userId, username: blockedUser.username },
        ip: extractIp(req),
        userAgent: req.headers['user-agent'] || '',
      });
      broadcastToAdmins(roomId, 'user_unblocked', blockedUser);
      broadcastToAdmins(roomId, 'activity', `User '${blockedUser.username}' has been unblocked.`);

      res.json({ success: true, blockedUser });
    } catch (error) {
      logger.error('Failed to unblock user:', error);
      res.status(500).json({ error: 'Failed to unblock user.' });
    }
  });

  router.get('/api/admin/blocked-users', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    try {
      const blocked = await BlockedUser.find({ roomId }).sort({ blockedAt: -1 }).limit(500).lean();
      res.json(blocked);
    } catch (error) {
      logger.error('Failed to fetch blocked users:', error);
      res.status(500).json({ error: 'Failed to fetch blocked users.' });
    }
  });

  router.get('/api/admin/reports', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    try {
      const reports = await UserReport.find({ roomId }).sort({ reportedAt: -1 }).limit(500);
      res.json(reports);
    } catch (error) {
      logger.error('Failed to fetch user reports:', error);
      res.status(500).json({ error: 'Failed to fetch reports.' });
    }
  });

  return router;
};
