import React from 'react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import Auth from './Auth';
import { getInputDraftKey } from './chat/constants';
import { clearOverlayGuardHistoryEntry } from './chat/utils';
import {
  DragDropOverlay,
  DragDropCard,
  DragDropIconWrapper,
  DragDropTitle,
  DragDropSubtitle,
  AppContainer,
  LayoutContainer,
} from './chat/Chat.styles';
import {
  ChatHeader,
  UserSidebar,
  ReactionsOverlay,
  ChatModals,
  ChatWindowView,
} from './chat/components';
import { useChatController } from './chat/hooks';

function Chat({ isMe, isTempLink }: { isMe?: boolean; isTempLink?: boolean } = {}) {
  const c = useChatController({ isMe, isTempLink });

  if (!c.userContext?.profile) {
    return <Auth onAuthSuccess={c.userContext?.login ?? (() => {})} tempToken={c.tempToken || null} roomId={c.roomId} />;
  }

  return (
    <>
      <DragDropOverlay $isVisible={c.media.isDragging}>
        <DragDropCard>
          <DragDropIconWrapper>
            <svg
              width="72"
              height="72"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          </DragDropIconWrapper>
          <DragDropTitle>Drop your file here</DragDropTitle>
          <DragDropSubtitle>Images, videos, PDFs and more - release to upload</DragDropSubtitle>
        </DragDropCard>
      </DragDropOverlay>

      {c.composer.emojiPickerPosition && !c.viewport.isMobileView && (
        <div
          ref={c.composer.emojiPickerRef}
          style={(() => {
            const pickerWidth = 350;
            let top = c.composer.emojiPickerPosition.top - 450;
            let left = c.composer.emojiPickerPosition.left;
            if (top < 0) top = c.composer.emojiPickerPosition.bottom + 10;
            if (left + pickerWidth > window.innerWidth) left = window.innerWidth - pickerWidth - 10;
            if (left < 0) left = 10;
            return { position: 'absolute' as const, top: `${top}px`, left: `${left}px`, zIndex: 21 };
          })()}
        >
          <EmojiPicker
            onEmojiClick={c.composer.handleEmojiClick}
            autoFocusSearch={false}
            theme={c.isDark ? Theme.DARK : Theme.LIGHT}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis={false}
          />
        </div>
      )}

      <ReactionsOverlay
        reactionPickerData={c.reactions.reactionPickerData}
        reactionPickerRef={c.reactions.reactionPickerRef}
        onReact={c.reactions.handleReact}
        onOpenFullEmojiPicker={c.reactions.handleOpenFullEmojiPicker}
        reactionsPopup={c.reactions.reactionsPopup}
        currentUserId={c.userIdRef.current}
        onCloseReactionsPopup={() => c.reactions.setReactionsPopup(null)}
      />

      <AppContainer>
        <ChatHeader
          isConnected={c.socket.isConnected}
          isBrowserOnline={c.isBrowserOnline}
          isSoundEnabled={c.audio.isSoundEnabled}
          isSoundToggleAnimating={c.audio.isSoundToggleAnimating}
          onToggleSound={c.audio.toggleSound}
          isDark={c.isDark}
          onToggleTheme={c.toggleTheme}
          isSearchActive={c.search.isSearchActive}
          isSearchClosing={c.search.isSearchClosing}
          searchQuery={c.search.chatSearchQuery}
          onSearchQueryChange={(val) => {
            c.search.setChatSearchQuery(val);
            if (val.trim() === '') {
              c.search.setActiveSearchQuery('');
            }
          }}
          onSearchKeyDown={(e) => {
            if (e.key === 'Escape') {
              c.search.resetSearch();
              c.search.handleCloseSearch();
            } else if (e.key === 'Enter') {
              c.search.captureScrollBeforeSearch();
              c.search.setActiveSearchQuery(c.search.chatSearchQuery);
            }
          }}
          onOpenSearch={() => {
            c.search.captureScrollBeforeSearch();
            if (!c.search.isSearchActive) c.search.setIsSearchActive(true);
            else c.search.setActiveSearchQuery(c.search.chatSearchQuery);
          }}
          onCloseSearch={(e) => {
            e.stopPropagation();
            c.search.resetSearch();
            c.search.handleCloseSearch();
          }}
          isUserListVisible={c.isUserListVisible}
          onToggleUserList={() => {
            if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            c.setIsUserListVisible(!c.isUserListVisible);
          }}
          onHeaderButtonPointerDown={c.composer.handleHeaderButtonPointerDown}
        />

        <LayoutContainer>
          <ChatWindowView chat={c} />

          <UserSidebar
            isVisible={c.isUserListVisible}
            onClose={() => c.setIsUserListVisible(false)}
            onlineUsers={c.socket.onlineUsers}
            currentUserId={c.userIdRef.current}
            roomId={c.roomId}
            onClearChat={c.composer.handleClearChat}
            onLogout={() => {
              localStorage.removeItem(getInputDraftKey(c.userIdRef.current));
              if (c.ws.current && c.ws.current.readyState === WebSocket.OPEN) {
                c.ws.current.send(JSON.stringify({ type: 'user_logout', userId: c.userIdRef.current, roomId: c.roomId }));
              }
              if (c.overlayGuardPushed.current) {
                clearOverlayGuardHistoryEntry();
                c.overlayGuardPushed.current = false;
              }
              c.userContext?.logout();
            }}
          />
        </LayoutContainer>
      </AppContainer>

      <ChatModals
        isDark={c.isDark}
        isMobileView={c.viewport.isMobileView}
        fullEmojiPickerRef={c.fullEmojiPickerRef}
        selection={c.selection}
        reactions={c.reactions}
        media={c.media}
        onSendFromPreview={c.composer.handleSendFromPreview}
        onCaptionTyping={c.socket.handleTyping}
      />
    </>
  );
}

export default Chat;
