const express = require('express');
const logger = require('../../logger');
const Room = require('../../models/room');
const Message = require('../../models/message');
const MessageEvent = require('../../models/messageEvent');
const AuditLog = require('../../models/auditLog');
const LoginLockdown = require('../../models/loginLockdown');
const BlockedUser = require('../../models/blockedUser');
const UserReport = require('../../models/userReport');
const ChatState = require('../../models/chatState');
const User = require('../../models/user');
const TempLink = require('../../models/tempLink');
const { parseCloudinaryAssetFromUrl, batchDeleteCloudinaryAssets } = require('../../security');
const { deleteRoomState } = require('../../state');
const { adminLimiter, adminAuth, extractIp } = require('../../middleware');

const cleanupRoomMediaAssets = async (roomIdentifiers) => {
  try {
    const messagesWithMedia = await Message.find({
      roomId: { $in: roomIdentifiers },
      url: { $exists: true, $ne: null }
    }).select('id url type').lean();

    if (messagesWithMedia && messagesWithMedia.length > 0) {
      await batchDeleteCloudinaryAssets(messagesWithMedia);
    }
  } catch (err) {
    logger.error('Error during room media asset cleanup:', err);
  }
};

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins } = broadcasts;
  const router = express.Router();

  // --- Global Super Admin Room Management ---
  router.get('/api/admin/rooms', adminLimiter, adminAuth, async (req, res) => {
    try {
      if (!req.isSuperAdmin || (req.roomId !== 'me' && req.roomId !== 'global')) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }

      const rooms = await Room.find({}).sort({ createdAt: -1 }).limit(1000).lean();

      // Strip passwords before sending to frontend
      const safeRooms = rooms.map((r) => {
        const { joinPassword, adminPassword, ...safeRoom } = r;
        safeRoom.hasJoinPassword = !!joinPassword;
        safeRoom.hasAdminPassword = !!adminPassword;
        return safeRoom;
      });

      res.json(safeRooms);
    } catch (error) {
      logger.error('Error fetching all rooms for super admin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/api/admin/rooms/:id', adminLimiter, adminAuth, async (req, res) => {
    try {
      if (!req.isSuperAdmin || (req.roomId !== 'me' && req.roomId !== 'global')) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }

      const targetRoomParam = req.params.id;
      if (targetRoomParam === 'me' || targetRoomParam === 'global') {
        return res.status(403).json({ error: 'Cannot delete the system default rooms.' });
      }

      const room = await Room.findOne({ $or: [{ id: targetRoomParam }, { alias: targetRoomParam }] });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.id === 'me' || room.id === 'global') {
        return res.status(403).json({ error: 'Cannot delete the system default rooms.' });
      }

      const roomIdentifiers = Array.from(new Set([room.id, room.alias, targetRoomParam].filter(Boolean)));

      // Asynchronously trigger Cloudinary media cleanup for deleted room
      cleanupRoomMediaAssets(roomIdentifiers).catch(() => {});

      // Clean up related data in parallel across all collections
      await Promise.all([
        Room.deleteOne({ id: room.id }),
        Message.deleteMany({ roomId: { $in: roomIdentifiers } }),
        MessageEvent.deleteMany({ roomId: { $in: roomIdentifiers } }),
        AuditLog.deleteMany({ roomId: { $in: roomIdentifiers } }),
        LoginLockdown.deleteMany({ roomId: { $in: roomIdentifiers } }),
        BlockedUser.deleteMany({ roomId: { $in: roomIdentifiers } }),
        UserReport.deleteMany({ roomId: { $in: roomIdentifiers } }),
        ChatState.deleteMany({ roomId: { $in: roomIdentifiers } }),
        User.deleteMany({ roomId: { $in: roomIdentifiers } }),
        TempLink.deleteMany({ roomId: { $in: roomIdentifiers } }),
      ]);

      // Force logout all clients and admins in that room
      wss.clients.forEach((client) => {
        if (roomIdentifiers.includes(client.roomId) && client.readyState === 1) {
          if (client.isAdmin) {
            try {
              client.close(1008, 'Room deleted by Super Admin');
            } catch (e) {}
          } else {
            client.send(JSON.stringify({ type: 'force_logout', message: 'Room has been deleted by an administrator.' }));
            setTimeout(() => client.terminate(), 500);
          }
        }
      });

      roomIdentifiers.forEach(id => deleteRoomState(id));

      const auditEntry = await AuditLog.create({
        roomId: 'me',
        type: 'room_deleted',
        details: { targetRoomId: room.id, message: `Super Admin deleted room: ${room.id} (${room.name || 'Room'})` },
        ip: extractIp(req),
        userAgent: req.headers['user-agent'] || '',
        timestamp: new Date(),
      });
      if (typeof broadcastToAdmins === 'function') {
        broadcastToAdmins('me', 'audit_log', auditEntry);
      }

      res.json({ success: true, message: 'Room deleted successfully' });
    } catch (error) {
      logger.error('Error deleting room by super admin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Room Deletion by Room Admin ---
  router.delete('/api/admin/room', adminLimiter, adminAuth, async (req, res) => {
    const roomId = req.roomId;
    if (roomId === 'me' || roomId === 'global') {
      return res.status(403).json({ error: 'Cannot delete the system default rooms.' });
    }
    try {
      const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
      const roomIdentifiers = Array.from(new Set([roomId, room?.id, room?.alias].filter(Boolean)));

      // Asynchronously trigger Cloudinary media cleanup for deleted room
      cleanupRoomMediaAssets(roomIdentifiers).catch(() => {});

      await Promise.all([
        Room.deleteOne({ id: room ? room.id : roomId }),
        Message.deleteMany({ roomId: { $in: roomIdentifiers } }),
        MessageEvent.deleteMany({ roomId: { $in: roomIdentifiers } }),
        AuditLog.deleteMany({ roomId: { $in: roomIdentifiers } }),
        LoginLockdown.deleteMany({ roomId: { $in: roomIdentifiers } }),
        BlockedUser.deleteMany({ roomId: { $in: roomIdentifiers } }),
        UserReport.deleteMany({ roomId: { $in: roomIdentifiers } }),
        ChatState.deleteMany({ roomId: { $in: roomIdentifiers } }),
        User.deleteMany({ roomId: { $in: roomIdentifiers } }),
        TempLink.deleteMany({ roomId: { $in: roomIdentifiers } }),
      ]);

      // Force logout all online users and close admin sockets in the room
      wss.clients.forEach((client) => {
        if (roomIdentifiers.includes(client.roomId) && client.readyState === 1) {
          if (client.isAdmin) {
            try {
              client.close(1008, 'Room deleted by administrator');
            } catch (e) {}
          } else {
            client.send(JSON.stringify({ type: 'force_logout', message: 'Room has been deleted by an administrator.' }));
            setTimeout(() => client.terminate(), 500);
          }
        }
      });
      roomIdentifiers.forEach(id => deleteRoomState(id));

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete room:', error);
      res.status(500).json({ error: 'Failed to delete room.' });
    }
  });

  return router;
};
