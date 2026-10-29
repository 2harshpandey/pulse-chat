const express = require('express');
const logger = require('../../logger');
const Message = require('../../models/message');
const MessageEvent = require('../../models/messageEvent');
const AuditLog = require('../../models/auditLog');
const Room = require('../../models/room');
const { getRoomState } = require('../../state');
const { adminLimiter, adminAuth, extractIp } = require('../../middleware');
const { unpinIfPinned } = require('../../websocket/pinnedManager');
const { parseCloudinaryAssetFromUrl, batchDeleteCloudinaryAssets } = require('../../security');

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
    try {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=pulse_full_db_export.json');
      res.write('[\n');
      let isFirst = true;
      const cursor = Message.find({}).sort({ createdAt: 1 }).lean().cursor();
      for await (const doc of cursor) {
        if (!isFirst) {
          res.write(',\n');
        } else {
          isFirst = false;
        }
        res.write(JSON.stringify(doc, null, 2));
      }
      res.write('\n]');
      res.end();
    } catch (err) {
      logger.error('Failed to export full database:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export full database' });
      } else {
        res.end();
      }
    }
  });

  router.get('/api/admin/export-all-messages', adminLimiter, adminAuth, async (req, res) => {
    try {
      if (!req.isSuperAdmin || (req.roomId !== 'me' && req.roomId !== 'global')) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }
      const [rooms, totalMessages] = await Promise.all([
        Room.find({}, 'id name alias').sort({ createdAt: -1 }).limit(1000).lean(),
        Message.countDocuments({})
      ]);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=all_rooms_messages_export.json');

      res.write('{\n');
      res.write(`  "exportedAt": ${JSON.stringify(new Date().toISOString())},\n`);
      res.write(`  "totalMessages": ${totalMessages},\n`);
      res.write('  "rooms": {\n');

      const roomDefinitions = [
        { id: 'me', name: 'Super Admin Private Room (me)', alias: null },
        { id: 'global', name: 'Global Room (global)', alias: null },
        ...rooms.map(r => ({ id: r.id, name: r.name, alias: r.alias }))
      ];

      const activeRoomIds = await Message.distinct('roomId');
      for (const rid of activeRoomIds) {
        if (!roomDefinitions.some(r => r.id === rid)) {
          roomDefinitions.push({ id: rid, name: `Unknown Room (${rid})`, alias: null });
        }
      }

      for (let i = 0; i < roomDefinitions.length; i++) {
        const rDef = roomDefinitions[i];
        const isLastRoom = i === roomDefinitions.length - 1;
        res.write(`    ${JSON.stringify(rDef.id)}: {\n`);
        res.write(`      "roomName": ${JSON.stringify(rDef.name)},\n`);
        if (rDef.alias) {
          res.write(`      "alias": ${JSON.stringify(rDef.alias)},\n`);
        }
        res.write('      "messages": [\n');

        let isFirstMsg = true;
        const msgCursor = Message.find({ roomId: rDef.id }).sort({ createdAt: 1 }).lean().cursor();
        for await (const msg of msgCursor) {
          if (!isFirstMsg) {
            res.write(',\n');
          } else {
            isFirstMsg = false;
          }
          const formatted = JSON.stringify(msg, null, 2).split('\n').map(l => '        ' + l).join('\n');
          res.write(formatted);
        }

        res.write('\n      ]\n');
        res.write(`    }${isLastRoom ? '' : ','}\n`);
      }

      res.write('  }\n');
      res.write('}\n');
      res.end();
    } catch (error) {
      logger.error('Failed to export all messages:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export all messages' });
      } else {
        res.end();
      }
    }
  });

  router.get('/api/admin/export-messages', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    try {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=messages_export.json');
      res.write('[\n');
      let isFirst = true;
      const cursor = Message.find({ roomId }).sort({ createdAt: 1 }).lean().cursor();
      for await (const doc of cursor) {
        if (!isFirst) {
          res.write(',\n');
        } else {
          isFirst = false;
        }
        res.write(JSON.stringify(doc, null, 2));
      }
      res.write('\n]');
      res.end();
    } catch (err) {
      logger.error('Failed to export messages:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export messages' });
      } else {
        res.end();
      }
    }
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

        const cursor = Message.find({ roomId }).sort({ createdAt: 1 }).cursor();
        const batch = [];
        for await (const m of cursor) {
          if (!existingIdSet.has(m.id)) {
            batch.push({
              roomId,
              type: 'create',
              messageId: m.id,
              message: typeof m.toObject === 'function' ? m.toObject() : m,
              userId: m.userId || m.sender || 'unknown',
              username: m.username || 'Unknown',
              timestamp: m.createdAt || m.timestamp || new Date(),
              createdAt: m.createdAt || m.timestamp || new Date(),
            });
            if (batch.length >= 200) {
              await MessageEvent.insertMany(batch, { ordered: false }).catch(() => {});
              batch.length = 0;
            }
          }
        }
        if (batch.length > 0) {
          await MessageEvent.insertMany(batch, { ordered: false }).catch(() => {});
        }
      }

      // Synchronize any deleted messages so MessageEvent accurately reflects user deletion
      const deletedMessages = await Message.find({ roomId, isDeleted: true }).sort({ createdAt: -1 }).limit(100).lean();
      if (deletedMessages.length > 0) {
        const deletedIds = deletedMessages.map(m => m.id);

        // 1. Batch update message.isDeleted across existing events
        await MessageEvent.updateMany(
          { roomId, $or: [{ messageId: { $in: deletedIds } }, { 'message.id': { $in: deletedIds } }] },
          { $set: { 'message.isDeleted': true } }
        ).catch(() => {});

        // 2. Find all existing delete events for these IDs in one query
        const existingDelEvents = await MessageEvent.find({
          roomId,
          type: { $in: ['delete_everyone', 'delete'] },
          $or: [{ messageId: { $in: deletedIds } }, { 'message.id': { $in: deletedIds } }]
        }).lean();
        const coveredIds = new Set();
        for (const ev of existingDelEvents) {
          if (ev.messageId) coveredIds.add(ev.messageId);
          if (ev.message?.id) coveredIds.add(ev.message.id);
        }

        const missingDeleteMsgs = deletedMessages.filter(m => !coveredIds.has(m.id));
        if (missingDeleteMsgs.length > 0) {
          const missingIds = missingDeleteMsgs.map(m => m.id);
          const createEvents = await MessageEvent.find({
            roomId,
            type: 'create',
            $or: [{ messageId: { $in: missingIds } }, { 'message.id': { $in: missingIds } }]
          }).lean();
          const createEventMap = new Map();
          for (const ev of createEvents) {
            const id = ev.messageId || ev.message?.id;
            if (id) createEventMap.set(id, ev);
          }

          const newDeleteEvents = missingDeleteMsgs.map(delMsg => {
            const existingCreate = createEventMap.get(delMsg.id);
            return {
              roomId,
              type: 'delete_everyone',
              messageId: delMsg.id,
              userId: delMsg.deletedBy || delMsg.userId || delMsg.sender || 'unknown',
              username: delMsg.username || delMsg.sender || 'Unknown',
              deletedContent: {
                text: existingCreate?.message?.text || delMsg.text || 'Message deleted by user',
                url: existingCreate?.message?.url || delMsg.url,
                originalName: existingCreate?.message?.originalName || delMsg.originalName,
                type: existingCreate?.message?.type || delMsg.type,
              },
              timestamp: delMsg.updatedAt || delMsg.createdAt || new Date(),
              createdAt: delMsg.updatedAt || delMsg.createdAt || new Date(),
            };
          });

          await MessageEvent.insertMany(newDeleteEvents, { ordered: false }).catch(() => {});
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
        query['message.type'] = { $ne: 'audio' };
        query['message.originalName'] = { $not: /(voice-message|\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$)/i };
        query.$or = [
          { 'message.type': 'video' },
          { 'message.mimeType': /^video\//i },
          { 'message.url': /\.(mp4|webm|mov|mkv|avi)($|\?)/i },
          { 'message.originalName': /\.(mp4|webm|mov|mkv|avi)$/i },
          { 'message.text': /\[.*?\.(mp4|webm|mov|mkv|avi)\]/i },
        ];
      } else if (typeLower === 'audio' || typeLower === 'voice') {
        query.type = 'create';
        query.$or = [
          { 'message.type': 'audio' },
          { 'message.mimeType': /^audio\//i },
          { 'message.url': /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)($|\?)/i },
          { 'message.originalName': /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i },
          { 'message.originalName': /voice-message/i },
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

        const now = new Date();
        const dbPinned = await Message.find({
          roomId,
          'pinned.pinnedAt': { $ne: null },
          isDeleted: { $ne: true },
          vanished: { $ne: true },
          $or: [
            { 'pinned.expiresAt': null },
            { 'pinned.expiresAt': { $gt: now } }
          ]
        }).sort({ 'pinned.pinnedAt': -1 }).lean();

        const allPinnedMap = new Map();
        for (const msg of dbPinned) {
          if (msg && msg.id) {
            allPinnedMap.set(msg.id, msg);
          }
        }
        for (const msg of statePins) {
          if (
            msg &&
            msg.id &&
            !allPinnedMap.has(msg.id) &&
            !msg.isDeleted &&
            !msg.vanished &&
            (!msg.pinned?.expiresAt || new Date(msg.pinned.expiresAt) > now)
          ) {
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
      if (String(messageId).length > 200) return res.status(400).json({ error: 'messageId filter too long' });
      const escaped = String(messageId).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (escaped) {
        const msgIdOr = [
          { messageId: { $regex: escaped, $options: 'i' } },
          { 'message.id': { $regex: escaped, $options: 'i' } },
        ];
        if (query.$and) {
          query.$and.push({ $or: msgIdOr });
        } else if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: msgIdOr }];
          delete query.$or;
        } else {
          query.$or = msgIdOr;
        }
      }
    }

    if (user) {
      if (String(user).length > 200) return res.status(400).json({ error: 'user filter too long' });
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
      if (String(content).length > 200) return res.status(400).json({ error: 'content filter too long' });
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
      .limit(limit * 2 + 1)
      .lean();

    // Deduplicate any duplicate delete_everyone events for the same messageId
    const seenDeleteMsgKeys = new Set();
    const deduplicatedEvents = events.filter(e => {
      if (e.type === 'delete_everyone' || e.type === 'delete') {
        const key = `${e.roomId || roomId}_${e.messageId || e.message?.id}`;
        if (seenDeleteMsgKeys.has(key)) return false;
        seenDeleteMsgKeys.add(key);
      }
      return true;
    });

    const hasMore = deduplicatedEvents.length > limit;
    const batch = hasMore ? deduplicatedEvents.slice(0, limit) : deduplicatedEvents;
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

    if (messageIds.length > 500) {
      return res.status(400).json({ error: 'Cannot process more than 500 messages at once.' });
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
          const auditEntry = await AuditLog.create({
            roomId,
            type: 'messages_deleted_disappear',
            details: { count: messageIds.length, action: 'hide' },
            ip: extractIp(req),
            userAgent: req.headers['user-agent'] || '',
          });
          broadcastToAdmins(roomId, 'audit_log', auditEntry);
          broadcastToAdmins(roomId, 'activity', `${messageIds.length} message(s) vanished from frontend by super admin (retained in DB).`);
        } else {
          const updatedMessages = await Message.find({ roomId, id: { $in: messageIds } }).lean();
          broadcast(roomId, { type: 'bulk_update', messages: updatedMessages });
          const auditEntry = await AuditLog.create({
            roomId,
            type: 'messages_hidden',
            details: { count: messageIds.length },
            ip: extractIp(req),
            userAgent: req.headers['user-agent'] || '',
          });
          broadcastToAdmins(roomId, 'audit_log', auditEntry);
          broadcastToAdmins(roomId, 'activity', `${messageIds.length} message(s) hidden from frontend by admin.`);
        }

        const updatedEvents = await MessageEvent.find({ roomId, 'message.id': { $in: messageIds } }).lean();
        broadcastToAdmins(roomId, 'bulk_history_update', { events: updatedEvents });

      } else if (action === 'delete') {
        // Clean up Cloudinary assets for media messages in the batch before purging / nullifying
        try {
          const messagesWithMedia = await Message.find({
            roomId,
            id: { $in: messageIds },
            url: { $exists: true, $ne: null }
          }).select('id url type').lean();

          if (messagesWithMedia && messagesWithMedia.length > 0) {
            batchDeleteCloudinaryAssets(messagesWithMedia).catch((err) => {
              logger.warn('Failed to clean up Cloudinary assets during bulk delete:', err.message);
            });
          }
        } catch (mediaErr) {
          logger.warn('Failed to scan messages for Cloudinary assets during bulk delete:', mediaErr.message);
        }

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
          const auditEntry = await AuditLog.create({
            roomId,
            type: 'messages_deleted_disappear',
            details: { count: messageIds.length, action: 'delete' },
            ip: extractIp(req),
            userAgent: req.headers['user-agent'] || '',
          });
          broadcastToAdmins(roomId, 'audit_log', auditEntry);
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

          const auditEntry = await AuditLog.create({
            roomId,
            type: 'messages_deleted_bubble',
            details: { count: messageIds.length },
            ip: extractIp(req),
            userAgent: req.headers['user-agent'] || '',
          });
          broadcastToAdmins(roomId, 'audit_log', auditEntry);
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
