import React from 'react';
import { wrapEmojis, EMOJI_SEQUENCE_RE } from '../utils';

// Curated list of known valid TLDs - filters gibberish like .gfdgf or .gtd
export const VALID_TLDS = new Set([
  // Generic
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro',
  // Popular new gTLDs (excluding common file extensions like zip/mov/py/sh)
  'io', 'co', 'ai', 'app', 'dev', 'web', 'tech', 'online', 'site', 'store', 'shop',
  'blog', 'cloud', 'digital', 'media', 'social', 'email', 'live', 'video', 'tv',
  'news', 'agency', 'studio', 'design', 'space', 'team', 'group', 'global',
  'world', 'today', 'network', 'finance', 'health', 'care', 'academy',
  'xyz', 'top', 'club', 'link', 'click', 'guru', 'life', 'vip', 'one', 'zone',
  'host', 'games', 'fun', 'pub', 'art', 'wiki', 'chat', 'page', 'fyi', 'bio',
  'codes', 'tools', 'works', 'build', 'music',
  // Country codes
  'ac', 'ad', 'ae', 'af', 'ag', 'al', 'am', 'ao', 'ar', 'as', 'at', 'au', 'aw', 'az',
  'ba', 'bb', 'bd', 'be', 'bg', 'bh', 'bi', 'bj', 'bm', 'bn', 'bo', 'br', 'bs', 'bt',
  'bw', 'by', 'bz', 'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm', 'cn',
  'cr', 'cu', 'cv', 'cy', 'cz', 'de', 'dj', 'dk', 'dm', 'do', 'dz', 'ec', 'ee', 'eg',
  'er', 'es', 'et', 'eu', 'fi', 'fj', 'fo', 'fr', 'ga', 'gb', 'gd', 'ge', 'gg', 'gh',
  'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gt', 'gu', 'gy', 'hk', 'hn', 'hr', 'ht',
  'hu', 'id', 'ie', 'il', 'im', 'in', 'iq', 'ir', 'is', 'it', 'je', 'jm', 'jo', 'jp',
  'ke', 'kg', 'kh', 'km', 'kn', 'kr', 'kw', 'ky', 'kz', 'la', 'lb', 'lc', 'li', 'lk',
  'lr', 'ls', 'lt', 'lu', 'lv', 'ly', 'ma', 'mc', 'md', 'me', 'mg', 'mk', 'ml', 'mm',
  'mn', 'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz', 'na',
  'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nu', 'nz', 'om', 'pa', 'pe',
  'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'ps', 'pt', 'pw', 'py', 'qa', 're',
  'ro', 'rs', 'ru', 'rw', 'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sk', 'sl',
  'sm', 'sn', 'so', 'sr', 'st', 'su', 'sv', 'sy', 'sz', 'tc', 'td', 'tf', 'tg', 'th',
  'tj', 'tk', 'tl', 'tm', 'tn', 'to', 'tr', 'tt', 'tv', 'tw', 'tz', 'ua', 'ug', 'uk',
  'um', 'us', 'uy', 'uz', 'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu', 'wf', 'ws', 'ye',
  'yt', 'za', 'zm', 'zw',
]);

// 2-letter ccTLDs that frequently collide with common English/Hinglish words when
// someone misses a space after a period (e.g., "kar.do", "kab.se", "come.in", "do.it").
const AMBIGUOUS_TWO_LETTER_CCTLDS = new Set([
  'am', 'an', 'as', 'at', 'be', 'by', 'do', 'gi', 'go', 'id', 'in',
  'is', 'it', 'ki', 'la', 'ma', 'me', 'mr', 'ms', 'my', 'na', 'ne',
  'no', 'pa', 'pe', 're', 'se', 'si', 'so', 'to', 'us', 'ye',
]);

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const VALID_EXPLICIT_TLD_RE = /^(?:[a-z]{2,24}|xn--[a-z0-9]{2,60})$/i;
const TRAILING_PUNCT_RE = /[.,;:!?'"\u2026>\]]/;

// Color used for all hyperlinks - other-users messages use CSS variable (blue in light mode, yellow in dark mode).
export const LINK_COLOR_OWN = 'rgb(255, 238, 0)';

// Candidate regex: matches explicit http(s)/ftp URLs or token-bounded bare domain/www URLs.
// Preserves the single outer capture group required by String.prototype.split().
// TLD & URL parsing validation inside normalizeUrl filters all false positives (e.g. awwww..., www..., file.txt).
export const CANDIDATE_URL_RE = /((?<![a-zA-Z0-9])(?:https?|ftp):\/\/[^\s]+|(?<![a-zA-Z0-9/@#._-])(?:[a-zA-Z0-9-]+\.)+(?:[a-zA-Z]{2,24}|xn--[a-zA-Z0-9]{2,60})(?::[0-9]{1,5})?(?:[/?#][^\s]*|(?!\.[a-zA-Z0-9_-])(?![a-zA-Z0-9@:_-])))/gi;

const stripTrailingPunctuation = (raw: string): string => {
  let s = raw.trim();
  while (s.length > 0) {
    const last = s[s.length - 1];
    if (TRAILING_PUNCT_RE.test(last)) {
      s = s.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const opens = (s.match(/\(/g) || []).length;
      const closes = (s.match(/\)/g) || []).length;
      if (closes > opens) {
        s = s.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return s;
};

export const normalizeUrl = (raw: string): { href: string; display: string } | null => {
  if (!raw || typeof raw !== 'string') return null;
  const display = stripTrailingPunctuation(raw);
  if (!display || /[\s\u0000-\u001F\u007F]/.test(display)) return null;

  if (/^(?:https?|ftp):\/\//i.test(display)) {
    let parsed: URL;
    try {
      parsed = new URL(display);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ftp:') {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || host.startsWith('.') || host.endsWith('.') || host.includes('..')) {
      return null;
    }
    const rawAuthority = display.slice(display.indexOf('://') + 3).split(/[/?#]/)[0];
    const rawHostWithPort = rawAuthority.includes('@')
      ? rawAuthority.slice(rawAuthority.lastIndexOf('@') + 1)
      : rawAuthority;
    const rawHost = rawHostWithPort.startsWith('[')
      ? rawHostWithPort.replace(/:\d+$/, '').toLowerCase()
      : rawHostWithPort.split(':')[0].toLowerCase();
    const isLocalhost = host === 'localhost';
    const isExplicitIpv4 = IPV4_RE.test(host) && IPV4_RE.test(rawHost);
    const isIpv6 = host.startsWith('[') && host.endsWith(']');
    if (!isLocalhost && !isExplicitIpv4 && !isIpv6) {
      const labels = host.split('.');
      if (labels.length < 2) return null;
      if (!labels.every((l) => DNS_LABEL_RE.test(l))) return null;
      const tld = labels[labels.length - 1];
      if (!VALID_EXPLICIT_TLD_RE.test(tld)) return null;
    }
    return { href: display, display };
  }

  if (display.startsWith('/') || display.startsWith('.') || display.includes('://')) {
    return null;
  }

  const hostWithPort = display.split(/[/?#]/)[0];
  if (hostWithPort.includes('@')) return null;

  const colonParts = hostWithPort.split(':');
  if (colonParts.length > 2) return null;
  const [hostname, port] = colonParts;
  if (!hostname) return null;
  if (port !== undefined) {
    if (!/^\d{1,5}$/.test(port)) return null;
    const portNum = Number(port);
    if (portNum < 1 || portNum > 65535) return null;
  }

  const labels = hostname.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((l) => DNS_LABEL_RE.test(l))) return null;
  const tld = labels[labels.length - 1].toLowerCase();
  if (!VALID_TLDS.has(tld)) return null;

  const isWwwPrefix = /^www\./i.test(hostname);
  const hasSuffix = display.length > hostWithPort.length || port !== undefined;
  if (!isWwwPrefix && !hasSuffix && labels.length === 2 && AMBIGUOUS_TWO_LETTER_CCTLDS.has(tld)) {
    return null;
  }

  try {
    const parsed = new URL(`https://${display}`);
    if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
  } catch {
    return null;
  }

  return { href: `https://${display}`, display };
};

/**
 * Validates that a URL is an absolute external HTTP/HTTPS/FTP URL (never resolving relative paths like /www).
 */
export const safeExternalUrl = (url: string | undefined | null): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || /[\s\u0000-\u001F\u007F]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ftp:') {
      return null;
    }
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

/**
 * Sanitise a URL for use as an <a href> by allowlisting http/https/ftp.
 */
export const safeHref = (url: string): string => safeExternalUrl(url) ?? '#';

export const renderTextWithLinks = (text: string, sender: 'me' | 'other'): React.ReactNode => {
  const hasEmoji = Boolean(text.match(EMOJI_SEQUENCE_RE));
  const isStandalone = hasEmoji && text.replace(EMOJI_SEQUENCE_RE, '').trim().length === 0;

  const parts = text.split(CANDIDATE_URL_RE);
  if (parts.length === 1) {
    const wrapped = wrapEmojis(text, isStandalone);
    return wrapped.length === 1 ? wrapped[0] : <>{wrapped}</>;
  }
  const result: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) { if (part) result.push(...wrapEmojis(part, isStandalone)); return; }
    const norm = normalizeUrl(part);
    if (!norm) { result.push(part); return; }
    const trailing = part.slice(norm.display.length);
    result.push(
      <React.Fragment key={i}>
        <a
          href={safeHref(norm.href)}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: sender === 'other' ? 'var(--link-color)' : LINK_COLOR_OWN,
            wordBreak: 'break-all',
          }}
        >{norm.display}</a>
        {trailing ? wrapEmojis(trailing) : null}
      </React.Fragment>
    );
  });
  return result.length === 1 ? result[0] : <>{result}</>;
};

export const detectFirstUrl = (text: string): string | null => {
  if (!text || typeof text !== 'string') return null;
  const re = new RegExp(CANDIDATE_URL_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const norm = normalizeUrl(match[0]);
    if (norm) {
      return norm.href;
    }
  }
  return null;
};
