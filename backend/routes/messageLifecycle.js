'use strict';

// --- Message Deletion, Clear, and Hide-Frontend Lifecycle Routes ---

const express = require('express');
const mongoose = require('mongoose');
const { WebSocket } = require('ws');
const logger = require('../logger');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const ChatState = require('../models/chatState');
const { getRoomState, getCachedRoom } = require('../state');
const { unpinIfPinned, clearAllPins } = require('../websocket/pinnedManager');
const { adminLimiter, adminAuth, adminSecretAuth } = require('../middleware');
const { deleteCloudinaryAsset, batchDeleteCloudinaryAssets } = require('../security');
const { markRepliesAsDeleted } = require('../roomAccess');

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins, broadcast } = broadcasts;
  const router = express.Router();

  // --- Delete Message (Requires Admin Authentication) ---
  router.delete('/api/delete/:id', adminLimiter, adminAuth, async (req, res) => {
    try {
      const messageId = req.params.id;
      const roomId = req.roomId || req.headers['x-room-id'] || 'me';
      if (!messageId) return res.status(400).json({ error: 'No message ID provided.' });
      logger.info(`Delete request for message ID: ${messageId} in room ${roomId}`);

      const isObjectId = mongoose.Types.ObjectId.isValid(messageId);
      const queryFilter = {
        roomId,
        $or: [
          { id: messageId },
          ...(isObjectId ? [{ _id: messageId }] : []),
        ],
      };

      const messageToDelete = await Message.findOne(queryFilter);

      if (messageToDelete) {
        await deleteCloudinaryAsset(messageToDelete, { context: 'message delete' });
      }

      await Message.deleteOne(queryFilter);
      const canonicalId = messageToDelete?.id || messageId;
      const targetReplyIds = Array.from(new Set([
        messageId,
        canonicalId,
        ...(messageToDelete?._id ? [String(messageToDelete._id)] : []),
      ])).filter(Boolean);

      await markRepliesAsDeleted(roomId, targetReplyIds, 'admin', 'media message delete');
      await unpinIfPinned(wss, roomId, targetReplyIds);

      // Synchronize MessageEvent so admin audit history reflects message deletion
      const eventFilter = [
        { messageId: { $in: targetReplyIds } },
        { 'message.id': { $in: targetReplyIds } },
        ...(isObjectId ? [{ 'message._id': messageId }] : []),
      ];
      await MessageEvent.updateMany(
        { roomId, $or: eventFilter },
        { $set: { 'message.isDeleted': true, 'message.deletedBy': 'admin' } }
      ).catch((e) => logger.error('Failed to update MessageEvent on delete:', e));

      try {
        const deleteEvent = new MessageEvent({
          roomId,
          type: 'delete',
          messageId: canonicalId,
          deletedContent: messageToDelete ? {
            text: messageToDelete.text,
            url: messageToDelete.url,
            originalName: messageToDelete.originalName,
            type: messageToDelete.type,
          } : undefined,
          userId: 'admin',
          username: 'Admin',
          timestamp: new Date(),
        });
        await deleteEvent.save().catch(() => {});
        broadcastToAdmins(roomId, 'history', deleteEvent);
        broadcastToAdmins(roomId, 'activity', `Message (ID: ${canonicalId}) deleted by Admin.`);
      } catch (_) {}

      const deleteMessage = { type: 'delete', id: canonicalId };
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
          client.send(JSON.stringify(deleteMessage));
          if (canonicalId !== messageId) {
            client.send(JSON.stringify({ type: 'delete', id: messageId }));
          }
        }
      });

      res.status(200).json({ success: true, message: 'Message deleted.' });
    } catch (error) {
      logger.error('Delete error:', { message: error.message, stack: error.stack });
      res.status(500).json({ error: 'Failed to delete file.' });
    }
  });

  // --- Permanent Clear (admin secret) ---
  router.delete('/api/messages/all', adminLimiter, adminSecretAuth, async (req, res) => {
    const rawRoomId = req.headers['x-room-id'];
    let roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
    const lowerRoomId = roomId.toLowerCase();
    if (lowerRoomId === 'me' || lowerRoomId === 'global') {
      roomId = lowerRoomId;
    }
    let roomIdentifiers = [roomId];

    if (roomId !== 'me' && roomId !== 'global') {
      try {
        const roomDoc = await getCachedRoom(roomId);
        if (roomDoc) {
          roomId = roomDoc.id;
          roomIdentifiers = Array.from(new Set([roomDoc.id, roomDoc.alias, rawRoomId.trim()].filter(Boolean)));
        }
      } catch (_) {}
    }

    try {
      const messagesWithMedia = await Message.find({
        roomId: { $in: roomIdentifiers },
        url: { $exists: true, $ne: null },
      }).select('id url type').lean();

      if (messagesWithMedia && messagesWithMedia.length > 0) {
        batchDeleteCloudinaryAssets(messagesWithMedia).catch((e) => {
          logger.warn('Failed to clean up Cloudinary assets on chat clear:', e.message);
        });
      }

      await Promise.all([
        Message.deleteMany({ roomId: { $in: roomIdentifiers } }),
        MessageEvent.deleteMany({ roomId: { $in: roomIdentifiers } }),
      ]);
      await clearAllPins(wss, roomId);

      broadcast(roomId, { type: 'chat_cleared' });

      logger.info(`All messages and events in room ${roomId} have been permanently deleted by an admin.`);
      broadcastToAdmins(roomId, 'activity', 'All messages and events have been permanently deleted.');

      res.status(200).json({ message: 'All messages and events have been permanently deleted.' });
    } catch (error) {
      logger.error('Error clearing all messages:', { message: error.message, stack: error.stack });
      res.status(500).json({ error: 'Failed to clear all messages.' });
    }
  });

  // --- Hide All From Frontend (admin secret) ---
  router.post('/api/messages/hide-all-frontend', adminLimiter, adminSecretAuth, async (req, res) => {
    const rawRoomId = req.headers['x-room-id'];
    let roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
    const lowerRoomId = roomId.toLowerCase();
    if (lowerRoomId === 'me' || lowerRoomId === 'global') {
      roomId = lowerRoomId;
    }

    if (roomId !== 'me' && roomId !== 'global') {
      try {
        const roomDoc = await getCachedRoom(roomId);
        if (roomDoc) roomId = roomDoc.id;
      } catch (_) {}
    }

    try {
      const hiddenBefore = new Date();

      await ChatState.findOneAndUpdate(
        { roomId },
        { $set: { roomId, frontendHiddenBefore: hiddenBefore } },
        { upsert: true, setDefaultsOnInsert: true }
      );

      getRoomState(roomId).frontendHiddenBefore = hiddenBefore;
      await clearAllPins(wss, roomId);

      broadcast(roomId, { type: 'chat_hidden_for_everyone', hiddenBefore: hiddenBefore.toISOString() });

      logger.info(`All existing chats in room ${roomId} have been hidden from frontend for everyone (DB preserved).`);
      broadcastToAdmins(roomId, 'activity', 'All existing chats have been hidden from frontend for everyone.');

      res.status(200).json({
        message: 'All existing chats are now hidden from frontend for everyone.',
        hiddenBefore: hiddenBefore.toISOString(),
      });
    } catch (error) {
      logger.error('Error hiding chats from frontend:', { message: error.message, stack: error.stack });
      res.status(500).json({ error: 'Failed to hide chats from frontend.' });
    }
  });

  return router;
};
