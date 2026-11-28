import React, { useLayoutEffect } from 'react';
import { ReactionPicker, ReactionEmoji } from '../Chat.styles';
import { ReactionsPopup } from './modals/ReactionsPopup';
import { QUICK_REACTIONS } from '../constants';
import { preserveKeyboardFocus } from '../utils';
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

const computePickerPosition = (
  rect: DOMRect,
  sender: 'me' | 'other',
  pickerWidth: number
) => {
  const margin = 12;
  const vvHeight = window.visualViewport?.height || window.innerHeight;
  const vvTop = window.visualViewport?.offsetTop || 0;

  let top = rect.top - 60;
  if (top < vvTop + 10) {
    top = rect.bottom + 10;
  }
  if (top + 60 > vvTop + vvHeight) {
    top = Math.max(vvTop + 10, Math.min(vvTop + vvHeight - 70, rect.top - 60));
  }

  let left: number;
  if (
    sender === 'me' ||
    rect.left > window.innerWidth / 2 ||
    rect.right > window.innerWidth - 180
  ) {
    left = rect.right - pickerWidth;
  } else {
    left = rect.left;
  }

  if (left + pickerWidth > window.innerWidth - margin) {
    left = window.innerWidth - pickerWidth - margin;
  }
  if (left < margin) {
    left = margin;
  }

  return { top, left };
};

export const ReactionsOverlay: React.FC<ReactionsOverlayProps> = ({
  reactionPickerData,
  reactionPickerRef,
  onReact,
  onOpenFullEmojiPicker,
  reactionsPopup,
  currentUserId,
  onCloseReactionsPopup,
}) => {
  // Adjust horizontal position synchronously before paint without triggering a second React render
  useLayoutEffect(() => {
    const el = reactionPickerRef.current;
    if (!el || !reactionPickerData) return;
    const actualWidth = el.offsetWidth;
    if (actualWidth <= 0) return;
    const { left } = computePickerPosition(
      reactionPickerData.rect,
      reactionPickerData.sender,
      actualWidth
    );
    el.style.left = `${left}px`;
  }, [reactionPickerData, reactionPickerRef]);

  return (
    <>
      {reactionPickerData && (
        <ReactionPicker
          ref={reactionPickerRef as any}
          $sender={reactionPickerData.sender}
          style={(() => {
            const estimatedWidth = typeof window !== 'undefined' && window.innerWidth <= 380 ? 290 : 340;
            const { top, left } = computePickerPosition(
              reactionPickerData.rect,
              reactionPickerData.sender,
              estimatedWidth
            );
            return { top: `${top}px`, left: `${left}px` };
          })()}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <ReactionEmoji
              key={emoji}
              onPointerDown={preserveKeyboardFocus}
              onMouseDown={preserveKeyboardFocus}
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
            aria-label="Add reaction"
            title="More reactions"
            onPointerDown={preserveKeyboardFocus}
            onMouseDown={preserveKeyboardFocus}
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
