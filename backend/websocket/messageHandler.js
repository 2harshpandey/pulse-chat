'use strict';

const mongoose = require('mongoose');
const { WebSocket } = require('ws');
const logger = require('../logger');
const User = require('../models/user');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const UserReport = require('../models/userReport');
const { toClientMessage } = require('../middleware');
const { normalizeReactionEmoji, filterValidReactions, toReactionMap } = require('../reactions');
const {
  getRoomState,
  MIN_REPORT_REASON_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_REPORTED_JOIN_HISTORY,
} = require('../state');
const { unpinIfPinned } = require('./pinnedManager');

/**
 * Handle reaction addition/toggle.
 */
const handleReact = async ({ ws, parsedMessage, wss }) => {
  const { messageId, userId, roomId = 'me' } = parsedMessage;
  const emoji = normalizeReactionEmoji(parsedMessage.emoji);
  if (!emoji || typeof messageId !== 'string' || typeof userId !== 'string') {
    logger.warn('Rejected invalid reaction payload', { messageId, userId, emoji: parsedMessage.emoji });
    return;
  }
  const { onlineUsers } = getRoomState(roomId);
  const username = onlineUsers.get(userId)?.username || 'Unknown';

  const messageDoc = await Message.findOne({ id: messageId });

  if (messageDoc) {
    messageDoc.reactions = toReactionMap(messageDoc.reactions);

    let previousEmoji = null;

    for (const [e, users] of messageDoc.reactions.entries()) {
      if (Array.isArray(users)) {
        const userIndex = users.findIndex(u => u.userId === userId);
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
      existing.push({ userId, username });
      messageDoc.reactions.set(emoji, existing);
    }

    messageDoc.markModified('reactions');
    await messageDoc.save();

    const reactionsPlain = filterValidReactions(messageDoc.reactions);

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'update', data: { id: messageId, reactions: reactionsPlain } }));
      }
    });
  }
};

/**
 * Handle message edit.
 */
const handleEdit = async ({ ws, parsedMessage, wss, broadcastToAdmins }) => {
  const { messageId, newText, roomId = 'me' } = parsedMessage;

  const msg = await Message.findOne({ id: messageId });
  if (!msg) return;
  const oldText = msg.text;

  await Message.updateOne({ id: messageId }, { $set: { text: newText, edited: true } });

  const updatedMsgForBroadcast = {
    ...msg.toObject(),
    text: newText,
    edited: true,
  };

  User.findOne({ roomId, userId: ws.userId }).then(user => {
    const username = user ? user.username : 'Unknown';
    const event = new MessageEvent({
      roomId,
      type: 'edit',
      messageId,
      oldText,
      newText,
      userId: ws.userId,
      username,
      timestamp: new Date().toISOString(),
    });
    event.save().catch(e => logger.error('Failed to save edit event:', e));
    broadcastToAdmins(roomId, 'history', event);
    broadcastToAdmins(roomId, 'activity', `Message (ID: ${messageId}) edited by '${username}'. New text: "${newText}"`);
  }).catch(e => logger.error('Failed to find user for edit event:', e));

  const updateMsg = { type: 'update', data: updatedMsgForBroadcast };
  wss.clients.forEach(c => { 
    if (c.readyState === WebSocket.OPEN && c.roomId === roomId) {
      c.send(JSON.stringify(updateMsg)); 
    }
  });
};

/**
 * Handle user report submission.
 */
const handleReportUser = async ({ ws, parsedMessage, broadcastToAdmins }) => {
  if (!ws.userId || !ws.username) {
    ws.send(JSON.stringify({ type: 'report_error', message: 'You must be connected to submit a report.' }));
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

  const roomId = ws.roomId || 'me';
  const { onlineUsers, loggedInUsers } = getRoomState(roomId);
  try {
    const [reportedUserDoc, reportedMessage] = await Promise.all([
      User.findOne({ roomId, userId: { $eq: reportedUserId } }).lean(),
      messageId ? Message.findOne({ id: { $eq: messageId } }).lean() : Promise.resolve(null),
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
const handlePinMessage = async ({ ws, parsedMessage, broadcastPinnedMessages, loadPinnedMessages }) => {
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
      await Message.updateOne({ id: oldestMsg.id }, { $set: { pinned: null } });
      await MessageEvent.updateMany(
        { roomId, $or: [{ messageId: oldestMsg.id }, { 'message.id': oldestMsg.id }] },
        { $set: { 'message.pinned': null } }
      );
      state.pinnedMessages.shift();
    }

    const pinnedAt = new Date();
    const expiresAt = durationMs ? new Date(pinnedAt.getTime() + durationMs) : null;
    const pinnedObj = { pinnedAt, expiresAt };

    await Message.updateOne({ id: messageId }, { $set: { pinned: pinnedObj } });
    await MessageEvent.updateMany(
      { roomId, $or: [{ messageId }, { 'message.id': messageId }, { messageId: targetMsgId }, { 'message.id': targetMsgId }] },
      { $set: { 'message.pinned': pinnedObj } }
    );
    
    const updatedMsg = { ...msg, pinned: pinnedObj };
    state.pinnedMessages.push(toClientMessage(updatedMsg));
    broadcastPinnedMessages(roomId);
  } catch (error) {
    logger.error('Failed to pin message:', error);
  }
};

/**
 * Handle unpin_message action (admins only).
 */
const handleUnpinMessage = async ({ ws, parsedMessage, wss, broadcastPinnedMessages }) => {
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
  } catch (error) {
    logger.error('Failed to unpin message:', error);
  }
};

/**
 * Handle delete_for_everyone.
 */
const handleDeleteForEveryone = async ({ ws, parsedMessage, wss, broadcastToAdmins }) => {
  const roomId = parsedMessage.roomId || ws.roomId || 'me';
  const { messageId } = parsedMessage;

  try {
    const originalMessage = await Message.findOne({ id: messageId }).lean();
    if (!originalMessage) return;

    const updatedMessage = await Message.findOneAndUpdate(
      { id: messageId },
      {
        $set: {
          text: undefined,
          url: undefined,
          originalName: undefined,
          size: undefined,
          reactions: undefined,
          isDeleted: true,
          deletedBy: ws.userId,
          pinned: null,
        },
        $unset: {
          replyingTo: ""
        }
      },
      { new: true }
    );

    // Unpin immediately if this message was pinned
    await unpinIfPinned(wss, roomId, [messageId]);

    User.findOne({ roomId, userId: ws.userId }).then(async (user) => {
      const username = user ? user.username : 'Unknown';
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
        userId: ws.userId,
        username,
        timestamp: new Date(),
      });
      await event.save().catch(e => logger.error('Failed to save delete event:', e));

      await MessageEvent.updateMany(
        { roomId, $or: [{ messageId }, { 'message.id': messageId }] },
        {
          $set: {
            'message.isDeleted': true,
            'message.deletedBy': ws.userId,
          }
        }
      ).catch(e => logger.error('Failed to update MessageEvent on delete:', e));

      broadcastToAdmins(roomId, 'history', event);
      broadcastToAdmins(roomId, 'activity', `Message (ID: ${messageId}) deleted by '${username}'.`);
    }).catch(e => logger.error('Failed to find user for delete event:', e));

    const updateMsg = { type: 'update', data: updatedMessage };
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
  const { typingUsers } = getRoomState(roomId);
  if (ws.userId && typingUsers.has(ws.userId)) {
    typingUsers.delete(ws.userId);
    _broadcastOnlineUsers(roomId);
  }

  // Sanitise blob: URLs
  const sanitisedMessage = { ...parsedMessage };
  if (typeof sanitisedMessage.url === 'string' && sanitisedMessage.url.startsWith('blob:')) {
    logger.warn(`[DIAG] Stripped blob URL for message type=${sanitisedMessage.type} id=${sanitisedMessage.id}`);
    sanitisedMessage.url = undefined;
  }

  if (sanitisedMessage.type === 'video' || sanitisedMessage.type === 'image' || sanitisedMessage.type === 'file') {
    logger.info(`[DIAG] Media message received: type=${sanitisedMessage.type} id=${sanitisedMessage.id} url=${sanitisedMessage.url ? sanitisedMessage.url.substring(0, 80) : 'MISSING'}`);
  }

  const messageDoc = new Message({
    ...sanitisedMessage,
    roomId,
    reactions: toReactionMap(sanitisedMessage.reactions),
    id: sanitisedMessage.id || Date.now().toString(),
    sender: ws.userId
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

  User.findOne({ roomId, userId: ws.userId }).then(user => {
    const username = user ? user.username : 'Unknown';
    const event = new MessageEvent({
      roomId,
      type: 'create',
      message: messageDoc.toObject(),
      userId: ws.userId,
      username,
      timestamp: new Date().toISOString(),
    });
    event.save().catch(e => logger.error('Failed to save message create event:', e));
    broadcastToAdmins(roomId, 'history', event);
    broadcastToAdmins(roomId, 'activity', `New message from '${username}': "${messageDoc.text || '[Media]'}"`);
  }).catch(e => logger.error('Failed to find user for message event:', e));

  wss.clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(JSON.stringify(messageDoc));
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
