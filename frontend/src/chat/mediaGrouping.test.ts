import { describe, it, expect } from 'vitest';
import { groupMessages, isMediaMessage } from './components/MessagesList';
import type { Message } from './types';

describe('Media grouping logic (WhatsApp / Telegram style)', () => {
  const baseTime = new Date('2026-10-21T02:00:00Z').getTime();

  const createMsg = (
    id: string,
    userId: string,
    type: Message['type'],
    offsetSec: number = 0,
    extra: Partial<Message> = {}
  ): Message => ({
    id,
    userId,
    username: userId,
    type,
    url: type === 'image' ? `https://example.com/${id}.jpg` : type === 'video' ? `https://example.com/${id}.mp4` : undefined,
    text: type === 'text' ? `Text ${id}` : undefined,
    timestamp: new Date(baseTime + offsetSec * 1000).toISOString(),
    ...extra,
  });

  describe('isMediaMessage', () => {
    it('identifies image and video messages as media', () => {
      expect(isMediaMessage(createMsg('1', 'user1', 'image'))).toBe(true);
      expect(isMediaMessage(createMsg('2', 'user1', 'video'))).toBe(true);
    });

    it('rejects text messages and system notifications', () => {
      expect(isMediaMessage(createMsg('1', 'user1', 'text'))).toBe(false);
      expect(isMediaMessage(createMsg('2', 'user1', 'system_notification'))).toBe(false);
    });

    it('rejects deleted messages', () => {
      expect(isMediaMessage(createMsg('1', 'user1', 'image', 0, { isDeleted: true }))).toBe(false);
    });

    it('rejects active uploads', () => {
      expect(isMediaMessage(createMsg('1', 'user1', 'image', 0, { isUploading: true }))).toBe(false);
    });

    it('rejects Giphy gifs so they remain standalone animated stickers', () => {
      expect(
        isMediaMessage(
          createMsg('1', 'user1', 'image', 0, { url: 'https://media.giphy.com/media/abc/giphy.gif' })
        )
      ).toBe(false);
    });
  });

  describe('groupMessages', () => {
    it('keeps a single photo as a single item', () => {
      const msgs = [createMsg('1', 'user1', 'image')];
      const result = groupMessages(msgs);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('single');
    });

    it('groups 2 consecutive photos from the same user into an album', () => {
      const msgs = [
        createMsg('1', 'user1', 'image', 0),
        createMsg('2', 'user1', 'image', 2),
      ];
      const result = groupMessages(msgs);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('group');
      if (result[0].type === 'group') {
        expect(result[0].messages).toHaveLength(2);
        expect(result[0].primaryMessage.id).toBe('1');
      }
    });

    it('groups photos and videos sent together by the same user', () => {
      const msgs = [
        createMsg('1', 'user1', 'image', 0),
        createMsg('2', 'user1', 'video', 1),
        createMsg('3', 'user1', 'image', 2),
      ];
      const result = groupMessages(msgs);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('group');
      if (result[0].type === 'group') {
        expect(result[0].messages).toHaveLength(3);
      }
    });

    it('does not group media from different users', () => {
      const msgs = [
        createMsg('1', 'user1', 'image', 0),
        createMsg('2', 'user2', 'image', 1),
      ];
      const result = groupMessages(msgs);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('single');
      expect(result[1].type).toBe('single');
    });

    it('splits groups when a text message is sent in between', () => {
      const msgs = [
        createMsg('1', 'user1', 'image', 0),
        createMsg('2', 'user1', 'text', 1),
        createMsg('3', 'user1', 'image', 2),
      ];
      const result = groupMessages(msgs);
      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('single');
      expect(result[1].type).toBe('single');
      expect(result[2].type).toBe('single');
    });

    it('separates media messages with incompatible replies', () => {
      const msgs = [
        createMsg('1', 'user1', 'image', 0, { replyingTo: { id: 'origA', username: 'u', text: 'a', type: 'text' } }),
        createMsg('2', 'user1', 'image', 1, { replyingTo: { id: 'origB', username: 'u', text: 'b', type: 'text' } }),
      ];
      const result = groupMessages(msgs);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('single');
      expect(result[1].type).toBe('single');
    });

    it('does not group photos sent more than 5 minutes apart', () => {
      const msgs = [
        createMsg('1', 'user1', 'image', 0),
        createMsg('2', 'user1', 'image', 301), // 5 min 1 sec later
      ];
      const result = groupMessages(msgs);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('single');
      expect(result[1].type).toBe('single');
    });

    it('groups 6 consecutive photos and handles overflow arithmetic correctly', () => {
      const msgs = Array.from({ length: 6 }, (_, i) => createMsg(`${i + 1}`, 'user1', 'image', i * 2));
      const result = groupMessages(msgs);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('group');
      if (result[0].type === 'group') {
        expect(result[0].messages).toHaveLength(6);
        // 4 visible tiles + 2 others = 6 items
        const overflow = result[0].messages.length - 4;
        expect(overflow).toBe(2);
      }
    });
  });

  describe('Media Gating & Preload Prevention (getMediaGatePreviewUrl)', () => {
    // import dynamically or test directly
    it('generates ultra-lightweight thumbnails for Cloudinary images', async () => {
      const { getMediaGatePreviewUrl } = await import('./utils');
      const cloudinaryUrl = 'https://res.cloudinary.com/demo/image/upload/v123456/sample.jpg';
      const preview = getMediaGatePreviewUrl('image', cloudinaryUrl);
      expect(preview).toContain('/upload/f_auto,q_25,w_120,c_scale/v123456/sample.jpg');
      expect(preview).not.toBe(cloudinaryUrl);
    });

    it('generates tiny snapshot frame for Cloudinary videos without fetching video file', async () => {
      const { getMediaGatePreviewUrl } = await import('./utils');
      const cloudinaryUrl = 'https://res.cloudinary.com/demo/video/upload/v123456/sample.mp4';
      const preview = getMediaGatePreviewUrl('video', cloudinaryUrl);
      expect(preview).toContain('/upload/so_0,f_jpg,q_25,w_120,c_scale/v123456/sample.mp4');
    });

    it('replaces heavy animated Giphy GIFs with lightweight static still frames', async () => {
      const { getMediaGatePreviewUrl, getQuotedPreviewThumbUrl } = await import('./utils');
      const giphyGif = 'https://media.giphy.com/media/abc123xyz/giphy.gif';
      const preview = getMediaGatePreviewUrl('image', giphyGif);
      expect(preview).toBe('https://media.giphy.com/media/abc123xyz/200w_s.gif');
      expect(preview).not.toBe(giphyGif);

      const quotedThumb = getQuotedPreviewThumbUrl('image', giphyGif);
      expect(quotedThumb).toBe('https://media.giphy.com/media/abc123xyz/200w_s.gif');
    });

    it('returns empty string for non-transformable URLs so browser never preloads heavy payload', async () => {
      const { getMediaGatePreviewUrl } = await import('./utils');
      const rawUploadUrl = 'https://s3.amazonaws.com/my-bucket/very-large-10mb-photo.png';
      const preview = getMediaGatePreviewUrl('image', rawUploadUrl);
      expect(preview).toBe('');
    });
  });

  describe('MediaGalleryModal React hook rules', () => {
    it('opens from closed state without hook count mismatch errors', async () => {
      const React = await import('react');
      const { render } = await import('@testing-library/react');
      const { MediaGalleryModal } = await import('./components/modals/MediaGalleryModal');

      const items: Message[] = [
        createMsg('1', 'user1', 'image'),
        createMsg('2', 'user1', 'video'),
      ];

      // 1. Initial render while closed (isOpen = false)
      const { rerender } = render(
        React.createElement(MediaGalleryModal, {
          isOpen: false,
          items,
          initialIndex: 0,
          onClose: () => {},
        })
      );

      // 2. Open modal (isOpen = true) - must not throw "Rendered more hooks than during the previous render"
      expect(() => {
        rerender(
          React.createElement(MediaGalleryModal, {
            isOpen: true,
            items,
            initialIndex: 0,
            onClose: () => {},
          })
        );
      }).not.toThrow();
    });
  });
});

