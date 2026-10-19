'use strict';

const express = require('express');
const axios = require('axios');
const logger = require('../logger');
const {
  isAllowedDownloadHost,
  getAllowedDownloadHost,
  runWithSafeRedirects,
  sanitizeDownloadFilename,
  getSignedCloudinaryDownloadUrl,
} = require('../security');
const { apiLimiter } = require('../middleware');

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

module.exports = router;
