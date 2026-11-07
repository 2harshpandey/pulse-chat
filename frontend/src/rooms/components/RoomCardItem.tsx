import React from 'react';
import { Room } from '../types';
import {
  RoomCard,
  RoomHeader,
  RoomName,
  RoomBadge,
  CopyIcon,
  RoomDescription,
  RoomStats,
  Stat,
  JoinButton
} from '../RoomsStyledComponents';

interface RoomCardItemProps {
  room: Room;
  copiedId: string | null;
  onCopyId: (e: React.MouseEvent, id: string) => void;
  onJoin: (id: string) => void;
}

export const RoomCardItem: React.FC<RoomCardItemProps> = ({
  room,
  copiedId,
  onCopyId,
  onJoin
}) => {
  return (
    <RoomCard>
      <RoomHeader>
        <RoomName>
          {room.isPrivate ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          )}
          {room.name}
        </RoomName>
        <RoomBadge $private={room.isPrivate}>{room.isPrivate ? 'Private' : 'Public'}</RoomBadge>
      </RoomHeader>

      <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.65rem', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, flex: 1 }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500, flexShrink: 0 }}>Room ID:</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={room.id}>
              {room.id}
            </span>
          </div>
          <CopyIcon
            $copied={copiedId === room.id}
            title="Copy Room ID"
            aria-label="Copy Room ID"
            onClick={(e) => onCopyId(e, room.id)}
          >
            {copiedId === room.id ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </CopyIcon>
        </div>
        {room.description && (
          <RoomDescription>
            {room.description}
          </RoomDescription>
        )}
      </div>

      <RoomStats>
        <Stat>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          {room.onlineCount || 0} Online
        </Stat>
        <JoinButton onClick={() => onJoin(room.id)}>
          Join
        </JoinButton>
      </RoomStats>
    </RoomCard>
  );
};
