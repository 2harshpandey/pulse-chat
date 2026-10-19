import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Message } from '../types';
import type { UserProfile } from '../../UserContext';
import { normalizeReactionEmoji, filterValidReactions } from '../constants';

interface UseChatReactionsProps {
  userId: string;
  userProfile: UserProfile | null | undefined;
  roomId: string;
  ws: React.MutableRefObject<WebSocket | null>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function useChatReactions({
  userId,
  userProfile,
  roomId,
  ws,
  setMessages,
  chatContainerRef,
}: UseChatReactionsProps) {
  const [reactionPickerData, setReactionPickerData] = useState<{
    messageId: string;
    rect: DOMRect;
    sender: 'me' | 'other';
  } | null>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null!);
  const [reactionsPopup, setReactionsPopup] = useState<{
    messageId: string;
    reactions: { [emoji: string]: { userId: string; username: string }[] };
    rect: DOMRect;
  } | null>(null);
  const [fullEmojiPickerPosition, setFullEmojiPickerPosition] = useState<DOMRect | null>(null);
  const messageIdForFullEmojiPickerRef = useRef<string | null>(null);
  const scrollAtReactionPickerRef = useRef<number | null>(null);

  // Track scroll position for reaction picker to close if scrolled away
  useEffect(() => {
    if (reactionPickerData && chatContainerRef.current) {
      scrollAtReactionPickerRef.current = chatContainerRef.current.scrollTop;
    } else if (!reactionPickerData) {
      scrollAtReactionPickerRef.current = null;
    }
  }, [reactionPickerData, chatContainerRef]);

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      const canonicalEmoji = normalizeReactionEmoji(emoji);
      if (!canonicalEmoji || !ws.current || ws.current.readyState !== WebSocket.OPEN || !userProfile || !messageId) {
        return;
      }
      const username = userProfile?.username || '';

      const applyReactionUpdate = (prevList: Message[]) =>
        prevList.map((m) => {
          if (m.id !== messageId) return m;
          const reactions: Record<string, { userId: string; username: string }[]> = filterValidReactions(m.reactions);
          let previousEmoji: string | null = null;
          for (const [e, users] of Object.entries(reactions)) {
            if (Array.isArray(users)) {
              const idx = users.findIndex((r: any) => r.userId === userId);
              if (idx > -1) {
                previousEmoji = e;
                users.splice(idx, 1);
                if (users.length === 0) delete reactions[e];
                break;
              }
            }
          }
          if (previousEmoji !== canonicalEmoji) {
            if (!Array.isArray(reactions[canonicalEmoji])) reactions[canonicalEmoji] = [];
            reactions[canonicalEmoji].push({ userId, username });
          }
          return { ...m, reactions };
        });

      setMessages((prev) => applyReactionUpdate(prev));

      try {
        ws.current.send(JSON.stringify({ type: 'react', messageId, userId, emoji: canonicalEmoji, roomId }));
      } catch (e) {
        console.error('Failed to send reaction:', e);
      }
      setReactionPickerData(null);
    },
    [roomId, userId, userProfile, ws, setMessages]
  );

  const handleOpenReactionPicker = useCallback((messageId: string, rect: DOMRect, sender: 'me' | 'other') => {
    setReactionPickerData((prev) => {
      if (prev?.messageId === messageId) return null;
      return { messageId, rect, sender };
    });
  }, []);

  const handleOpenFullEmojiPicker = useCallback((rect: DOMRect, messageId: string) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFullEmojiPickerPosition(rect);
    messageIdForFullEmojiPickerRef.current = messageId;
    setReactionPickerData(null);
  }, []);

  return {
    reactionPickerData,
    setReactionPickerData,
    reactionPickerRef,
    reactionsPopup,
    setReactionsPopup,
    fullEmojiPickerPosition,
    setFullEmojiPickerPosition,
    messageIdForFullEmojiPickerRef,
    scrollAtReactionPickerRef,
    handleReact,
    handleOpenReactionPicker,
    handleOpenFullEmojiPicker,
  };
}
