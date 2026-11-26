'use strict';

const express = require('express');
const mongoose = require('mongoose');
const logger = require('../logger');
const Message = require('../models/message');
const {
  getRoomState,
  getCachedRoom,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
} = require('../state');
const {
  apiLimiter,
  toPublicClientMessage,
} = require('../middleware');
const {
  buildVisibleMessagesQuery,
  isRoomAccessAllowed,
} = require('../roomAccess');

const router = express.Router();

// --- Paginated Messages ---
router.get('/api/messages/search', apiLimiter, async (req, res) => {
  const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
  let roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }
  if (q.length > 200) {
    return res.status(400).json({ error: 'Search query is too long' });
  }

  const allowed = await isRoomAccessAllowed(roomId, req);
  if (!allowed) {
    return res.status(401).json({ error: 'Access denied: authentication or room password required' });
  }

  const lowerRoomId = roomId.toLowerCase();
  if (lowerRoomId === 'me' || lowerRoomId === 'global') {
    roomId = lowerRoomId;
  } else {
    const roomDoc = await getCachedRoom(roomId);
    if (roomDoc) roomId = roomDoc.id;
  }

  const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) {
    return res.json([]);
  }
  try {
    const { frontendHiddenBefore } = getRoomState(roomId);
    const query = {
      roomId,
      $or: [
        { text: { $regex: escaped, $options: 'i' } },
        { originalName: { $regex: escaped, $options: 'i' } },
      ],
      type: { $ne: 'client_diagnostic' },
      isDeleted: { $ne: true },   // exclude "deleted for everyone" messages
      vanished: { $ne: true },    // exclude admin-vanished messages
    };
    if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
      query.createdAt = { $gt: frontendHiddenBefore };
    }
    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(200).maxTimeMS(5000).lean();
    res.json(messages.reverse().map(toPublicClientMessage)); // chronological order and clean reactions for the chat display
  } catch (error) {
    logger.error('Failed to search messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

router.get('/api/messages', apiLimiter, async (req, res) => {
  const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
  let roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const allowed = await isRoomAccessAllowed(roomId, req);
  if (!allowed) {
    return res.status(401).json({ error: 'Access denied: authentication or room password required' });
  }

  const lowerRoomId = roomId.toLowerCase();
  if (lowerRoomId === 'me' || lowerRoomId === 'global') {
    roomId = lowerRoomId;
  } else {
    const roomDoc = await getCachedRoom(roomId);
    if (roomDoc) roomId = roomDoc.id;
  }
  try {
    const requestedLimit = Number(req.query.limit);
    const pageSize = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_HISTORY_PAGE_SIZE)
      : DEFAULT_HISTORY_PAGE_SIZE;

    const { before, after, around } = req.query;

    // --- 'around' cursor: load messages centered around a specific target message ---
    if (typeof around === 'string' && around.trim()) {
      const targetId = around.trim();
      const orConditions = [{ id: targetId }, { clientTempId: targetId }];
      if (mongoose.isValidObjectId(targetId)) {
        orConditions.push({ _id: targetId });
      }
      const { frontendHiddenBefore } = getRoomState(roomId);
      const targetQuery = {
        roomId,
        vanished: { $ne: true },
        type: { $ne: 'client_diagnostic' },
        $or: orConditions
      };
      if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
        targetQuery.createdAt = { $gt: frontendHiddenBefore };
      }
      const targetMsg = await Message.findOne(targetQuery).lean();

      if (targetMsg) {
        const targetDate = targetMsg.createdAt;
        const MAX_AROUND_PAGE_SIZE = 100;
        const aroundPageSize = Math.min(pageSize, MAX_AROUND_PAGE_SIZE);
        const halfSize = Math.floor(aroundPageSize / 2);

        const olderQuery = { roomId, vanished: { $ne: true }, type: { $ne: 'client_diagnostic' }, createdAt: { $lt: targetDate } };
        if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
          olderQuery.createdAt.$gt = frontendHiddenBefore;
        }

        const [olderRows, newerRows] = await Promise.all([
          Message.find(olderQuery).sort({ createdAt: -1 }).limit(halfSize + 1).lean(),
          Message.find({ roomId, vanished: { $ne: true }, type: { $ne: 'client_diagnostic' }, createdAt: { $gt: targetDate } }).sort({ createdAt: 1 }).limit(halfSize + 1).lean()
        ]);

        const hasMoreOlder = olderRows.length > halfSize;
        const hasMoreNewer = newerRows.length > halfSize;

        const pageOlder = hasMoreOlder ? olderRows.slice(0, halfSize) : olderRows;
        const pageNewer = hasMoreNewer ? newerRows.slice(0, halfSize) : newerRows;

        const allRows = [...pageOlder.reverse(), targetMsg, ...pageNewer];
        const messages = allRows.map(toPublicClientMessage);
        const oldestCreatedAt = messages.length > 0 ? messages[0].createdAt : null;
        const newestCreatedAt = messages.length > 0 ? messages[messages.length - 1].createdAt : null;

        return res.json({
          messages,
          hasMoreOlder,
          hasMoreNewer,
          oldestCreatedAt,
          newestCreatedAt,
          targetId: targetMsg.id
        });
      }
    }

    // --- 'before' cursor: load older messages ---
    let beforeDate = null;
    if (typeof before === 'string' && before.trim()) {
      const parsed = new Date(before);
      if (!Number.isNaN(parsed.getTime())) {
        beforeDate = parsed;
      }
    }

    // --- 'after' cursor: load NEWER messages for sliding-window restore ---
    let afterDate = null;
    if (typeof after === 'string' && after.trim()) {
      const parsed = new Date(after);
      if (!Number.isNaN(parsed.getTime())) {
        afterDate = parsed;
      }
    }

    if (afterDate) {
      const frontendHiddenBefore = getRoomState(roomId).frontendHiddenBefore;
      const query = { roomId, vanished: { $ne: true }, type: { $ne: 'client_diagnostic' }, createdAt: { $gt: afterDate } };
      if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
        query.createdAt.$gt = new Date(Math.max(afterDate.getTime(), frontendHiddenBefore.getTime()));
      }
      const rows = await Message.find(query)
        .sort({ createdAt: 1 })
        .limit(pageSize + 1)
        .lean();
      const hasMore = rows.length > pageSize;
      const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
      const messages = pageRows.map(toPublicClientMessage);
      const newestCreatedAt = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
      return res.json({ messages, hasMore, newestCreatedAt });
    }

    const query = buildVisibleMessagesQuery(beforeDate, getRoomState(roomId).frontendHiddenBefore);
    
    const rows = await Message.find({ roomId, ...query })
      .sort({ createdAt: -1 })
      .limit(pageSize + 1)
      .lean();

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const messages = pageRows.reverse().map(toPublicClientMessage);
    const oldestCreatedAt = messages.length > 0 ? messages[0].createdAt : null;

    res.json({ messages, hasMore, oldestCreatedAt });
  } catch (error) {
    logger.error('Failed to fetch paginated messages:', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;
