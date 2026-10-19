import React, { useState } from 'react';
import { copyTextToClipboard } from '../utils';
import {
  SidebarBackdrop,
  UserSidebar as StyledUserSidebar,
  UserList,
  UserListItem,
  ClearChatButton,
  LogoutButton,
  PremiumCopyButton,
  PremiumCopyNumber,
  PremiumCopyLabel,
} from '../Chat.styles';

export function CopyIdButton() {
  const [isCopied, setIsCopied] = useState(false);
  const handleCopy = () => {
    void copyTextToClipboard('97652945978254').then((ok) => {
      if (ok) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
      }
    });
  };
  return (
    <PremiumCopyButton $copied={isCopied} onClick={handleCopy}>
      <PremiumCopyNumber>97652945978254</PremiumCopyNumber>
      <PremiumCopyLabel $copied={isCopied}>
        {isCopied ? (
          <>
            <svg viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </>
        )}
      </PremiumCopyLabel>
    </PremiumCopyButton>
  );
}

export interface UserSidebarProps {
  isVisible: boolean;
  onClose: () => void;
  onlineUsers: { userId: string; username: string }[];
  currentUserId: string;
  roomId: string;
  onClearChat: () => void;
  onLogout: () => void;
}

export const UserSidebar: React.FC<UserSidebarProps> = ({
  isVisible,
  onClose,
  onlineUsers,
  currentUserId,
  roomId,
  onClearChat,
  onLogout,
}) => {
  const currentUser = onlineUsers.find((user) => user.userId === currentUserId);
  const otherUsers = onlineUsers.filter((user) => user.userId !== currentUserId);
  const sortedUsers = currentUser ? [currentUser, ...otherUsers] : otherUsers;

  return (
    <>
      <SidebarBackdrop $isVisible={isVisible} onClick={onClose} />
      <StyledUserSidebar $isVisible={isVisible}>
        <h2>Online ({onlineUsers.length})</h2>
        <UserList>
          {sortedUsers.map((user, index) => (
            <UserListItem key={user.userId} index={index}>
              {user.username}
              {user.userId === currentUserId ? ' (You)' : ''}
            </UserListItem>
          ))}
        </UserList>

        {roomId === 'me' && <CopyIdButton />}

        <ClearChatButton onClick={onClearChat}>
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
            <path d="M21 9l-6-6H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z"></path>
            <path d="M15 3v6h6"></path>
            <path d="M9.5 12.5 14.5 17.5"></path>
            <path d="m14.5 12.5-5 5"></path>
          </svg>
          Clear Chat
        </ClearChatButton>

        <LogoutButton onClick={onLogout}>
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
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Logout
        </LogoutButton>
      </StyledUserSidebar>
    </>
  );
};
