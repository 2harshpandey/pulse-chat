'use strict';

const logger = require('./logger');
const Message = require('./models/message');
const { getRoomState, getCachedRoom } = require('./state');
const {
  extractIp,
  isUserBlocked,
  getAdminLockRemainingSeconds,
  recordFailedAdminAttemptAcrossScope,
  resetAdminAttemptsAcrossScope,
} = require('./middleware');
const { timingSafeEqualStr, verifyPasswordAsync } = require('./security');
const { verifyActiveSessionToken } = require('./sessionService');

/**
 * Builds the standard MongoDB visibility query excluding vanished/diagnostic records
 * and respecting per-room frontend clear cutoff and pagination upper bound.
 */
const buildVisibleMessagesQuery = (beforeTimestamp, frontendHiddenBefore) => {
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

/**
 * Curried helper used by WebSocket history sync to query visible messages for a room.
 */
const getVisibleMessagesQuery = (getFrontendHiddenBeforeFn) => (beforeTimestamp) => {
  const frontendHiddenBefore = typeof getFrontendHiddenBeforeFn === 'function'
    ? getFrontendHiddenBeforeFn()
    : null;
  return buildVisibleMessagesQuery(beforeTimestamp, frontendHiddenBefore);
};

/**
 * Marks replyingTo tombstones as deleted and strips cached text/url previews consistently
 * whenever the quoted message is hidden, deleted, or vanished.
 */
const markRepliesAsDeleted = async (roomId, targetMessageIds, deletedBy = 'admin', context = 'delete') => {
  const cleanIds = Array.from(
    new Set((Array.isArray(targetMessageIds) ? targetMessageIds : [targetMessageIds]).filter(Boolean).map(String))
  );
  if (cleanIds.length === 0) return;

  await Message.updateMany(
    {
      roomId: String(roomId),
      $or: [
        { 'replyingTo.id': { $in: cleanIds } },
        { 'replyingTo._id': { $in: cleanIds } },
        { 'replyingTo.messageId': { $in: cleanIds } },
      ],
    },
    {
      $set: {
        'replyingTo.isDeleted': true,
        'replyingTo.deletedBy': deletedBy,
      },
      $unset: {
        'replyingTo.text': '',
        'replyingTo.url': '',
        'replyingTo.duration': '',
      },
    }
  ).catch((e) => logger.error(`Failed to update replyingTo on ${context}:`, e));
};

/**
 * Enforces room existence, blocklist, admin override credentials, and active session auth
 * for REST routes accessing room messages, media, downloads, GIFs, or link previews.
 */
const isRoomAccessAllowed = async (rawRoomId, req, options = {}) => {
  const { requireSession = false } = options;
  const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const userId = req.headers['x-user-id'] || req.query?.userId || req.body?.userId;
  const clientIp = extractIp(req);
  const userAgent = req.headers['user-agent'] || '';

  const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : 'me';
  const lowerRoomId = cleanRoomId.toLowerCase();
  let canonicalRoomId = lowerRoomId === 'me' ? 'me' : lowerRoomId === 'global' ? 'global' : cleanRoomId;
  let room = null;

  if (canonicalRoomId !== 'me' && canonicalRoomId !== 'global') {
    try {
      room = await getCachedRoom(cleanRoomId);
      if (!room) {
        return false;
      }
      canonicalRoomId = room.id;
    } catch (err) {
      logger.error('Failed to lookup room access requirements:', err);
      return false;
    }
  }

  try {
    const safeUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : null;
    const blockCheck = await isUserBlocked(canonicalRoomId, safeUserId, clientIp, userAgent);
    if (blockCheck.blocked) {
      return false;
    }
  } catch (err) {
    logger.warn('Failed to verify block check status (failing closed):', err?.message);
    return false;
  }

  const adminPassword = req.headers['x-admin-password'];
  if (adminPassword && typeof adminPassword === 'string') {
    const adminLockKey = `${clientIp}_${canonicalRoomId.toLowerCase()}`;
    if (getAdminLockRemainingSeconds(adminLockKey, clientIp) > 0) {
      return false;
    }

    let isAdminValid = false;
    if (process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)) {
      isAdminValid = true;
    } else if (room && await verifyPasswordAsync(adminPassword, room.adminPassword)) {
      isAdminValid = true;
    }

    if (isAdminValid) {
      resetAdminAttemptsAcrossScope(adminLockKey, clientIp);
      return true;
    }

    recordFailedAdminAttemptAcrossScope(adminLockKey, clientIp, req);
    return false;
  }

  if (!requireSession) {
    if (canonicalRoomId === 'global') return true;

    const requiresPassword = canonicalRoomId === 'me'
      ? Boolean(process.env.CLIENT_PASSWORD)
      : Boolean(room && room.isPrivate);

    if (!requiresPassword) {
      return true;
    }
  }

  const rawSessionToken = req.headers['x-session-token'] || req.body?.sessionToken;
  const sessionToken = typeof rawSessionToken === 'string' && rawSessionToken.trim() ? rawSessionToken.trim() : null;
  if (typeof userId === 'string' && userId.trim() && sessionToken) {
    const result = await verifyActiveSessionToken({
      roomId: canonicalRoomId,
      rawRoomId: roomId,
      userId: userId.trim(),
      sessionToken,
      roomState: getRoomState(canonicalRoomId),
      ip: clientIp,
      userAgent,
      hydrateIfMissing: true,
      preserveTimestampSession: true,
    });
    return result.valid;
  }

  return false;
};

module.exports = {
  buildVisibleMessagesQuery,
  getVisibleMessagesQuery,
  markRepliesAsDeleted,
  isRoomAccessAllowed,
};
