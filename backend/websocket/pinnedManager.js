'use strict';

const Message = require('../models/message');
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
 * expiring any whose duration has elapsed.
 */
const loadPinnedMessages = async (roomId) => {
  const state = getRoomState(roomId);
  if (state.pinnedMessagesLoaded) return;
  try {
    const now = new Date();
    const pins = await Message.find({
      roomId,
      'pinned.pinnedAt': { $ne: null }
    }).sort({ 'pinned.pinnedAt': 1 }).lean();
    
    const validPins = [];
    for (const pin of pins) {
      if (pin.pinned.expiresAt && new Date(pin.pinned.expiresAt) <= now) {
        await Message.updateOne({ id: pin.id }, { $set: { pinned: null } });
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
 * Start 30-second interval checking for expired pinned messages across all rooms.
 */
const startPinExpirationWatcher = (wss) => {
  return setInterval(async () => {
    const now = new Date();
    for (const [roomId, state] of roomStates.entries()) {
      if (!state.pinnedMessagesLoaded || state.pinnedMessages.length === 0) continue;
      let expired = false;
      const updatedPins = [];
      for (const msg of state.pinnedMessages) {
        if (msg.pinned && msg.pinned.expiresAt && new Date(msg.pinned.expiresAt) <= now) {
          expired = true;
          try {
            await Message.updateOne({ id: msg.id }, { $set: { pinned: null } });
          } catch (e) {
            logger.error('Failed to unpin expired message:', e);
          }
        } else {
          updatedPins.push(msg);
        }
      }
      if (expired) {
        state.pinnedMessages = updatedPins;
        broadcastPinnedMessages(wss, roomId);
      }
    }
  }, 30000);
};

module.exports = {
  broadcastPinnedMessages,
  loadPinnedMessages,
  startPinExpirationWatcher,
};
