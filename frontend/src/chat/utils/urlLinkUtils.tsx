import React from 'react';
import { wrapEmojis, EMOJI_SEQUENCE_RE } from '../utils';

// Curated list of known valid TLDs - filters gibberish like .gfdgf or .gtd
export const VALID_TLDS = new Set([
  // Generic
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro',
  // Popular new gTLDs
  'io', 'co', 'ai', 'app', 'dev', 'web', 'tech', 'online', 'site', 'store', 'shop',
  'blog', 'cloud', 'digital', 'media', 'social', 'email', 'live', 'video', 'tv',
  'news', 'agency', 'studio', 'design', 'space', 'team', 'group', 'global',
  'world', 'today', 'network', 'finance', 'health', 'care', 'academy',
  'xyz', 'top', 'club', 'link', 'click', 'guru', 'life', 'vip', 'one', 'zone',
  'host', 'games', 'fun', 'pub', 'art', 'wiki', 'chat',
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

// Color used for all hyperlinks - other-users messages use CSS variable (blue in light mode, yellow in dark mode).
export const LINK_COLOR_OWN = 'rgb(255, 238, 0)';

// Candidate regex: matches http(s)://..., www.anything, or bare domain/subdomain patterns (e.g. web.whatsapp.com).
// TLD validation inside normalizeUrl filters false positives (gibberish domains).
export const CANDIDATE_URL_RE = /((?:https?:\/\/|ftp:\/\/)[^\s]+|www\.[a-zA-Z0-9][a-zA-Z0-9\-.]*[a-zA-Z0-9]\.[a-zA-Z]{2,}(?:[^\s]*)?|(?<![a-zA-Z0-9/@#.-])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::[0-9]{1,5})?(?:[/?#][^\s]*)?)/gi;

export const normalizeUrl = (raw: string): { href: string; display: string } | null => {
  const display = raw.replace(/[.,;:!?)'">\]]+$/, '');
  if (!display) return null;
  if (/^https?:\/\//i.test(display)) return { href: display, display };
  if (/^ftp:\/\//i.test(display)) return { href: display, display };
  if (/^www\./i.test(display)) return { href: `https://${display}`, display };
  const hostWithPort = display.split(/[/?#]/)[0];
  const [hostname, port] = hostWithPort.split(':');
  if (port && !/^\d{1,5}$/.test(port)) return null;
  const labels = hostname.split('.');
  if (labels.length < 2) return null;
  const tld = labels[labels.length - 1].toLowerCase();
  if (!VALID_TLDS.has(tld)) return null;
  const validLabel = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$|^[a-zA-Z0-9]$/;
  if (!labels.every(l => validLabel.test(l))) return null;
  return { href: `https://${display}`, display };
};

/**
 * Sanitise a URL for use as an <a href> by allowlisting http/https/ftp and encoding via encodeURI.
 */
export const safeHref = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ftp:') {
      return '#';
    }
    return encodeURI(parsed.href);
  } catch {
    return '#';
  }
};

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
  CANDIDATE_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CANDIDATE_URL_RE.exec(text)) !== null) {
    const norm = normalizeUrl(match[0]);
    if (norm) {
      CANDIDATE_URL_RE.lastIndex = 0;
      return norm.href;
    }
  }
  CANDIDATE_URL_RE.lastIndex = 0;
  return null;
};
