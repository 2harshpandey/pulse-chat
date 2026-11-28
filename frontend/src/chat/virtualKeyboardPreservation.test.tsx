import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { CHAT_INPUT_ID, usePreserveVirtualKeyboard } from './utils/keyboardPreservation';
import { AudioMessagePlayer } from './components/message/AudioMessagePlayer';
import { MediaDownloadButton } from './components/message/MediaDownloadButton';
import { MessageReactions } from './components/message/MessageReactions';
import { ReactionsPopup } from './components/modals/ReactionsPopup';
import { MediaTapToLoadOverlay } from './components/message/MediaOverlayPrimitives';
import { PinnedMessageBanner } from './components/PinnedMessageBanner';
import { ChatHeader } from './components/ChatHeader';
import { VideoPlayer } from './VideoPlayer';
import { useChatComposer } from './hooks/useChatComposer';
import type { Message } from './types';

function GlobalKeyboardHarness({ children }: { children: React.ReactNode }) {
  usePreserveVirtualKeyboard(true);
  return (
    <div>
      <textarea id={CHAT_INPUT_ID} data-testid="chat-input" />
      <input type="text" id="chat-search-input" data-testid="search-input" />
      {children}
    </div>
  );
}

describe('Touch virtual keyboard preservation across chat controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  const assertPreservesBothStates = (
    element: HTMLElement,
    triggerClick?: () => void
  ) => {
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;

    // 1. When keyboard is open (composer focused), tapping element must prevent focus theft
    input.focus();
    expect(document.activeElement).toBe(input);

    const pdEvent = new Event('pointerdown', { bubbles: true, cancelable: true });
    element.dispatchEvent(pdEvent);
    expect(pdEvent.defaultPrevented).toBe(true);

    const mdEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    element.dispatchEvent(mdEvent);
    expect(mdEvent.defaultPrevented).toBe(true);

    fireEvent.click(element);
    triggerClick?.();
    expect(document.activeElement).toBe(input);

    // 2. When keyboard is closed (composer blurred), tapping element must NOT auto-focus composer
    input.blur();
    expect(document.activeElement).not.toBe(input);
    fireEvent.click(element);
    expect(document.activeElement).not.toBe(input);
  };

  it('prevents focus theft on AudioMessagePlayer play/pause, speed toggle, and waveform slider', () => {
    const audioMsg: Message = {
      id: 'audio-kbd-1',
      userId: 'user-2',
      username: 'Bob',
      type: 'audio',
      url: 'https://cdn.example.com/audio.webm',
      timestamp: new Date().toISOString(),
      duration: 12,
    };

    render(
      <GlobalKeyboardHarness>
        <AudioMessagePlayer msg={audioMsg} sender="other" />
      </GlobalKeyboardHarness>
    );

    const playBtn = screen.getByRole('button', { name: /play voice message/i });
    const speedBtn = screen.getByRole('button', { name: /playback speed/i });
    const waveform = screen.getByRole('slider', { name: /seek audio position/i });

    assertPreservesBothStates(playBtn);
    assertPreservesBothStates(speedBtn);
    assertPreservesBothStates(waveform);
  });

  it('prevents focus theft on inline MediaDownloadButton and MediaTapToLoadOverlay', () => {
    const onRequestDownload = vi.fn();
    const onLoadClick = vi.fn();

    render(
      <GlobalKeyboardHarness>
        <MediaDownloadButton
          messageId="img-kbd-1"
          url="https://cdn.example.com/photo.jpg"
          filename="photo.jpg"
          onRequestDownload={onRequestDownload}
        />
        <MediaTapToLoadOverlay
          isVideo={false}
          isLoading={false}
          progress={0}
          mediaSizeLabel="1.2 MB"
          onClick={onLoadClick}
        />
      </GlobalKeyboardHarness>
    );

    const downloadBtn = screen.getByRole('button', { name: /download media/i });
    const tapToLoadBtn = screen.getByRole('button', { name: /load image/i });

    assertPreservesBothStates(downloadBtn);
    expect(onRequestDownload).toHaveBeenCalled();

    assertPreservesBothStates(tapToLoadBtn);
    expect(onLoadClick).toHaveBeenCalled();
  });

  it('prevents focus theft when tapping reaction badge, reaction picker emoji, and ReactionsPopup rows', () => {
    const onReact = vi.fn();
    const setReactionsPopup = vi.fn();
    const onClosePopup = vi.fn();
    const onRemoveReaction = vi.fn();

    const msg: Message = {
      id: 'react-kbd-1',
      userId: 'user-2',
      username: 'Bob',
      type: 'text',
      text: 'Hello',
      timestamp: new Date().toISOString(),
    };

    const validReactions = {
      '👍': [{ userId: 'user-1', username: 'Me' }],
    };

    render(
      <GlobalKeyboardHarness>
        <MessageReactions
          msg={msg}
          sender="other"
          selectedMessages={['react-kbd-1']}
          validReactions={validReactions}
          currentUserReaction="👍"
          handleReact={onReact}
          handleCancelSelectMode={vi.fn()}
          handleOpenFullEmojiPicker={vi.fn()}
          setReactionsPopup={setReactionsPopup}
        />
        <ReactionsPopup
          popupData={{
            messageId: 'react-kbd-1',
            reactions: validReactions,
            rect: new DOMRect(0, 0, 40, 20),
          }}
          currentUserId="user-1"
          onClose={onClosePopup}
          onRemoveReaction={onRemoveReaction}
        />
      </GlobalKeyboardHarness>
    );

    const reactionBadge = screen.getByTestId('reactions-container');
    assertPreservesBothStates(reactionBadge);
    expect(setReactionsPopup).toHaveBeenCalled();

    const removeRow = screen.getByText('Click to remove').closest('div');
    expect(removeRow).toBeTruthy();
    assertPreservesBothStates(removeRow as HTMLElement);
    expect(onRemoveReaction).toHaveBeenCalled();
  });

  it('prevents focus theft on PinnedMessageBanner and ChatHeader Sound/Theme/UserList toggles', () => {
    const onPinnedClick = vi.fn();
    const onToggleSound = vi.fn();
    const onToggleTheme = vi.fn();
    const onToggleUserList = vi.fn();

    render(
      <GlobalKeyboardHarness>
        <PinnedMessageBanner
          pinnedMessages={[
            { id: 'pin-1', text: 'Important note', username: 'Alice', timestamp: new Date().toISOString() },
          ]}
          currentPinnedIndex={0}
          isJumpingToPinned={false}
          onClick={onPinnedClick}
        />
        <ChatHeader
          isConnected={true}
          isBrowserOnline={true}
          isSoundEnabled={true}
          isSoundToggleAnimating={false}
          onToggleSound={onToggleSound}
          isDark={false}
          onToggleTheme={onToggleTheme}
          isSearchActive={false}
          isSearchClosing={false}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          onOpenSearch={vi.fn()}
          onCloseSearch={vi.fn()}
          isUserListVisible={false}
          onToggleUserList={onToggleUserList}
        />
      </GlobalKeyboardHarness>
    );

    const pinnedBanner = screen.getByText('Important note');
    assertPreservesBothStates(pinnedBanner);
    expect(onPinnedClick).toHaveBeenCalled();

    const soundBtn = screen.getByTitle(/notification sounds on/i);
    const themeBtn = screen.getByTitle(/switch to dark mode/i);
    const usersBtn = screen.getByTitle(/show online users/i);

    assertPreservesBothStates(soundBtn);
    assertPreservesBothStates(themeBtn);
    assertPreservesBothStates(usersBtn);
  });

  it('prevents focus theft on inline VideoPlayer controls and timeline scrub bar', () => {
    const { container } = render(
      <GlobalKeyboardHarness>
        <VideoPlayer src="https://cdn.example.com/clip.mp4" />
      </GlobalKeyboardHarness>
    );

    const playControls = screen.getAllByRole('button', { name: /play/i });
    const speedBtn = screen.getByRole('button', { name: /playback speed/i });
    const timeline = container.querySelector('[data-cvp-timeline="true"]') as HTMLElement;

    expect(playControls.length).toBeGreaterThan(0);
    expect(timeline).toBeTruthy();

    assertPreservesBothStates(playControls[0]);
    assertPreservesBothStates(speedBtn);
    assertPreservesBothStates(timeline);
  });

  it('allows intentional focus transfer to search input and desktop text selection while blocking non-input control focus theft', () => {
    render(
      <GlobalKeyboardHarness>
        <p data-testid="selectable-text">Copyable chat message</p>
        <button type="button">Random button</button>
      </GlobalKeyboardHarness>
    );

    const chatInput = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    const searchInput = screen.getByTestId('search-input') as HTMLInputElement;
    const selectableText = screen.getByTestId('selectable-text');

    chatInput.focus();
    expect(document.activeElement).toBe(chatInput);

    // Focusing search input must NOT be prevented
    const searchMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    searchInput.dispatchEvent(searchMouseDown);
    expect(searchMouseDown.defaultPrevented).toBe(false);

    // Desktop mouse selection on plain message text must NOT be prevented
    const textMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    selectableText.dispatchEvent(textMouseDown);
    expect(textMouseDown.defaultPrevented).toBe(false);

    // Non-input button must be prevented by global capture listener
    const btnMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    screen.getByRole('button', { name: 'Random button' }).dispatchEvent(btnMouseDown);
    expect(btnMouseDown.defaultPrevented).toBe(true);
  });

  it('keeps mobile virtual keyboard untouched when tapping empty chat area or header pointerDown', () => {
    const origOntouchstart = (window as any).ontouchstart;
    const origMaxTouchPoints = navigator.maxTouchPoints;
    const origUA = navigator.userAgent;

    (window as any).ontouchstart = null;
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
      configurable: true,
    });

    const mockTextarea = document.createElement('textarea');
    const mockChatContainer = document.createElement('div');
    document.body.appendChild(mockTextarea);
    document.body.appendChild(mockChatContainer);
    mockTextarea.focus();

    try {
      const { result } = renderHook(() =>
        useChatComposer({
          inputMessage: '',
          setInputMessage: vi.fn(),
          inputMessageRef: { current: '' },
          userId: 'user1',
          roomId: 'room1',
          messageInputRef: { current: mockTextarea } as any,
          inputOverlayRef: { current: null },
          chatContainerRef: { current: mockChatContainer } as any,
          skipNextInputLayoutSyncRef: { current: false },
          resetInputLayerHeight: vi.fn(),
          isMobileView: true,
          stableViewportHeightRef: { current: 800 },
          replyingTo: null,
          setReplyingTo: vi.fn(),
          editingMessageId: null,
          setEditingMessageId: vi.fn(),
          setEditingMessageOriginalText: vi.fn(),
          priorDraftBeforeEdit: '',
          setPriorDraftBeforeEdit: vi.fn(),
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
          messagesRef: { current: [] },
          setMessages: vi.fn(),
          appendMessageToWindow: vi.fn(),
          hasMoreNewerMessagesRef: { current: false },
          jumpToLatestMessages: vi.fn(),
          activeSearchQuery: '',
          chatSearchQuery: '',
          isSearchActive: false,
          resetSearch: vi.fn(),
          forceScrollToBottomAsync: vi.fn(),
          scrollToBottom: vi.fn(),
          syncBottomStateFromScroller: vi.fn(),
          quoteJumpReturnStackRef: { current: [] },
          scrollToLoadedMessage: vi.fn(),
          setNewMessagesWhileScrolledUp: vi.fn(),
          clearQuoteJumpSuppression: vi.fn(),
          setHasMoreOlderMessages: vi.fn(),
          setOldestLoadedAt: vi.fn(),
          setFirstItemIndex: vi.fn(),
        } as any)
      );

      // Tapping empty chat container must leave activeElement focused (no blur)
      act(() => {
        result.current.handleChatAreaClick({
          target: mockChatContainer,
        } as unknown as React.MouseEvent<HTMLDivElement>);
      });
      expect(document.activeElement).toBe(mockTextarea);

      // Header pointer down calls preventDefault unconditionally
      const preventDefault = vi.fn();
      act(() => {
        result.current.handleHeaderButtonPointerDown({
          preventDefault,
        } as unknown as React.PointerEvent);
      });
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(mockTextarea);
    } finally {
      document.body.removeChild(mockTextarea);
      document.body.removeChild(mockChatContainer);
      if (origOntouchstart === undefined) {
        delete (window as any).ontouchstart;
      } else {
        (window as any).ontouchstart = origOntouchstart;
      }
      Object.defineProperty(navigator, 'maxTouchPoints', { value: origMaxTouchPoints, configurable: true });
      Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true });
    }
  });
});
