import React from 'react';
import type { Message } from '../../types';
import { QUICK_REACTIONS } from '../../constants';
import {
  MobileReactionPicker,
  ReactionEmoji,
  ReactionsContainer,
  ReactionEmojiSpan,
  ReactionCountSpan,
} from '../../ChatStyledComponents';

interface MessageReactionsProps {
  msg: Message;
  sender: 'me' | 'other';
  isDeleted?: boolean;
  selectedMessages: string[];
  validReactions: { [emoji: string]: { userId: string; username: string }[] };
  currentUserReaction?: string | null;
  handleReact: (messageId: string, emoji: string) => void;
  handleCancelSelectMode: () => void;
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string) => void;
  setReactionsPopup: (
    popup: {
      messageId: string;
      reactions: { [emoji: string]: { userId: string; username: string }[] };
      rect: DOMRect;
    } | null
  ) => void;
}

export const MessageReactions: React.FC<MessageReactionsProps> = React.memo(({
  msg,
  sender,
  isDeleted = false,
  selectedMessages,
  validReactions,
  currentUserReaction,
  handleReact,
  handleCancelSelectMode,
  handleOpenFullEmojiPicker,
  setReactionsPopup,
}) => {
  const isSelectedForMobilePicker =
    !isDeleted && selectedMessages[0] === msg.id && selectedMessages.length === 1;
  const hasReactions = Object.keys(validReactions).length > 0;

  return (
    <>
      {isSelectedForMobilePicker && (
        <MobileReactionPicker $sender={sender} className="mobile-reaction-picker">
          {QUICK_REACTIONS.map((emoji) => (
            <ReactionEmoji
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                handleReact(msg.id, emoji);
                handleCancelSelectMode();
              }}
            >
              {emoji}
            </ReactionEmoji>
          ))}
          {currentUserReaction ? (
            <ReactionEmoji
              onClick={(e) => {
                e.stopPropagation();
                handleReact(msg.id, currentUserReaction);
                handleCancelSelectMode();
              }}
            >
              {currentUserReaction}
            </ReactionEmoji>
          ) : (
            <ReactionEmoji
              $isPlusIcon={true}
              data-is-plus-icon="true"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const msgId = msg.id;
                const rect = e.currentTarget.getBoundingClientRect();
                handleOpenFullEmojiPicker(rect, msgId);
              }}
            >
              +
            </ReactionEmoji>
          )}
        </MobileReactionPicker>
      )}

      {hasReactions && (() => {
        const totalReactions = Object.values(validReactions).flat().length;
        const uniqueEmojis = Object.keys(validReactions);
        return (
          <ReactionsContainer
            $sender={sender}
            onClick={(e) =>
              setReactionsPopup({
                messageId: msg.id,
                reactions: validReactions,
                rect: e.currentTarget.getBoundingClientRect(),
              })
            }
          >
            {uniqueEmojis.slice(0, 3).map((emoji) => (
              <ReactionEmojiSpan key={emoji}>{emoji}</ReactionEmojiSpan>
            ))}
            <ReactionCountSpan>{totalReactions}</ReactionCountSpan>
          </ReactionsContainer>
        );
      })()}
    </>
  );
});

MessageReactions.displayName = 'MessageReactions';
