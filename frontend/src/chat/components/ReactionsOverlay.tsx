import React, { useState, useLayoutEffect } from 'react';
import { ReactionPicker, ReactionEmoji, ReactionsPopup } from '../Chat.styles';
import { QUICK_REACTIONS } from '../constants';
import type { ReactionsPopupData } from '../types';

interface ReactionsOverlayProps {
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other'; isAlbum?: boolean } | null;
  reactionPickerRef: React.RefObject<HTMLDivElement | null>;
  onReact: (messageId: string, emoji: string, isAlbum?: boolean) => void;
  onOpenFullEmojiPicker: (rect: DOMRect, messageId: string, isAlbum?: boolean) => void;
  reactionsPopup: ReactionsPopupData | null;
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
  const [measuredWidth, setMeasuredWidth] = useState<number>(340);

  useLayoutEffect(() => {
    if (reactionPickerRef.current) {
      const w = reactionPickerRef.current.offsetWidth;
      if (w > 0 && Math.abs(w - measuredWidth) > 2) {
        setMeasuredWidth(w);
      }
    }
  }, [reactionPickerData, measuredWidth, reactionPickerRef]);

  return (
    <>
      {reactionPickerData && (
        <ReactionPicker
          ref={reactionPickerRef as any}
          $sender={reactionPickerData.sender}
          style={(() => {
            const pickerWidth = Math.max(340, reactionPickerRef.current?.offsetWidth || measuredWidth);
            const margin = 12;

            let top = reactionPickerData.rect.top - 60;
            if (top < 10) {
              top = reactionPickerData.rect.bottom + 10;
            }
            if (top + 60 > window.innerHeight) {
              top = Math.max(10, reactionPickerData.rect.top - 60);
            }

            // Align to right edge if sender is 'me', or if button is on the right half of the screen (e.g. MediaGalleryModal actions)
            let left: number;
            if (
              reactionPickerData.sender === 'me' ||
              reactionPickerData.rect.left > window.innerWidth / 2 ||
              reactionPickerData.rect.right > window.innerWidth - 180
            ) {
              left = reactionPickerData.rect.right - pickerWidth;
            } else {
              left = reactionPickerData.rect.left;
            }

            // Strictly clamp inside screen boundaries so it is never cut off
            if (left + pickerWidth > window.innerWidth - margin) {
              left = window.innerWidth - pickerWidth - margin;
            }
            if (left < margin) {
              left = margin;
            }

            return { top: `${top}px`, left: `${left}px` };
          })()}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <ReactionEmoji
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                onReact(reactionPickerData.messageId, emoji, reactionPickerData.isAlbum);
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
              onOpenFullEmojiPicker(
                e.currentTarget.getBoundingClientRect(),
                reactionPickerData.messageId,
                reactionPickerData.isAlbum
              );
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
          onRemoveReaction={(emoji, targetMessageId, isAlbum) => {
            if (reactionsPopup) {
              const msgId = targetMessageId || reactionsPopup.messageId;
              onReact(msgId, emoji, isAlbum);
            }
            onCloseReactionsPopup();
          }}
        />
      )}
    </>
  );
};
