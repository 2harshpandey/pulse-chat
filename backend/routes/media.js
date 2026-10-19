// --- Media, Upload, GIF, Link Preview, Download, and Messages Routes ---

const express = require('express');
const http = require('http');
const https = require('https');
const dns = require('dns');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const crypto = require('crypto');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const mongoose = require('mongoose');
const logger = require('../logger');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const User = require('../models/user');
const ChatState = require('../models/chatState');
const {
  getRoomState,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
} = require('../state');
const {
  uploadLimiter,
  chunkUploadLimiter,
  apiLimiter,
  adminLimiter,
  adminSecretAuth,
  toClientMessage,
} = require('../middleware');
const {
  isPrivateOrInternalIp,
  isAllowedDownloadHost,
  getAllowedDownloadHost,
  runWithSafeRedirects,
  sanitizeDownloadFilename,
  getSignedCloudinaryDownloadUrl,
} = require('../security');
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
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const getUploadResourceType = (mimetype = '') => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
};

const getMessageFileType = (mimetype = '') => {
  if (mimetype.startsWith('image/')) return 'image';
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
  const resourceType = getUploadResourceType(file.mimetype || '');
  const publicId = `pulse-chat/${safeBase}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const isVideo = resourceType === 'video';
  const uploadOptions = {
    resource_type: resourceType,
    public_id: resourceType === 'raw' && ext ? `${publicId}.${ext}` : publicId,
    chunk_size: 6 * 1024 * 1024,
    use_filename: false,
    unique_filename: false,
    overwrite: false,
    filename_override: originalName,
    // For videos, use async processing so Cloudinary returns the URL immediately
    // without waiting for transcoding to complete. This prevents the HTTP connection
    // from being held open for 1-3+ minutes, which causes Azure/proxy 230s timeouts
    // that make the frontend think the upload failed ('Failed to fetch').
    ...(isVideo ? { async: true } : {}),
    // Explicit timeout: 8 minutes. Cloudinary SDK default is unset (relying on Node
    // HTTP defaults), which means proxy idle timeouts can fire first.
    timeout: 8 * 60 * 1000,
  };

  const uploadStream = cloudinary.uploader.upload_chunked_stream(uploadOptions, (error, result) => {
    if (error) return reject(error);
    // async:true returns status:'pending' and may omit secure_url; we must construct it.
    if (!result?.secure_url && result?.public_id) {
      result.secure_url = cloudinary.url(result.public_id, { 
        resource_type: result.resource_type || (isVideo ? 'video' : 'image'), 
        format: result.format || ext || (isVideo ? 'mp4' : undefined),
        secure: true 
      });
    }
    
    if (!result?.secure_url) {
      return reject(new Error('Cloudinary upload did not return or generate a secure URL.'));
    }
    return resolve(result);
  });

  Readable.from(file.buffer).pipe(uploadStream).on('error', reject);
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

// Giphy API
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
const GIPHY_API_URL = 'https://api.giphy.com/v1/gifs';

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins, broadcast } = broadcasts;
  const router = express.Router();

  // --- File Upload ---
  router.post('/api/upload', uploadLimiter, (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        logger.error(`Upload middleware error: ${err.message}`);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large. Photos or videos are allowed only upto 100 MBs in size.' });
        }
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

      const { userId, roomId = 'me' } = req.body;
      const { onlineUsers } = getRoomState(roomId);
      let username = onlineUsers.get(userId)?.username;
      
      if (!username) {
        // Cast to string to prevent NoSQL injection from object payloads (CodeQL Alert)
        const user = await User.findOne({ userId: String(userId), roomId: String(roomId) });
        username = user?.username || 'Unknown';
      }

      const originalName = sanitizeUploadFilename(req.file.originalname);

      try {
        const uploaded = await uploadBufferToCloudinary(req.file, originalName);

        // Create a MessageEvent for the upload
        const event = new MessageEvent({
          roomId,
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
        event.save();

        broadcastToAdmins(roomId, 'history', event);
        broadcastToAdmins(roomId, 'activity', `File '${originalName}' uploaded by '${username}'.`);

        logger.info(`File uploaded to room ${roomId}: ${originalName}`);

        res.status(200).json({
          id: uploaded.public_id,
          type: getMessageFileType(req.file.mimetype || ''),
          url: uploaded.secure_url,
          originalName,
          size: req.file.size,
          text: req.body.text,
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

  // --- Resumable File Upload (Chunked) ---
  router.get('/api/upload/status', apiLimiter, (req, res) => {
    const { uploadId } = req.query;
    if (!uploadId || typeof uploadId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid uploadId' });
    }
    const safeUploadId = path.basename(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUploadId || safeUploadId !== uploadId) {
      return res.status(400).json({ error: 'Invalid uploadId format' });
    }
    const tmpPath = path.join(os.tmpdir(), `pulse_upload_${safeUploadId}`);
    if (fs.existsSync(tmpPath)) {
      const stats = fs.statSync(tmpPath);
      return res.json({ uploadedBytes: stats.size });
    }
    return res.json({ uploadedBytes: 0 });
  });

  router.post('/api/upload/chunk', chunkUploadLimiter, (req, res) => {
    upload.single('chunk')(req, res, async (err) => {
      if (err) {
        logger.error(`Upload chunk middleware error: ${err.message}`);
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }
      try {
        const { uploadId, chunkIndex, totalChunks, originalname, mimetype, userId, roomId = 'me', text } = req.body;
        if (!uploadId || typeof uploadId !== 'string' || !req.file) {
          return res.status(400).json({ error: 'Missing or invalid chunk data' });
        }
        
        const safeUploadId = path.basename(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeUploadId || safeUploadId !== uploadId) {
          return res.status(400).json({ error: 'Invalid uploadId format' });
        }

        const tmpPath = path.join(os.tmpdir(), `pulse_upload_${safeUploadId}`);
        
        // Write chunk at exact offset to prevent corruption
        const chunkStart = parseInt(req.body.chunkStart, 10) || 0;
        let fd;
        try {
          fd = fs.openSync(tmpPath, 'r+');
        } catch (e) {
          fd = fs.openSync(tmpPath, 'w');
        }
        fs.writeSync(fd, req.file.buffer, 0, req.file.buffer.length, chunkStart);
        fs.closeSync(fd);

        const currentChunk = parseInt(chunkIndex, 10);
        const total = parseInt(totalChunks, 10);

        if (currentChunk === total - 1) {
          // Upload complete, send to Cloudinary
          const finalBuffer = fs.readFileSync(tmpPath);
          
          // Mock a file object for uploadBufferToCloudinary
          const fileObj = {
            buffer: finalBuffer,
            originalname: originalname || 'file',
            mimetype: mimetype || 'application/octet-stream',
            size: finalBuffer.length
          };

          const { onlineUsers } = getRoomState(roomId);
          let username = onlineUsers.get(userId)?.username;
          if (!username) {
            const user = await User.findOne({ userId: String(userId), roomId: String(roomId) });
            username = user?.username || 'Unknown';
          }

          const safeName = sanitizeUploadFilename(fileObj.originalname);
          
          const uploaded = await uploadBufferToCloudinary(fileObj, safeName);

          // Create a MessageEvent for the upload
          const event = new MessageEvent({
            roomId,
            type: 'upload',
            file: {
              originalname: safeName,
              mimetype: fileObj.mimetype,
              size: fileObj.size,
            },
            userId,
            username,
            timestamp: new Date().toISOString(),
          });
          event.save();

          broadcastToAdmins(roomId, 'history', event);
          broadcastToAdmins(roomId, 'activity', `File '${safeName}' uploaded by '${username}'.`);

          logger.info(`File uploaded to room ${roomId} via chunks: ${safeName}`);

          // Cleanup
          try { fs.unlinkSync(tmpPath); } catch (e) { logger.error(`Failed to delete temp file ${tmpPath}`); }

          return res.status(200).json({
            id: uploaded.public_id,
            type: getMessageFileType(fileObj.mimetype || ''),
            url: uploaded.secure_url,
            originalName: safeName,
            size: fileObj.size,
            text: text,
          });
        }

        return res.status(200).json({ message: 'Chunk received' });
      } catch (err) {
        logger.error('Chunk upload error:', { message: err.message, stack: err.stack });
        
        if (req.body && typeof req.body.uploadId === 'string') {
          const safeUploadId = path.basename(req.body.uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
          if (safeUploadId) {
            const tmpPath = path.join(os.tmpdir(), `pulse_upload_${safeUploadId}`);
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {} // Clean up on failure
          }
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

  // --- Delete Message ---
  router.delete('/api/delete/:id', apiLimiter, async (req, res) => {
    try {
      const messageId = req.params.id;
      const roomId = req.headers['x-room-id'] || 'me';
      if (!messageId) return res.status(400).json({ error: 'No message ID provided.' });
      logger.info(`Delete request for message ID: ${messageId} in room ${roomId}`);

      // Find message to delete from DB
      const messageToDelete = await Message.findOne({ id: messageId, roomId });

      if (messageToDelete && messageToDelete.url && messageToDelete.url.includes('cloudinary')) {
        const publicId = messageToDelete.id;
        if (publicId.includes('/')) {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
          await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
        }
      }

      await Message.deleteOne({ id: messageId, roomId });

      const deleteMessage = { type: 'delete', id: messageId };
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
          client.send(JSON.stringify(deleteMessage));
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
    const roomId = req.headers['x-room-id'] || 'me';
    try {
      await Promise.all([
        Message.deleteMany({ roomId }),
        MessageEvent.deleteMany({ roomId })
      ]);

      broadcast(wss, roomId, { type: 'chat_cleared' });

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
    const roomId = req.headers['x-room-id'] || 'me';
    try {
      const hiddenBefore = new Date();

      await ChatState.findOneAndUpdate(
        { roomId },
        { $set: { roomId, frontendHiddenBefore: hiddenBefore } },
        { upsert: true, setDefaultsOnInsert: true }
      );

      getRoomState(roomId).frontendHiddenBefore = hiddenBefore;

      broadcast(wss, roomId, { type: 'chat_hidden_for_everyone', hiddenBefore: hiddenBefore.toISOString() });

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

  const query = { vanished: { $ne: true } };
  if (Object.keys(createdAt).length > 0) {
    query.createdAt = createdAt;
  }
  return query;
};
