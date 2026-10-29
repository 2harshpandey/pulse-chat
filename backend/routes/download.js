'use strict';

const express = require('express');
const axios = require('axios');
const logger = require('../logger');
const Message = require('../models/message');
const {
  isAllowedDownloadHost,
  getAllowedDownloadHost,
  runWithSafeRedirects,
  sanitizeDownloadFilename,
  getSignedCloudinaryDownloadUrl,
  parseCloudinaryAssetFromUrl,
} = require('../security');
const { apiLimiter } = require('../middleware');
const { isRoomAccessAllowed } = require('./messages');

// Issue 13: Allowlist of content types safe to echo back to the browser.
// Any type not in this set defaults to application/octet-stream (force-download)
// to prevent stored-XSS via text/html or script payloads rendered inline.
const SAFE_DOWNLOAD_CONTENT_TYPES = new Set([
  'application/octet-stream', 'application/pdf', 'application/zip',
  'application/x-zip-compressed', 'application/x-rar-compressed', 'application/gzip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'image/svg+xml', 'image/bmp', 'image/tiff', 'image/x-icon',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
  'audio/flac', 'audio/x-flac', 'audio/opus', 'audio/mp4', 'audio/x-m4a',
  'text/plain', // plain text is safe; html/js/css are intentionally excluded
]);

const sanitizeContentType = (raw) => {
  const mimeOnly = String(raw || '').split(';')[0].trim().toLowerCase();
  return SAFE_DOWNLOAD_CONTENT_TYPES.has(mimeOnly) ? mimeOnly : 'application/octet-stream';
};

const router = express.Router();

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

    // Verify room access authorization for media belonging to chat rooms
    let targetRoomId = null;
    const cleanUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
    let associatedMessage = await Message.findOne({
      $or: [{ url: rawUrl }, { url: cleanUrl }]
    }).lean();

    const parsedAsset = parseCloudinaryAssetFromUrl(rawUrl);
    if (!associatedMessage && parsedAsset && parsedAsset.publicId) {
      const safePublicId = parsedAsset.publicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      associatedMessage = await Message.findOne({
        $or: [
          { url: { $regex: safePublicId } },
          { id: parsedAsset.publicId }
        ]
      }).lean();
    }

    if (associatedMessage && associatedMessage.roomId) {
      targetRoomId = associatedMessage.roomId;
    } else if (parsedAsset) {
      // Cloudinary asset not found in database messages: reject untrusted fallback
      return res.status(404).json({ error: 'Media not found or access denied.' });
    } else {
      const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
      targetRoomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
    }

    const isAllowed = await isRoomAccessAllowed(targetRoomId, req);
    if (!isAllowed) {
      return res.status(401).json({ error: 'Access denied: room authentication required to download media.' });
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
    if (req.headers.range && typeof req.headers.range === 'string') {
      const cleanRange = req.headers.range.trim();
      if (/^bytes=(?:\d+-\d*|-\d+)$/.test(cleanRange) && cleanRange.length <= 64) {
        upstreamHeaders['Range'] = cleanRange;
      }
    }

    const getSafeAxiosUrl = (urlStr) => {
      const u = new URL(urlStr);
      const allowedHost = getAllowedDownloadHost(u.hostname);
      if (!allowedHost) throw new Error('Untrusted host in proxy');

      // Reconstruct URL using the server-controlled allowedHost string to satisfy CodeQL.
      // The URL constructor already safely resolves any path traversal (../) attempts.
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
    const rawContentType = String(payloadResponse.headers['content-type'] || 'application/octet-stream');
    const contentType = sanitizeContentType(rawContentType);
    const upstreamLength = Number.parseInt(String(payloadResponse.headers['content-length'] || ''), 10);

    logger.info(`[Download] File download: ${safeFilename}`, {
      filename: safeFilename,
      size: upstreamLength || undefined,
      contentType,
      ip: req.ip || req.socket?.remoteAddress,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Cache-Control', 'private, max-age=120');
    
    if (payloadResponse.headers['accept-ranges']) res.setHeader('Accept-Ranges', payloadResponse.headers['accept-ranges']);
    if (payloadResponse.headers['content-range']) res.setHeader('Content-Range', payloadResponse.headers['content-range']);
    
    if (Number.isFinite(upstreamLength) && upstreamLength > 0) {
      res.setHeader('Content-Length', String(upstreamLength));
    }
    
    res.status(payloadResponse.status === 206 ? 206 : 200);

    payloadResponse.data.on('error', (streamErr) => {
      logger.error('Download upstream stream error:', {
        message: streamErr?.message,
        code: streamErr?.code,
      });
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to download file stream.' });
      } else {
        res.destroy(streamErr);
      }
    });

    res.on('close', () => {
      if (payloadResponse.data && !payloadResponse.data.destroyed) {
        payloadResponse.data.destroy();
      }
    });
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

module.exports = router;
