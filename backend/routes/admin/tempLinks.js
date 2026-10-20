const express = require('express');
const crypto = require('crypto');
const logger = require('../../logger');
const TempLink = require('../../models/tempLink');
const AuditLog = require('../../models/auditLog');
const { adminLimiter, adminAuth } = require('../../middleware');

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins } = broadcasts;
  const router = express.Router();

  router.post('/api/admin/temp-links', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      const tempLink = await TempLink.create({ roomId, token, expiresAt });

      await AuditLog.create({
        roomId,
        type: 'temp_link_created',
        details: { token: token.substring(0, 8) + '...', expiresAt },
      });
      broadcastToAdmins(roomId, 'temp_link_created', tempLink);
      broadcastToAdmins(roomId, 'activity', `Temporary access link created. Expires at ${expiresAt.toLocaleTimeString()}.`);

      res.status(201).json(tempLink);
    } catch (error) {
      logger.error('Failed to create temp link:', error);
      res.status(500).json({ error: 'Failed to create temporary link.' });
    }
  });

  router.get('/api/admin/temp-links', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    try {
      const links = await TempLink.find({ roomId }).sort({ createdAt: -1 }).limit(50);
      res.json(links);
    } catch (error) {
      logger.error('Failed to fetch temp links:', error);
      res.status(500).json({ error: 'Failed to fetch temporary links.' });
    }
  });

  router.post('/api/admin/temp-links/:id/revoke', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    try {
      const link = await TempLink.findOneAndUpdate(
        { _id: req.params.id, roomId },
        { isRevoked: true, revokedAt: new Date() },
        { new: true }
      );
      if (!link) return res.status(404).json({ error: 'Link not found.' });

      await AuditLog.create({
        roomId,
        type: 'temp_link_revoked',
        details: { token: link.token.substring(0, 8) + '...' },
      });
      broadcastToAdmins(roomId, 'temp_link_revoked', link);
      broadcastToAdmins(roomId, 'activity', `Temporary access link revoked.`);

      res.json(link);
    } catch (error) {
      logger.error('Failed to revoke temp link:', error);
      res.status(500).json({ error: 'Failed to revoke link.' });
    }
  });

  return router;
};
