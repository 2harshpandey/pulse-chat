import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Message, ReactionsPopupData, ReactionSourceEntry } from '../../types';
import { filterValidReactions } from '../../constants';
import {
  getMessageElementId,
  getQuotedPreviewThumbUrl,
  sanitizeMediaUrl,
  normalizeMessageId,
  formatMediaSize,
  getMediaGatePreviewUrl,
  withCloudinaryTransform,
} from '../../utils';
import { useAlbumDownload } from '../../albumDownloadManager';
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
  MediaLoadGate,
  MediaLoadIcon,
  MediaLoadLabel,
  MediaLoadPreview,
  MediaSizeBadge,
  DownloadProgressRing,
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

const DownloadSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const CancelSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

const PlaySvg = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="8 5 19 12 8 19" />
  </svg>
);

const RingedProgressIcon = ({ progress }: { progress: number }) => (
  <DownloadProgressRing $progress={progress} $visible={true}>
    <svg className="ring-svg" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
      <circle className="track" cx="18" cy="18" r="15.8" />
      <circle className="progress" cx="18" cy="18" r="15.8" />
    </svg>
    <span className="cancel-icon" style={{ pointerEvents: 'none' }}>
      <CancelSvg />
    </span>
  </DownloadProgressRing>
);

export interface MediaGroupItemProps {
  messages: Message[];
  primaryMessage: Message;
  showUsername: boolean;
  isPinned: boolean;
  currentUserId: string;
  activeDeleteMenu: string | null;
  deleteMenuRef: React.RefObject<HTMLDivElement>;
  handleSetReply: (message: Message) => void;
  handleReact: (messageId: string, emoji: string, isAlbum?: boolean) => void;
  openDeleteMenu: (messageId: string) => void;
  openMediaGallery: (items: Message[], initialIndex: number) => void;
  loadedMediaSrcById: Record<string, string>;
  onRequestDownload?: (messageId: string, mediaUrl: string, filename: string) => void;
  loadedMediaMessageSet?: Set<string>;
  onRequestMediaLoad?: (messageId: string, mediaUrl?: string) => void;
  mediaLoadProgressById?: Record<string, number>;
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
  onOpenReactionPicker: (messageId: string, rect: DOMRect, sender: 'me' | 'other', isAlbum?: boolean) => void;
  setReactionsPopup: (popup: ReactionsPopupData | null) => void;
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string, isAlbum?: boolean) => void;
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null;
  onMediaLoadError?: (messageId: string, url?: string) => void;
  quotedGroupInfo?: { count: number; primaryId: string; caption?: string };
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
  loadedMediaMessageSet,
  onRequestMediaLoad,
  mediaLoadProgressById,
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
  onMediaLoadError,
  quotedGroupInfo,
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

  // Find unique caption text across the grouped messages
  const combinedCaption = useMemo(() => {
    const list = messages
      .map((m) => m.text?.trim())
      .filter((t): t is string => Boolean(t && t.length > 0));
    return Array.from(new Set(list)).join('\n');
  }, [messages]);

  // Unified reply target representing the entire media group album
  const groupReplyTarget = useMemo<Message>(() => ({
    ...primaryMessage,
    type: 'group' as any,
    isGroup: true,
    mediaCount: messages.length,
    text: combinedCaption || undefined,
  }), [primaryMessage, messages.length, combinedCaption]);

  const {
    messageRowRef,
    lastSelectModeExitTimeRef,
    handleLongPressStart,
    handleLongPressMove,
    handleLongPressEnd,
    handleLongPressCancel,
  } = useMessageGestures({
    msg: groupReplyTarget,
    isMobileView,
    isSelectModeActive,
    handleSetReply,
    handleToggleSelectMessage,
  });

  // Combine all reactions across primaryMessage (whole album) and all individual media items
  const { combinedReactions, reactionSources, currentUserReaction } = useMemo(() => {
    const combined: { [emoji: string]: { userId: string; username: string }[] } = {};
    const sources: ReactionSourceEntry[] = [];

    const addReactionEntry = (
      user: { userId: string; username: string; isAlbum?: boolean },
      emoji: string,
      msgId: string,
      isWholeAlbum: boolean,
      thumbUrl?: string,
      isVideo?: boolean
    ) => {
      if (!combined[emoji]) combined[emoji] = [];
      if (!combined[emoji].some((existing) => existing.userId === user.userId)) {
        combined[emoji].push({ userId: user.userId, username: user.username });
      }
      sources.push({
        userId: user.userId,
        username: user.username,
        emoji,
        messageId: msgId,
        isAlbum: isWholeAlbum,
        mediaThumbUrl: isWholeAlbum ? undefined : thumbUrl,
        isVideo: isWholeAlbum ? false : isVideo,
      });
    };

    // 1. Reactions on primaryMessage that are explicitly album-level reactions
    const primaryValid = filterValidReactions(primaryMessage.reactions);
    for (const [emoji, users] of Object.entries(primaryValid)) {
      if (!Array.isArray(users)) continue;
      for (const u of users) {
        if (u.isAlbum) {
          addReactionEntry(u, emoji, primaryMessage.id, true);
        }
      }
    }

    // 2. Reactions on individual media items in messages
    messages.forEach((item) => {
      const itemIsVideo =
        item.type === 'video' || Boolean(item.url?.match(/\.(mp4|webm|mov)$/i));
      const thumb =
        loadedMediaSrcById[item.id] ||
        (item.url ? withCloudinaryTransform(item.url, 'f_auto,q_35,w_96,h_96,c_fill') : '') ||
        item.url;
      const itemValid = filterValidReactions(item.reactions);
      for (const [emoji, users] of Object.entries(itemValid)) {
        if (!Array.isArray(users)) continue;
        for (const u of users) {
          if (item.id === primaryMessage.id && u.isAlbum) continue;
          addReactionEntry(u, emoji, item.id, false, thumb, itemIsVideo);
        }
      }
    });

    // 3. Fallback for legacy reactions on primaryMessage without isAlbum flag
    for (const [emoji, users] of Object.entries(primaryValid)) {
      if (!Array.isArray(users)) continue;
      for (const u of users) {
        if (u.isAlbum === undefined) {
          const alreadyAdded = sources.some(
            (s) => s.userId === u.userId && s.emoji === emoji && s.messageId === primaryMessage.id
          );
          if (!alreadyAdded) {
            addReactionEntry(u, emoji, primaryMessage.id, true);
          }
        }
      }
    }

    // Check if current user has reacted anywhere in this group
    let myReaction: string | null = null;
    for (const [emoji, users] of Object.entries(combined)) {
      if (users.some((u) => u.userId === currentUserId)) {
        myReaction = emoji;
        break;
      }
    }

    return {
      combinedReactions: combined,
      reactionSources: sources,
      currentUserReaction: myReaction,
    };
  }, [primaryMessage, messages, loadedMediaSrcById, currentUserId]);

  // Determine grid tiles and overflow count
  const count = messages.length;
  const isOverflow = count > 4;
  const displayItems = isOverflow ? messages.slice(0, 4) : messages;
  const overflowCount = count - 4; // shows +X number which are other (e.g. 5 total -> +1 other)

  const {
    isDownloading: isAlbumDownloading,
    startDownload: startAlbumDownload,
    cancelDownload: cancelAlbumDownload,
  } = useAlbumDownload(primaryMessage.id);

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
        data-mongo-id={normalizeMessageId(primaryMessage._id)}
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
            handleSetReply(groupReplyTarget);
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
              quotedGroupInfo={quotedGroupInfo}
            />

            {!isMobileView && (
              <MessageDesktopActions
                msgId={primaryMessage.id}
                sender={sender}
                isDeleted={false}
                onOpenReactionPicker={(id, rect, s) => onOpenReactionPicker(id, rect, s, true)}
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
                const isTileOwnMessage = item.userId === currentUserId;
                const isTileLoaded = Boolean(
                  isTileOwnMessage ||
                  (loadedMediaMessageSet && loadedMediaMessageSet.has(item.id)) ||
                  Boolean(loadedMediaSrcById[item.id])
                );
                const shouldGateTile = Boolean(item.url) && !item.isUploading && !isTileLoaded && !isTileOwnMessage;
                const isTileLoading = Boolean(mediaLoadProgressById && (item.id in mediaLoadProgressById));
                const tileLoadProgress = isTileLoading ? Math.max(0, Math.min(1, mediaLoadProgressById?.[item.id] || 0)) : 0;
                const gatePreviewUrl = shouldGateTile
                  ? sanitizeMediaUrl(getMediaGatePreviewUrl(isVideo ? 'video' : 'image', item.url))
                  : '';
                const tileMediaSizeLabel = formatMediaSize(item.size);
                const itemSrc = sanitizeMediaUrl(loadedMediaSrcById[item.id] || item.url);
                const isLastWithOverflow = isOverflow && idx === 3;

                return (
                  <MediaGroupTile
                    key={item.id || idx}
                    onClick={(e) => {
                      if (shouldGateTile && !isLastWithOverflow) {
                        e.stopPropagation();
                        if (onRequestMediaLoad && item.url) {
                          onRequestMediaLoad(item.id, item.url);
                        }
                        return;
                      }
                      handleTileClick(e, idx);
                    }}
                    title={
                      isLastWithOverflow
                        ? `View all ${count} photos/videos`
                        : shouldGateTile
                          ? `Load ${isVideo ? 'video' : 'photo'} (${tileMediaSizeLabel || 'Tap to load'})`
                          : `View media ${idx + 1}`
                    }
                  >
                    {shouldGateTile ? (
                      <>
                        {gatePreviewUrl && (
                          <MediaLoadPreview
                            src={gatePreviewUrl}
                            alt=""
                            aria-hidden="true"
                            $isLoading={isTileLoading}
                          />
                        )}
                        {isLastWithOverflow ? (
                          <MediaGroupOverflowOverlay>
                            +{overflowCount}
                          </MediaGroupOverflowOverlay>
                        ) : (
                          <>
                            <MediaLoadGate
                              type="button"
                              data-allow-quote-swipe
                              aria-label={isVideo ? 'Load video' : 'Load image'}
                              title={isVideo ? 'Load video' : 'Load image'}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onRequestMediaLoad && item.url) {
                                  onRequestMediaLoad(item.id, item.url);
                                }
                              }}
                              $isLoading={isTileLoading}
                            >
                              <MediaLoadIcon>
                                {isTileLoading ? (
                                  <RingedProgressIcon progress={tileLoadProgress} />
                                ) : isVideo ? (
                                  <PlaySvg />
                                ) : (
                                  <DownloadSvg />
                                )}
                              </MediaLoadIcon>
                              <MediaLoadLabel>
                                {isTileLoading
                                  ? `Loading ${Math.round(tileLoadProgress * 100)}%`
                                  : 'Tap to load'}
                              </MediaLoadLabel>
                            </MediaLoadGate>
                            {tileMediaSizeLabel && <MediaSizeBadge>{tileMediaSizeLabel}</MediaSizeBadge>}
                            {isVideo && (
                              <MediaVideoCornerTag style={{ zIndex: 3 }}>
                                <svg viewBox="0 0 24 24">
                                  <polygon points="23 7 16 12 23 17 23 7" />
                                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                </svg>
                                VIDEO
                              </MediaVideoCornerTag>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <>
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
                            onError={(e) => {
                              const fallback = sanitizeMediaUrl(item.url);
                              const img = e.currentTarget;
                              if (fallback && img.src !== fallback) {
                                img.src = fallback;
                              }
                              onMediaLoadError?.(item.id, item.url);
                            }}
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
                      </>
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
              validReactions={combinedReactions}
              currentUserReaction={currentUserReaction}
              handleReact={(id, emoji) => handleReact(id, emoji, true)}
              handleCancelSelectMode={handleCancelSelectMode}
              handleOpenFullEmojiPicker={(rect, id) => handleOpenFullEmojiPicker(rect, id, true)}
              setReactionsPopup={(popup) => {
                if (!popup) {
                  setReactionsPopup(null);
                  return;
                }
                setReactionsPopup({
                  ...popup,
                  reactions: combinedReactions,
                  reactionSources,
                });
              }}
            />
          </MessageBubble>
        </div>
      </MessageRow>

      {activeDeleteMenu === primaryMessage.id && (
        <MessageActionMenuPortal
          msg={groupReplyTarget}
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
          isDownloadingAlbum={isAlbumDownloading}
          onDownloadAll={() => {
            void startAlbumDownload(messages);
          }}
          onCancelDownload={cancelAlbumDownload}
        />
      )}
    </React.Fragment>
  );
});
