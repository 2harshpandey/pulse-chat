import React from 'react';
import type { UserProfile } from '../UserContext';
import type { TypingIndicatorProps } from './types';
import {
  BouncingDots,
  TypingIndicatorContainer,
  SoundwaveBars,
  ActivityIconWrapper,
} from './ChatStyledComponents';

export const MicIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

export const PhotoIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

export const VideoIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m22 8-6 4 6 4V8Z" />
    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
  </svg>
);

export const DocIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="12" y2="12" />
    <line x1="15" y1="15" x2="12" y2="12" />
  </svg>
);

export const GifBadgeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="20" height="16" x="2" y="4" rx="3" />
    <path d="M7 10h2v4H7zM14 10h-2v4h2M12 12h1.5M17 10v4" />
  </svg>
);

export const FilmIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
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
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
  </svg>
);

interface PresenceGroup {
  key: string;
  users: UserProfile[];
  singular: string;
  plural: string;
  many: string;
  icon?: React.ReactNode;
  animation: React.ReactNode;
}

export const TypingIndicator = ({ onlineUsers, currentUserId }: TypingIndicatorProps) => {
  const activeUsers = onlineUsers.filter(
    (u) => u.userId !== currentUserId && (Boolean(u.activity) || u.isTyping)
  );

  if (activeUsers.length === 0) return null;

  const groups: PresenceGroup[] = [
    {
      key: 'sending_audio',
      users: activeUsers.filter((u) => u.activity === 'sending_audio'),
      singular: 'is sending audio...',
      plural: 'are sending audio...',
      many: 'Several people are sending audio...',
      icon: <MicIcon />,
      animation: (
        <SoundwaveBars aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </SoundwaveBars>
      ),
    },
    {
      key: 'sending_photo',
      users: activeUsers.filter((u) => u.activity === 'sending_photo'),
      singular: 'is sending a photo...',
      plural: 'are sending photos...',
      many: 'Several people are sending photos...',
      icon: <PhotoIcon />,
      animation: (
        <BouncingDots aria-hidden="true">
          <div />
          <div />
          <div />
        </BouncingDots>
      ),
    },
    {
      key: 'sending_video',
      users: activeUsers.filter((u) => u.activity === 'sending_video'),
      singular: 'is sending a video...',
      plural: 'are sending videos...',
      many: 'Several people are sending videos...',
      icon: <VideoIcon />,
      animation: (
        <BouncingDots aria-hidden="true">
          <div />
          <div />
          <div />
        </BouncingDots>
      ),
    },
    {
      key: 'sending_file',
      users: activeUsers.filter((u) => u.activity === 'sending_file' || u.activity === 'sending_media'),
      singular: 'is sending a file...',
      plural: 'are sending files...',
      many: 'Several people are sending files...',
      icon: <DocIcon />,
      animation: (
        <BouncingDots aria-hidden="true">
          <div />
          <div />
          <div />
        </BouncingDots>
      ),
    },
    {
      key: 'sending_gif',
      users: activeUsers.filter((u) => u.activity === 'sending_gif'),
      singular: 'is sending a GIF...',
      plural: 'are sending GIFs...',
      many: 'Several people are sending GIFs...',
      icon: <GifBadgeIcon />,
      animation: (
        <BouncingDots aria-hidden="true">
          <div />
          <div />
          <div />
        </BouncingDots>
      ),
    },
    {
      key: 'gif_selecting',
      users: activeUsers.filter((u) => u.activity === 'gif_selecting'),
      singular: 'is selecting a GIF...',
      plural: 'are selecting GIFs...',
      many: 'Several people are selecting GIFs...',
      icon: <GifBadgeIcon />,
      animation: (
        <BouncingDots aria-hidden="true">
          <div />
          <div />
          <div />
        </BouncingDots>
      ),
    },
    {
      key: 'typing',
      users: activeUsers.filter((u) => !u.activity || u.activity === 'typing'),
      singular: 'is typing...',
      plural: 'are typing...',
      many: 'Several people are typing...',
      icon: undefined,
      animation: (
        <BouncingDots aria-hidden="true">
          <div />
          <div />
          <div />
        </BouncingDots>
      ),
    },
  ];

  const activeGroups = groups.filter((g) => g.users.length > 0);
  if (activeGroups.length === 0) return null;

  const renderGroupText = (group: PresenceGroup) => {
    const { users, singular, plural, many } = group;
    if (users.length > 2) return many;
    if (users.length === 1) {
      return (
        <>
          <strong>{users[0].username}</strong> {singular}
        </>
      );
    }
    return (
      <>
        <strong>{users[0].username}</strong> and <strong>{users[1].username}</strong> {plural}
      </>
    );
  };

  return (
    <TypingIndicatorContainer aria-live="polite" aria-hidden={false}>
      {activeGroups.map((group, index) => (
        <React.Fragment key={group.key}>
          {index > 0 && <span className="typing-divider" aria-hidden="true">·</span>}
          <div className="typing-part">
            {group.icon && <ActivityIconWrapper aria-hidden="true">{group.icon}</ActivityIconWrapper>}
            <span>{renderGroupText(group)}</span>
            {group.animation}
          </div>
        </React.Fragment>
      ))}
    </TypingIndicatorContainer>
  );
};