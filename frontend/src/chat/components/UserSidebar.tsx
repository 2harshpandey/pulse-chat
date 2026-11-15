import React, { useState, useEffect } from 'react';
import type { Message } from '../types';
import { copyTextToClipboard } from '../utils';
import { SideMediaGallery } from './SideMediaGallery';
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
  SidePanelTabBar,
  SidePanelTab,
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
  openMediaGallery?: (items: Message[], initialIndex?: number, options?: { autoPlayVideo?: boolean }) => void;
  openLightbox?: (url: string, canonicalUrl?: string) => void;
  loadedMediaMessageSet?: Set<string>;
  loadedMediaSrcById?: Record<string, string>;
}

export const UserSidebar: React.FC<UserSidebarProps> = ({
  isVisible,
  onClose,
  onlineUsers,
  currentUserId,
  roomId,
  onClearChat,
  onLogout,
  openMediaGallery,
  openLightbox,
  loadedMediaMessageSet,
  loadedMediaSrcById,
}) => {
  const [activeTab, setActiveTab] = useState<'online' | 'media'>('online');

  // Reset to Online tab whenever side panel is opened (including on mobile devices)
  useEffect(() => {
    if (isVisible) {
      setActiveTab('online');
    }
  }, [isVisible]);

  const currentUser = onlineUsers.find((user) => user.userId === currentUserId);
  const otherUsers = onlineUsers.filter((user) => user.userId !== currentUserId);
  const sortedUsers = currentUser ? [currentUser, ...otherUsers] : otherUsers;

  return (
    <>
      <SidebarBackdrop $isVisible={isVisible} onClick={onClose} />
      <StyledUserSidebar $isVisible={isVisible}>
        <SidePanelTabBar role="tablist" aria-label="Side panel view switch">
          <SidePanelTab
            type="button"
            role="tab"
            aria-selected={activeTab === 'online'}
            $active={activeTab === 'online'}
            onClick={() => setActiveTab('online')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Online</span>
          </SidePanelTab>
          <SidePanelTab
            type="button"
            role="tab"
            aria-selected={activeTab === 'media'}
            $active={activeTab === 'media'}
            onClick={() => setActiveTab('media')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Media</span>
          </SidePanelTab>
        </SidePanelTabBar>

        {activeTab === 'online' ? (
          <>
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
          </>
        ) : (
          <SideMediaGallery
            roomId={roomId}
            currentUserId={currentUserId}
            isActive={activeTab === 'media'}
            openMediaGallery={openMediaGallery}
            openLightbox={openLightbox}
            loadedMediaMessageSet={loadedMediaMessageSet}
            loadedMediaSrcById={loadedMediaSrcById}
          />
        )}

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

