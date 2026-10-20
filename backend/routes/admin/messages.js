const express = require('express');
const logger = require('../../logger');
const Message = require('../../models/message');
const MessageEvent = require('../../models/messageEvent');
const AuditLog = require('../../models/auditLog');
const Room = require('../../models/room');
const { adminLimiter, adminAuth } = require('../../middleware');

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins, broadcast } = broadcasts;
  const router = express.Router();

  // --- Message / History ---
  router.get('/api/admin/messages', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    const messages = await Message.find({ roomId }).sort({ createdAt: -1 }).limit(500);
    res.json(messages.reverse());
  });

  router.get('/api/admin/export-full-db', adminLimiter, adminAuth, async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ error: 'Forbidden' });
    const messages = await Message.find({}).sort({ createdAt: 1 }).lean();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=pulse_full_db_export.json');
    res.send(JSON.stringify(messages, null, 2));
  });

  router.get('/api/admin/export-all-messages', adminLimiter, adminAuth, async (req, res) => {
    try {
      if (!req.isSuperAdmin || (req.roomId !== 'me' && req.roomId !== 'global')) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }
      const rooms = await Room.find({}).lean();
      const allMessages = await Message.find({}).sort({ roomId: 1, createdAt: 1 }).lean();
      const exportData = {
        exportedAt: new Date().toISOString(),
        totalMessages: allMessages.length,
        rooms: {},
      };
      exportData.rooms['me'] = { roomName: 'Super Admin Private Room (me)', messages: [] };
      exportData.rooms['global'] = { roomName: 'Global Room (global)', messages: [] };
      rooms.forEach((room) => {
        exportData.rooms[room.id] = {
          roomName: room.name,
          alias: room.alias,
          messages: [],
        };
      });
      allMessages.forEach((msg) => {
        if (!exportData.rooms[msg.roomId]) {
          exportData.rooms[msg.roomId] = { roomName: 'Unknown Room (' + msg.roomId + ')', messages: [] };
        }
        exportData.rooms[msg.roomId].messages.push(msg);
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=all_rooms_messages_export.json');
      res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
      res.status(500).json({ error: 'Failed to export all messages' });
    }
  });

  router.get('/api/admin/export-messages', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    const messages = await Message.find({ roomId }).sort({ createdAt: 1 }).lean();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=messages_export.json');
    res.send(JSON.stringify(messages, null, 2));
  });

  router.get('/api/admin/history', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    const events = await MessageEvent.find({ roomId }).sort({ createdAt: -1 }).limit(500);
    res.json(events);
  });

  // --- Bulk Message Actions ---
  router.post('/api/admin/messages/bulk-action', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    const { messageIds, action, vanish } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'No message IDs provided.' });
    }

    if (!['hide', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action.' });
    }

    if (vanish && (!req.isSuperAdmin && roomId !== 'me')) {
      return res.status(403).json({ error: 'Forbidden: Vanish requires Super Admin privileges' });
    }

    try {
      if (action === 'hide') {
        const updatePayload = vanish
          ? { $set: { vanished: true, isDeleted: true, deletedBy: 'admin' } }
          : { $set: { isDeleted: true, deletedBy: 'admin' } };

        await Message.updateMany({ roomId, id: { $in: messageIds } }, updatePayload);

        const eventPayload = vanish
          ? { $set: { 'message.vanished': true, 'message.isDeleted': true, 'message.deletedBy': 'admin' } }
          : { $set: { 'message.isDeleted': true, 'message.deletedBy': 'admin' } };

        await MessageEvent.updateMany({ roomId, 'message.id': { $in: messageIds } }, eventPayload);

        if (vanish) {
          broadcast(roomId, { type: 'bulk_delete', messageIds });
          await AuditLog.create({ roomId, type: 'messages_deleted_disappear', details: { count: messageIds.length, action: 'hide' } });
          broadcastToAdmins(roomId, 'activity', `${messageIds.length} message(s) vanished from frontend by super admin (retained in DB).`);
        } else {
          const updatedMessages = await Message.find({ roomId, id: { $in: messageIds } }).lean();
          broadcast(roomId, { type: 'bulk_update', messages: updatedMessages });
          await AuditLog.create({ roomId, type: 'messages_hidden', details: { count: messageIds.length } });
          broadcastToAdmins(roomId, 'activity', `${messageIds.length} message(s) hidden from frontend by admin.`);
        }

        const updatedEvents = await MessageEvent.find({ roomId, 'message.id': { $in: messageIds } }).lean();
        broadcastToAdmins(roomId, 'bulk_history_update', { events: updatedEvents });

      } else if (action === 'delete') {
        const objectIds = messageIds.filter((id) => /^[0-9a-fA-F]{24}$/.test(id));

        await MessageEvent.deleteMany({
          roomId,
          $or: [
            { 'message.id': { $in: messageIds } },
            { messageId: { $in: messageIds } },
            ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : []),
          ],
        });
        broadcastToAdmins(roomId, 'bulk_history_delete', { messageIds });

        if (vanish) {
          await Message.deleteMany({ roomId, id: { $in: messageIds } });

          broadcast(roomId, { type: 'bulk_delete', messageIds });
          await AuditLog.create({ roomId, type: 'messages_deleted_disappear', details: { count: messageIds.length, action: 'delete' } });
          broadcastToAdmins(roomId, 'activity', `${messageIds.length} message(s) permanently deleted (vanished) and history scrubbed by super admin.`);
        } else {
          await Message.updateMany(
            { roomId, id: { $in: messageIds } },
            {
              $set: {
                isDeleted: true,
                deletedBy: 'admin',
                text: 'This message has been deleted by an admin.',
                url: null,
                originalName: null,
                size: null,
                type: 'text',
              },
            }
          );

          const updatedMessages = await Message.find({ roomId, id: { $in: messageIds } }).lean();
          broadcast(roomId, { type: 'bulk_update', messages: updatedMessages });

          await AuditLog.create({ roomId, type: 'messages_deleted_bubble', details: { count: messageIds.length } });
          broadcastToAdmins(roomId, 'activity', `${messageIds.length} message(s) scrubbed from database (bubble preserved) and history deleted by admin.`);
        }
      }

      res.json({ success: true, message: `Successfully applied action to ${messageIds.length} message(s).` });
    } catch (error) {
      logger.error('Bulk action error:', error);
      res.status(500).json({ error: 'Failed to perform bulk action.' });
    }
  });

  return router;
};
