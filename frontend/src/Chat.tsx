import React, { useContext } from 'react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { useParams, useLocation } from 'react-router-dom';
import Auth from './Auth';
import { UserContext } from './UserContext';
import {
  clearOverlayGuardHistoryEntry,
  getSessionToken,
  getSignedTokenUserId,
  getStoredRoomProfile,
} from './chat/utils';
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
  OtherTabOverlay,
} from './chat/components';
import { useChatController } from './chat/hooks';
import { useNoIndexRobots } from './seo';

interface ChatProps {
  isMe?: boolean;
  isTempLink?: boolean;
}

function ChatAuthenticated({ isMe, isTempLink }: ChatProps) {
  const c = useChatController({ isMe, isTempLink });

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
          onNavigateHome={() => c.navigate('/')}
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
            openMediaGallery={c.media.openMediaGallery}
            openLightbox={c.media.openLightbox}
            loadedMediaMessageSet={c.loadedMediaMessageSet}
            loadedMediaSrcById={c.media.loadedMediaSrcById}
            onShowToast={c.msgs.triggerAlbumDownloadToast}
            onLogout={() => {
              c.composer.clearDraftOnLogout();
              if (c.ws.current && c.ws.current.readyState === WebSocket.OPEN) {
                c.ws.current.send(JSON.stringify({ type: 'user_logout', userId: c.userIdRef.current, roomId: c.roomId }));
              }
              if (c.overlayGuardPushed.current) {
                clearOverlayGuardHistoryEntry();
                c.overlayGuardPushed.current = false;
              }
              c.userContext?.logout(c.roomId);
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
        onSetReply={c.msgs.handleSetReply}
        allMessages={c.msgs.messages}
      />

      <OtherTabOverlay
        isOpen={c.isDisplacedByOtherTab}
        onUseHere={c.handleClaimTabHere}
      />
    </>
  );
}

function Chat({ isMe, isTempLink }: ChatProps = {}) {
  useNoIndexRobots();
  const userContext = useContext(UserContext);
  const { token: tempToken, roomId: urlRoomId } = useParams<{ token?: string; roomId?: string }>();
  const location = useLocation();
  const locationState = location.state as { autoJoin?: boolean } | null;
  const isMeRoom = isMe || urlRoomId?.toLowerCase() === 'me';
  const verifiedTempRoom = (isTempLink && tempToken && typeof sessionStorage !== 'undefined')
    ? sessionStorage.getItem(`pulseVerifiedTemp_${tempToken}`)
    : null;
  const roomId = isMeRoom
    ? 'me'
    : (urlRoomId || verifiedTempRoom || (isTempLink ? '' : (userContext?.profile?.roomId || 'me')));

  const needsTempLinkAuth = Boolean(isTempLink && tempToken && !verifiedTempRoom);
  const needsAutoJoinReauth = Boolean(locationState?.autoJoin);
  const roomSessionToken = roomId ? getSessionToken(roomId) : null;

  const activeRoomProfile = React.useMemo(() => {
    if (!roomId || needsTempLinkAuth || needsAutoJoinReauth || !roomSessionToken) {
      return null;
    }
    const ctxProfile = userContext?.profile;
    if (ctxProfile && (!ctxProfile.roomId || ctxProfile.roomId.toLowerCase() === roomId.toLowerCase())) {
      const tokenUserId = getSignedTokenUserId(roomSessionToken);
      return {
        ...ctxProfile,
        userId: tokenUserId || ctxProfile.userId,
        roomId: ctxProfile.roomId || roomId,
      };
    }
    return getStoredRoomProfile(roomId);
  }, [roomId, needsTempLinkAuth, needsAutoJoinReauth, roomSessionToken, userContext?.profile]);

  const isContextSyncedToRoom = Boolean(
    activeRoomProfile &&
    userContext?.profile &&
    userContext.profile.userId === activeRoomProfile.userId &&
    userContext.profile.username === activeRoomProfile.username &&
    (userContext.profile.roomId || '').toLowerCase() === activeRoomProfile.roomId.toLowerCase()
  );

  React.useEffect(() => {
    if (!activeRoomProfile || !userContext?.login || isContextSyncedToRoom) return;
    userContext.login(activeRoomProfile);
  }, [activeRoomProfile, isContextSyncedToRoom, userContext]);

  if (!activeRoomProfile || needsTempLinkAuth || needsAutoJoinReauth) {
    return <Auth onAuthSuccess={userContext?.login ?? (() => {})} tempToken={tempToken || null} roomId={roomId} />;
  }

  if (!isContextSyncedToRoom) {
    return <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)' }} />;
  }

  return (
    <ChatAuthenticated
      key={`${activeRoomProfile.userId}_${roomId}`}
      isMe={isMeRoom}
      isTempLink={isTempLink}
    />
  );
}

export default Chat;
