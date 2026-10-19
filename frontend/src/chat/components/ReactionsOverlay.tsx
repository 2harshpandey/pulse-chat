import React from 'react';
import { ReactionPicker, ReactionEmoji, ReactionsPopup } from '../Chat.styles';
import { QUICK_REACTIONS } from '../constants';

interface ReactionsOverlayProps {
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null;
  reactionPickerRef: React.RefObject<HTMLDivElement | null>;
  onReact: (messageId: string, emoji: string) => void;
  onOpenFullEmojiPicker: (rect: DOMRect, messageId: string) => void;
  reactionsPopup: {
    messageId: string;
    reactions: { [emoji: string]: { userId: string; username: string }[] };
    rect: DOMRect;
  } | null;
  currentUserId: string;
  onCloseReactionsPopup: () => void;
}

export const ReactionsOverlay: React.FC<ReactionsOverlayProps> = ({
  reactionPickerData,
  reactionPickerRef,
  onReact,
  onOpenFullEmojiPicker,
  reactionsPopup,
  currentUserId,
  onCloseReactionsPopup,
}) => {
  return (
    <>
      {reactionPickerData && (
        <ReactionPicker
          ref={reactionPickerRef as any}
          $sender={reactionPickerData.sender}
          style={(() => {
            const pickerWidth = 280;
            let top = reactionPickerData.rect.top - 60;
            let left = reactionPickerData.rect.left;

            if (top < 0) {
              top = reactionPickerData.rect.bottom + 10;
            }

            if (reactionPickerData.sender === 'me') {
              left = reactionPickerData.rect.right - pickerWidth;
            }

            if (left + pickerWidth > window.innerWidth) {
              left = window.innerWidth - pickerWidth - 10;
            }
            if (left < 10) left = 10;

            return { top: `${top}px`, left: `${left}px` };
          })()}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <ReactionEmoji
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                onReact(reactionPickerData.messageId, emoji);
              }}
            >
              {emoji}
            </ReactionEmoji>
          ))}
          <ReactionEmoji
            $isPlusIcon={true}
            data-is-plus-icon="true"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullEmojiPicker(e.currentTarget.getBoundingClientRect(), reactionPickerData.messageId);
            }}
          >
            +
          </ReactionEmoji>
        </ReactionPicker>
      )}

      {reactionsPopup && (
        <ReactionsPopup
          popupData={reactionsPopup}
          currentUserId={currentUserId}
          onClose={onCloseReactionsPopup}
          onRemoveReaction={(emoji) => {
            if (reactionsPopup) {
              onReact(reactionsPopup.messageId, emoji);
            }
            onCloseReactionsPopup();
          }}
        />
      )}
    </>
  );
};
