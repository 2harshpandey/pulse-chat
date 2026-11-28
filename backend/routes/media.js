// --- Media, Upload, and Chat Management Routes ---

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const logger = require('../logger');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const User = require('../models/user');
const { getRoomState, getCachedRoom } = require('../state');
const {
  uploadLimiter,
  chunkUploadLimiter,
  apiLimiter,
  extractIp,
} = require('../middleware');
const {
  sanitizeDownloadFilename,
  generateSafePublicId,
} = require('../security');
const { isRoomAccessAllowed } = require('../roomAccess');
const { filterValidReactions } = require('../reactions');
const {
  MONGODB_CANDIDATE_URL_REGEX,
  normalizeUrl,
  detectFirstUrl,
  isValidExternalHttpUrl,
} = require('../utils/urlUtils');
const {
  isAudioMimeOrExt,
  getUploadResourceType,
  getMessageFileType,
} = require('../mediaTypes');

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

const BLOCKED_MIME_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-executable',
  'application/x-bat',
  'application/x-sh'
]);

const BLOCKED_EXTENSIONS = new Set([
  '.svg', '.html', '.htm', '.xhtml', '.exe', '.dll', '.bat', '.cmd', '.sh', '.vbs', '.js', '.mjs', '.scr'
]);

const isSafeUploadFile = (mimetype, filename) => {
  const mime = String(mimetype || '').toLowerCase().trim();
  if (BLOCKED_MIME_TYPES.has(mime)) return false;
  const ext = path.extname(filename || '').toLowerCase().trim();
  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  return true;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEMORY_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isSafeUploadFile(file.mimetype, file.originalname)) {
      return cb(new Error('File type not allowed for upload.'));
    }
    cb(null, true);
  },
});

// Dedicated isolated directory for chunk upload temp files
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'pulse_uploads');
try {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true, mode: 0o700 });
} catch (_) {}

// Issue 5: Per-session concurrent upload cap — prevents disk exhaustion DoS.
// A single authenticated session (roomId:userId scope) may have at most 3 active
// incomplete chunk uploads at once. Requests beyond this cap return 429.
const activeChunkUploads = new Map(); // scopeHash -> Map<uploadId, number>
const activeIpUploads = new Map(); // clientIp -> Map<uploadId, number>
const MAX_CONCURRENT_CHUNK_UPLOADS = 3;
const MAX_CONCURRENT_IP_UPLOADS = 6;
const CHUNK_UPLOAD_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

const trackUploadStart = (scopeHash, uploadId, clientIp = 'unknown') => {
  const now = Date.now();
  let ipExisting = activeIpUploads.get(clientIp);
  if (!ipExisting) {
    ipExisting = new Map();
    activeIpUploads.set(clientIp, ipExisting);
  }
  for (const [id, ts] of ipExisting.entries()) {
    if (now - ts > CHUNK_UPLOAD_TIMEOUT_MS) ipExisting.delete(id);
  }
  if (!ipExisting.has(uploadId) && ipExisting.size >= MAX_CONCURRENT_IP_UPLOADS) {
    return false;
  }

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
  ipExisting.set(uploadId, now);
  existing.set(uploadId, now);
  return true;
};

const trackUploadEnd = (scopeHash, uploadId, clientIp = 'unknown') => {
  const existing = activeChunkUploads.get(scopeHash);
  if (existing) {
    existing.delete(uploadId);
    if (existing.size === 0) activeChunkUploads.delete(scopeHash);
  }
  const ipExisting = activeIpUploads.get(clientIp);
  if (ipExisting) {
    ipExisting.delete(uploadId);
    if (ipExisting.size === 0) activeIpUploads.delete(clientIp);
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

const uploadStreamToCloudinary = (createReadStream, mimetype, originalName) => new Promise((resolve, reject) => {
  const safeMime = mimetype || '';
  const resourceType = getUploadResourceType(safeMime, originalName);
  const { fullPublicId, ext } = generateSafePublicId(originalName, resourceType);

  const isAudio = isAudioMimeOrExt(safeMime, originalName);
  const isVideo = resourceType === 'video';
  const isActualVideo = isVideo && !isAudio;
  const uploadOptions = {
    resource_type: resourceType,
    public_id: fullPublicId,
    chunk_size: 6 * 1024 * 1024,
    use_filename: false,
    unique_filename: false,
    overwrite: false,
    filename_override: originalName,
    disable_promises: true,
    // For actual videos (not audio), use async processing so Cloudinary returns the URL immediately
    // without waiting for transcoding to complete. This prevents the HTTP connection
    // from being held open for 1-3+ minutes, which causes Azure/proxy 230s timeouts
    // that make the frontend think the upload failed ('Failed to fetch').
    ...(isActualVideo ? { async: true } : {}),
    // Explicit timeout: 8 minutes. Cloudinary SDK default is unset (relying on Node
    // HTTP defaults), which means proxy idle timeouts can fire first.
    timeout: 8 * 60 * 1000,
  };

  let settled = false;
  const safeReject = (err) => {
    if (settled) return;
    settled = true;
    reject(err);
  };
  const safeResolve = (res) => {
    if (settled) return;
    settled = true;
    resolve(res);
  };

  const uploadStream = cloudinary.uploader.upload_chunked_stream(uploadOptions, (error, result) => {
    if (error) return safeReject(error);
    // For non-async uploads (audio, photos, documents), Cloudinary MUST return a confirmed secure_url
    if (!result?.secure_url && result?.public_id) {
      if (!isActualVideo) {
        return safeReject(new Error('Cloudinary upload failed: no secure URL was returned.'));
      }
      result.secure_url = cloudinary.url(result.public_id, {
        resource_type: result.resource_type || 'video',
        format: result.format || ext || (isAudio ? (ext || 'mp3') : isVideo ? 'mp4' : undefined),
        secure: true,
        version: result.version,
      });
    }

    if (!result?.secure_url) {
      return safeReject(new Error('Cloudinary upload did not return or generate a secure URL.'));
    }
    return safeResolve(result);
  });

  const readStream = createReadStream();
  readStream.on('error', (err) => {
    try { uploadStream.destroy(); } catch (_) {}
    safeReject(err);
  });
  uploadStream.on('error', (err) => {
    try { readStream.destroy(); } catch (_) {}
    safeReject(err);
  });
  readStream.pipe(uploadStream);
});

const uploadBufferToCloudinary = (file, originalName) =>
  uploadStreamToCloudinary(() => Readable.from(file.buffer), file.mimetype, originalName);

const uploadFileStreamToCloudinary = (filePath, mimetype, originalName) =>
  uploadStreamToCloudinary(() => fs.createReadStream(filePath), mimetype, originalName);

const resolveCanonicalRoomId = async (rawRoomId) => {
  const clean = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const lower = clean.toLowerCase();
  if (lower === 'me' || lower === 'global') return lower;
  try {
    const room = await getCachedRoom(clean);
    if (room?.id) return room.id;
  } catch (_) {}
  return clean;
};

module.exports = (wss, broadcasts) => {
  const { broadcastToAdmins } = broadcasts;
  const router = express.Router();

  const pendingPreUploads = new Map(); // publicId -> { publicId, resourceType, secureUrl, originalName, mimetype, size, roomId, userId, scopeHash, discardKey, duration, waveform, createdAt }
  const preUploadIdToPublicId = new Map(); // `${scopeHash}:${uploadId}` -> publicId
  const discardedPreUploads = new Map(); // `${scopeHash}:${uploadId}` -> expiresAt
  const PREUPLOAD_TTL_MS = 30 * 60 * 1000;
  const DISCARD_TOMBSTONE_TTL_MS = 5 * 60 * 1000;
  const MAX_PENDING_PREUPLOADS_PER_SCOPE = 30;

  const destroyCloudinaryPreUpload = async (publicId, resourceType = 'image', context = 'pre-upload discard') => {
    if (!publicId) return;
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true,
      });
    } catch (err) {
      logger.warn(`Failed to destroy Cloudinary asset during ${context}:`, { publicId, error: err?.message });
    }
  };

  const prunePendingPreUploads = async () => {
    const now = Date.now();
    for (const [key, expiresAt] of discardedPreUploads.entries()) {
      if (expiresAt <= now) discardedPreUploads.delete(key);
    }
    for (const [pid, entry] of pendingPreUploads.entries()) {
      if (now - entry.createdAt > PREUPLOAD_TTL_MS) {
        pendingPreUploads.delete(pid);
        if (entry.discardKey) preUploadIdToPublicId.delete(entry.discardKey);
        await destroyCloudinaryPreUpload(entry.publicId, entry.resourceType, 'expired pre-upload TTL');
      }
    }
  };
  setInterval(prunePendingPreUploads, 5 * 60 * 1000).unref();

  const requireRoomAccessBeforeUpload = async (req, res, next) => {
    try {
      const rawRoomId = req.headers['x-room-id'] || req.query?.roomId;
      const roomId = await resolveCanonicalRoomId(rawRoomId);
      const allowed = await isRoomAccessAllowed(roomId, req, { requireSession: true });
      if (!allowed) {
        return res.status(401).json({ error: 'Upload denied: room authentication required.' });
      }
      req.verifiedUploadRoomId = roomId;
      next();
    } catch (err) {
      next(err);
    }
  };

  /**
   * Validates room/user header-vs-body consistency and returns canonical room + user identity.
   */
  const resolveUploadContext = async (req, res, body) => {
    const headerRoomId = typeof req.headers['x-room-id'] === 'string' ? req.headers['x-room-id'].trim() : '';
    const bodyRoomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (headerRoomId && bodyRoomId && headerRoomId.toLowerCase() !== bodyRoomId.toLowerCase()) {
      res.status(400).json({ error: 'Mismatched roomId in request.' });
      return null;
    }
    const rawRoomId = headerRoomId || bodyRoomId || 'me';

    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const bodyUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    if (headerUserId && bodyUserId && headerUserId !== bodyUserId) {
      res.status(400).json({ error: 'Mismatched userId in request.' });
      return null;
    }
    const userId = headerUserId || bodyUserId;

    const canonicalRoomId = await resolveCanonicalRoomId(rawRoomId);
    if (req.verifiedUploadRoomId !== canonicalRoomId) {
      const allowed = await isRoomAccessAllowed(canonicalRoomId, req, { requireSession: true });
      if (!allowed) {
        res.status(401).json({ error: 'Upload denied: room authentication required.' });
        return null;
      }
    }

    return { canonicalRoomId, userId };
  };

  /**
   * Resolves uploader display name, records a MessageEvent, notifies admins, and responds with upload JSON.
   */
  const finalizeUploadedMedia = async ({
    req,
    res,
    canonicalRoomId,
    userId,
    originalName,
    mimetype,
    size,
    uploaded,
    eventErrorLabel,
    logSuffix = '',
  }) => {
    const { onlineUsers } = getRoomState(canonicalRoomId);
    const isAdminHeaderUpload = Boolean(typeof req.headers['x-admin-password'] === 'string' && req.headers['x-admin-password']);
    const verifiedUserId = isAdminHeaderUpload ? 'admin' : userId;
    let username = isAdminHeaderUpload ? 'Admin' : onlineUsers.get(verifiedUserId)?.username;

    if (!username) {
      // Cast to string to prevent NoSQL injection from object payloads (CodeQL Alert)
      const user = await User.findOne({ userId: String(verifiedUserId), roomId: canonicalRoomId });
      username = user?.username || 'Unknown';
    }

    const event = new MessageEvent({
      roomId: canonicalRoomId,
      type: 'upload',
      messageId: uploaded.public_id,
      file: {
        originalname: originalName,
        mimetype,
        size,
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
      },
      userId: verifiedUserId,
      username,
      timestamp: new Date().toISOString(),
    });
    event.save().catch((e) => logger.error(eventErrorLabel, e));

    broadcastToAdmins(canonicalRoomId, 'history', event);
    broadcastToAdmins(canonicalRoomId, 'activity', `File '${originalName}' uploaded by '${username}'.`);
    logger.info(`File uploaded to room ${canonicalRoomId}${logSuffix}: ${originalName}`);

    const parsedDuration = req.body?.duration ? Number(req.body.duration) : undefined;
    let parsedWaveform;
    if (req.body?.waveform) {
      try {
        parsedWaveform = typeof req.body.waveform === 'string' ? JSON.parse(req.body.waveform) : req.body.waveform;
      } catch {}
    }

    return res.status(200).json({
      id: uploaded.public_id,
      type: getMessageFileType(mimetype || '', originalName),
      url: uploaded.secure_url,
      originalName,
      size,
      text: typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 5000) : undefined,
      duration: parsedDuration,
      waveform: parsedWaveform,
    });
  };

  const sendUploadErrorResponse = (res, err, fallbackMessage) => {
    const providerLimit = /maximum is\s+10485760/i.test(err?.message || '');
    return res.status(providerLimit ? 413 : 502).json({
      error: providerLimit
        ? 'File too large for the current upload provider path. Files are allowed only upto 10 MBs in size. Please try again after the latest server deploy.'
        : `Upload failed: ${err?.message || fallbackMessage}`,
    });
  };

  // --- File Upload ---
  router.post('/api/upload', uploadLimiter, requireRoomAccessBeforeUpload, (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        logger.error(`Upload middleware error: ${err.message}`);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large for direct upload (max 25 MB). Please use chunked upload for larger files.' });
        }
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

      const context = await resolveUploadContext(req, res, req.body);
      if (!context) return;

      const originalName = sanitizeUploadFilename(req.file.originalname);

      try {
        const uploaded = await uploadBufferToCloudinary(req.file, originalName);
        return await finalizeUploadedMedia({
          req,
          res,
          canonicalRoomId: context.canonicalRoomId,
          userId: context.userId,
          originalName,
          mimetype: req.file.mimetype,
          size: req.file.size,
          uploaded,
          eventErrorLabel: 'Failed to save upload event:',
        });
      } catch (uploadError) {
        logger.error('Cloudinary upload error:', {
          message: uploadError.message,
          http_code: uploadError.http_code,
          name: uploadError.name,
        });
        return sendUploadErrorResponse(res, uploadError, 'Cloudinary upload failed.');
      }
    });
  });

  const getChunkUploadTempPath = (safeUploadId, roomId, req) => {
    const callerId = req.headers['x-user-id'] || req.body?.userId || req.query?.userId || 'anon';
    const clientIp = extractIp(req);
    const cleanRoom = typeof roomId === 'string' && roomId.trim() ? roomId.trim() : 'me';
    const cleanUser = typeof callerId === 'string' && callerId.trim() ? callerId.trim() : 'anon';
    // Bind scope to room, user, and verified client IP to eliminate cross-session collisions and spoofing
    const scopeHash = crypto.createHash('sha256').update(`${cleanRoom}:${cleanUser}:${clientIp}`).digest('hex').slice(0, 16);
    return { tmpPath: path.join(UPLOAD_TEMP_DIR, `pulse_upload_${scopeHash}_${safeUploadId}`), scopeHash, clientIp };
  };

  // --- Resumable File Upload (Chunked) ---
  router.get('/api/upload/status', apiLimiter, async (req, res) => {
    const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
    const rawClean = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
    const allowed = await isRoomAccessAllowed(rawClean, req, { requireSession: true });
    if (!allowed) {
      return res.status(401).json({ error: 'Access denied: room authentication required.' });
    }
    const roomId = await resolveCanonicalRoomId(rawClean);

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

  router.post('/api/upload/chunk', chunkUploadLimiter, requireRoomAccessBeforeUpload, (req, res) => {
    upload.single('chunk')(req, res, async (err) => {
      if (err) {
        logger.error(`Upload chunk middleware error: ${err.message}`);
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }
      let safeUploadId;
      let scopeHash;
      let chunkClientIp = 'unknown';
      try {
        const { uploadId, chunkIndex, totalChunks, originalname, mimetype } = req.body;
        if (!uploadId || typeof uploadId !== 'string' || !req.file) {
          return res.status(400).json({ error: 'Missing or invalid chunk data' });
        }

        if (originalname && !isSafeUploadFile(mimetype, originalname)) {
          return res.status(400).json({ error: 'File type not allowed for upload.' });
        }

        const context = await resolveUploadContext(req, res, req.body);
        if (!context) return;
        const { canonicalRoomId: roomId, userId } = context;

        safeUploadId = path.basename(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeUploadId || safeUploadId !== uploadId) {
          return res.status(400).json({ error: 'Invalid uploadId format' });
        }

        const currentChunk = parseInt(chunkIndex, 10);
        const total = parseInt(totalChunks, 10);
        if (!Number.isInteger(total) || total < 1 || total > 1000 || !Number.isInteger(currentChunk) || currentChunk < 0 || currentChunk >= total) {
          return res.status(400).json({ error: 'Invalid chunkIndex or totalChunks' });
        }

        const chunkStart = parseInt(req.body.chunkStart, 10);
        if (!Number.isFinite(chunkStart) || chunkStart < 0) {
          return res.status(400).json({ error: 'Invalid chunkStart offset' });
        }
        if (chunkStart + req.file.buffer.length > MAX_UPLOAD_BYTES) {
          return res.status(413).json({
            error: `Upload exceeds maximum allowed size of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
          });
        }

        const chunkPathInfo = getChunkUploadTempPath(safeUploadId, roomId, req);
        const tmpPath = chunkPathInfo.tmpPath;
        scopeHash = chunkPathInfo.scopeHash;
        chunkClientIp = chunkPathInfo.clientIp;
        const isPreUpload = req.body?.isPreUpload === 'true' || req.body?.isPreUpload === true;
        const discardKey = `${scopeHash}:${safeUploadId}`;

        if (isPreUpload && discardedPreUploads.has(discardKey)) {
          try { await fs.promises.unlink(tmpPath); } catch (_) {}
          trackUploadEnd(scopeHash, safeUploadId, chunkClientIp);
          return res.status(410).json({ error: 'Pre-upload was discarded.' });
        }

        // Verify sequential chunk order before reserving an upload tracking slot
        let currentFileSize = 0;
        try {
          const stats = await fs.promises.stat(tmpPath);
          currentFileSize = stats.size;
        } catch (_) {}

        if (chunkStart > currentFileSize) {
          return res.status(400).json({ error: `Non-sequential chunk rejected. Expected offset <= ${currentFileSize}, got ${chunkStart}.` });
        }

        // Issue 5: Enforce concurrent upload cap — reject if session or IP already has MAX active uploads
        if (!trackUploadStart(scopeHash, safeUploadId, chunkClientIp)) {
          return res.status(429).json({ error: 'Too many concurrent uploads from this session. Please wait for a current upload to complete.' });
        }

        const fileHandle = await fs.promises.open(
          tmpPath,
          fs.constants.O_CREAT | fs.constants.O_RDWR,
          0o600
        );
        try {
          await fileHandle.write(req.file.buffer, 0, req.file.buffer.length, chunkStart);
        } finally {
          await fileHandle.close();
        }

        if (currentChunk === total - 1) {
          // Upload complete, stream directly from disk to Cloudinary
          const stats = await fs.promises.stat(tmpPath);
          const safeName = sanitizeUploadFilename(originalname || 'file');
          const fileMime = mimetype || 'application/octet-stream';
          const fileSize = stats.size;

          if (!isSafeUploadFile(fileMime, safeName)) {
            try { await fs.promises.unlink(tmpPath); } catch (_) {}
            trackUploadEnd(scopeHash, safeUploadId, chunkClientIp);
            return res.status(400).json({ error: 'File type not allowed for upload.' });
          }

          let uploaded;
          try {
            uploaded = await uploadFileStreamToCloudinary(tmpPath, fileMime, safeName);
            try {
              await fs.promises.unlink(tmpPath);
            } catch (e) {
              logger.error(`Failed to delete temp file ${tmpPath}:`, e);
            }
          } catch (uploadError) {
            logger.error('Failed to stream full file to Cloudinary:', uploadError);
            trackUploadEnd(scopeHash, safeUploadId, chunkClientIp);
            return res.status(502).json({ error: `Upload to storage failed: ${uploadError.message}` });
          }

          trackUploadEnd(scopeHash, safeUploadId, chunkClientIp);
          const resourceType = getUploadResourceType(fileMime, safeName);

          if (isPreUpload && discardedPreUploads.has(discardKey)) {
            await destroyCloudinaryPreUpload(uploaded.public_id, resourceType, 'cancelled mid-flight pre-upload');
            return res.status(410).json({ error: 'Pre-upload was discarded.' });
          }

          if (isPreUpload) {
            const isAdminHeaderUpload = Boolean(typeof req.headers['x-admin-password'] === 'string' && req.headers['x-admin-password']);
            const verifiedUserId = isAdminHeaderUpload ? 'admin' : userId;
            const parsedDuration = req.body?.duration ? Number(req.body.duration) : undefined;
            let parsedWaveform;
            if (req.body?.waveform) {
              try {
                parsedWaveform = typeof req.body.waveform === 'string' ? JSON.parse(req.body.waveform) : req.body.waveform;
              } catch {}
            }

            // Enforce per-session pending pre-upload cap to prevent unbounded orphan storage
            const scopeEntries = [];
            for (const entry of pendingPreUploads.values()) {
              if (entry.scopeHash === scopeHash) scopeEntries.push(entry);
            }
            if (scopeEntries.length >= MAX_PENDING_PREUPLOADS_PER_SCOPE) {
              scopeEntries.sort((a, b) => a.createdAt - b.createdAt);
              const oldest = scopeEntries[0];
              if (oldest) {
                pendingPreUploads.delete(oldest.publicId);
                if (oldest.discardKey) preUploadIdToPublicId.delete(oldest.discardKey);
                destroyCloudinaryPreUpload(oldest.publicId, oldest.resourceType, 'pre-upload scope cap eviction');
              }
            }

            pendingPreUploads.set(uploaded.public_id, {
              publicId: uploaded.public_id,
              resourceType,
              secureUrl: uploaded.secure_url,
              originalName: safeName,
              mimetype: fileMime,
              size: fileSize,
              roomId,
              userId: verifiedUserId,
              scopeHash,
              discardKey,
              duration: parsedDuration,
              waveform: parsedWaveform,
              createdAt: Date.now(),
            });
            preUploadIdToPublicId.set(discardKey, uploaded.public_id);

            return res.status(200).json({
              id: uploaded.public_id,
              type: getMessageFileType(fileMime, safeName),
              url: uploaded.secure_url,
              originalName: safeName,
              size: fileSize,
              isPreUpload: true,
              duration: parsedDuration,
              waveform: parsedWaveform,
            });
          }

          return await finalizeUploadedMedia({
            req,
            res,
            canonicalRoomId: roomId,
            userId,
            originalName: safeName,
            mimetype: fileMime,
            size: fileSize,
            uploaded,
            eventErrorLabel: 'Failed to save chunk upload event:',
            logSuffix: ' via chunks',
          });
        }

        // More chunks remain — return intermediate response
        return res.status(200).json({ message: 'Chunk received' });
      } catch (err) {
        logger.error('Chunk upload error:', { message: err.message, stack: err.stack });
        if (scopeHash && safeUploadId) {
          trackUploadEnd(scopeHash, safeUploadId, chunkClientIp);
        }
        return sendUploadErrorResponse(res, err, 'Chunk upload failed.');
      }
    });
  });

  // --- Commit a completed background pre-upload once user clicks Send ---
  router.post('/api/upload/commit', apiLimiter, requireRoomAccessBeforeUpload, async (req, res) => {
    try {
      const context = await resolveUploadContext(req, res, req.body);
      if (!context) return;

      const publicId = typeof req.body?.publicId === 'string' ? req.body.publicId.trim() : '';
      if (!publicId) {
        return res.status(400).json({ error: 'Missing publicId' });
      }

      const entry = pendingPreUploads.get(publicId);
      if (!entry) {
        return res.status(404).json({ error: 'Pending pre-upload not found or already expired.' });
      }

      const isAdminHeaderUpload = Boolean(typeof req.headers['x-admin-password'] === 'string' && req.headers['x-admin-password']);
      const verifiedUserId = isAdminHeaderUpload ? 'admin' : context.userId;
      if (entry.roomId !== context.canonicalRoomId || entry.userId !== verifiedUserId) {
        return res.status(403).json({ error: 'Forbidden: pre-upload ownership mismatch.' });
      }

      pendingPreUploads.delete(publicId);
      if (entry.discardKey) preUploadIdToPublicId.delete(entry.discardKey);

      if (req.body.duration === undefined && entry.duration !== undefined) {
        req.body.duration = entry.duration;
      }
      if (req.body.waveform === undefined && entry.waveform !== undefined) {
        req.body.waveform = entry.waveform;
      }

      return await finalizeUploadedMedia({
        req,
        res,
        canonicalRoomId: context.canonicalRoomId,
        userId: context.userId,
        originalName: entry.originalName,
        mimetype: entry.mimetype,
        size: entry.size,
        uploaded: {
          public_id: entry.publicId,
          secure_url: entry.secureUrl,
        },
        eventErrorLabel: 'Failed to save committed pre-upload event:',
        logSuffix: ' (pre-uploaded)',
      });
    } catch (err) {
      logger.error('Pre-upload commit error:', { message: err.message });
      return res.status(500).json({ error: 'Failed to commit pre-upload.' });
    }
  });

  // --- Discard cancelled or aborted background pre-uploads ---
  router.post('/api/upload/discard', apiLimiter, requireRoomAccessBeforeUpload, async (req, res) => {
    try {
      const context = await resolveUploadContext(req, res, req.body);
      if (!context) return;

      const isAdminHeaderUpload = Boolean(typeof req.headers['x-admin-password'] === 'string' && req.headers['x-admin-password']);
      const verifiedUserId = isAdminHeaderUpload ? 'admin' : context.userId;

      const rawUploadIds = [
        ...(typeof req.body?.uploadId === 'string' ? [req.body.uploadId] : []),
        ...(Array.isArray(req.body?.uploadIds) ? req.body.uploadIds : []),
      ].slice(0, 50);

      const linkedPublicIds = [];
      for (const rawUploadId of rawUploadIds) {
        if (typeof rawUploadId !== 'string' || !rawUploadId) continue;
        const safeUploadId = path.basename(rawUploadId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeUploadId || safeUploadId !== rawUploadId) continue;

        const chunkPathInfo = getChunkUploadTempPath(safeUploadId, context.canonicalRoomId, req);
        const discardKey = `${chunkPathInfo.scopeHash}:${safeUploadId}`;
        discardedPreUploads.set(
          discardKey,
          Date.now() + DISCARD_TOMBSTONE_TTL_MS
        );
        const mappedPid = preUploadIdToPublicId.get(discardKey);
        if (mappedPid) {
          preUploadIdToPublicId.delete(discardKey);
          linkedPublicIds.push(mappedPid);
        }
        try {
          await fs.promises.unlink(chunkPathInfo.tmpPath);
        } catch (_) {}
        trackUploadEnd(chunkPathInfo.scopeHash, safeUploadId, chunkPathInfo.clientIp);
      }

      const rawPublicIds = [
        ...(typeof req.body?.publicId === 'string' ? [req.body.publicId] : []),
        ...(Array.isArray(req.body?.publicIds) ? req.body.publicIds : []),
        ...linkedPublicIds,
      ].slice(0, 100);

      for (const pid of rawPublicIds) {
        if (typeof pid !== 'string' || !pid) continue;
        const entry = pendingPreUploads.get(pid);
        if (!entry) continue;
        if (entry.roomId !== context.canonicalRoomId || entry.userId !== verifiedUserId) {
          continue;
        }
        pendingPreUploads.delete(pid);
        if (entry.discardKey) preUploadIdToPublicId.delete(entry.discardKey);
        await destroyCloudinaryPreUpload(entry.publicId, entry.resourceType, 'preview discard');
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      logger.error('Pre-upload discard error:', { message: err.message });
      return res.status(500).json({ error: 'Failed to discard pre-upload.' });
    }
  });

  // --- Room Media Gallery ---
  router.get('/api/media/gallery', apiLimiter, async (req, res) => {
    try {
      const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
      let roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
      const callerUserId = req.headers['x-user-id'] || req.query.userId;

      const allowed = await isRoomAccessAllowed(roomId, req);
      if (!allowed) {
        logger.warn(`[MediaGallery] Access denied for room: ${roomId}, caller: ${callerUserId}`);
        return res.status(401).json({ error: 'Access denied: authentication or room password required' });
      }

      const lowerGalleryRoom = roomId.toLowerCase();
      if (lowerGalleryRoom === 'me' || lowerGalleryRoom === 'global') {
        roomId = lowerGalleryRoom;
      } else {
        try {
          const roomDoc = await getCachedRoom(roomId);
          if (roomDoc) roomId = roomDoc.id;
        } catch (_) {}
      }

      const { type, before, limit: rawLimit } = req.query;
      const validTypes = new Set(['photo', 'image', 'video', 'audio', 'doc', 'file', 'link']);

      if (type !== undefined && type !== null && type !== '') {
        if (typeof type !== 'string' || !validTypes.has(type.toLowerCase())) {
          return res.status(400).json({ error: 'Invalid type parameter' });
        }
      }

      let beforeDate = null;
      if (before !== undefined && before !== null && before !== '') {
        if (typeof before !== 'string') {
          return res.status(400).json({ error: 'Invalid before cursor' });
        }
        beforeDate = new Date(before);
        if (Number.isNaN(beforeDate.getTime())) {
          return res.status(400).json({ error: 'Invalid before cursor date' });
        }
      }

      const requestedLimit = parseInt(rawLimit, 10);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 80)
        : 40;

      const { frontendHiddenBefore } = getRoomState(roomId);
      const query = {
        roomId,
        vanished: { $ne: true },
        isDeleted: { $ne: true },
      };

      const createdAtFilter = {};
      if (frontendHiddenBefore instanceof Date && !Number.isNaN(frontendHiddenBefore.getTime())) {
        createdAtFilter.$gt = frontendHiddenBefore;
      }
      if (beforeDate) {
        createdAtFilter.$lt = beforeDate;
      }
      if (Object.keys(createdAtFilter).length > 0) {
        query.createdAt = createdAtFilter;
      }

      const cleanType = typeof type === 'string' ? type.toLowerCase() : null;
      const isValidGalleryMessage = (item) => {
        if (!item) return false;
        if (item.type === 'image' || item.type === 'gif' || item.type === 'photo' || item.type === 'video' || item.type === 'audio' || item.type === 'file' || item.type === 'doc') {
          return typeof item.url === 'string' && item.url.trim().length > 0;
        }
        if (item.type === 'link' || item.type === 'text') {
          const hasValidUrlField =
            typeof item.url === 'string' &&
            (isValidExternalHttpUrl(item.url) || (item.type === 'link' && Boolean(normalizeUrl(item.url))));
          const hasValidTextUrl = typeof item.text === 'string' && Boolean(detectFirstUrl(item.text));
          return hasValidUrlField || hasValidTextUrl;
        }
        return false;
      };

      if (cleanType === 'photo' || cleanType === 'image') {
        query.type = { $in: ['image', 'gif', 'photo'] };
        query.url = { $exists: true, $nin: [null, ''] };
      } else if (cleanType === 'video') {
        query.type = 'video';
        query.url = { $exists: true, $nin: [null, ''] };
      } else if (cleanType === 'audio') {
        query.type = 'audio';
        query.url = { $exists: true, $nin: [null, ''] };
      } else if (cleanType === 'doc' || cleanType === 'file') {
        query.type = { $in: ['file', 'doc'] };
        query.url = { $exists: true, $nin: [null, ''] };
      } else if (cleanType === 'link') {
        query.$or = [
          { type: 'link', url: { $exists: true, $nin: [null, ''] } },
          { type: { $in: ['text', 'link'] }, text: { $regex: MONGODB_CANDIDATE_URL_REGEX } },
        ];
      } else {
        query.$or = [
          { type: { $in: ['image', 'video', 'file', 'gif', 'photo', 'doc'] }, url: { $exists: true, $nin: [null, ''] } },
          { type: 'link', url: { $exists: true, $nin: [null, ''] } },
          { type: { $in: ['text', 'link'] }, text: { $regex: MONGODB_CANDIDATE_URL_REGEX } },
        ];
      }

      const needsLinkValidation = !cleanType || cleanType === 'link';
      const collected = [];
      let hasMore = false;
      let fallbackCursorDate = null;

      if (!needsLinkValidation) {
        const messages = await Message.find(query)
          .select('id _id type url originalName size createdAt timestamp userId username text duration reactions')
          .sort({ createdAt: -1 })
          .limit(limit + 1)
          .lean();
        hasMore = messages.length > limit;
        collected.push(...(hasMore ? messages.slice(0, limit) : messages));
      } else {
        const MAX_LINK_FILTER_BATCHES = 5;
        let batchBefore = beforeDate;
        for (let batch = 0; batch < MAX_LINK_FILTER_BATCHES; batch += 1) {
          if (
            frontendHiddenBefore instanceof Date &&
            !Number.isNaN(frontendHiddenBefore.getTime()) &&
            batchBefore &&
            batchBefore.getTime() <= frontendHiddenBefore.getTime()
          ) {
            hasMore = false;
            break;
          }

          const batchQuery = { ...query };
          if (batchBefore) {
            batchQuery.createdAt = {
              ...(query.createdAt || {}),
              $lt: batchBefore,
            };
          }

          const batchMessages = await Message.find(batchQuery)
            .select('id _id type url originalName size createdAt timestamp userId username text duration reactions')
            .sort({ createdAt: -1 })
            .limit(limit + 1)
            .lean();

          const batchHasMore = batchMessages.length > limit;
          const pageRows = batchHasMore ? batchMessages.slice(0, limit) : batchMessages;

          for (const row of pageRows) {
            if (isValidGalleryMessage(row)) {
              collected.push(row);
              if (collected.length > limit) break;
            }
          }

          if (collected.length > limit) {
            hasMore = true;
            break;
          }

          if (!batchHasMore || pageRows.length === 0) {
            hasMore = false;
            break;
          }

          const lastRaw = pageRows[pageRows.length - 1];
          const lastRawDate = lastRaw ? (lastRaw.createdAt || lastRaw.timestamp) : null;
          if (!lastRawDate) {
            hasMore = false;
            break;
          }
          const parsedLastRawDate = new Date(lastRawDate);
          if (
            Number.isNaN(parsedLastRawDate.getTime()) ||
            (batchBefore && parsedLastRawDate.getTime() >= batchBefore.getTime())
          ) {
            hasMore = false;
            break;
          }
          batchBefore = parsedLastRawDate;
          fallbackCursorDate = parsedLastRawDate;
          hasMore = batch === MAX_LINK_FILTER_BATCHES - 1;
        }
      }

      const results = collected.length > limit ? collected.slice(0, limit) : collected;
      const lastItem = results.length > 0 ? results[results.length - 1] : null;
      const cursorDate = hasMore
        ? (collected.length > limit && lastItem
            ? (lastItem.createdAt || lastItem.timestamp)
            : fallbackCursorDate)
        : null;
      const nextCursor = cursorDate
        ? new Date(cursorDate).toISOString()
        : null;

      const items = results.map((item) => {
        const resolvedLinkUrl =
          (item.type === 'link' || item.type === 'text')
            ? (isValidExternalHttpUrl(item.url) ? item.url : (detectFirstUrl(item.text) || undefined))
            : undefined;
        return {
          id: String(item.id || item._id || ''),
          type: item.type,
          url: typeof item.url === 'string' ? item.url : undefined,
          linkUrl: resolvedLinkUrl,
          originalName: typeof item.originalName === 'string' ? item.originalName.slice(0, 500) : undefined,
          size: typeof item.size === 'number' ? item.size : undefined,
          createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : (item.timestamp ? new Date(item.timestamp).toISOString() : undefined),
          userId: typeof item.userId === 'string' ? item.userId : undefined,
          username: typeof item.username === 'string' ? item.username.slice(0, 200) : undefined,
          text: typeof item.text === 'string' ? item.text.slice(0, 1000) : undefined,
          duration: typeof item.duration === 'number' ? item.duration : undefined,
          reactions: filterValidReactions(item.reactions),
        };
      });

      res.status(200).json({ items, hasMore, nextCursor });
    } catch (error) {
      logger.error('Failed to fetch media gallery items:', error);
      res.status(500).json({ error: 'Failed to fetch media gallery' });
    }
  });

  router._pendingPreUploads = pendingPreUploads;
  router._preUploadIdToPublicId = preUploadIdToPublicId;
  router._discardedPreUploads = discardedPreUploads;
  return router;
};
