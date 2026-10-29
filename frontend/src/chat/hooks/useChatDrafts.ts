import { useEffect, useRef } from 'react';
import type { UserProfile } from '../../UserContext';
import { MAX_MESSAGE_LENGTH, getInputDraftKey } from '../constants';

interface UseChatDraftsProps {
  userId: string;
  roomId?: string;
  userProfile: UserProfile | null | undefined;
  inputMessage: string;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
}

export function useChatDrafts({
  userId,
  roomId,
  userProfile,
  inputMessage,
  setInputMessage,
}: UseChatDraftsProps) {
  const currentRoomRef = useRef<string | undefined>(roomId);
  const loadedRoomRef = useRef<string | undefined>(undefined);
  const inputMessageRef = useRef<string>(inputMessage);
  inputMessageRef.current = inputMessage;

  // Flush pending draft for previous room immediately upon room or user transition
  useEffect(() => {
    return () => {
      if (userProfile && currentRoomRef.current) {
        try {
          const prevKey = getInputDraftKey(userId, currentRoomRef.current);
          const val = inputMessageRef.current;
          if (val) localStorage.setItem(prevKey, val);
          else localStorage.removeItem(prevKey);
        } catch (_) {}
      }
    };
  }, [userId, roomId, userProfile]);

  // Load draft on mount / room switch / user switch
  useEffect(() => {
    currentRoomRef.current = roomId;
    const draftKey = getInputDraftKey(userId, roomId);
    if (!userProfile) {
      setInputMessage('');
      loadedRoomRef.current = roomId;
      return;
    }
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        setInputMessage(savedDraft.slice(0, MAX_MESSAGE_LENGTH));
      } else {
        // Fallback: check legacy unnamespaced draft if present for backwards compatibility
        const legacyKey = getInputDraftKey(userId);
        const legacyDraft = legacyKey !== draftKey ? localStorage.getItem(legacyKey) : null;
        if (legacyDraft) {
          setInputMessage(legacyDraft.slice(0, MAX_MESSAGE_LENGTH));
          try {
            localStorage.removeItem(legacyKey);
            localStorage.setItem(draftKey, legacyDraft);
          } catch (_) {}
        } else {
          setInputMessage('');
        }
      }
    } catch (_) {}
    loadedRoomRef.current = roomId;
  }, [userId, roomId, userProfile, setInputMessage]);

  // Debounced auto-save draft to localStorage (guarded against stale cross-room writes)
  useEffect(() => {
    if (!userProfile || loadedRoomRef.current !== roomId) return;
    const timer = setTimeout(() => {
      try {
        const draftKey = getInputDraftKey(userId, roomId);
        if (inputMessage) localStorage.setItem(draftKey, inputMessage);
        else localStorage.removeItem(draftKey);
      } catch (_) {}
    }, 400);
    return () => clearTimeout(timer);
  }, [inputMessage, userId, roomId, userProfile]);
}

