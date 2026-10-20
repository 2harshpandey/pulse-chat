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
});
