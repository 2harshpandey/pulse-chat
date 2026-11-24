const { describe, it } = require('node:test');
const assert = require('node:assert');
const { sanitizePublicIdBase, generateSafePublicId } = require('../security');

describe('Cloudinary Safe Public ID Sanitization', () => {
  describe('sanitizePublicIdBase', () => {
    it('normalizes mathematical alphanumeric unicode characters to standard ASCII', () => {
      const input = '𝑻𝒉𝒆𝑭𝒂𝒍𝒍𝒆𝒏𝑷𝒐𝒆𝒕_-_Video_by_thefallenpoe';
      const output = sanitizePublicIdBase(input);
      assert.strictEqual(output, 'TheFallenPoet_-_Video_by_thefallenpoe');
      assert.match(output, /^[a-zA-Z0-9_-]+$/);
    });

    it('removes diacritics and converts accented latin characters to ASCII', () => {
      const input = 'café_résumé_façade';
      const output = sanitizePublicIdBase(input);
      assert.strictEqual(output, 'cafe_resume_facade');
      assert.match(output, /^[a-zA-Z0-9_-]+$/);
    });

    it('converts fullwidth characters to ASCII equivalents', () => {
      const input = 'Ｗｏｒｌｄ_２０２６';
      const output = sanitizePublicIdBase(input);
      assert.strictEqual(output, 'World_2026');
      assert.match(output, /^[a-zA-Z0-9_-]+$/);
    });

    it('replaces spaces, brackets, and illegal symbols with single underscores', () => {
      const input = 'My Video File (Final) [v2] & Share! #1';
      const output = sanitizePublicIdBase(input);
      assert.strictEqual(output, 'My_Video_File_Final_v2_Share_1');
      assert.match(output, /^[a-zA-Z0-9_-]+$/);
    });

    it('collapses consecutive underscores and trims leading/trailing underscores', () => {
      const input = '___test___file___';
      const output = sanitizePublicIdBase(input);
      assert.strictEqual(output, 'test_file');
    });

    it('falls back safely to default fallback when string contains only non-decomposable symbols or emojis', () => {
      assert.strictEqual(sanitizePublicIdBase('🔥🚀🎉'), 'file');
      assert.strictEqual(sanitizePublicIdBase('___'), 'file');
      assert.strictEqual(sanitizePublicIdBase(''), 'file');
      assert.strictEqual(sanitizePublicIdBase(null), 'file');
      assert.strictEqual(sanitizePublicIdBase(undefined), 'file');
      assert.strictEqual(sanitizePublicIdBase('...'), 'file');
    });

    it('truncates long names to maximum 60 characters without trailing underscore', () => {
      const longName = 'a'.repeat(100);
      const output = sanitizePublicIdBase(longName);
      assert.strictEqual(output.length, 60);
      assert.strictEqual(output, 'a'.repeat(60));
    });
  });

  describe('generateSafePublicId', () => {
    const CLOUDINARY_PUBLIC_ID_REGEX = /^pulse-chat\/[a-zA-Z0-9_-]+$/;
    const CLOUDINARY_RAW_PUBLIC_ID_REGEX = /^pulse-chat\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

    it('generates a valid Cloudinary public_id for problematic unicode video name', () => {
      const filename = '𝑻𝒉𝒆𝑭𝒂𝒍𝒍𝒆𝒏𝑷𝒐𝒆𝒕_-_Video_by_thefallenpoe.mp4';
      const result = generateSafePublicId(filename, 'video');
      assert.match(result.publicId, CLOUDINARY_PUBLIC_ID_REGEX);
      assert.strictEqual(result.fullPublicId, result.publicId);
      assert.ok(result.publicId.startsWith('pulse-chat/TheFallenPoet_-_Video_by_thefallenpoe-'));
      assert.strictEqual(result.ext, 'mp4');
    });

    it('appends safe extension for raw resource types', () => {
      const filename = 'Important Document (2026).PDF';
      const result = generateSafePublicId(filename, 'raw');
      assert.match(result.fullPublicId, CLOUDINARY_RAW_PUBLIC_ID_REGEX);
      assert.ok(result.fullPublicId.endsWith('.pdf'));
      assert.strictEqual(result.ext, 'pdf');
    });

    it('does not append extension for non-raw types', () => {
      const filename = 'photo.PNG';
      const result = generateSafePublicId(filename, 'image');
      assert.match(result.fullPublicId, CLOUDINARY_PUBLIC_ID_REGEX);
      assert.strictEqual(result.fullPublicId, result.publicId);
      assert.strictEqual(result.ext, 'png');
    });

    it('handles edge case inputs without throwing and returns valid public_ids', () => {
      const edgeCases = [
        null,
        undefined,
        '',
        '   ',
        '.',
        '..',
        '...',
        '🔥.mp4',
        '日本語.png',
        'हिंदी.mp3',
        '///',
        '\\\\\\',
      ];

      for (const input of edgeCases) {
        const result = generateSafePublicId(input, 'image');
        assert.match(result.publicId, CLOUDINARY_PUBLIC_ID_REGEX);
        assert.match(result.fullPublicId, CLOUDINARY_PUBLIC_ID_REGEX);
      }
    });
  });
});
