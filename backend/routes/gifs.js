'use strict';

const express = require('express');
const axios = require('axios');
const logger = require('../logger');
const { apiLimiter } = require('../middleware');
const { isRoomAccessAllowed } = require('./messages');

const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
const GIPHY_API_URL = 'https://api.giphy.com/v1/gifs';

const router = express.Router();

const sanitizeLog = (str) => {
  if (!str || typeof str !== 'string') return '';
  if (GIPHY_API_KEY) {
    return str.split(GIPHY_API_KEY).join('[REDACTED]');
  }
  return str;
};

const gifCache = new Map(); // key -> { timestamp: number, data: any }
const TRENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SEARCH_TTL_MS = 2 * 60 * 1000;   // 2 minutes

const getFromCache = (key, ttlMs) => {
  const item = gifCache.get(key);
  if (item && (Date.now() - item.timestamp < ttlMs)) {
    return item.data;
  }
  if (item) gifCache.delete(key);
  return null;
};

const setToCache = (key, data) => {
  if (gifCache.size >= 200) {
    const oldestKey = gifCache.keys().next().value;
    gifCache.delete(oldestKey);
  }
  gifCache.set(key, { timestamp: Date.now(), data });
};

router.get('/api/gifs/trending', apiLimiter, async (req, res) => {
  const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
  const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const allowed = await isRoomAccessAllowed(roomId, req);
  if (!allowed) {
    return res.status(401).json({ error: 'Access denied: room authentication required.' });
  }

  const cacheKey = 'trending_gifs';
  const cached = getFromCache(cacheKey, TRENDING_TTL_MS);
  if (cached) {
    return res.json(cached);
  }

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
    setToCache(cacheKey, gifs);
    res.json(gifs);
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : error.message;
    logger.error('Error fetching trending GIFs:', { message: sanitizeLog(error.message), giphyStatus: status, detail: sanitizeLog(detail) });
    res.status(500).json({ error: 'Failed to fetch GIFs from Giphy' });
  }
});

router.get('/api/gifs/search', apiLimiter, async (req, res) => {
  const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
  const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
  const allowed = await isRoomAccessAllowed(roomId, req);
  if (!allowed) {
    return res.status(401).json({ error: 'Access denied: room authentication required.' });
  }

  const query = req.query.q;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Search query is required' });
  if (query.length > 100) return res.status(400).json({ error: 'Search query is too long' });

  const safeQuery = query.toLowerCase().trim();
  const cacheKey = `search_${safeQuery}`;
  const cached = getFromCache(cacheKey, SEARCH_TTL_MS);
  if (cached) {
    return res.json(cached);
  }

  if (!GIPHY_API_KEY) {
    logger.error('GIF search: GIPHY_API_KEY is not set in environment variables.');
    return res.status(503).json({ error: 'GIF service is not configured on this server.' });
  }
  try {
    const response = await axios.get(`${GIPHY_API_URL}/search`, {
      params: { api_key: GIPHY_API_KEY, q: safeQuery, limit: 48, rating: 'g', bundle: 'messaging_non_clips' },
      timeout: 10000,
    });
    const gifs = (response.data.data || []).map((gif) => ({
      id: gif.id,
      preview: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || gif.images?.original?.url || '',
      url: gif.images?.original?.url || ''
    }));
    setToCache(cacheKey, gifs);
    res.json(gifs);
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : error.message;
    logger.error('Error searching GIFs:', { message: sanitizeLog(error.message), giphyStatus: status, detail: sanitizeLog(detail) });
    res.status(500).json({ error: 'Failed to fetch GIFs from Giphy' });
  }
});

module.exports = router;
