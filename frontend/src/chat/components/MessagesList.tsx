import React, { useMemo } from 'react';
import type { Message } from '../types';
import { SystemMessage } from '../Chat.styles';
import { MessageItem } from '../MessageItem';

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
    () => new Set(pinnedMessages.map((p) => p.id || p._id || p.messageId)),
    [pinnedMessages]
  );

  if (!historyLoaded || messages.length === 0) return null;

  return (
    <>
      {messages.map((msg, index, displayArr) => {
        if (msg.type === 'system_notification') {
          return (
            <div key={msg.id || index} style={{ display: 'flex', justifyContent: 'center', padding: '0.4rem 0' }}>
              <SystemMessage>{msg.text}</SystemMessage>
            </div>
          );
        }
        const dataIndex = index;
        const prevMsg = dataIndex > 0 ? displayArr[dataIndex - 1] : null;
        const showUsername = !prevMsg || prevMsg.type === 'system_notification' || prevMsg.userId !== msg.userId;

        const currentDateStr = msg.timestamp ? new Date(msg.timestamp).toDateString() : null;
        const prevDateStr = prevMsg?.timestamp ? new Date(prevMsg.timestamp).toDateString() : null;
        const showDateSeparator = currentDateStr && currentDateStr !== prevDateStr;

        return (
          <div key={msg.id || `msg-${index}`} id={msg.id}>
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
                  {getDateSeparatorText(msg.timestamp)}
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
