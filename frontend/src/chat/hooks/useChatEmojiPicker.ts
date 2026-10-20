import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { EmojiClickData } from 'emoji-picker-react';

interface UseChatEmojiPickerProps {
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function useChatEmojiPicker({
  setInputMessage,
  messageInputRef,
}: UseChatEmojiPickerProps) {
  const emojiButtonRef = useRef<HTMLButtonElement>(null!);
  const emojiPickerRef = useRef<HTMLDivElement>(null!);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<DOMRect | null>(null);

  const keyboardWasOpenBeforeEmojiRef = useRef<boolean>(false);
  const restoreKeyboardAfterEmojiCloseRef = useRef<boolean>(false);

  const closeEmojiPicker = useCallback((restoreKeyboard: boolean = false) => {
    setEmojiPickerPosition((prev) => {
      if (!prev) return prev;
      restoreKeyboardAfterEmojiCloseRef.current =
        restoreKeyboard && keyboardWasOpenBeforeEmojiRef.current;
      if (!restoreKeyboardAfterEmojiCloseRef.current) {
        keyboardWasOpenBeforeEmojiRef.current = false;
      }
      return null;
    });
  }, []);

  const handleOpenEmojiPicker = useCallback((rect: DOMRect) => {
    setEmojiPickerPosition((prev) => {
      if (prev) {
        restoreKeyboardAfterEmojiCloseRef.current = false;
        keyboardWasOpenBeforeEmojiRef.current = false;
        return null;
      }
      return rect;
    });
  }, []);

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    setInputMessage((prev) => prev + emojiData.emoji);
  }, [setInputMessage]);

  // Restore keyboard focus when emoji picker is closed
  useEffect(() => {
    if (emojiPickerPosition) return;
    if (restoreKeyboardAfterEmojiCloseRef.current) {
      restoreKeyboardAfterEmojiCloseRef.current = false;
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
        keyboardWasOpenBeforeEmojiRef.current = false;
      });
      return;
    }
    keyboardWasOpenBeforeEmojiRef.current = false;
  }, [emojiPickerPosition, messageInputRef]);

  return {
    emojiPickerPosition,
    setEmojiPickerPosition,
    emojiPickerRef,
    emojiButtonRef,
    keyboardWasOpenBeforeEmojiRef,
    closeEmojiPicker,
    handleOpenEmojiPicker,
    handleEmojiClick,
  };
}
