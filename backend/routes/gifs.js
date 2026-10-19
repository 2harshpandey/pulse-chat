'use strict';

const express = require('express');
const axios = require('axios');
const logger = require('../logger');

const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
const GIPHY_API_URL = 'https://api.giphy.com/v1/gifs';

const router = express.Router();

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

module.exports = router;
