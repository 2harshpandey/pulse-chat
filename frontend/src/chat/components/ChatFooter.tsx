import React from 'react';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import type { Message, Gif } from '../types';
import { MAX_MESSAGE_LENGTH } from '../constants';
import { sanitizeMediaUrl, preserveKeyboardFocus } from '../utils';
import { detectFirstUrl, renderTextWithLinks } from '../utils/urlLinkUtils';
import { FilmIcon, FileIcon } from '../TypingIndicator';
import {
  Footer,
  InputContainer,
  PlusMenuButton,
  PlusMenu,
  PlusMenuItem,
  InputTextWrapper,
  InputHighlightOverlay,
  MessageInput,
  CharacterCounter,
  SendButton,
  MicButton,
} from '../Chat.styles';
import { useVoiceRecorder, type VoicePreviewSnapshot } from '../hooks';
import { audioCoordinator } from './message';
import { SelectModeFooterBar } from './footer/SelectModeFooterBar';
import { ReplyEditPreviewBanner } from './footer/ReplyEditPreviewBanner';
import { VoiceRecordingBar } from './footer/VoiceRecordingBar';

export interface ChatFooterProps {
  isSelectModeActive: boolean;
  selectedMessages: string[];
  selectedMessage?: Message;
  canEditSelectedMessage: boolean;
  isMobileView: boolean;
  currentUserId: string;
  onCancelSelectMode: () => void;
  onStartEdit: (msg: Message) => void;
  onCopyMessage: (msg: Message) => void;
  onOpenReport: (msg: Message) => void;
  onInitiateDelete: () => void;
  hasSelectedMedia?: boolean;
  selectedMediaCount?: number;
  onDownloadSelectedMedia?: () => void;
  onSendVoiceNote?: (file: File, duration: number, waveform?: number[]) => void;
  onVoiceRecordingStart?: () => void;
  onVoiceRecordingStop?: () => void;
  onErrorToast?: (msg: string) => void;

  // Regular input mode props
  editingMessageId: string | null;
  editingMessageOriginalText: string;
  onCancelEdit: () => void;

  replyingTo: Message | null;
  onCancelReply: () => void;
  onScrollToMessage: (id: string, sourceId?: string, behavior?: 'auto' | 'smooth', force?: boolean, payload?: any) => void;
  replyPreviewRef?: React.RefObject<HTMLDivElement>;

  stagedFile: File | null;
  onCancelStagedFile: () => void;
  stagedFiles: File[];
  onCancelStagedFiles: () => void;
  showFilePreview: boolean;

  stagedGif: Gif | null;
  onCancelStagedGif: () => void;

  plusMenuRef?: React.RefObject<HTMLDivElement>;
  plusButtonRef?: React.RefObject<HTMLButtonElement>;
  isPlusMenuOpen: boolean;
  onTogglePlusMenu: () => void;
  isConnected: boolean;

  emojiButtonRef?: React.RefObject<HTMLButtonElement>;
  onEmojiPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onGifPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;

  fileInputRef?: React.RefObject<HTMLInputElement>;
  addFileInputRef?: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddFilesChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNotifyNativeFilePickerOpen: () => void;

  normalizedOverlayMessage: string;
  inputOverlayRef?: React.RefObject<HTMLDivElement>;
  messageInputRef?: React.RefObject<HTMLTextAreaElement>;
  inputMessage: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  onInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onSyncInputOverlayScroll: () => void;
  onSendMessage: () => void;

  isEmojiPickerOpen: boolean;
  emojiPickerRef?: React.RefObject<HTMLDivElement>;
  onEmojiClick: (data: EmojiClickData) => void;
  isDark: boolean;
}

export const ChatFooter: React.FC<ChatFooterProps> = ({
  isSelectModeActive,
  selectedMessages,
  selectedMessage,
  canEditSelectedMessage,
  isMobileView,
  currentUserId,
  onCancelSelectMode,
  onStartEdit,
  onCopyMessage,
  onOpenReport,
  onInitiateDelete,
  hasSelectedMedia,
  selectedMediaCount,
  onDownloadSelectedMedia,
  onSendVoiceNote,
  onVoiceRecordingStart,
  onVoiceRecordingStop,
  onErrorToast,
  editingMessageId,
  editingMessageOriginalText,
  onCancelEdit,
  replyingTo,
  onCancelReply,
  onScrollToMessage,
  replyPreviewRef,
  stagedFile,
  onCancelStagedFile,
  stagedFiles,
  onCancelStagedFiles,
  showFilePreview,
  stagedGif,
  onCancelStagedGif,
  plusMenuRef,
  plusButtonRef,
  isPlusMenuOpen,
  onTogglePlusMenu,
  isConnected,
  emojiButtonRef,
  onEmojiPointerDown,
  onGifPointerDown,
  fileInputRef,
  addFileInputRef,
  onFileChange,
  onAddFilesChange,
  onNotifyNativeFilePickerOpen,
  normalizedOverlayMessage,
  inputOverlayRef,
  messageInputRef,
  inputMessage,
  onInputChange,
  onInputFocus,
  onInputBlur,
  onInputKeyDown,
  onPaste,
  onSyncInputOverlayScroll,
  onSendMessage,
  isEmojiPickerOpen,
  emojiPickerRef,
  onEmojiClick,
  isDark,
}) => {
  const recorder = useVoiceRecorder();
  const [previewSnapshot, setPreviewSnapshot] = React.useState<VoicePreviewSnapshot | null>(null);
  const [previewInitiallyPlaying, setPreviewInitiallyPlaying] = React.useState(false);
  const [isFinalizingRecording, setIsFinalizingRecording] = React.useState(false);
  const isFinalizingRecordingRef = React.useRef(false);
  const wasRecordingRef = React.useRef(false);
  const recordingStopNotifiedRef = React.useRef(false);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const isMountedRef = React.useRef(true);

  // Preload cached blob URL as soon as pause preparation finishes so Play starts without re-loading
  React.useEffect(() => {
    const audio = previewAudioRef.current;
    const safeUrl = recorder.cachedPreviewSnapshot?.previewUrl
      ? sanitizeMediaUrl(recorder.cachedPreviewSnapshot.previewUrl)
      : '';
    if (!audio || !recorder.isRecording || !recorder.isPaused || !safeUrl) return;
    if (audio.src !== safeUrl) {
      audio.src = safeUrl;
      try {
        audio.load();
      } catch {}
    }
  }, [recorder.cachedPreviewSnapshot, recorder.isRecording, recorder.isPaused]);

  const resetPreviewAudioElement = React.useCallback(() => {
    const audio = previewAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
      } catch {}
    }
  }, []);

  const notifyRecordingStopped = React.useCallback(() => {
    if (recordingStopNotifiedRef.current) return;
    recordingStopNotifiedRef.current = true;
    onVoiceRecordingStop?.();
  }, [onVoiceRecordingStop]);

  React.useEffect(() => {
    if (recorder.isRecording) {
      recordingStopNotifiedRef.current = false;
    } else if (wasRecordingRef.current) {
      resetPreviewAudioElement();
      setPreviewSnapshot(null);
      setPreviewInitiallyPlaying(false);
      notifyRecordingStopped();
    }
    wasRecordingRef.current = recorder.isRecording;
  }, [recorder.isRecording, notifyRecordingStopped, resetPreviewAudioElement]);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      resetPreviewAudioElement();
    };
  }, [resetPreviewAudioElement]);

  const handleDiscardVoice = React.useCallback(() => {
    audioCoordinator.stop();
    resetPreviewAudioElement();
    setPreviewSnapshot(null);
    setPreviewInitiallyPlaying(false);
    recorder.cancelRecording();
    notifyRecordingStopped();
  }, [recorder, notifyRecordingStopped, resetPreviewAudioElement]);

  const handleOpenVoicePreview = React.useCallback(async () => {
    if (isFinalizingRecordingRef.current || !recorder.isRecording || !recorder.isPaused) return;

    // Start playback synchronously inside the click gesture when pause has already cached the preview
    const readySnapshot = recorder.cachedPreviewSnapshot;
    const safeReadyUrl = readySnapshot ? sanitizeMediaUrl(readySnapshot.previewUrl) : '';
    if (readySnapshot && safeReadyUrl) {
      audioCoordinator.stop();
      const audio = previewAudioRef.current;
      if (audio) {
        if (audio.src !== safeReadyUrl) {
          audio.src = safeReadyUrl;
          try {
            audio.load();
          } catch {}
        }
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            audio.dispatchEvent(new Event('pulse_play_failed'));
          });
        }
        setPreviewInitiallyPlaying(true);
      } else {
        setPreviewInitiallyPlaying(false);
      }
      setPreviewSnapshot(readySnapshot);
      return;
    }

    isFinalizingRecordingRef.current = true;
    setIsFinalizingRecording(true);
    try {
      audioCoordinator.stop();
      const snapshot = await recorder.preparePreview();
      if (!isMountedRef.current) return;
      if (snapshot) {
        setPreviewInitiallyPlaying(false);
        setPreviewSnapshot(snapshot);
      }
    } finally {
      isFinalizingRecordingRef.current = false;
      if (isMountedRef.current) {
        setIsFinalizingRecording(false);
      }
    }
  }, [recorder]);

  const handleResumeFromPreview = React.useCallback(async () => {
    if (isFinalizingRecordingRef.current || !recorder.isRecording) return;
    isFinalizingRecordingRef.current = true;
    setIsFinalizingRecording(true);
    try {
      audioCoordinator.stop();
      resetPreviewAudioElement();
      setPreviewSnapshot(null);
      setPreviewInitiallyPlaying(false);
      await recorder.resumeRecording();
    } finally {
      isFinalizingRecordingRef.current = false;
      if (isMountedRef.current) {
        setIsFinalizingRecording(false);
      }
    }
  }, [recorder, resetPreviewAudioElement]);

  const handleSendVoice = React.useCallback(async () => {
    if (isFinalizingRecordingRef.current || !isConnected) return;
    isFinalizingRecordingRef.current = true;
    setIsFinalizingRecording(true);
    try {
      audioCoordinator.stop();
      resetPreviewAudioElement();
      setPreviewSnapshot(null);
      setPreviewInitiallyPlaying(false);
      const result = await recorder.stopRecording();
      if (!isMountedRef.current) return;
      if (result && result.file && result.file.size > 0 && result.duration > 0) {
        onSendVoiceNote?.(result.file, result.duration, result.waveform);
      }
      notifyRecordingStopped();
    } finally {
      isFinalizingRecordingRef.current = false;
      if (isMountedRef.current) {
        setIsFinalizingRecording(false);
      }
    }
  }, [isConnected, onSendVoiceNote, recorder, notifyRecordingStopped, resetPreviewAudioElement]);

  // Forward voice recorder errors that occur asynchronously to the unified bottom status toast
  const lastReportedVoiceErrorRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (recorder.error && recorder.error !== lastReportedVoiceErrorRef.current) {
      lastReportedVoiceErrorRef.current = recorder.error;
      onErrorToast?.(recorder.error);
    } else if (!recorder.error) {
      lastReportedVoiceErrorRef.current = null;
    }
  }, [recorder.error, onErrorToast]);

  // Cancel any active voice recording if select mode becomes active
  React.useEffect(() => {
    if (isSelectModeActive && recorder.isRecording) {
      recorder.cancelRecording();
    }
  }, [isSelectModeActive, recorder]);

  // Pressing Enter while recording sends the voice message (unless a focused control like Cancel is active)
  React.useEffect(() => {
    if (!recorder.isRecording) return;
    const handleRecordingKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        if (target && target.closest('button, a, input, select, textarea, [role="button"]')) {
          return;
        }
        e.preventDefault();
        void handleSendVoice();
      }
    };
    window.addEventListener('keydown', handleRecordingKeyDown);
    return () => window.removeEventListener('keydown', handleRecordingKeyDown);
  }, [recorder.isRecording, handleSendVoice]);

  const hasSendableContent = Boolean(
    (inputMessage || '').trim() ||
    stagedFile ||
    stagedGif ||
    stagedFiles.length > 0 ||
    editingMessageId
  );

  return (
    <Footer>
      {isSelectModeActive ? (
        <SelectModeFooterBar
          selectedMessages={selectedMessages}
          selectedMessage={selectedMessage}
          canEditSelectedMessage={canEditSelectedMessage}
          isMobileView={isMobileView}
          currentUserId={currentUserId}
          onCancelSelectMode={onCancelSelectMode}
          onStartEdit={onStartEdit}
          onOpenReport={onOpenReport}
          onInitiateDelete={onInitiateDelete}
          hasSelectedMedia={hasSelectedMedia}
          selectedMediaCount={selectedMediaCount}
          onDownloadSelectedMedia={onDownloadSelectedMedia}
        />
      ) : (
        <div>
          <ReplyEditPreviewBanner
            currentUserId={currentUserId}
            editingMessageId={editingMessageId}
            editingMessageOriginalText={editingMessageOriginalText}
            onCancelEdit={onCancelEdit}
            replyingTo={replyingTo}
            onCancelReply={onCancelReply}
            onScrollToMessage={onScrollToMessage}
            replyPreviewRef={replyPreviewRef}
            stagedFile={stagedFile}
            onCancelStagedFile={onCancelStagedFile}
            stagedFiles={stagedFiles}
            onCancelStagedFiles={onCancelStagedFiles}
            showFilePreview={showFilePreview}
            stagedGif={stagedGif}
            onCancelStagedGif={onCancelStagedGif}
            onErrorToast={onErrorToast}
          />

          <InputContainer>
            {recorder.isRecording && (
              <audio
                ref={previewAudioRef}
                preload="auto"
                style={{ display: 'none' }}
              />
            )}
            {recorder.isRecording ? (
              <VoiceRecordingBar
                recorder={recorder}
                previewSnapshot={previewSnapshot}
                previewInitiallyPlaying={previewInitiallyPlaying}
                isFinalizingRecording={isFinalizingRecording}
                previewAudioRef={previewAudioRef}
                onDiscardVoice={handleDiscardVoice}
                onOpenVoicePreview={handleOpenVoicePreview}
                onResumeFromPreview={handleResumeFromPreview}
                onErrorToast={onErrorToast}
              />
            ) : (
              <>
                <div style={{ position: 'relative' }} ref={plusMenuRef}>
                  <PlusMenuButton
                    ref={plusButtonRef}
                    $isOpen={isPlusMenuOpen}
                    onPointerDown={preserveKeyboardFocus}
                    onMouseDown={preserveKeyboardFocus}
                    onClick={onTogglePlusMenu}
                    disabled={!isConnected}
                    aria-label="Open actions menu"
                    title="Emoji, GIF, or File"
                  >
                    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </PlusMenuButton>

                  <PlusMenu $isVisible={isPlusMenuOpen}>
                    <PlusMenuItem
                      ref={emojiButtonRef}
                      onPointerDown={onEmojiPointerDown}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                      </svg>
                      <span>Emoji</span>
                    </PlusMenuItem>

                    <PlusMenuItem
                      onPointerDown={onGifPointerDown}
                    >
                      <FilmIcon /> <span>GIF</span>
                    </PlusMenuItem>

                    <PlusMenuItem
                      onPointerDown={preserveKeyboardFocus}
                      onMouseDown={preserveKeyboardFocus}
                      onClick={() => {
                        onTogglePlusMenu();
                        onNotifyNativeFilePickerOpen();
                        fileInputRef?.current?.click();
                      }}
                    >
                      <FileIcon /> <span>Send File</span>
                    </PlusMenuItem>
                  </PlusMenu>
                </div>

                <InputTextWrapper>
                  {(() => {
                    const hasUrl = Boolean(detectFirstUrl(normalizedOverlayMessage));
                    return (
                      <>
                        {hasUrl && (
                          <InputHighlightOverlay ref={inputOverlayRef} aria-hidden="true">
                            {renderTextWithLinks(normalizedOverlayMessage, 'other')}
                          </InputHighlightOverlay>
                        )}
                        <MessageInput
                          $hasUrl={hasUrl}
                          ref={messageInputRef}
                          rows={1}
                          id="chat-message-input"
                          name="chatMessage"
                          disabled={!isConnected}
                          placeholder={
                            !isConnected
                              ? 'Connecting...'
                              : editingMessageId
                                ? 'Edit message...'
                                : stagedFile || stagedGif
                                  ? 'Add a caption...'
                                  : 'Type your message...'
                          }
                          value={inputMessage}
                          onChange={onInputChange}
                          onFocus={onInputFocus}
                          onBlur={onInputBlur}
                          onKeyDown={onInputKeyDown}
                          onPaste={onPaste}
                          onScroll={onSyncInputOverlayScroll}
                          maxLength={MAX_MESSAGE_LENGTH}
                        />
                      </>
                    );
                  })()}
                </InputTextWrapper>

                {inputMessage.length >= MAX_MESSAGE_LENGTH - 200 && (
                  <CharacterCounter $warning={inputMessage.length >= MAX_MESSAGE_LENGTH - 20}>
                    {MAX_MESSAGE_LENGTH - inputMessage.length}
                  </CharacterCounter>
                )}
              </>
            )}

            {recorder.isRecording ? (
              <SendButton
                key="voice-send-btn"
                type="button"
                onPointerDown={preserveKeyboardFocus}
                onMouseDown={preserveKeyboardFocus}
                onClick={handleSendVoice}
                disabled={isFinalizingRecording || !isConnected}
                title="Send voice message"
                aria-label="Send voice message"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </SendButton>
            ) : hasSendableContent ? (
              <SendButton
                key="text-send-btn"
                type="button"
                onPointerDown={preserveKeyboardFocus}
                onMouseDown={preserveKeyboardFocus}
                onClick={onSendMessage}
                disabled={!isConnected}
                title={editingMessageId ? 'Save edit' : 'Send message'}
                aria-label={editingMessageId ? 'Save edit' : 'Send message'}
                style={editingMessageId ? { background: 'linear-gradient(135deg, #6366f1, #4f46e5)' } : undefined}
              >
                {editingMessageId ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                )}
              </SendButton>
            ) : (
              <MicButton
                key="voice-mic-btn"
                type="button"
                onPointerDown={preserveKeyboardFocus}
                onMouseDown={preserveKeyboardFocus}
                onClick={async () => {
                  if (!isConnected) return;
                  audioCoordinator.stop();
                  recordingStopNotifiedRef.current = false;
                  onVoiceRecordingStart?.();
                  await recorder.startRecording((err) => {
                    lastReportedVoiceErrorRef.current = err;
                    notifyRecordingStopped();
                    onErrorToast?.(err);
                  });
                }}
                disabled={!isConnected}
                title="Record voice message"
                aria-label="Record voice message"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </MicButton>
            )}

            <input
              id="chat-file-input"
              name="chatFileInput"
              type="file"
              ref={fileInputRef}
              onClick={onNotifyNativeFilePickerOpen}
              onChange={onFileChange}
              style={{ display: 'none' }}
              accept="image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html,.mp3,.wav,.ogg,.m4a,.aac,.flac"
              multiple
            />
            <input
              id="chat-add-file-input"
              name="chatAddFileInput"
              type="file"
              ref={addFileInputRef}
              onClick={onNotifyNativeFilePickerOpen}
              onChange={onAddFilesChange}
              style={{ display: 'none' }}
              accept="image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html,.mp3,.wav,.ogg,.m4a,.aac,.flac"
              multiple
            />
          </InputContainer>

          {isMobileView && isEmojiPickerOpen && (
            <div ref={emojiPickerRef} style={{ width: '100%', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-primary)' }}>
              <EmojiPicker
                onEmojiClick={onEmojiClick}
                autoFocusSearch={false}
                theme={isDark ? Theme.DARK : Theme.LIGHT}
                emojiStyle={EmojiStyle.NATIVE}
                width="100%"
                height="42dvh"
                lazyLoadEmojis={false}
              />
            </div>
          )}
        </div>
      )}
    </Footer>
  );
};
