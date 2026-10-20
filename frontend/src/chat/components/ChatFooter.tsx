import React from 'react';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import type { Message, Gif } from '../types';
import { MAX_MESSAGE_LENGTH, quoteLog } from '../constants';
import { isGiphyUrl, resolveReplyTargetId } from '../utils';
import { CANDIDATE_URL_RE, renderTextWithLinks } from '../renderMessage';
import { FilmIcon, FileIcon } from '../TypingIndicator';
import {
  Footer,
  SelectModeFooter,
  CancelPreviewButton,
  EditButton,
  CopyButton,
  ReportButton,
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
} from '../Chat.styles';

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
  onInputKeyDown,
  onPaste,
  onSyncInputOverlayScroll,
  onSendMessage,
  isEmojiPickerOpen,
  emojiPickerRef,
  onEmojiClick,
  isDark,
}) => {
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
            {isMobileView && selectedMessages.length === 1 && selectedMessage && !selectedMessage.isDeleted && (selectedMessage.type === 'text' || selectedMessage.type === 'image') && (
              <CopyButton
                onClick={() => {
                  onCopyMessage(selectedMessage);
                  onCancelSelectMode();
                }}
                title="Copy"
                aria-label="Copy selected message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </CopyButton>
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
              <EditPreviewDismiss onClick={onCancelEdit} title="Cancel editing" aria-label="Cancel editing">
                &times;
              </EditPreviewDismiss>
            </EditPreviewContainer>
          )}

          {replyingTo && (
            <ReplyPreviewContainer
              ref={replyPreviewRef}
              onClick={() => {
                const replyTargetId = resolveReplyTargetId(replyingTo);
                quoteLog('reply-preview click', {
                  rawReplyingTo: replyingTo,
                  resolvedReplyTargetId: replyTargetId,
                });
                if (replyTargetId) onScrollToMessage(replyTargetId, undefined, 'auto', true, replyingTo);
              }}
            >
              {replyingTo.type === 'video' && replyingTo.url ? (
                <video src={replyingTo.url} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
              ) : (replyingTo.type === 'image' || replyingTo.type === 'video') && replyingTo.url ? (
                <FilePreviewImage src={replyingTo.url} alt="Reply preview" />
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
                    if (replyingTo.text) return replyingTo.text;
                    if (isGiphyUrl(replyingTo.url)) return 'GIF';
                    if (replyingTo.type === 'image') return 'Image';
                    if (replyingTo.type === 'video') return 'Video';
                    return 'Message';
                  })()}
                </span>
              </ReplyText>
              <CancelPreviewButton
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelReply();
                }}
              >
                &times;
              </CancelPreviewButton>
            </ReplyPreviewContainer>
          )}

          {stagedFile && !showFilePreview && (
            <FilePreviewContainer>
              {stagedFile.type.startsWith('image/') ? (
                <FilePreviewImage src={URL.createObjectURL(stagedFile)} alt="Preview" />
              ) : stagedFile.type.startsWith('video/') ? (
                <video src={URL.createObjectURL(stagedFile)} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
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

            <SendButton
              onMouseDown={(e) => e.preventDefault()}
              onClick={onSendMessage}
              disabled={
                !isConnected ||
                (!inputMessage.trim() && !stagedFile && !stagedGif && stagedFiles.length === 0)
              }
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

            <input
              type="file"
              ref={fileInputRef}
              onClick={onNotifyNativeFilePickerOpen}
              onChange={onFileChange}
              style={{ display: 'none' }}
              accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html"
              multiple
            />
            <input
              type="file"
              ref={addFileInputRef}
              onClick={onNotifyNativeFilePickerOpen}
              onChange={onAddFilesChange}
              style={{ display: 'none' }}
              accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html"
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
