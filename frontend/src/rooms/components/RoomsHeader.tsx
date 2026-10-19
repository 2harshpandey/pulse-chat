import React from 'react';
import { Header, Title, Subtitle, HeaderActions, Button } from '../RoomsStyledComponents';

interface RoomsHeaderProps {
  onNavigateGlobal: () => void;
  onOpenJoinModal: () => void;
  onOpenCreateModal: () => void;
}

export const RoomsHeader: React.FC<RoomsHeaderProps> = ({
  onNavigateGlobal,
  onOpenJoinModal,
  onOpenCreateModal
}) => {
  return (
    <Header>
      <div>
        <Title>Explore Rooms</Title>
        <Subtitle>Join a public lounge or create your own secure space.</Subtitle>
      </div>
      <HeaderActions>
        <Button onClick={onNavigateGlobal}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          Global Chat
        </Button>
        <Button onClick={onOpenJoinModal}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" y1="12" x2="3" y2="12"></line>
          </svg>
          Join Room
        </Button>
        <Button $primary onClick={onOpenCreateModal}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Room
        </Button>
      </HeaderActions>
    </Header>
  );
};
