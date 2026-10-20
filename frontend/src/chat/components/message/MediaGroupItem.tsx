import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Message } from '../../types';
import { filterValidReactions } from '../../constants';
import {
  getMessageElementId,
  getQuotedPreviewThumbUrl,
  sanitizeMediaUrl,
  normalizeMessageId,
} from '../../utils';
import {
  MessageRow,
  MessageBubble,
  Username,
  FooterContainer,
  Timestamp,
  SelectCheckboxContainer,
  Checkbox,
  MessageText,
  MessagePinIconWrapper,
  MediaGroupGrid,
  MediaGroupTile,
  MediaGroupOverflowOverlay,
  MediaPlayBadge,
  MediaVideoCornerTag,
} from '../../ChatStyledComponents';
import { renderTextWithLinks } from '../../renderMessage';
import {
  MessageQuotedPreview,
  MessageActionMenuPortal,
  MessageReactions,
  MessageDesktopActions,
  useMessageGestures,
  MediaDownloadButton,
} from './index';

export interface MediaGroupItemProps {
  messages: Message[];
  primaryMessage: Message;
  showUsername: boolean;
  isPinned: boolean;
  currentUserId: string;
  activeDeleteMenu: string | null;
  deleteMenuRef: React.RefObject<HTMLDivElement>;
  handleSetReply: (message: Message) => void;
  handleReact: (messageId: string, emoji: string) => void;
  openDeleteMenu: (messageId: string) => void;
  openMediaGallery: (items: Message[], initialIndex: number) => void;
  loadedMediaSrcById: Record<string, string>;
  onRequestDownload?: (messageId: string, mediaUrl: string, filename: string) => void;
  scrollToMessage: (
    messageId: string,
    sourceMessageId?: string,
    behavior?: 'auto' | 'smooth',
    force?: boolean,
    replyingToPayload?: any
  ) => Promise<void> | void;
  isSelectModeActive: boolean;
  isSelected: boolean;
  handleToggleSelectMessage: (messageId: string) => void;
  setActiveDeleteMenu: (id: string | null) => void;
  handleCopy: (message: Message) => void;
  handleOpenReport: (message: Message) => void;
  handleCancelSelectMode: () => void;
  isMobileView: boolean;
  selectedMessages: string[];
  onOpenReactionPicker: (messageId: string, rect: DOMRect, sender: 'me' | 'other') => void;
  setReactionsPopup: (
    popup: {
      messageId: string;
      reactions: { [emoji: string]: { userId: string; username: string }[] };
      rect: DOMRect;
    } | null
  ) => void;
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string) => void;
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null;
}

export const MediaGroupItem: React.FC<MediaGroupItemProps> = React.memo(({
  messages,
  primaryMessage,
  showUsername,
  isPinned,
  currentUserId,
  activeDeleteMenu,
  deleteMenuRef,
  handleSetReply,
  handleReact,
  openDeleteMenu,
  openMediaGallery,
  loadedMediaSrcById,
  onRequestDownload,
  scrollToMessage,
  isSelectModeActive,
  isSelected,
  handleToggleSelectMessage,
  setActiveDeleteMenu,
  handleCopy,
  handleOpenReport,
  handleCancelSelectMode,
  isMobileView,
  selectedMessages,
  onOpenReactionPicker,
  setReactionsPopup,
  handleOpenFullEmojiPicker,
  reactionPickerData,
}) => {
  const messageBubbleRef = useRef<HTMLDivElement>(null!);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right?: number; left?: number } | null>(null);

  const sender = primaryMessage.userId === currentUserId ? 'me' : 'other';

  const quotedPreviewThumbUrl =
    primaryMessage.replyingTo &&
    !primaryMessage.replyingTo.isDeleted &&
    (primaryMessage.replyingTo.type === 'image' || primaryMessage.replyingTo.type === 'video')
      ? getQuotedPreviewThumbUrl(primaryMessage.replyingTo.type, primaryMessage.replyingTo.url)
      : '';

  // Close context menu on scroll
  useEffect(() => {
    if (activeDeleteMenu !== primaryMessage.id || !menuPos) return;
    const close = () => { setActiveDeleteMenu(null); };
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  }, [activeDeleteMenu, primaryMessage.id, menuPos, setActiveDeleteMenu]);

  useEffect(() => {
    if (activeDeleteMenu !== primaryMessage.id) setMenuPos(null);
  }, [activeDeleteMenu, primaryMessage.id]);

  const {
    messageRowRef,
    lastSelectModeExitTimeRef,
    handleLongPressStart,
    handleLongPressMove,
    handleLongPressEnd,
    handleLongPressCancel,
  } = useMessageGestures({
    msg: primaryMessage,
    isMobileView,
    isSelectModeActive,
    handleSetReply,
    handleToggleSelectMessage,
  });

  const validReactions = useMemo(() => filterValidReactions(primaryMessage.reactions), [primaryMessage.reactions]);

  const currentUserReaction = useMemo(() => {
    for (const [emoji, users] of Object.entries(validReactions)) {
      if (users.some((r: { userId: string }) => r.userId === currentUserId)) {
        return emoji;
      }
    }
    return null;
  }, [validReactions, currentUserId]);

  // Determine grid tiles and overflow count
  const count = messages.length;
  const isOverflow = count > 4;
  const displayItems = isOverflow ? messages.slice(0, 4) : messages;
  const overflowCount = count - 4; // shows +X number which are other (e.g. 5 total -> +1 other)

  // Find unique caption text across the grouped messages
  const combinedCaption = useMemo(() => {
    const list = messages
      .map((m) => m.text?.trim())
      .filter((t): t is string => Boolean(t && t.length > 0));
    return Array.from(new Set(list)).join('\n');
  }, [messages]);

  const handleTileClick = (e: React.MouseEvent, index: number) => {
    if (isSelectModeActive) return;
    e.stopPropagation();
    openMediaGallery(messages, index);
  };

  return (
    <React.Fragment>
      <MessageRow
        id={getMessageElementId(primaryMessage.id)}
        data-message-id={normalizeMessageId(primaryMessage.id)}
        data-grouped-ids={messages.map((m) => normalizeMessageId(m.id)).filter(Boolean).join(' ')}
        ref={messageRowRef}
        $sender={sender}
        $isSelected={isSelected}
        $isActiveDeleteMenu={activeDeleteMenu === primaryMessage.id}
        $isGrouped={!showUsername}
        onClickCapture={(e) => {
          if (Date.now() - lastSelectModeExitTimeRef.current < 300) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onDoubleClick={(e) => {
          if (!isMobileView && !isSelectModeActive) {
            if (messageBubbleRef.current && messageBubbleRef.current.contains(e.target as Node)) {
              return;
            }
            e.preventDefault();
            handleSetReply(primaryMessage);
          }
        }}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchMove={handleLongPressMove}
        onTouchEnd={handleLongPressEnd}
        onTouchCancel={handleLongPressCancel}
      >
        {isSelectModeActive && (!isMobileView || selectedMessages.length > 1) && (
          <SelectCheckboxContainer
            data-checkbox
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSelectMessage(primaryMessage.id);
            }}
          >
            <Checkbox checked={isSelected} />
          </SelectCheckboxContainer>
        )}

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: sender === 'me' ? 'flex-end' : 'flex-start',
            width: '100%',
          }}
        >
          {showUsername && <Username $sender={sender}>{primaryMessage.username}</Username>}

          <MessageBubble
            ref={messageBubbleRef}
            $sender={sender}
            $messageType="group"
            style={{
              marginBottom:
                primaryMessage.reactions && Object.keys(primaryMessage.reactions).length > 0
                  ? '18px'
                  : undefined,
            }}
          >
            {isPinned && (
              <MessagePinIconWrapper $sender={sender}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11V22H13V16H18V14L16 12Z" />
                </svg>
              </MessagePinIconWrapper>
            )}

            <MessageQuotedPreview
              msg={primaryMessage}
              currentUserId={currentUserId}
              sender={sender}
              quotedPreviewThumbUrl={quotedPreviewThumbUrl}
              scrollToMessage={scrollToMessage}
            />

            {!isMobileView && (
              <MessageDesktopActions
                msgId={primaryMessage.id}
                sender={sender}
                isDeleted={false}
                onOpenReactionPicker={onOpenReactionPicker}
                openDeleteMenu={openDeleteMenu}
                setMenuPos={setMenuPos}
              />
            )}

            {/* Media Album Grid */}
            <MediaGroupGrid $count={Math.min(count, 4)}>
              {displayItems.map((item, idx) => {
                const isVideo =
                  item.type === 'video' ||
                  Boolean(item.url?.match(/\.(mp4|webm|mov)$/i));
                const itemSrc = sanitizeMediaUrl(loadedMediaSrcById[item.id] || item.url);
                const isLastWithOverflow = isOverflow && idx === 3;

                return (
                  <MediaGroupTile
                    key={item.id || idx}
                    onClick={(e) => handleTileClick(e, idx)}
                    title={isLastWithOverflow ? `View all ${count} photos/videos` : `View media ${idx + 1}`}
                  >
                    {isVideo ? (
                      <>
                        <video
                          src={itemSrc}
                          preload="metadata"
                          muted
                          playsInline
                          onLoadedMetadata={(e) => { try { e.currentTarget.currentTime = 0.001; } catch (_) {} }}
                          onContextMenu={(e) => e.preventDefault()}
                        />
                        <MediaPlayBadge>
                          <svg viewBox="0 0 24 24">
                            <polygon points="8 5 19 12 8 19" />
                          </svg>
                        </MediaPlayBadge>
                        <MediaVideoCornerTag>
                          <svg viewBox="0 0 24 24">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                          </svg>
                          VIDEO
                        </MediaVideoCornerTag>
                      </>
                    ) : (
                      <img
                        src={itemSrc}
                        alt={item.originalName || `Media ${idx + 1}`}
                        loading="lazy"
                        onContextMenu={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                      />
                    )}

                    {isLastWithOverflow ? (
                      <MediaGroupOverflowOverlay>
                        +{overflowCount}
                      </MediaGroupOverflowOverlay>
                    ) : (
                      <MediaDownloadButton
                        messageId={item.id}
                        url={item.url}
                        filename={item.originalName}
                        isVideo={isVideo}
                        onRequestDownload={onRequestDownload}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          width: '30px',
                          height: '30px',
                          zIndex: 3,
                        }}
                      />
                    )}
                  </MediaGroupTile>
                );
              })}
            </MediaGroupGrid>

            {/* Caption text if any */}
            {combinedCaption && (
              <div style={{ width: 0, minWidth: '100%' }}>
                <MessageText style={{ paddingTop: '0.45rem', paddingBottom: '0.1rem' }}>
                  {renderTextWithLinks(combinedCaption, sender)}
                </MessageText>
              </div>
            )}

            {/* Timestamp */}
            <FooterContainer $sender={sender}>
              <Timestamp $sender={sender}>
                {primaryMessage.edited && <span>(edited) </span>}
                {new Date(primaryMessage.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Timestamp>
            </FooterContainer>

            {/* Reactions */}
            <MessageReactions
              msg={primaryMessage}
              sender={sender}
              isDeleted={false}
              selectedMessages={selectedMessages}
              validReactions={validReactions}
              currentUserReaction={currentUserReaction}
              handleReact={handleReact}
              handleCancelSelectMode={handleCancelSelectMode}
              handleOpenFullEmojiPicker={handleOpenFullEmojiPicker}
              setReactionsPopup={setReactionsPopup}
            />
          </MessageBubble>
        </div>
      </MessageRow>

      {activeDeleteMenu === primaryMessage.id && (
        <MessageActionMenuPortal
          msg={primaryMessage}
          menuPos={menuPos}
          deleteMenuRef={deleteMenuRef}
          currentUserId={currentUserId}
          canEdit={false}
          handleSetReply={handleSetReply}
          setActiveDeleteMenu={setActiveDeleteMenu}
          handleToggleSelectMessage={handleToggleSelectMessage}
          handleStartEdit={() => {}}
          handleCopy={handleCopy}
          handleOpenReport={handleOpenReport}
        />
      )}
    </React.Fragment>
  );
});
