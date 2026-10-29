const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('../../logger');
const LoginLockdown = require('../../models/loginLockdown');
const AuditLog = require('../../models/auditLog');
const { adminLimiter, adminAuth, extractIp } = require('../../middleware');

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins } = broadcasts;
  const router = express.Router();

  // --- Server Activity Log (Strictly super admin only) ---
  router.get('/api/admin/server-logs', adminLimiter, adminAuth, async (req, res) => {
    if (!req.isSuperAdmin || (req.roomId !== 'me' && req.roomId !== 'global')) {
      return res.status(403).json({ error: 'Server logs are only available to the super admin panel.' });
    }
    const logFilePath = path.join(__dirname, '..', '..', 'pulse-activity.log');
    try {
      let stats;
      try {
        stats = await fs.promises.stat(logFilePath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          return res.type('text/plain').send('');
        }
        throw err;
      }
      const bufferSize = Math.min(stats.size, 1048576);
      if (bufferSize === 0) {
        return res.type('text/plain').send('');
      }
      const buffer = Buffer.alloc(bufferSize);
      const fileHandle = await fs.promises.open(logFilePath, 'r');
      try {
        await fileHandle.read(buffer, 0, bufferSize, stats.size - bufferSize);
      } finally {
        await fileHandle.close();
      }
      let rawText = buffer.toString('utf8');
      if (stats.size > bufferSize) {
        const firstNewline = rawText.indexOf('\n');
        if (firstNewline !== -1) {
          rawText = rawText.slice(firstNewline + 1);
        }
      }
      const lines = rawText.split('\n').filter(Boolean).slice(-1000).join('\n');
      res.type('text/plain').send(lines);
    } catch (err) {
      logger.error('Failed to read server logs asynchronously:', err);
      return res.status(500).send('Could not read server logs.');
    }
  });

  // --- Login Lockdown ---
  router.post('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    const { type, customMinutes } = req.body;
    const roomId = req.roomId;
    if (!type) return res.status(400).json({ error: 'Lockdown type is required.' });

    try {
      // Deactivate any existing lockdowns
      await LoginLockdown.updateMany({ roomId, isActive: true }, { isActive: false });

      let endTime = null;
      const now = new Date();
      switch (type) {
        case '1hr':
          endTime = new Date(now.getTime() + 60 * 60 * 1000);
          break;
        case '6hr':
          endTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
          break;
        case '12hr':
          endTime = new Date(now.getTime() + 12 * 60 * 60 * 1000);
          break;
        case '1day':
          endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          break;
        case '3days':
          endTime = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
          break;
        case 'indefinite':
          endTime = null;
          break;
        case 'custom': {
          const minutes = Number(customMinutes);
          if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 525600) {
            return res.status(400).json({ error: 'Custom duration must be a valid number of minutes (1 to 525600).' });
          }
          endTime = new Date(now.getTime() + minutes * 60 * 1000);
          break;
        }
        default:
          return res.status(400).json({ error: 'Invalid lockdown type.' });
      }

      const lockdown = await LoginLockdown.create({ roomId, type, endTime, isActive: true });

      await AuditLog.create({
        roomId,
        type: 'lockdown_enabled',
        details: { type, endTime },
        ip: extractIp(req),
        userAgent: req.headers['user-agent'] || '',
      });
      broadcastToAdmins(roomId, 'lockdown_update', lockdown);
      broadcastToAdmins(
        roomId,
        'activity',
        `Login lockdown enabled: ${type}${endTime ? ` until ${endTime.toLocaleString()}` : ' (indefinite)'}.`
      );

      res.json(lockdown);
    } catch (error) {
      logger.error('Failed to enable login lockdown:', error);
      res.status(500).json({ error: 'Failed to enable lockdown.' });
    }
  });

  router.delete('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    try {
      await LoginLockdown.updateMany({ roomId, isActive: true }, { isActive: false });

      await AuditLog.create({
        roomId,
        type: 'lockdown_disabled',
        details: {},
        ip: extractIp(req),
        userAgent: req.headers['user-agent'] || '',
      });
      broadcastToAdmins(roomId, 'lockdown_update', { isActive: false });
      broadcastToAdmins(roomId, 'activity', `Login lockdown has been disabled.`);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to disable login lockdown:', error);
      res.status(500).json({ error: 'Failed to disable lockdown.' });
    }
  });

  router.get('/api/admin/login-lockdown', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    try {
      const lockdown = await LoginLockdown.findOne({ roomId, isActive: true }).sort({ createdAt: -1 });
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
    const isSuperPanel = req.isSuperAdmin && (req.roomId === 'me' || req.roomId === 'global');
    try {
      const query = isSuperPanel ? {} : { roomId: req.roomId };
      const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(200).lean();
      res.json(logs);
    } catch (error) {
      logger.error('Failed to fetch audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
  });

  return router;
};
