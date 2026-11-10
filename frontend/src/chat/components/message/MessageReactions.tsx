import React from 'react';
import type { Message, ReactionsPopupData } from '../../types';
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
  setReactionsPopup: (popup: ReactionsPopupData | null) => void;
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

  const triggerReaction = (emoji: string, e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleReact(msg.id, emoji);
    handleCancelSelectMode();
  };

  return (
    <>
      {isSelectedForMobilePicker && (
        <MobileReactionPicker $sender={sender} className="mobile-reaction-picker" data-allow-click="true">
          {QUICK_REACTIONS.map((emoji) => (
            <ReactionEmoji
              key={emoji}
              data-allow-click="true"
              onPointerDown={(e) => {
                if (e.pointerType === 'touch' || e.pointerType === 'pen' || e.button === 0) {
                  triggerReaction(emoji, e);
                }
              }}
              onClick={(e) => {
                triggerReaction(emoji, e);
              }}
            >
              {emoji}
            </ReactionEmoji>
          ))}
          {currentUserReaction ? (
            <ReactionEmoji
              data-allow-click="true"
              onPointerDown={(e) => {
                if (e.pointerType === 'touch' || e.pointerType === 'pen' || e.button === 0) {
                  triggerReaction(currentUserReaction, e);
                }
              }}
              onClick={(e) => {
                triggerReaction(currentUserReaction, e);
              }}
            >
              {currentUserReaction}
            </ReactionEmoji>
          ) : (
            <ReactionEmoji
              $isPlusIcon={true}
              data-is-plus-icon="true"
              data-allow-click="true"
              aria-label="Add reaction"
              title="More reactions"
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
            data-testid="reactions-container"
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
