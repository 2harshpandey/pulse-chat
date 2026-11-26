import type React from 'react';
import type { Message } from '../types';
import { INITIAL_FIRST_ITEM_INDEX } from '../constants';
import { isGroupStartMessage } from '../utils';

/**
 * Rebuilds the set of message IDs that begin a sender/date visual group.
 */
export function rebuildGroupStartIds(
  messages: Message[],
  groupStartMessageIdsRef: React.MutableRefObject<Set<string>>
): void {
  groupStartMessageIdsRef.current.clear();
  for (let i = 0; i < messages.length; i++) {
    const current = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    if (isGroupStartMessage(current, prev)) {
      groupStartMessageIdsRef.current.add(current.id);
    }
  }
}

export interface ResetMessageWindowParams {
  messages: Message[];
  oldestCursor: string | null;
  newestCursor: string | null;
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
  groupStartMessageIdsRef: React.MutableRefObject<Set<string>>;
  setFirstItemIndex: (valOrUpdater: number | ((prev: number) => number)) => void;
  firstItemIndexRef?: React.MutableRefObject<number>;
  messagesRef?: React.MutableRefObject<Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  mergeMessagesUpdater?: (prev: Message[]) => Message[];
  setOldestLoadedAt: (val: string | null) => void;
  oldestLoadedAtRef: React.MutableRefObject<string | null>;
  setNewestLoadedAt: (val: string | null) => void;
  newestLoadedAtRef: React.MutableRefObject<string | null>;
  setHasMoreOlderMessages: (val: boolean) => void;
  hasMoreOlderMessagesRef: React.MutableRefObject<boolean>;
  setHasMoreNewerMessages: (val: boolean) => void;
  hasMoreNewerMessagesRef: React.MutableRefObject<boolean>;
  setNewMessagesWhileScrolledUp?: React.Dispatch<React.SetStateAction<number>>;
  messageTailSnapshotRef?: React.MutableRefObject<{ length: number; lastId: string | null }>;
}

/**
 * Resets pagination cursors, virtualized index anchor, and group-start boundaries for a fresh message window.
 */
export function resetMessageWindow({
  messages,
  oldestCursor,
  newestCursor,
  hasMoreOlder,
  hasMoreNewer,
  groupStartMessageIdsRef,
  setFirstItemIndex,
  firstItemIndexRef,
  messagesRef,
  setMessages,
  mergeMessagesUpdater,
  setOldestLoadedAt,
  oldestLoadedAtRef,
  setNewestLoadedAt,
  newestLoadedAtRef,
  setHasMoreOlderMessages,
  hasMoreOlderMessagesRef,
  setHasMoreNewerMessages,
  hasMoreNewerMessagesRef,
  setNewMessagesWhileScrolledUp,
  messageTailSnapshotRef,
}: ResetMessageWindowParams): void {
  rebuildGroupStartIds(messages, groupStartMessageIdsRef);

  setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
  if (firstItemIndexRef) {
    firstItemIndexRef.current = INITIAL_FIRST_ITEM_INDEX;
  }

  if (mergeMessagesUpdater) {
    setMessages(mergeMessagesUpdater);
  } else {
    if (messagesRef) {
      messagesRef.current = messages;
    }
    setMessages(messages);
  }

  if (setNewMessagesWhileScrolledUp) {
    setNewMessagesWhileScrolledUp(0);
  }
  if (messageTailSnapshotRef) {
    messageTailSnapshotRef.current = {
      length: messages.length,
      lastId: messages.length > 0 ? messages[messages.length - 1].id : null,
    };
  }

  oldestLoadedAtRef.current = oldestCursor;
  setOldestLoadedAt(oldestCursor);

  newestLoadedAtRef.current = newestCursor;
  setNewestLoadedAt(newestCursor);

  setHasMoreOlderMessages(hasMoreOlder);
  hasMoreOlderMessagesRef.current = hasMoreOlder;

  setHasMoreNewerMessages(hasMoreNewer);
  hasMoreNewerMessagesRef.current = hasMoreNewer;
}
