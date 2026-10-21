import { describe, it, expect } from 'vitest';
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
});
