import React, { useMemo } from 'react';
import type { Message } from '../types';
import { SystemMessage } from '../Chat.styles';
import { MessageItem } from '../MessageItem';
import { MediaGroupItem } from './message';

import { isGiphyUrl, setAudioDurationCache, getQuotedPreviewThumbUrl, normalizeMessageId } from '../utils';

export const isMediaMessage = (m: Message): boolean => {
  if (m.isDeleted) return false;
  if (m.isUploading || m.uploadError) return false;
  if (m.url && isGiphyUrl(m.url)) return false;
  if (
    m.type === 'audio' ||
    m.url?.match(/\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)($|\?)/i) ||
    m.originalName?.match(/\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i) ||
    (m.originalName?.toLowerCase().includes('voice') && m.url?.match(/\.(webm|ogg|mp4|m4a)($|\?)/i))
  ) {
    return false;
  }
  if (m.type === 'image' || m.type === 'video') return true;
  if (m.url && m.url.match(/\.(jpeg|jpg|png|svg|webp|mp4|webm|mov)$/i)) return true;
  return false;
};

export type MessageListItem =
  | { type: 'single'; message: Message }
  | { type: 'group'; messages: Message[]; primaryMessage: Message; id: string };

export const groupMessages = (messages: Message[]): MessageListItem[] => {
  const result: MessageListItem[] = [];
  let currentGroup: Message[] = [];

  const flushGroup = () => {
    if (currentGroup.length === 0) return;
    if (currentGroup.length === 1) {
      result.push({ type: 'single', message: currentGroup[0] });
    } else {
      result.push({
        type: 'group',
        messages: [...currentGroup],
        primaryMessage: currentGroup[0],
        id: `group-${currentGroup.map((m) => m.id).join('-')}`,
      });
    }
    currentGroup = [];
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === 'system_notification') {
      flushGroup();
      result.push({ type: 'single', message: msg });
      continue;
    }

    if (!isMediaMessage(msg)) {
      flushGroup();
      result.push({ type: 'single', message: msg });
      continue;
    }

    if (currentGroup.length === 0) {
      currentGroup.push(msg);
    } else {
      const prevMsg = currentGroup[currentGroup.length - 1];
      const isSameUser = prevMsg.userId === msg.userId;
      const isSameDay =
        Boolean(prevMsg.timestamp && msg.timestamp) &&
        new Date(prevMsg.timestamp).toDateString() === new Date(msg.timestamp).toDateString();
      const timeDiffMs = Math.abs(
        new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()
      );
      const hasDifferentReply =
        Boolean(prevMsg.replyingTo?.id || msg.replyingTo?.id) &&
        prevMsg.replyingTo?.id !== msg.replyingTo?.id;

      // Group consecutive media from same user on same day within 5 minutes with compatible replies
      if (isSameUser && isSameDay && timeDiffMs <= 5 * 60 * 1000 && !hasDifferentReply) {
        currentGroup.push(msg);
      } else {
        flushGroup();
        currentGroup.push(msg);
      }
    }
  }

  flushGroup();
  return result;
};

export function findGroupAlbumForMessage(
  messages: Message[],
  targetId: string,
  replyingTo?: any
): { groupMessages: Message[]; initialIndex: number; count: number; primaryId: string; caption?: string } | null {
  if (!messages || messages.length === 0) return null;
  const isWholeAlbumTarget = Boolean(
    replyingTo?.isGroup ||
    replyingTo?.type === 'group' ||
    (typeof replyingTo?.mediaCount === 'number' && replyingTo.mediaCount > 1)
  );
  if (isWholeAlbumTarget) return null;
  const rawTargetId = normalizeMessageId(targetId);
  const replyingId = normalizeMessageId(replyingTo?.id);
  const replyingMongoId = normalizeMessageId(replyingTo?._id);
  const replyingMessageId = normalizeMessageId(replyingTo?.messageId);
  const replyingTempId = normalizeMessageId(replyingTo?.clientTempId);
  const targetIds = [rawTargetId, replyingId, replyingMongoId, replyingMessageId, replyingTempId].filter(
    (id): id is string => Boolean(id && id.length > 0)
  );

  if (targetIds.length === 0) return null;

  const grouped = groupMessages(messages);
  for (const item of grouped) {
    if (item.type === 'group' && item.messages.length > 1) {
      let idx = item.messages.findIndex((m) => {
        const mId = normalizeMessageId(m.id);
        const mMongoId = normalizeMessageId(m._id);
        const mTempId = normalizeMessageId((m as any).clientTempId);
        return targetIds.some((tid) => tid === mId || tid === mMongoId || tid === mTempId);
      });
      if (
        idx === -1 &&
        targetIds.some(
          (tid) => tid === normalizeMessageId(item.id) || tid === normalizeMessageId(item.primaryMessage?.id)
        )
      ) {
        idx = 0;
      }
      if (idx !== -1) {
        const count = item.messages.length;
        const primaryId = item.primaryMessage.id;
        const captionList = item.messages
          .map((m) => m.text?.trim())
          .filter((t): t is string => Boolean(t && t.length > 0));
        const caption = Array.from(new Set(captionList)).join('\n');
        return {
          groupMessages: item.messages,
          initialIndex: idx,
          count,
          primaryId,
          caption,
        };
      }
    }
  }
  return null;
}

export const getDateSeparatorText = (timestamp: string | number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
};

export interface MessagesListProps {
  historyLoaded: boolean;
  messages: Message[];
  pinnedMessages: any[];
  currentUserId: string;
  handleSetReply: (message: Message) => void;
  handleReact: (messageId: string, emoji: string, isAlbum?: boolean) => void;
  handleOpenDeleteMenu: (messageId: string) => void;
  openLightbox: (url: string) => void;
  openMediaGallery?: (items: Message[], initialIndex: number, options?: { autoPlayVideo?: boolean }) => void;
  loadedMediaMessageSet: Set<string>;
  onRequestMediaLoad: (messageId: string, mediaUrl?: string) => void;
  mediaLoadProgressById: Record<string, number>;
  loadedMediaSrcById: Record<string, string>;
  onRequestDownload: (messageId: string, mediaUrl: string, filename: string) => void;
  handleResumeUpload: (messageId: string) => void;
  handleCancelUpload: (messageId: string) => void;
  activeDeleteMenu: string | null;
  deleteMenuRef: React.RefObject<HTMLDivElement>;
  deleteForMe: (messageId: string) => void;
  deleteForEveryone: (messageId: string) => void;
  scrollToMessage: (
    messageId: string,
    sourceMessageId?: string,
    behavior?: 'auto' | 'smooth',
    force?: boolean,
    replyingToPayload?: any
  ) => Promise<{ success: boolean; messages?: Message[] } | void> | void;
  isSelectModeActive: boolean;
  selectedMessageIds: Set<string>;
  handleToggleSelectMessage: (messageId: string) => void;
  setActiveDeleteMenu: React.Dispatch<React.SetStateAction<string | null>>;
  handleCopy: (message: Message) => Promise<void>;
  handleOpenReport: (message: Message) => void;
  handleStartEdit: (message: Message) => void;
  handleCancelSelectMode: () => void;
  isMobileView: boolean;
  selectedMessages: string[];
  onOpenReactionPicker: (messageId: string, rect: DOMRect, sender: 'me' | 'other', isAlbum?: boolean) => void;
  setReactionsPopup: (data: any) => void;
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string, isAlbum?: boolean) => void;
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other'; isAlbum?: boolean } | null;
  editingMessageId: string | null;
  handleSetEditingMessageId: (id: string | null) => void;
  handleCancelEdit: () => void;
  onVideoFullscreenEnter: (messageId: string) => void;
  onMediaLoadError?: (messageId: string, url?: string) => void;
  onShowToast?: (msg: string) => void;
}

export const MessagesList = React.memo(function MessagesList({
  historyLoaded,
  messages,
  pinnedMessages,
  currentUserId,
  handleSetReply,
  handleReact,
  handleOpenDeleteMenu,
  openLightbox,
  openMediaGallery,
  loadedMediaMessageSet,
  onRequestMediaLoad,
  mediaLoadProgressById,
  loadedMediaSrcById,
  onRequestDownload,
  handleResumeUpload,
  handleCancelUpload,
  activeDeleteMenu,
  deleteMenuRef,
  deleteForMe,
  deleteForEveryone,
  scrollToMessage,
  isSelectModeActive,
  selectedMessageIds,
  handleToggleSelectMessage,
  setActiveDeleteMenu,
  handleCopy,
  handleOpenReport,
  handleStartEdit,
  handleCancelSelectMode,
  isMobileView,
  selectedMessages,
  onOpenReactionPicker,
  setReactionsPopup,
  handleOpenFullEmojiPicker,
  reactionPickerData,
  editingMessageId,
  handleSetEditingMessageId,
  handleCancelEdit,
  onVideoFullscreenEnter,
  onMediaLoadError,
  onShowToast,
}: MessagesListProps) {
  const pinnedMessageIdSet = useMemo(
    () =>
      new Set(
        pinnedMessages
          .filter(
            (p) =>
              p &&
              !p.isDeleted &&
              !p.vanished &&
              p.text !== 'This message has been deleted by an admin.'
          )
          .map((p) => p.id || p._id || p.messageId)
      ),
    [pinnedMessages]
  );

  const groupedItems = useMemo(() => groupMessages(messages), [messages]);

  const messageIdToGroupAlbum = useMemo(() => {
    const map = new Map<
      string,
      { groupMessages: Message[]; initialIndex: number; count: number; primaryId: string; caption?: string }
    >();
    for (const item of groupedItems) {
      if (item.type === 'group' && item.messages.length > 1) {
        const count = item.messages.length;
        const primaryId = item.primaryMessage.id;
        const captionList = item.messages
          .map((m) => m.text?.trim())
          .filter((t): t is string => Boolean(t && t.length > 0));
        const caption = Array.from(new Set(captionList)).join('\n');
        item.messages.forEach((m, idx) => {
          const entry = { groupMessages: item.messages, initialIndex: idx, count, primaryId, caption };
          if (m.id) map.set(m.id, entry);
          if (m._id) map.set(m._id, entry);
          if ((m as any).clientTempId) map.set((m as any).clientTempId, entry);
        });
      }
    }
    return map;
  }, [groupedItems]);

  const handleOpenQuotedMedia = React.useCallback(
    (targetId: string, replyingTo?: any, customMessages?: Message[]): boolean => {
      if (!openMediaGallery) return false;

      // Fullscreen media gallery should ONLY open if a particular media of that album was quoted and replied.
      // If the quoted target is an entire album (isGroup / type === 'group' / mediaCount > 1), do not open.
      const isWholeAlbumTarget = Boolean(
        replyingTo?.isGroup ||
        replyingTo?.type === 'group' ||
        (typeof replyingTo?.mediaCount === 'number' && replyingTo.mediaCount > 1)
      );
      if (isWholeAlbumTarget) {
        return false;
      }

      // 1. If customMessages provided, search directly in customMessages
      if (customMessages && customMessages.length > 0) {
        const foundAlbum = findGroupAlbumForMessage(customMessages, targetId, replyingTo);
        if (foundAlbum) {
          openMediaGallery(foundAlbum.groupMessages, foundAlbum.initialIndex, { autoPlayVideo: false });
          return true;
        }
        return false;
      }

      // 2. Otherwise check existing memoized map
      const albumData =
        (targetId && messageIdToGroupAlbum.get(targetId)) ||
        (replyingTo?.id && messageIdToGroupAlbum.get(replyingTo.id)) ||
        (replyingTo?._id && messageIdToGroupAlbum.get(replyingTo._id));

      if (albumData) {
        openMediaGallery(albumData.groupMessages, albumData.initialIndex, { autoPlayVideo: false });
        return true;
      }

      // 3. Fallback: check current messages list
      const fallbackAlbum = findGroupAlbumForMessage(messages, targetId, replyingTo);
      if (fallbackAlbum) {
        openMediaGallery(fallbackAlbum.groupMessages, fallbackAlbum.initialIndex, { autoPlayVideo: false });
        return true;
      }

      return false;
    },
    [openMediaGallery, messageIdToGroupAlbum, messages]
  );

  React.useEffect(() => {
    messages.forEach((m) => {
      if (m.type === 'audio' && typeof m.duration === 'number' && m.duration > 0) {
        setAudioDurationCache(m.id, m.duration);
        if (m.url) setAudioDurationCache(m.url, m.duration);
      }
      if (m.replyingTo?.type === 'audio' && typeof m.replyingTo.duration === 'number' && m.replyingTo.duration > 0) {
        if (m.replyingTo.id) setAudioDurationCache(m.replyingTo.id, m.replyingTo.duration);
        if (m.replyingTo.url) setAudioDurationCache(m.replyingTo.url, m.replyingTo.duration);
      }
    });
  }, [messages]);

  if (!historyLoaded || messages.length === 0) return null;

  return (
    <>
      {groupedItems.map((item, index, displayArr) => {
        const msg = item.type === 'single' ? item.message : item.primaryMessage;
        const albumData = msg.replyingTo?.id ? messageIdToGroupAlbum.get(msg.replyingTo.id) : undefined;
        const quotedGroupInfo = albumData
          ? { count: albumData.count, primaryId: albumData.primaryId, caption: albumData.caption }
          : undefined;

        const replyCandidates = [
          msg.replyingTo?.id,
          (msg.replyingTo as any)?._id,
          (msg.replyingTo as any)?.messageId,
          (msg.replyingTo as any)?.clientTempId,
        ].filter(Boolean).map(normalizeMessageId);

        const quotedTargetMessage = replyCandidates.length > 0
          ? messages.find((m) => {
              const mIds = [
                normalizeMessageId(m.id),
                normalizeMessageId((m as any)._id),
                normalizeMessageId((m as any).clientTempId),
              ].filter(Boolean);
              return replyCandidates.some(rc => mIds.includes(rc));
            })
          : undefined;

        const isQuotedTargetDeleted = Boolean(
          msg.replyingTo?.isDeleted ||
          quotedTargetMessage?.isDeleted ||
          quotedTargetMessage?.text === 'This message has been deleted.' ||
          quotedTargetMessage?.text === 'This message has been deleted by an admin.' ||
          msg.replyingTo?.text === 'This message has been deleted.' ||
          msg.replyingTo?.text === 'This message has been deleted by an admin.'
        );

        const effectiveReplyingTo = msg.replyingTo
          ? (isQuotedTargetDeleted
              ? {
                  ...msg.replyingTo,
                  isDeleted: true,
                  deletedBy: msg.replyingTo.deletedBy || quotedTargetMessage?.deletedBy,
                  text: undefined,
                  url: undefined,
                }
              : msg.replyingTo)
          : undefined;

        const effectiveMsg = effectiveReplyingTo && effectiveReplyingTo !== msg.replyingTo
          ? { ...msg, replyingTo: effectiveReplyingTo }
          : msg;

        const targetMediaUrl =
          !isQuotedTargetDeleted
            ? (effectiveReplyingTo?.url ||
               quotedTargetMessage?.url ||
               (quotedTargetMessage?.id ? loadedMediaSrcById[quotedTargetMessage.id] : undefined))
            : undefined;
        const targetMediaType = effectiveReplyingTo?.type || quotedTargetMessage?.type;

        const resolvedQuotedThumbUrl =
          effectiveReplyingTo &&
          !isQuotedTargetDeleted &&
          (targetMediaType === 'image' || targetMediaType === 'video') &&
          targetMediaUrl
            ? getQuotedPreviewThumbUrl(targetMediaType as any, targetMediaUrl)
            : '';
        if (msg.type === 'system_notification') {
          return (
            <div key={msg.id || index} style={{ display: 'flex', justifyContent: 'center', padding: '0.4rem 0' }}>
              <SystemMessage>{msg.text}</SystemMessage>
            </div>
          );
        }

        const prevItem = index > 0 ? displayArr[index - 1] : null;
        const prevMsg = prevItem
          ? (prevItem.type === 'single' ? prevItem.message : prevItem.messages[prevItem.messages.length - 1])
          : null;

        // Find previous item's date string, looking back past any system messages if needed
        let prevDateStr: string | null = null;
        for (let p = index - 1; p >= 0; p--) {
          const pi = displayArr[p];
          const pm = pi.type === 'single' ? pi.message : pi.primaryMessage;
          const ts = pm?.timestamp || pm?.createdAt;
          if (ts && !isNaN(new Date(ts).getTime())) {
            prevDateStr = new Date(ts).toDateString();
            break;
          }
        }

        const currentTs = msg.timestamp || msg.createdAt;
        const currentDateStr = currentTs && !isNaN(new Date(currentTs).getTime())
          ? new Date(currentTs).toDateString()
          : null;
        const showDateSeparator = Boolean(currentDateStr && currentDateStr !== prevDateStr);

        // A date separator interrupts consecutive message sequences, so the first message after a date badge must show the username badge
        const showUsername = Boolean(
          !prevMsg ||
          prevMsg.type === 'system_notification' ||
          prevMsg.userId !== msg.userId ||
          showDateSeparator
        );

        if (item.type === 'group') {
          const isGroupPinned = item.messages.some((m) => pinnedMessageIdSet.has(m.id));
          const isGroupSelected = item.messages.some((m) => selectedMessageIds.has(m.id));

          return (
            <div key={item.id} id={msg.id}>
              {showDateSeparator && (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0 1rem 0' }}>
                  <div
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                      padding: '0.25rem 0.8rem',
                      borderRadius: '16px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      boxShadow: 'var(--shadow-sm)',
                      border: '1px solid var(--border-primary)',
                      zIndex: 1,
                    }}
                  >
                    {getDateSeparatorText(msg.timestamp || msg.createdAt || '')}
                  </div>
                </div>
              )}
              <MediaGroupItem
                messages={item.messages}
                primaryMessage={effectiveMsg}
                showUsername={showUsername}
                isPinned={isGroupPinned}
                currentUserId={currentUserId}
                handleSetReply={handleSetReply}
                handleReact={handleReact}
                openDeleteMenu={handleOpenDeleteMenu}
                openMediaGallery={openMediaGallery || ((_items, _idx) => {})}
                loadedMediaSrcById={loadedMediaSrcById}
                loadedMediaMessageSet={loadedMediaMessageSet}
                onRequestMediaLoad={onRequestMediaLoad}
                mediaLoadProgressById={mediaLoadProgressById}
                onRequestDownload={onRequestDownload}
                scrollToMessage={scrollToMessage}
                isSelectModeActive={isSelectModeActive}
                isSelected={isGroupSelected}
                handleToggleSelectMessage={(_id) => {
                  if (isGroupSelected) {
                    item.messages.forEach((m) => {
                      if (selectedMessageIds.has(m.id)) handleToggleSelectMessage(m.id);
                    });
                  } else {
                    item.messages.forEach((m) => {
                      if (!selectedMessageIds.has(m.id)) handleToggleSelectMessage(m.id);
                    });
                  }
                }}
                setActiveDeleteMenu={setActiveDeleteMenu}
                activeDeleteMenu={activeDeleteMenu}
                deleteMenuRef={deleteMenuRef}
                handleCopy={handleCopy}
                handleOpenReport={handleOpenReport}
                handleCancelSelectMode={handleCancelSelectMode}
                isMobileView={isMobileView}
                selectedMessages={selectedMessages}
                onOpenReactionPicker={onOpenReactionPicker}
                setReactionsPopup={setReactionsPopup}
                handleOpenFullEmojiPicker={handleOpenFullEmojiPicker}
                reactionPickerData={reactionPickerData}
                onMediaLoadError={onMediaLoadError}
                quotedGroupInfo={quotedGroupInfo}
                quotedPreviewThumbUrl={resolvedQuotedThumbUrl}
                onOpenQuotedMedia={handleOpenQuotedMedia}
                onShowToast={onShowToast}
              />
            </div>
          );
        }

        return (
          <div key={(msg as any).clientTempId || msg.id || `msg-${index}`} id={msg.id}>
            {showDateSeparator && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0 1rem 0' }}>
                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    padding: '0.25rem 0.8rem',
                    borderRadius: '16px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    boxShadow: 'var(--shadow-sm)',
                    border: '1px solid var(--border-primary)',
                    zIndex: 1,
                  }}
                >
                  {getDateSeparatorText(msg.timestamp || msg.createdAt || '')}
                </div>
              </div>
            )}
            <MessageItem
              msg={effectiveMsg}
              isPinned={pinnedMessageIdSet.has(msg.id)}
              showUsername={showUsername}
              currentUserId={currentUserId}
              handleSetReply={handleSetReply}
              handleReact={handleReact}
              openDeleteMenu={handleOpenDeleteMenu}
              openLightbox={openLightbox}
              openMediaGallery={openMediaGallery}
              isMediaLoaded={loadedMediaMessageSet.has(msg.id)}
              onRequestMediaLoad={onRequestMediaLoad}
              isMediaLoadInProgress={Object.prototype.hasOwnProperty.call(mediaLoadProgressById, msg.id)}
              mediaLoadProgress={mediaLoadProgressById[msg.id] ?? 0}
              loadedMediaSrc={loadedMediaSrcById[msg.id]}
              onRequestDownload={onRequestDownload}
              onResumeUpload={handleResumeUpload}
              onCancelUpload={handleCancelUpload}
              activeDeleteMenu={activeDeleteMenu}
              deleteMenuRef={deleteMenuRef}
              deleteForMe={deleteForMe}
              deleteForEveryone={deleteForEveryone}
              scrollToMessage={scrollToMessage}
              isSelectModeActive={isSelectModeActive}
              isSelected={selectedMessageIds.has(msg.id)}
              handleToggleSelectMessage={handleToggleSelectMessage}
              setActiveDeleteMenu={setActiveDeleteMenu}
              handleCopy={handleCopy}
              handleOpenReport={handleOpenReport}
              handleStartEdit={handleStartEdit}
              handleCancelSelectMode={handleCancelSelectMode}
              isMobileView={isMobileView}
              selectedMessages={selectedMessages}
              onOpenReactionPicker={onOpenReactionPicker}
              setReactionsPopup={setReactionsPopup}
              handleOpenFullEmojiPicker={handleOpenFullEmojiPicker}
              reactionPickerData={reactionPickerData}
              editingMessageId={editingMessageId}
              handleSetEditingMessageId={handleSetEditingMessageId}
              handleCancelEdit={handleCancelEdit}
              onVideoFullscreenEnter={onVideoFullscreenEnter}
              onMediaError={onMediaLoadError}
              quotedGroupInfo={quotedGroupInfo}
              quotedPreviewThumbUrl={resolvedQuotedThumbUrl}
              onOpenQuotedMedia={handleOpenQuotedMedia}
              onShowToast={onShowToast}
            />
          </div>
        );
      })}
      <div style={{ height: '12px', flexShrink: 0 }} />
    </>
  );
});
