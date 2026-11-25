import React from 'react';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import type { Message, Gif } from '../types';
import { MAX_MESSAGE_LENGTH, quoteLog } from '../constants';
import { isGiphyUrl, resolveReplyTargetId, audioDurationCache, setAudioDurationCache, subscribeAudioDuration, resolveAudioDuration, getDeletedForMeIds, isPhotoOrGif, hasMediaAttachment, isNonTouchDevice, copyImageToClipboard, copyTextToClipboard } from '../utils';
import { CANDIDATE_URL_RE, renderTextWithLinks } from '../renderMessage';
import { FilmIcon, FileIcon } from '../TypingIndicator';
import { MediaAlbumIcon } from './message/MediaAlbumIcon';
import { getDeletedForMeMessageLabel } from './message/MessageQuotedPreview';
import {
  Footer,
  SelectModeFooter,
  CancelPreviewButton,
  EditButton,
  CopyButton,
  CopyOptionsPopover,
  CopyOptionItem,
  CopyOptionDivider,
  ReportButton,
  DownloadAllButton,
  DeleteButton,
  EditPreviewContainer,
  EditPreviewIcon,
  EditPreviewText,
  EditPreviewDismiss,
  ReplyPreviewContainer,
  ReplyText,
  FilePreviewImage,
  FilePreviewContainer,
  FilePreviewInfo,
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
  RecordingBarWrapper,
  RecordingActionGroup,
  RecordingCancelBtn,
  RecordingStatusIndicator,
  RecordingBlinkDot,
  RecordingTimerSpan,
  RecordingWaveformBarBox,
  RecordingWaveformBar,
  RecordingPauseResumeBtn,
  RecordingPreviewBtn,
} from '../Chat.styles';
import { useVoiceRecorder, type VoicePreviewSnapshot } from '../hooks';
import { sanitizeMediaUrl } from '../utils';
import { formatAudioDuration, audioCoordinator } from './message';
import { VoiceNotePreviewBar } from './VoiceNotePreviewBar';

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

  const stagedFilePreviewUrl = React.useMemo(() => {
    if (!stagedFile) return '';
    return URL.createObjectURL(stagedFile);
  }, [stagedFile]);

  React.useEffect(() => {
    return () => {
      if (stagedFilePreviewUrl) {
        URL.revokeObjectURL(stagedFilePreviewUrl);
      }
    };
  }, [stagedFilePreviewUrl]);

  const [replyAudioDuration, setReplyAudioDuration] = React.useState<number | null>(() => {
    if (replyingTo?.type === 'audio') {
      if (replyingTo.duration && replyingTo.duration > 0) return replyingTo.duration;
      if (replyingTo.id && audioDurationCache.has(replyingTo.id)) return audioDurationCache.get(replyingTo.id)!;
      if (replyingTo.url && audioDurationCache.has(replyingTo.url)) return audioDurationCache.get(replyingTo.url)!;
    }
    return null;
  });

  React.useEffect(() => {
    if (replyingTo?.type !== 'audio') {
      setReplyAudioDuration(null);
      return;
    }

    const targetId = replyingTo.id;
    const targetUrl = replyingTo.url;

    if (replyingTo.duration && replyingTo.duration > 0) {
      setReplyAudioDuration(replyingTo.duration);
      if (targetId) setAudioDurationCache(targetId, replyingTo.duration);
      if (targetUrl) setAudioDurationCache(targetUrl, replyingTo.duration);
    } else {
      const cached = (targetId && audioDurationCache.get(targetId)) || (targetUrl && audioDurationCache.get(targetUrl));
      if (cached) {
        setReplyAudioDuration(cached);
      }
    }

    const unsubscribe = subscribeAudioDuration((key, dur) => {
      if ((targetId && key === targetId) || (targetUrl && key === targetUrl)) {
        setReplyAudioDuration(dur);
      }
    });

    let active = true;
    if (targetUrl || targetId) {
      resolveAudioDuration(targetUrl, targetId).then((dur) => {
        if (active && dur) {
          setReplyAudioDuration(dur);
        }
      });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [replyingTo?.id, replyingTo?.url, replyingTo?.type, replyingTo?.duration]);

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

  // Copy options popover state for photo/GIF with caption
  const [isCopyMenuOpen, setIsCopyMenuOpen] = React.useState(false);
  const copyMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isSelectModeActive) {
      setIsCopyMenuOpen(false);
    }
  }, [isSelectModeActive]);

  React.useEffect(() => {
    if (!isCopyMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setIsCopyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isCopyMenuOpen]);

  // Pressing Enter while recording sends the voice message
  React.useEffect(() => {
    if (!recorder.isRecording) return;
    const handleRecordingKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const result = await recorder.stopRecording();
        if (result && result.file && result.file.size > 0 && result.duration > 0) {
          onSendVoiceNote?.(result.file, result.duration, result.waveform);
        }
      }
    };
    window.addEventListener('keydown', handleRecordingKeyDown);
    return () => window.removeEventListener('keydown', handleRecordingKeyDown);
  }, [recorder, onSendVoiceNote]);

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
        <SelectModeFooter>
          <CancelPreviewButton onClick={onCancelSelectMode}>&times;</CancelPreviewButton>
          <span>{selectedMessages.length} selected</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {canEditSelectedMessage && selectedMessage && (
              <EditButton
                onClick={() => {
                  onStartEdit(selectedMessage);
                  onCancelSelectMode();
                }}
                title="Edit"
                aria-label="Edit selected message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </EditButton>
            )}
            {(() => {
              if (!selectedMessage || selectedMessage.isDeleted || selectedMessages.length !== 1) return null;
              if (!isMobileView && isNonTouchDevice()) return null;

              const isPhotoGif = isPhotoOrGif(selectedMessage);
              const hasCaption = Boolean(selectedMessage.text?.trim());
              const hasMedia = hasMediaAttachment(selectedMessage);

              // 1. Photo or GIF with caption: show two options (Copy caption / Copy image)
              const isPhotoGifWithCaption = isPhotoGif && hasCaption;

              // 2. Photo or GIF without caption: show single button that copies the photo/GIF
              const isPhotoGifWithoutCaption = isPhotoGif && !hasCaption;

              // 3. Media other than photo/GIF with caption: show single button that copies the caption
              const isOtherMediaWithCaption = hasMedia && !isPhotoGif && hasCaption;

              // 4. Plain text message: show single button that copies text
              const isPlainText = !hasMedia && hasCaption;

              // 5. Media without caption (not photo/GIF): DO NOT SHOW COPY BUTTON
              const canShowCopy = isPhotoGifWithCaption || isPhotoGifWithoutCaption || isOtherMediaWithCaption || isPlainText;

              if (!canShowCopy) return null;

              const handleCopyClick = async (e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();

                // Case 1: Photo or GIF with caption -> toggle animated 2-option popover menu
                if (isPhotoGifWithCaption) {
                  setIsCopyMenuOpen((prev) => !prev);
                  return;
                }

                // Case 2: Photo or GIF without caption -> copy image directly
                if (isPhotoGifWithoutCaption && selectedMessage.url) {
                  await copyImageToClipboard(selectedMessage.url);
                  onCancelSelectMode();
                  return;
                }

                // Case 3 & 4: Caption or plain text -> copy text directly
                const textToCopy = selectedMessage.text || '';
                if (textToCopy) {
                  const success = await copyTextToClipboard(textToCopy);
                  if (success && typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('pulse:status_toast', {
                        detail: {
                          message: isOtherMediaWithCaption ? 'Caption copied to clipboard' : 'Copied to clipboard',
                        },
                      })
                    );
                  }
                }
                onCancelSelectMode();
              };

              const handleCopyImageOption = async (e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                setIsCopyMenuOpen(false);
                if (selectedMessage.url) {
                  await copyImageToClipboard(selectedMessage.url);
                }
                onCancelSelectMode();
              };

              const handleCopyCaptionOption = async (e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                setIsCopyMenuOpen(false);
                if (selectedMessage.text) {
                  const success = await copyTextToClipboard(selectedMessage.text);
                  if (success && typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('pulse:status_toast', {
                        detail: { message: 'Caption copied to clipboard' },
                      })
                    );
                  }
                }
                onCancelSelectMode();
              };

              return (
                <div style={{ position: 'relative' }} ref={copyMenuRef}>
                  <CopyButton
                    data-testid="select-copy-btn"
                    onClick={handleCopyClick}
                    title={
                      isPhotoGifWithCaption
                        ? 'Copy options'
                        : isPhotoGifWithoutCaption
                        ? 'Copy image'
                        : isOtherMediaWithCaption
                        ? 'Copy caption'
                        : 'Copy'
                    }
                    aria-label={
                      isPhotoGifWithCaption
                        ? 'Copy options'
                        : isPhotoGifWithoutCaption
                        ? 'Copy image'
                        : isOtherMediaWithCaption
                        ? 'Copy caption'
                        : 'Copy'
                    }
                    style={
                      isCopyMenuOpen
                        ? {
                            backgroundColor: '#475569',
                            boxShadow: '0 0 0 2px rgba(56, 189, 248, 0.45)',
                          }
                        : undefined
                    }
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </CopyButton>

                  {isPhotoGifWithCaption && isCopyMenuOpen && (
                    <CopyOptionsPopover
                      data-testid="copy-options-popover"
                      role="menu"
                      aria-label="Copy options"
                    >
                      <CopyOptionItem
                        type="button"
                        role="menuitem"
                        data-testid="popover-copy-image-btn"
                        onClick={handleCopyImageOption}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span>Copy image</span>
                      </CopyOptionItem>
                      <CopyOptionDivider />
                      <CopyOptionItem
                        type="button"
                        role="menuitem"
                        data-testid="popover-copy-caption-btn"
                        onClick={handleCopyCaptionOption}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <line x1="10" y1="9" x2="8" y2="9" />
                        </svg>
                        <span>Copy caption</span>
                      </CopyOptionItem>
                    </CopyOptionsPopover>
                  )}
                </div>
              );
            })()}
            {hasSelectedMedia && onDownloadSelectedMedia && (
              <DownloadAllButton
                onClick={() => {
                  onDownloadSelectedMedia();
                }}
                title={selectedMediaCount && selectedMediaCount > 1 ? "Download all as ZIP" : "Download"}
                aria-label={selectedMediaCount && selectedMediaCount > 1 ? "Download all selected media as ZIP" : "Download selected media"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </DownloadAllButton>
            )}
            {isMobileView && selectedMessages.length === 1 && selectedMessage && !selectedMessage.isDeleted && selectedMessage.userId !== currentUserId && selectedMessage.type !== 'system_notification' && (
              <ReportButton
                onClick={() => {
                  onOpenReport(selectedMessage);
                  onCancelSelectMode();
                }}
                title="Report"
                aria-label="Report selected message"
              >
                <svg style={{ position: 'relative', left: '1px' }} xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                  <line x1="4" y1="22" x2="4" y2="15"></line>
                </svg>
              </ReportButton>
            )}
            <DeleteButton onClick={onInitiateDelete} title="Delete" aria-label="Delete selected messages">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </DeleteButton>
          </div>
        </SelectModeFooter>
      ) : (
        <div>
          {editingMessageId && (
            <EditPreviewContainer>
              <EditPreviewIcon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </EditPreviewIcon>
              <EditPreviewText>
                <p>Editing message</p>
                <span>{editingMessageOriginalText || 'Message'}</span>
              </EditPreviewText>
              <EditPreviewDismiss onClick={onCancelEdit} title="Cancel editing (Esc)" aria-label="Cancel editing">
                &times;
              </EditPreviewDismiss>
            </EditPreviewContainer>
          )}

          {replyingTo && (() => {
            const isGroupReply = Boolean(
              replyingTo.isGroup ||
              replyingTo.type === 'group' ||
              (typeof replyingTo.mediaCount === 'number' && replyingTo.mediaCount > 1)
            );
            const groupMediaCount = replyingTo.mediaCount || 2;
            const replyCaption = replyingTo.text?.trim() || '';
            const displayCaption = replyCaption && !/^\d+\s+media$/i.test(replyCaption) ? replyCaption : '';

            return (
              <ReplyPreviewContainer
                ref={replyPreviewRef}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const replyTargetId = resolveReplyTargetId(replyingTo);
                  quoteLog('reply-preview click', {
                    rawReplyingTo: replyingTo,
                    resolvedReplyTargetId: replyTargetId,
                  });
                  if (replyTargetId) {
                    const deletedForMeIds = getDeletedForMeIds(currentUserId);
                    const isDeletedForMe = Boolean(
                      deletedForMeIds.has(replyTargetId) ||
                      (replyingTo.id && deletedForMeIds.has(replyingTo.id)) ||
                      ((replyingTo as any)._id && deletedForMeIds.has((replyingTo as any)._id)) ||
                      ((replyingTo as any).messageId && deletedForMeIds.has((replyingTo as any).messageId)) ||
                      ((replyingTo as any).clientTempId && deletedForMeIds.has((replyingTo as any).clientTempId)) ||
                      (replyingTo.isDeleted && replyingTo.deletedBy === currentUserId)
                    );
                    if (isDeletedForMe) {
                      const mediaLabel = getDeletedForMeMessageLabel(replyingTo);
                      onErrorToast?.(`This ${mediaLabel} is deleted by you for your session.`);
                      return;
                    }
                    onScrollToMessage(replyTargetId, undefined, 'auto', true, replyingTo);
                  }
                }}
              >
                {isGroupReply ? (
                  <div
                    data-testid="reply-preview-group-badge"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '6px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <MediaAlbumIcon size={22} />
                  </div>
                ) : replyingTo.type === 'video' && replyingTo.url ? (
                  <video src={replyingTo.url} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                ) : (replyingTo.type === 'image' || replyingTo.type === 'video') && replyingTo.url ? (
                  <FilePreviewImage src={replyingTo.url} alt="Reply preview" />
                ) : replyingTo.type === 'audio' ? (
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '6px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </div>
                ) : null}
                <ReplyText>
                  <p>Replying to {replyingTo.username}</p>
                  <span style={replyingTo.isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : undefined}>
                    {(() => {
                      if (replyingTo.isDeleted) {
                        return replyingTo.deletedBy === 'admin'
                          ? 'This message has been deleted by an admin.'
                          : replyingTo.deletedBy === currentUserId
                            ? 'You deleted this message.'
                            : 'This message has been deleted.';
                      }
                      if (isGroupReply) {
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <MediaAlbumIcon size={14} style={{ opacity: 0.85, flexShrink: 0 }} />
                            <span style={{ fontWeight: 600 }}>{groupMediaCount} media</span>
                            {displayCaption ? <span>• {displayCaption}</span> : null}
                          </span>
                        );
                      }
                      if (replyingTo.text) return replyingTo.text;
                      if (isGiphyUrl(replyingTo.url)) return 'GIF';
                      if (replyingTo.type === 'image') return 'Image';
                      if (replyingTo.type === 'video') return 'Video';
                      if (replyingTo.type === 'audio') {
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span>{replyingTo.text || 'Voice Message'}</span>
                            {Boolean(replyAudioDuration && replyAudioDuration > 0) && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '1px 6px',
                                borderRadius: '9999px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: '#3b82f6',
                              }}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                {formatAudioDuration(replyAudioDuration!)}
                              </span>
                            )}
                          </span>
                        );
                      }
                      return 'Message';
                    })()}
                  </span>
                </ReplyText>
                <CancelPreviewButton
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelReply();
                  }}
                >
                  &times;
                </CancelPreviewButton>
              </ReplyPreviewContainer>
            );
          })()}


          {stagedFile && !showFilePreview && (
            <FilePreviewContainer>
              {stagedFile.type.startsWith('image/') ? (
                <FilePreviewImage src={stagedFilePreviewUrl} alt="Preview" />
              ) : stagedFile.type.startsWith('video/') ? (
                <video src={stagedFilePreviewUrl} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: '8px', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              )}
              <FilePreviewInfo>{stagedFile.name}</FilePreviewInfo>
              <CancelPreviewButton onClick={onCancelStagedFile}>&times;</CancelPreviewButton>
            </FilePreviewContainer>
          )}

          {stagedFiles.length > 0 && !showFilePreview && (
            <FilePreviewContainer>
              <FilePreviewInfo>
                {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''} ready
              </FilePreviewInfo>
              <CancelPreviewButton onClick={onCancelStagedFiles}>&times;</CancelPreviewButton>
            </FilePreviewContainer>
          )}

          {stagedGif && (
            <FilePreviewContainer>
              <FilePreviewImage src={stagedGif.preview} alt="GIF Preview" />
              <FilePreviewInfo>GIF</FilePreviewInfo>
              <CancelPreviewButton onClick={onCancelStagedGif}>&times;</CancelPreviewButton>
            </FilePreviewContainer>
          )}

          <InputContainer>
            {recorder.isRecording && (
              <audio
                ref={previewAudioRef}
                preload="auto"
                style={{ display: 'none' }}
              />
            )}
            {recorder.isRecording && previewSnapshot ? (
              <VoiceNotePreviewBar
                previewUrl={previewSnapshot.previewUrl}
                duration={previewSnapshot.duration}
                waveform={previewSnapshot.waveform}
                autoPlay={!previewInitiallyPlaying}
                initiallyPlaying={previewInitiallyPlaying}
                externalAudioRef={previewAudioRef}
                onDiscard={handleDiscardVoice}
                onResumeRecording={handleResumeFromPreview}
                onError={onErrorToast}
              />
            ) : recorder.isRecording ? (
              <RecordingBarWrapper role="region" aria-label="Voice recording in progress">
                <RecordingActionGroup>
                  <RecordingCancelBtn
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleDiscardVoice}
                    title="Cancel recording"
                    aria-label="Cancel recording"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </RecordingCancelBtn>

                  {recorder.isPaused ? (
                    <>
                      <RecordingPreviewBtn
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        disabled={isFinalizingRecording}
                        onClick={handleOpenVoicePreview}
                        title="Listen & peek before sending"
                        aria-label="Preview recorded voice note"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </RecordingPreviewBtn>

                      <RecordingWaveformBarBox aria-hidden="true">
                        {recorder.liveLevels.map((lvl, idx) => (
                          <RecordingWaveformBar
                            key={idx}
                            $level={lvl}
                            $isPaused={recorder.isPaused}
                          />
                        ))}
                      </RecordingWaveformBarBox>

                      <RecordingStatusIndicator>
                        <RecordingBlinkDot $isPaused={recorder.isPaused} />
                        <RecordingTimerSpan>{formatAudioDuration(recorder.duration)}</RecordingTimerSpan>
                      </RecordingStatusIndicator>
                    </>
                  ) : (
                    <>
                      <RecordingStatusIndicator>
                        <RecordingBlinkDot $isPaused={recorder.isPaused} />
                        <RecordingTimerSpan>{formatAudioDuration(recorder.duration)}</RecordingTimerSpan>
                      </RecordingStatusIndicator>

                      <RecordingWaveformBarBox aria-hidden="true">
                        {recorder.liveLevels.map((lvl, idx) => (
                          <RecordingWaveformBar
                            key={idx}
                            $level={lvl}
                            $isPaused={recorder.isPaused}
                          />
                        ))}
                      </RecordingWaveformBarBox>
                    </>
                  )}

                  <RecordingPauseResumeBtn
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    $isPaused={recorder.isPaused}
                    disabled={isFinalizingRecording}
                    onClick={recorder.isPaused ? recorder.resumeRecording : recorder.pauseRecording}
                    title={recorder.isPaused ? 'Resume recording' : 'Pause recording'}
                    aria-label={recorder.isPaused ? 'Resume recording' : 'Pause recording'}
                  >
                    {recorder.isPaused ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    )}
                  </RecordingPauseResumeBtn>
                </RecordingActionGroup>
              </RecordingBarWrapper>
            ) : (
              <>
                <div style={{ position: 'relative' }} ref={plusMenuRef}>
                  <PlusMenuButton
                    ref={plusButtonRef}
                    $isOpen={isPlusMenuOpen}
                    onPointerDown={(e) => e.preventDefault()}
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
                    CANDIDATE_URL_RE.lastIndex = 0;
                    const hasUrl = CANDIDATE_URL_RE.test(normalizedOverlayMessage);
                    CANDIDATE_URL_RE.lastIndex = 0;
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
                onMouseDown={(e) => e.preventDefault()}
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
                onMouseDown={(e) => e.preventDefault()}
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
                onMouseDown={(e) => e.preventDefault()}
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
              type="file"
              ref={fileInputRef}
              onClick={onNotifyNativeFilePickerOpen}
              onChange={onFileChange}
              style={{ display: 'none' }}
              accept="image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html,.mp3,.wav,.ogg,.m4a,.aac,.flac"
              multiple
            />
            <input
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
