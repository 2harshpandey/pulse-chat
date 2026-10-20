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
const { getRoomState } = require('../../state');
const { adminLimiter, adminAuth } = require('../../middleware');

module.exports = (wss, broadcasts) => {
  const { broadcast } = broadcasts;
  const router = express.Router();

  // --- Global Super Admin Room Management ---
  router.get('/api/admin/rooms', adminLimiter, adminAuth, async (req, res) => {
    try {
      if (!req.isSuperAdmin || (req.roomId !== 'me' && req.roomId !== 'global')) {
        return res.status(403).json({ error: 'Forbidden: Super Admin only' });
      }

      const rooms = await Room.find({}).lean();

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

      const targetRoomId = req.params.id;
      const room = await Room.findOne({ id: targetRoomId });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      // Clean up related data in parallel
      await Promise.all([
        Room.deleteOne({ id: targetRoomId }),
        Message.deleteMany({ roomId: targetRoomId }),
      ]);

      // Force logout everyone in that room
      const roomState = getRoomState(targetRoomId);
      if (roomState) {
        for (const ws of roomState.adminClients) {
          try {
            ws.close(1008, 'Room deleted by Super Admin');
          } catch (e) {}
        }
      }

      await AuditLog.create({
        roomId: 'me',
        action: 'ROOM_DELETED',
        details: `Super Admin deleted room: ${targetRoomId}`,
        timestamp: new Date(),
      });

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
      await Promise.all([
        Room.deleteOne({ id: roomId }),
        Message.deleteMany({ roomId }),
        MessageEvent.deleteMany({ roomId }),
        AuditLog.deleteMany({ roomId }),
        LoginLockdown.deleteMany({ roomId }),
        BlockedUser.deleteMany({ roomId }),
        UserReport.deleteMany({ roomId }),
        ChatState.deleteMany({ roomId }),
      ]);

      // Force logout all online users in the room
      const state = getRoomState(roomId);
      const onlineUserIds = Array.from(state.onlineUsers.keys());
      onlineUserIds.forEach((uid) => {
        broadcast(roomId, uid, 'admin_force_logout', { reason: 'Room deleted by admin.' });
      });
      state.onlineUsers.clear();
      state.messages = [];

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete room:', error);
      res.status(500).json({ error: 'Failed to delete room.' });
    }
  });

  return router;
};
