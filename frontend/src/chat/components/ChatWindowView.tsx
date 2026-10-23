import React from 'react';
import type { ChatController } from '../hooks/useChatController';
import { compressImage } from '../hooks/useChatMedia';
import { PinnedMessageBanner } from './PinnedMessageBanner';
import { ChatFooter } from './ChatFooter';
import { MessagesList } from './MessagesList';
import { TypingIndicator } from '../TypingIndicator';
import {
  ChatWindow,
  MessagesAndScrollWrapper,
  MessagesContainer,
  ScrollToBottomButton,
  NewMessagesBadge,
  SearchNotFoundToast,
  CopiedToast,
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
