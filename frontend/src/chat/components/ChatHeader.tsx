import React from 'react';
import {
  Header,
  HeaderTitle,
  HeaderActionsGroup,
  SoundToggleButton,
  SoundToggleIcon,
  ThemeToggleBtn,
  SearchPlaceholder,
  ChatSearchContainer,
  ChatSearchButton,
  ChatSearchInput,
  MobileUserListToggle,
} from '../Chat.styles';

export interface ChatHeaderProps {
  isConnected: boolean;
  isBrowserOnline: boolean;
  isSoundEnabled: boolean;
  isSoundToggleAnimating: boolean;
  onToggleSound: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isSearchActive: boolean;
  isSearchClosing: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onOpenSearch: () => void;
  onCloseSearch: (e: React.MouseEvent) => void;
  isUserListVisible: boolean;
  onToggleUserList: () => void;
  onHeaderButtonPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isConnected,
  isBrowserOnline,
  isSoundEnabled,
  isSoundToggleAnimating,
  onToggleSound,
  isDark,
  onToggleTheme,
  isSearchActive,
  isSearchClosing,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  onOpenSearch,
  onCloseSearch,
  isUserListVisible,
  onToggleUserList,
  onHeaderButtonPointerDown,
}) => {
  return (
    <Header>
      <HeaderTitle style={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <a href="/">
          <img src="/pulse_logo.webp" alt="Pulse Chat" style={{ flexShrink: 0 }} />
          <span style={{ flexShrink: 0 }}>Pulse</span> <span className="hide-on-narrow">Chat</span>
        </a>
        {(!isConnected || !isBrowserOnline) && (
          <div
            title="Offline"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              boxShadow: '0 0 8px 1px rgba(239,68,68,0.7)',
              flexShrink: 0,
              marginTop: '0.2rem',
            }}
          />
        )}
      </HeaderTitle>

      <HeaderActionsGroup>
        <SoundToggleButton
          type="button"
          $enabled={isSoundEnabled}
          onPointerDown={onHeaderButtonPointerDown}
          onClick={onToggleSound}
          aria-pressed={isSoundEnabled}
          aria-label={isSoundEnabled ? 'Disable notification sounds' : 'Enable notification sounds'}
          title={isSoundEnabled ? 'Notification sounds on' : 'Notification sounds off'}
        >
          <SoundToggleIcon
            $enabled={isSoundEnabled}
            $animate={isSoundToggleAnimating}
            viewBox="0 0 32 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <defs>
              <linearGradient id="soundGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
            <path className="speaker-core" d="M6 13h6l6-5v16l-6-5H6z" fill="url(#soundGradient)" stroke="url(#soundGradient)" />
            <path className="speaker-wave" d="M22 12c2 2 2 6 0 8" stroke="url(#soundGradient)" />
            <path className="speaker-wave" d="M25 9c3.5 3.5 3.5 10.5 0 14" stroke="url(#soundGradient)" />
            <path className="speaker-muted" d="M21 12l7 7" stroke="url(#soundGradient)" />
            <path className="speaker-muted" d="M28 12l-7 7" stroke="url(#soundGradient)" />
          </SoundToggleIcon>
        </SoundToggleButton>

        <ThemeToggleBtn
          onPointerDown={onHeaderButtonPointerDown}
          onClick={onToggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </ThemeToggleBtn>

        <SearchPlaceholder />

        <ChatSearchContainer id="chat-search-container" $active={isSearchActive} $isClosing={isSearchClosing}>
          <ChatSearchButton onClick={onOpenSearch} style={{ cursor: 'pointer' }} aria-label="Search messages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </ChatSearchButton>

          <ChatSearchInput
            id="chat-search-input"
            $active={isSearchActive}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search..."
          />

          <ChatSearchButton
            onClick={onCloseSearch}
            tabIndex={isSearchActive ? 0 : -1}
            aria-hidden={!isSearchActive}
            title="Close search"
            aria-label="Close search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </ChatSearchButton>
        </ChatSearchContainer>

        <MobileUserListToggle
          $isOpen={isUserListVisible}
          onPointerDown={onHeaderButtonPointerDown}
          onClick={onToggleUserList}
          aria-label={isUserListVisible ? 'Hide online users' : 'Show online users'}
          title={isUserListVisible ? 'Hide online users' : 'Show online users'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </MobileUserListToggle>
      </HeaderActionsGroup>
    </Header>
  );
};
