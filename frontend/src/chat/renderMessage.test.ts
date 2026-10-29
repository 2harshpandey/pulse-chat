import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { normalizeUrl, detectFirstUrl, CANDIDATE_URL_RE } from './renderMessage';

describe('renderMessage URL detection and normalization', () => {
  it('correctly normalizes bare subdomains like web.whatsapp.com', () => {
    const norm = normalizeUrl('web.whatsapp.com');
    expect(norm).not.toBeNull();
    expect(norm?.href).toBe('https://web.whatsapp.com');
    expect(norm?.display).toBe('web.whatsapp.com');
  });

  it('detects web.whatsapp.com inside conversational sentences', () => {
    const text = 'tumhe browser mein web.whatsapp.com pe login karke wahan se pic download karni hogi';
    const firstUrl = detectFirstUrl(text);
    expect(firstUrl).toBe('https://web.whatsapp.com');

    const parts = text.split(CANDIDATE_URL_RE);
    const matched = parts.filter((_, i) => i % 2 === 1);
    expect(matched).toContain('web.whatsapp.com');
  });

  it('handles standard domains, protocols, and www prefixes', () => {
    expect(normalizeUrl('https://google.com')?.href).toBe('https://google.com');
    expect(normalizeUrl('www.google.com')?.href).toBe('https://www.google.com');
    expect(normalizeUrl('google.com')?.href).toBe('https://google.com');
  });

  it('handles deep subdomains and regional ccTLDs', () => {
    expect(normalizeUrl('maps.google.co.in')?.href).toBe('https://maps.google.co.in');
    expect(normalizeUrl('sub1.sub2.sub3.example.com')?.href).toBe('https://sub1.sub2.sub3.example.com');
    expect(normalizeUrl('rebrand.ly/harshphotos')?.href).toBe('https://rebrand.ly/harshphotos');
    expect(normalizeUrl('pulsechat.tech/me')?.href).toBe('https://pulsechat.tech/me');
  });

  it('handles ports and paths', () => {
    expect(normalizeUrl('web.whatsapp.com:8080/app')?.href).toBe('https://web.whatsapp.com:8080/app');
  });

  it('strips trailing punctuation like commas, periods, and question marks', () => {
    expect(normalizeUrl('web.whatsapp.com.')?.display).toBe('web.whatsapp.com');
    expect(normalizeUrl('web.whatsapp.com,')?.display).toBe('web.whatsapp.com');
    expect(normalizeUrl('web.whatsapp.com?')?.display).toBe('web.whatsapp.com');
    expect(normalizeUrl('web.whatsapp.com/path)')?.display).toBe('web.whatsapp.com/path');

    // In a parenthesized expression, the leading paren is matched as surrounding text
    const text = 'Check (web.whatsapp.com)';
    const firstUrl = detectFirstUrl(text);
    expect(firstUrl).toBe('https://web.whatsapp.com');
  });

  it('does not treat email addresses or non-domains as bare links', () => {
    const text1 = 'Contact user@gmail.com for details';
    expect(detectFirstUrl(text1)).toBeNull();

    const text2 = 'Contact user@web.whatsapp.com for details';
    expect(detectFirstUrl(text2)).toBeNull();

    expect(normalizeUrl('192.168.1.1')).toBeNull();
    expect(normalizeUrl('version 1.0.0')).toBeNull();
    expect(normalizeUrl('file.unknownext')).toBeNull();
  });

  it('correctly resolves root domain for favicons', async () => {
    const { getRootDomain } = await import('./utils');
    expect(getRootDomain('web.whatsapp.com')).toBe('whatsapp.com');
    expect(getRootDomain('maps.google.co.in')).toBe('google.co.in');
    expect(getRootDomain('sub.domain.example.com')).toBe('example.com');
    expect(getRootDomain('github.com')).toBe('github.com');
    expect(getRootDomain('www.google.com')).toBe('google.com');
  });

  it('safely matches domains and prevents substring spoofing (CodeQL CWE-20)', async () => {
    const { isDomainOrSubdomain, isAmazonHost, getHostnameFromUrl } = await import('./utils');

    // YouTube safe checks
    expect(isDomainOrSubdomain('youtube.com', 'youtube.com')).toBe(true);
    expect(isDomainOrSubdomain('m.youtube.com', 'youtube.com')).toBe(true);
    expect(isDomainOrSubdomain('evil-youtube.com', 'youtube.com')).toBe(false);
    expect(isDomainOrSubdomain('youtube.com.attacker.com', 'youtube.com')).toBe(false);

    // Amazon safe checks
    expect(isAmazonHost('amazon.com')).toBe(true);
    expect(isAmazonHost('www.amazon.co.uk')).toBe(true);
    expect(isAmazonHost('smile.amazon.com')).toBe(true);
    expect(isAmazonHost('amzn.to')).toBe(true);
    expect(isAmazonHost('evil-amazon.com')).toBe(false);
    expect(isAmazonHost('amazon.com.attacker.net')).toBe(false);

    // Hostname extraction from image URLs
    expect(getHostnameFromUrl('https://i.ytimg.com/vi/xyz/hqdefault.jpg')).toBe('i.ytimg.com');
    expect(isDomainOrSubdomain(getHostnameFromUrl('https://i.ytimg.com/vi/xyz/hqdefault.jpg'), 'ytimg.com')).toBe(true);
    expect(isDomainOrSubdomain(getHostnameFromUrl('https://evil.com/fake?x=ytimg.com'), 'ytimg.com')).toBe(false);
    expect(isDomainOrSubdomain(getHostnameFromUrl('https://m.media-amazon.com/images/I/xyz.jpg'), 'media-amazon.com')).toBe(true);
    expect(isDomainOrSubdomain(getHostnameFromUrl('https://evil-media-amazon.com/pic.jpg'), 'media-amazon.com')).toBe(false);
  });

  it('fetchBlobWithProgress preserves and infers proper MIME type for video and images', async () => {
    const { fetchBlobWithProgress } = await import('./utils');
    const origFetch = global.fetch;

    try {
      // Test 1: Content-Type header present
      global.fetch = async () => {
        return new Response(new Uint8Array([0, 1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'video/mp4;codecs=avc1', 'content-length': '4' }
        });
      };
      const blob1 = await fetchBlobWithProgress('https://res.cloudinary.com/test/video.mp4');
      expect(blob1.type).toBe('video/mp4;codecs=avc1');

      // Test 2: Content-Type missing, inferred from .mp4 URL
      global.fetch = async () => {
        return new Response(new Uint8Array([0, 1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '4' }
        });
      };
      const blob2 = await fetchBlobWithProgress('https://res.cloudinary.com/test/video.mp4?_a=123');
      expect(blob2.type).toBe('video/mp4');

      // Test 3: Content-Type missing, inferred from .jpg URL
      global.fetch = async () => {
        return new Response(new Uint8Array([0, 1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '4' }
        });
      };
      const blob3 = await fetchBlobWithProgress('https://res.cloudinary.com/test/photo.jpg');
      expect(blob3.type).toBe('image/jpeg');
    } finally {
      global.fetch = origFetch;
    }
  });
});

describe('Emoji sequence parsing and wrapEmojis', () => {
  it('correctly matches emojis with skin tone modifiers without splitting into isolated modifiers', async () => {
    const { EMOJI_SEQUENCE_RE } = await import('./utils');

    const testTones = ['🤦🏻', '🤦🏼', '🤦🏽', '🤦🏾', '🤦🏿', '👍🏻', '🙏🏽'];
    for (const emoji of testTones) {
      const re = new RegExp(EMOJI_SEQUENCE_RE.source, EMOJI_SEQUENCE_RE.flags);
      const matches = [...emoji.matchAll(re)].map(m => m[0]);
      expect(matches).toEqual([emoji]);
    }
  });

  it('correctly matches complex skin-tone + ZWJ sequences as single emoji tokens', async () => {
    const { EMOJI_SEQUENCE_RE } = await import('./utils');

    const complex = ['🤦🏻‍♀️', '🤦🏻‍♂️', '🧑🏻‍🤝‍🧑🏼', '👩🏻‍❤️‍💋‍👨🏼', '👨‍👩‍👧‍👦', '🏳️‍🌈', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'];
    for (const seq of complex) {
      const re = new RegExp(EMOJI_SEQUENCE_RE.source, EMOJI_SEQUENCE_RE.flags);
      const matches = [...seq.matchAll(re)].map(m => m[0]);
      expect(matches).toEqual([seq]);
    }
  });

  it('wrapEmojis does not split light skin tone modifier into separate net/swatch span', async () => {
    const { wrapEmojis } = await import('./utils');

    const result = wrapEmojis('Chupppp 🤦🏻', false);
    // Should produce 2 parts: 'Chupppp ' string and 1 <span> containing '🤦🏻'
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Chupppp ');

    const span = result[1] as ReactElement;
    expect(span.props.className).toBe('emoji-inline');
    expect(span.props.children).toBe('🤦🏻');
  });

  it('wrapEmojis handles messages with multiple skin-tone emojis from real user chat transcripts', async () => {
    const { wrapEmojis } = await import('./utils');

    const text = 'Hey bhagwan... Tum pagal ho jao usi ke peeche 🤦🏻🤦🏻';
    const result = wrapEmojis(text, false);

    // Text + emoji 1 + emoji 2
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Hey bhagwan... Tum pagal ho jao usi ke peeche ');
    expect((result[1] as ReactElement).props.children).toBe('🤦🏻');
    expect((result[2] as ReactElement).props.children).toBe('🤦🏻');
  });

  it('wrapEmojis formats standalone emoji-only messages with emoji-standalone class', async () => {
    const { wrapEmojis, EMOJI_SEQUENCE_RE } = await import('./utils');

    const standaloneText = '🤦🏻 🤦🏻';
    const hasEmoji = Boolean(standaloneText.match(EMOJI_SEQUENCE_RE));
    const isStandalone = hasEmoji && standaloneText.replace(EMOJI_SEQUENCE_RE, '').trim().length === 0;
    expect(isStandalone).toBe(true);

    const result = wrapEmojis(standaloneText, isStandalone);
    expect(result).toHaveLength(3); // emoji, space, emoji
    expect((result[0] as ReactElement).props.className).toBe('emoji-standalone');
    expect((result[0] as ReactElement).props.children).toBe('🤦🏻');
    expect(result[1]).toBe(' ');
    expect((result[2] as ReactElement).props.className).toBe('emoji-standalone');
    expect((result[2] as ReactElement).props.children).toBe('🤦🏻');
  });
});

