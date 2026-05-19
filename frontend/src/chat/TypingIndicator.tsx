import React from 'react';
import type { UserProfile } from '../UserContext';
import type { TypingIndicatorProps } from './types';
import { BouncingDots, TypingIndicatorContainer } from './ChatStyledComponents';

export const TypingIndicator = ({ onlineUsers, currentUserId }: TypingIndicatorProps) => {
  const activeUsers = onlineUsers.filter(
    (u) => u.userId !== currentUserId && (u.activity === 'gif_selecting' || u.isTyping)
  );

  if (activeUsers.length === 0) return null;

  const gifSelectors = activeUsers.filter((u) => u.activity === 'gif_selecting');
  const typers = activeUsers.filter((u) => u.activity !== 'gif_selecting' && u.isTyping);

  const formatPresence = (
    users: UserProfile[],
    singular: string,
    plural: string,
    many: string
  ): string | null => {
    if (users.length === 0) return null;
    if (users.length > 2) return many;
    const names = users.map((u) => u.username).join(', ');
    return users.length === 1 ? `${names} ${singular}` : `${names} ${plural}`;
  };

  const parts = [
    formatPresence(gifSelectors, 'is selecting a GIF', 'are selecting GIFs', 'Several people are selecting GIFs'),
    formatPresence(typers, 'is typing', 'are typing', 'Several people are typing'),
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return null;

  return (
    <TypingIndicatorContainer aria-hidden={false}>
      <span>{parts.join(' | ')}</span>
      <BouncingDots>
        <div></div>
        <div></div>
        <div></div>
      </BouncingDots>
    </TypingIndicatorContainer>
  );
};

export const FilmIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <line x1="2" y1="7" x2="7" y2="7"></line>
    <line x1="2" y1="17" x2="7" y2="17"></line>
    <line x1="17" y1="17" x2="22" y2="17"></line>
    <line x1="17" y1="7" x2="22" y2="7"></line>
  </svg>
);

export const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
  </svg>
);