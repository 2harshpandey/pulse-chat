import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Message, MessageItemProps } from './types';
import { filterValidReactions } from './constants';
import {
  getMessageElementId, getQuotedPreviewThumbUrl,
  sanitizeMediaUrl,
  inferredContentLengthByUrlCache,
  buildDownloadProxyUrl, normalizeMessageId,
  downloadFile,
} from './utils';
import {
  MessageRow, MessageBubble, Username, FooterContainer, Timestamp,
  SelectCheckboxContainer, Checkbox,
  MessageText, MessagePinIconWrapper
} from './ChatStyledComponents';
import { renderMessageContent, detectFirstUrl } from './renderMessage';
import { LinkPreview } from './LinkPreview';
import { transferManager, TransferInfo } from './TransferManager';
import {
  MessageQuotedPreview,
  MessageActionMenuPortal,
  MessageReactions,
  MessageDesktopActions,
  useMessageGestures
} from './components/message';

export const MessageItem = React.memo(({
  msg,
  isLastMessage,
  scrollToBottom,
  isPinned,
  showUsername,
  currentUserId,
  activeDeleteMenu,
  deleteMenuRef,
  handleSetReply,
  handleReact,
  openDeleteMenu,
  openLightbox,
  isMediaLoaded,
  onRequestMediaLoad,
  isMediaLoadInProgress,
  mediaLoadProgress,
  loadedMediaSrc,
  onRequestDownload,
  deleteForMe,
  deleteForEveryone,
  scrollToMessage,
  isSelectModeActive,
  isSelected,
  handleToggleSelectMessage,
  setActiveDeleteMenu,
  handleCopy,
  handleOpenReport,
  handleStartEdit,
  handleCancelSelectMode,
  isMobileView,
  onOpenReactionPicker,
  setReactionsPopup,
  selectedMessages,
  handleOpenFullEmojiPicker,
  reactionPickerData,
  editingMessageId,
  handleCancelEdit,
  onVideoFullscreenEnter,
  onResumeUpload,
  onCancelUpload
}: MessageItemProps) => {
  const isEditing = editingMessageId === msg.id;
  const quotedPreviewThumbUrl = msg.replyingTo && !msg.replyingTo.isDeleted && (msg.replyingTo.type === 'image' || msg.replyingTo.type === 'video')
    ? getQuotedPreviewThumbUrl(msg.replyingTo.type, msg.replyingTo.url)
    : '';
  const messageBubbleRef = useRef<HTMLDivElement>(null!);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right?: number; left?: number } | null>(null);
  
  const isMediaOrTransfer = msg.type !== 'text' || Boolean(msg.url) || Boolean(transferManager.getTransfer(msg.id));
  const [transferInfo, setTransferInfo] = useState<TransferInfo | undefined>(() => (isMediaOrTransfer ? transferManager.getTransfer(msg.id) : undefined));
  useEffect(() => {
    if (!isMediaOrTransfer) return;
    const unsubscribe = transferManager.subscribe((transfers) => {
      setTransferInfo(transfers.get(msg.id));
    });
    return () => { unsubscribe(); };
  }, [msg.id, isMediaOrTransfer]);
  const [resolvedContentSize, setResolvedContentSize] = useState<number | undefined>(() => {
    if (typeof msg.size === 'number' && msg.size > 0) return msg.size;
    const safeUrl = sanitizeMediaUrl(msg.url);
    return safeUrl ? inferredContentLengthByUrlCache.get(safeUrl) : undefined;
  });

  const messageWithResolvedSize = useMemo<Message>(() => {
    if (typeof resolvedContentSize !== 'number' || resolvedContentSize <= 0 || msg.size === resolvedContentSize) {
      return msg;
    }
    return { ...msg, size: resolvedContentSize };
  }, [msg, resolvedContentSize]);

  useEffect(() => {
    if (typeof msg.size === 'number' && msg.size > 0) {
      setResolvedContentSize(msg.size);
      const safeUrl = sanitizeMediaUrl(msg.url);
      if (safeUrl) inferredContentLengthByUrlCache.set(safeUrl, msg.size);
      return;
    }

    const safeUrl = sanitizeMediaUrl(msg.url);
    if (!safeUrl) {
      setResolvedContentSize(undefined);
      return;
    }

    setResolvedContentSize(inferredContentLengthByUrlCache.get(safeUrl));
  }, [msg.id, msg.size, msg.url]);

  useEffect(() => {
    if (typeof msg.size === 'number' && msg.size > 0) return;
    if (!msg.url) return;
    if (msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'file') return;

    const safeUrl = sanitizeMediaUrl(msg.url);
    if (!safeUrl) return;
    if (inferredContentLengthByUrlCache.has(safeUrl)) return;

    const abortController = new AbortController();
    const metadataUrl = buildDownloadProxyUrl(safeUrl, msg.originalName);

    void fetch(metadataUrl, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
      signal: abortController.signal,
    }).then((response) => {
      if (!response.ok) return;
      const contentLengthHeader = response.headers.get('content-length');
      const parsedLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
      if (!Number.isFinite(parsedLength) || parsedLength <= 0) return;
      inferredContentLengthByUrlCache.set(safeUrl, parsedLength);
      setResolvedContentSize(parsedLength);
    }).catch(() => {
      // Ignore metadata failures: UI can still function without explicit size.
    });

    return () => abortController.abort();
  }, [msg.id, msg.originalName, msg.size, msg.type, msg.url]);

  // Keep menuPos in sync: clear it whenever this row's menu is closed from outside.
  useEffect(() => {
    if (activeDeleteMenu !== msg.id) setMenuPos(null);
  }, [activeDeleteMenu, msg.id]);

  // Close menu on any scroll (e.g. user scrolls while menu is open).
  useEffect(() => {
    if (activeDeleteMenu !== msg.id || !menuPos) return;
    const close = () => { setActiveDeleteMenu(null); };
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  }, [activeDeleteMenu, msg.id, menuPos, setActiveDeleteMenu]);

  const {
    messageRowRef,
    lastSelectModeExitTimeRef,
    handleLongPressStart,
    handleLongPressMove,
    handleLongPressEnd,
    handleLongPressCancel,
  } = useMessageGestures({
    msg,
    isMobileView,
    isSelectModeActive,
    handleSetReply,
    handleToggleSelectMessage,
  });

  const validReactions = useMemo(() => filterValidReactions(msg.reactions), [msg.reactions]);

  const currentUserReaction = useMemo(() => {
    for (const [emoji, users] of Object.entries(validReactions)) {
      if (users.some((r: { userId: string }) => r.userId === currentUserId)) {
        return emoji;
      }
    }
    return null;
  }, [validReactions, currentUserId]);

  const prevCurrentUserReaction = useRef<string | null>(currentUserReaction);

  useEffect(() => {
    if (currentUserReaction !== prevCurrentUserReaction.current) {
      if (currentUserReaction && prevCurrentUserReaction.current !== undefined) {
        if (isLastMessage && scrollToBottom) {
          setTimeout(() => {
            scrollToBottom();
          }, 150);
        } else if (messageRowRef.current) {
          setTimeout(() => {
            if (messageRowRef.current) {
              messageRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 150);
        }
      }
      prevCurrentUserReaction.current = currentUserReaction;
    }
  }, [currentUserReaction, isLastMessage, scrollToBottom]);

  const sender = msg.userId === currentUserId ? 'me' : 'other';

  const messageTime = new Date(msg.timestamp).getTime();
  const now = new Date().getTime();
  const canEdit = msg.userId === currentUserId && (now - messageTime) < 15 * 60 * 1000 && msg.text && !msg.isDeleted;
  const isDeleted = msg.isDeleted;
  const handleVideoFullscreenEnterForMessage = useCallback(() => {
    onVideoFullscreenEnter?.(msg.id);
  }, [onVideoFullscreenEnter, msg.id]);

  const handleDownloadMessage = useCallback((targetMsg: Message) => {
    if (!targetMsg.url) return;
    const isAudio = targetMsg.type === 'audio' || Boolean(
      (!targetMsg.type || targetMsg.type === 'file') && (
        targetMsg.url.match(/\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)($|\?)/i) ||
        targetMsg.originalName?.match(/\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i) ||
        (targetMsg.originalName?.toLowerCase().includes('voice') && targetMsg.url.match(/\.(webm|ogg|mp4|m4a)($|\?)/i))
      )
    );
    const isVideo = !isAudio && (targetMsg.type === 'video' || Boolean(targetMsg.url.match(/\.(mp4|webm|mov)$/i)));
    const fallbackName = targetMsg.originalName || (isAudio ? 'voice-message.mp3' : isVideo ? 'video.mp4' : 'media.jpg');
    void downloadFile(targetMsg.url, fallbackName, undefined, undefined, !isVideo && !isAudio);
  }, []);

  return (
    <React.Fragment>
      <MessageRow
        id={getMessageElementId(msg.id)}
        data-message-id={normalizeMessageId(msg.id)}
        data-mongo-id={normalizeMessageId(msg._id)}
        data-client-temp-id={normalizeMessageId((msg as any).clientTempId) || undefined}
        ref={messageRowRef}
        $sender={sender}
        $isSelected={isSelected}
        $isActiveDeleteMenu={activeDeleteMenu === msg.id}
        $isGrouped={!showUsername}
        onClickCapture={(e) => {
          // If we just exited select mode in the last 300ms, suppress this native click
          // so it doesn't accidentally trigger a download or open a lightbox.
          if (Date.now() - lastSelectModeExitTimeRef.current < 300) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onDoubleClick={(e) => {
          if (!isMobileView && !isSelectModeActive) {
            // Only quote when double-clicking *outside* the message bubble
            // (i.e. the empty space beside the bubble). If the double-click
            // target is inside the bubble, ignore it so normal text selection
            // and interactions work.
            if (messageBubbleRef.current && messageBubbleRef.current.contains(e.target as Node)) {
              return;
            }
            e.preventDefault();
            handleSetReply(msg);
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
              handleToggleSelectMessage(msg.id);
            }}
          >
            <Checkbox checked={isSelected} />
          </SelectCheckboxContainer>
        )}
        <div
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: sender === 'me' ? 'flex-end' : 'flex-start', width: '100%' }}
        >
          {showUsername && <Username $sender={sender}>{msg.username}</Username>}
          <MessageBubble
            ref={messageBubbleRef}
            $sender={sender}
            $messageType={msg.type}
            $isUploading={msg.isUploading}
            $uploadError={msg.uploadError}
            style={{
              marginBottom: (!isDeleted && msg.reactions && Object.keys(msg.reactions).length > 0) ? '18px' : undefined,
              ...(isEditing ? {
                outline: '2px solid rgba(99, 102, 241, 0.55)',
                outlineOffset: '2px',
                boxShadow: '0 0 0 4px rgba(99, 102, 241, 0.12)',
              } : {}),
            }}
          >
            {isPinned && (
              <MessagePinIconWrapper $sender={sender}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11V22H13V16H18V14L16 12Z"/>
                </svg>
              </MessagePinIconWrapper>
            )}
            <MessageQuotedPreview
              msg={msg}
              currentUserId={currentUserId}
              sender={sender}
              quotedPreviewThumbUrl={quotedPreviewThumbUrl}
              scrollToMessage={scrollToMessage}
            />
            {isDeleted ? (
              <>
                <MessageText style={{ fontStyle: 'italic', color: sender === 'me' ? '#bfdbfe' : '#a0aec0' }}>
                  {msg.deletedBy === 'admin' ? 'This message has been deleted by an admin.' : (msg.deletedBy === currentUserId ? 'You deleted this message.' : 'This message has been deleted.')}
                </MessageText>
                {!isMobileView && (
                  <MessageDesktopActions
                    msgId={msg.id}
                    sender={sender}
                    isDeleted={true}
                    openDeleteMenu={openDeleteMenu}
                    setMenuPos={setMenuPos}
                  />
                )}
                <FooterContainer $sender={sender}>
                  <Timestamp $sender={sender}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Timestamp>
                </FooterContainer>
              </>
            ) : (
              <>
                {!isMobileView && (
                  <MessageDesktopActions
                    msgId={msg.id}
                    sender={sender}
                    isDeleted={false}
                    onOpenReactionPicker={onOpenReactionPicker}
                    openDeleteMenu={openDeleteMenu}
                    setMenuPos={setMenuPos}
                  />
                )}
                {/* DeleteMenu rendered as fixed portal - see block after </MessageRow> */}
                {msg.type === 'text' && !msg.url && msg.text && (() => { const _u = detectFirstUrl(msg.text); return _u ? <LinkPreview url={_u} sender={sender} /> : null; })()}
                {renderMessageContent(
                  messageWithResolvedSize,
                  openLightbox,
                  undefined,
                  sender,
                  handleVideoFullscreenEnterForMessage,
                  isMediaLoaded,
                  onRequestMediaLoad,
                  isMediaLoadInProgress,
                  mediaLoadProgress,
                  onRequestDownload,
                  transferInfo?.type === 'download' && (transferInfo.state === 'downloading' || transferInfo.state === 'paused'),
                  transferInfo?.type === 'download' ? transferInfo.progress : 0,
                  loadedMediaSrc,
                  transferInfo,
                  onResumeUpload,
                  onCancelUpload,
                  undefined,
                  isSelectModeActive
                )}
                <FooterContainer $sender={sender}>
                  <Timestamp $sender={sender}>{msg.edited && <span>(edited) </span>}{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Timestamp>
                </FooterContainer>
              </>
            )}
            <MessageReactions
              msg={msg}
              sender={sender}
              isDeleted={isDeleted}
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
      {activeDeleteMenu === msg.id && (
        <MessageActionMenuPortal
          msg={msg}
          menuPos={menuPos}
          deleteMenuRef={deleteMenuRef}
          currentUserId={currentUserId}
          canEdit={Boolean(canEdit)}
          handleSetReply={handleSetReply}
          setActiveDeleteMenu={setActiveDeleteMenu}
          handleToggleSelectMessage={handleToggleSelectMessage}
          handleStartEdit={handleStartEdit}
          handleCopy={handleCopy}
          handleOpenReport={handleOpenReport}
          onDownload={handleDownloadMessage}
        />
      )}
    </React.Fragment>
  );
});
