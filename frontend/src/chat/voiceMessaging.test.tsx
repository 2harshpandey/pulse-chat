import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react';
import { formatAudioDuration, generateDeterministicWaveform, audioCoordinator, AudioMessagePlayer } from './components/message/AudioMessagePlayer';
import { MessageQuotedPreview } from './components/message/MessageQuotedPreview';
import { MessageActionMenuPortal } from './components/message/MessageActionMenuPortal';
import { ChatFooter } from './components/ChatFooter';
import type { Message } from './types';

// Mock audio element behavior in jsdom
beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Voice Messaging System', () => {
  describe('formatAudioDuration utility', () => {
    it('formats seconds into m:ss correctly', () => {
      expect(formatAudioDuration(0)).toBe('0:00');
      expect(formatAudioDuration(5)).toBe('0:05');
      expect(formatAudioDuration(59)).toBe('0:59');
      expect(formatAudioDuration(60)).toBe('1:00');
      expect(formatAudioDuration(75)).toBe('1:15');
      expect(formatAudioDuration(365)).toBe('6:05');
    });

    it('handles negative, NaN, and infinite values gracefully', () => {
      expect(formatAudioDuration(-10)).toBe('0:00');
      expect(formatAudioDuration(NaN)).toBe('0:00');
      expect(formatAudioDuration(Infinity)).toBe('0:00');
    });
  });

  describe('generateDeterministicWaveform utility', () => {
    it('generates consistent waveform bars between 0.1 and 1.0 for the same input', () => {
      const bars1 = generateDeterministicWaveform('msg_123', 20);
      const bars2 = generateDeterministicWaveform('msg_123', 20);
      expect(bars1).toEqual(bars2);
      expect(bars1.length).toBe(20);
      bars1.forEach(b => {
        expect(b).toBeGreaterThanOrEqual(0.1);
        expect(b).toBeLessThanOrEqual(1.0);
      });
    });

    it('generates different waveforms for different seeds', () => {
      const barsA = generateDeterministicWaveform('seedA', 20);
      const barsB = generateDeterministicWaveform('seedB', 20);
      expect(barsA).not.toEqual(barsB);
    });
  });

  describe('AudioPlaybackCoordinator', () => {
    it('stops previous audio when a new audio starts playing', () => {
      const pauseMock1 = vi.fn();
      const pauseMock2 = vi.fn();

      audioCoordinator.play('audio_1', pauseMock1);
      expect(pauseMock1).not.toHaveBeenCalled();

      // Playing audio 2 must pause audio 1
      audioCoordinator.play('audio_2', pauseMock2);
      expect(pauseMock1).toHaveBeenCalledTimes(1);
      expect(pauseMock2).not.toHaveBeenCalled();

      // Stopping audio 2
      audioCoordinator.stop('audio_2');
    });
  });

  describe('AudioMessagePlayer Component', () => {
    const mockMessage: Message = {
      id: 'voice_msg_1',
      userId: 'user_1',
      username: 'Alice',
      type: 'audio',
      url: 'https://example.com/audio.webm',
      duration: 42,
      waveform: [0.2, 0.5, 0.8, 0.4, 0.6, 0.9, 0.3, 0.7],
      timestamp: new Date().toISOString(),
      text: 'Voice note description',
    };

    it('renders waveform bars and initial duration correctly', () => {
      const { container } = render(
        <AudioMessagePlayer msg={mockMessage} sender="other" isSelectModeActive={false} />
      );

      // Verify timer displays 0:42
      expect(screen.getByText('0:42')).toBeDefined();

      // Verify speed button starts at 1x
      expect(screen.getByText('1x')).toBeDefined();

      // Verify caption text is rendered
      expect(screen.getByText('Voice note description')).toBeDefined();
    });

    it('cycles playback speed 1x -> 1.5x -> 2x -> 1x when clicking speed button', async () => {
      render(
        <AudioMessagePlayer msg={mockMessage} sender="other" isSelectModeActive={false} />
      );

      const speedBtn = screen.getByText('1x');
      expect(speedBtn).toBeDefined();

      // Click to 1.5x
      await act(async () => {
        fireEvent.click(speedBtn);
      });
      expect(screen.getByText('1.5x')).toBeDefined();

      // Click to 2x
      await act(async () => {
        fireEvent.click(screen.getByText('1.5x'));
      });
      expect(screen.getByText('2x')).toBeDefined();

      // Click to wrap back to 1x
      await act(async () => {
        fireEvent.click(screen.getByText('2x'));
      });
      expect(screen.getByText('1x')).toBeDefined();
    });

    it('toggles play and pause state upon clicking Play button', async () => {
      render(
        <AudioMessagePlayer msg={mockMessage} sender="me" isSelectModeActive={false} />
      );

      const playBtn = screen.getByLabelText('Play voice message');
      expect(playBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(playBtn);
      });

      // Should now be playing and show pause label
      expect(screen.getByLabelText('Pause voice message')).toBeDefined();
      expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);

      // Click pause
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Pause voice message'));
      });
      expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    });

    it('renders waveform bars in idle state with 0 bars played', () => {
      document.documentElement.setAttribute('data-theme', 'light');
      const { container } = render(
        <AudioMessagePlayer msg={mockMessage} sender="me" isSelectModeActive={false} />
      );

      const waveformContainer = container.querySelector('[title="Seek audio position"]');
      expect(waveformContainer).toBeDefined();
      expect(waveformContainer?.children.length).toBe(34);

      // In idle state, all bars are unplayed (soft translucent white)
      const firstBar = waveformContainer?.children[0] as HTMLElement;
      const lastBar = waveformContainer?.children[33] as HTMLElement;
      expect(window.getComputedStyle(firstBar).backgroundColor).toBe('rgba(255, 255, 255, 0.42)');
      expect(window.getComputedStyle(lastBar).backgroundColor).toBe('rgba(255, 255, 255, 0.42)');
    });

    it('updates bars when seeking to 50%', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      const { container } = render(
        <AudioMessagePlayer msg={mockMessage} sender="me" isSelectModeActive={false} />
      );

      const waveformContainer = container.querySelector('[title="Seek audio position"]') as HTMLElement;
      // Mock getBoundingClientRect
      waveformContainer.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 30,
        width: 200,
        height: 30,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Seek to 50% (x=100)
      await act(async () => {
        fireEvent.click(waveformContainer, { clientX: 100 });
      });

      const firstBar = waveformContainer?.children[0] as HTMLElement;
      const lastBar = waveformContainer?.children[33] as HTMLElement;
      // First half bars should be played (white on user's blue bubble)
      expect(window.getComputedStyle(firstBar).backgroundColor).toBe('rgb(255, 255, 255)');
      // Second half bars should remain unplayed (translucent white)
      expect(window.getComputedStyle(lastBar).backgroundColor).toBe('rgba(255, 255, 255, 0.42)');
    });

    it('renders crisp blue played bars and slate unplayed bars for other users in light mode', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      const { container } = render(
        <AudioMessagePlayer msg={mockMessage} sender="other" isSelectModeActive={false} />
      );

      const waveformContainer = container.querySelector('[title="Seek audio position"]') as HTMLElement;
      waveformContainer.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 30,
        width: 200,
        height: 30,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Seek to 50% (x=100)
      await act(async () => {
        fireEvent.click(waveformContainer, { clientX: 100 });
      });

      const firstBar = waveformContainer?.children[0] as HTMLElement;
      const lastBar = waveformContainer?.children[33] as HTMLElement;
      // First half bars should be played (blue on other user's white bubble)
      expect(window.getComputedStyle(firstBar).backgroundColor).toBe('rgb(37, 99, 235)');
      // Second half bars should remain unplayed (slate grey)
      expect(window.getComputedStyle(lastBar).backgroundColor).toBe('rgba(100, 116, 139, 0.35)');
    });
  });

  describe('ChatFooter Mic vs Send Button Transition', () => {
    const baseFooterProps = {
      isSelectModeActive: false,
      selectedMessages: [],
      canEditSelectedMessage: false,
      isMobileView: false,
      currentUserId: 'me',
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

    it('renders MicButton when input is empty and no files are staged', () => {
      render(<ChatFooter {...baseFooterProps} inputMessage="" />);
      const micBtn = screen.getByLabelText('Record voice message');
      expect(micBtn).toBeDefined();
      expect(screen.queryByLabelText('Send message')).toBeNull();
    });

    it('transitions to SendButton when user types text into input', () => {
      render(<ChatFooter {...baseFooterProps} inputMessage="Hello world" />);
      const sendBtn = screen.getByLabelText('Send message');
      expect(sendBtn).toBeDefined();
      expect(screen.queryByLabelText('Record voice message')).toBeNull();
    });

    it('transitions to SendButton when a file is staged even if text input is empty', () => {
      const dummyFile = new File(['data'], 'test.png', { type: 'image/png' });
      render(<ChatFooter {...baseFooterProps} inputMessage="" stagedFile={dummyFile} />);
      const sendBtn = screen.getByLabelText('Send message');
      expect(sendBtn).toBeDefined();
      expect(screen.queryByLabelText('Record voice message')).toBeNull();
    });

    it('displays Voice Message in reply preview when replying to an audio message without text', () => {
      render(
        <ChatFooter
          {...baseFooterProps}
          replyingTo={{
            id: 'voice_1',
            userId: 'user_1',
            timestamp: new Date().toISOString(),
            username: 'Alice',
            text: '',
            type: 'audio',
            url: 'https://example.com/audio.webm',
          }}
        />
      );
      expect(screen.getByText('Replying to Alice')).toBeDefined();
      expect(screen.getByText('Voice Message')).toBeDefined();
    });
  });

  describe('AudioMessagePlayer in Select Mode', () => {
    it('does not trigger play when clicked while select mode is active', async () => {
      const mockMessage: Message = {
        id: 'voice_msg_sel',
        userId: 'user_1',
        username: 'Alice',
        type: 'audio',
        url: 'https://example.com/audio.webm',
        duration: 30,
        timestamp: new Date().toISOString(),
      };

      render(
        <AudioMessagePlayer msg={mockMessage} sender="other" isSelectModeActive={true} />
      );

      const playBtn = screen.getByLabelText('Play voice message');
      await act(async () => {
        fireEvent.click(playBtn);
      });

      // HTMLMediaElement play should not have been called
      expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    });
  });

  describe('AudioMessagePlayer Keyboard Navigation', () => {
    it('allows seeking via ArrowRight and ArrowLeft keyboard events', async () => {
      const mockMessage: Message = {
        id: 'voice_msg_key',
        userId: 'user_1',
        username: 'Alice',
        type: 'audio',
        url: 'https://example.com/audio.webm',
        duration: 30,
        timestamp: new Date().toISOString(),
      };

      const { container } = render(
        <AudioMessagePlayer msg={mockMessage} sender="other" isSelectModeActive={false} />
      );

      const slider = container.querySelector('[role="slider"]') as HTMLElement;
      expect(slider).toBeDefined();

      // Press ArrowRight to seek forward 5 seconds
      await act(async () => {
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
      });

      // Timer should now show 0:05
      expect(screen.getByText('0:05')).toBeDefined();

      // Press ArrowLeft to seek back
      await act(async () => {
        fireEvent.keyDown(slider, { key: 'ArrowLeft' });
      });

      // Timer should now show 0:00 (or duration when idle at 0)
      expect(screen.getByText('0:30')).toBeDefined();
    });
  });

  describe('Quoted Audio Duration Badge', () => {
    it('renders duration badge with formatted time when quoting an audio message', () => {
      const mockQuotingMessage: Message = {
        id: 'msg_reply_1',
        userId: 'user_2',
        username: 'Bob',
        text: 'yahi tha nah woh audio???',
        type: 'text',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'voice_1',
          username: 'khushu',
          text: '',
          type: 'audio',
          url: 'https://example.com/voice.mp3',
          duration: 45,
        },
      };

      const { getByTestId, getByText } = render(
        <MessageQuotedPreview
          msg={mockQuotingMessage}
          currentUserId="user_2"
          sender="me"
          quotedPreviewThumbUrl=""
          scrollToMessage={vi.fn()}
        />
      );

      expect(getByText('khushu')).toBeDefined();
      expect(getByText('Voice Message')).toBeDefined();
      const badge = getByTestId('quoted-audio-duration-badge');
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain('0:45');
    });
  });

  describe('AudioMessagePlayer Caption Distinction', () => {
    it('renders distinct audio player card and caption container when caption is present', () => {
      const mockMessageWithCaption: Message = {
        id: 'voice_caption_1',
        userId: 'user_1',
        username: 'Alice',
        type: 'audio',
        url: 'https://example.com/audio.mp3',
        text: 'aur doosra audio yeh raha',
        duration: 15,
        timestamp: new Date().toISOString(),
      };

      const { container, getByText } = render(
        <AudioMessagePlayer msg={mockMessageWithCaption} sender="me" isSelectModeActive={false} />
      );

      expect(getByText('aur doosra audio yeh raha')).toBeDefined();
      expect(container.querySelector('[title="Voice message"]')).toBeDefined();
      expect(container.querySelector('[aria-label="Seek audio position"]')).toBeDefined();
    });
  });

  describe('MessageActionMenuPortal Single Message Download', () => {
    it('renders Download item and invokes onDownload when clicked', async () => {
      const mockAudioMessage: Message = {
        id: 'voice_dl_1',
        userId: 'user_1',
        username: 'Alice',
        type: 'audio',
        url: 'https://example.com/audio.mp3',
        originalName: 'recording.mp3',
        timestamp: new Date().toISOString(),
      };

      const onDownloadMock = vi.fn();
      const setActiveDeleteMenuMock = vi.fn();

      render(
        <MessageActionMenuPortal
          msg={mockAudioMessage}
          menuPos={{ top: 100, left: 100 }}
          deleteMenuRef={{ current: document.createElement('div') }}
          currentUserId="user_1"
          canEdit={false}
          handleSetReply={vi.fn()}
          setActiveDeleteMenu={setActiveDeleteMenuMock}
          handleToggleSelectMessage={vi.fn()}
          handleStartEdit={vi.fn()}
          handleCopy={vi.fn()}
          handleOpenReport={vi.fn()}
          onDownload={onDownloadMock}
        />
      );

      const downloadItem = screen.getByTestId('download-message-menu-item');
      expect(downloadItem).toBeDefined();
      expect(downloadItem.textContent).toContain('Download');

      await act(async () => {
        fireEvent.click(downloadItem);
      });

      expect(onDownloadMock).toHaveBeenCalledWith(mockAudioMessage);
      expect(setActiveDeleteMenuMock).toHaveBeenCalledWith(null);
    });
  });
});
