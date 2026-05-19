// --- SSRF Prevention, IP Validation, Safe URL Building ---
// All helpers are pure functions with no side effects on shared state.

const net = require('net');
const dns = require('dns');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const logger = require('./logger');

// Returns true for loopback, private, and link-local IPs to prevent SSRF.
const isPrivateOrInternalIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 127 ||                           // loopback / unspecified
      (a === 169 && b === 254) ||                       // link-local / AWS metadata
      a === 10 ||                                        // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) ||              // 172.16.0.0/12
      (a === 192 && b === 168) ||                       // 192.168.0.0/16
      a >= 240                                           // reserved
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;         // loopback / unspecified
    if (/^f[cd]/i.test(l)) return true;                // fc00::/7 ULA private
    if (/^fe[89ab][0-9a-f]/i.test(l)) return true;     // fe80::/10 link-local
    if (l.startsWith('::ffff:')) return isPrivateOrInternalIp(l.slice(7)); // IPv4-mapped
    return false;
  }
  return true; // unknown format — block by default
};

const ALLOWED_DOWNLOAD_HOSTS = ['res.cloudinary.com', 'media.tenor.com', 'tenor.com'];

const getAllowedDownloadHost = (hostname) =>
  ALLOWED_DOWNLOAD_HOSTS.find((host) => hostname === host) || '';

const isAllowedDownloadHost = (hostname) => Boolean(getAllowedDownloadHost(hostname));

const isBlockedHostname = (hostname) => {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  return false;
};

const resolveHostnameIps = async (hostname) => {
  try {
    return await dns.promises.lookup(hostname, { all: true });
  } catch (error) {
    logger.warn('DNS lookup failed for hostname', { hostname, message: error.message });
    return [];
  }
};

const buildSafeDownloadUrl = (parsedUrl, allowedHost) => {
  const safeProtocol = 'https:';
  const safeOrigin = `${safeProtocol}//${allowedHost}`;
  const rawPath = parsedUrl.pathname ? parsedUrl.pathname.replace(/\\/g, '/') : '/';
  const normalizedPath = path.posix.normalize(rawPath);
  if (!normalizedPath.startsWith('/') || normalizedPath.startsWith('/..')) {
    throw new Error('Invalid URL path.');
  }
  const safeUrl = new URL(safeOrigin);
  safeUrl.pathname = normalizedPath;
  safeUrl.search = parsedUrl.search || '';
  return safeUrl.href;
};

const assertSafeDownloadUrl = async (targetUrl) => {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Invalid URL protocol.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    throw new Error('Blocked hostname.');
  }

  const allowedHost = getAllowedDownloadHost(hostname);
  if (!allowedHost) {
    throw new Error('Untrusted download host.');
  }

  if (net.isIP(hostname) && isPrivateOrInternalIp(hostname)) {
    throw new Error('Blocked IP address.');
  }

  const resolved = await resolveHostnameIps(hostname);
  if (resolved.length === 0) {
    throw new Error('Failed to resolve hostname.');
  }

  for (const entry of resolved) {
    if (isPrivateOrInternalIp(entry.address)) {
      throw new Error('Blocked internal IP resolution.');
    }
  }

  return buildSafeDownloadUrl(parsed, allowedHost);
};

const runWithSafeRedirects = async (executor, initialUrl) => {
  let currentUrl = await assertSafeDownloadUrl(initialUrl);
  const maxRedirects = 3;

  for (let i = 0; i <= maxRedirects; i += 1) {
    const response = await executor(currentUrl);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.location;
      if (!location) throw new Error('Redirect missing location.');
      const nextUrl = new URL(location, currentUrl).href;
      currentUrl = await assertSafeDownloadUrl(nextUrl);
      continue;
    }
    return response;
  }

  throw new Error('Too many redirects.');
};

const sanitizeDownloadFilename = (name, fallback = 'download') => {
  const raw = String(name || '').trim();
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  return cleaned || fallback;
};

const parseCloudinaryAssetFromUrl = (assetUrl) => {
  try {
    const parsed = new URL(assetUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== 'res.cloudinary.com' && !hostname.endsWith('.res.cloudinary.com')) return null;

    const segments = parsed.pathname.split('/').filter(Boolean);
    // Expected: /<cloud_name>/<resource_type>/<delivery_type>/<...>/v<version>/<public_id>.<ext>
    if (segments.length < 5) return null;

    const resourceType = segments[1];
    const deliveryType = segments[2];
    const tailSegments = segments.slice(3);
    const versionIndex = tailSegments.findIndex((segment) => /^v\d+$/.test(segment));
    const publicSegments = versionIndex >= 0 ? tailSegments.slice(versionIndex + 1) : tailSegments;
    if (publicSegments.length === 0) return null;

    const publicPath = publicSegments.join('/');
    const extensionMatch = publicPath.match(/\.([a-zA-Z0-9]{1,16})$/);
    const format = extensionMatch ? extensionMatch[1] : '';
    const publicId = extensionMatch
      ? publicPath.slice(0, -(`.${format}`).length)
      : publicPath;

    if (!publicId) return null;
    return { resourceType, deliveryType, publicId, format };
  } catch {
    return null;
  }
};

const getSignedCloudinaryDownloadUrl = (assetUrl, filename) => {
  const parsedAsset = parseCloudinaryAssetFromUrl(assetUrl);
  if (!parsedAsset) return '';

  const expiresAt = Math.floor(Date.now() / 1000) + (5 * 60);
  const attachmentName = sanitizeDownloadFilename(filename, 'download');
  const candidateOptions = [
    { resource_type: parsedAsset.resourceType, type: parsedAsset.deliveryType || 'upload' },
    { resource_type: parsedAsset.resourceType, type: 'authenticated' },
    { resource_type: 'raw', type: parsedAsset.deliveryType || 'upload' },
    { resource_type: 'raw', type: 'authenticated' },
  ];

  for (const options of candidateOptions) {
    try {
      const signedUrl = cloudinary.utils.private_download_url(parsedAsset.publicId, parsedAsset.format, {
        ...options,
        attachment: attachmentName,
        expires_at: expiresAt,
      });
      if (signedUrl) return signedUrl;
    } catch {
      // Try next variant.
    }
  }

  return '';
};

module.exports = {
  isPrivateOrInternalIp,
  getAllowedDownloadHost,
  isAllowedDownloadHost,
  isBlockedHostname,
  resolveHostnameIps,
  buildSafeDownloadUrl,
  assertSafeDownloadUrl,
  runWithSafeRedirects,
  sanitizeDownloadFilename,
  parseCloudinaryAssetFromUrl,
  getSignedCloudinaryDownloadUrl,
};
