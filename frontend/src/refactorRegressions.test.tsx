import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook, act, fireEvent, screen } from '@testing-library/react';
import { repairMojibakeText, sanitizeFilename, reconcileUploadedMessageInList } from './chat/utils';
import { classifyUploadFile, isAudioMedia, isVideoMedia, isImageMedia } from './shared/mediaTypes';
import { useChatLightbox } from './chat/hooks/useChatLightbox';
import { useChatViewport } from './chat/hooks/useChatViewport';
import { MediaDownloadButton } from './chat/components/message/MediaDownloadButton';
import { DownloadProgressRing } from './chat/styles/chat.video.styles';
import { QuotedMessageContainer } from './chat/styles/chat.message.styles';
import { ChatSearchInput } from './chat/Chat.styles';
import { MAX_MESSAGE_LENGTH, filterValidReactions, normalizeReactionEmoji } from './chat/constants';
import { transferManager } from './chat/TransferManager';
import { routeIncomingWsMessage } from './chat/hooks/wsMessageRouter';

describe('Audit Fixes & Consolidations Regression Suite', () => {
  it('preserves ASCII hyphens in repairMojibakeText and sanitizeFilename while repairing mojibake', () => {
    expect(repairMojibakeText('my-report-2026-v1.pdf')).toBe('my-report-2026-v1.pdf');
    expect(sanitizeFilename('Q4-Sales-Report_final-v2.pdf')).toBe('Q4-Sales-Report_final-v2.pdf');

    // Repairs Latin-1 / Win-1252 mojibake without corrupting normal text
    expect(repairMojibakeText('It\u00e2\u20ac\u2122s \u00e2\u20ac\u0153ok\u00e2\u20ac\u009d \u00e2\u20ac\u201c test\u00e2\u20ac\u00a6')).toBe('It\'s "ok" - test...');
    expect(repairMojibakeText('100\u00e2\u201a\u00ac')).toBe('100EUR');
  });

  it('classifies images, videos, and audio consistently including modern extensions', () => {
    expect(classifyUploadFile({ name: 'photo.avif', type: '' })).toBe('image');
    expect(classifyUploadFile({ name: 'shot.heic', type: '' })).toBe('image');
    expect(classifyUploadFile({ name: 'clip.mkv', type: '' })).toBe('video');
    expect(classifyUploadFile({ name: 'movie.m4v', type: '' })).toBe('video');
    expect(classifyUploadFile({ name: 'track.opus', type: '' })).toBe('audio');
    expect(classifyUploadFile({ name: 'notes.pdf', type: 'application/pdf' })).toBe('file');

    expect(isAudioMedia({ type: 'file', originalName: 'voice-message.webm', url: 'https://cdn.example/voice.webm' })).toBe(true);
    expect(isVideoMedia({ type: 'video', originalName: 'clip.mkv', url: 'https://cdn.example/clip.mkv' })).toBe(true);
    expect(isImageMedia({ originalName: 'photo.avif', url: 'https://cdn.example/photo.avif?v=1' })).toBe(true);
  });

  it('delegates useChatLightbox zoom state and actions cleanly via usePhotoZoom', () => {
    const { result } = renderHook(() => useChatLightbox());
    expect(result.current.lightboxUrl).toBeNull();
    expect(result.current.lightboxTransform.scale).toBe(1);

    act(() => {
      result.current.openLightbox('https://res.cloudinary.com/demo/image/upload/v1/sample.jpg');
    });
    expect(result.current.lightboxUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/sample.jpg');

    const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;
    act(() => {
      result.current.handleLightboxZoomIn(mockEvent);
    });
    expect(result.current.lightboxTransform.scale).toBeGreaterThan(1);
    expect(result.current.canZoomOutLightbox).toBe(true);

    act(() => {
      result.current.closeLightbox();
    });
    expect(result.current.lightboxUrl).toBeNull();
  });

  it('reconciles temp upload IDs on both uploaded message and pending reply references', () => {
    const updated = reconcileUploadedMessageInList(
      [
        {
          id: 'temp-1',
          userId: 'u1',
          username: 'Alice',
          type: 'image',
          url: 'blob:temp',
          text: '',
          timestamp: '2026-01-01T00:00:00Z',
        },
        {
          id: 'msg-2',
          userId: 'u2',
          username: 'Bob',
          type: 'text',
          text: 'Nice!',
          timestamp: '2026-01-01T00:00:01Z',
          replyingTo: { id: 'temp-1', username: 'Alice', text: 'Image', type: 'image', url: 'blob:temp' },
        },
      ],
      'temp-1',
      {
        id: 'server-99',
        userId: 'u1',
        username: 'Alice',
        type: 'image',
        url: 'https://res.cloudinary.com/demo/image/upload/v1/final.jpg',
        text: '',
        timestamp: '2026-01-01T00:00:00Z',
      }
    );

    expect(updated[0].id).toBe('server-99');
    expect(updated[1].replyingTo?.id).toBe('server-99');
    expect(updated[1].replyingTo?.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/final.jpg');
  });

  it('renders styled-components with valid kebab-case SVG CSS properties (no camelCase strokeWidth)', () => {
    render(
      <DownloadProgressRing $progress={0.5} $visible={true}>
        <svg viewBox="0 0 36 36">
          <circle className="track" cx="18" cy="18" r="15" />
          <circle className="progress" cx="18" cy="18" r="15" />
        </svg>
      </DownloadProgressRing>
    );
    const styleText = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n');
    expect(styleText).toContain('stroke-width:3');
    expect(styleText).toContain('stroke-linecap:round');
    expect(styleText).not.toContain('strokeWidth');
  });

  it('does not shrink QuotedMessageContainer on hover (prevents boundary hover flicker loop)', () => {
    render(<QuotedMessageContainer $sender="other">Quoted preview</QuotedMessageContainer>);
    const styleText = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n');
    expect(styleText).not.toMatch(/:hover\s*\{[^}]*scale\(0\.9/);
  });

  it('uses theme-aware text color on ChatSearchInput and aligns MAX_MESSAGE_LENGTH with backend', () => {
    render(<ChatSearchInput $active={true} value="hello" onChange={() => {}} />);
    const styleText = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n');
    expect(styleText).toContain('color:var(--text-primary)');
    expect(MAX_MESSAGE_LENGTH).toBe(5000);
  });

  it('rejects 0-byte file uploads cleanly in TransferManager instead of returning null', async () => {
    const emptyFile = new File([], 'empty.txt', { type: 'text/plain' });
    await expect(
      transferManager.startUpload('empty-up-1', emptyFile, 'me', 'http://localhost:8080', 'user-1')
    ).rejects.toThrow(/empty \(0-byte\)/i);
  });

  it('ignores Object.prototype keys in frontend filterValidReactions without crashing', () => {
    expect(normalizeReactionEmoji('constructor')).toBeNull();
    expect(normalizeReactionEmoji('__proto__')).toBeNull();
    const cleaned = filterValidReactions({
      constructor: [{ userId: 'u1', username: 'Alice' }],
      '❤️': [{ userId: 'u2', username: 'Bob' }],
    });
    expect(Object.prototype.hasOwnProperty.call(cleaned, 'constructor')).toBe(false);
    expect(cleaned['❤️']).toEqual([{ userId: 'u2', username: 'Bob' }]);
  });

  it('expands wrapped composer lines under 50 chars and resets height when cleared to empty', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    try {
      const textarea = document.createElement('textarea');
      const overlay = document.createElement('div');
      let currentScrollHeight = 48;
      Object.defineProperty(textarea, 'scrollHeight', {
        configurable: true,
        get: () => currentScrollHeight,
      });

      const chatContainerRef = { current: document.createElement('div') };
      const inputOverlayRef = { current: overlay };
      const messageInputRef = { current: textarea };

      const { result } = renderHook(() =>
        useChatViewport({ chatContainerRef, inputOverlayRef, messageInputRef })
      );

      // Keystroke 1: single line (48px)
      textarea.value = 'a';
      currentScrollHeight = 48;
      act(() => {
        result.current.syncInputLayerLayout(textarea, 'a', false);
        while (rafCallbacks.length) rafCallbacks.shift()?.(0);
      });
      expect(textarea.style.height).toBe('48px');
      expect(overlay.style.height).toBe('48px');

      // Keystroke 32 (under 50 chars, no newline): wrapped onto line 2 (72px) on narrow viewports
      const wrappedShortText = 'This wraps onto line two early!!';
      textarea.value = wrappedShortText;
      currentScrollHeight = 72;
      act(() => {
        result.current.syncInputLayerLayout(textarea, wrappedShortText, false);
        while (rafCallbacks.length) rafCallbacks.shift()?.(0);
      });
      expect(textarea.style.height).toBe('72px');
      expect(overlay.style.height).toBe('72px');

      // Clearing back to empty string resets height to auto immediately
      textarea.value = '';
      currentScrollHeight = 48;
      act(() => {
        result.current.syncInputLayerLayout(textarea, '', false);
      });
      expect(textarea.style.height).toBe('auto');
      expect(overlay.style.height).toBe('auto');
    } finally {
      rafSpy.mockRestore();
      cafSpy.mockRestore();
    }
  });

  it('triggers MediaDownloadButton on both click-only (keyboard/accessibility) and pointerDown without double-firing', () => {
    const onRequestDownload = vi.fn();
    render(
      <MediaDownloadButton
        messageId="msg-dl-1"
        url="https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"
        filename="sample.jpg"
        onRequestDownload={onRequestDownload}
      />
    );

    const btn = screen.getByRole('button', { name: 'Download media' });

    // Synthetic/keyboard click without pointerDown
    fireEvent.click(btn);
    expect(onRequestDownload).toHaveBeenCalledTimes(1);

    // Pointer activation followed by click triggers only once
    fireEvent.pointerDown(btn, { button: 0 });
    fireEvent.click(btn);
    expect(onRequestDownload).toHaveBeenCalledTimes(2);
  });

  it('strips voice/media fields from client React state and replyingTo previews when receiving deleted update frame', () => {
    let currentMessages: any[] = [
      {
        id: 'voice-1',
        userId: 'u1',
        username: 'Khushu',
        type: 'audio',
        url: 'https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/voice-1.webm',
        originalName: 'voice-1.webm',
        size: 12345,
        duration: 14,
        waveform: [0.1, 0.9],
        timestamp: new Date().toISOString(),
      },
      {
        id: 'reply-1',
        userId: 'u2',
        username: 'Harsh',
        type: 'text',
        text: 'Replying to voice note',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'voice-1',
          type: 'audio',
          url: 'https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/voice-1.webm',
          duration: 14,
          isDeleted: false,
        },
      },
    ];
    let currentSearchResults: any[] | null = [...currentMessages];
    let currentPinned: any[] = [{ id: 'voice-1' }];
    let currentReplyingTo: any = { id: 'voice-1' };

    const ctx: any = {
      normalizeMessage: (m: any) => m,
      setMessages: (updater: any) => {
        currentMessages = typeof updater === 'function' ? updater(currentMessages) : updater;
      },
      setSearchResults: (updater: any) => {
        currentSearchResults = typeof updater === 'function' ? updater(currentSearchResults) : updater;
      },
      setPinnedMessages: (updater: any) => {
        currentPinned = typeof updater === 'function' ? updater(currentPinned) : updater;
      },
      setReplyingTo: (updater: any) => {
        currentReplyingTo = typeof updater === 'function' ? updater(currentReplyingTo) : updater;
      },
    };

    routeIncomingWsMessage(
      ctx,
      JSON.stringify({
        type: 'update',
        data: {
          id: 'voice-1',
          userId: 'u1',
          username: 'Khushu',
          type: 'audio',
          isDeleted: true,
          deletedBy: 'u1',
          pinned: null,
          timestamp: currentMessages[0].timestamp,
        },
      })
    );

    const deletedVoice = currentMessages[0];
    expect(deletedVoice.isDeleted).toBe(true);
    expect(deletedVoice.url).toBeUndefined();
    expect(deletedVoice.originalName).toBeUndefined();
    expect(deletedVoice.size).toBeUndefined();
    expect(deletedVoice.duration).toBeUndefined();
    expect(deletedVoice.waveform).toBeUndefined();

    const updatedReply = currentMessages[1];
    expect(updatedReply.replyingTo.isDeleted).toBe(true);
    expect(updatedReply.replyingTo.url).toBeUndefined();
    expect(updatedReply.replyingTo.duration).toBeUndefined();
    expect(currentPinned).toEqual([]);
    expect(currentReplyingTo).toBeNull();
    expect(currentSearchResults?.[0].url).toBeUndefined();
  });

  it('pre-uploads staged media with isPreUpload=true and commits or discards cleanly via TransferManager', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/upload/chunk')) {
        const body = init?.body as FormData;
        expect(body.get('isPreUpload')).toBe('true');
        return new Response(
          JSON.stringify({
            id: 'pulse/pre-test-id',
            type: 'image',
            url: 'https://res.cloudinary.com/demo/image/upload/pulse/pre-test-id.png',
            originalName: 'photo.png',
            size: 1024,
            isPreUpload: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/api/upload/commit')) {
        const parsed = JSON.parse(String(init?.body || '{}'));
        expect(parsed.publicId).toBe('pulse/pre-test-id');
        expect(parsed.text).toBe('Hello caption');
        return new Response(
          JSON.stringify({
            id: 'pulse/pre-test-id',
            type: 'image',
            url: 'https://res.cloudinary.com/demo/image/upload/pulse/pre-test-id.png',
            originalName: 'photo.png',
            size: 1024,
            text: 'Hello caption',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/api/upload/discard')) {
        const parsed = JSON.parse(String(init?.body || '{}'));
        expect(parsed.uploadIds).toEqual(['pre_123']);
        expect(parsed.publicIds).toEqual(['pulse/pre-test-id']);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as any;

    try {
      const file = new File([new Uint8Array(1024)], 'photo.png', { type: 'image/png' });
      const preRes = await transferManager.startUpload(
        'pre_123',
        file,
        'me',
        'http://localhost:8080',
        'user-1',
        undefined,
        { isPreUpload: true }
      );
      expect(preRes.isPreUpload).toBe(true);
      expect(preRes.id).toBe('pulse/pre-test-id');
      // Pre-upload must skip /api/upload/status check and only POST chunk
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const committed = await transferManager.commitPreUpload(
        preRes.id,
        'me',
        'http://localhost:8080',
        'user-1',
        { text: 'Hello caption' }
      );
      expect(committed.text).toBe('Hello caption');

      await transferManager.discardPreUploads(
        'me',
        'http://localhost:8080',
        'user-1',
        ['pre_123'],
        ['pulse/pre-test-id']
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
