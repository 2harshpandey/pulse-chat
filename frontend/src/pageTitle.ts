import { useEffect } from 'react';

export const BASE_APP_TITLE = 'PulseChat';
export const HOME_PAGE_TITLE = 'PulseChat | Real-Time Multi-Room Chat Without Signup';

export function sanitizeTitleSegment(raw?: string | null, maxLength = 48): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export function formatPageTitle(section?: string | null): string {
  const cleanSection = sanitizeTitleSegment(section, 72);
  if (!cleanSection) return BASE_APP_TITLE;
  return `${cleanSection} | ${BASE_APP_TITLE}`;
}

export function getRoomDisplayLabel(
  roomId?: string | null,
  roomName?: string | null,
  isTempLink = false
): string {
  const cleanName = sanitizeTitleSegment(roomName, 40);
  if (cleanName) return cleanName;

  if (isTempLink) {
    return 'Invite Room';
  }

  const normalizedId = typeof roomId === 'string' ? roomId.trim().toLowerCase() : '';
  if (normalizedId === 'global') return 'Global Chat';
  if (normalizedId === 'me') return 'Private Room';

  const safeId = sanitizeTitleSegment(roomId, 32);
  if (safeId) return `Room ${safeId}`;
  return 'Chat Room';
}

export function useDocumentTitle(title: string, restoreOnUnmount = true): void {
  useEffect(() => {
    if (typeof document === 'undefined' || !title) return;
    document.title = title;
    return () => {
      if (restoreOnUnmount && document.title === title) {
        document.title = BASE_APP_TITLE;
      }
    };
  }, [title, restoreOnUnmount]);
}
