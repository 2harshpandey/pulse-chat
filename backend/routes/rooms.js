// --- Rooms Router ---
const express = require('express');
const crypto = require('crypto');
const logger = require('../logger');
const Room = require('../models/room');
const User = require('../models/user');
const { apiLimiter, extractIp, generateDeviceHash, checkPasswordRateLimit, recordFailedPasswordAttempt, resetPasswordAttempts } = require('../middleware');

const router = express.Router();

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const generateUniqueSentence = () => {
  // Simple generator for unique sentences. For production, use a word list.
  const adjs = ['brave', 'calm', 'eager', 'fancy', 'gentle', 'happy', 'jolly', 'kind', 'lively', 'merry', 'nice', 'proud', 'silly', 'tall', 'witty'];
  const nouns = ['apple', 'bear', 'cat', 'dog', 'eagle', 'frog', 'goat', 'horse', 'iguana', 'jaguar', 'koala', 'lion', 'monkey', 'newt', 'owl'];
  const verbs = ['jumps', 'runs', 'flies', 'swims', 'sleeps', 'walks', 'hides', 'seeks', 'plays', 'sings', 'dances', 'eats', 'drinks', 'reads', 'writes'];
  const advs = ['quickly', 'slowly', 'happily', 'sadly', 'loudly', 'quietly', 'smoothly', 'roughly', 'softly', 'hardly', 'easily', 'carefully', 'boldly', 'bravely', 'calmly'];
  
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `the ${pick(adjs)} ${pick(nouns)} ${pick(verbs)} ${pick(advs)} ${crypto.randomBytes(2).toString('hex')}`;
};

// Create a new room
router.post('/', apiLimiter, async (req, res) => {
  const { name, isPrivate, joinPassword, description, adminPassword, fpData } = req.body;

  if (!name || !adminPassword) {
    return res.status(400).json({ error: 'Name and Admin Password are required.' });
  }

  if (name.length > 50) {
    return res.status(400).json({ error: 'Room name cannot exceed 50 characters.' });
  }

  if (description && description.length > 150) {
    return res.status(400).json({ error: 'Room description cannot exceed 150 characters.' });
  }

  const clientIp = extractIp(req);
  const clientUa = req.headers['user-agent'] || '';
  const fingerprint = fpData ? generateDeviceHash({ ...fpData, userAgent: clientUa }) : 'unknown';

  try {
    // Check limit (3 rooms per IP/Fingerprint), skip for developer localhost/local-network
    const isDeveloper = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || 
                        clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('::ffff:192.168.') || clientIp.startsWith('::ffff:10.');
    const ipCount = await Room.countDocuments({ creatorIp: clientIp });
    const fpCount = await Room.countDocuments({ creatorFingerprint: fingerprint });
    
    if (!isDeveloper && (ipCount >= 3 || (fingerprint !== 'unknown' && fpCount >= 3))) {
      return res.status(429).json({ error: 'You have reached the maximum limit of 3 chat rooms.' });
    }

    const { customId, description } = req.body;
    let alias = customId ? customId.trim() : null;
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
      joinPassword, // Should be hashed in production
      adminPassword, // Should be hashed in production
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
  if (!id) return res.status(400).json({ error: 'ID is required.' });
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

// Get public rooms
router.get('/', apiLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const publicRooms = await Room.find({ isPrivate: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const totalCount = await Room.countDocuments({ isPrivate: false });
    const hasMore = skip + publicRooms.length < totalCount;
      
    const { getRoomState } = require('../state');
    const Message = require('../models/message');

    const roomsWithStats = await Promise.all(publicRooms.map(async (room) => {
      const state = getRoomState(room.id);
      const onlineCount = state.onlineUsers.size;
      const totalMessages = await Message.countDocuments({ roomId: room.id });
      
      return {
        id: room.id,
        name: room.name,
        description: room.description,
        isPrivate: room.isPrivate,
        onlineCount,
        totalMessages
      };
    }));

    res.json({ rooms: roomsWithStats, hasMore });
  } catch (error) {
    logger.error('Failed to fetch rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// Search public rooms
router.get('/search', apiLimiter, async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Search query is required.' });
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

    const rooms = await Room.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCount = await Room.countDocuments(query);
    const hasMore = skip + rooms.length < totalCount;

    const { getRoomState } = require('../state');
    const Message = require('../models/message');

    const roomsWithStats = await Promise.all(rooms.map(async (room) => {
      const state = getRoomState(room.id);
      const onlineCount = state.onlineUsers.size;
      const totalMessages = await Message.countDocuments({ roomId: room.id });
      
      return {
        id: room.id,
        name: room.name,
        description: room.description,
        isPrivate: room.isPrivate,
        onlineCount,
        totalMessages
      };
    }));

    res.json({ rooms: roomsWithStats, hasMore });
  } catch (error) {
    logger.error('Failed to search rooms:', error);
    res.status(500).json({ error: 'Failed to search rooms.' });
  }
});

// Verify password
router.post('/join', apiLimiter, checkPasswordRateLimit, async (req, res) => {
  const { id, joinPassword } = req.body;
  if (!id) return res.status(400).json({ error: 'Room ID is required.' });

  try {
    const room = await Room.findOne({ $or: [{ id }, { alias: id }] });
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.isPrivate && id !== room.id) return res.status(404).json({ error: 'Room not found.' });
    
    if (!room.isPrivate) return res.json({ success: true });

    if (joinPassword && room.joinPassword === joinPassword) {
      resetPasswordAttempts(req.passwordRateLimitKey);
      return res.json({ success: true });
    }

    recordFailedPasswordAttempt(req.passwordRateLimitKey);
    return res.status(401).json({ error: 'Invalid password.' });
  } catch (error) {
    logger.error('Failed to verify join:', error);
    res.status(500).json({ error: 'Failed to join room.' });
  }
});

// Verify admin access
router.post('/admin-auth', apiLimiter, checkPasswordRateLimit, async (req, res) => {
  const { roomId, adminPassword } = req.body;
  
  if (!roomId || !adminPassword) {
    return res.status(400).json({ error: 'Room ID and Admin Password are required.' });
  }

  try {
    if (roomId === 'me' && adminPassword === process.env.ADMIN_PASSWORD) {
       resetPasswordAttempts(req.passwordRateLimitKey);
       return res.json({ success: true });
    }

    const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    if (room.adminPassword === adminPassword) {
      resetPasswordAttempts(req.passwordRateLimitKey);
      return res.json({ success: true });
    }

    recordFailedPasswordAttempt(req.passwordRateLimitKey);
    return res.status(401).json({ error: 'Invalid admin password.' });
  } catch (error) {
    logger.error('Failed to verify admin access:', error);
    res.status(500).json({ error: 'Failed to verify admin access.' });
  }
});

// Admin room details
router.get('/admin/details', apiLimiter, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];

  if (!roomId || !adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
     let isValid = false;
     if (roomId === 'me' && adminPassword === process.env.ADMIN_PASSWORD) {
        isValid = true;
     } else {
        const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
        if (room && room.adminPassword === adminPassword) {
           isValid = true;
           // Important: override roomId with actual ID in case it was alias
           req.realRoomId = room.id; 
        }
     }
     
     if (!isValid) return res.status(401).json({ error: 'Unauthorized' });
     
     const room = await Room.findOne({ id: req.realRoomId || roomId });
     res.json({ id: room ? room.id : roomId, name: room ? room.name : 'Main Room', description: room?.description, alias: room?.alias, lastIdChangeAt: room?.lastIdChangeAt, isPrivate: room?.isPrivate, hasJoinPassword: !!room?.joinPassword });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get room details' });
  }
});

router.put('/admin/details', apiLimiter, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];
  const { name, description } = req.body;

  if (!roomId || !adminPassword) return res.status(401).json({ error: 'Unauthorized' });

  if (name && name.length > 50) return res.status(400).json({ error: 'Room name cannot exceed 50 characters.' });
  if (description && description.length > 150) return res.status(400).json({ error: 'Room description cannot exceed 150 characters.' });

  try {
    const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
    if (!room || room.adminPassword !== adminPassword) return res.status(401).json({ error: 'Unauthorized' });

    if (name) room.name = name;
    if (description !== undefined) room.description = description;
    
    await room.save();
    res.json({ success: true, name: room.name, description: room.description });
  } catch (error) {
    logger.error('Failed to update room details:', error);
    res.status(500).json({ error: 'Failed to update room details.' });
  }
});

router.put('/admin/roomId', apiLimiter, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];
  const { newRoomId } = req.body;

  if (!roomId || !adminPassword) return res.status(401).json({ error: 'Unauthorized' });
  if (!newRoomId) return res.status(400).json({ error: 'New Room ID is required.' });

  try {
    const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
    if (!room || room.adminPassword !== adminPassword) return res.status(401).json({ error: 'Unauthorized' });

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
    if (existing || alias.toLowerCase() === 'me' || alias.toLowerCase() === 'global') {
      return res.status(409).json({ error: 'Room ID is already taken.' });
    }

    room.alias = alias;
    // Note: room.id stays the same (48-char string for private, or original id for public), we only change the alias for public/private to allow them to have custom URLs.
    // Wait, for public rooms, original id WAS the alias!
    // If it's a public room, changing the alias might be tricky if we don't change `id`. But `adminAuth` uses `$or: [{ id }, { alias }]`. So adding an alias to a public room works!
    if (!room.isPrivate && room.id === room.alias) {
        // First time changing a public room id that didn't have an alias
    }
    
    room.lastIdChangeAt = new Date();
    await room.save();
    
    res.json({ success: true, newAlias: alias, lastIdChangeAt: room.lastIdChangeAt });
  } catch (error) {
    logger.error('Failed to update room ID:', error);
    res.status(500).json({ error: 'Failed to update room ID.' });
  }
});

router.put('/admin/joinPassword', apiLimiter, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];
  const { currentPassword, newPassword } = req.body;

  if (!roomId || !adminPassword) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
    if (!room || room.adminPassword !== adminPassword) return res.status(401).json({ error: 'Unauthorized' });

    if (room.joinPassword && room.joinPassword !== currentPassword) {
      return res.status(400).json({ error: 'Current password is not correct.' });
    }

    if (room.joinPassword && room.joinPassword === newPassword) {
      return res.status(400).json({ error: 'New password cannot be the same as the current password.' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    room.joinPassword = newPassword;
    room.isPrivate = true; // Implicitly private if it has a join password
    
    await room.save();
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update join password:', error);
    res.status(500).json({ error: 'Failed to update join password.' });
  }
});

router.delete('/admin/joinPassword', apiLimiter, async (req, res) => {
  const roomId = req.headers['x-room-id'];
  const adminPassword = req.headers['x-admin-password'];

  if (!roomId || !adminPassword) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] });
    if (!room || room.adminPassword !== adminPassword) return res.status(401).json({ error: 'Unauthorized' });

    room.joinPassword = undefined;
    room.isPrivate = false; // Make the room public again
    
    await room.save();
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove join password:', error);
    res.status(500).json({ error: 'Failed to remove join password.' });
  }
});

module.exports = router;
