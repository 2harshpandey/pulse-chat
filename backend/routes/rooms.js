// --- Rooms Router ---
const express = require('express');
const crypto = require('crypto');
const logger = require('../logger');
const Room = require('../models/room');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const AuditLog = require('../models/auditLog');
const { getRoomState } = require('../state');
const { authLimiter, apiLimiter, extractIp, generateDeviceHash, checkPasswordRateLimit, recordFailedPasswordAttempt, resetPasswordAttempts } = require('../middleware');
const { timingSafeEqualStr, hashPassword, verifyPassword } = require('../security');

const router = express.Router();

let _broadcastToAdmins = () => {};
const setBroadcast = (fn) => { if (typeof fn === 'function') _broadcastToAdmins = fn; };

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Create a new room
router.post('/', apiLimiter, async (req, res) => {
  const { name, isPrivate, joinPassword, description, adminPassword, fpData } = req.body;

  if (!name || !adminPassword || typeof name !== 'string' || typeof adminPassword !== 'string' || !name.trim() || !adminPassword.trim()) {
    return res.status(400).json({ error: 'Name and Admin Password are required.' });
  }

  if (adminPassword.trim().length < 6) {
    return res.status(400).json({ error: 'Admin Password must be at least 6 characters.' });
  }

  if (isPrivate && joinPassword !== undefined && joinPassword !== null && joinPassword !== '') {
    if (typeof joinPassword !== 'string' || joinPassword.trim().length < 6) {
      return res.status(400).json({ error: 'Join Password must be at least 6 characters if provided.' });
    }
  }

  if (name.length > 50) {
    return res.status(400).json({ error: 'Room name cannot exceed 50 characters.' });
  }

  if (description && (typeof description !== 'string' || description.length > 150)) {
    return res.status(400).json({ error: 'Room description cannot exceed 150 characters.' });
  }

  const clientIp = extractIp(req);
  const clientUa = req.headers['user-agent'] || '';
  const fingerprint = fpData ? generateDeviceHash({ ...fpData, userAgent: clientUa }) : 'unknown';

  try {
    // Check limit (3 rooms per IP/Fingerprint), skip for developer localhost in non-production
    const isLocalLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
    const isDeveloper = process.env.NODE_ENV !== 'production' && isLocalLoopback;
    const ipCount = await Room.countDocuments({ creatorIp: clientIp });
    const fpCount = await Room.countDocuments({ creatorFingerprint: fingerprint });
    
    if (!isDeveloper && (ipCount >= 3 || (fingerprint !== 'unknown' && fpCount >= 3))) {
      return res.status(429).json({ error: 'You have reached the maximum limit of 3 chat rooms.' });
    }

    const customId = req.body?.customId;
    let alias = customId && typeof customId === 'string' ? customId.trim() : null;
    let id;
    
    if (alias) {
      if (!/^[a-zA-Z0-9._]{1,30}$/.test(alias)) {
        return res.status(400).json({ error: 'Room ID must be 1-30 characters, containing only letters, numbers, periods, and underscores.' });
      }
      
      // Check if alias is taken (either as an id or alias)
      const safeAlias = escapeRegExp(alias);
      const existing = await Room.findOne({ $or: [{ id: new RegExp(`^${safeAlias}$`, 'i') }, { alias: new RegExp(`^${safeAlias}$`, 'i') }] });
      if (existing || alias.toLowerCase() === 'me' || alias.toLowerCase() === 'global') {
        return res.status(409).json({ error: 'Room ID is already taken.' });
      }
    }

    if (isPrivate) {
      id = crypto.randomBytes(24).toString('hex'); // 48 character long random string
    } else {
      id = alias || crypto.randomBytes(24).toString('hex');
    }

    const newRoom = new Room({
      id,
      alias: (isPrivate && alias) ? alias : undefined,
      name,
      description,
      isPrivate,
      joinPassword: (isPrivate && typeof joinPassword === 'string' && joinPassword.trim().length >= 6) ? hashPassword(joinPassword.trim()) : undefined,
      adminPassword: hashPassword(adminPassword),
      creatorIp: clientIp,
      creatorFingerprint: fingerprint
    });

    await newRoom.save();

    res.status(201).json({
      success: true,
      room: {
        id: newRoom.id,
        name: newRoom.name,
        isPrivate: newRoom.isPrivate
      }
    });
  } catch (error) {
    logger.error('Failed to create room:', error);
    res.status(500).json({ error: 'Failed to create room.' });
  }
});

// Check if a room ID is available
router.get('/check-id', apiLimiter, async (req, res) => {
  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'ID is required.' });
  if (id.length > 30) return res.json({ available: false });
  if (id.toLowerCase() === 'me' || id.toLowerCase() === 'global') {
    return res.json({ available: false });
  }
  try {
    const safeId = escapeRegExp(id);
    const existing = await Room.findOne({ $or: [{ id: new RegExp(`^${safeId}$`, 'i') }, { alias: new RegExp(`^${safeId}$`, 'i') }] });
    res.json({ available: !existing });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check ID.' });
  }
});

// Get room metadata (isPrivate, requiresPassword)
router.get('/:id/meta', apiLimiter, async (req, res) => {
  const { id } = req.params;
  try {
    if (id === 'global') {
      return res.json({ isPrivate: false, requiresPassword: false, name: 'Global Chat' });
    }
    if (id === 'me') {
      return res.json({
        id: 'me',
        isPrivate: true,
        requiresPassword: !!process.env.CLIENT_PASSWORD,
        name: 'Private Room',
        description: 'Direct private chat room'
      });
    }
    const room = await Room.findOne({ $or: [{ id }, { alias: id }] });
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.isPrivate && id !== room.id) return res.status(404).json({ error: 'Room not found.' });
    res.json({
      id: room.id,
      isPrivate: room.isPrivate,
      requiresPassword: room.isPrivate && !!room.joinPassword,
      name: room.name,
      description: room.description
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch room meta.' });
  }
});

// Verify room join credentials before connecting
router.post('/verify-join', authLimiter, checkPasswordRateLimit, async (req, res) => {
  const { roomId, password } = req.body;
  if (!roomId || typeof roomId !== 'string' || !roomId.trim()) {
    return res.status(400).json({ error: 'Room ID must be a non-empty string.' });
  }
  const cleanRoomId = roomId.trim();
  
  if (cleanRoomId === 'global') {
    return res.json({ valid: true });
  }

  if (cleanRoomId === 'me') {
    if (process.env.CLIENT_PASSWORD && !timingSafeEqualStr(password || '', process.env.CLIENT_PASSWORD)) {
      recordFailedPasswordAttempt(req.passwordRateLimitKey, req);
      const ip = extractIp(req);
      const userAgent = req.headers['user-agent'] || '';
      const username = req.body?.username;
      AuditLog.create({
        roomId: 'me',
        type: 'join_failed_password',
        details: { username, reason: 'Incorrect room password' },
        ip,
        userAgent,
      }).then((entry) => {
        _broadcastToAdmins('me', 'audit_log', entry);
        _broadcastToAdmins('me', 'activity', `Join attempt failed: Incorrect password on room 'me'.`);
      }).catch(() => {});
      return res.status(401).json({ error: 'Incorrect password.' });
    }
    resetPasswordAttempts(req.passwordRateLimitKey);
    return res.json({ valid: true });
  }

  try {
    const room = await Room.findOne({ $or: [{ id: cleanRoomId }, { alias: cleanRoomId }] });
    if (!room) {
      return res.status(404).json({ error: 'Chat room does not exist.' });
    }
    
    // Do not allow joining private room via alias
    if (room.isPrivate && cleanRoomId !== room.id) {
      return res.status(404).json({ error: 'Chat room does not exist.' });
    }

    if (room.isPrivate) {
      if (!room.joinPassword || !verifyPassword(password, room.joinPassword)) {
        recordFailedPasswordAttempt(req.passwordRateLimitKey, req);
        const ip = extractIp(req);
        const userAgent = req.headers['user-agent'] || '';
        const username = req.body?.username;
        AuditLog.create({
          roomId: room.id,
          type: 'join_failed_password',
          details: { username, reason: 'Incorrect room password' },
          ip,
          userAgent,
        }).then((entry) => {
          _broadcastToAdmins(room.id, 'audit_log', entry);
          _broadcastToAdmins(room.id, 'activity', `Join attempt failed: Incorrect password on room '${room.id}'.`);
        }).catch(() => {});
        return res.status(401).json({ error: 'Incorrect password.' });
      }
    }

    resetPasswordAttempts(req.passwordRateLimitKey);
    return res.json({ valid: true });
  } catch (err) {
    logger.error('Error in verify-join:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get public rooms
router.get('/', apiLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const [publicRooms, totalCount] = await Promise.all([
      Room.find({ isPrivate: false }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Room.countDocuments({ isPrivate: false })
    ]);
    const hasMore = skip + publicRooms.length < totalCount;
    const roomIds = publicRooms.map(r => r.id);
    let countMap = new Map();
    if (roomIds.length > 0) {
      const counts = await Message.aggregate([
        { $match: { roomId: { $in: roomIds } } },
        { $group: { _id: '$roomId', count: { $sum: 1 } } }
      ]);
      countMap = new Map(counts.map(c => [c._id, c.count]));
    }

    const roomsWithStats = publicRooms.map((room) => {
      const state = getRoomState(room.id);
      const onlineCount = state.onlineUsers.size;
      const totalMessages = countMap.get(room.id) || 0;
      
      return {
        id: room.id,
        name: room.name,
        description: room.description,
        isPrivate: room.isPrivate,
        onlineCount,
        totalMessages
      };
    });

    res.json({ rooms: roomsWithStats, hasMore });
  } catch (error) {
    logger.error('Failed to fetch rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// Search public rooms
router.get('/search', apiLimiter, async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Search query is required.' });
  }
  if (q.length > 100) {
    return res.status(400).json({ error: 'Search query is too long.' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const safeQ = escapeRegExp(q);
    const query = {
      isPrivate: false,
      $or: [
        { id: new RegExp(`^${safeQ}`, 'i') },
        { name: new RegExp(safeQ, 'i') }
      ]
    };

    const [rooms, totalCount] = await Promise.all([
      Room.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Room.countDocuments(query)
    ]);
    const hasMore = skip + rooms.length < totalCount;

    const roomIds = rooms.map(r => r.id);
    let countMap = new Map();
    if (roomIds.length > 0) {
      const counts = await Message.aggregate([
        { $match: { roomId: { $in: roomIds } } },
        { $group: { _id: '$roomId', count: { $sum: 1 } } }
      ]);
      countMap = new Map(counts.map(c => [c._id, c.count]));
    }

    const roomsWithStats = rooms.map((room) => {
      const state = getRoomState(room.id);
      const onlineCount = state.onlineUsers.size;
      const totalMessages = countMap.get(room.id) || 0;
      
      return {
        id: room.id,
        name: room.name,
        description: room.description,
        isPrivate: room.isPrivate,
        onlineCount,
        totalMessages
      };
    });

    res.json({ rooms: roomsWithStats, hasMore });
  } catch (error) {
    logger.error('Failed to search rooms:', error);
    res.status(500).json({ error: 'Failed to search rooms.' });
  }
});

// Verify password
router.post('/join', authLimiter, checkPasswordRateLimit, async (req, res) => {
  const { id, joinPassword } = req.body;
  if (!id) return res.status(400).json({ error: 'Room ID is required.' });

  try {
    const room = await Room.findOne({ $or: [{ id }, { alias: id }] });
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.isPrivate && id !== room.id) return res.status(404).json({ error: 'Room not found.' });
    
    if (!room.isPrivate) return res.json({ success: true });

    if (joinPassword && verifyPassword(joinPassword, room.joinPassword)) {
      resetPasswordAttempts(req.passwordRateLimitKey);
      if (room.joinPassword && !room.joinPassword.startsWith('scrypt$')) {
        room.joinPassword = hashPassword(joinPassword);
        room.save().catch((err) => logger.error('Failed to upgrade legacy room password:', err));
      }
      return res.json({ success: true });
    }

    recordFailedPasswordAttempt(req.passwordRateLimitKey, req);
    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const username = req.body?.username;
    AuditLog.create({
      roomId: room.id,
      type: 'join_failed_password',
      details: { username, reason: 'Incorrect room password' },
      ip,
      userAgent,
    }).then((entry) => {
      _broadcastToAdmins(room.id, 'audit_log', entry);
      _broadcastToAdmins(room.id, 'activity', `Join attempt failed: Incorrect password on room '${room.id}'.`);
    }).catch(() => {});
    return res.status(401).json({ error: 'Invalid password.' });
  } catch (error) {
    logger.error('Failed to verify join:', error);
    res.status(500).json({ error: 'Failed to join room.' });
  }
});

// Verify admin access
router.post('/admin-auth', authLimiter, checkPasswordRateLimit, async (req, res) => {
  const { roomId, adminPassword } = req.body;
  
  if (!roomId || typeof roomId !== 'string' || !roomId.trim() || !adminPassword || typeof adminPassword !== 'string') {
    return res.status(400).json({ error: 'Room ID and Admin Password must be non-empty strings.' });
  }
  const cleanRoomId = roomId.trim();

  try {
    if (cleanRoomId === 'me' && process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)) {
       resetPasswordAttempts(req.passwordRateLimitKey);
       return res.json({ success: true });
    }

    const room = await Room.findOne({ $or: [{ id: cleanRoomId }, { alias: cleanRoomId }] });
    if (!room) {
      if (cleanRoomId === 'me') {
        recordFailedPasswordAttempt(req.passwordRateLimitKey, req);
        const ip = extractIp(req);
        const userAgent = req.headers['user-agent'] || '';
        AuditLog.create({
          roomId: 'me',
          type: 'admin_auth_failed',
          details: { reason: 'Incorrect admin password' },
          ip,
          userAgent,
        }).then((entry) => {
          _broadcastToAdmins('me', 'audit_log', entry);
          _broadcastToAdmins('me', 'activity', `Security warning: Failed admin login attempt for room 'me'.`);
        }).catch(() => {});
        return res.status(401).json({ error: 'Invalid admin password.' });
      }
      return res.status(404).json({ error: 'Room not found.' });
    }

    if (verifyPassword(adminPassword, room.adminPassword) || (process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD))) {
      resetPasswordAttempts(req.passwordRateLimitKey);
      if (room.adminPassword && !room.adminPassword.startsWith('scrypt$') && verifyPassword(adminPassword, room.adminPassword)) {
        room.adminPassword = hashPassword(adminPassword);
        room.save().catch((err) => logger.error('Failed to upgrade legacy admin password:', err));
      }
      return res.json({ success: true });
    }

    recordFailedPasswordAttempt(req.passwordRateLimitKey, req);
    const ip = extractIp(req);
    const userAgent = req.headers['user-agent'] || '';
    AuditLog.create({
      roomId: room.id,
      type: 'admin_auth_failed',
      details: { reason: 'Incorrect admin password' },
      ip,
      userAgent,
    }).then((entry) => {
      _broadcastToAdmins(room.id, 'audit_log', entry);
      _broadcastToAdmins(room.id, 'activity', `Security warning: Failed admin login attempt for room '${room.id}'.`);
    }).catch(() => {});
    return res.status(401).json({ error: 'Invalid admin password.' });
  } catch (error) {
    logger.error('Failed to verify admin access:', error);
    res.status(500).json({ error: 'Failed to verify admin access.' });
  }
});

const recordAdminAuthFailure = (req, roomId) => {
  recordFailedPasswordAttempt(req.passwordRateLimitKey, req);
  const ip = extractIp(req);
  const userAgent = req.headers['user-agent'] || '';
  AuditLog.create({
    roomId: roomId || 'unknown',
    type: 'admin_auth_failed',
    details: { reason: 'Incorrect admin password' },
    ip,
    userAgent,
  }).then((entry) => {
    _broadcastToAdmins(roomId || 'unknown', 'audit_log', entry);
    _broadcastToAdmins(roomId || 'unknown', 'activity', `Security warning: Failed admin operation attempt for room '${roomId || 'unknown'}'.`);
  }).catch(() => {});
};

// Admin room details
router.get('/admin/details', apiLimiter, checkPasswordRateLimit, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];

  if (!roomId || typeof roomId !== 'string' || !roomId.trim() || !adminPassword || typeof adminPassword !== 'string') {
    recordAdminAuthFailure(req, typeof roomId === 'string' ? roomId : 'me');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
     let isValid = false;
     let room = null;
     if (roomId === 'me' && process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)) {
        isValid = true;
     } else {
        room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
        if (room && (verifyPassword(adminPassword, room.adminPassword) || (process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)))) {
           isValid = true;
        }
     }
     
     if (!isValid) {
       recordAdminAuthFailure(req, roomId);
       return res.status(401).json({ error: 'Unauthorized' });
     }
     
     resetPasswordAttempts(req.passwordRateLimitKey);
     res.json({ id: room ? room.id : roomId, name: room ? room.name : 'Main Room', description: room?.description, alias: room?.alias, lastIdChangeAt: room?.lastIdChangeAt, isPrivate: room?.isPrivate, hasJoinPassword: !!room?.joinPassword });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get room details' });
  }
});

router.put('/admin/details', apiLimiter, checkPasswordRateLimit, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];
  const { name, description } = req.body;

  if (!roomId || typeof roomId !== 'string' || !roomId.trim() || !adminPassword || typeof adminPassword !== 'string') {
    recordAdminAuthFailure(req, typeof roomId === 'string' ? roomId : 'me');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const cleanRoomId = roomId.trim();

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > 50) {
      return res.status(400).json({ error: 'Room name must be a string between 1 and 50 characters.' });
    }
  }
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string' || description.length > 150) {
      return res.status(400).json({ error: 'Room description cannot exceed 150 characters.' });
    }
  }

  try {
    const room = await Room.findOne({ $or: [{ id: cleanRoomId }, { alias: cleanRoomId }] });
    const isAuthorized = room && (verifyPassword(adminPassword, room.adminPassword) || (process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)));
    if (!room || !isAuthorized) {
      recordAdminAuthFailure(req, cleanRoomId);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    resetPasswordAttempts(req.passwordRateLimitKey);
    if (name) room.name = name;
    if (description !== undefined) room.description = description;
    
    await room.save();
    res.json({ success: true, name: room.name, description: room.description });
  } catch (error) {
    logger.error('Failed to update room details:', error);
    res.status(500).json({ error: 'Failed to update room details.' });
  }
});

router.put('/admin/roomId', apiLimiter, checkPasswordRateLimit, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];
  const { newRoomId } = req.body;

  if (!roomId || typeof roomId !== 'string' || !roomId.trim() || !adminPassword || typeof adminPassword !== 'string') {
    recordAdminAuthFailure(req, typeof roomId === 'string' ? roomId : 'me');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const cleanRoomId = roomId.trim();
  if (!newRoomId) return res.status(400).json({ error: 'New Room ID is required.' });

  try {
    const room = await Room.findOne({ $or: [{ id: cleanRoomId }, { alias: cleanRoomId }] });
    const isAuthorized = room && (verifyPassword(adminPassword, room.adminPassword) || (process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)));
    if (!room || !isAuthorized) {
      recordAdminAuthFailure(req, cleanRoomId);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    resetPasswordAttempts(req.passwordRateLimitKey);

    // Validate newRoomId
    const alias = newRoomId.trim();
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(alias)) {
      return res.status(400).json({ error: 'Room ID must be 1-30 characters, containing only letters, numbers, periods, and underscores.' });
    }

    if (room.alias === alias) return res.json({ success: true }); // No change

    // Enforce 14-day limit
    if (room.lastIdChangeAt) {
      const daysSinceChange = (Date.now() - new Date(room.lastIdChangeAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceChange < 14) {
        return res.status(403).json({ error: `Room ID can only be changed once every 14 days. Try again in ${Math.ceil(14 - daysSinceChange)} days.` });
      }
    }

    // Check availability
    const safeAlias = escapeRegExp(alias);
    const existing = await Room.findOne({ $or: [{ id: new RegExp(`^${safeAlias}$`, 'i') }, { alias: new RegExp(`^${safeAlias}$`, 'i') }] });
    if ((existing && !existing._id.equals(room._id)) || alias.toLowerCase() === 'me' || alias.toLowerCase() === 'global') {
      return res.status(409).json({ error: 'Room ID is already taken.' });
    }

    const previousAlias = room.alias;
    room.alias = alias;
    room.lastIdChangeAt = new Date();
    await room.save();

    // Migrate messages and events associated with the previous alias to canonical room.id
    if (previousAlias && previousAlias !== room.id) {
      await Promise.all([
        Message.updateMany({ roomId: previousAlias }, { $set: { roomId: room.id } }),
        MessageEvent.updateMany({ roomId: previousAlias }, { $set: { roomId: room.id } }),
      ]).catch((err) => logger.error('Failed to migrate records to canonical roomId on alias change:', err));
    }
    
    res.json({ success: true, newAlias: alias, lastIdChangeAt: room.lastIdChangeAt });
  } catch (error) {
    logger.error('Failed to update room ID:', error);
    res.status(500).json({ error: 'Failed to update room ID.' });
  }
});

router.put('/admin/joinPassword', apiLimiter, checkPasswordRateLimit, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];
  const { currentPassword, newPassword } = req.body;

  if (!roomId || typeof roomId !== 'string' || !roomId.trim() || !adminPassword || typeof adminPassword !== 'string') {
    recordAdminAuthFailure(req, typeof roomId === 'string' ? roomId : 'me');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const cleanRoomId = roomId.trim();

  try {
    const room = await Room.findOne({ $or: [{ id: cleanRoomId }, { alias: cleanRoomId }] });
    const isAuthorized = room && (verifyPassword(adminPassword, room.adminPassword) || (process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)));
    if (!room || !isAuthorized) {
      recordAdminAuthFailure(req, cleanRoomId);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (room.joinPassword && !verifyPassword(currentPassword, room.joinPassword)) {
      recordAdminAuthFailure(req, cleanRoomId);
      return res.status(400).json({ error: 'Current password is not correct.' });
    }

    resetPasswordAttempts(req.passwordRateLimitKey);

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'New password must be a string of at least 6 characters.' });
    }
    const cleanNewPassword = newPassword.trim();

    if (room.joinPassword && verifyPassword(cleanNewPassword, room.joinPassword)) {
      return res.status(400).json({ error: 'New password cannot be the same as the current password.' });
    }

    room.joinPassword = hashPassword(cleanNewPassword);
    room.isPrivate = true; // Implicitly private if it has a join password
    
    await room.save();
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update join password:', error);
    res.status(500).json({ error: 'Failed to update join password.' });
  }
});

router.delete('/admin/joinPassword', apiLimiter, checkPasswordRateLimit, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];

  if (!roomId || typeof roomId !== 'string' || !roomId.trim() || !adminPassword || typeof adminPassword !== 'string') {
    recordAdminAuthFailure(req, typeof roomId === 'string' ? roomId : 'me');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const cleanRoomId = roomId.trim();

  try {
    const room = await Room.findOne({ $or: [{ id: cleanRoomId }, { alias: cleanRoomId }] });
    const isAuthorized = room && (verifyPassword(adminPassword, room.adminPassword) || (process.env.ADMIN_PASSWORD && timingSafeEqualStr(adminPassword, process.env.ADMIN_PASSWORD)));
    if (!room || !isAuthorized) {
      recordAdminAuthFailure(req, cleanRoomId);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    resetPasswordAttempts(req.passwordRateLimitKey);

    room.joinPassword = undefined;
    room.isPrivate = false; // Make the room public again
    
    await room.save();
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove join password:', error);
    res.status(500).json({ error: 'Failed to remove join password.' });
  }
});

router.setBroadcast = setBroadcast;
module.exports = router;
