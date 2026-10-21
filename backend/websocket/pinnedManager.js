'use strict';

const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const logger = require('../logger');
const { getRoomState, roomStates } = require('../state');
const { toClientMessage } = require('../middleware');

/**
 * Broadcast current pinned messages to all clients in a room.
 */
const broadcastPinnedMessages = (wss, roomId) => {
  const state = getRoomState(roomId);
  const msg = JSON.stringify({
    type: 'pinned_messages_update',
    data: state.pinnedMessages
  });
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.roomId === roomId) {
      client.send(msg);
    }
  });
};

/**
 * Load pinned messages from DB into room state if not already loaded,
 * expiring any whose duration has elapsed or cleaning up any that were deleted/hidden.
 */
const loadPinnedMessages = async (roomId) => {
  const state = getRoomState(roomId);
  if (state.pinnedMessagesLoaded) return;
  try {
    const now = new Date();
    const hiddenBefore = state.frontendHiddenBefore ? new Date(state.frontendHiddenBefore) : null;
    const pins = await Message.find({
      roomId,
      'pinned.pinnedAt': { $ne: null }
    }).sort({ 'pinned.pinnedAt': 1 }).lean();
    
    const validPins = [];
    for (const pin of pins) {
      const isExpired = pin.pinned.expiresAt && new Date(pin.pinned.expiresAt) <= now;
      const isDeletedOrVanished = pin.isDeleted === true || pin.vanished === true || pin.text === 'This message has been deleted by an admin.';
      const isHidden = hiddenBefore && pin.createdAt && new Date(pin.createdAt) < hiddenBefore;

      if (isExpired || isDeletedOrVanished || isHidden) {
        await Message.updateOne({ id: pin.id }, { $set: { pinned: null } });
        await MessageEvent.updateMany({ roomId, $or: [{ messageId: pin.id }, { 'message.id': pin.id }] }, { $set: { 'message.pinned': null } });
      } else {
        validPins.push(toClientMessage(pin));
      }
    }
    state.pinnedMessages = validPins;
    state.pinnedMessagesLoaded = true;
  } catch (err) {
    logger.error('Failed to load pinned messages:', err);
  }
};

/**
 * Start 30-second interval checking for expired or deleted pinned messages across all rooms.
 */
const startPinExpirationWatcher = (wss) => {
  return setInterval(async () => {
    const now = new Date();
    for (const [roomId, state] of roomStates.entries()) {
      if (!state.pinnedMessagesLoaded || state.pinnedMessages.length === 0) continue;
      let changed = false;
      const updatedPins = [];
      const hiddenBefore = state.frontendHiddenBefore ? new Date(state.frontendHiddenBefore) : null;

      for (const msg of state.pinnedMessages) {
        const isExpired = msg.pinned && msg.pinned.expiresAt && new Date(msg.pinned.expiresAt) <= now;
        const isDeletedOrVanished = msg.isDeleted === true || msg.vanished === true || msg.text === 'This message has been deleted by an admin.';
        const isHidden = hiddenBefore && msg.createdAt && new Date(msg.createdAt) < hiddenBefore;

        if (isExpired || isDeletedOrVanished || isHidden) {
          changed = true;
          try {
            await Message.updateOne({ id: msg.id }, { $set: { pinned: null } });
            await MessageEvent.updateMany({ roomId, $or: [{ messageId: msg.id }, { 'message.id': msg.id }] }, { $set: { 'message.pinned': null } });
          } catch (e) {
            logger.error('Failed to unpin expired/deleted message:', e);
          }
        } else {
          updatedPins.push(msg);
        }
      }
      if (changed) {
        state.pinnedMessages = updatedPins;
        broadcastPinnedMessages(wss, roomId);
      }
    }
  }, 30000);
};

/**
 * Unpin messages if they are currently pinned (both in DB and room memory)
 * and broadcast the updated pinned list to clients in the room.
 *
 * @param {import('ws').WebSocketServer} wss
 * @param {string} roomId
 * @param {string|string[]} messageIds
 * @returns {Promise<boolean>}
 */
const unpinIfPinned = async (wss, roomId, messageIds) => {
  if (!roomId || !messageIds) return false;
  const ids = (Array.isArray(messageIds) ? messageIds : [messageIds]).filter(Boolean).map(String);
  if (ids.length === 0) return false;

  const objectIds = ids.filter(id => /^[0-9a-fA-F]{24}$/.test(id));

  try {
    await Message.updateMany(
      {
        roomId,
        $or: [
          { id: { $in: ids } },
          ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : []),
        ],
      },
      { $set: { pinned: null } }
    );

    await MessageEvent.updateMany(
      {
        roomId,
        $or: [
          { messageId: { $in: ids } },
          { 'message.id': { $in: ids } },
          ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }, { 'message._id': { $in: objectIds } }] : []),
        ],
      },
      { $set: { 'message.pinned': null } }
    );

    const state = getRoomState(roomId);
    const idSet = new Set(ids);
    const prevCount = state.pinnedMessages.length;
    state.pinnedMessages = state.pinnedMessages.filter(m => {
      const mId = m.id ? String(m.id) : '';
      const m_Id = m._id ? String(m._id) : '';
      return !idSet.has(mId) && !idSet.has(m_Id);
    });

    if (state.pinnedMessages.length !== prevCount) {
      if (wss) {
        broadcastPinnedMessages(wss, roomId);
      }
      return true;
    }
    return false;
  } catch (err) {
    logger.error('Failed to unpin messages:', err);
    return false;
  }
};

/**
 * Clear all pinned messages in a room (both in DB and memory)
 * and broadcast the update.
 */
const clearAllPins = async (wss, roomId) => {
  if (!roomId) return;
  try {
    await Message.updateMany({ roomId, 'pinned.pinnedAt': { $ne: null } }, { $set: { pinned: null } });
    await MessageEvent.updateMany({ roomId, 'message.pinned.pinnedAt': { $ne: null } }, { $set: { 'message.pinned': null } });
    const state = getRoomState(roomId);
    state.pinnedMessages = [];
    if (wss) {
      broadcastPinnedMessages(wss, roomId);
    }
  } catch (err) {
    logger.error('Failed to clear all pins in room:', err);
  }
};

module.exports = {
  broadcastPinnedMessages,
  loadPinnedMessages,
  startPinExpirationWatcher,
  unpinIfPinned,
  clearAllPins,
};
