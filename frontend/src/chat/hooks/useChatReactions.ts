import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Message, ReactionsPopupData } from '../types';
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

      const applyReactionUpdate = (prevList: Message[]) =>
        prevList.map((m) => {
          if (m.id !== messageId) return m;
          const reactions: Record<string, { userId: string; username: string; isAlbum?: boolean }[]> = filterValidReactions(m.reactions);
          let previousEmoji: string | null = null;
          for (const [e, users] of Object.entries(reactions)) {
            if (Array.isArray(users)) {
              const idx = users.findIndex((r: any) => r.userId === userId && Boolean(r.isAlbum) === isAlbumReaction);
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
            const entry: any = { userId, username };
            if (isAlbumReaction) entry.isAlbum = true;
            reactions[canonicalEmoji].push(entry);
          }
          return { ...m, reactions };
        });

      setMessages((prev) => applyReactionUpdate(prev));

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
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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
