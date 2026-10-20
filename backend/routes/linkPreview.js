'use strict';

const express = require('express');
const http = require('http');
const https = require('https');
const dns = require('dns');
const axios = require('axios');
const logger = require('../logger');
const { isPrivateOrInternalIp } = require('../security');
const { apiLimiter } = require('../middleware');

const router = express.Router();

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

        let resolvedIp;
        try { ({ address: resolvedIp } = await dns.promises.lookup(rawHostname, { family: 4 })); }
        catch { throw new Error('Could not resolve hostname'); }
        if (isPrivateOrInternalIp(resolvedIp)) throw new Error('Invalid URL');

        const isHttps = parsedUrl.protocol === 'https:';
        const reqModule = isHttps ? https : http;

        const requestOptions = {
          protocol: parsedUrl.protocol,
          hostname: rawHostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: 'GET',
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
          const timeout = setTimeout(() => {
            reqInstance.destroy();
            reject(new Error('Request timeout'));
          }, 5000);

          const reqInstance = reqModule.request(requestOptions, (response) => {
            const status = response.statusCode || 0;

            if ([301, 302, 303, 307, 308].includes(status)) {
              clearTimeout(timeout);
              response.resume();
              const locationHeader = response.headers.location;
              if (!locationHeader) {
                return reject(new Error('Redirect with no location header'));
              }
              const nextUrl = new URL(locationHeader, currentUrl).href;
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
          });

          reqInstance.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });

          reqInstance.end();
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

      const getMetaBy = (attr, val) => {
        const regex = new RegExp(`<meta[^>]+(?:${attr}=["']${val}["'][^>]+content=["']([^"']*)["']|content=["']([^"']*)["'][^>]+${attr}=["']${val}["'])`, 'i');
        const m = html.match(regex);
        const matchVal = m ? (m[1] || m[2]) : null;
        return matchVal ? decode(matchVal) : null;
      };

      const getFavicon = () => {
        const m = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
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
      
      let rawImage = getMetaBy('property', 'og:image') || getMetaBy('name', 'twitter:image');
      
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

      if (isFinalAmazon && rawImage && rawImage.includes('m.media-amazon.com/images/I/')) {
        rawImage = rawImage
          .replace(/\._[a-z0-9_]+_\.jpg$/i, '._SY250_.jpg')
          .replace(/\.jpg$/i, '._SY250_.jpg')
          .replace(/\._SY250_\._SY250_\.jpg/i, '._SY250_.jpg');
      }

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

module.exports = router;
