'use strict';

const mongoose = require('mongoose');
const { WebSocket } = require('ws');
const logger = require('../logger');
const User = require('../models/user');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const { toClientMessage } = require('../middleware');
const { isTrustedMediaUrl, deleteCloudinaryAsset } = require('../security');
const { verifyActiveSessionToken } = require('../sessionService');
const { markRepliesAsDeleted } = require('../roomAccess');
const { normalizeReactionEmoji, filterValidReactions, toReactionMap } = require('../reactions');
const { getRoomState } = require('../state');
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
  if (typeof rt.id === 'string')        safe.id        = rt.id.slice(0, 255);
  if (typeof rt.text === 'string')      safe.text      = rt.text.slice(0, 500);
  if (typeof rt.url === 'string') {
    const trimmedUrl = rt.url.trim();
    if (/^(https?:\/\/|\/api\/)/i.test(trimmedUrl) && !trimmedUrl.startsWith('blob:')) {
      safe.url = trimmedUrl.slice(0, 2048);
    }
  }
  if (typeof rt.type === 'string')      safe.type      = rt.type.slice(0, 20);
  if (typeof rt.username === 'string')  safe.username  = rt.username.slice(0, 50);
  if (typeof rt.deletedBy === 'string') safe.deletedBy = rt.deletedBy.slice(0, 64);
  if (Number.isFinite(rt.duration))     safe.duration  = Number(rt.duration);
  if (Number.isFinite(rt.mediaCount))   safe.mediaCount = Math.max(1, Math.min(50, Math.floor(Number(rt.mediaCount))));
  // Boolean flags: coerce to actual booleans
  safe.isDeleted = Boolean(rt.isDeleted);
  if (safe.isDeleted || safe.text === 'This message has been deleted.' || safe.text === 'This message has been deleted by an admin.') {
    safe.isDeleted = true;
    delete safe.text;
    delete safe.url;
  }
  if (rt.isGroup !== undefined)         safe.isGroup   = Boolean(rt.isGroup);
  return safe;
};

/**
 * Validate the WebSocket's session token against the active room state, HMAC signature,
 * and persisted session token hashes.
 */
const isSocketSessionValid = async (ws, roomId) => {
  if (ws.isAdmin) return true;
  const userId = ws.userId;
  if (!userId || !ws.sessionToken || typeof ws.sessionToken !== 'string') return false;

  const result = await verifyActiveSessionToken({
    roomId,
    rawRoomId: roomId,
    userId,
    sessionToken: ws.sessionToken,
    roomState: getRoomState(roomId),
    ip: ws.clientIp || '',
    userAgent: ws.clientUa || '',
    fallbackUsername: ws.username || 'User',
    hydrateIfMissing: true,
    preserveTimestampSession: false,
  });
  return result.valid;
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

  if (!(await isSocketSessionValid(ws, roomId))) {
    logger.warn(`Rejected reaction from socket with invalid session token (userId: ${userId})`);
    ws.send(JSON.stringify({ type: 'force_logout', message: 'Invalid session token. Please log in again.' }));
    ws.terminate();
    return;
  }

  const roomState = getRoomState(roomId);

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

  const isSessionValid = await isSocketSessionValid(ws, roomId);

  const isAuthor = Boolean(isSessionValid && ws.userId && (msg.userId === ws.userId || msg.sender === ws.userId));
  if (!isAuthor && !ws.isAdmin) {
    logger.warn(`Unauthorized edit attempt: user ${ws.userId} tried to edit message ${messageId} in room ${roomId}`);
    ws.send(JSON.stringify({ type: 'error', message: 'You are not authorized to edit this message.' }));
    return;
  }

  const oldText = msg.text;
  if ((oldText || '').trim() === safeText) {
    // If text is unchanged or reverted back to original, perform no edit operation
    return;
  }

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

/**
 * Handle delete_for_everyone.
 */
const handleDeleteForEveryone = async ({ ws, parsedMessage, wss, broadcastToAdmins }) => {
  const roomId = ws.roomId || 'me';
  const { messageId } = parsedMessage;

  if (!messageId || typeof messageId !== 'string') return;

  const candidateIds = [messageId];
  if (typeof messageId === 'string' && messageId.length > 64) {
    candidateIds.push(messageId.slice(0, 64));
  }

  try {
    const originalMessage = await Message.findOne({ id: { $in: candidateIds }, roomId }).lean();
    if (!originalMessage) return;

    // Idempotency guard: ignore duplicate delete requests for already-deleted messages
    if (originalMessage.isDeleted) {
      logger.info(`Message ${messageId} is already deleted for everyone. Skipping.`);
      return;
    }

    const isSessionValid = await isSocketSessionValid(ws, roomId);

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
    await deleteCloudinaryAsset(originalMessage, { context: 'delete_for_everyone' });

    const updatedMessage = await Message.findOneAndUpdate(
      { id: originalMessage.id, roomId },
      {
        $set: {
          isDeleted: true,
          deletedBy: operatorUserId,
          pinned: null,
        },
        $unset: {
          text: "",
          url: "",
          originalName: "",
          size: "",
          reactions: "",
          replyingTo: "",
        }
      },
      { new: true }
    );

    const targetReplyIds = [...candidateIds];
    if (originalMessage && originalMessage._id) {
      targetReplyIds.push(String(originalMessage._id));
    }
    if (originalMessage && originalMessage.id && !targetReplyIds.includes(originalMessage.id)) {
      targetReplyIds.push(originalMessage.id);
    }
    await markRepliesAsDeleted(roomId, targetReplyIds, operatorUserId, 'delete');

    // Unpin immediately if this message was pinned
    await unpinIfPinned(wss, roomId, candidateIds);

    try {
      const event = new MessageEvent({
        roomId,
        type: 'delete_everyone',
        messageId: originalMessage.id,
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
        {
          roomId,
          $or: [
            { messageId: { $in: candidateIds } },
            { 'message.id': { $in: candidateIds } },
            { 'file.publicId': { $in: candidateIds } },
          ]
        },
        {
          $set: {
            'message.isDeleted': true,
            'message.deletedBy': operatorUserId,
            isDeleted: true,
            deletedBy: operatorUserId,
          }
        }
      ).catch(e => logger.error('Failed to update MessageEvent on delete:', e));

      broadcastToAdmins(roomId, 'history', event);
      broadcastToAdmins(roomId, 'activity', `Message (ID: ${messageId}) deleted by '${operatorUsername}'.`);
    } catch (e) {
      logger.error('Failed to handle delete event logging:', e);
    }

    if (!updatedMessage) {
      logger.warn(`Delete-for-everyone: message ${messageId} not found upon update in room ${roomId}. Skipping broadcast.`);
      return;
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

  // Rate limiter: prevent message flooding (max 30 messages per 5s window per socket)
  const now = Date.now();
  if (!ws.messageRateTimestamps) {
    ws.messageRateTimestamps = [];
  }
  ws.messageRateTimestamps = ws.messageRateTimestamps.filter((t) => now - t < 5000);
  if (ws.messageRateTimestamps.length >= 30) {
    logger.warn(`Message rate limit exceeded for user ${ws.userId || 'unknown'} in room ${roomId}`);
    ws.send(JSON.stringify({ type: 'error', message: 'You are sending messages too quickly. Please slow down.' }));
    return;
  }
  ws.messageRateTimestamps.push(now);

  if (!(await isSocketSessionValid(ws, roomId))) {
    logger.warn(`Rejected new message from socket with invalid session token (userId: ${ws.userId})`);
    ws.send(JSON.stringify({ type: 'force_logout', message: 'Invalid session token. Please log in again.' }));
    ws.terminate();
    return;
  }

  if (parsedMessage?.type === 'client_diagnostic') {
    return;
  }

  // Sanitise media and reply URLs: strictly allow trusted CDN/GIF hosts (res.cloudinary.com, *.giphy.com)
  const sanitisedMessage = { ...parsedMessage };
  if (typeof sanitisedMessage.url === 'string') {
    const trimmedUrl = sanitisedMessage.url.trim();
    if (!isTrustedMediaUrl(trimmedUrl)) {
      sanitisedMessage.url = undefined;
    } else {
      sanitisedMessage.url = trimmedUrl;
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
            if (targetDoc.url && !targetDoc.isDeleted) sanitisedMessage.replyingTo.url = targetDoc.url;
            if (targetDoc.type) sanitisedMessage.replyingTo.type = targetDoc.type;
          }
          if (targetDoc.isDeleted) {
            sanitisedMessage.replyingTo.isDeleted = true;
            delete sanitisedMessage.replyingTo.text;
            delete sanitisedMessage.replyingTo.url;
          }
          if (targetDoc.duration) sanitisedMessage.replyingTo.duration = targetDoc.duration;
        }
      } catch (lookupErr) {
        logger.warn('Failed to lookup replyingTo target in DB:', lookupErr);
      }
    }
    if (typeof sanitisedMessage.replyingTo.url === 'string') {
      const trimmedReplyUrl = sanitisedMessage.replyingTo.url.trim();
      if (!isTrustedMediaUrl(trimmedReplyUrl)) {
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
    ? String(sanitisedMessage.id).trim().slice(0, 255)
    : Date.now().toString();

  const safeType = typeof sanitisedMessage.type === 'string' && ['text', 'image', 'video', 'audio', 'file', 'gif'].includes(sanitisedMessage.type)
    ? sanitisedMessage.type
    : 'text';

  const verifiedUserId = String(ws.userId || '').trim();
  const verifiedUsername = String(ws.username || 'Anonymous').trim();

  const safeWaveform = Array.isArray(sanitisedMessage.waveform)
    ? sanitisedMessage.waveform
        .slice(0, 100)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    : undefined;

  // Reject empty text messages
  if (safeType === 'text' && !rawText.trim()) {
    logger.warn(`Rejected empty text message from user '${verifiedUsername}' (${verifiedUserId}) in room '${roomId}'`);
    return;
  }

  // Reject media messages that lack a valid storage/proxy URL
  const hasValidMediaUrl = typeof sanitisedMessage.url === 'string' && sanitisedMessage.url.trim().length > 0 && !sanitisedMessage.url.startsWith('blob:');
  if (['image', 'video', 'audio', 'file'].includes(safeType) && !hasValidMediaUrl) {
    logger.warn(`Rejected media message (${safeType}) without valid URL from user '${verifiedUsername}' in room '${roomId}'`);
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
    reactions: new Map(),
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

  // Reconcile replies in database that quoted this user's own in-flight clientTempId
  if (typeof sanitisedMessage.clientTempId === 'string' && sanitisedMessage.clientTempId.trim()) {
    const safeClientTempId = String(sanitisedMessage.clientTempId).trim();
    if (safeClientTempId !== messageDoc.id) {
      try {
        const existingTarget = await Message.exists({ roomId: String(roomId), id: { $eq: safeClientTempId } });
        if (!existingTarget) {
          await Message.updateMany(
            { roomId: String(roomId), userId: verifiedUserId, 'replyingTo.id': { $eq: safeClientTempId } },
            {
              $set: {
                'replyingTo.id': messageDoc.id,
                'replyingTo.url': messageDoc.url || '',
                'replyingTo.type': messageDoc.type,
                'replyingTo.duration': messageDoc.duration,
              }
            }
          );
        }
      } catch (reconcileErr) {
        logger.error('Failed to reconcile clientTempId in replies:', reconcileErr);
      }
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
  handleDeleteForEveryone,
  handleNewMessage,
};
