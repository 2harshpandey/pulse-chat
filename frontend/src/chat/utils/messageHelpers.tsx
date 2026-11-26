// --- Message ID, Grouping, Emoji Wrapping & Edit/Delete Helpers ---

import React from 'react';
import type { Message } from '../types';

export const normalizeMessageId = (rawId: any): string => {
  if (rawId === null || rawId === undefined) return '';
  if (typeof rawId === 'string' || typeof rawId === 'number') return String(rawId);
  if (typeof rawId === 'object') {
    const nested = (rawId as any).id ?? (rawId as any)._id ?? (rawId as any).messageId;
    if (nested !== null && nested !== undefined) return String(nested);
  }
  return '';
};

export const getMessageElementId = (rawId: any): string => {
  const normalized = normalizeMessageId(rawId);
  if (!normalized) return '';
  return `message-${encodeURIComponent(normalized)}`;
};

export const normalizeOverlayText = (value: string): string => value.replace(/\u00A0/g, ' ');

export const isGroupStartMessage = (current: Message, prev?: Message | null): boolean => {
  if (!prev) return true;
  if (prev.type === 'system_notification') return true;
  if (prev.userId !== current.userId) return true;
  const currentTs = current.timestamp || current.createdAt;
  const prevTs = prev.timestamp || prev.createdAt;
  if (currentTs && prevTs) {
    const curDate = new Date(currentTs);
    const prevDate = new Date(prevTs);
    if (!isNaN(curDate.getTime()) && !isNaN(prevDate.getTime())) {
      if (curDate.toDateString() !== prevDate.toDateString()) {
        return true;
      }
    }
  }
  return false;
};

export const EMOJI_SEQUENCE_RE = /(?:\u{1F3F4}[\u{E0060}-\u{E007F}]+[\u{E007F}]|[\u{1F1E6}-\u{1F1FF}]{2}|(?:(?![\u00A9\u00AE\u2122](?!\uFE0F))\p{Extended_Pictographic})(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})*)*|[0-9#*]\uFE0F?\u20E3|\p{Emoji_Modifier})/gu;

export const wrapEmojis = (value: string, isStandalone: boolean = false): React.ReactNode[] => {
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(EMOJI_SEQUENCE_RE.source, EMOJI_SEQUENCE_RE.flags);
  while ((match = re.exec(value)) !== null) {
    if (match.index > lastIndex) {
      result.push(value.slice(lastIndex, match.index));
    }
    result.push(
      <span key={`emoji-${match.index}`} className={isStandalone ? 'emoji-standalone' : 'emoji-inline'}>{match[0]}</span>
    );
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) {
      re.lastIndex++;
    }
  }
  if (lastIndex < value.length) {
    result.push(value.slice(lastIndex));
  }
  return result;
};

export const findMessageElement = (rawId: any): HTMLElement | null => {
  const normalized = normalizeMessageId(rawId);
  if (!normalized) return null;

  const byId = document.getElementById(getMessageElementId(normalized)) as HTMLElement | null;
  if (byId) return byId;

  const byRawId = document.getElementById(normalized) as HTMLElement | null;
  if (byRawId) return byRawId;

  const byDataId = document.querySelector(
    `[data-message-id="${normalized}"], [data-mongo-id="${normalized}"], [data-client-temp-id="${normalized}"]`
  ) as HTMLElement | null;
  if (byDataId) return byDataId;

  const byGroup = document.querySelector(`[data-grouped-ids~="${normalized}"]`) as HTMLElement | null;
  if (byGroup) return byGroup;

  const byVirtualId = document.querySelector(`[data-virtual-id="${normalized}"]`) as HTMLElement | null;
  if (byVirtualId) return byVirtualId;

  return null;
};

export const resolveReplyTargetId = (replyingTo: any, sourceMessageId?: string): string => {
  const sourceId = normalizeMessageId(sourceMessageId);
  const candidates = [replyingTo?.id, replyingTo?.messageId, replyingTo?._id];
  const normalized = candidates.map((candidate) => normalizeMessageId(candidate)).filter(Boolean);
  if (normalized.length === 0) return '';
  const nonSelf = normalized.find((candidate) => !sourceId || candidate !== sourceId);
  return nonSelf || normalized[0];
};

const DELETED_FOR_ME_KEY = (userId: string) => `pulseDeletedForMe_${userId}`;

export function getDeletedForMeIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_FOR_ME_KEY(userId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function addDeletedForMeIds(userId: string, ids: string[]): void {
  try {
    const existing = getDeletedForMeIds(userId);
    ids.forEach(id => existing.add(id));
    localStorage.setItem(DELETED_FOR_ME_KEY(userId), JSON.stringify(Array.from(existing)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pulse:message_deleted', { detail: { ids } }));
    }
  } catch { /* storage full — ignore */ }
}

/**
 * Reconciles an optimistic uploading message and any pending replies referencing its tempId.
 */
export const reconcileUploadedMessageInList = (
  prev: Message[],
  matchId: string,
  finalMessage: Message
): Message[] =>
  prev.map((m) => {
    if (m.id === matchId) return finalMessage;
    if (m.replyingTo && m.replyingTo.id === matchId) {
      const isGroup = Boolean(m.replyingTo.isGroup || m.replyingTo.type === 'group');
      return {
        ...m,
        replyingTo: {
          ...m.replyingTo,
          id: finalMessage.id,
          url: isGroup ? undefined : (finalMessage.url || m.replyingTo.url),
          type: isGroup
            ? 'group'
            : (finalMessage.type !== 'system_notification' ? finalMessage.type : m.replyingTo.type),
        },
      };
    }
    return m;
  });

export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Checks whether a message can be edited by the given user right now.
 */
export function canEditMessage(
  msg: Message | null | undefined,
  userId: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!msg || !userId) return false;
  if (msg.isDeleted || msg.vanished || msg.isUploading || msg.uploadError) return false;
  if (msg.type === 'system_notification') return false;
  if (msg.userId !== userId) return false;
  if (typeof msg.text !== 'string' || !msg.text.trim()) return false;
  const sentAt = new Date(msg.timestamp).getTime();
  if (!Number.isFinite(sentAt)) return false;
  return nowMs - sentAt < MESSAGE_EDIT_WINDOW_MS;
}

/**
 * Finds the most recent editable message sent by the given user.
 */
export function findLastEditableSentMessage(
  messages: Message[] | null | undefined,
  userId: string | null | undefined,
  nowMs: number = Date.now()
): Message | null {
  if (!Array.isArray(messages) || !userId) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (canEditMessage(candidate, userId, nowMs)) {
      return candidate;
    }
  }
  return null;
}
