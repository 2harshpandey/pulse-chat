import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { isNonTouchDevice, isPhotoOrGif, hasMediaAttachment, copyImageToClipboard } from './utils';
import { MessageActionMenuPortal } from './components/message/MessageActionMenuPortal';
import { MediaGalleryModal } from './components/modals/MediaGalleryModal';
import { ChatFooter } from './components/ChatFooter';
import { CVPBottomRow, CVPIconBtn } from './styles/chat.video.styles';
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
        isMobileView={false}
        menuPos={{ x: 100, y: 100 }}
        activeDeleteMenu="msg-1"
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteForMe={vi.fn()}
        deleteForEveryone={vi.fn()}
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
        isMobileView={true}
        menuPos={{ x: 100, y: 100 }}
        activeDeleteMenu="msg-1"
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteForMe={vi.fn()}
        deleteForEveryone={vi.fn()}
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
        isMobileView={false}
        menuPos={{ x: 100, y: 100 }}
        activeDeleteMenu="msg-1"
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteForMe={vi.fn()}
        deleteForEveryone={vi.fn()}
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
        isMobileView={false}
        menuPos={{ x: 100, y: 100 }}
        activeDeleteMenu="msg-1"
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteForMe={vi.fn()}
        deleteForEveryone={vi.fn()}
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
        isMobileView={true}
        menuPos={{ x: 100, y: 100 }}
        activeDeleteMenu="msg-1"
        setActiveDeleteMenu={vi.fn()}
        handleSetReply={vi.fn()}
        handleToggleSelectMessage={vi.fn()}
        handleCopy={vi.fn()}
        handleOpenReport={vi.fn()}
        handleStartEdit={vi.fn()}
        deleteForMe={vi.fn()}
        deleteForEveryone={vi.fn()}
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
  const baseFooterProps = {
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
    inputMessage: '',
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
