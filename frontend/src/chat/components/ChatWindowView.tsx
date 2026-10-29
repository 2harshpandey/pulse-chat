import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatController } from '../hooks/useChatController';
import { compressImage } from '../hooks/useChatMedia';
import { PinnedMessageBanner } from './PinnedMessageBanner';
import { ChatFooter } from './ChatFooter';
import { MessagesList } from './MessagesList';
import { TypingIndicator } from '../TypingIndicator';
import { useAlbumDownload } from '../albumDownloadManager';
import {
  ChatWindow,
  MessagesAndScrollWrapper,
  MessagesContainer,
  ScrollToBottomButton,
  NewMessagesBadge,
  SearchNotFoundToast,
  CopiedToast,
  AlbumDownloadToast,
  AlbumDownloadCancelButton,
} from '../Chat.styles';

export interface ChatWindowViewProps {
  chat: ChatController;
}

export function ChatWindowView({ chat }: ChatWindowViewProps) {
  const {
    userIdRef,
    chatContainerRef,
    messageInputRef,
    inputOverlayRef,
    inputMessage,
    isDark,
    viewport,
    msgs,
    reactions,
    selection,
    search,
    nav,
    media,
    socket,
    composer,
    selectedMessageIds,
    loadedMediaMessageSet,
    selectedMessage,
    selectedMediaMessages,
    handleDownloadSelectedMedia,
    canEditSelectedMessage,
    hasNewMessagesIndicator,
    newMessagesIndicatorLabel,
    scrollToLatestLabel,
    scrollToLatestTitle,
    handleJumpToNextPinned,
    handleMessagesContainerScroll,
  } = chat;

  const albumDownload = useAlbumDownload();

  const [statusErrorToast, setStatusErrorToast] = useState<string | null>(null);
  const [statusToastKey, setStatusToastKey] = useState(0);
  const statusErrorToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerStatusErrorToast = useCallback((msg: string) => {
    if (statusErrorToastTimerRef.current) {
      clearTimeout(statusErrorToastTimerRef.current);
      statusErrorToastTimerRef.current = null;
    }
    setStatusToastKey(k => k + 1);
    setStatusErrorToast(msg);
    statusErrorToastTimerRef.current = setTimeout(() => {
      setStatusErrorToast(null);
      statusErrorToastTimerRef.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (statusErrorToastTimerRef.current) clearTimeout(statusErrorToastTimerRef.current);
    };
  }, []);

  const isStatusToastVisible = Boolean(
    statusErrorToast || nav.isLocatingMessage || msgs.albumDownloadToast || albumDownload.isDownloading
  );

  const statusToastText = statusErrorToast
    ? statusErrorToast
    : nav.isLocatingMessage
    ? 'Locating quoted message...'
    : msgs.albumDownloadToast
    ? msgs.albumDownloadToast
    : albumDownload.isDownloading
    ? (albumDownload.progress > 0.08
        ? `Preparing ZIP... ${Math.round(albumDownload.progress * 100)}%`
        : 'Preparing ZIP...')
    : '';

  return (
    <ChatWindow>
      <PinnedMessageBanner
        pinnedMessages={msgs.pinnedMessages}
        currentPinnedIndex={msgs.currentPinnedIndex}
        isJumpingToPinned={msgs.isJumpingToPinned}
        onClick={handleJumpToNextPinned}
      />

      <MessagesAndScrollWrapper>
        <MessagesContainer
          onClick={composer.handleChatAreaClick}
          $isScrollButtonVisible={viewport.isScrollToBottomVisible}
          $isMobileView={viewport.isMobileView}
          ref={chatContainerRef as any}
          onScroll={handleMessagesContainerScroll}
          onWheel={(e) => {
            if (e.deltaY < 0) {
              viewport.suppressInitialBottomPinRef.current = true;
              viewport.initialHistoryBottomStabilized.current = true;
            }
            if (
              e.deltaY < 0 &&
              chatContainerRef.current &&
              chatContainerRef.current.scrollTop <= 150 &&
              msgs.historyLoaded &&
              viewport.hasInitialScrolled.current &&
              viewport.initialHistoryBottomStabilized.current &&
              !msgs.isLoadingOlderRef.current &&
              msgs.hasMoreOlderMessages &&
              !search.suppressOlderMessageLoadRef.current
            ) {
              void msgs.loadOlderMessages();
            }
          }}
          onTouchMove={() => {
            if (chatContainerRef.current) {
              const scroller = chatContainerRef.current;
              const distanceFromBottom = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
              if (distanceFromBottom > 80) {
                viewport.suppressInitialBottomPinRef.current = true;
                viewport.initialHistoryBottomStabilized.current = true;
              }
            }
          }}
        >
          <MessagesList
            historyLoaded={msgs.historyLoaded}
            messages={search.filteredMessages}
            pinnedMessages={msgs.pinnedMessages}
            currentUserId={userIdRef.current}
            handleSetReply={msgs.handleSetReply}
            handleReact={reactions.handleReact}
            handleOpenDeleteMenu={selection.handleOpenDeleteMenu}
            openLightbox={media.openLightbox}
            openMediaGallery={media.openMediaGallery}
            loadedMediaMessageSet={loadedMediaMessageSet}
            onRequestMediaLoad={media.handleRequestMediaLoad}
            mediaLoadProgressById={media.mediaLoadProgressById}
            loadedMediaSrcById={media.loadedMediaSrcById}
            onRequestDownload={media.handleRequestDownload}
            handleResumeUpload={media.handleResumeUpload}
            handleCancelUpload={media.handleCancelUpload}
            activeDeleteMenu={selection.activeDeleteMenu}
            deleteMenuRef={selection.deleteMenuRef}
            deleteForMe={selection.deleteForMe}
            deleteForEveryone={selection.deleteForEveryone}
            scrollToMessage={nav.scrollToMessage}
            isSelectModeActive={selection.isSelectModeActive}
            selectedMessageIds={selectedMessageIds}
            handleToggleSelectMessage={selection.handleToggleSelectMessage}
            setActiveDeleteMenu={selection.setActiveDeleteMenu}
            handleCopy={msgs.handleCopy}
            handleOpenReport={selection.handleOpenReport}
            handleStartEdit={msgs.handleStartEdit}
            handleCancelSelectMode={selection.handleCancelSelectMode}
            isMobileView={viewport.isMobileView}
            selectedMessages={selection.selectedMessages}
            onOpenReactionPicker={reactions.handleOpenReactionPicker}
            setReactionsPopup={reactions.setReactionsPopup}
            handleOpenFullEmojiPicker={reactions.handleOpenFullEmojiPicker}
            reactionPickerData={reactions.reactionPickerData}
            editingMessageId={msgs.editingMessageId}
            handleSetEditingMessageId={msgs.setEditingMessageId}
            handleCancelEdit={msgs.handleCancelEdit}
            onVideoFullscreenEnter={viewport.handleVideoFullscreenEnter}
            onMediaLoadError={media.handleMediaError}
          />
        </MessagesContainer>

        <ScrollToBottomButton
          $isVisible={viewport.isScrollToBottomVisible}
          onClick={composer.handleScrollToBottomButtonClick}
          onPointerDown={(e) => e.preventDefault()}
          aria-label={scrollToLatestLabel}
          title={scrollToLatestTitle}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14"></path>
            <path d="m19 12-7 7-7-7"></path>
          </svg>
          <NewMessagesBadge $isVisible={hasNewMessagesIndicator}>
            {newMessagesIndicatorLabel}
          </NewMessagesBadge>
        </ScrollToBottomButton>
      </MessagesAndScrollWrapper>

      <SearchNotFoundToast $visible={search.showSearchNotFound}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: '18px', height: '18px' }}
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        Not found
      </SearchNotFoundToast>

      <CopiedToast $visible={msgs.showCopiedToast}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: '18px', height: '18px' }}
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied to clipboard
      </CopiedToast>

      <AlbumDownloadToast
        key={statusToastKey}
        $visible={isStatusToastVisible}
        $isError={Boolean(statusErrorToast)}
        data-testid="album-download-toast"
        aria-live="polite"
      >
        {statusErrorToast ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: '18px', height: '18px' }}
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        ) : nav.isLocatingMessage || albumDownload.isDownloading ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: '18px', height: '18px' }}
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        )}
        <span>{statusToastText}</span>
        {albumDownload.isDownloading && !statusErrorToast && !nav.isLocatingMessage && !msgs.albumDownloadToast && (
          <AlbumDownloadCancelButton
            type="button"
            data-testid="cancel-album-download-btn"
            onClick={(e) => {
              e.stopPropagation();
              albumDownload.cancelDownload();
            }}
            title="Cancel album download"
            aria-label="Cancel download"
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span>Cancel</span>
          </AlbumDownloadCancelButton>
        )}
      </AlbumDownloadToast>

      <TypingIndicator onlineUsers={socket.onlineUsers} currentUserId={userIdRef.current} />

      <ChatFooter
        isSelectModeActive={selection.isSelectModeActive}
        selectedMessages={selection.selectedMessages}
        selectedMessage={selectedMessage}
        canEditSelectedMessage={Boolean(canEditSelectedMessage)}
        isMobileView={viewport.isMobileView}
        currentUserId={userIdRef.current}
        hasSelectedMedia={selectedMediaMessages.length > 0}
        selectedMediaCount={selectedMediaMessages.length}
        onDownloadSelectedMedia={handleDownloadSelectedMedia}
        onSendVoiceNote={composer.handleSendVoiceNote}
        onVoiceRecordingStart={() => socket.setPresenceActivity('recording_audio')}
        onVoiceRecordingStop={() => socket.setPresenceActivity(null)}
        onErrorToast={triggerStatusErrorToast}
        onCancelSelectMode={selection.handleCancelSelectMode}
        onStartEdit={msgs.handleStartEdit}
        onCopyMessage={msgs.handleCopy}
        onOpenReport={selection.handleOpenReport}
        onInitiateDelete={selection.handleInitiateDelete}
        editingMessageId={msgs.editingMessageId}
        editingMessageOriginalText={msgs.editingMessageOriginalText}
        onCancelEdit={msgs.handleCancelEdit}
        replyingTo={msgs.replyingTo}
        onCancelReply={() => msgs.setReplyingTo(null)}
        onScrollToMessage={nav.scrollToMessage}
        replyPreviewRef={msgs.replyPreviewRef}
        stagedFile={media.stagedFile}
        onCancelStagedFile={() => media.setStagedFile(null)}
        stagedFiles={media.stagedFiles}
        onCancelStagedFiles={() => {
          media.setStagedFiles([]);
          media.setPreviewCaption('');
        }}
        showFilePreview={media.showFilePreview}
        stagedGif={media.stagedGif}
        onCancelStagedGif={() => media.setStagedGif(null)}
        plusMenuRef={composer.plusMenuRef}
        plusButtonRef={composer.plusButtonRef}
        isPlusMenuOpen={composer.isPlusMenuOpen}
        onTogglePlusMenu={() => composer.setIsPlusMenuOpen((prev) => !prev)}
        isConnected={socket.isConnected}
        emojiButtonRef={composer.emojiButtonRef}
        onEmojiPointerDown={(e) => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const inputWasFocused = Boolean(
            messageInputRef.current && document.activeElement === messageInputRef.current
          );
          composer.keyboardWasOpenBeforeEmojiRef.current = inputWasFocused;
          if (inputWasFocused) {
            messageInputRef.current.blur();
          }
          composer.handleOpenEmojiPicker(rect);
          composer.setIsPlusMenuOpen(false);
        }}
        onGifPointerDown={(e) => {
          e.preventDefault();
          if (messageInputRef.current && document.activeElement === messageInputRef.current) {
            media.keyboardWasOpenBeforeGifRef.current = true;
            messageInputRef.current.blur();
          } else {
            media.keyboardWasOpenBeforeGifRef.current = false;
          }
          media.gifPickerOpenedAtRef.current = Date.now();
          media.openGifPicker();
          composer.setIsPlusMenuOpen(false);
        }}
        fileInputRef={media.fileInputRef}
        addFileInputRef={media.addFileInputRef}
        onFileChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          media.markNativeFilePickerClosed();
          const files = event.target.files;
          if (files && files.length > 0) {
            media.stageFilesForPreview(Array.from(files));
          }
          if (event.target) event.target.value = '';
        }}
        onAddFilesChange={async (e) => {
          media.markNativeFilePickerClosed();
          if (e.target.files) {
            const newFiles = await Promise.all(Array.from(e.target.files).map(compressImage));
            media.setStagedFiles((prev) => [...prev, ...newFiles]);
          }
          if (e.target) e.target.value = '';
        }}
        onNotifyNativeFilePickerOpen={media.notifyNativeFilePickerOpen}
        normalizedOverlayMessage={composer.normalizedOverlayMessage}
        inputOverlayRef={inputOverlayRef}
        messageInputRef={messageInputRef}
        inputMessage={inputMessage}
        onInputChange={composer.handleInputChange}
        onInputKeyDown={composer.handleInputKeyDown}
        onPaste={composer.handlePaste}
        onSyncInputOverlayScroll={viewport.syncInputOverlayScroll}
        onSendMessage={composer.handleSendMessage}
        isEmojiPickerOpen={Boolean(composer.emojiPickerPosition)}
        emojiPickerRef={composer.emojiPickerRef}
        onEmojiClick={composer.handleEmojiClick}
        isDark={isDark}
      />
    </ChatWindow>
  );
}
