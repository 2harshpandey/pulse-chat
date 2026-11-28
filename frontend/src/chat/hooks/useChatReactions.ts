import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Message, ReactionsPopupData } from '../types';
import type { UserProfile } from '../../UserContext';
import { normalizeReactionEmoji, computeToggledReactions } from '../constants';
import { normalizeMessageId } from '../utils';

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
    isAlbum?: boolean;
  } | null>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null!);
  const [reactionsPopup, setReactionsPopup] = useState<ReactionsPopupData | null>(null);
  const [fullEmojiPickerPosition, setFullEmojiPickerPosition] = useState<DOMRect | null>(null);
  const messageIdForFullEmojiPickerRef = useRef<{ messageId: string; isAlbum?: boolean } | null>(null);
  const scrollAtReactionPickerRef = useRef<number | null>(null);

  // Track scroll position for reaction picker to close if scrolled away
  useEffect(() => {
    if (reactionPickerData && chatContainerRef.current) {
      scrollAtReactionPickerRef.current = chatContainerRef.current.scrollTop;
    } else if (!reactionPickerData) {
      scrollAtReactionPickerRef.current = null;
    }
  }, [reactionPickerData, chatContainerRef]);

  // Close reaction picker when clicking anywhere else on the screen or pressing Escape
  useEffect(() => {
    if (!reactionPickerData) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore clicks inside the reaction picker itself
      if (reactionPickerRef.current && reactionPickerRef.current.contains(target)) {
        return;
      }

      // Ignore clicks on reaction trigger buttons
      if (target.closest?.('.react-action-button') || target.closest?.('[data-reaction-btn="true"]')) {
        return;
      }

      setReactionPickerData(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReactionPickerData(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [reactionPickerData]);

  const handleReact = useCallback(
    (messageId: string, emoji: string, isAlbum?: boolean) => {
      const canonicalEmoji = normalizeReactionEmoji(emoji);
      if (!canonicalEmoji || !ws.current || ws.current.readyState !== WebSocket.OPEN || !userProfile || !messageId) {
        return;
      }
      const username = userProfile?.username || '';
      const isAlbumReaction = Boolean(isAlbum);
      const targetId = normalizeMessageId(messageId);

      const applyReactionUpdate = (prevList: Message[]) =>
        prevList.map((m) => {
          const mId = normalizeMessageId(m.id);
          const mMongoId = (m as any)._id ? normalizeMessageId((m as any)._id) : '';
          if (mId !== targetId && mMongoId !== targetId) return m;
          const nextReactions = computeToggledReactions(m.reactions, {
            userId,
            username,
            emoji: canonicalEmoji,
            isAlbum: isAlbumReaction,
          });
          return nextReactions ? { ...m, reactions: nextReactions } : m;
        });

      setMessages((prev) => applyReactionUpdate(prev));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('pulse:message_updated', {
            detail: {
              roomId,
              toggleReaction: {
                messageId,
                userId,
                username,
                emoji: canonicalEmoji,
                isAlbum: isAlbumReaction,
              },
            },
          })
        );
      }

      try {
        ws.current.send(JSON.stringify({
          type: 'react',
          messageId,
          userId,
          emoji: canonicalEmoji,
          roomId,
          isAlbum: isAlbumReaction,
        }));
      } catch (e) {
        console.error('Failed to send reaction:', e);
      }
      setReactionPickerData(null);
    },
    [roomId, userId, userProfile, ws, setMessages]
  );

  const handleOpenReactionPicker = useCallback((
    messageId: string,
    rect: DOMRect,
    sender: 'me' | 'other',
    isAlbum?: boolean
  ) => {
    setReactionPickerData((prev) => {
      if (prev?.messageId === messageId && prev?.isAlbum === isAlbum) return null;
      return { messageId, rect, sender, isAlbum };
    });
  }, []);

  const handleOpenFullEmojiPicker = useCallback((rect: DOMRect, messageId: string, isAlbum?: boolean) => {
    setFullEmojiPickerPosition(rect);
    messageIdForFullEmojiPickerRef.current = { messageId, isAlbum };
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
