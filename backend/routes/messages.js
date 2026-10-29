'use strict';

const express = require('express');
const mongoose = require('mongoose');
const logger = require('../logger');
const Message = require('../models/message');
const Room = require('../models/room');
const User = require('../models/user');
const { verifyPassword, timingSafeEqualStr, verifySignedSessionToken } = require('../security');
const {
  getRoomState,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
} = require('../state');
const { apiLimiter, toClientMessage, extractIp, isUserBlocked } = require('../middleware');

const getVisibleMessagesQuery = (beforeTimestamp, frontendHiddenBefore) => {
  const createdAt = {};

  if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
    createdAt.$gt = frontendHiddenBefore;
  }

  if (beforeTimestamp instanceof Date && !Number.isNaN(beforeTimestamp.getTime())) {
    createdAt.$lt = beforeTimestamp;
  }

  const query = { vanished: { $ne: true }, type: { $ne: 'client_diagnostic' } };
  if (Object.keys(createdAt).length > 0) {
    query.createdAt = createdAt;
  }
  return query;
};

const isRoomAccessAllowed = async (rawRoomId, req) => {
  const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const userId = req.headers['x-user-id'] || req.query.userId || req.body?.userId;
  const clientIp = extractIp(req);
  const userAgent = req.headers['user-agent'] || '';

  let canonicalRoomId = roomId;
  let room = null;

  if (roomId !== 'me' && roomId !== 'global') {
    try {
      room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
      if (!room) {
        return false;
      }
      // Do not allow access to private room via alias
      if (room.isPrivate && roomId !== room.id) {
        return false;
      }
      canonicalRoomId = room.id;
    } catch (err) {
      logger.error('Failed to lookup room access requirements:', err);
      return false;
    }
  }

  // Check if requesting user or IP is blocked from this room using canonicalRoomId
  try {
    const safeUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : null;
    const blockCheck = await isUserBlocked(canonicalRoomId, safeUserId, clientIp, userAgent);
    if (blockCheck.blocked) {
      return false;
    }
  } catch (_) {}

  if (roomId === 'global') return true;

  // Check admin authorization header
  const adminPassword = req.headers['x-admin-password'];
  if (adminPassword && typeof adminPassword === 'string') {
    if (process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)) {
      return true;
    }
    if (room && verifyPassword(adminPassword, room.adminPassword)) {
      return true;
    }
  }

  // Check room password requirements
  const requiresPassword = roomId === 'me'
    ? Boolean(process.env.CLIENT_PASSWORD)
    : Boolean(room && room.isPrivate);

  if (!requiresPassword) {
    return true;
  }

  // Check if requesting user has an active authenticated session using canonical room state
  const rawSessionToken = req.headers['x-session-token'] || req.body?.sessionToken;
  const sessionToken = typeof rawSessionToken === 'string' && rawSessionToken.trim() ? rawSessionToken.trim() : null;

  if (typeof userId === 'string' && userId.trim() && sessionToken) {
    const cleanUserId = userId.trim();
    const roomState = getRoomState(canonicalRoomId);

    // 1. Check in-memory session
    if (roomState && roomState.loggedInUsers) {
      const session = roomState.loggedInUsers.get(cleanUserId);
      if (session && session.sessionToken && timingSafeEqualStr(sessionToken, session.sessionToken)) {
        return true;
      }
    }

    // 2. Check signed token validity
    const verifiedData = verifySignedSessionToken(sessionToken);
    if (verifiedData && verifiedData.userId === cleanUserId && (verifiedData.roomId === canonicalRoomId || verifiedData.roomId === roomId)) {
      if (roomState && roomState.loggedInUsers) {
        roomState.loggedInUsers.set(cleanUserId, {
          userId: cleanUserId,
          sessionToken,
          loginTime: new Date(),
          ip: clientIp,
          userAgent,
        });
      }
      return true;
    }

    // 3. Fallback to DB session token check for multi-instance / post-restart resilience
    try {
      const userDoc = await User.findOne({ roomId: canonicalRoomId, userId: cleanUserId }).lean();
      if (userDoc && userDoc.sessionToken && timingSafeEqualStr(sessionToken, userDoc.sessionToken)) {
        if (roomState && roomState.loggedInUsers) {
          roomState.loggedInUsers.set(cleanUserId, {
            userId: cleanUserId,
            username: userDoc.username,
            sessionToken,
            loginTime: new Date(),
            ip: clientIp,
            userAgent,
          });
        }
        return true;
      }
    } catch (_) {}
  }

  // Alternatively check if room password was passed directly (via header or request body)
  const roomPassword = req.headers['x-room-password'] || req.body?.password || req.body?.joinPassword;
  if (roomPassword && typeof roomPassword === 'string') {
    if (roomId === 'me' && process.env.CLIENT_PASSWORD && timingSafeEqualStr(roomPassword, process.env.CLIENT_PASSWORD)) {
      return true;
    }
    if (room && room.joinPassword && verifyPassword(roomPassword, room.joinPassword)) {
      return true;
    }
    if (!room && roomId !== 'me') {
      try {
        const fetchedRoom = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
        if (fetchedRoom && fetchedRoom.joinPassword && verifyPassword(roomPassword, fetchedRoom.joinPassword)) {
          return true;
        }
      } catch (_) {}
    }
  }

  return false;
};

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

  if (roomId !== 'me' && roomId !== 'global') {
    const roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
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
    res.json(messages.reverse().map(toClientMessage)); // chronological order and clean reactions for the chat display
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

  if (roomId !== 'me' && roomId !== 'global') {
    const roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
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
        const halfSize = Math.floor(pageSize / 2);

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
module.exports.isRoomAccessAllowed = isRoomAccessAllowed;
