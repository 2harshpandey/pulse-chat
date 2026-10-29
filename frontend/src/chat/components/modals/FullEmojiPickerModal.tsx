import React from 'react';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import { MobileEmojiPanel, EmojiPickerWrapper } from '../../Chat.styles';

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
        style={{ position: 'fixed', inset: 0, zIndex: 1199, background: 'rgba(0,0,0,0.3)' }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
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
            bottom: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
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
