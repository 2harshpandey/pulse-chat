import { useEffect } from 'react';
import type { UserProfile } from '../../UserContext';
import { MAX_MESSAGE_LENGTH, getInputDraftKey } from '../constants';

interface UseChatDraftsProps {
  userId: string;
  userProfile: UserProfile | null | undefined;
  inputMessage: string;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
}

export function useChatDrafts({
  userId,
  userProfile,
  inputMessage,
  setInputMessage,
}: UseChatDraftsProps) {
  // Load draft on mount / user switch
  useEffect(() => {
    const draftKey = getInputDraftKey(userId);
    if (!userProfile) {
      setInputMessage('');
      return;
    }
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) setInputMessage(savedDraft.slice(0, MAX_MESSAGE_LENGTH));
    } catch (_) {}
  }, [userId, userProfile, setInputMessage]);

  // Debounced auto-save draft to localStorage
  useEffect(() => {
    if (!userProfile) return;
    const timer = setTimeout(() => {
      try {
        const draftKey = getInputDraftKey(userId);
        if (inputMessage) localStorage.setItem(draftKey, inputMessage);
        else localStorage.removeItem(draftKey);
      } catch (_) {}
    }, 400);
    return () => clearTimeout(timer);
  }, [inputMessage, userId, userProfile]);
}
