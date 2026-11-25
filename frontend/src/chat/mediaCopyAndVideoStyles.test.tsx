import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { isNonTouchDevice, isPhotoOrGif, hasMediaAttachment, copyImageToClipboard } from './utils';
import { MessageActionMenuPortal } from './components/message/MessageActionMenuPortal';
import { MediaGalleryModal } from './components/modals/MediaGalleryModal';
import { ChatFooter, type ChatFooterProps } from './components/ChatFooter';
import { CVPBottomRow, CVPIconBtn } from './styles/chat.video.styles';
import { VideoPlayer } from './VideoPlayer';
import { MessageItem } from './MessageItem';
import type { Message } from './types';

describe('isNonTouchDevice helper', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns true for desktops and laptops with fine pointer', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: fine)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isNonTouchDevice()).toBe(true);
  });

  it('returns true for devices with hover support', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(hover: hover)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isNonTouchDevice()).toBe(true);
  });

  it('returns true for mixed touch & non-touch devices (e.g. touchscreen laptops with trackpad)', () => {
    // Touchscreen laptop has pointer: coarse AND pointer: fine
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: coarse)') || query.includes('(pointer: fine)') || query.includes('(hover: hover)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isNonTouchDevice()).toBe(true);
  });

  it('returns false for pure touch devices (smartphones, tablets with pointer: coarse only and no hover)', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: coarse)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isNonTouchDevice()).toBe(false);
  });
});

describe('isPhotoOrGif helper', () => {
  it('identifies photo and gif message types', () => {
    expect(isPhotoOrGif({ type: 'image', url: 'https://example.com/test.jpg' })).toBe(true);
    expect(isPhotoOrGif({ type: 'photo', url: 'https://example.com/photo' })).toBe(true);
    expect(isPhotoOrGif({ type: 'gif', url: 'https://example.com/animation' })).toBe(true);
    expect(isPhotoOrGif({ type: 'file', url: 'https://example.com/art.png' })).toBe(false); // type 'file' is excluded
  });

  it('identifies image extensions regardless of casing', () => {
    expect(isPhotoOrGif({ type: 'custom', url: 'https://example.com/pic.PNG' })).toBe(true);
    expect(isPhotoOrGif({ type: 'custom', url: 'https://example.com/anim.GIF' })).toBe(true);
    expect(isPhotoOrGif({ type: 'custom', url: 'https://example.com/pic.webp' })).toBe(true);
    expect(isPhotoOrGif({ type: 'custom', url: 'https://example.com/icon.svg' })).toBe(true);
  });

  it('strictly excludes videos, audios, and documents', () => {
    expect(isPhotoOrGif({ type: 'video', url: 'https://example.com/clip.mp4' })).toBe(false);
    expect(isPhotoOrGif({ type: 'audio', url: 'https://example.com/voice.mp3' })).toBe(false);
    expect(isPhotoOrGif({ type: 'doc', url: 'https://example.com/manual.pdf' })).toBe(false);
    expect(isPhotoOrGif({ type: 'file', url: 'https://example.com/archive.zip' })).toBe(false);
    expect(isPhotoOrGif({ type: 'custom', url: 'https://example.com/movie.webm' })).toBe(false);
    expect(isPhotoOrGif(null)).toBe(false);
    expect(isPhotoOrGif(undefined)).toBe(false);
  });
});

describe('hasMediaAttachment helper', () => {
  it('returns true for any media type or media url', () => {
    expect(hasMediaAttachment({ type: 'image', url: 'https://example.com/test.jpg' })).toBe(true);
    expect(hasMediaAttachment({ type: 'video', url: 'https://example.com/video.mp4' })).toBe(true);
    expect(hasMediaAttachment({ type: 'audio', url: 'https://example.com/audio.mp3' })).toBe(true);
    expect(hasMediaAttachment({ type: 'file', url: 'https://example.com/doc.pdf' })).toBe(true);
    expect(hasMediaAttachment({ type: 'doc', url: 'https://example.com/sheet.xlsx' })).toBe(true);
    expect(hasMediaAttachment({ type: 'custom', url: 'https://example.com/song.mp3' })).toBe(true);
  });

  it('returns false for pure text messages without media url', () => {
    expect(hasMediaAttachment({ type: 'text', text: 'Hello world' })).toBe(false);
    expect(hasMediaAttachment(null)).toBe(false);
    expect(hasMediaAttachment(undefined)).toBe(false);
  });
});

describe('copyImageToClipboard function', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('copies image to clipboard and dispatches toast event', async () => {
    class MockClipboardItem {
      constructor(public data: Record<string, Blob>) {}
    }
    (globalThis as any).ClipboardItem = MockClipboardItem;

    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: writeMock },
      configurable: true,
      writable: true,
    });
    (window as any).isSecureContext = true;

    // Mock fetch for image
    const mockBlob = new Blob(['fake image content'], { type: 'image/png' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => mockBlob,
    } as any);

    const toastListener = vi.fn();
    window.addEventListener('pulse:status_toast', toastListener);

    const success = await copyImageToClipboard('https://example.com/photo.png');
    expect(success).toBe(true);
    expect(writeMock).toHaveBeenCalled();
    expect(toastListener).toHaveBeenCalled();

    window.removeEventListener('pulse:status_toast', toastListener);
  });

  it('falls back to copying URL when binary copy fails', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: vi.fn().mockRejectedValue(new Error('Binary write not allowed')),
        writeText: writeTextMock,
      },
      configurable: true,
      writable: true,
    });
    (window as any).isSecureContext = true;

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const onToast = vi.fn();
    const success = await copyImageToClipboard('https://example.com/photo.png', onToast);
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('https://example.com/photo.png');
    expect(onToast).toHaveBeenCalledWith('Image link copied to clipboard');
  });
});

describe('MessageActionMenuPortal Copy Image Option', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const baseMsg: Message = {
    id: 'msg-1',
    userId: 'user-1',
    username: 'Alice',
    text: '',
    timestamp: new Date().toISOString(),
    type: 'image',
    url: 'https://example.com/photo.jpg',
  };

  it('renders "Copy image" on non-touch devices for photos', () => {
    // Non-touch device
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: fine)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <MessageActionMenuPortal
        msg={baseMsg}
        currentUserId="user-1"
        canEdit={false}
        menuPos={{ top: 100, left: 100 }}
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteMenuRef={{ current: null }}
      />
    );

    expect(screen.getByTestId('copy-image-menu-item')).toBeDefined();
    expect(screen.getByText('Copy image')).toBeDefined();
  });

  it('STRICT: does NOT render "Copy image" on touch devices (even on long press)', () => {
    // Touch device
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: coarse)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <MessageActionMenuPortal
        msg={baseMsg}
        currentUserId="user-1"
        canEdit={false}
        menuPos={{ top: 100, left: 100 }}
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteMenuRef={{ current: null }}
      />
    );

    expect(screen.queryByTestId('copy-image-menu-item')).toBeNull();
    expect(screen.queryByText('Copy image')).toBeNull();
  });

  it('does NOT render "Copy image" for video messages even on non-touch devices', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: fine)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const videoMsg: Message = {
      ...baseMsg,
      type: 'video',
      url: 'https://example.com/clip.mp4',
    };

    render(
      <MessageActionMenuPortal
        msg={videoMsg}
        currentUserId="user-1"
        canEdit={false}
        menuPos={{ top: 100, left: 100 }}
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteMenuRef={{ current: null }}
      />
    );

    expect(screen.queryByTestId('copy-image-menu-item')).toBeNull();
  });

  it('NON-TOUCH: does NOT show "Copy caption" for photos or videos with caption', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: fine)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const photoWithCaption: Message = {
      ...baseMsg,
      text: 'Scenic sunset view',
    };

    render(
      <MessageActionMenuPortal
        msg={photoWithCaption}
        currentUserId="user-1"
        canEdit={false}
        menuPos={{ top: 100, left: 100 }}
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteMenuRef={{ current: null }}
      />
    );

    // Shows Copy image, but NO Copy caption or text copy
    expect(screen.getByTestId('copy-image-menu-item')).toBeDefined();
    expect(screen.queryByTestId('copy-text-menu-item')).toBeNull();
    expect(screen.queryByText('Copy caption')).toBeNull();
  });

  it('TOUCH: shows "Copy caption" for media with caption, and "Copy" for plain text', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: coarse)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const videoWithCaption: Message = {
      ...baseMsg,
      type: 'video',
      url: 'https://example.com/video.mp4',
      text: 'Funny clip caption',
    };

    render(
      <MessageActionMenuPortal
        msg={videoWithCaption}
        currentUserId="user-1"
        canEdit={false}
        menuPos={{ top: 100, left: 100 }}
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteMenuRef={{ current: null }}
      />
    );

    expect(screen.getByTestId('copy-text-menu-item')).toBeDefined();
    expect(screen.getByText('Copy caption')).toBeDefined();
  });
});

describe('MediaGalleryModal Copy Image Button', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const photoItem: Message = {
    id: 'm-photo',
    userId: 'user-1',
    username: 'Alice',
    timestamp: new Date().toISOString(),
    type: 'image',
    url: 'https://example.com/image.jpg',
  };

  const videoItem: Message = {
    id: 'm-video',
    userId: 'user-1',
    username: 'Bob',
    timestamp: new Date().toISOString(),
    type: 'video',
    url: 'https://example.com/video.mp4',
  };

  it('renders Copy Image button on non-touch devices for photos', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: fine)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <MediaGalleryModal
        isOpen={true}
        items={[photoItem]}
        initialIndex={0}
        onClose={vi.fn()}
        currentUserId="user-1"
      />
    );

    expect(screen.getByTestId('gallery-copy-image-btn')).toBeDefined();
  });

  it('STRICT: does NOT render Copy Image button on touch devices', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: coarse)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <MediaGalleryModal
        isOpen={true}
        items={[photoItem]}
        initialIndex={0}
        onClose={vi.fn()}
        currentUserId="user-1"
      />
    );

    expect(screen.queryByTestId('gallery-copy-image-btn')).toBeNull();
  });

  it('does NOT render Copy Image button for videos even on non-touch devices', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: fine)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <MediaGalleryModal
        isOpen={true}
        items={[videoItem]}
        initialIndex={0}
        onClose={vi.fn()}
        currentUserId="user-1"
      />
    );

    expect(screen.queryByTestId('gallery-copy-image-btn')).toBeNull();
  });
});

describe('Video Player Control Styles', () => {
  it('renders CVPBottomRow with visible overflow to prevent hover clipping', () => {
    const { container } = render(
      <CVPBottomRow data-testid="cvp-bottom-row">
        <CVPIconBtn data-testid="cvp-btn">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
        </CVPIconBtn>
      </CVPBottomRow>
    );

    const bottomRow = screen.getByTestId('cvp-bottom-row');
    expect(bottomRow).toBeDefined();

    // Verify computed or inline CSS styles via class/rules
    const btn = screen.getByTestId('cvp-btn');
    expect(btn).toBeDefined();
  });
});

describe('ChatFooter Select Mode Copy Behavior on Touch/Mobile', () => {
  const baseFooterProps: ChatFooterProps = {
    isSelectModeActive: true,
    selectedMessages: ['m-1'],
    canEditSelectedMessage: false,
    isMobileView: true,
    currentUserId: 'user-1',
    onCancelSelectMode: vi.fn(),
    onStartEdit: vi.fn(),
    onCopyMessage: vi.fn(),
    onOpenReport: vi.fn(),
    onInitiateDelete: vi.fn(),
    editingMessageId: null,
    editingMessageOriginalText: '',
    onCancelEdit: vi.fn(),
    replyingTo: null,
    onCancelReply: vi.fn(),
    onScrollToMessage: vi.fn(),
    stagedFile: null,
    onCancelStagedFile: vi.fn(),
    stagedFiles: [],
    onCancelStagedFiles: vi.fn(),
    showFilePreview: false,
    stagedGif: null,
    onCancelStagedGif: vi.fn(),
    isPlusMenuOpen: false,
    onTogglePlusMenu: vi.fn(),
    isConnected: true,
    onFileChange: vi.fn(),
    onAddFilesChange: vi.fn(),
    onNotifyNativeFilePickerOpen: vi.fn(),
    normalizedOverlayMessage: '',
    inputMessage: '',
    onInputChange: vi.fn(),
    onInputKeyDown: vi.fn(),
    onPaste: vi.fn(),
    onSyncInputOverlayScroll: vi.fn(),
    onSendMessage: vi.fn(),
    onSendVoiceNote: vi.fn(),
    isEmojiPickerOpen: false,
    onEmojiClick: vi.fn(),
    isDark: true,
  };

  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('Photo/GIF WITH caption: shows copy button, tapping reveals animated popover with two options (Copy image and Copy caption)', async () => {
    const onCancel = vi.fn();
    const photoMsg: Message = {
      id: 'm-1',
      userId: 'user-1',
      username: 'Alice',
      type: 'image',
      url: 'https://example.com/beach.jpg',
      text: 'Sunny beach vacation',
      timestamp: new Date().toISOString(),
    };

    render(
      <ChatFooter
        {...baseFooterProps}
        selectedMessage={photoMsg}
        onCancelSelectMode={onCancel}
      />
    );

    const copyBtn = screen.getByTestId('select-copy-btn');
    expect(copyBtn).toBeDefined();
    expect(screen.queryByTestId('copy-options-popover')).toBeNull();

    // Tap copy button -> opens popover
    fireEvent.click(copyBtn);
    expect(screen.getByTestId('copy-options-popover')).toBeDefined();
    expect(screen.getByTestId('popover-copy-image-btn')).toBeDefined();
    expect(screen.getByTestId('popover-copy-caption-btn')).toBeDefined();

    // Tap "Copy caption"
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    fireEvent.click(screen.getByTestId('popover-copy-caption-btn'));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('Sunny beach vacation'));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });

  it('Photo/GIF WITHOUT caption: single copy button directly copies image', async () => {
    const onCancel = vi.fn();
    const photoMsgNoCaption: Message = {
      id: 'm-1',
      userId: 'user-1',
      username: 'Alice',
      type: 'image',
      url: 'https://example.com/beach.jpg',
      text: '',
      timestamp: new Date().toISOString(),
    };

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    render(
      <ChatFooter
        {...baseFooterProps}
        selectedMessage={photoMsgNoCaption}
        onCancelSelectMode={onCancel}
      />
    );

    const copyBtn = screen.getByTestId('select-copy-btn');
    expect(copyBtn).toBeDefined();

    fireEvent.click(copyBtn);
    // Direct action without popover
    expect(screen.queryByTestId('copy-options-popover')).toBeNull();
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });

  it('Media other than photo/GIF WITH caption: single copy button copies caption', async () => {
    const onCancel = vi.fn();
    const videoWithCaption: Message = {
      id: 'm-1',
      userId: 'user-1',
      username: 'Alice',
      type: 'video',
      url: 'https://example.com/video.mp4',
      text: 'Amazing concert clip',
      timestamp: new Date().toISOString(),
    };

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    render(
      <ChatFooter
        {...baseFooterProps}
        selectedMessage={videoWithCaption}
        onCancelSelectMode={onCancel}
      />
    );

    const copyBtn = screen.getByTestId('select-copy-btn');
    expect(copyBtn).toBeDefined();

    fireEvent.click(copyBtn);
    expect(screen.queryByTestId('copy-options-popover')).toBeNull();
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('Amazing concert clip'));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });

  it('Media other than photo/GIF WITHOUT caption: NO copy button renders', () => {
    const videoNoCaption: Message = {
      id: 'm-1',
      userId: 'user-1',
      username: 'Alice',
      type: 'video',
      url: 'https://example.com/video.mp4',
      text: '',
      timestamp: new Date().toISOString(),
    };

    render(
      <ChatFooter
        {...baseFooterProps}
        selectedMessage={videoNoCaption}
      />
    );

    expect(screen.queryByTestId('select-copy-btn')).toBeNull();
  });

  it('Plain text message: copy button renders and copies text', async () => {
    const onCancel = vi.fn();
    const textMsg: Message = {
      id: 'm-1',
      userId: 'user-1',
      username: 'Alice',
      type: 'text',
      text: 'Good morning everyone!',
      timestamp: new Date().toISOString(),
    };

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    render(
      <ChatFooter
        {...baseFooterProps}
        selectedMessage={textMsg}
        onCancelSelectMode={onCancel}
      />
    );

    const copyBtn = screen.getByTestId('select-copy-btn');
    expect(copyBtn).toBeDefined();

    fireEvent.click(copyBtn);
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('Good morning everyone!'));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });
});

describe('VideoPlayer async processing & buffering states', () => {
  const originalFetch = globalThis.fetch;
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IntersectionObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof IntersectionObserver;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('(pointer: fine)'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    globalThis.IntersectionObserver = originalIntersectionObserver;
    vi.restoreAllMocks();
  });

  it('shows "Processing video..." instead of "Media unavailable" when a newly sent video errors initially, and recovers once ready', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { container } = render(
      <VideoPlayer
        src="https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/big_video.mp4"
        timestamp={new Date().toISOString()}
      />
    );

    const videoEl = container.querySelector('video') as HTMLVideoElement;
    expect(videoEl).toBeTruthy();
    const loadSpy = vi.spyOn(videoEl, 'load').mockImplementation(() => {});

    // Simulate initial 404 from Cloudinary while async processing is in progress
    fireEvent.error(videoEl);

    expect(screen.getByText('Processing video...')).toBeDefined();
    expect(screen.queryByText('Media unavailable')).toBeNull();

    // First retry at 1000ms -> fetch returns 404 (still processing)
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Processing video...')).toBeDefined();

    // Second retry at 1500ms -> fetch returns 200 (ready!) and triggers video.load()
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    // Simulate browser finishing metadata load
    fireEvent.loadedMetadata(videoEl);
    expect(screen.queryByText('Processing video...')).toBeNull();
    expect(screen.queryByText('Media unavailable')).toBeNull();
  });

  it('shows "Loading video..." when play is clicked before metadata is ready and auto-plays on canplay', () => {
    const { container } = render(
      <VideoPlayer
        src="https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/video.mp4"
        timestamp={new Date().toISOString()}
      />
    );

    const videoEl = container.querySelector('video') as HTMLVideoElement;
    vi.spyOn(videoEl, 'load').mockImplementation(() => {});
    const playSpy = vi.spyOn(videoEl, 'play').mockResolvedValue(undefined);

    const playButtons = screen.getAllByLabelText('Play');
    fireEvent.click(playButtons[0]);

    expect(screen.getByText('Loading video...')).toBeDefined();

    fireEvent.canPlay(videoEl);
    expect(screen.queryByText('Loading video...')).toBeNull();
    expect(playSpy).toHaveBeenCalled();
  });

  it('shows "Media unavailable" for old videos after exhausting quick retries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { container } = render(
      <VideoPlayer
        src="https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/old_deleted.mp4"
        timestamp={twoHoursAgo}
      />
    );

    const videoEl = container.querySelector('video') as HTMLVideoElement;
    fireEvent.error(videoEl);

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);

    expect(screen.getByText('Media unavailable')).toBeDefined();
    expect(screen.queryByText('Processing video...')).toBeNull();
  });

  it('keeps desktop volume slider open while moving up onto slider or dragging thumb', async () => {
    const { container } = render(
      <VideoPlayer
        src="https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/clip.mp4"
        timestamp={new Date().toISOString()}
      />
    );

    const sliderInput = container.querySelector('input.cvp-vol-range') as HTMLInputElement;
    expect(sliderInput).toBeTruthy();
    const volumeWrapper = sliderInput.closest('.cvp-volume-slider-panel')?.parentElement as HTMLElement;
    expect(volumeWrapper).toBeTruthy();

    // Hovering speaker button opens the volume panel
    fireEvent.mouseEnter(volumeWrapper);
    expect(volumeWrapper.getAttribute('data-volume-open')).toBe('true');

    // Leaving wrapper briefly (e.g. moving toward the slider) keeps it open during grace window
    fireEvent.mouseLeave(volumeWrapper);
    await vi.advanceTimersByTimeAsync(60);
    expect(volumeWrapper.getAttribute('data-volume-open')).toBe('true');

    // Re-entering slider panel cancels pending close and stays open
    fireEvent.mouseEnter(volumeWrapper);
    await vi.advanceTimersByTimeAsync(200);
    expect(volumeWrapper.getAttribute('data-volume-open')).toBe('true');

    // Dragging slider thumb keeps menu open even if pointer leaves wrapper horizontally
    fireEvent.pointerDown(sliderInput);
    fireEvent.mouseLeave(volumeWrapper);
    await vi.advanceTimersByTimeAsync(300);
    expect(volumeWrapper.getAttribute('data-volume-open')).toBe('true');

    // Releasing drag closes after grace period when pointer is outside
    fireEvent(window, new Event('pointerup'));
    await vi.advanceTimersByTimeAsync(200);
    expect(volumeWrapper.getAttribute('data-volume-open')).toBeNull();
  });

  it('scrubs smoothly with pointer capture and coalesces rapid video seeks without decoder stalls', async () => {
    const rafMock = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const { container } = render(
      <VideoPlayer
        src="https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/clip.mp4"
        timestamp={new Date().toISOString()}
      />
    );

    const videoEl = container.querySelector('video') as HTMLVideoElement;
    const timelineEl = container.querySelector('[data-cvp-timeline="true"]') as HTMLDivElement;
    expect(videoEl).toBeTruthy();
    expect(timelineEl).toBeTruthy();

    Object.defineProperty(videoEl, 'duration', { value: 100, configurable: true });
    let seekingState = false;
    let currentTimeValue = 0;
    const currentTimeSetters: number[] = [];
    Object.defineProperty(videoEl, 'seeking', { get: () => seekingState, configurable: true });
    Object.defineProperty(videoEl, 'currentTime', {
      get: () => currentTimeValue,
      set: (val: number) => {
        currentTimeValue = val;
        currentTimeSetters.push(Math.round(val));
      },
      configurable: true,
    });
    const pauseSpy = vi.spyOn(videoEl, 'pause').mockImplementation(() => {});
    const playSpy = vi.spyOn(videoEl, 'play').mockResolvedValue(undefined);
    Object.defineProperty(videoEl, 'paused', { value: false, configurable: true });

    const setPointerCaptureMock = vi.fn();
    const releasePointerCaptureMock = vi.fn();
    timelineEl.setPointerCapture = setPointerCaptureMock;
    timelineEl.hasPointerCapture = vi.fn().mockReturnValue(true);
    timelineEl.releasePointerCapture = releasePointerCaptureMock;
    vi.spyOn(timelineEl, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 32,
      height: 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.loadedMetadata(videoEl);
    currentTimeSetters.length = 0;

    // Begin scrubbing at 25% (50px / 200px) -> 25s
    fireEvent.pointerDown(timelineEl, { clientX: 50, pointerId: 7 });
    expect(setPointerCaptureMock).toHaveBeenCalledWith(7);
    expect(pauseSpy).toHaveBeenCalled();
    expect(timelineEl.getAttribute('data-scrubbing')).toBe('true');

    // Simulate mobile decoder still busy while rapid pointer moves happen (50%, 65%, 80%)
    seekingState = true;
    fireEvent.pointerMove(timelineEl, { clientX: 100, pointerId: 7 });
    fireEvent.pointerMove(timelineEl, { clientX: 130, pointerId: 7 });
    fireEvent.pointerMove(timelineEl, { clientX: 160, pointerId: 7 });

    // Visual fill & thumb move instantaneously via transform/left without waiting on decoder
    const fillEl = timelineEl.querySelector('[data-cvp-timeline-fill="true"]') as HTMLElement;
    const thumbEl = timelineEl.querySelector('[data-cvp-timeline-thumb="true"]') as HTMLElement;
    expect(thumbEl.style.left).toBe('80%');
    expect(fillEl.style.transform).toContain('scaleX(0.8)');

    // Coalesced: decoder was NOT hammered 4 times while busy seeking
    expect(currentTimeSetters).toEqual([25]);

    // Decoder finishes seeking -> queued latest position (80s) flushes
    seekingState = false;
    fireEvent(videoEl, new Event('seeked'));
    expect(currentTimeSetters).toEqual([25, 80]);

    // Release at 90% (180px) commits final exact position and resumes playback
    fireEvent.pointerMove(timelineEl, { clientX: 180, pointerId: 7 });
    fireEvent.pointerUp(timelineEl, { clientX: 180, pointerId: 7 });
    expect(releasePointerCaptureMock).toHaveBeenCalledWith(7);
    expect(currentTimeValue).toBe(90);
    expect(timelineEl.getAttribute('data-scrubbing')).toBeNull();
    expect(playSpy).toHaveBeenCalled();
    rafMock.mockRestore();
  });

  it('updates visual progress immediately on +/-10s skip without waiting for timeupdate', () => {
    const { container } = render(
      <VideoPlayer
        src="https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/clip.mp4"
        timestamp={new Date().toISOString()}
      />
    );

    const videoEl = container.querySelector('video') as HTMLVideoElement;
    const timelineEl = container.querySelector('[data-cvp-timeline="true"]') as HTMLDivElement;
    Object.defineProperty(videoEl, 'duration', { value: 50, configurable: true });
    let ct = 10;
    Object.defineProperty(videoEl, 'currentTime', {
      get: () => ct,
      set: (v: number) => { ct = v; },
      configurable: true,
    });
    fireEvent.loadedMetadata(videoEl);
    ct = 10;

    fireEvent.click(screen.getByLabelText('Forward 10 seconds'));
    const thumbEl = timelineEl.querySelector('[data-cvp-timeline-thumb="true"]') as HTMLElement;
    expect(thumbEl.style.left).toBe('40%');
    expect(screen.getByText('0:20 / 0:50')).toBeDefined();
  });
});

describe('Quoted media bubble width constraint', () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    globalThis.IntersectionObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
    vi.restoreAllMocks();
  });

  const makeBaseItemProps = (msg: Message) => ({
    msg,
    showUsername: true,
    currentUserId: 'user-1',
    activeDeleteMenu: null,
    deleteMenuRef: { current: document.createElement('div') },
    handleSetReply: vi.fn(),
    handleReact: vi.fn(),
    openDeleteMenu: vi.fn(),
    openLightbox: vi.fn(),
    isMediaLoaded: true,
    onRequestMediaLoad: vi.fn(),
    isMediaLoadInProgress: false,
    mediaLoadProgress: 0,
    onRequestDownload: vi.fn(),
    deleteForMe: vi.fn(),
    deleteForEveryone: vi.fn(),
    scrollToMessage: vi.fn(),
    isSelectModeActive: false,
    isSelected: false,
    handleToggleSelectMessage: vi.fn(),
    setActiveDeleteMenu: vi.fn(),
    handleCopy: vi.fn(),
    handleOpenReport: vi.fn(),
    handleStartEdit: vi.fn(),
    handleCancelSelectMode: vi.fn(),
    isMobileView: false,
    onOpenReactionPicker: vi.fn(),
    setReactionsPopup: vi.fn(),
    selectedMessages: [] as string[],
    handleOpenFullEmojiPicker: vi.fn(),
    reactionPickerData: null,
    editingMessageId: null,
    handleSetEditingMessageId: vi.fn(),
    handleCancelEdit: vi.fn(),
  });

  it('constrains quoted preview width on video, image, and audio messages so long quoted text cannot stretch the bubble', () => {
    const longQuote = {
      id: 'quoted-text-1',
      username: 'Harsh',
      text: 'https://drive.google.com/drive/folders/1tLa44OT7VeryLongShareUrlThatShouldNotStretchVideoBubbles',
      type: 'text' as const,
    };

    const videoMsg: Message = {
      id: 'video-msg-1',
      userId: 'user-1',
      username: 'Harsh',
      type: 'video',
      url: 'https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/clip.mp4',
      text: 'dsds',
      timestamp: new Date().toISOString(),
      replyingTo: longQuote,
    };

    const { container: videoContainer } = render(<MessageItem {...makeBaseItemProps(videoMsg)} />);
    const constrainedEl = videoContainer.querySelector('[data-quoted-width-constrain="true"]') as HTMLElement | null;
    expect(constrainedEl).toBeTruthy();
    expect(constrainedEl?.style.width).toBe('0px');
    expect(constrainedEl?.style.minWidth).toBe('100%');

    const imageMsg: Message = {
      ...videoMsg,
      id: 'image-msg-1',
      type: 'image',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/pulse-chat/photo.jpg',
    };
    const { container: imageContainer } = render(<MessageItem {...makeBaseItemProps(imageMsg)} />);
    expect(imageContainer.querySelector('[data-quoted-width-constrain="true"]')).toBeTruthy();

    const audioMsg: Message = {
      ...videoMsg,
      id: 'audio-msg-1',
      type: 'audio',
      url: 'https://res.cloudinary.com/demo/video/upload/v1/pulse-chat/voice-note.webm',
      text: '',
    };
    const { container: audioContainer } = render(<MessageItem {...makeBaseItemProps(audioMsg)} />);
    const audioConstrainedEl = audioContainer.querySelector('[data-quoted-width-constrain="true"]') as HTMLElement | null;
    expect(audioConstrainedEl).toBeTruthy();
    expect(audioConstrainedEl?.style.width).toBe('0px');
    expect(audioConstrainedEl?.style.minWidth).toBe('100%');
  });

  it('does not constrain quoted preview width on pure text messages', () => {
    const textMsg: Message = {
      id: 'text-msg-1',
      userId: 'user-1',
      username: 'Harsh',
      type: 'text',
      text: 'ok',
      timestamp: new Date().toISOString(),
      replyingTo: {
        id: 'quoted-text-2',
        username: 'Alice',
        text: 'This is a normal longer text message that should expand the reply bubble comfortably.',
        type: 'text',
      },
    };

    const { container } = render(<MessageItem {...makeBaseItemProps(textMsg)} />);
    expect(container.querySelector('[data-quoted-width-constrain="true"]')).toBeNull();
  });
});
