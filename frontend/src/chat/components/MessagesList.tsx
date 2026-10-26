import React, { useMemo } from 'react';
import type { Message } from '../types';
import { SystemMessage } from '../Chat.styles';
import { MessageItem } from '../MessageItem';
import { MediaGroupItem } from './message';

import { isGiphyUrl, setAudioDurationCache } from '../utils';

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
  handleReact: (messageId: string, emoji: string) => void;
  handleOpenDeleteMenu: (messageId: string) => void;
  openLightbox: (url: string) => void;
  openMediaGallery?: (items: Message[], initialIndex: number) => void;
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
  ) => Promise<void> | void;
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
  onOpenReactionPicker: (messageId: string, rect: DOMRect, sender: 'me' | 'other') => void;
  setReactionsPopup: (data: any) => void;
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string) => void;
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null;
  editingMessageId: string | null;
  handleSetEditingMessageId: (id: string | null) => void;
  handleCancelEdit: () => void;
  onVideoFullscreenEnter: (messageId: string) => void;
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
                primaryMessage={msg}
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
              msg={msg}
              isPinned={pinnedMessageIdSet.has(msg.id)}
              showUsername={showUsername}
              currentUserId={currentUserId}
              handleSetReply={handleSetReply}
              handleReact={handleReact}
              openDeleteMenu={handleOpenDeleteMenu}
              openLightbox={openLightbox}
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
            />
          </div>
        );
      })}
      <div style={{ height: '12px', flexShrink: 0 }} />
    </>
  );
});
