import { describe, it, expect, vi } from 'vitest';
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

    it('rejects audio messages and voice recordings so they never group into album grids', () => {
      expect(isMediaMessage(createMsg('1', 'user1', 'audio', 0, { url: 'https://example.com/audio.webm' }))).toBe(false);
      expect(isMediaMessage(createMsg('2', 'user1', 'file', 0, { originalName: 'voice-message-123.webm', url: 'https://example.com/voice.webm' }))).toBe(false);
      expect(isMediaMessage(createMsg('3', 'user1', 'file', 0, { originalName: 'track.mp3', url: 'https://example.com/track.mp3' }))).toBe(false);
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

    it('calls onClose when clicking the blank area of MediaGallerySlide, but not when clicking the media', async () => {
      const React = await import('react');
      const { render, fireEvent } = await import('@testing-library/react');
      const { MediaGalleryModal } = await import('./components/modals/MediaGalleryModal');
      const vi = (await import('vitest')).vi;

      const items: Message[] = [
        createMsg('1', 'user1', 'image'),
      ];
      const onCloseMock = vi.fn();

      const { container } = render(
        React.createElement(MediaGalleryModal, {
          isOpen: true,
          items,
          initialIndex: 0,
          onClose: onCloseMock,
        })
      );

      // Find the image
      const img = container.querySelector('img[alt="Photo"]') as HTMLElement;
      expect(img).not.toBeNull();

      // Find MediaGallerySlide (parent of img)
      const slide = img.parentElement as HTMLElement;
      expect(slide).not.toBeNull();

      // Clicking directly on img should stop propagation and NOT call onClose
      fireEvent.click(img);
      expect(onCloseMock).not.toHaveBeenCalled();

      // Clicking on slide (blank area where target === currentTarget) should call onClose
      fireEvent.click(slide);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('does not render Download all in MediaGalleryModal (only out in chat) and styles single download button', async () => {
      const React = await import('react');
      const { render, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MediaGalleryModal } = await import('./components/modals/MediaGalleryModal');

      const items: Message[] = [
        createMsg('1', 'user1', 'image'),
        createMsg('2', 'user1', 'image'),
      ];

      const { container } = render(
        React.createElement(MediaGalleryModal, {
          isOpen: true,
          items,
          initialIndex: 0,
          onClose: () => {},
        })
      );

      // Download all button should NOT be in the modal (only out in chat)
      const downloadAllBtn = container.querySelector('button[title="Download all as ZIP"]');
      expect(downloadAllBtn).toBeNull();

      // Single item download button should be rendered in the header
      const singleDownloadBtn = container.querySelector('button[title="Download"]');
      expect(singleDownloadBtn).not.toBeNull();
      cleanup();
    });
  });

  describe('Download All actions on Desktop & Touch devices', () => {
    it('renders Download all item in MessageActionMenuPortal when onDownloadAll is provided', async () => {
      const React = await import('react');
      const { render, fireEvent, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MessageActionMenuPortal } = await import('./components/message/MessageActionMenuPortal');
      const vi = (await import('vitest')).vi;

      const msg = createMsg('1', 'user1', 'image');
      const onDownloadAllMock = vi.fn();
      const setActiveDeleteMenuMock = vi.fn();

      const { getByText } = render(
        React.createElement(MessageActionMenuPortal, {
          msg,
          menuPos: { top: 100, left: 100 },
          deleteMenuRef: { current: null },
          currentUserId: 'user1',
          canEdit: false,
          handleSetReply: () => {},
          setActiveDeleteMenu: setActiveDeleteMenuMock,
          handleToggleSelectMessage: () => {},
          handleStartEdit: () => {},
          handleCopy: () => {},
          handleOpenReport: () => {},
          onDownloadAll: onDownloadAllMock,
        })
      );

      const downloadAllBtn = getByText('Download all');
      expect(downloadAllBtn).not.toBeNull();

      fireEvent.click(downloadAllBtn);
      expect(onDownloadAllMock).toHaveBeenCalledTimes(1);
      expect(setActiveDeleteMenuMock).toHaveBeenCalledWith(null);
      cleanup();
    });

    it('renders DownloadAllButton in ChatFooter select mode when hasSelectedMedia is true', async () => {
      const React = await import('react');
      const { render, fireEvent, cleanup } = await import('@testing-library/react');
      cleanup();
      const { ChatFooter } = await import('./components/ChatFooter');
      const vi = (await import('vitest')).vi;

      const onDownloadSelectedMock = vi.fn();

      const { container } = render(
        React.createElement(ChatFooter, {
          isSelectModeActive: true,
          selectedMessages: ['1', '2'],
          canEditSelectedMessage: false,
          isMobileView: true,
          currentUserId: 'user1',
          onCancelSelectMode: () => {},
          onStartEdit: () => {},
          onCopyMessage: () => {},
          onOpenReport: () => {},
          onInitiateDelete: () => {},
          hasSelectedMedia: true,
          selectedMediaCount: 2,
          onDownloadSelectedMedia: onDownloadSelectedMock,
          editingMessageId: null,
          editingMessageOriginalText: '',
          onCancelEdit: () => {},
          replyingTo: null,
          onCancelReply: () => {},
          onScrollToMessage: () => {},
          stagedFile: null,
          onCancelStagedFile: () => {},
          stagedFiles: [],
          onCancelStagedFiles: () => {},
          showFilePreview: false,
          stagedGif: null,
          onCancelStagedGif: () => {},
          isPlusMenuOpen: false,
          onTogglePlusMenu: () => {},
          isConnected: true,
          onFileChange: () => {},
          onAddFilesChange: () => {},
          onNotifyNativeFilePickerOpen: () => {},
          normalizedOverlayMessage: '',
          inputMessage: '',
          onInputChange: () => {},
          onInputKeyDown: () => {},
          onPaste: () => {},
          onSyncInputOverlayScroll: () => {},
          onSendMessage: () => {},
          isEmojiPickerOpen: false,
          onEmojiClick: () => {},
          isDark: false,
        })
      );

      const downloadBtn = container.querySelector('button[title="Download all as ZIP"]') as HTMLElement;
      expect(downloadBtn).not.toBeNull();

      fireEvent.click(downloadBtn);
      expect(onDownloadSelectedMock).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });

  describe('downloadAlbumAsZip utility', () => {
    it('creates zip archive and triggers browser download anchor', async () => {
      const { downloadAlbumAsZip } = await import('./utils');
      const vi = (await import('vitest')).vi;

      const fakeBlob = new Blob(['hello photo content'], { type: 'image/jpeg' });
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => fakeBlob,
        headers: { get: () => '18' },
      }) as any;

      const clickMock = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      let capturedAnchor: any = null;
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'a') {
          capturedAnchor = el;
          el.click = clickMock;
        }
        return el;
      });

      const msgs = [
        createMsg('1', 'alice', 'image', 0, { originalName: 'vacation.jpg' }),
        createMsg('2', 'alice', 'image', 1, { originalName: 'vacation.jpg' }), // duplicate name to test deduplication
      ];

      await downloadAlbumAsZip(msgs);

      expect(clickMock).toHaveBeenCalledTimes(1);
      expect(capturedAnchor).not.toBeNull();
      expect(capturedAnchor.download).toMatch(/^Pulse_Album_alice_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/);

      global.fetch = originalFetch;
      vi.restoreAllMocks();
    });
  });

  describe('Quoting grouped media album preview', () => {
    it('renders MediaAlbumIcon and "5 media" in MessageQuotedPreview when replying to a group', async () => {
      const React = await import('react');
      const { render, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MessageQuotedPreview } = await import('./components/message/MessageQuotedPreview');

      const message: Message = {
        id: 'reply-1',
        userId: 'bob',
        username: 'Bob',
        type: 'text',
        text: 'Awesome album!',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'group-head-1',
          username: 'Alice',
          text: '',
          type: 'group',
          isGroup: true,
          mediaCount: 5,
        },
      };

      const { getByText, getByTestId, queryByRole } = render(
        React.createElement(MessageQuotedPreview, {
          msg: message,
          currentUserId: 'bob',
          sender: 'me',
          quotedPreviewThumbUrl: '',
          scrollToMessage: () => {},
        })
      );

      // Should show username and "5 media"
      expect(getByText('Alice')).not.toBeNull();
      expect(getByText('5 media')).not.toBeNull();

      // Should render the group media album badge on the right
      expect(getByTestId('quoted-group-media-badge')).not.toBeNull();

      // Should NOT render any image thumbnail
      expect(queryByRole('img')).toBeNull();
      cleanup();
    });

    it('renders MediaAlbumIcon and "5 media • caption" when group reply has caption', async () => {
      const React = await import('react');
      const { render, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MessageQuotedPreview } = await import('./components/message/MessageQuotedPreview');

      const message: Message = {
        id: 'reply-2',
        userId: 'bob',
        username: 'Bob',
        type: 'text',
        text: 'Love these pictures',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'group-head-2',
          username: 'Alice',
          text: 'Trip to Tokyo',
          type: 'group',
          isGroup: true,
          mediaCount: 5,
        },
      };

      const { getByText, getByTestId } = render(
        React.createElement(MessageQuotedPreview, {
          msg: message,
          currentUserId: 'bob',
          sender: 'me',
          quotedPreviewThumbUrl: '',
          scrollToMessage: () => {},
        })
      );

      expect(getByText('5 media')).not.toBeNull();
      expect(getByText(/Trip to Tokyo/)).not.toBeNull();
      expect(getByTestId('quoted-group-media-badge')).not.toBeNull();
      cleanup();
    });

    it('resolves group info via quotedGroupInfo and displays SVG and count even if replyingTo had single media type', async () => {
      const React = await import('react');
      const { render, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MessageQuotedPreview } = await import('./components/message/MessageQuotedPreview');

      const message: Message = {
        id: 'reply-3',
        userId: 'bob',
        username: 'Bob',
        type: 'text',
        text: 'Nice shots!',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'photo-1',
          username: 'Alice',
          text: '',
          type: 'image',
          url: 'https://example.com/photo-1.jpg',
        },
      };

      const { getByText, getByTestId } = render(
        React.createElement(MessageQuotedPreview, {
          msg: message,
          currentUserId: 'bob',
          sender: 'me',
          quotedPreviewThumbUrl: 'https://example.com/photo-1.jpg',
          scrollToMessage: () => {},
          quotedGroupInfo: {
            count: 4,
            primaryId: 'photo-1',
            caption: 'Mountain hike',
          },
        })
      );

      // Should recognize group info and show "4 media" + "Mountain hike"
      expect(getByText('4 media')).not.toBeNull();
      expect(getByText(/Mountain hike/)).not.toBeNull();
      expect(getByTestId('quoted-group-media-badge')).not.toBeNull();
      cleanup();
    });

    it('passes groupReplyTarget to handleSetReply on double-click in MediaGroupItem', async () => {
      const React = await import('react');
      const { render, fireEvent, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MediaGroupItem } = await import('./components/message/MediaGroupItem');
      const vi = (await import('vitest')).vi;

      const groupMsgs = [
        createMsg('g1', 'alice', 'image', 0, { text: 'Family trip' }),
        createMsg('g2', 'alice', 'image', 1),
        createMsg('g3', 'alice', 'image', 2),
      ];

      const handleSetReplyMock = vi.fn();

      const { container } = render(
        React.createElement(MediaGroupItem, {
          messages: groupMsgs,
          primaryMessage: groupMsgs[0],
          showUsername: true,
          isPinned: false,
          currentUserId: 'bob',
          activeDeleteMenu: null,
          deleteMenuRef: { current: null },
          handleSetReply: handleSetReplyMock,
          handleReact: () => {},
          openDeleteMenu: () => {},
          openMediaGallery: () => {},
          loadedMediaSrcById: {},
          scrollToMessage: () => {},
          isSelectModeActive: false,
          isSelected: false,
          handleToggleSelectMessage: () => {},
          setActiveDeleteMenu: () => {},
          handleCopy: () => {},
          handleOpenReport: () => {},
          handleCancelSelectMode: () => {},
          isMobileView: false,
          selectedMessages: [],
          onOpenReactionPicker: () => {},
          setReactionsPopup: () => {},
          handleOpenFullEmojiPicker: () => {},
          reactionPickerData: null,
        })
      );

      // MessageRow is the root element rendered in MediaGroupItem
      const row = container.querySelector('[data-message-id="g1"]');
      expect(row).not.toBeNull();

      fireEvent.doubleClick(row!, { target: row! });
      expect(handleSetReplyMock).toHaveBeenCalledTimes(1);
      const repliedTarget = handleSetReplyMock.mock.calls[0][0];
      expect(repliedTarget.type).toBe('group');
      expect(repliedTarget.isGroup).toBe(true);
      expect(repliedTarget.mediaCount).toBe(3);
      expect(repliedTarget.text).toBe('Family trip');
      cleanup();
    });
  });

  describe('Grouped media album reactions and individual media badging', () => {
    it('aggregates album and item reactions with correct thumbnail metadata', async () => {
      const React = await import('react');
      const { render, fireEvent, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MediaGroupItem } = await import('./components/message/MediaGroupItem');

      let capturedPopup: any = null;

      const groupMsgs: Message[] = [
        {
          id: 'photo-1',
          userId: 'alice',
          username: 'Alice',
          type: 'image',
          url: 'https://example.com/p1.jpg',
          timestamp: new Date().toISOString(),
          // Reaction to whole album from outside (isAlbum: true)
          reactions: {
            '😢': [{ userId: 'bob', username: 'Bob', isAlbum: true }],
          },
        },
        {
          id: 'photo-2',
          userId: 'alice',
          username: 'Alice',
          type: 'image',
          url: 'https://example.com/p2.jpg',
          timestamp: new Date().toISOString(),
          // Reaction made to individual photo inside gallery
          reactions: {
            '😂': [{ userId: 'bob', username: 'Bob' }],
          },
        },
      ];

      const { container } = render(
        React.createElement(MediaGroupItem, {
          messages: groupMsgs,
          primaryMessage: groupMsgs[0],
          showUsername: true,
          isPinned: false,
          currentUserId: 'bob',
          activeDeleteMenu: null,
          deleteMenuRef: { current: null },
          handleSetReply: () => {},
          handleReact: () => {},
          openDeleteMenu: () => {},
          openMediaGallery: () => {},
          loadedMediaSrcById: { 'photo-2': 'blob:photo2-thumb' },
          scrollToMessage: () => {},
          isSelectModeActive: false,
          isSelected: false,
          handleToggleSelectMessage: () => {},
          setActiveDeleteMenu: () => {},
          handleCopy: () => {},
          handleOpenReport: () => {},
          handleCancelSelectMode: () => {},
          isMobileView: false,
          selectedMessages: [],
          onOpenReactionPicker: () => {},
          setReactionsPopup: (popup) => {
            capturedPopup = popup;
          },
          handleOpenFullEmojiPicker: () => {},
          reactionPickerData: null,
        })
      );

      // Both reactions should appear in the combined reactions pill in chat
      const reactionPill = container.querySelector('[data-testid="reactions-container"]');
      expect(reactionPill).not.toBeNull();

      fireEvent.click(reactionPill!);
      expect(capturedPopup).not.toBeNull();
      expect(capturedPopup.reactions['😢']).toBeDefined();
      expect(capturedPopup.reactions['😂']).toBeDefined();

      const sources = capturedPopup.reactionSources;
      expect(sources).toHaveLength(2);

      // Album reaction from outside: no mediaThumbUrl
      const albumReaction = sources.find((s: any) => s.emoji === '😢');
      expect(albumReaction).toBeDefined();
      expect(albumReaction.isAlbum).toBe(true);
      expect(albumReaction.mediaThumbUrl).toBeUndefined();

      // Individual photo reaction: has mediaThumbUrl
      const itemReaction = sources.find((s: any) => s.emoji === '😂');
      expect(itemReaction).toBeDefined();
      expect(itemReaction.isAlbum).toBe(false);
      expect(itemReaction.mediaThumbUrl).toBe('blob:photo2-thumb');

      cleanup();
    });

    it('renders reaction badge on bottom-right corner of active media in MediaGalleryModal', async () => {
      const React = await import('react');
      const { render, fireEvent, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MediaGalleryModal } = await import('./components/modals/MediaGalleryModal');

      const mockItems: Message[] = [
        {
          id: 'photo-1',
          userId: 'alice',
          username: 'Alice',
          type: 'image',
          url: 'https://example.com/p1.jpg',
          timestamp: new Date().toISOString(),
          reactions: {
            '😂': [{ userId: 'bob', username: 'Bob' }],
          },
        },
      ];

      const { getByTitle } = render(
        React.createElement(MediaGalleryModal, {
          isOpen: true,
          items: mockItems,
          initialIndex: 0,
          onClose: () => {},
          currentUserId: 'bob',
          onSetReactionsPopup: () => {},
        })
      );

      const cornerBadge = getByTitle('View reactions on this media');
      expect(cornerBadge).not.toBeNull();
      // When zoomed in, reaction badge should disappear
      const zoomInBtn = getByTitle('Zoom in');
      fireEvent.click(zoomInBtn);
      expect(cornerBadge.style.visibility).toBe('hidden');
      expect(cornerBadge.style.opacity).toBe('0');

      // When zoomed back out to normal state, reaction badge should reappear
      const zoomOutBtn = getByTitle('Zoom out');
      fireEvent.click(zoomOutBtn);
      expect(cornerBadge.style.visibility).toBe('visible');
      expect(cornerBadge.style.opacity).toBe('1');

      cleanup();
    });

    it('renders reaction, reply, and download buttons in separate header for normal single-sent media without counter or thumbs', async () => {
      const React = await import('react');
      const { render, fireEvent, cleanup } = await import('@testing-library/react');
      cleanup();
      const { MediaGalleryModal } = await import('./components/modals/MediaGalleryModal');

      const singleMediaItem: Message = {
        id: 'single-photo-99',
        userId: 'other_user',
        username: 'Other User',
        type: 'image',
        url: 'https://example.com/single.jpg',
        originalName: 'single-photo.jpg',
        timestamp: new Date().toISOString(),
        reactions: {
          '🔥': [{ userId: 'me_user', username: 'Me' }],
        },
      };

      let repliedMessage: Message | null = null;
      let reactedMessageId: string | null = null;
      let closed = false;

      const { getByTitle, queryByText } = render(
        React.createElement(MediaGalleryModal, {
          isOpen: true,
          items: [singleMediaItem],
          initialIndex: 0,
          onClose: () => {
            closed = true;
          },
          currentUserId: 'me_user',
          onSetReply: (msg) => {
            repliedMessage = msg;
          },
          onOpenReactionPicker: (id) => {
            reactedMessageId = id;
          },
          onRequestDownload: vi.fn(),
        })
      );

      // Verify no "1 / 1" counter is displayed for single media
      expect(queryByText('1 / 1')).toBeNull();

      // Verify reply button exists and functions
      const replyBtn = getByTitle('Reply to message');
      expect(replyBtn).not.toBeNull();
      fireEvent.click(replyBtn);
      expect(repliedMessage).toEqual(singleMediaItem);
      expect(closed).toBe(true);

      // Verify reaction button exists and functions
      const reactBtn = getByTitle('React to message');
      expect(reactBtn).not.toBeNull();
      fireEvent.click(reactBtn);
      expect(reactedMessageId).toBe('single-photo-99');

      // Verify download button exists
      const downloadBtn = getByTitle('Download');
      expect(downloadBtn).not.toBeNull();

      // Verify corner reaction badge is present
      const cornerBadge = getByTitle('View reactions on this media');
      expect(cornerBadge).not.toBeNull();

      cleanup();
    });
  });
});



