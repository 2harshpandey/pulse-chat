const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('../../logger');
const LoginLockdown = require('../../models/loginLockdown');
const AuditLog = require('../../models/auditLog');
const { adminLimiter, adminAuth } = require('../../middleware');

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins } = broadcasts;
  const router = express.Router();

  // --- Server Activity Log ---
  router.get('/api/admin/server-logs', adminLimiter, adminAuth, (req, res) => {
    const logFilePath = path.join(__dirname, '..', '..', 'pulse-activity.log');
    if (!fs.existsSync(logFilePath)) {
      return res.type('text/plain').send('');
    }
    fs.stat(logFilePath, (statErr, stats) => {
      if (statErr || !stats) {
        return res.status(500).send('Could not read server logs.');
      }
      const bufferSize = Math.min(stats.size, 65536);
      if (bufferSize === 0) {
        return res.type('text/plain').send('');
      }
      const buffer = Buffer.alloc(bufferSize);
      let fd;
      try {
        fd = fs.openSync(logFilePath, 'r');
        fs.readSync(fd, buffer, 0, bufferSize, stats.size - bufferSize);
      } catch (readErr) {
        logger.error('Failed to read log file:', readErr);
        return res.status(500).send('Could not read server logs.');
      } finally {
        if (fd) fs.closeSync(fd);
      }
      const rawText = buffer.toString('utf8');
      const lines = rawText.split('\n').slice(-200).join('\n');
      res.type('text/plain').send(lines);
    });
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
        case 'custom':
          if (!customMinutes || customMinutes <= 0) {
            return res.status(400).json({ error: 'Custom duration in minutes is required.' });
          }
          endTime = new Date(now.getTime() + customMinutes * 60 * 1000);
          break;
        default:
          return res.status(400).json({ error: 'Invalid lockdown type.' });
      }

      const lockdown = await LoginLockdown.create({ roomId, type, endTime, isActive: true });

      await AuditLog.create({ roomId, type: 'lockdown_enabled', details: { type, endTime } });
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

      await AuditLog.create({ roomId, type: 'lockdown_disabled', details: {} });
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
    const roomId = req.roomId;
    try {
      const logs = await AuditLog.find({ roomId }).sort({ timestamp: -1 }).limit(200);
      res.json(logs);
    } catch (error) {
      logger.error('Failed to fetch audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
  });

  return router;
};
