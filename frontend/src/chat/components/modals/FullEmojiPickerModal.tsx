import React from 'react';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import { MobileEmojiPanel, EmojiPickerWrapper } from '../../Chat.styles';
import { preserveKeyboardFocus } from '../../utils';

export interface FullEmojiPickerModalProps {
  isOpen: boolean;
  isMobileView: boolean;
  isDark: boolean;
  onClose: () => void;
  onEmojiSelect: (emojiData: EmojiClickData) => void;
  pickerRef?: React.RefObject<HTMLDivElement>;
}

export const FullEmojiPickerModal: React.FC<FullEmojiPickerModalProps> = ({
  isOpen,
  isMobileView,
  isDark,
  onClose,
  onEmojiSelect,
  pickerRef,
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 'var(--app-offset-top, 0px)',
          left: 0,
          right: 0,
          height: 'var(--app-height, 100dvh)',
          zIndex: 1199,
          background: 'rgba(0,0,0,0.3)',
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        onMouseDown={preserveKeyboardFocus}
      />
      {isMobileView ? (
        <MobileEmojiPanel style={{ zIndex: 1200 }}>
          <EmojiPicker
            onEmojiClick={onEmojiSelect}
            theme={isDark ? Theme.DARK : Theme.LIGHT}
            emojiStyle={EmojiStyle.NATIVE}
            autoFocusSearch={false}
            width="100%"
            lazyLoadEmojis={false}
          />
        </MobileEmojiPanel>
      ) : (
        <EmojiPickerWrapper
          ref={pickerRef}
          style={{
            position: 'fixed',
            bottom: 'calc(max(0px, 100dvh - var(--app-offset-top, 0px) - var(--app-height, 100dvh)) + 10px)',
            left: '50%',
            transform: 'translateX(-50%)',
            maxHeight: 'calc(var(--app-height, 100dvh) - 20px)',
            zIndex: 1200,
          }}
        >
          <EmojiPicker
            onEmojiClick={onEmojiSelect}
            theme={isDark ? Theme.DARK : Theme.LIGHT}
            emojiStyle={EmojiStyle.NATIVE}
            autoFocusSearch={false}
            lazyLoadEmojis={false}
          />
        </EmojiPickerWrapper>
      )}
    </>
  );
};
