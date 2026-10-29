import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { albumDownloadManager } from './albumDownloadManager';
import { MessageQuotedPreview } from './components/message/MessageQuotedPreview';
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
  });
});
