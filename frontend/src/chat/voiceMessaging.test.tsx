import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react';
import { formatAudioDuration, generateDeterministicWaveform, audioCoordinator, AudioMessagePlayer } from './components/message/AudioMessagePlayer';
import { MessageQuotedPreview } from './components/message/MessageQuotedPreview';
import { MessageActionMenuPortal } from './components/message/MessageActionMenuPortal';
import { ChatFooter } from './components/ChatFooter';
import type { Message } from './types';
import { setAudioDurationCache, isCloudinaryUrl } from './utils';

// Mock audio element behavior in jsdom
beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
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
      render(
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

    it('reliably calls onErrorToast on repeated consecutive clicks when microphone access fails', async () => {
      Object.defineProperty(window, 'isSecureContext', {
        value: true,
        writable: true,
        configurable: true,
      });

      // Mock getUserMedia rejecting with NotAllowedError
      const mockGetUserMedia = vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
        writable: true,
        configurable: true,
      });

      const onErrorToastMock = vi.fn();
      render(
        <ChatFooter
          {...baseFooterProps}
          inputMessage=""
          onErrorToast={onErrorToastMock}
        />
      );

      const micBtn = screen.getByLabelText('Record voice message');

      // Click 1
      await act(async () => {
        fireEvent.click(micBtn);
      });
      expect(onErrorToastMock).toHaveBeenCalledTimes(1);
      expect(onErrorToastMock).toHaveBeenLastCalledWith(
        'Microphone access was denied. Please allow microphone permissions in browser settings.'
      );

      // Click 2 (must not be suppressed or deduplicated away)
      await act(async () => {
        fireEvent.click(micBtn);
      });
      expect(onErrorToastMock).toHaveBeenCalledTimes(2);

      // Click 3
      await act(async () => {
        fireEvent.click(micBtn);
      });
      expect(onErrorToastMock).toHaveBeenCalledTimes(3);
    });

    it('shows secure connection message when context is insecure (e.g. mobile over HTTP)', async () => {
      Object.defineProperty(window, 'isSecureContext', {
        value: false,
        writable: true,
        configurable: true,
      });

      const onErrorToastMock = vi.fn();
      render(
        <ChatFooter
          {...baseFooterProps}
          inputMessage=""
          onErrorToast={onErrorToastMock}
        />
      );

      const micBtn = screen.getByLabelText('Record voice message');
      await act(async () => {
        fireEvent.click(micBtn);
      });

      expect(onErrorToastMock).toHaveBeenCalledWith(
        'Microphone requires a secure connection (HTTPS or localhost).'
      );
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
        text: 'Testing voice quote',
        type: 'text',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'voice_1',
          username: 'Alice',
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

      expect(getByText('Alice')).toBeDefined();
      expect(getByText('Voice Message')).toBeDefined();
      const badge = getByTestId('quoted-audio-duration-badge');
      expect(badge.textContent).toContain('0:45');
    });

    it('dynamically displays duration badge when audio duration resolves asynchronously or updates in cache', async () => {
      const mockQuotingMessageWithoutDuration: Message = {
        id: 'msg_reply_2',
        userId: 'user_2',
        username: 'Bob',
        text: 'yahi tha nah woh audio???',
        type: 'text',
        timestamp: new Date().toISOString(),
        replyingTo: {
          id: 'voice_dynamic_target',
          username: 'khushu',
          text: 'Voice Message',
          type: 'audio',
          url: 'https://example.com/dynamic_voice.mp3',
        },
      };

      const { queryByTestId, getByTestId } = render(
        <MessageQuotedPreview
          msg={mockQuotingMessageWithoutDuration}
          currentUserId="user_2"
          sender="me"
          quotedPreviewThumbUrl=""
          scrollToMessage={vi.fn()}
        />
      );

      // Initially no duration on message
      expect(queryByTestId('quoted-audio-duration-badge')).toBeNull();

      // Audio player or loader resolves metadata and publishes to cache
      act(() => {
        setAudioDurationCache('voice_dynamic_target', 68);
      });

      // Now badge should be visible and showing 1:08
      const badge = getByTestId('quoted-audio-duration-badge');
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain('1:08');
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

  describe('Instant Playback of Newly Recorded Voice Notes', () => {
    it('calls audio.load() on mount for optimistic blob messages and plays immediately upon click', async () => {
      const blobUrl = 'blob:http://localhost:3000/voice-test-blob';
      const optimisticVoiceNote: Message = {
        id: 'temp_voice_123',
        clientTempId: 'temp_voice_123',
        localBlobUrl: blobUrl,
        userId: 'user_1',
        username: 'Me',
        type: 'audio',
        url: blobUrl,
        duration: 8,
        isUploading: true,
        timestamp: new Date().toISOString(),
      };

      const { container } = render(
        <AudioMessagePlayer msg={optimisticVoiceNote} sender="me" isSelectModeActive={false} />
      );

      // Verify audio element has src pointing to blob and preload="auto"
      const audioElement = container.querySelector('audio');
      expect(audioElement).toBeDefined();
      expect(audioElement?.getAttribute('src')).toBe(blobUrl);
      expect(audioElement?.getAttribute('preload')).toBe('auto');
      expect(window.HTMLMediaElement.prototype.load).toHaveBeenCalled();

      // Click play immediately during upload
      const playBtn = screen.getByLabelText('Play voice message');
      await act(async () => {
        fireEvent.click(playBtn);
      });

      // Should be actively playing
      expect(screen.getByLabelText('Pause voice message')).toBeDefined();
      expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    });

    it('preserves local blob audio source and continuous playback when message transitions to uploaded', async () => {
      const blobUrl = 'blob:http://localhost:3000/voice-persistent-blob';
      const optimisticMsg: Message = {
        id: 'temp_voice_999',
        clientTempId: 'temp_voice_999',
        localBlobUrl: blobUrl,
        userId: 'user_1',
        username: 'Me',
        type: 'audio',
        url: blobUrl,
        duration: 12,
        isUploading: true,
        timestamp: new Date().toISOString(),
      };

      const { container, rerender } = render(
        <AudioMessagePlayer msg={optimisticMsg} sender="me" isSelectModeActive={false} />
      );

      // Start playback while uploading
      const playBtn = screen.getByLabelText('Play voice message');
      await act(async () => {
        fireEvent.click(playBtn);
      });
      expect(screen.getByLabelText('Pause voice message')).toBeDefined();

      // Simulate upload completion: id becomes MongoDB id, url becomes Cloudinary
      const uploadedMsg: Message = {
        ...optimisticMsg,
        id: '671c50e123456789abcdef01',
        clientTempId: 'temp_voice_999',
        url: 'https://res.cloudinary.com/pulse/audio/upload/voice-msg.webm',
        isUploading: false,
      };

      await act(async () => {
        rerender(
          <AudioMessagePlayer msg={uploadedMsg} sender="me" isSelectModeActive={false} />
        );
      });

      // The audio element MUST still maintain the local blob to prevent reload/stutter
      const audioElement = container.querySelector('audio');
      expect(audioElement?.getAttribute('src')).toBe(blobUrl);

      // Playback must not have been paused or aborted
      expect(screen.getByLabelText('Pause voice message')).toBeDefined();
      expect(window.HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    });

    it('never uses localBlobUrl when sender is other, strictly using the remote url', () => {
      const remoteUrl = 'https://res.cloudinary.com/pulse/audio/upload/remote-test.webm';
      const foreignBlobUrl = 'blob:http://localhost:3000/foreign-device-blob';
      const remoteMsg: Message = {
        id: 'msg_remote_101',
        clientTempId: 'msg_remote_101',
        localBlobUrl: foreignBlobUrl,
        userId: 'user_remote',
        username: 'UserB',
        type: 'audio',
        url: remoteUrl,
        duration: 15,
        isUploading: false,
        timestamp: new Date().toISOString(),
      };

      const { container } = render(
        <AudioMessagePlayer msg={remoteMsg} sender="other" isSelectModeActive={false} />
      );

      const audioElement = container.querySelector('audio');
      expect(audioElement?.getAttribute('src')).toBe(remoteUrl);
      expect(audioElement?.getAttribute('src')).not.toBe(foreignBlobUrl);
    });

    it('falls back to Cloudinary mp3 url when webm audio triggers error', async () => {
      const cloudinaryWebmUrl = 'https://res.cloudinary.com/test-cloud/video/upload/v1/pulse-chat/voice-test.webm';
      const remoteMsg: Message = {
        id: 'msg_webm_err',
        userId: 'user_remote',
        username: 'UserB',
        type: 'audio',
        url: cloudinaryWebmUrl,
        duration: 10,
        isUploading: false,
        timestamp: new Date().toISOString(),
      };

      const { container } = render(
        <AudioMessagePlayer msg={remoteMsg} sender="other" isSelectModeActive={false} />
      );

      const audioElement = container.querySelector('audio');
      expect(audioElement?.getAttribute('src')).toBe(cloudinaryWebmUrl);

      // Simulate audio error (e.g. unsupported webm on iOS Safari)
      await act(async () => {
        fireEvent.error(audioElement!);
      });

      // After error on Cloudinary webm, activeSrc must transition to mp3
      const expectedMp3Url = 'https://res.cloudinary.com/test-cloud/video/upload/v1/pulse-chat/voice-test.mp3';
      expect(audioElement?.getAttribute('src')).toBe(expectedMp3Url);
    });

    it('handles 404/corrupted audio gracefully by displaying Unavailable indicator and shaking on click', async () => {
      const corruptedUrl = 'https://res.cloudinary.com/test-cloud/video/upload/v1/pulse-chat/corrupted-audio.mp3';
      const corruptMsg: Message = {
        id: 'msg_corrupt_1',
        userId: 'user_1',
        username: 'Alice',
        type: 'audio',
        url: corruptedUrl,
        duration: 15,
        timestamp: new Date().toISOString(),
      };

      const { container } = render(
        <AudioMessagePlayer msg={corruptMsg} sender="other" isSelectModeActive={false} />
      );

      const audioElement = container.querySelector('audio')!;
      // Simulate audio load failure (404 Not Found)
      await act(async () => {
        fireEvent.error(audioElement);
      });

      // Timer should switch to "Unavailable"
      expect(screen.getByText('Unavailable')).toBeDefined();

      // Play button should reflect unavailable state
      const button = screen.getByLabelText('Audio unavailable on server');
      expect(button).toBeDefined();

      // Clicking play in unavailable state must not trigger media play
      await act(async () => {
        fireEvent.click(button);
      });
      expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    });
  });

  describe('isCloudinaryUrl URL sanitization (CodeQL CWE-020)', () => {
    it('accurately identifies genuine Cloudinary URLs', () => {
      expect(isCloudinaryUrl('https://res.cloudinary.com/demo/video/upload/audio.webm')).toBe(true);
      expect(isCloudinaryUrl('https://api.cloudinary.com/v1_1/demo/resources')).toBe(true);
      expect(isCloudinaryUrl('http://cloudinary.com/assets/audio.mp3')).toBe(true);
      expect(isCloudinaryUrl('https://subdomain.res.cloudinary.com/file.webm')).toBe(true);
    });

    it('rejects spoofed URLs with cloudinary.com in domain suffix or path', () => {
      expect(isCloudinaryUrl('https://evil-cloudinary.com/audio.webm')).toBe(false);
      expect(isCloudinaryUrl('https://notcloudinary.com/audio.webm')).toBe(false);
      expect(isCloudinaryUrl('https://attacker.com/res.cloudinary.com/audio.webm')).toBe(false);
      expect(isCloudinaryUrl('https://attacker.com?redirect=res.cloudinary.com')).toBe(false);
      expect(isCloudinaryUrl('javascript:alert(1)')).toBe(false);
      expect(isCloudinaryUrl('')).toBe(false);
      expect(isCloudinaryUrl(null)).toBe(false);
      expect(isCloudinaryUrl(undefined)).toBe(false);
    });
  });
});
