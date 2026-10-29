'use strict';

const express = require('express');
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const axios = require('axios');
const logger = require('../logger');
const { isPrivateOrInternalIp } = require('../security');
const { apiLimiter, getClientIp } = require('../middleware');
// Issue 6: Tighter, dedicated rate limiter for link-preview — this endpoint fetches
// external URLs on behalf of the user and can amplify DoS/enumeration if abused.
const rateLimit = require('express-rate-limit');
const previewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, default: true },
  keyGenerator: getClientIp,
  message: { error: 'Too many link preview requests. Please slow down.' },
  skip: (req) => req.method === 'OPTIONS',
});
const { isRoomAccessAllowed } = require('./messages');

const router = express.Router();

const linkPreviewCache = new Map(); // url -> { timestamp: number, data: object }
const PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_PREVIEW_CACHE_SIZE = 500;

const getFromPreviewCache = (key) => {
  const item = linkPreviewCache.get(key);
  if (item && (Date.now() - item.timestamp < PREVIEW_CACHE_TTL_MS)) {
    return item.data;
  }
  if (item) linkPreviewCache.delete(key);
  return null;
};

const setToPreviewCache = (key, data) => {
  if (linkPreviewCache.size >= MAX_PREVIEW_CACHE_SIZE) {
    const oldestKey = linkPreviewCache.keys().next().value;
    linkPreviewCache.delete(oldestKey);
  }
  linkPreviewCache.set(key, { timestamp: Date.now(), data });
};

// Issue 10: Normalize URL before using as a cache key to prevent:
//   (a) cache-busting via arbitrary query params (utm_source, tracking tokens, etc.)
//   (b) cache poisoning via protocol variant races (http vs https same domain)
// We keep origin + pathname only; preview content almost never differs by query param.
const getPreviewCacheKey = (rawUrl) => {
  try {
    const u = new URL(rawUrl);
    return `https://${u.host}${u.pathname}`;
  } catch {
    return rawUrl;
  }
};

router.get('/api/link-preview', previewLimiter, async (req, res) => {
  try {
    const rawRoomId = req.headers['x-room-id'] || req.query.roomId;
    const roomId = typeof rawRoomId === 'string' && rawRoomId.trim() ? rawRoomId.trim() : 'me';
    const allowed = await isRoomAccessAllowed(roomId, req);
    if (!allowed) {
      return res.status(401).json({ error: 'Access denied: room authentication required.' });
    }

    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL parameter required' });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid URL' });

    // Use normalized key for cache lookup to prevent cache poisoning (Issue 10)
    const cacheKey = getPreviewCacheKey(url);
    const cached = getFromPreviewCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let parsedUrlFallback;
    try { parsedUrlFallback = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    
    const hostnameFallback = parsedUrlFallback.hostname.toLowerCase();
    let fallbackTitle = null;
    let fallbackDescription = null;
    let fallbackSiteName = null;
    let fallbackImage = null;

    const isAmazon = hostnameFallback === 'amazon.com' || hostnameFallback.endsWith('.amazon.com') || /(?:^|\.)amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(hostnameFallback) || hostnameFallback === 'amzn.in' || hostnameFallback === 'amzn.to';
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
        const oembedRes = await axios.get(oembedUrl, { timeout: 3000, maxRedirects: 0 });
        if (oembedRes.data && oembedRes.data.title) {
          const rawThumb = typeof oembedRes.data.thumbnail_url === 'string' ? oembedRes.data.thumbnail_url.trim() : null;
          let safeThumb = null;
          if (rawThumb) {
            try {
              const u = new URL(rawThumb);
              if (u.protocol === 'http:' || u.protocol === 'https:') safeThumb = u.href;
            } catch (_) {}
          }
          const ytResult = {
            title: oembedRes.data.title,
            description: oembedRes.data.author_name ? `By ${oembedRes.data.author_name}` : null,
            image: safeThumb,
            favicon: 'https://www.youtube.com/favicon.ico',
            hostname: hostnameFallback,
            siteName: 'YouTube',
            url: url
          };
          setToPreviewCache(url, ytResult);
          return res.json(ytResult);
        }
      } catch {
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

        let resolvedAddresses;
        try {
          resolvedAddresses = await dns.promises.lookup(rawHostname, { all: true });
        } catch {
          throw new Error('Could not resolve hostname');
        }
        if (!Array.isArray(resolvedAddresses) || resolvedAddresses.length === 0) {
          throw new Error('Could not resolve hostname');
        }
        for (const record of resolvedAddresses) {
          if (isPrivateOrInternalIp(record.address)) {
            throw new Error('Invalid URL');
          }
        }
        const pinnedRecord = resolvedAddresses[0];
        const pinnedIp = pinnedRecord.address;
        const pinnedFamily = pinnedRecord.family || (net.isIPv6(pinnedIp) ? 6 : 4);

        const isHttps = parsedUrl.protocol === 'https:';
        const reqModule = isHttps ? https : http;

        const requestOptions = {
          protocol: parsedUrl.protocol,
          hostname: rawHostname,
          servername: rawHostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: 'GET',
          lookup: (_hostname, _options, callback) => {
            callback(null, pinnedIp, pinnedFamily);
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Connection': 'close',
          },
        };

        const result = await new Promise((resolve, reject) => {
          let reqInstance;
          const timeout = setTimeout(() => {
            if (reqInstance) reqInstance.destroy();
            reject(new Error('Request timeout'));
          }, 5000);

          try {
            reqInstance = reqModule.request(requestOptions, (response) => {
              try {
                const status = response.statusCode || 0;

                if ([301, 302, 303, 307, 308].includes(status)) {
                  clearTimeout(timeout);
                  response.resume();
                  const locationHeader = response.headers.location;
                  if (!locationHeader) {
                    return reject(new Error('Redirect with no location header'));
                  }
                  let nextUrl;
                  try {
                    nextUrl = new URL(locationHeader, currentUrl).href;
                  } catch {
                    return reject(new Error('Invalid redirect URL'));
                  }
                  return resolve({ redirected: true, nextUrl });
                }

                if (status < 200 || status >= 400) {
                  clearTimeout(timeout);
                  response.resume();
                  return reject(new Error(`HTTP ${status}`));
                }

                const contentType = response.headers['content-type'] || '';
                if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
                  clearTimeout(timeout);
                  response.resume();
                  return reject(new Error('URL does not point to HTML content'));
                }

                let body = '';
                let bytesRead = 0;
                const MAX_BYTES = 512 * 1024;

                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                  body += chunk;
                  bytesRead += Buffer.byteLength(chunk, 'utf8');
                  if (bytesRead >= MAX_BYTES || body.includes('</head>')) {
                    clearTimeout(timeout);
                    response.destroy();
                    resolve({ redirected: false, parsedUrl, html: body });
                  }
                });

                response.on('end', () => {
                  clearTimeout(timeout);
                  resolve({ redirected: false, parsedUrl, html: body });
                });

                response.on('error', (err) => {
                  clearTimeout(timeout);
                  reject(err);
                });
              } catch (resErr) {
                clearTimeout(timeout);
                try { response.resume(); } catch (_) {}
                reject(resErr);
              }
            });

            reqInstance.on('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });

            reqInstance.end();
          } catch (initErr) {
            clearTimeout(timeout);
            reject(initErr);
          }
        });

        if (result.redirected) {
          currentUrl = result.nextUrl;
          if (redirectCount === MAX_REDIRECTS) {
            throw new Error('Too many redirects');
          }
          continue;
        }

        finalParsedUrl = result.parsedUrl;
        finalHtml = result.html;
        break;
      }
    } catch (err) {
      fetchError = err;
    }

    let title = null;
    let description = null;
    let image = null;
    let favicon = null;
    let siteName = null;

    if (finalHtml) {
      const html = finalHtml;
      const decode = (str) => {
        if (!str) return str;
        return str
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim();
      };

      const extractAttr = (tag, attrName) => {
        const regex = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
        const m = tag.match(regex);
        return m ? (m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3])) : null;
      };

      const metaMap = new Map();
      const metaTags = html.match(/<meta\s+[^>]*>/gi) || [];
      for (const tag of metaTags) {
        const prop = extractAttr(tag, 'property') || extractAttr(tag, 'name') || extractAttr(tag, 'itemprop');
        const content = extractAttr(tag, 'content');
        if (prop && content !== null && content !== undefined) {
          const key = prop.toLowerCase().trim();
          if (!metaMap.has(key)) {
            metaMap.set(key, decode(content));
          }
        }
      }

      const getMeta = (...keys) => {
        for (const key of keys) {
          const val = metaMap.get(key.toLowerCase());
          if (val) return val;
        }
        return null;
      };

      const getFavicon = () => {
        const linkTags = html.match(/<link[^>]+>/gi) || [];
        const extractHref = (tag) => {
          const href = extractAttr(tag, 'href');
          return href ? decode(href) : null;
        };
        // 1. High-res apple touch icons
        for (const tag of linkTags) {
          if (/rel=["'][^"']*apple-touch-icon[^"']*["']/i.test(tag)) {
            const href = extractHref(tag);
            if (href) return href;
          }
        }
        // 2. Standard icons or shortcut icons
        for (const tag of linkTags) {
          if (/rel=["'][^"']*\bicon\b[^"']*["']/i.test(tag) || /rel=["'][^"']*shortcut\s+icon[^"']*["']/i.test(tag)) {
            const href = extractHref(tag);
            if (href) return href;
          }
        }
        // 3. image_src link
        for (const tag of linkTags) {
          if (/rel=["'][^"']*image_src[^"']*["']/i.test(tag)) {
            const href = extractHref(tag);
            if (href) return href;
          }
        }
        return null;
      };

      const getTitle = () => {
        const m = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
        return m ? decode(m[1]) : null;
      };

      title = getMeta('og:title', 'twitter:title') || getTitle();
      description = getMeta('og:description', 'twitter:description', 'description');
      siteName = getMeta('og:site_name');
      
      const rawFavicon = getFavicon();
      favicon = rawFavicon ? (() => {
        try {
          const u = new URL(rawFavicon, finalParsedUrl);
          return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
        } catch { return null; }
      })() : null;

      let rawImage = getMeta('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'image');
      
      const finalHostname = finalParsedUrl ? finalParsedUrl.hostname.toLowerCase() : hostnameFallback;
      const isFinalAmazon = finalHostname === 'amazon.com' || finalHostname.endsWith('.amazon.com') || /(?:^|\.)amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(finalHostname) || finalHostname === 'amzn.in' || finalHostname === 'amzn.to';
      
      if (isFinalAmazon) {
        const landingImageMatch = html.match(/<img[^>]+id=["'](?:landingImage|imgBlkFront|main-image|main-image-nonjs)["'][^>]*>/i);
        if (landingImageMatch) {
          const dataOldHiresMatch = landingImageMatch[0].match(/data-old-hires=["']([^"']+)["']/i);
          const srcMatch = landingImageMatch[0].match(/src=["']([^"']+)["']/i);
          const dataDynamic = landingImageMatch[0].match(/data-a-dynamic-image=["']([^"']+)["']/i);
          
          if (dataOldHiresMatch && dataOldHiresMatch[1]) {
            rawImage = dataOldHiresMatch[1];
          } else if (dataDynamic && dataDynamic[1]) {
            try {
              const parsedDynamic = JSON.parse(dataDynamic[1].replace(/&quot;/g, '"'));
              rawImage = Object.keys(parsedDynamic)[0] || rawImage;
            } catch {}
          } else if (srcMatch && srcMatch[1]) {
            rawImage = srcMatch[1];
          }
        }
      }

      if (isFinalAmazon && rawImage) {
        try {
          const parsedRawImage = new URL(rawImage, finalParsedUrl);
          if (
            (parsedRawImage.hostname === 'm.media-amazon.com' || parsedRawImage.hostname.endsWith('.media-amazon.com')) &&
            parsedRawImage.pathname.startsWith('/images/I/')
          ) {
            rawImage = rawImage
              .replace(/\._[a-z0-9_]+_\.jpg$/i, '._SY250_.jpg')
              .replace(/\.jpg$/i, '._SY250_.jpg')
              .replace(/\._SY250_\._SY250_\.jpg/i, '._SY250_.jpg');
          }
        } catch {}
      }

      image = rawImage ? (() => {
        try {
          const u = new URL(rawImage, finalParsedUrl);
          return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
        } catch { return null; }
      })() : null;

      if (!favicon && finalParsedUrl) {
        favicon = `${finalParsedUrl.origin}/favicon.ico`;
      }
    }

    if (!favicon && finalParsedUrl) {
      favicon = `${finalParsedUrl.origin}/favicon.ico`;
    }

    title = title || fallbackTitle;
    description = description || fallbackDescription;
    siteName = siteName || fallbackSiteName;
    image = image || fallbackImage;

    if (!title && !description && !image && fetchError) {
      throw fetchError;
    }

    const hostname = finalParsedUrl ? finalParsedUrl.hostname.replace(/^www\./, '') : parsedUrlFallback.hostname.replace(/^www\./, '');

    const result = { title, description, image, favicon, hostname, siteName };
    setToPreviewCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    logger.error('Link preview fetch error:', { message: error.message });
    res.status(500).json({ error: 'Failed to fetch preview' });
  }
});

module.exports = router;
