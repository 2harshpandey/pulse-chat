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

  // --- GIF Routes (Giphy) ---
  router.get('/api/gifs/trending', async (req, res) => {
    if (!GIPHY_API_KEY) {
      logger.error('GIF trending: GIPHY_API_KEY is not set in environment variables.');
      return res.status(503).json({ error: 'GIF service is not configured on this server.' });
    }
    try {
      const response = await axios.get(`${GIPHY_API_URL}/trending`, {
        params: { api_key: GIPHY_API_KEY, limit: 48, rating: 'g', bundle: 'messaging_non_clips' },
        timeout: 10000,
      });
      const gifs = (response.data.data || []).map((gif) => ({
        id: gif.id,
        preview: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || gif.images?.original?.url || '',
        url: gif.images?.original?.url || ''
      }));
      res.json(gifs);
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : error.message;
      logger.error('Error fetching trending GIFs:', { message: error.message, giphyStatus: status, detail });
      res.status(500).json({ error: 'Failed to fetch GIFs from Giphy' });
    }
  });

  router.get('/api/gifs/search', async (req, res) => {
    if (!GIPHY_API_KEY) {
      logger.error('GIF search: GIPHY_API_KEY is not set in environment variables.');
      return res.status(503).json({ error: 'GIF service is not configured on this server.' });
    }
    try {
      const query = req.query.q;
      if (!query) return res.status(400).json({ error: 'Search query is required' });
      const response = await axios.get(`${GIPHY_API_URL}/search`, {
        params: { api_key: GIPHY_API_KEY, q: query, limit: 48, rating: 'g', bundle: 'messaging_non_clips' },
        timeout: 10000,
      });
      const gifs = (response.data.data || []).map((gif) => ({
        id: gif.id,
        preview: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || gif.images?.original?.url || '',
        url: gif.images?.original?.url || ''
      }));
      res.json(gifs);
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : error.message;
      logger.error('Error searching GIFs:', { message: error.message, giphyStatus: status, detail });
      res.status(500).json({ error: 'Failed to fetch GIFs from Giphy' });
    }
  });

  // --- Link Preview ---
  router.get('/api/link-preview', apiLimiter, async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL parameter required' });
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid URL' });

      let parsedUrlFallback;
      try { parsedUrlFallback = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
      
      const hostnameFallback = parsedUrlFallback.hostname.toLowerCase();
      let fallbackTitle = null;
      let fallbackDescription = null;
      let fallbackSiteName = null;
      let fallbackImage = null;

      const isAmazon = hostnameFallback === 'amazon.com' || hostnameFallback.endsWith('.amazon.com') || /(?:^|\.)amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(hostnameFallback);
      if (isAmazon) {
        fallbackSiteName = 'Amazon';
        const pathParts = parsedUrlFallback.pathname.split('/');
        if (parsedUrlFallback.searchParams.has('k')) {
          const keyword = parsedUrlFallback.searchParams.get('k').replace(/\+/g, ' ');
          fallbackTitle = `Amazon.com: ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}`;
          fallbackDescription = `Amazon.com: ${keyword}`;
        } else {
          for (let i = 0; i < pathParts.length; i++) {
            if ((pathParts[i] === 'dp' || pathParts[i] === 'gp') && i > 0) {
              const productName = pathParts[i - 1].replace(/-/g, ' ');
              if (productName && productName.length > 2) {
                fallbackTitle = `Amazon: ${productName}`;
                fallbackDescription = productName;
              }
              break;
            }
          }
        }
      }

      const isYouTube = hostnameFallback === 'youtube.com' || hostnameFallback.endsWith('.youtube.com') || hostnameFallback === 'youtu.be' || hostnameFallback.endsWith('.youtu.be');
      if (isYouTube) {
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
          const oembedRes = await axios.get(oembedUrl, { timeout: 3000 });
          if (oembedRes.data && oembedRes.data.title) {
            return res.json({
              title: oembedRes.data.title,
              description: oembedRes.data.author_name ? `By ${oembedRes.data.author_name}` : null,
              image: oembedRes.data.thumbnail_url,
              siteName: 'YouTube',
              url: url
            });
          }
        } catch (e) {
          // OEmbed failed, fallback to manual parsing
        }

        fallbackSiteName = 'YouTube';
        let videoId = null;
        if (hostnameFallback === 'youtu.be' || hostnameFallback.endsWith('.youtu.be')) {
          const pathParts = parsedUrlFallback.pathname.split('/');
          if (pathParts.length > 1 && pathParts[1]) {
            videoId = pathParts[1];
          }
        } else {
          const pathParts = parsedUrlFallback.pathname.split('/');
          if (pathParts.length > 2 && (pathParts[1] === 'shorts' || pathParts[1] === 'live')) {
            videoId = pathParts[2];
          } else {
            videoId = parsedUrlFallback.searchParams.get('v');
          }
        }
        
        if (videoId) {
          fallbackImage = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }
      }

      const MAX_REDIRECTS = 3;
      let currentUrl = url;
      let finalParsedUrl = null;
      let finalHtml = '';
      
      let fetchError = null;

      try {
        for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
          let parsedUrl;
          try { parsedUrl = new URL(currentUrl); } catch { throw new Error('Invalid URL'); }

          const port = parsedUrl.port;
          if (port && port !== '80' && port !== '443') throw new Error('Invalid URL');

          if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Invalid URL');
          }

          const rawHostname = parsedUrl.hostname;

          let resolvedIp;
          try { ({ address: resolvedIp } = await dns.promises.lookup(rawHostname, { family: 4 })); }
          catch { throw new Error('Could not resolve hostname'); }
          if (isPrivateOrInternalIp(resolvedIp)) throw new Error('Invalid URL');

          const isHttps = parsedUrl.protocol === 'https:';
          const reqModule = isHttps ? https : http;
          const reqPath = (parsedUrl.pathname || '/') + (parsedUrl.search || '');
          const reqPort = parsedUrl.port ? Number(parsedUrl.port) : (isHttps ? 443 : 80);

          const response = await new Promise((resolve, reject) => {
            const opts = {
              hostname: resolvedIp,
              port: reqPort,
              path: reqPath,
              method: 'GET',
              headers: {
                'Host': rawHostname,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Connection': 'close',
              },
              ...(isHttps ? { servername: rawHostname, rejectUnauthorized: true } : {}),
            };

            const request = reqModule.request(opts, (incoming) => {
              const statusCode = incoming.statusCode || 0;
              const headers = incoming.headers || {};
              const chunks = [];
              let totalSize = 0;

              incoming.on('data', (chunk) => {
                totalSize += chunk.length;
                if (totalSize > 5 * 1024 * 1024) {
                  request.destroy();
                  return reject(new Error('Response too large'));
                }
                chunks.push(chunk);
              });

              incoming.on('end', () => {
                resolve({
                  statusCode,
                  headers,
                  body: Buffer.concat(chunks).toString('utf8'),
                });
              });
              incoming.on('error', reject);
            });

            request.setTimeout(5000, () => { request.destroy(); reject(new Error('Request timed out')); });
            request.on('error', reject);
            request.end();
          });

          const statusCode = Number(response.statusCode || 0);

          if (statusCode >= 300 && statusCode < 400) {
            const locationHeader = response.headers?.location;
            if (!locationHeader) throw new Error('Redirect without location');
            if (Array.isArray(locationHeader)) throw new Error('Invalid redirect location');
            if (redirectCount >= MAX_REDIRECTS) throw new Error('Too many redirects');

            const nextUrl = new URL(locationHeader, parsedUrl);
            if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
              throw new Error('Invalid redirect protocol');
            }
            currentUrl = nextUrl.href;
            continue;
          }

          if (statusCode < 200 || statusCode >= 300) throw new Error('Bad response');

          const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
          if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
            throw new Error('Unsupported content type');
          }

          finalParsedUrl = parsedUrl;
          finalHtml = String(response.body || '');
          break;
        }
        
        if (!finalParsedUrl || !finalHtml) throw new Error('Failed to fetch preview HTML');
      } catch (err) {
        fetchError = err;
      }

      let title = null;
      let description = null;
      let siteName = null;
      let image = null;

      if (!fetchError && finalHtml) {
        const html = finalHtml;
        const decode = (v) => String(v || '')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim();

        const getMetaBy = (attrName, attrValue) => {
          const m = html.match(new RegExp(`<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']{0,2000})["']`, 'i'))
            || html.match(new RegExp(`<meta[^>]+content=["']([^"']{0,2000})["'][^>]+${attrName}=["']${attrValue}["']`, 'i'));
          return m ? decode(m[1]) : null;
        };

        const getTitle = () => {
          const m = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
          return m ? decode(m[1]) : null;
        };

        title = getMetaBy('property', 'og:title') || getMetaBy('name', 'twitter:title') || getTitle();
        description = getMetaBy('property', 'og:description')
          || getMetaBy('name', 'twitter:description')
          || getMetaBy('name', 'description');
        siteName = getMetaBy('property', 'og:site_name');
        const rawImage = getMetaBy('property', 'og:image') || getMetaBy('name', 'twitter:image');
        image = rawImage ? (() => {
          try { return new URL(rawImage, finalParsedUrl).href; } catch { return null; }
        })() : null;
      }

      title = title || fallbackTitle;
      description = description || fallbackDescription;
      siteName = siteName || fallbackSiteName;
      image = image || fallbackImage;

      if (!title && !description && !image && fetchError) {
        throw fetchError;
      }

      const hostname = finalParsedUrl ? finalParsedUrl.hostname.replace(/^www\./, '') : parsedUrlFallback.hostname.replace(/^www\./, '');

      res.json({ title, description, image, hostname, siteName });
    } catch (error) {
      logger.error('Link preview fetch error:', { message: error.message });
      res.status(500).json({ error: 'Failed to fetch preview' });
    }
  });

  // --- Download Proxy ---
  router.all('/api/download', apiLimiter, async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(405).json({ error: 'Method not allowed.' });
      }

      const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      const requestedFilename = typeof req.query.filename === 'string' ? req.query.filename : '';
      if (!rawUrl) return res.status(400).json({ error: 'URL parameter required.' });

      let parsedUrl;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: 'Invalid URL.' });
      }

      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ error: 'Invalid URL protocol.' });
      }
      if (!isAllowedDownloadHost(parsedUrl.hostname)) {
        return res.status(400).json({ error: 'Untrusted download host.' });
      }

      let pathName = parsedUrl.pathname.split('/').pop() || '';
      try {
        pathName = decodeURIComponent(pathName);
      } catch {
        // Keep raw fallback if decoding fails.
      }

      const fallbackName = sanitizeDownloadFilename(pathName || 'download', 'download');
      const safeFilename = sanitizeDownloadFilename(requestedFilename, fallbackName);
      const contentDisposition = `attachment; filename="${safeFilename.replace(/\"/g, '')}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;

      const upstreamHeaders = {};
      if (req.headers.range) {
        upstreamHeaders['Range'] = req.headers.range;
      }

      const getSafeAxiosUrl = (urlStr) => {
        const u = new URL(urlStr);
        const allowedHost = getAllowedDownloadHost(u.hostname);
        if (!allowedHost) throw new Error('Untrusted host in proxy');
        // Reconstruct URL using the server-controlled allowedHost string to satisfy CodeQL
        return `${u.protocol}//${allowedHost}${u.pathname}${u.search}`;
      };

      const fetchHead = (targetUrl) => axios.head(getSafeAxiosUrl(targetUrl), {
        headers: upstreamHeaders,
        timeout: 20000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const fetchBody = (targetUrl) => axios.get(getSafeAxiosUrl(targetUrl), {
        headers: upstreamHeaders,
        responseType: 'stream',
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const runWithCloudinaryFallback = async (executor) => {
        try {
          return await runWithSafeRedirects(executor, parsedUrl.href);
        } catch (err) {
          const attachmentUrl = getSignedCloudinaryDownloadUrl(parsedUrl.href, safeFilename);
          if (!attachmentUrl) throw err;
          return runWithSafeRedirects(executor, attachmentUrl);
        }
      };

      if (req.method === 'HEAD') {
        const meta = await runWithCloudinaryFallback(fetchHead);
        const contentType = String(meta.headers['content-type'] || 'application/octet-stream');
        const contentLength = Number.parseInt(String(meta.headers['content-length'] || ''), 10);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', contentDisposition);
        res.setHeader('Cache-Control', 'private, max-age=120');
        if (meta.headers['accept-ranges']) res.setHeader('Accept-Ranges', meta.headers['accept-ranges']);
        if (Number.isFinite(contentLength) && contentLength > 0) {
          res.setHeader('Content-Length', String(contentLength));
        }
        return res.status(meta.status === 206 ? 206 : 200).end();
      }

      const payloadResponse = await runWithCloudinaryFallback(fetchBody);
      const contentType = String(payloadResponse.headers['content-type'] || 'application/octet-stream');
      const upstreamLength = Number.parseInt(String(payloadResponse.headers['content-length'] || ''), 10);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', contentDisposition);
      res.setHeader('Cache-Control', 'private, max-age=120');
      
      if (payloadResponse.headers['accept-ranges']) res.setHeader('Accept-Ranges', payloadResponse.headers['accept-ranges']);
      if (payloadResponse.headers['content-range']) res.setHeader('Content-Range', payloadResponse.headers['content-range']);
      
      if (Number.isFinite(upstreamLength) && upstreamLength > 0) {
        res.setHeader('Content-Length', String(upstreamLength));
      }
      
      res.status(payloadResponse.status === 206 ? 206 : 200);
      return payloadResponse.data.pipe(res);
    } catch (error) {
      logger.error('Download proxy error:', {
        message: error.message,
        status: error.response?.status,
        code: error.code,
      });
      return res.status(502).json({ error: 'Failed to download file.' });
    }
  });

  // --- Paginated Messages ---
  router.get('/api/messages/search', apiLimiter, async (req, res) => {
    const roomId = String(req.headers['x-room-id'] || req.query.roomId || 'me');
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }
    try {
      // Find all messages in the room that match the query.
      // Bug fixes:
      //  1. Exclude isDeleted:true (messages deleted for everyone) — they have no text
      //     and should never appear in results regardless of their stored text field.
      //  2. Exclude vanished:true (admin-hidden messages).
      //  3. Exclude messages hidden by the frontendHiddenBefore admin toggle.
      const { frontendHiddenBefore } = getRoomState(roomId);
      const query = {
        roomId,
        text: { $regex: q, $options: 'i' },
        isDeleted: { $ne: true },   // exclude "deleted for everyone" messages
        vanished: { $ne: true },    // exclude admin-vanished messages
      };
      if (frontendHiddenBefore) {
        query.createdAt = { $gte: new Date(frontendHiddenBefore) };
      }
      // Search entire history (no artificial pagination limit for search).
      // Capped at 200 to avoid huge payloads on very common search terms.
      const messages = await Message.find(query).sort({ createdAt: -1 }).limit(200).lean();
      res.json(messages.reverse()); // chronological order for the chat display
    } catch (error) {
      logger.error('Failed to search messages:', error);
      res.status(500).json({ error: 'Failed to search messages' });
    }
  });

  router.get('/api/messages', apiLimiter, async (req, res) => {
    const roomId = String(req.headers['x-room-id'] || req.query.roomId || 'me');
    try {
      const requestedLimit = Number(req.query.limit);
      const pageSize = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_HISTORY_PAGE_SIZE)
        : DEFAULT_HISTORY_PAGE_SIZE;

      const { before } = req.query; // 'before' is the createdAt timestamp of the oldest client-side message

      let beforeDate = null;
      if (typeof before === 'string' && before.trim()) {
        const parsed = new Date(before);
        if (!Number.isNaN(parsed.getTime())) {
          beforeDate = parsed;
        }
      }

      const query = getVisibleMessagesQuery(beforeDate, getRoomState(roomId).frontendHiddenBefore);
      
      const rows = await Message.find({ roomId, ...query })
        .sort({ createdAt: -1 })
        .limit(pageSize + 1)
        .lean();

      const hasMore = rows.length > pageSize;
      const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
      const messages = pageRows.reverse().map(toClientMessage);
      const oldestCreatedAt = messages.length > 0 ? messages[0].createdAt : null;

      // Send oldest-first so client can prepend while preserving chronology.
      res.json({ messages, hasMore, oldestCreatedAt });
    } catch (error) {
      logger.error('Failed to fetch paginated messages:', { message: error.message, stack: error.stack });
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

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
