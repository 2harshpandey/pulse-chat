// --- Media, Upload, and Chat Management Routes ---

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const mongoose = require('mongoose');
const logger = require('../logger');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const User = require('../models/user');
const Room = require('../models/room');
const ChatState = require('../models/chatState');
const { getRoomState } = require('../state');
const { unpinIfPinned, clearAllPins } = require('../websocket/pinnedManager');
const {
  uploadLimiter,
  chunkUploadLimiter,
  apiLimiter,
  adminLimiter,
  adminAuth,
  adminSecretAuth,
} = require('../middleware');
const { sanitizeDownloadFilename, parseCloudinaryAssetFromUrl, batchDeleteCloudinaryAssets } = require('../security');
const { isRoomAccessAllowed } = require('./messages');
const { WebSocket } = require('ws');

const repairMojibakeText = (value) => String(value || '')
  .replace(/Ã¢â‚¬â„¢|Ã¢â‚¬â„¢|â€™|â€™/g, "'")
  .replace(/Ã¢â‚¬Ëœ|â€˜|â€˜/g, "'")
  .replace(/Ã¢â‚¬Å“|â€œ|â€œ/g, '"')
  .replace(/Ã¢â‚¬Â |Ã¢â‚¬ï¿½|â€ |â€ /g, '"')
  .replace(/Ã¢â‚¬â€œ|â€“|â€“/g, '-')
  .replace(/Ã¢â‚¬â€ |â€”|â€”/g, '-')
  .replace(/Ã¢â‚¬Â¦|â€¦|â€¦/g, '...')
  .replace(/Ã‚Â·|Â·/g, '·')
  .replace(/ÃƒÂ¢Ã¢\u20AC\u2122Ã¢\u20AC\u201D|ÃƒÂ¢Ã¢\u20AC\u2122Ã¢\u20AC\u201C/g, '-')
  .replace(/ÃƒÂ¢Ã¢\u20AC\u2122Ã‚Â¦/g, '...')
  .replace(/ÃƒÂ¢Ã¢\u20AC\u201AÃ‚Â¬/g, 'EUR')
  .replace(/Ã‚/g, '')
  .replace(/Â(?=\s|$|[\w().,;:'"-])/g, '')
  .normalize('NFC');

const sanitizeUploadFilename = (name) => sanitizeDownloadFilename(repairMojibakeText(name), 'file');

// --- Cloudinary & Multer Configuration ---
// Keep Multer in-memory and send files to Cloudinary ourselves using the chunked
// upload stream. The Cloudinary storage adapter uses the normal upload endpoint,
// which can return a 10 MB provider limit for raw files such as .rar/.zip.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB max total file size
const MAX_MEMORY_FILE_BYTES = 25 * 1024 * 1024; // 25 MB max in-memory multer buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEMORY_FILE_BYTES },
});

// Dedicated isolated directory for chunk upload temp files
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'pulse_uploads');
try {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
} catch (_) {}

// Issue 5: Per-session concurrent upload cap — prevents disk exhaustion DoS.
// A single authenticated session (roomId:userId scope) may have at most 3 active
// incomplete chunk uploads at once. Requests beyond this cap return 429.
const activeChunkUploads = new Map(); // scopeHash -> Map<uploadId, number>
const MAX_CONCURRENT_CHUNK_UPLOADS = 3;
const CHUNK_UPLOAD_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

const trackUploadStart = (scopeHash, uploadId) => {
  const now = Date.now();
  let existing = activeChunkUploads.get(scopeHash);
  if (!existing) {
    existing = new Map();
    activeChunkUploads.set(scopeHash, existing);
  }
  // Prune any stale uploads for this scope that exceeded 1 hour
  for (const [id, ts] of existing.entries()) {
    if (now - ts > CHUNK_UPLOAD_TIMEOUT_MS) existing.delete(id);
  }
  if (!existing.has(uploadId) && existing.size >= MAX_CONCURRENT_CHUNK_UPLOADS) {
    return false; // cap exceeded
  }
  existing.set(uploadId, now);
  return true;
};

const trackUploadEnd = (scopeHash, uploadId) => {
  const existing = activeChunkUploads.get(scopeHash);
  if (existing) {
    existing.delete(uploadId);
    if (existing.size === 0) activeChunkUploads.delete(scopeHash);
  }
};

// Periodic async cleanup of abandoned temporary chunk upload files
const pruneStaleUploadTempFiles = async () => {
  try {
    const files = await fs.promises.readdir(UPLOAD_TEMP_DIR);
    const now = Date.now();
    const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
    for (const f of files) {
      if (f.startsWith('pulse_upload_')) {
        const fullPath = path.join(UPLOAD_TEMP_DIR, f);
        try {
          const stats = await fs.promises.stat(fullPath);
          if (now - stats.mtimeMs > STALE_THRESHOLD_MS) {
            await fs.promises.unlink(fullPath);
            logger.info(`Pruned stale temp upload file: ${f}`);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    logger.warn('Failed to prune stale upload temp files:', err?.message);
  }
};
setInterval(pruneStaleUploadTempFiles, 30 * 60 * 1000).unref();
pruneStaleUploadTempFiles();

const isAudioMimeOrExt = (mimetype = '', filename = '') => {
  if (mimetype.startsWith('audio/')) return true;
  if (/^voice[-_]message/i.test(filename || '')) return true;
  return /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|webm|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i.test(filename || '');
};

const getUploadResourceType = (mimetype = '', filename = '') => {
  if (mimetype.startsWith('image/')) return 'image';
  if (isAudioMimeOrExt(mimetype, filename)) return 'video';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
};

const getMessageFileType = (mimetype = '', filename = '') => {
  if (mimetype.startsWith('image/')) return 'image';
  if (isAudioMimeOrExt(mimetype, filename)) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  return 'file';
};

const uploadBufferToCloudinary = (file, originalName) => new Promise((resolve, reject) => {
  const parsedName = path.parse(originalName || 'file');
  const safeBase = sanitizeDownloadFilename(parsedName.name || 'file', 'file')
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const ext = parsedName.ext ? parsedName.ext.replace(/^\./, '') : '';
  const resourceType = getUploadResourceType(file.mimetype || '', originalName);
  const publicId = `pulse-chat/${safeBase}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;

  const isAudio = isAudioMimeOrExt(file.mimetype || '', originalName);
  const isVideo = resourceType === 'video';
  const isActualVideo = isVideo && !isAudio;
  const uploadOptions = {
    resource_type: resourceType,
    public_id: resourceType === 'raw' && ext ? `${publicId}.${ext}` : publicId,
    chunk_size: 6 * 1024 * 1024,
    use_filename: false,
    unique_filename: false,
    overwrite: false,
    filename_override: originalName,
    // For actual videos (not audio), use async processing so Cloudinary returns the URL immediately
    // without waiting for transcoding to complete. This prevents the HTTP connection
    // from being held open for 1-3+ minutes, which causes Azure/proxy 230s timeouts
    // that make the frontend think the upload failed ('Failed to fetch').
    ...(isActualVideo ? { async: true } : {}),
    // Explicit timeout: 8 minutes. Cloudinary SDK default is unset (relying on Node
    // HTTP defaults), which means proxy idle timeouts can fire first.
    timeout: 8 * 60 * 1000,
  };

  const uploadStream = cloudinary.uploader.upload_chunked_stream(uploadOptions, (error, result) => {
    if (error) return reject(error);
    // For non-async uploads (audio, photos, documents), Cloudinary MUST return a confirmed secure_url
    if (!result?.secure_url && result?.public_id) {
      if (!isActualVideo) {
        return reject(new Error('Cloudinary upload failed: no secure URL was returned.'));
      }
      result.secure_url = cloudinary.url(result.public_id, { 
        resource_type: result.resource_type || (isAudio ? 'video' : isVideo ? 'video' : 'image'), 
        format: result.format || ext || (isAudio ? (ext || 'mp3') : isVideo ? 'mp4' : undefined),
        secure: true,
        version: result.version,
      });
    }
    
    if (!result?.secure_url) {
      return reject(new Error('Cloudinary upload did not return or generate a secure URL.'));
    }
    return resolve(result);
  });

  const readStream = Readable.from(file.buffer);
  readStream.on('error', (err) => {
    try { uploadStream.destroy(); } catch (_) {}
    reject(err);
  });
  uploadStream.on('error', (err) => {
    try { readStream.destroy(); } catch (_) {}
    reject(err);
  });
  readStream.pipe(uploadStream);
});

const uploadFileStreamToCloudinary = (filePath, mimetype, originalName) => new Promise((resolve, reject) => {
  const parsedName = path.parse(originalName || 'file');
  const safeBase = sanitizeDownloadFilename(parsedName.name || 'file', 'file')
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const ext = parsedName.ext ? parsedName.ext.replace(/^\./, '') : '';
  const resourceType = getUploadResourceType(mimetype || '', originalName);
  const publicId = `pulse-chat/${safeBase}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;

  const isAudio = isAudioMimeOrExt(mimetype || '', originalName);
  const isVideo = resourceType === 'video';
  const isActualVideo = isVideo && !isAudio;
  const uploadOptions = {
    resource_type: resourceType,
    public_id: resourceType === 'raw' && ext ? `${publicId}.${ext}` : publicId,
    chunk_size: 6 * 1024 * 1024,
    use_filename: false,
    unique_filename: false,
    overwrite: false,
    filename_override: originalName,
    ...(isActualVideo ? { async: true } : {}),
    timeout: 8 * 60 * 1000,
  };

  const uploadStream = cloudinary.uploader.upload_chunked_stream(uploadOptions, (error, result) => {
    if (error) return reject(error);
    // For non-async uploads (audio, photos, documents), Cloudinary MUST return a confirmed secure_url
    if (!result?.secure_url && result?.public_id) {
      if (!isActualVideo) {
        return reject(new Error('Cloudinary upload failed: no secure URL was returned.'));
      }
      result.secure_url = cloudinary.url(result.public_id, { 
        resource_type: result.resource_type || (isAudio ? 'video' : isVideo ? 'video' : 'image'), 
        format: result.format || ext || (isAudio ? (ext || 'mp3') : isVideo ? 'mp4' : undefined),
        secure: true,
        version: result.version,
      });
    }
    if (!result?.secure_url) {
      return reject(new Error('Cloudinary upload did not return or generate a secure URL.'));
    }
    return resolve(result);
  });

  const fileStream = fs.createReadStream(filePath);
  fileStream.on('error', (err) => {
    try { uploadStream.destroy(); } catch (_) {}
    reject(err);
  });
  uploadStream.on('error', (err) => {
    try { fileStream.destroy(); } catch (_) {}
    reject(err);
  });
  fileStream.pipe(uploadStream);
});

// --- Helper: build query that respects frontendHiddenBefore ---
const getVisibleMessagesQuery = (beforeTimestamp, frontendHiddenBefore) => {
  const createdAt = {};

  if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
    createdAt.$gt = frontendHiddenBefore;
  }

  if (beforeTimestamp instanceof Date && !Number.isNaN(beforeTimestamp.getTime())) {
    createdAt.$lt = beforeTimestamp;
  }

  const query = { vanished: { $ne: true } };
  if (Object.keys(createdAt).length > 0) {
    query.createdAt = createdAt;
  }
  return query;
};

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins, broadcast } = broadcasts;
  const router = express.Router();

  // --- File Upload ---
  router.post('/api/upload', uploadLimiter, (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        logger.error(`Upload middleware error: ${err.message}`);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large for direct upload (max 25 MB). Please use chunked upload for larger files.' });
        }
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

      const rawRoomId = req.body?.roomId;
      const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
      const userId = req.body?.userId;
      const allowed = await isRoomAccessAllowed(roomId, req);
      if (!allowed) {
        return res.status(401).json({ error: 'Upload denied: room authentication required.' });
      }

      let canonicalRoomId = roomId;
      if (roomId !== 'me' && roomId !== 'global') {
        try {
          const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
          if (room) canonicalRoomId = room.id;
        } catch (_) {}
      }

      const { onlineUsers } = getRoomState(canonicalRoomId);
      let username = onlineUsers.get(userId)?.username;
      
      if (!username) {
        // Cast to string to prevent NoSQL injection from object payloads (CodeQL Alert)
        const user = await User.findOne({ userId: String(userId), roomId: canonicalRoomId });
        username = user?.username || 'Unknown';
      }

      const originalName = sanitizeUploadFilename(req.file.originalname);

      try {
        const uploaded = await uploadBufferToCloudinary(req.file, originalName);

        // Create a MessageEvent for the upload
        const event = new MessageEvent({
          roomId: canonicalRoomId,
          type: 'upload',
          file: {
            originalname: originalName,
            mimetype: req.file.mimetype,
            size: req.file.size,
          },
          userId,
          username,
          timestamp: new Date().toISOString(),
        });
        event.save().catch((e) => logger.error('Failed to save upload event:', e));

        broadcastToAdmins(canonicalRoomId, 'history', event);
        broadcastToAdmins(canonicalRoomId, 'activity', `File '${originalName}' uploaded by '${username}'.`);

        logger.info(`File uploaded to room ${canonicalRoomId}: ${originalName}`);

        const parsedDuration = req.body.duration ? Number(req.body.duration) : undefined;
        let parsedWaveform = undefined;
        if (req.body.waveform) {
          try {
            parsedWaveform = typeof req.body.waveform === 'string' ? JSON.parse(req.body.waveform) : req.body.waveform;
          } catch {}
        }

        res.status(200).json({
          id: uploaded.public_id,
          type: getMessageFileType(req.file.mimetype || '', originalName),
          url: uploaded.secure_url,
          originalName,
          size: req.file.size,
          text: typeof req.body.text === 'string' ? req.body.text.trim().slice(0, 5000) : undefined,
          duration: parsedDuration,
          waveform: parsedWaveform,
        });
      } catch (uploadError) {
        logger.error('Cloudinary upload error:', {
          message: uploadError.message,
          http_code: uploadError.http_code,
          name: uploadError.name,
        });
        const providerLimit = /maximum is\s+10485760/i.test(uploadError.message || '');
        return res.status(providerLimit ? 413 : 502).json({
          error: providerLimit
            ? 'File too large for the current upload provider path. Files are allowed only upto 10 MBs in size. Please try again after the latest server deploy.'
            : `Upload failed: ${uploadError.message || 'Cloudinary upload failed.'}`,
        });
      }
    });
  });

  const getChunkUploadTempPath = (safeUploadId, roomId, req) => {
    const callerId = req.headers['x-user-id'] || req.body?.userId || req.query?.userId || 'anon';
    const cleanRoom = typeof roomId === 'string' && roomId.trim() ? roomId.trim() : 'me';
    const cleanUser = typeof callerId === 'string' && callerId.trim() ? callerId.trim() : 'anon';
    const scopeHash = crypto.createHash('sha256').update(`${cleanRoom}:${cleanUser}`).digest('hex').slice(0, 16);
    return { tmpPath: path.join(UPLOAD_TEMP_DIR, `pulse_upload_${scopeHash}_${safeUploadId}`), scopeHash };
  };

  // --- Resumable File Upload (Chunked) ---
  router.get('/api/upload/status', apiLimiter, async (req, res) => {
    const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
    let roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
    const allowed = await isRoomAccessAllowed(roomId, req);
    if (!allowed) {
      return res.status(401).json({ error: 'Access denied: room authentication required.' });
    }
    if (roomId !== 'me' && roomId !== 'global') {
      try {
        const roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
        if (roomDoc) roomId = roomDoc.id;
      } catch (_) {}
    }

    const { uploadId } = req.query;
    if (!uploadId || typeof uploadId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid uploadId' });
    }
    const safeUploadId = path.basename(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUploadId || safeUploadId !== uploadId) {
      return res.status(400).json({ error: 'Invalid uploadId format' });
    }
    const tmpPath = getChunkUploadTempPath(safeUploadId, roomId, req);
    try {
      const stats = await fs.promises.stat(tmpPath.tmpPath || tmpPath);
      return res.json({ uploadedBytes: stats.size });
    } catch {
      return res.json({ uploadedBytes: 0 });
    }
  });

  router.post('/api/upload/chunk', chunkUploadLimiter, (req, res) => {
    upload.single('chunk')(req, res, async (err) => {
      if (err) {
        logger.error(`Upload chunk middleware error: ${err.message}`);
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }
      try {
        const { uploadId, chunkIndex, totalChunks, originalname, mimetype, userId, text } = req.body;
        const rawRoomId = req.body?.roomId;
        let roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
        if (!uploadId || typeof uploadId !== 'string' || !req.file) {
          return res.status(400).json({ error: 'Missing or invalid chunk data' });
        }

        const allowed = await isRoomAccessAllowed(roomId, req);
        if (!allowed) {
          return res.status(401).json({ error: 'Upload denied: room authentication required.' });
        }
        if (roomId !== 'me' && roomId !== 'global') {
          try {
            const roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
            if (roomDoc) roomId = roomDoc.id;
          } catch (_) {}
        }
        
        const safeUploadId = path.basename(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeUploadId || safeUploadId !== uploadId) {
          return res.status(400).json({ error: 'Invalid uploadId format' });
        }

        const { tmpPath, scopeHash } = getChunkUploadTempPath(safeUploadId, roomId, req);

        // Issue 5: Enforce concurrent upload cap — reject if session already has MAX active uploads
        if (!trackUploadStart(scopeHash, safeUploadId)) {
          return res.status(429).json({ error: 'Too many concurrent uploads from this session. Please wait for a current upload to complete.' });
        }
        
        // Write chunk at exact offset to prevent corruption
        const chunkStart = parseInt(req.body.chunkStart, 10);
        if (!Number.isFinite(chunkStart) || chunkStart < 0) {
          return res.status(400).json({ error: 'Invalid chunkStart offset' });
        }
        if (chunkStart + req.file.buffer.length > MAX_UPLOAD_BYTES) {
          return res.status(413).json({
            error: `Upload exceeds maximum allowed size of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
          });
        }

        // Verify sequential chunk order to prevent sparse file creation attacks
        let currentFileSize = 0;
        try {
          const stats = await fs.promises.stat(tmpPath);
          currentFileSize = stats.size;
        } catch (_) {}

        if (chunkStart > currentFileSize) {
          return res.status(400).json({ error: `Non-sequential chunk rejected. Expected offset <= ${currentFileSize}, got ${chunkStart}.` });
        }

        const fileHandle = await fs.promises.open(tmpPath, 'a+');
        try {
          await fileHandle.write(req.file.buffer, 0, req.file.buffer.length, chunkStart);
        } finally {
          await fileHandle.close();
        }

        const currentChunk = parseInt(chunkIndex, 10);
        const total = parseInt(totalChunks, 10);

        if (currentChunk === total - 1) {
          // Upload complete, stream directly from disk to Cloudinary
          const stats = await fs.promises.stat(tmpPath);
          const safeName = sanitizeUploadFilename(originalname || 'file');
          const fileMime = mimetype || 'application/octet-stream';
          const fileSize = stats.size;

          let canonicalRoomId = roomId;
          if (roomId !== 'me' && roomId !== 'global') {
            try {
              const room = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
              if (room) canonicalRoomId = room.id;
            } catch (_) {}
          }

          const { onlineUsers } = getRoomState(canonicalRoomId);
          let username = onlineUsers.get(userId)?.username;
          if (!username) {
            const user = await User.findOne({ userId: String(userId), roomId: canonicalRoomId });
            username = user?.username || 'Unknown';
          }

          let uploaded;
          try {
            uploaded = await uploadFileStreamToCloudinary(tmpPath, fileMime, safeName);
            // Clean up temp file upon successful upload completion
            try {
              await fs.promises.unlink(tmpPath);
            } catch (e) {
              logger.error(`Failed to delete temp file ${tmpPath}:`, e);
            }
          } catch (uploadError) {
            logger.error('Failed to stream full file to Cloudinary:', uploadError);
            trackUploadEnd(scopeHash, safeUploadId);
            return res.status(502).json({ error: `Upload to storage failed: ${uploadError.message}` });
          }

          // Create a MessageEvent for the upload
          const event = new MessageEvent({
            roomId: canonicalRoomId,
            type: 'upload',
            file: {
              originalname: safeName,
              mimetype: fileMime,
              size: fileSize,
            },
            userId,
            username,
            timestamp: new Date().toISOString(),
          });
          event.save().catch((e) => logger.error('Failed to save chunk upload event:', e));

          broadcastToAdmins(canonicalRoomId, 'history', event);
          broadcastToAdmins(canonicalRoomId, 'activity', `File '${safeName}' uploaded by '${username}'.`);

          logger.info(`File uploaded to room ${canonicalRoomId} via chunks: ${safeName}`);

          const parsedDuration = req.body.duration ? Number(req.body.duration) : undefined;
          let parsedWaveform = undefined;
          if (req.body.waveform) {
            try {
              parsedWaveform = typeof req.body.waveform === 'string' ? JSON.parse(req.body.waveform) : req.body.waveform;
            } catch {}
          }

          trackUploadEnd(scopeHash, safeUploadId);
          return res.status(200).json({
            id: uploaded.public_id,
            type: getMessageFileType(fileMime, safeName),
            url: uploaded.secure_url,
            originalName: safeName,
            size: fileSize,
            text: typeof text === 'string' ? text.trim().slice(0, 5000) : undefined,
            duration: parsedDuration,
            waveform: parsedWaveform,
          });
        }

        // More chunks remain — return intermediate response
        return res.status(200).json({ message: 'Chunk received' });
      } catch (err) {
        logger.error('Chunk upload error:', { message: err.message, stack: err.stack });
        // Clean up tracking on error
        if (typeof scopeHash !== 'undefined' && typeof safeUploadId !== 'undefined') {
          trackUploadEnd(scopeHash, safeUploadId);
        }
        
        const providerLimit = /maximum is\s+10485760/i.test(err.message || '');
        return res.status(providerLimit ? 413 : 502).json({
          error: providerLimit
            ? 'File too large for the current upload provider path. Files are allowed only upto 10 MBs in size. Please try again after the latest server deploy.'
            : `Upload failed: ${err.message || 'Chunk upload failed.'}`,
        });
      }
    });
  });

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
          ...(isObjectId ? [{ _id: messageId }] : [])
        ]
      };

      // Find message to delete from DB
      const messageToDelete = await Message.findOne(queryFilter);

      if (messageToDelete && messageToDelete.url) {
        let isCloudinary = false;
        try {
          const parsed = new URL(messageToDelete.url);
          isCloudinary = parsed.hostname === 'res.cloudinary.com' || parsed.hostname.endsWith('.cloudinary.com');
        } catch {}
        if (isCloudinary) {
          const parsedAsset = parseCloudinaryAssetFromUrl(messageToDelete.url);
          const targetPublicId = parsedAsset?.publicId || (typeof messageToDelete.id === 'string' && messageToDelete.id.includes('/') ? messageToDelete.id : null);
          const targetResourceType = parsedAsset?.resourceType || 'image';
          if (targetPublicId) {
            try {
              if (targetResourceType === 'video') {
                await cloudinary.uploader.destroy(targetPublicId, { resource_type: 'video', invalidate: true });
              } else if (targetResourceType === 'raw') {
                await cloudinary.uploader.destroy(targetPublicId, { resource_type: 'raw', invalidate: true });
              } else {
                await cloudinary.uploader.destroy(targetPublicId, { resource_type: 'image', invalidate: true });
              }
            } catch (cloudErr) {
              logger.warn('Cloudinary destroy error during message delete:', { error: cloudErr.message });
            }
          }
        }
      }

      await Message.deleteOne(queryFilter);
      const canonicalId = messageToDelete?.id || messageId;
      const targetReplyIds = Array.from(new Set([
        messageId,
        canonicalId,
        ...(messageToDelete?._id ? [String(messageToDelete._id)] : [])
      ])).filter(Boolean);

      await Message.updateMany(
        { roomId, 'replyingTo.id': { $in: targetReplyIds } },
        { $set: { 'replyingTo.isDeleted': true, 'replyingTo.deletedBy': 'admin' } }
      ).catch((e) => logger.error('Failed to update replyingTo on media message delete:', e));
      await unpinIfPinned(wss, roomId, targetReplyIds);

      // Synchronize MessageEvent so admin audit history reflects message deletion
      const eventFilter = [
        { messageId: { $in: targetReplyIds } },
        { 'message.id': { $in: targetReplyIds } },
        ...(isObjectId ? [{ 'message._id': messageId }] : [])
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
      wss.clients.forEach(client => {
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
    let roomIdentifiers = [roomId];

    if (roomId !== 'me' && roomId !== 'global') {
      try {
        const roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
        if (roomDoc) {
          roomId = roomDoc.id;
          roomIdentifiers = Array.from(new Set([roomDoc.id, roomDoc.alias, rawRoomId.trim()].filter(Boolean)));
        }
      } catch (_) {}
    }

    try {
      // Clean up Cloudinary assets before purging messages from DB
      const messagesWithMedia = await Message.find({
        roomId: { $in: roomIdentifiers },
        url: { $exists: true, $ne: null }
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

    if (roomId !== 'me' && roomId !== 'global') {
      try {
        const roomDoc = await Room.findOne({ $or: [{ id: roomId }, { alias: roomId }] }).lean();
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

  // Mount modular sub-routers
  router.use('/', require('./gifs'));

  router.use('/', require('./linkPreview'));
  router.use('/', require('./download'));
  router.use('/', require('./messages'));

  return router;
};

// Export getVisibleMessagesQuery so websocket.js can use it for user_join history send.
module.exports.getVisibleMessagesQuery = (getFrontendHiddenBeforeFn) => (beforeTimestamp) => {
  const createdAt = {};
  const frontendHiddenBefore = getFrontendHiddenBeforeFn();

  if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
    createdAt.$gt = frontendHiddenBefore;
  }

  if (beforeTimestamp instanceof Date && !Number.isNaN(beforeTimestamp.getTime())) {
    createdAt.$lt = beforeTimestamp;
  }

  const query = { vanished: { $ne: true }, type: { $ne: 'client_diagnostic' } };
  if (Object.keys(createdAt).length > 0) {
    query.createdAt = createdAt;
  }
  return query;
};
