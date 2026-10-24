const express = require('express');
const logger = require('../../logger');
const Message = require('../../models/message');
const MessageEvent = require('../../models/messageEvent');
const AuditLog = require('../../models/auditLog');
const Room = require('../../models/room');
const { getRoomState } = require('../../state');
const { adminLimiter, adminAuth } = require('../../middleware');
const { unpinIfPinned } = require('../../websocket/pinnedManager');

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

  const syncedRooms = new Set();

  const syncLegacyMessages = async (roomId) => {
    if (syncedRooms.has(roomId)) return;
    try {
      const messageCount = await Message.countDocuments({ roomId });
      if (messageCount === 0) {
        syncedRooms.add(roomId);
        return;
      }

      const eventCount = await MessageEvent.countDocuments({ roomId, type: 'create' });
      if (eventCount < messageCount) {
        const existingEvents = await MessageEvent.find({ roomId, type: 'create' }, { 'message.id': 1, messageId: 1 }).lean();
        const existingIdSet = new Set(
          existingEvents.map(e => e.messageId || e.message?.id).filter(Boolean)
        );

        const allMessages = await Message.find({ roomId }).lean();
        const missingMessages = allMessages.filter(m => !existingIdSet.has(m.id));

        if (missingMessages.length > 0) {
          const docsToInsert = missingMessages.map(m => ({
            roomId,
            type: 'create',
            messageId: m.id,
            message: m,
            userId: m.userId || m.sender || 'unknown',
            username: m.username || 'Unknown',
            timestamp: m.createdAt || m.timestamp || new Date(),
            createdAt: m.createdAt || m.timestamp || new Date(),
          }));
          await MessageEvent.insertMany(docsToInsert, { ordered: false });
          logger.info(`Synced ${docsToInsert.length} legacy messages into MessageEvent for room ${roomId}`);
        }
      }

      // Synchronize any deleted messages so MessageEvent accurately reflects user deletion
      const deletedMessages = await Message.find({ roomId, isDeleted: true }).lean();
      if (deletedMessages.length > 0) {
        for (const delMsg of deletedMessages) {
          await MessageEvent.updateMany(
            { roomId, $or: [{ messageId: delMsg.id }, { 'message.id': delMsg.id }] },
            { $set: { 'message.isDeleted': true, 'message.deletedBy': delMsg.deletedBy || 'user' } }
          );

          const hasDelEvent = await MessageEvent.findOne({
            roomId,
            type: { $in: ['delete_everyone', 'delete'] },
            $or: [{ messageId: delMsg.id }, { 'message.id': delMsg.id }]
          }).lean();

          if (!hasDelEvent) {
            const existingCreateEvent = await MessageEvent.findOne({
              roomId,
              type: 'create',
              $or: [{ messageId: delMsg.id }, { 'message.id': delMsg.id }]
            }).lean();

            await MessageEvent.create({
              roomId,
              type: 'delete_everyone',
              messageId: delMsg.id,
              userId: delMsg.deletedBy || delMsg.userId || delMsg.sender || 'unknown',
              username: delMsg.username || delMsg.sender || 'Unknown',
              deletedContent: {
                text: existingCreateEvent?.message?.text || delMsg.text || 'Message deleted by user',
                url: existingCreateEvent?.message?.url || delMsg.url,
                originalName: existingCreateEvent?.message?.originalName || delMsg.originalName,
                type: existingCreateEvent?.message?.type || delMsg.type,
              },
              timestamp: delMsg.updatedAt || delMsg.createdAt || new Date(),
              createdAt: delMsg.updatedAt || delMsg.createdAt || new Date(),
            });
          }
        }
      }
      syncedRooms.add(roomId);
    } catch (err) {
      logger.error('Error syncing legacy messages to MessageEvent:', err);
    }
  };

  router.get('/api/admin/history', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;

    if (!req.query.before) {
      await syncLegacyMessages(roomId);
    }

    const query = { roomId };
    if (req.query.before) {
      const beforeDate = new Date(req.query.before);
      if (!Number.isNaN(beforeDate.getTime())) {
        query.createdAt = { $lt: beforeDate };
      }
    }

    const { type, messageId, user, content } = req.query;

    if (type) {
      const typeLower = String(type).toLowerCase().trim();
      if (typeLower === 'photo') {
        query.type = 'create';
        query.$or = [
          { 'message.type': 'image' },
          { 'message.mimeType': /^image\//i },
          { 'message.url': /\.(jpg|jpeg|png|webp|avif|heic|bmp)($|\?)/i },
          { 'message.originalName': /\.(jpg|jpeg|png|webp|avif|heic|bmp)$/i },
          { 'message.text': /\[.*?\.(jpg|jpeg|png|webp|avif|heic|bmp)\]/i },
        ];
      } else if (typeLower === 'video') {
        query.type = 'create';
        query.$or = [
          { 'message.type': 'video' },
          { 'message.mimeType': /^video\//i },
          { 'message.url': /\.(mp4|webm|mov|mkv|avi)($|\?)/i },
          { 'message.originalName': /\.(mp4|webm|mov|mkv|avi)$/i },
          { 'message.text': /\[.*?\.(mp4|webm|mov|mkv|avi)\]/i },
        ];
      } else if (typeLower === 'gif') {
        query.type = 'create';
        query.$or = [
          { 'message.type': 'gif' },
          { 'message.url': /giphy\.com/i },
          { 'message.text': '[GIF]' },
          { 'message.originalName': /\.gif$/i },
        ];
      } else if (typeLower === 'document') {
        query.type = 'create';
        query.$or = [
          { 'message.type': { $in: ['file', 'document'] } },
          { 'message.url': /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|html|csv)($|\?)/i },
          { 'message.originalName': /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|html|csv)$/i },
          { 'message.text': /\[.*?\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|html|csv)\]/i },
        ];
      } else if (typeLower === 'pinned') {
        const roomState = getRoomState(roomId);
        const statePins = (roomState && Array.isArray(roomState.pinnedMessages)) ? roomState.pinnedMessages : [];

        const dbPinned = await Message.find({
          roomId,
          'pinned.pinnedAt': { $ne: null }
        }).sort({ 'pinned.pinnedAt': -1 }).lean();

        const allPinnedMap = new Map();
        for (const msg of dbPinned) {
          if (msg && msg.id) {
            allPinnedMap.set(msg.id, msg);
          }
        }
        for (const msg of statePins) {
          if (msg && msg.id && !allPinnedMap.has(msg.id)) {
            allPinnedMap.set(msg.id, msg);
          }
        }

        const pinnedIds = Array.from(allPinnedMap.keys());
        if (pinnedIds.length === 0) {
          return res.json({
            events: [],
            hasMore: false,
            oldestCreatedAt: null,
          });
        }

        const existingEvents = await MessageEvent.find({
          roomId,
          type: 'create',
          $or: [
            { messageId: { $in: pinnedIds } },
            { 'message.id': { $in: pinnedIds } }
          ]
        }).sort({ createdAt: -1 }).lean();

        const foundEventMsgIds = new Set(
          existingEvents.map(e => e.messageId || e.message?.id).filter(Boolean)
        );

        const combinedEvents = [...existingEvents];
        for (const [id, msg] of allPinnedMap.entries()) {
          if (!foundEventMsgIds.has(id)) {
            combinedEvents.push({
              _id: msg._id || id,
              roomId: msg.roomId || roomId,
              type: 'create',
              messageId: msg.id || id,
              message: msg,
              userId: msg.userId || msg.sender || 'unknown',
              username: msg.username || 'Unknown',
              timestamp: msg.createdAt || msg.timestamp || new Date(),
              createdAt: msg.createdAt || msg.timestamp || new Date(),
            });
          }
        }

        combinedEvents.forEach(evt => {
          const pinData = allPinnedMap.get(evt.messageId || evt.message?.id);
          if (pinData && pinData.pinned) {
            if (!evt.message) evt.message = {};
            evt.message.pinned = pinData.pinned;
          }
        });

        let finalEvents = combinedEvents;
        if (messageId) {
          const mIdLower = String(messageId).toLowerCase().trim();
          finalEvents = finalEvents.filter(e => (e.messageId || e.message?.id || '').toLowerCase().includes(mIdLower));
        }
        if (user) {
          const uLower = String(user).toLowerCase().trim();
          finalEvents = finalEvents.filter(e => (e.username || '').toLowerCase().includes(uLower) || (e.userId || '').toLowerCase().includes(uLower));
        }
        if (content) {
          const cLower = String(content).toLowerCase().trim();
          finalEvents = finalEvents.filter(e => (e.message?.text || '').toLowerCase().includes(cLower));
        }

        finalEvents.sort((a, b) => new Date(b.timestamp || b.createdAt).getTime() - new Date(a.timestamp || a.createdAt).getTime());

        return res.json({
          events: finalEvents,
          hasMore: false,
          oldestCreatedAt: null,
        });
      } else if (typeLower === 'deleted_by_admin') {
        query.$or = [
          { 'message.deletedBy': 'admin' },
          { 'message.vanished': true },
        ];
      } else if (['create', 'edit', 'upload', 'delete_everyone'].includes(typeLower)) {
        if (typeLower === 'delete_everyone') {
          query.type = { $in: ['delete_everyone', 'delete'] };
        } else {
          query.type = typeLower;
        }
      }
    }

    if (messageId) {
      const escaped = String(messageId).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (escaped) {
        query.messageId = { $regex: escaped, $options: 'i' };
      }
    }

    if (user) {
      const escaped = String(user).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (escaped) {
        const userOr = [
          { username: { $regex: escaped, $options: 'i' } },
          { userId: { $regex: escaped, $options: 'i' } },
        ];
        if (query.$and) {
          query.$and.push({ $or: userOr });
        } else if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: userOr }];
          delete query.$or;
        } else {
          query.$or = userOr;
        }
      }
    }

    if (content) {
      const escaped = String(content).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (escaped) {
        const contentOr = [
          { 'message.text': { $regex: escaped, $options: 'i' } },
          { oldText: { $regex: escaped, $options: 'i' } },
          { newText: { $regex: escaped, $options: 'i' } },
          { 'deletedContent.text': { $regex: escaped, $options: 'i' } },
          { 'file.originalname': { $regex: escaped, $options: 'i' } },
        ];
        if (query.$and) {
          query.$and.push({ $or: contentOr });
        } else if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: contentOr }];
          delete query.$or;
        } else {
          query.$or = contentOr;
        }
      }
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const events = await MessageEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = events.length > limit;
    const batch = hasMore ? events.slice(0, limit) : events;
    const oldestCreatedAt = batch.length > 0 ? batch[batch.length - 1].createdAt : null;

    res.json({
      events: batch,
      hasMore,
      oldestCreatedAt,
    });
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
          ? { $set: { vanished: true, isDeleted: true, deletedBy: 'admin', pinned: null } }
          : { $set: { isDeleted: true, deletedBy: 'admin', pinned: null } };

        await Message.updateMany({ roomId, id: { $in: messageIds } }, updatePayload);
        await Message.updateMany(
          { roomId, 'replyingTo.id': { $in: messageIds } },
          { $set: { 'replyingTo.isDeleted': true, 'replyingTo.deletedBy': 'admin' } }
        ).catch((e) => logger.error('Failed to update replyingTo on admin hide:', e));

        const eventPayload = vanish
          ? { $set: { 'message.vanished': true, 'message.isDeleted': true, 'message.deletedBy': 'admin', 'message.pinned': null } }
          : { $set: { 'message.isDeleted': true, 'message.deletedBy': 'admin', 'message.pinned': null } };

        await MessageEvent.updateMany({ roomId, 'message.id': { $in: messageIds } }, eventPayload);

        await unpinIfPinned(wss, roomId, messageIds);

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
          await Message.updateMany(
            { roomId, 'replyingTo.id': { $in: messageIds } },
            { $set: { 'replyingTo.isDeleted': true, 'replyingTo.deletedBy': 'admin' } }
          ).catch((e) => logger.error('Failed to update replyingTo on admin vanish:', e));
          await Message.deleteMany({ roomId, id: { $in: messageIds } });
          await unpinIfPinned(wss, roomId, messageIds);

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
                pinned: null,
              },
            }
          );
          await Message.updateMany(
            { roomId, 'replyingTo.id': { $in: messageIds } },
            { $set: { 'replyingTo.isDeleted': true, 'replyingTo.deletedBy': 'admin' } }
          ).catch((e) => logger.error('Failed to update replyingTo on admin delete:', e));
          await unpinIfPinned(wss, roomId, messageIds);

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
