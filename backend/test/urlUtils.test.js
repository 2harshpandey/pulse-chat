'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  MONGODB_CANDIDATE_URL_REGEX,
  normalizeUrl,
  detectFirstUrl,
  isValidExternalHttpUrl,
} = require('../utils/urlUtils');

describe('backend urlUtils - link extraction & false-positive prevention', () => {
  it('rejects expressive elongated words with dots like awwww... and wowwww...', () => {
    const falsePositives = [
      'Awwww... Toh aao mummy ka duddu tumhara wait kar raha hai',
      'Awwwwwwwww... Main bhi aa raha hoon',
      'Awwwww.. ummah was just so cute',
      'Wowwww.... That is why I waited',
      'awwww... pic send kar dena',
      'www...',
      'www..',
      'www.',
      'www',
      'www.hello',
      'www.123.456',
      'www.fake.gfdgf',
      'https://',
      'http://',
      'https://...',
      'http://..',
      'https://hello',
      'https://12345',
      'https://1.2',
      'http://0x7f000001',
      'ftp://...',
      'Contact user@gmail.com or user@www.google.com',
      'version 1.0.0 and IP 192.168.1.1',
      'file.txt image.png archive.zip document.pdf script.js',
      'kar.do kab.se kaha.pe ghar.in do.it what.is come.in',
      '/www',
      '//evil.com/phish',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ];

    for (const sample of falsePositives) {
      assert.strictEqual(detectFirstUrl(sample), null, `Expected null for: ${sample}`);
    }
  });

  it('keeps MongoDB candidate regex immune to awwww..., www..., and https://...', () => {
    const mongoRejects = [
      'Awwww... Toh aao mummy...',
      'Wowwww.... nice!',
      'awwww... pic send kar den',
      'www...',
      'https://...',
      'http://',
      'version 1.0.0',
      'user@gmail.com',
    ];

    for (const sample of mongoRejects) {
      assert.strictEqual(
        MONGODB_CANDIDATE_URL_REGEX.test(sample),
        false,
        `MongoDB regex should not match false positive: ${sample}`
      );
    }

    const mongoMatches = [
      'https://www.youtube.com/watch?v=example',
      'https://amzn.in/d/09bkYOx',
      'Check www.google.com for details',
      'Visit rebrand.ly/harshphotos today',
      'pulsechat.tech/me',
    ];

    for (const sample of mongoMatches) {
      assert.strictEqual(
        MONGODB_CANDIDATE_URL_REGEX.test(sample),
        true,
        `MongoDB regex should match valid URL: ${sample}`
      );
    }
  });

  it('extracts valid URLs cleanly even when preceded by awwww...', () => {
    assert.strictEqual(
      detectFirstUrl('Awwww... check this https://www.youtube.com/watch?v=abc.'),
      'https://www.youtube.com/watch?v=abc'
    );
    assert.strictEqual(detectFirstUrl('Visit rebrand.ly/harshphotos'), 'https://rebrand.ly/harshphotos');
    assert.strictEqual(detectFirstUrl('Open www.google.com/maps'), 'https://www.google.com/maps');
    assert.strictEqual(detectFirstUrl('Check http://localhost:3000/me'), 'http://localhost:3000/me');
    assert.strictEqual(
      detectFirstUrl('Read (https://en.wikipedia.org/wiki/Foo_(bar)).'),
      'https://en.wikipedia.org/wiki/Foo_(bar)'
    );
  });

  it('validates external HTTP/HTTPS/FTP URLs strictly without resolving relative paths', () => {
    assert.strictEqual(isValidExternalHttpUrl('https://pulsechat.tech/me'), true);
    assert.strictEqual(isValidExternalHttpUrl('http://localhost:3000'), true);
    assert.strictEqual(isValidExternalHttpUrl('/www'), false);
    assert.strictEqual(isValidExternalHttpUrl('www'), false);
    assert.strictEqual(isValidExternalHttpUrl('https://...'), false);
    assert.strictEqual(isValidExternalHttpUrl('javascript:alert(1)'), false);
    assert.strictEqual(normalizeUrl('www.google.com.')?.href, 'https://www.google.com');
  });
});
