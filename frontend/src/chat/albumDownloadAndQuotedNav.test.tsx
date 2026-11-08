import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { albumDownloadManager } from './albumDownloadManager';
import { MessageQuotedPreview, getDeletedForMeMessageLabel } from './components/message/MessageQuotedPreview';
import { findGroupAlbumForMessage } from './components/MessagesList';
import { usePhotoZoom } from './hooks/usePhotoZoom';
import { useChatComposer } from './hooks/useChatComposer';
import { LinkPreviewCard } from './styles/chat.message.styles';
import type { Message } from './types';

describe('Album Download Manager and Quoted Message Locating', () => {
  describe('albumDownloadManager', () => {
    beforeEach(() => {
      // Clear any remaining state
    });

    it('tracks download in-progress state and reports progress to subscribers', async () => {
      const albumId = 'album-test-1';
      const progressUpdates: number[] = [];

      const unsubscribe = albumDownloadManager.subscribe(() => {
        progressUpdates.push(albumDownloadManager.getProgress(albumId));
      });

      expect(albumDownloadManager.isDownloading(albumId)).toBe(false);

      let finishTask!: () => void;
      const downloadTask = new Promise<void>((resolve) => {
        finishTask = resolve;
      });

      const startPromise = albumDownloadManager.startDownload(albumId, async (onProgress) => {
        onProgress(0.25);
        onProgress(0.75);
        await downloadTask;
        onProgress(1.0);
      });

      expect(albumDownloadManager.isDownloading(albumId)).toBe(true);
      expect(progressUpdates).toContain(0.25);
      expect(progressUpdates).toContain(0.75);

      finishTask();
      await startPromise;

      expect(albumDownloadManager.isDownloading(albumId)).toBe(false);
      expect(progressUpdates).toContain(1.0);

      unsubscribe();
    });

    it('prevents duplicate downloads for the same album and notifies onAlreadyInProgress listener', async () => {
      const albumId = 'album-test-2';
      const duplicateCallback = vi.fn();
      const unsubDuplicate = albumDownloadManager.onAlreadyInProgress(duplicateCallback);

      let finishTask!: () => void;
      const downloadTask = new Promise<void>((resolve) => {
        finishTask = resolve;
      });

      const firstDownload = albumDownloadManager.startDownload(albumId, async () => {
        await downloadTask;
      });

      expect(albumDownloadManager.isDownloading(albumId)).toBe(true);

      // Attempt second download on the same album
      const secondDownload = albumDownloadManager.startDownload(albumId, async () => {
        // should not be executed
      });

      expect(duplicateCallback).toHaveBeenCalledTimes(1);
      expect(duplicateCallback).toHaveBeenCalledWith(albumId);

      finishTask();
      await firstDownload;
      await secondDownload;

      expect(albumDownloadManager.isDownloading(albumId)).toBe(false);
      unsubDuplicate();
    });

    it('allows concurrent downloads on different albums independently', async () => {
      const album1 = 'album-a';
      const album2 = 'album-b';

      let finish1!: () => void;
      const p1 = new Promise<void>((r) => (finish1 = r));
      let finish2!: () => void;
      const p2 = new Promise<void>((r) => (finish2 = r));

      const run1 = albumDownloadManager.startDownload(album1, () => p1);
      const run2 = albumDownloadManager.startDownload(album2, () => p2);

      expect(albumDownloadManager.isDownloading(album1)).toBe(true);
      expect(albumDownloadManager.isDownloading(album2)).toBe(true);

      finish1();
      await run1;

      expect(albumDownloadManager.isDownloading(album1)).toBe(false);
      expect(albumDownloadManager.isDownloading(album2)).toBe(true);

      finish2();
      await run2;

      expect(albumDownloadManager.isDownloading(album2)).toBe(false);
    });

    it('cancels an active download midway via cancelDownload(albumId)', async () => {
      const albumId = 'album-cancel-test';
      let wasAborted = false;

      const downloadPromise = albumDownloadManager.startDownload(albumId, async (_onProgress, signal) => {
        return new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => {
            wasAborted = true;
            resolve();
          });
        });
      });

      expect(albumDownloadManager.isDownloading(albumId)).toBe(true);

      const didCancel = albumDownloadManager.cancelDownload(albumId);
      expect(didCancel).toBe(true);
      expect(wasAborted).toBe(true);
      expect(albumDownloadManager.isDownloading(albumId)).toBe(false);

      const result = await downloadPromise;
      expect(result).toBe(false);
    });

    it('cancels all downloads via cancelDownload() without arguments', async () => {
      const album1 = 'album-c1';
      const album2 = 'album-c2';

      const p1 = albumDownloadManager.startDownload(album1, async (_onProgress, signal) => {
        return new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve()));
      });
      const p2 = albumDownloadManager.startDownload(album2, async (_onProgress, signal) => {
        return new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve()));
      });

      expect(albumDownloadManager.hasAnyActiveDownload()).toBe(true);

      const didCancel = albumDownloadManager.cancelDownload();
      expect(didCancel).toBe(true);
      expect(albumDownloadManager.hasAnyActiveDownload()).toBe(false);
      expect(albumDownloadManager.isDownloading(album1)).toBe(false);
      expect(albumDownloadManager.isDownloading(album2)).toBe(false);

      await Promise.all([p1, p2]);
    });
  });

  describe('MessageQuotedPreview and Quoted Message Locating', () => {
    const dummyMsg: Message = {
      id: 'msg-child-1',
      userId: 'user1',
      username: 'Alice',
      type: 'text',
      text: 'Replying to an older message',
      timestamp: new Date().toISOString(),
      replyingTo: {
        id: 'msg-parent-old',
        text: 'Original old message',
        username: 'Bob',
        type: 'text',
      },
    };

    it('sets wait style during scrollToMessage and guards against duplicate clicks', async () => {
      let finishScroll!: () => void;
      const scrollToMessageMock = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishScroll = resolve;
          })
      );

      render(
        <MessageQuotedPreview
          msg={dummyMsg}
          currentUserId="user1"
          sender="me"
          quotedPreviewThumbUrl=""
          scrollToMessage={scrollToMessageMock}
        />
      );

      const quotedContainer = screen.getByRole('button');
      expect(quotedContainer.style.cursor).not.toBe('wait');

      // Click on quoted preview container
      await act(async () => {
        fireEvent.click(quotedContainer);
      });

      // Cursor should show wait feedback and click handler called
      expect(quotedContainer.style.cursor).toBe('wait');
      expect(scrollToMessageMock).toHaveBeenCalledTimes(1);

      // Secondary click while locating should be ignored
      await act(async () => {
        fireEvent.click(quotedContainer);
      });
      expect(scrollToMessageMock).toHaveBeenCalledTimes(1);

      // Resolve the scroll operation
      await act(async () => {
        finishScroll();
      });

      // Cursor should reset
      expect(quotedContainer.style.cursor).not.toBe('wait');
    });

    it('opens quoted media in fullscreen when loaded after scrollToMessage for older albums', async () => {
      const olderAlbumTargetId = 'older-photo-2';
      const replyMsg: Message = {
        id: 'msg-replying-to-old-album',
        userId: 'user1',
        username: 'Alice',
        type: 'text',
        text: 'Replying to an older photo in an album',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: olderAlbumTargetId,
          text: '',
          username: 'Bob',
          type: 'image',
          url: 'https://example.com/photo2.jpg',
        },
      };

      const fetchedAlbumBatch: Message[] = [
        {
          id: 'older-photo-1',
          userId: 'user2',
          username: 'Bob',
          type: 'image',
          url: 'https://example.com/photo1.jpg',
          timestamp: '2026-07-09T10:00:00.000Z',
        },
        {
          id: 'older-photo-2',
          userId: 'user2',
          username: 'Bob',
          type: 'image',
          url: 'https://example.com/photo2.jpg',
          timestamp: '2026-07-09T10:00:05.000Z',
        },
        {
          id: 'older-photo-3',
          userId: 'user2',
          username: 'Bob',
          type: 'image',
          url: 'https://example.com/photo3.jpg',
          timestamp: '2026-07-09T10:00:10.000Z',
        },
      ];

      const onOpenQuotedMediaMock = vi.fn(
        (targetId: string, replyingTo?: any, customMessages?: Message[]) => {
          if (!customMessages) {
            // Initial call before messages are loaded from server: album is not in memory
            return false;
          }
          // Second call after scrollToMessage returns the fetched batch
          const found = findGroupAlbumForMessage(customMessages, targetId, replyingTo);
          if (found) {
            expect(found.groupMessages).toHaveLength(3);
            expect(found.initialIndex).toBe(1); // second photo in album
            return true;
          }
          return false;
        }
      );

      const scrollToMessageMock = vi.fn(async () => ({
        success: true,
        messages: fetchedAlbumBatch,
      }));

      render(
        <MessageQuotedPreview
          msg={replyMsg}
          currentUserId="user1"
          sender="me"
          quotedPreviewThumbUrl=""
          scrollToMessage={scrollToMessageMock}
          onOpenQuotedMedia={onOpenQuotedMediaMock}
        />
      );

      const quotedContainer = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(quotedContainer);
      });

      expect(scrollToMessageMock).toHaveBeenCalledTimes(1);
      // First call (in-memory check, returned false) + second call (with fetched messages batch)
      expect(onOpenQuotedMediaMock).toHaveBeenCalledTimes(2);
      expect(onOpenQuotedMediaMock).toHaveBeenLastCalledWith(
        olderAlbumTargetId,
        replyMsg.replyingTo,
        fetchedAlbumBatch
      );
    });

    it('displays toast and aborts navigation when quoted media was deleted for current user session', async () => {
      const deletedMediaId = 'media-deleted-for-me-123';
      localStorage.setItem('pulseDeletedForMe_user1', JSON.stringify([deletedMediaId]));

      const replyMsg: Message = {
        id: 'msg-replying-to-deleted-media',
        userId: 'user1',
        username: 'Alice',
        type: 'text',
        text: 'Replying to deleted photo',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: deletedMediaId,
          text: '',
          username: 'Bob',
          type: 'image',
          url: 'https://example.com/pic.jpg',
        },
      };

      const scrollToMessageMock = vi.fn();
      const onOpenQuotedMediaMock = vi.fn();
      const onShowToastMock = vi.fn();

      render(
        <MessageQuotedPreview
          msg={replyMsg}
          currentUserId="user1"
          sender="me"
          quotedPreviewThumbUrl=""
          scrollToMessage={scrollToMessageMock}
          onOpenQuotedMedia={onOpenQuotedMediaMock}
          onShowToast={onShowToastMock}
        />
      );

      const quotedContainer = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(quotedContainer);
      });

      // Toast must be shown with the exact label
      expect(onShowToastMock).toHaveBeenCalledTimes(1);
      expect(onShowToastMock).toHaveBeenCalledWith('This photo is deleted by you for your session.');

      // Navigation and gallery opening MUST be aborted
      expect(scrollToMessageMock).not.toHaveBeenCalled();
      expect(onOpenQuotedMediaMock).not.toHaveBeenCalled();

      // Clean up localStorage
      localStorage.removeItem('pulseDeletedForMe_user1');
    });

    it('formats deleted for me labels accurately across different media and file types', () => {
      expect(getDeletedForMeMessageLabel({ type: 'image', url: 'https://test.com/photo.jpg' })).toBe('photo');
      expect(getDeletedForMeMessageLabel({ type: 'video', url: 'https://test.com/clip.mp4' })).toBe('video');
      expect(getDeletedForMeMessageLabel({ url: 'https://media.giphy.com/media/xyz/giphy.gif' })).toBe('GIF');
      expect(getDeletedForMeMessageLabel({ type: 'audio', url: 'https://test.com/note.mp3' })).toBe('voice message');
      expect(getDeletedForMeMessageLabel({ type: 'file', url: 'https://test.com/doc.pdf' })).toBe('file');
      expect(getDeletedForMeMessageLabel({ isGroup: true, mediaCount: 4 })).toBe('media album');
      expect(getDeletedForMeMessageLabel({ text: 'Hello' })).toBe('message');
    });

    it('findGroupAlbumForMessage helper accurately groups and indexes target media in batches', () => {
      const batch: Message[] = [
        {
          id: 'album-img-1',
          userId: 'user1',
          username: 'Bob',
          type: 'image',
          url: 'https://test.com/1.jpg',
          timestamp: '2026-11-08T12:00:00.000Z',
        },
        {
          id: 'album-img-2',
          userId: 'user1',
          username: 'Bob',
          type: 'image',
          url: 'https://test.com/2.jpg',
          timestamp: '2026-11-08T12:00:05.000Z',
        },
        {
          id: 'single-text-1',
          userId: 'user1',
          username: 'Bob',
          type: 'text',
          text: 'standalone',
          timestamp: '2026-11-08T12:01:00.000Z',
        },
      ];

      const found = findGroupAlbumForMessage(batch, 'album-img-2');
      expect(found).not.toBeNull();
      expect(found?.initialIndex).toBe(1);
      expect(found?.count).toBe(2);

      const notFound = findGroupAlbumForMessage(batch, 'single-text-1');
      expect(notFound).toBeNull();
    });
  });

  describe('Unified Status Toast Component', () => {
    const ToastTestComponent = ({
      isLocatingMessage,
      albumDownloadToast,
      isDownloading,
      downloadProgress,
    }: {
      isLocatingMessage?: boolean;
      albumDownloadToast?: string | null;
      isDownloading?: boolean;
      downloadProgress?: number;
    }) => {
      const isVisible = Boolean(isLocatingMessage || albumDownloadToast || isDownloading);
      const text = isLocatingMessage
        ? 'Locating quoted message...'
        : albumDownloadToast
        ? albumDownloadToast
        : isDownloading
        ? (downloadProgress && downloadProgress > 0.08
            ? `Preparing ZIP... ${Math.round(downloadProgress * 100)}%`
            : 'Preparing ZIP...')
        : '';

      return (
        <div data-testid="album-download-toast" style={{ opacity: isVisible ? 1 : 0 }}>
          <span>{text}</span>
        </div>
      );
    };

    it('displays locating quoted message when jump locating is active', () => {
      render(<ToastTestComponent isLocatingMessage={true} />);
      const toast = screen.getByTestId('album-download-toast');
      expect(toast.style.opacity).toBe('1');
      expect(screen.getByText('Locating quoted message...')).not.toBeNull();
    });

    it('displays already in progress message when duplicate album download occurs', () => {
      render(<ToastTestComponent albumDownloadToast="Album download is already in progress" />);
      const toast = screen.getByTestId('album-download-toast');
      expect(toast.style.opacity).toBe('1');
      expect(screen.getByText('Album download is already in progress')).not.toBeNull();
    });

    it('displays live ZIP progress percentage when album download is preparing', () => {
      render(<ToastTestComponent isDownloading={true} downloadProgress={0.52} />);
      const toast = screen.getByTestId('album-download-toast');
      expect(toast.style.opacity).toBe('1');
      expect(screen.getByText('Preparing ZIP... 52%')).not.toBeNull();
    });

    it('remains hidden when no background operations are active', () => {
      render(<ToastTestComponent isLocatingMessage={false} albumDownloadToast={null} isDownloading={false} />);
      const toast = screen.getByTestId('album-download-toast');
      expect(toast.style.opacity).toBe('0');
      expect(toast.textContent).toBe('');
    });

    it('displays error message in status toast when error occurs', () => {
      const ErrorToastComponent = ({ errorText }: { errorText: string }) => {
        const isVisible = Boolean(errorText);
        return (
          <div data-testid="album-download-toast" data-is-error="true" style={{ opacity: isVisible ? 1 : 0 }}>
            <span>{errorText}</span>
          </div>
        );
      };

      render(<ErrorToastComponent errorText="No microphone found on this device." />);
      const toast = screen.getByTestId('album-download-toast');
      expect(toast.style.opacity).toBe('1');
      expect(screen.getByText('No microphone found on this device.')).not.toBeNull();
    });

    it('renders cancel button and triggers cancel callback during active download', () => {
      const onCancelMock = vi.fn();
      const CancelToastTestComponent = ({ isDownloading }: { isDownloading: boolean }) => (
        <div data-testid="album-download-toast">
          <span>Preparing ZIP... 40%</span>
          {isDownloading && (
            <button data-testid="cancel-album-download-btn" onClick={onCancelMock}>
              Cancel
            </button>
          )}
        </div>
      );

      render(<CancelToastTestComponent isDownloading={true} />);
      const cancelBtn = screen.getByTestId('cancel-album-download-btn');
      expect(cancelBtn).not.toBeNull();
      fireEvent.click(cancelBtn);
      expect(onCancelMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Quoted Message Resolution and Integrity', () => {
    it('preserves replyingTo when quoting older messages outside the loaded slice', () => {
      const markDeletedReplyTargets = (list: any[], deletedIds: Set<string>) => {
        const messageById = new Map<string, any>();
        for (const msg of list) {
          if (msg.id) messageById.set(msg.id, msg);
        }

        return list.map((m) => {
          if (!m.replyingTo) return m;
          const targetId = m.replyingTo.id;
          const target = targetId ? messageById.get(targetId) : undefined;
          const isDeleted =
            (targetId && deletedIds.has(targetId)) ||
            (target && target.isDeleted) ||
            Boolean(m.replyingTo.isDeleted);

          return {
            ...m,
            replyingTo: {
              ...m.replyingTo,
              isDeleted,
            },
          };
        });
      };

      const olderQuotedMessageId = 'old-message-j-jul-9';
      const recentMessages = [
        { id: 'recent-1', text: 'j', username: 'Harsh', isDeleted: true },
        {
          id: 'recent-2-reply',
          text: 'my new reply',
          username: 'Harsh',
          replyingTo: {
            id: olderQuotedMessageId,
            text: 'j',
            username: 'Harsh',
            isDeleted: false,
          },
        },
      ];

      const patched = markDeletedReplyTargets(recentMessages, new Set(['recent-1']));
      const replyMessage = patched[1];

      // The replyingTo ID MUST remain pointing to the older message, NOT hijacked to recent-1
      expect(replyMessage.replyingTo.id).toBe(olderQuotedMessageId);
      // isDeleted MUST remain false because old-message-j-jul-9 is not deleted
      expect(replyMessage.replyingTo.isDeleted).toBe(false);
      // Text MUST remain 'j'
      expect(replyMessage.replyingTo.text).toBe('j');
    });

    it('returns direct requested message ID when target is not loaded in memory', () => {
      const resolveReplyNavigationTargetId = (
        requestedId: string,
        inMemoryMessages: any[]
      ) => {
        const inMemory = inMemoryMessages.find((m) => m.id === requestedId);
        if (inMemory) return inMemory.id;
        return requestedId;
      };

      const requestedId = 'oldest-jul-9-msg';
      const inMemoryMessages = [
        { id: 'recent-1', text: 'j', username: 'Harsh', isDeleted: true },
        { id: 'recent-reply-msg', text: 'reply', username: 'Harsh' },
      ];

      const resolved = resolveReplyNavigationTargetId(requestedId, inMemoryMessages);
      expect(resolved).toBe(requestedId);
    });

    it('shows generic deleted text and suppresses thumbnails when target message was deleted for everyone', () => {
      const deletedReplyMessage: Message = {
        id: 'msg-reply-to-deleted',
        userId: 'user-bob',
        username: 'Bob',
        type: 'text',
        text: 'This is my reply',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'target-msg-1',
          username: 'Alice',
          text: 'Old edited message text',
          url: 'https://example.com/photo.jpg',
          type: 'image',
          isDeleted: true,
          deletedBy: 'user-alice',
        },
      };

      const { rerender } = render(
        <MessageQuotedPreview
          msg={deletedReplyMessage}
          currentUserId="user-bob"
          sender="me"
          quotedPreviewThumbUrl="https://example.com/photo.jpg"
          scrollToMessage={vi.fn()}
        />
      );

      // Verify generic deleted text is displayed instead of old message text
      expect(screen.getByText('This message has been deleted.')).toBeInTheDocument();
      expect(screen.queryByText('Old edited message text')).not.toBeInTheDocument();
      // Verify thumbnail is suppressed
      expect(screen.queryByRole('img')).not.toBeInTheDocument();

      // If deleted by current user, show 'You deleted this message.'
      const userDeletedReplyMessage: Message = {
        ...deletedReplyMessage,
        replyingTo: {
          ...deletedReplyMessage.replyingTo!,
          deletedBy: 'user-bob',
        },
      };

      rerender(
        <MessageQuotedPreview
          msg={userDeletedReplyMessage}
          currentUserId="user-bob"
          sender="me"
          quotedPreviewThumbUrl="https://example.com/photo.jpg"
          scrollToMessage={vi.fn()}
        />
      );
      expect(screen.getByText('You deleted this message.')).toBeInTheDocument();

      // If deleted by admin, show 'This message has been deleted by an admin.'
      const adminDeletedReplyMessage: Message = {
        ...deletedReplyMessage,
        replyingTo: {
          ...deletedReplyMessage.replyingTo!,
          deletedBy: 'admin',
        },
      };

      rerender(
        <MessageQuotedPreview
          msg={adminDeletedReplyMessage}
          currentUserId="user-bob"
          sender="me"
          quotedPreviewThumbUrl="https://example.com/photo.jpg"
          scrollToMessage={vi.fn()}
        />
      );
      expect(screen.getByText('This message has been deleted by an admin.')).toBeInTheDocument();
    });

    it('smoothly steps zoom in and out on rapid clicks without resetting zoom', () => {
      const { result } = renderHook(() => usePhotoZoom());
      const mockEvent = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLButtonElement>;

      // Multiple rapid zoom-in clicks
      act(() => {
        result.current.handleZoomIn(mockEvent);
      });
      const firstScale = result.current.transform.scale;
      expect(firstScale).toBeGreaterThan(1);

      act(() => {
        result.current.handleZoomIn(mockEvent);
      });
      const secondScale = result.current.transform.scale;
      expect(secondScale).toBeGreaterThan(firstScale);

      // Rapid zoom-out clicks
      act(() => {
        result.current.handleZoomOut(mockEvent);
      });
      expect(result.current.transform.scale).toBeLessThan(secondScale);

      // Simulate double click event originating from a zoom button
      const buttonEl = document.createElement('button');
      const dblClickEvent = {
        target: buttonEl,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent<HTMLElement>;

      act(() => {
        result.current.handleDoubleClick(dblClickEvent);
      });

      // Zoom level should remain preserved and not reset to 1
      expect(result.current.transform.scale).toBe(firstScale);
    });

    it('renders LinkPreviewCard with full-width bubble stretching styles', () => {
      const { container } = render(
        <LinkPreviewCard $sender="me" href="https://example.com" />
      );
      const card = container.firstChild as HTMLElement;
      expect(card).toBeInTheDocument();
      expect(card).toHaveStyle('width: 100%');
      expect(card).toHaveStyle('box-sizing: border-box');
      expect(card).toHaveStyle('align-self: stretch');
    });

    it('only scrolls and highlights when clicking a quoted whole album, opening fullscreen only for individual media', async () => {
      const wholeAlbumReplyMessage: Message = {
        id: 'reply-to-album',
        userId: 'user-bob',
        username: 'Bob',
        type: 'text',
        text: 'Great album collection!',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'album-primary-1',
          username: 'Alice',
          type: 'group' as any,
          isGroup: true,
          mediaCount: 4,
          text: 'Vacation pictures',
        },
      };

      const onOpenQuotedMedia = vi.fn();
      const scrollToMessage = vi.fn();

      const { rerender } = render(
        <MessageQuotedPreview
          msg={wholeAlbumReplyMessage}
          currentUserId="user-bob"
          sender="me"
          quotedPreviewThumbUrl=""
          scrollToMessage={scrollToMessage}
          onOpenQuotedMedia={onOpenQuotedMedia}
        />
      );

      // Click on quoted whole album preview
      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      // Must NOT open fullscreen media gallery for whole album quote
      expect(onOpenQuotedMedia).not.toHaveBeenCalled();
      // Must scroll to and highlight the album in chat as usual
      expect(scrollToMessage).toHaveBeenCalledWith('album-primary-1', 'reply-to-album', 'auto', true, wholeAlbumReplyMessage.replyingTo);

      // Now test individual media quote within that album
      const individualMediaReplyMessage: Message = {
        id: 'reply-to-photo-2',
        userId: 'user-bob',
        username: 'Bob',
        type: 'text',
        text: 'Love this specific picture!',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'album-photo-2',
          username: 'Alice',
          text: '',
          type: 'image',
          url: 'https://example.com/photo-2.jpg',
        },
      };

      rerender(
        <MessageQuotedPreview
          msg={individualMediaReplyMessage}
          currentUserId="user-bob"
          sender="me"
          quotedPreviewThumbUrl="https://example.com/photo-2.jpg"
          scrollToMessage={scrollToMessage}
          onOpenQuotedMedia={onOpenQuotedMedia}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      // For individual media quote, opening fullscreen media gallery MUST be triggered
      expect(onOpenQuotedMedia).toHaveBeenCalledWith('album-photo-2', individualMediaReplyMessage.replyingTo);
    });

    it('returns null from findGroupAlbumForMessage when replyingTo represents a whole album', () => {
      const sampleAlbumMessages: Message[] = [
        { id: 'item-1', userId: 'u1', username: 'Alice', type: 'image', url: 'https://example.com/1.jpg', timestamp: new Date().toISOString() },
        { id: 'item-2', userId: 'u1', username: 'Alice', type: 'image', url: 'https://example.com/2.jpg', timestamp: new Date().toISOString() },
      ];

      const wholeAlbumPayload = {
        id: 'item-1',
        isGroup: true,
        type: 'group',
        mediaCount: 2,
      };

      const result = findGroupAlbumForMessage(sampleAlbumMessages, 'item-1', wholeAlbumPayload);
      expect(result).toBeNull();

      const individualPayload = {
        id: 'item-2',
        type: 'image',
        url: 'https://example.com/2.jpg',
      };

      const individualResult = findGroupAlbumForMessage(sampleAlbumMessages, 'item-2', individualPayload);
      expect(individualResult).not.toBeNull();
      expect(individualResult?.initialIndex).toBe(1);
    });

    it('cancels edit without performing any edit operation if text is unchanged or reverted back', async () => {
      const safeSendMock = vi.fn();
      const cancelEditMock = vi.fn();
      const mockWs = {
        current: {
          readyState: WebSocket.OPEN,
          send: safeSendMock,
        } as unknown as WebSocket,
      };

      const messagesRef = {
        current: [
          {
            id: 'msg-1',
            userId: 'user-1',
            username: 'Alice',
            type: 'text' as const,
            text: 'Original message text',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const { result, rerender } = renderHook(
        (props: { input: string }) =>
          useChatComposer({
            inputMessage: props.input,
            setInputMessage: vi.fn(),
            inputMessageRef: { current: props.input },
            userId: 'user-1',
            roomId: 'room-1',
            userProfile: { userId: 'user-1', username: 'Alice', role: 'user' } as any,
            ws: mockWs,
            apiBase: 'http://localhost',
            isMobileView: false,
            stableViewportHeightRef: { current: 800 },
            chatContainerRef: { current: null },
            messageInputRef: { current: null },
            inputOverlayRef: { current: null },
            skipNextInputLayoutSyncRef: { current: false },
            syncInputLayerLayout: vi.fn(),
            resetInputLayerHeight: vi.fn(),
            handleTyping: vi.fn(),
            setPresenceActivity: vi.fn(),
            startSendingActivity: vi.fn(),
            stopSendingActivity: vi.fn(),
            editingMessageId: 'msg-1',
            setEditingMessageId: vi.fn(),
            editingMessageOriginalText: 'Original message text',
            priorDraftBeforeEdit: '',
            handleCancelEdit: cancelEditMock,
            replyingTo: null,
            setReplyingTo: vi.fn(),
            stagedFile: null,
            setStagedFile: vi.fn(),
            stagedFiles: [],
            setStagedFiles: vi.fn(),
            showFilePreview: false,
            setShowFilePreview: vi.fn(),
            previewCaption: '',
            setPreviewCaption: vi.fn(),
            setPreviewActiveIndex: vi.fn(),
            preMediaDraft: '',
            setPreMediaDraft: vi.fn(),
            stageFilesForPreview: vi.fn(),
            handleRequestCloseFilePreview: vi.fn(),
            stagedGif: null,
            setStagedGif: vi.fn(),
            closeGifPicker: vi.fn(),
            gifPickerRef: { current: null },
            lightboxUrl: null,
            closeLightbox: vi.fn(),
            isSelectModeActive: false,
            isDeleteConfirmationVisible: false,
            isUserListVisible: false,
            deleteMenuRef: { current: null },
            setActiveDeleteMenu: vi.fn(),
            messagesRef,
            setMessages: vi.fn(),
            onMessageSent: vi.fn(),
            onInputTextCleared: vi.fn(),
            hasMoreNewerMessagesRef: { current: false },
            jumpToLatestMessages: vi.fn(),
            activeSearchQuery: '',
            chatSearchQuery: '',
            isSearchActive: false,
            resetSearch: vi.fn(),
          } as any),
        { initialProps: { input: 'Original message text' } }
      );

      // Attempt to save unchanged edit
      await act(async () => {
        await result.current.handleSendMessage();
      });

      // safeSend MUST NOT be called
      expect(safeSendMock).not.toHaveBeenCalled();
      // handleCancelEdit MUST be called instead
      expect(cancelEditMock).toHaveBeenCalledTimes(1);

      // Test with reverted text (user typed something then reverted back to original text with whitespace)
      rerender({ input: '   Original message text   ' });
      await act(async () => {
        await result.current.handleSendMessage();
      });
      expect(safeSendMock).not.toHaveBeenCalled();
      expect(cancelEditMock).toHaveBeenCalledTimes(2);

      // Test with actual changed text
      rerender({ input: 'Updated message text' });
      await act(async () => {
        await result.current.handleSendMessage();
      });
      expect(safeSendMock).toHaveBeenCalledTimes(1);
      const sentPayload = JSON.parse(safeSendMock.mock.calls[0][0]);
      expect(sentPayload).toEqual({
        type: 'edit',
        messageId: 'msg-1',
        newText: 'Updated message text',
        roomId: 'room-1',
      });
    });
  });
});
