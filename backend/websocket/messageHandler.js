'use strict';

const mongoose = require('mongoose');
const { WebSocket } = require('ws');
const logger = require('../logger');
const User = require('../models/user');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const UserReport = require('../models/userReport');
const cloudinary = require('cloudinary').v2;
const { toClientMessage } = require('../middleware');
const { timingSafeEqualStr, parseCloudinaryAssetFromUrl } = require('../security');
const { normalizeReactionEmoji, filterValidReactions, toReactionMap } = require('../reactions');
const {
  getRoomState,
  MIN_REPORT_REASON_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_REPORTED_JOIN_HISTORY,
} = require('../state');
const { unpinIfPinned, broadcastPinnedMessages } = require('./pinnedManager');

const reactionLocks = new Map();

// Issue 12: Periodic reactionLocks cleanup to prevent memory leak from orphaned promise
// references. Reaction locks are ephemeral serialization objects (not persistent state),
// so clearing them hourly is safe — any in-flight lock will simply recreate itself.
if (typeof setInterval !== 'undefined') {
  setInterval(() => { reactionLocks.clear(); }, 60 * 60 * 1000).unref();
}

// Issue 7: Reconstruct replyingTo from a strict whitelist of known-safe fields.
// The Mongoose model uses { type: Object } with no sub-schema, so arbitrary client-supplied
// keys (e.g. __proto__, isAdmin) would otherwise be persisted verbatim.
const buildSafeReplyingTo = (rt) => {
  if (!rt || typeof rt !== 'object') return null;
  const safe = {};
  if (typeof rt.id === 'string')        safe.id        = rt.id.slice(0, 64);
  if (typeof rt.text === 'string')      safe.text      = rt.text.slice(0, 500);
  if (typeof rt.url === 'string')       safe.url       = rt.url.slice(0, 2048);
  if (typeof rt.type === 'string')      safe.type      = rt.type.slice(0, 20);
  if (typeof rt.username === 'string')  safe.username  = rt.username.slice(0, 50);
  if (typeof rt.deletedBy === 'string') safe.deletedBy = rt.deletedBy.slice(0, 64);
  if (Number.isFinite(rt.duration))     safe.duration  = Number(rt.duration);
  if (Number.isFinite(rt.mediaCount))   safe.mediaCount = Math.max(1, Math.min(50, Math.floor(Number(rt.mediaCount))));
  // Boolean flags — coerce to actual booleans
  safe.isDeleted = Boolean(rt.isDeleted);
  if (rt.isGroup !== undefined)         safe.isGroup   = Boolean(rt.isGroup);
  return safe;
};

/**
 * Handle reaction addition/toggle.
 */
const handleReact = async ({ ws, parsedMessage, wss, broadcastToAdmins }) => {
  const { messageId } = parsedMessage;
  const userId = ws.userId;
  const roomId = ws.roomId || 'me';
  const emoji = normalizeReactionEmoji(parsedMessage.emoji);
  if (!emoji || typeof messageId !== 'string' || !userId) {
    logger.warn('Rejected invalid reaction payload', { messageId, userId, emoji: parsedMessage.emoji });
    return;
  }

  const roomState = getRoomState(roomId);
  const activeSession = roomState.loggedInUsers?.get(userId);
  if (activeSession && activeSession.sessionToken && (!ws.sessionToken || !timingSafeEqualStr(ws.sessionToken, activeSession.sessionToken))) {
    logger.warn(`Rejected reaction from socket with invalid session token (userId: ${userId})`);
    ws.send(JSON.stringify({ type: 'force_logout', message: 'Invalid session token. Please log in again.' }));
    ws.terminate();
    return;
  }

  const { onlineUsers } = roomState;
  const username = ws.username || onlineUsers.get(userId)?.username || 'Unknown';

  const currentChain = reactionLocks.get(messageId) || Promise.resolve();
  const nextOperation = currentChain.then(async () => {
    const messageDoc = await Message.findOne({ id: messageId, roomId });

    if (messageDoc && !messageDoc.isDeleted && !messageDoc.vanished) {
      messageDoc.reactions = toReactionMap(messageDoc.reactions);

      const isAlbumReaction = Boolean(parsedMessage.isAlbum);
      let previousEmoji = null;

      for (const [e, users] of messageDoc.reactions.entries()) {
        if (Array.isArray(users)) {
          const userIndex = users.findIndex(u => u.userId === userId && Boolean(u.isAlbum) === isAlbumReaction);
          if (userIndex > -1) {
            previousEmoji = e;
            const updatedUsers = users.filter((_, i) => i !== userIndex);
            if (updatedUsers.length === 0) {
              messageDoc.reactions.delete(e);
            } else {
              messageDoc.reactions.set(e, updatedUsers);
            }
            break;
          }
        }
      }

      if (previousEmoji !== emoji) {
        const existing = Array.from(messageDoc.reactions.get(emoji) || []);
        const entry = { userId, username };
        if (isAlbumReaction) {
          entry.isAlbum = true;
        }
        existing.push(entry);
        messageDoc.reactions.set(emoji, existing);
      }

      messageDoc.markModified('reactions');
      await messageDoc.save();

      logger.info(`[Reaction] [Room: ${roomId}] User '${username}' ${previousEmoji !== emoji ? `reacted ${emoji}` : 'removed reaction'} on message ${messageId}${isAlbumReaction ? ' (album)' : ''}`, {
        roomId,
        userId,
        username,
        messageId,
        isAlbum: isAlbumReaction,
        emoji: previousEmoji !== emoji ? emoji : null,
      });

      if (typeof broadcastToAdmins === 'function') {
        broadcastToAdmins(
          roomId,
          'activity',
          `User '${username}' ${previousEmoji !== emoji ? `reacted ${emoji}` : 'removed reaction'} on a message.`
        );
      }

      const reactionsPlain = filterValidReactions(messageDoc.reactions);
      const targetRoomId = messageDoc.roomId || roomId || ws.roomId || 'me';

      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.roomId === targetRoomId) {
          client.send(JSON.stringify({ type: 'update', data: { id: messageId, reactions: reactionsPlain } }));
        }
      });
    }
  }).catch((err) => {
    logger.error('Error handling reaction update:', err);
  }).finally(() => {
    if (reactionLocks.get(messageId) === nextOperation) {
      reactionLocks.delete(messageId);
    }
  });

  reactionLocks.set(messageId, nextOperation);
  await nextOperation;
};

/**
 * Handle message edit.
 */
const handleEdit = async ({ ws, parsedMessage, wss, broadcastToAdmins }) => {
  const { messageId, newText } = parsedMessage;
  const roomId = ws.roomId || 'me';

  if (!messageId || typeof messageId !== 'string') return;
  if (typeof newText !== 'string' || !newText.trim() || newText.length > 5000) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message text.' }));
    return;
  }
  const safeText = newText.trim();

  const msg = await Message.findOne({ id: messageId, roomId });
  if (!msg || msg.isDeleted || msg.vanished) return;

  const roomState = getRoomState(roomId);
  const activeSession = roomState.loggedInUsers?.get(ws.userId);
  const isSessionValid = Boolean(activeSession && (!activeSession.sessionToken || (ws.sessionToken && timingSafeEqualStr(ws.sessionToken, activeSession.sessionToken))));

  const isAuthor = Boolean(isSessionValid && ws.userId && (msg.userId === ws.userId || msg.sender === ws.userId));
  if (!isAuthor && !ws.isAdmin) {
    logger.warn(`Unauthorized edit attempt: user ${ws.userId} tried to edit message ${messageId} in room ${roomId}`);
    ws.send(JSON.stringify({ type: 'error', message: 'You are not authorized to edit this message.' }));
    return;
  }

  const oldText = msg.text;

  await Message.updateOne({ id: messageId, roomId }, { $set: { text: safeText, edited: true } });

  // If this message is pinned, keep the banner synchronized with the new text
  const state = getRoomState(roomId);
  let pinnedChanged = false;
  state.pinnedMessages = state.pinnedMessages.map(p => {
    if (p.id === messageId) {
      pinnedChanged = true;
      return { ...p, text: safeText, edited: true };
    }
    return p;
  });
  if (pinnedChanged) {
    broadcastPinnedMessages(wss, roomId);
  }

  // Synchronize MessageEvent so admin history and search reflect the edited text
  await MessageEvent.updateMany(
    { roomId, $or: [{ messageId }, { 'message.id': messageId }] },
    { $set: { 'message.text': safeText, 'message.edited': true } }
  ).catch(e => logger.error('Failed to update MessageEvent on edit:', e));

  const updatedMsgForBroadcast = toClientMessage({
    ...msg.toObject(),
    text: safeText,
    edited: true,
  });

  try {
    let username = ws.username;
    if (!username && ws.userId) {
      const user = await User.findOne({ roomId, userId: ws.userId }).lean();
      username = user ? user.username : null;
    }
    username = username || (ws.isAdmin ? 'Admin' : 'Unknown');
    const event = new MessageEvent({
      roomId,
      type: 'edit',
      messageId,
      oldText,
      newText: safeText,
      userId: ws.userId || (ws.isAdmin ? 'admin' : 'unknown'),
      username,
      timestamp: new Date().toISOString(),
    });
    await event.save();
    broadcastToAdmins(roomId, 'history', event);
    broadcastToAdmins(roomId, 'activity', `Message (ID: ${messageId}) edited by '${username}'. New text: "${safeText}"`);
  } catch (e) {
    logger.error('Failed to handle edit event logging:', e);
  }

  const updateMsg = { type: 'update', data: updatedMsgForBroadcast };
  wss.clients.forEach(c => { 
    if (c.readyState === WebSocket.OPEN && c.roomId === roomId) {
      c.send(JSON.stringify(updateMsg)); 
    }
  });
};

const userReportCooldowns = new Map();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [k, v] of userReportCooldowns.entries()) {
      if (v < cutoff) userReportCooldowns.delete(k);
    }
  }, 60000).unref();
}

/**
 * Handle user report submission.
 */
const handleReportUser = async ({ ws, parsedMessage, broadcastToAdmins }) => {
  if (!ws.userId || !ws.username) {
    ws.send(JSON.stringify({ type: 'report_error', message: 'You must be connected to submit a report.' }));
    return;
  }

  const now = Date.now();
  const lastReportTime = userReportCooldowns.get(ws.userId) || 0;
  if (now - lastReportTime < 30000) {
    const remainingSec = Math.ceil((30000 - (now - lastReportTime)) / 1000);
    ws.send(JSON.stringify({
      type: 'report_error',
      message: `Please wait ${remainingSec} seconds before submitting another report.`,
    }));
    return;
  }

  const reportedUserId = typeof parsedMessage.reportedUserId === 'string'
    ? parsedMessage.reportedUserId.trim()
    : '';
  const fallbackReportedUsername = typeof parsedMessage.reportedUsername === 'string'
    ? parsedMessage.reportedUsername.trim()
    : '';
  const messageId = typeof parsedMessage.messageId === 'string'
    ? parsedMessage.messageId.trim()
    : '';
  const reasonRaw = typeof parsedMessage.reason === 'string'
    ? parsedMessage.reason.replace(/\s+/g, ' ').trim()
    : '';

  if (!reportedUserId) {
    ws.send(JSON.stringify({ type: 'report_error', message: 'Missing reported user.' }));
    return;
  }

  if (reportedUserId === ws.userId) {
    ws.send(JSON.stringify({ type: 'report_error', message: 'You cannot report yourself.' }));
    return;
  }

  if (reasonRaw.length < MIN_REPORT_REASON_LENGTH) {
    ws.send(JSON.stringify({
      type: 'report_error',
      message: `Please enter at least ${MIN_REPORT_REASON_LENGTH} characters in the reason.`,
    }));
    return;
  }

  if (reasonRaw.length > MAX_REPORT_REASON_LENGTH) {
    ws.send(JSON.stringify({
      type: 'report_error',
      message: `Reason is too long. Maximum ${MAX_REPORT_REASON_LENGTH} characters.`,
    }));
    return;
  }

  userReportCooldowns.set(ws.userId, now);

  const roomId = ws.roomId || 'me';
  const { onlineUsers, loggedInUsers } = getRoomState(roomId);
  try {
    const [reportedUserDoc, reportedMessage] = await Promise.all([
      User.findOne({ roomId, userId: { $eq: reportedUserId } }).lean(),
      messageId ? Message.findOne({ roomId, id: { $eq: messageId } }).lean() : Promise.resolve(null),
    ]);

    const reportedUsername = reportedUserDoc?.username
      || onlineUsers.get(reportedUserId)?.username
      || fallbackReportedUsername
      || 'Unknown';

    const sessionInfo = loggedInUsers.get(reportedUserId);
    const sessionLoginTime = sessionInfo?.loginTime ? new Date(sessionInfo.loginTime) : null;
    const sessionDurationMs = sessionLoginTime
      ? Math.max(0, Date.now() - sessionLoginTime.getTime())
      : null;

    const joinHistory = Array.isArray(reportedUserDoc?.joinHistory)
      ? reportedUserDoc.joinHistory
          .map((d) => new Date(d))
          .filter((d) => !Number.isNaN(d.getTime()))
          .slice(-MAX_REPORTED_JOIN_HISTORY)
      : [];

    const report = await UserReport.create({
      roomId,
      reporterUserId: ws.userId,
      reporterUsername: ws.username,
      reporterIp: ws.clientIp || '',
      reporterUserAgent: ws.clientUa || '',
      reportedUserId,
      reportedUsername,
      reason: reasonRaw,
      messageId: reportedMessage?.id || messageId,
      messageType: reportedMessage?.type || parsedMessage.messageType || 'text',
      messageText: reportedMessage?.text || '',
      messageUrl: reportedMessage?.url || '',
      messageTimestamp: reportedMessage?.timestamp ? new Date(reportedMessage.timestamp) : null,
      reportedUserJoinedAt: reportedUserDoc?.createdAt ? new Date(reportedUserDoc.createdAt) : null,
      reportedUserLastSeen: reportedUserDoc?.lastSeen ? new Date(reportedUserDoc.lastSeen) : null,
      reportedUserCurrentSessionLoginTime: sessionLoginTime,
      reportedUserCurrentSessionDurationMs: sessionDurationMs,
      reportedUserIsOnline: onlineUsers.has(reportedUserId),
      reportedUserJoinHistory: joinHistory,
      reportedAt: new Date(),
    });

    const reportData = typeof report.toObject === 'function' ? report.toObject() : report;
    broadcastToAdmins(roomId, 'user_reported', reportData);
    broadcastToAdmins(roomId, 'activity', `User report: '${ws.username}' reported '${reportedUsername}'.`);

    ws.send(JSON.stringify({
      type: 'report_submitted',
      data: {
        reportId: reportData._id,
        reportedUserId,
        reportedUsername,
      },
    }));
  } catch (error) {
    logger.error('Failed to save user report:', { message: error.message, stack: error.stack });
    ws.send(JSON.stringify({
      type: 'report_error',
      message: 'Failed to submit report. Please try again.',
    }));
  }
};

/**
 * Handle pin_message action (admins only).
 */
const handlePinMessage = async ({ ws, parsedMessage, broadcastPinnedMessages, loadPinnedMessages, broadcastToAdmins }) => {
  logger.info(`Received pin_message:`, parsedMessage);
  if (!ws.isAdmin) {
    logger.warn('Pin failed: not an admin');
    return;
  }
  const { messageId, durationMs, replaceOldest } = parsedMessage;
  const roomId = ws.roomId || 'me';
  try {
    let targetMsgId = messageId;
    if (mongoose.Types.ObjectId.isValid(messageId)) {
      const MessageEvent = mongoose.model('MessageEvent');
      const event = await MessageEvent.findById(messageId).lean();
      if (event) {
        if (event.message?.id) targetMsgId = event.message.id;
        else if (event.message?._id) targetMsgId = event.message._id.toString();
        else if (event.messageId) targetMsgId = event.messageId;
      }
    }

    const msg = await Message.findOne({
      roomId,
      $or: [
        { id: targetMsgId },
        ...(mongoose.Types.ObjectId.isValid(targetMsgId) ? [{ _id: targetMsgId }] : [])
      ]
    }).lean();

    if (!msg) {
      logger.warn(`Pin failed: message not found in DB for ID ${targetMsgId} (original: ${messageId})`);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to pin: Message not found in database.' }));
      return;
    }

    if (msg.isDeleted || msg.vanished || msg.text === 'This message has been deleted by an admin.') {
      logger.warn(`Pin failed: cannot pin deleted message ${targetMsgId}`);
      ws.send(JSON.stringify({ type: 'pin_error', message: 'Cannot pin a deleted message.' }));
      return;
    }
    logger.info(`Pinning message found in DB: ${msg.id}`);

    const state = getRoomState(roomId);
    await loadPinnedMessages(roomId);

    if (state.pinnedMessages.length >= 4 && !replaceOldest) {
      ws.send(JSON.stringify({ type: 'pin_error', message: 'Maximum 4 pinned messages allowed.' }));
      return;
    }

    if (state.pinnedMessages.length >= 4 && replaceOldest) {
      const oldestMsg = state.pinnedMessages[0];
      await Message.updateOne({ roomId, id: oldestMsg.id }, { $set: { pinned: null } });
      await MessageEvent.updateMany(
        { roomId, $or: [{ messageId: oldestMsg.id }, { 'message.id': oldestMsg.id }] },
        { $set: { 'message.pinned': null } }
      );
      state.pinnedMessages.shift();
    }

    const pinnedAt = new Date();
    const expiresAt = durationMs ? new Date(pinnedAt.getTime() + durationMs) : null;
    const pinnedObj = { pinnedAt, expiresAt };

    await Message.updateOne({ roomId, id: msg.id }, { $set: { pinned: pinnedObj } });
    await MessageEvent.updateMany(
      { roomId, $or: [{ messageId }, { 'message.id': messageId }, { messageId: targetMsgId }, { 'message.id': targetMsgId }] },
      { $set: { 'message.pinned': pinnedObj } }
    );
    
    const updatedMsg = { ...msg, pinned: pinnedObj };
    const existingIndex = state.pinnedMessages.findIndex(p => p.id === msg.id);
    if (existingIndex >= 0) {
      state.pinnedMessages[existingIndex] = toClientMessage(updatedMsg);
    } else {
      state.pinnedMessages.push(toClientMessage(updatedMsg));
    }
    broadcastPinnedMessages(roomId);
    if (typeof broadcastToAdmins === 'function') {
      const preview = msg.text ? (msg.text.length > 50 ? msg.text.slice(0, 50) + '...' : msg.text) : (msg.type === 'audio' ? 'Voice note' : (msg.type || 'Media'));
      const expiryText = expiresAt ? ` (expires in ${Math.round(durationMs / 60000)}m)` : '';
      broadcastToAdmins(roomId, 'activity', `Admin pinned a message: "${preview}"${expiryText}.`);
    }
  } catch (error) {
    logger.error('Failed to pin message:', error);
  }
};

/**
 * Handle unpin_message action (admins only).
 */
const handleUnpinMessage = async ({ ws, parsedMessage, wss, broadcastToAdmins }) => {
  if (!ws.isAdmin) return;
  const { messageId } = parsedMessage;
  const roomId = ws.roomId || 'me';
  try {
    let targetMsgId = messageId;
    if (mongoose.Types.ObjectId.isValid(messageId)) {
      const MessageEvent = mongoose.model('MessageEvent');
      const event = await MessageEvent.findById(messageId).lean();
      if (event) {
        if (event.message?.id) targetMsgId = event.message.id;
        else if (event.message?._id) targetMsgId = event.message._id.toString();
        else if (event.messageId) targetMsgId = event.messageId;
      }
    }

    await unpinIfPinned(wss, roomId, [targetMsgId, messageId]);
    if (typeof broadcastToAdmins === 'function') {
      broadcastToAdmins(roomId, 'activity', `Admin unpinned a message.`);
    }
  } catch (error) {
    logger.error('Failed to unpin message:', error);
  }
};

/**
 * Handle delete_for_everyone.
 */
const handleDeleteForEveryone = async ({ ws, parsedMessage, wss, broadcastToAdmins }) => {
  const roomId = ws.roomId || 'me';
  const { messageId } = parsedMessage;

  if (!messageId || typeof messageId !== 'string') return;

  try {
    const originalMessage = await Message.findOne({ id: messageId, roomId }).lean();
    if (!originalMessage) return;

    // Idempotency guard: ignore duplicate delete requests for already-deleted messages
    if (originalMessage.isDeleted) {
      logger.info(`Message ${messageId} is already deleted for everyone. Skipping.`);
      return;
    }

    const roomState = getRoomState(roomId);
    const activeSession = roomState.loggedInUsers?.get(ws.userId);
    const isSessionValid = Boolean(activeSession && (!activeSession.sessionToken || (ws.sessionToken && timingSafeEqualStr(ws.sessionToken, activeSession.sessionToken))));

    const isAuthor = Boolean(isSessionValid && ws.userId && (originalMessage.userId === ws.userId || originalMessage.sender === ws.userId));
    if (!isAuthor && !ws.isAdmin) {
      logger.warn(`Unauthorized delete_for_everyone attempt: user ${ws.userId} tried to delete message ${messageId} in room ${roomId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'You are not authorized to delete this message.' }));
      return;
    }

    const existingDeleteEvent = await MessageEvent.findOne({
      roomId,
      type: { $in: ['delete_everyone', 'delete'] },
      $or: [{ messageId }, { 'message.id': messageId }]
    }).lean();
    if (existingDeleteEvent) {
      logger.info(`Delete event for message ${messageId} already exists in MessageEvent. Skipping duplicate.`);
      return;
    }

    const operatorUserId = ws.userId || (ws.isAdmin ? 'admin' : 'unknown');
    let operatorUsername = ws.username;
    if (!operatorUsername && ws.userId) {
      try {
        const user = await User.findOne({ roomId, userId: ws.userId }).lean();
        operatorUsername = user ? user.username : null;
      } catch (_) {}
    }
    operatorUsername = operatorUsername || (ws.isAdmin ? 'Admin' : 'Unknown');

    // Clean up media asset from Cloudinary if this was an uploaded file
    if (originalMessage && originalMessage.url) {
      let isCloudinary = false;
      try {
        const parsed = new URL(originalMessage.url);
        isCloudinary = parsed.hostname === 'res.cloudinary.com' || parsed.hostname.endsWith('.cloudinary.com');
      } catch {}
      if (isCloudinary) {
        const parsedAsset = parseCloudinaryAssetFromUrl(originalMessage.url);
        const targetPublicId = parsedAsset?.publicId || (typeof originalMessage.id === 'string' && originalMessage.id.includes('/') ? originalMessage.id : null);
        const targetResourceType = parsedAsset?.resourceType || (originalMessage.type === 'video' || originalMessage.type === 'audio' ? 'video' : (originalMessage.type === 'file' ? 'raw' : 'image'));
        if (targetPublicId) {
          try {
            await cloudinary.uploader.destroy(targetPublicId, { resource_type: targetResourceType, invalidate: true });
          } catch (cloudErr) {
            logger.warn('Cloudinary destroy error during delete_for_everyone:', { error: cloudErr.message });
          }
        }
      }
    }

    const updatedMessage = await Message.findOneAndUpdate(
      { id: messageId, roomId },
      {
        $set: {
          text: undefined,
          url: undefined,
          originalName: undefined,
          size: undefined,
          reactions: undefined,
          isDeleted: true,
          deletedBy: operatorUserId,
          pinned: null,
        },
        $unset: {
          replyingTo: ""
        }
      },
      { new: true }
    );

    const targetReplyIds = [messageId];
    if (originalMessage && originalMessage._id) {
      targetReplyIds.push(String(originalMessage._id));
    }
    await Message.updateMany(
      { roomId: String(roomId), 'replyingTo.id': { $in: targetReplyIds } },
      { $set: { 'replyingTo.isDeleted': true, 'replyingTo.deletedBy': operatorUserId } }
    ).catch(e => logger.error('Failed to update replyingTo on delete:', e));

    // Unpin immediately if this message was pinned
    await unpinIfPinned(wss, roomId, [messageId]);

    try {
      const event = new MessageEvent({
        roomId,
        type: 'delete_everyone',
        messageId,
        deletedContent: {
          text: originalMessage.text,
          url: originalMessage.url,
          originalName: originalMessage.originalName,
          type: originalMessage.type,
        },
        userId: operatorUserId,
        username: operatorUsername,
        timestamp: new Date(),
      });
      await event.save().catch(e => logger.error('Failed to save delete event:', e));

      await MessageEvent.updateMany(
        { roomId, $or: [{ messageId }, { 'message.id': messageId }] },
        {
          $set: {
            'message.isDeleted': true,
            'message.deletedBy': operatorUserId,
          }
        }
      ).catch(e => logger.error('Failed to update MessageEvent on delete:', e));

      broadcastToAdmins(roomId, 'history', event);
      broadcastToAdmins(roomId, 'activity', `Message (ID: ${messageId}) deleted by '${operatorUsername}'.`);
    } catch (e) {
      logger.error('Failed to handle delete event logging:', e);
    }

    const updateMsg = { type: 'update', data: toClientMessage(updatedMessage) };
    wss.clients.forEach(c => {
      if (c.readyState === WebSocket.OPEN && c.roomId === roomId) {
        c.send(JSON.stringify(updateMsg));
      }
    });

  } catch (err) {
    logger.error('Failed to delete message for everyone:', err);
  }
};

/**
 * Handle new text/media message creation.
 */
const handleNewMessage = async ({ ws, parsedMessage, wss, broadcastToAdmins, _broadcastOnlineUsers }) => {
  const roomId = ws.roomId || 'me';
  const roomState = getRoomState(roomId);
  const { typingUsers } = roomState;
  if (ws.userId && typingUsers.has(ws.userId)) {
    typingUsers.delete(ws.userId);
    if (roomState.typingTimeouts && roomState.typingTimeouts.has(ws.userId)) {
      clearTimeout(roomState.typingTimeouts.get(ws.userId));
      roomState.typingTimeouts.delete(ws.userId);
    }
    _broadcastOnlineUsers(roomId);
  }

  const activeSession = roomState.loggedInUsers?.get(ws.userId);
  if (activeSession && activeSession.sessionToken && (!ws.sessionToken || !timingSafeEqualStr(ws.sessionToken, activeSession.sessionToken))) {
    logger.warn(`Rejected new message from socket with invalid session token (userId: ${ws.userId})`);
    ws.send(JSON.stringify({ type: 'force_logout', message: 'Invalid session token. Please log in again.' }));
    ws.terminate();
    return;
  }

  if (parsedMessage?.type === 'client_diagnostic') {
    return;
  }

  // Sanitise media and reply URLs: strictly allow http, https, and internal /api/ endpoints
  const sanitisedMessage = { ...parsedMessage };
  if (typeof sanitisedMessage.url === 'string') {
    const trimmedUrl = sanitisedMessage.url.trim();
    if (trimmedUrl.startsWith('blob:') || !/^(https?:\/\/|\/api\/)/i.test(trimmedUrl)) {
      sanitisedMessage.url = undefined;
    }
  }

  // If replyingTo exists, resolve target from DB if needed
  if (sanitisedMessage.replyingTo && typeof sanitisedMessage.replyingTo === 'object') {
    const rawReplyTargetId = sanitisedMessage.replyingTo.id;
    if (typeof rawReplyTargetId === 'string' && rawReplyTargetId.trim()) {
      const replyTargetId = String(rawReplyTargetId).trim();
      try {
        const orConditions = [{ id: { $eq: replyTargetId } }, { clientTempId: { $eq: replyTargetId } }];
        if (mongoose.isValidObjectId(replyTargetId)) {
          orConditions.push({ _id: replyTargetId });
        }
        const targetDoc = await Message.findOne({
          roomId: String(roomId),
          $or: orConditions
        }).lean();
        if (targetDoc) {
          sanitisedMessage.replyingTo.id = targetDoc.id || String(targetDoc._id);
          sanitisedMessage.replyingTo.isDeleted = Boolean(targetDoc.isDeleted);
          if (targetDoc.deletedBy) sanitisedMessage.replyingTo.deletedBy = targetDoc.deletedBy;
          const isGroupReply = Boolean(sanitisedMessage.replyingTo.isGroup || sanitisedMessage.replyingTo.type === 'group');
          if (!isGroupReply) {
            if (targetDoc.text && !targetDoc.isDeleted) sanitisedMessage.replyingTo.text = targetDoc.text;
            if (targetDoc.url) sanitisedMessage.replyingTo.url = targetDoc.url;
            if (targetDoc.type) sanitisedMessage.replyingTo.type = targetDoc.type;
          }
          if (targetDoc.duration) sanitisedMessage.replyingTo.duration = targetDoc.duration;
        }
      } catch (lookupErr) {
        logger.warn('Failed to lookup replyingTo target in DB:', lookupErr);
      }
    }
    if (typeof sanitisedMessage.replyingTo.url === 'string') {
      const trimmedReplyUrl = sanitisedMessage.replyingTo.url.trim();
      if (trimmedReplyUrl.startsWith('blob:') || !/^(https?:\/\/|\/api\/)/i.test(trimmedReplyUrl)) {
        sanitisedMessage.replyingTo.url = undefined;
      }
    }
  }

  if (sanitisedMessage.type === 'video' || sanitisedMessage.type === 'image' || sanitisedMessage.type === 'file' || sanitisedMessage.type === 'audio') {
    logger.info(`[DIAG] Media message received: type=${sanitisedMessage.type} id=${sanitisedMessage.id} url=${sanitisedMessage.url ? sanitisedMessage.url.substring(0, 80) : 'MISSING'}`);
  }

  const rawText = typeof sanitisedMessage.text === 'string' ? sanitisedMessage.text : '';
  if (rawText.length > 5000) {
    ws.send(JSON.stringify({ type: 'error', message: 'Message text exceeds 5000 characters limit.' }));
    return;
  }

  const safeMessageId = typeof sanitisedMessage.id === 'string' && sanitisedMessage.id.trim()
    ? String(sanitisedMessage.id).trim().slice(0, 64)
    : Date.now().toString();

  const safeType = typeof sanitisedMessage.type === 'string' && ['text', 'image', 'video', 'audio', 'file', 'poll', 'gif'].includes(sanitisedMessage.type)
    ? sanitisedMessage.type
    : 'text';

  const verifiedUserId = String(ws.userId || '').trim();
  const verifiedUsername = String(ws.username || 'Anonymous').trim();

  let safePoll = null;
  if (safeType === 'poll' && sanitisedMessage.poll && typeof sanitisedMessage.poll === 'object') {
    const q = typeof sanitisedMessage.poll.question === 'string'
      ? sanitisedMessage.poll.question.trim().slice(0, 300)
      : 'Poll';
    const opts = Array.isArray(sanitisedMessage.poll.options)
      ? sanitisedMessage.poll.options.slice(0, 10).map((opt) => {
          if (typeof opt === 'string') {
            return { text: opt.trim().slice(0, 200), votes: [] };
          }
          if (opt && typeof opt === 'object') {
            return {
              text: typeof opt.text === 'string' ? opt.text.trim().slice(0, 200) : '',
              votes: Array.isArray(opt.votes)
                ? opt.votes
                    .filter((v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 64)
                    .map((v) => v.trim())
                    .slice(0, 100)
                : [],
            };
          }
          return { text: '', votes: [] };
        })
      : [];
    safePoll = { question: q, options: opts };
  }

  const safeWaveform = Array.isArray(sanitisedMessage.waveform)
    ? sanitisedMessage.waveform
        .slice(0, 100)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    : undefined;

  // Reject empty text messages that contain no text and no poll
  if (safeType === 'text' && !rawText.trim() && !safePoll) {
    logger.warn(`Rejected empty text message from user '${verifiedUsername}' (${verifiedUserId}) in room '${roomId}'`);
    return;
  }

  // Create message with explicitly whitelisted fields only to eliminate property injection
  const messageDoc = new Message({
    id: safeMessageId,
    roomId: String(roomId),
    sender: verifiedUserId,
    userId: verifiedUserId,
    username: verifiedUsername,
    type: safeType,
    text: rawText,
    url: typeof sanitisedMessage.url === 'string' && !sanitisedMessage.url.startsWith('blob:') ? sanitisedMessage.url : undefined,
    originalName: typeof sanitisedMessage.originalName === 'string' ? sanitisedMessage.originalName.slice(0, 255) : undefined,
    size: Number.isFinite(sanitisedMessage.size) ? Number(sanitisedMessage.size) : undefined,
    duration: Number.isFinite(sanitisedMessage.duration) ? Number(sanitisedMessage.duration) : undefined,
    waveform: safeWaveform,
    clientTempId: typeof sanitisedMessage.clientTempId === 'string' ? sanitisedMessage.clientTempId.slice(0, 64) : null,
    replyingTo: buildSafeReplyingTo(sanitisedMessage.replyingTo),
    poll: safePoll,
    reactions: toReactionMap(sanitisedMessage.reactions),
    // Administrative and state properties are strictly controlled server-side
    isDeleted: false,
    deletedBy: null,
    vanished: false,
    edited: false,
    pinned: null,
  });
  
  try {
    await messageDoc.save();
  } catch (err) {
    if (err.code === 11000) {
      logger.warn(`Duplicate message id ignored: ${messageDoc.id}`);
      return;
    }
    logger.error('Failed to save message:', err);
    return;
  }

  // Reconcile replies in database that quoted this message's clientTempId
  if (typeof sanitisedMessage.clientTempId === 'string' && sanitisedMessage.clientTempId.trim()) {
    const safeClientTempId = String(sanitisedMessage.clientTempId).trim();
    try {
      await Message.updateMany(
        { roomId: String(roomId), 'replyingTo.id': { $eq: safeClientTempId } },
        {
          $set: {
            'replyingTo.id': messageDoc.id,
            'replyingTo.url': messageDoc.url || '',
            'replyingTo.type': messageDoc.type,
            'replyingTo.duration': messageDoc.duration,
          }
        }
      );
    } catch (reconcileErr) {
      logger.error('Failed to reconcile clientTempId in replies:', reconcileErr);
    }
  }

  try {
    const user = await User.findOne({ roomId, userId: ws.userId }).lean();
    const username = user ? user.username : 'Unknown';
    const event = new MessageEvent({
      roomId,
      type: 'create',
      message: messageDoc.toObject(),
      userId: ws.userId,
      username,
      timestamp: new Date().toISOString(),
    });
    await event.save();
    broadcastToAdmins(roomId, 'history', event);

    let messageSummary;
    if (messageDoc.type === 'audio') {
      const dur = messageDoc.duration ? ` (${Math.round(messageDoc.duration)}s)` : '';
      messageSummary = `User '${username}' sent a voice message${dur}.`;
    } else if (messageDoc.type === 'image') {
      const name = messageDoc.originalName ? ` ('${messageDoc.originalName}')` : '';
      messageSummary = `User '${username}' shared an image${name}.`;
    } else if (messageDoc.type === 'video') {
      const name = messageDoc.originalName ? ` ('${messageDoc.originalName}')` : '';
      messageSummary = `User '${username}' shared a video${name}.`;
    } else if (messageDoc.type === 'file') {
      const name = messageDoc.originalName ? ` ('${messageDoc.originalName}')` : '';
      messageSummary = `User '${username}' shared a file${name}.`;
    } else if (messageDoc.type === 'poll') {
      messageSummary = `User '${username}' created a poll: "${messageDoc.poll?.question || 'Untitled'}".`;
    } else {
      const textPreview = messageDoc.text ? (messageDoc.text.length > 80 ? messageDoc.text.slice(0, 80) + '...' : messageDoc.text) : '[Message]';
      messageSummary = `New message from '${username}': "${textPreview}"`;
    }
    broadcastToAdmins(roomId, 'activity', messageSummary);
  } catch (e) {
    logger.error('Failed to handle message event logging:', e);
  }

  const broadcastPayload = JSON.stringify(toClientMessage(messageDoc));
  wss.clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(broadcastPayload);
    }
  });
};

module.exports = {
  handleReact,
  handleEdit,
  handleReportUser,
  handlePinMessage,
  handleUnpinMessage,
  handleDeleteForEveryone,
  handleNewMessage,
};
