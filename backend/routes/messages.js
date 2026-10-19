'use strict';

const express = require('express');
const mongoose = require('mongoose');
const logger = require('../logger');
const Message = require('../models/message');
const {
  getRoomState,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
} = require('../state');
const { apiLimiter, toClientMessage } = require('../middleware');

const getVisibleMessagesQuery = (beforeTimestamp, frontendHiddenBefore) => {
  const createdAt = {};

  if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
    createdAt.$gt = frontendHiddenBefore;
  }

  if (beforeTimestamp instanceof Date && !Number.isNaN(beforeTimestamp.getTime())) {
    createdAt.$lt = beforeTimestamp;
  }

  const query = { vanished: { $ne: true } };
  if (Object.keys(createdAt).length > 0) {
    query.createdAt = createdAt;
  }
  return query;
};

const router = express.Router();

// --- Paginated Messages ---
router.get('/api/messages/search', apiLimiter, async (req, res) => {
  const roomId = String(req.headers['x-room-id'] || req.query.roomId || 'me');
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }
  try {
    const { frontendHiddenBefore } = getRoomState(roomId);
    const query = {
      roomId,
      text: { $regex: q, $options: 'i' },
      isDeleted: { $ne: true },   // exclude "deleted for everyone" messages
      vanished: { $ne: true },    // exclude admin-vanished messages
    };
    if (frontendHiddenBefore) {
      query.createdAt = { $gte: new Date(frontendHiddenBefore) };
    }
    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(200).lean();
    res.json(messages.reverse()); // chronological order for the chat display
  } catch (error) {
    logger.error('Failed to search messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

router.get('/api/messages', apiLimiter, async (req, res) => {
  const roomId = String(req.headers['x-room-id'] || req.query.roomId || 'me');
  try {
    const requestedLimit = Number(req.query.limit);
    const pageSize = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_HISTORY_PAGE_SIZE)
      : DEFAULT_HISTORY_PAGE_SIZE;

    const { before, after, around } = req.query;

    // --- 'around' cursor: load messages centered around a specific target message ---
    if (typeof around === 'string' && around.trim()) {
      const targetId = around.trim();
      const orConditions = [{ id: targetId }];
      if (mongoose.isValidObjectId(targetId)) {
        orConditions.push({ _id: targetId });
      }
      const targetMsg = await Message.findOne({
        roomId,
        vanished: { $ne: true },
        $or: orConditions
      }).lean();

      if (targetMsg) {
        const targetDate = targetMsg.createdAt;
        const halfSize = Math.floor(pageSize / 2);
        const frontendHiddenBefore = getRoomState(roomId).frontendHiddenBefore;

        const olderQuery = { roomId, vanished: { $ne: true }, createdAt: { $lt: targetDate } };
        if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
          olderQuery.createdAt.$gt = frontendHiddenBefore;
        }

        const [olderRows, newerRows] = await Promise.all([
          Message.find(olderQuery).sort({ createdAt: -1 }).limit(halfSize + 1).lean(),
          Message.find({ roomId, vanished: { $ne: true }, createdAt: { $gt: targetDate } }).sort({ createdAt: 1 }).limit(halfSize + 1).lean()
        ]);

        const hasMoreOlder = olderRows.length > halfSize;
        const hasMoreNewer = newerRows.length > halfSize;

        const pageOlder = hasMoreOlder ? olderRows.slice(0, halfSize) : olderRows;
        const pageNewer = hasMoreNewer ? newerRows.slice(0, halfSize) : newerRows;

        const allRows = [...pageOlder.reverse(), targetMsg, ...pageNewer];
        const messages = allRows.map(toClientMessage);
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
      const query = { roomId, vanished: { $ne: true }, createdAt: { $gt: afterDate } };
      if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
        query.createdAt.$gt = new Date(Math.max(afterDate.getTime(), frontendHiddenBefore.getTime()));
      }
      const rows = await Message.find(query)
        .sort({ createdAt: 1 })
        .limit(pageSize + 1)
        .lean();
      const hasMore = rows.length > pageSize;
      const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
      const messages = pageRows.map(toClientMessage);
      const newestCreatedAt = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
      return res.json({ messages, hasMore, newestCreatedAt });
    }

    const query = getVisibleMessagesQuery(beforeDate, getRoomState(roomId).frontendHiddenBefore);
    
    const rows = await Message.find({ roomId, ...query })
      .sort({ createdAt: -1 })
      .limit(pageSize + 1)
      .lean();

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const messages = pageRows.reverse().map(toClientMessage);
    const oldestCreatedAt = messages.length > 0 ? messages[0].createdAt : null;

    res.json({ messages, hasMore, oldestCreatedAt });
  } catch (error) {
    logger.error('Failed to fetch paginated messages:', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;
module.exports.getVisibleMessagesQuery = getVisibleMessagesQuery;
