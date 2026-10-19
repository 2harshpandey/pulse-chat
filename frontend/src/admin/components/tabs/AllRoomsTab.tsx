import React from 'react';
import type { AdminController } from '../../hooks';
import {
  ScrollContainer,
  EmptyState,
  TableWrapper,
  WideTable,
  StickyTh,
  Td,
  Badge,
  Button,
} from '../../AdminStyledComponents';

export interface AllRoomsTabProps {
  admin: AdminController;
}

export function AllRoomsTab({ admin }: AllRoomsTabProps) {
  const { globalRooms, isRoomsLoading, navigate, passwordRef } = admin;

  return (
    <ScrollContainer>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>All Chat Rooms</h2>
        <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Total: {globalRooms.length}</span>
      </div>
      {isRoomsLoading ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '5rem 2rem',
            background: 'var(--panel-bg)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ position: 'relative', width: '50px', height: '50px' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '3px solid var(--border-color)',
                opacity: 0.3,
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '3px solid transparent',
                borderTopColor: 'var(--primary-color)',
                animation: 'pulse-spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
              }}
            />
          </div>
          <span
            style={{
              marginTop: '1.5rem',
              color: 'var(--text-color)',
              fontWeight: 600,
              fontSize: '1.1rem',
              letterSpacing: '0.5px',
            }}
          >
            Fetching Rooms
          </span>
          <span style={{ marginTop: '0.5rem', color: 'var(--text-color)', opacity: 0.6, fontSize: '0.9rem' }}>
            Securely loading data...
          </span>
          <style>{`@keyframes pulse-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : globalRooms.length === 0 ? (
        <EmptyState>
          <span>No rooms created yet.</span>
        </EmptyState>
      ) : (
        <TableWrapper>
          <WideTable>
            <thead>
              <tr>
                <StickyTh>Name</StickyTh>
                <StickyTh>Room ID (Alias)</StickyTh>
                <StickyTh>Status</StickyTh>
                <StickyTh>Created</StickyTh>
                <StickyTh style={{ textAlign: 'right' }}>Actions</StickyTh>
              </tr>
            </thead>
            <tbody>
              {globalRooms.map((room) => (
                <tr key={room._id}>
                  <Td>
                    <strong style={{ display: 'block', fontSize: '1.05rem', color: 'var(--text-color)' }}>
                      {room.name || 'Unnamed Room'}
                    </strong>
                  </Td>
                  <Td>
                    <code
                      style={{
                        background: 'var(--bg-color)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                      }}
                    >
                      {room.alias || room.id}
                    </code>
                  </Td>
                  <Td>
                    {room.hasJoinPassword ? (
                      <Badge $color="purple">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          width="12"
                          height="12"
                          style={{ marginRight: '4px' }}
                        >
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Private
                      </Badge>
                    ) : (
                      <Badge $color="green">Public</Badge>
                    )}
                  </Td>
                  <Td style={{ color: '#64748b', fontSize: '0.9rem' }}>
                    {new Date(room.createdAt).toLocaleDateString()}
                  </Td>
                  <Td style={{ textAlign: 'right' }}>
                    <Button
                      onClick={() => {
                        navigate(`/admin/${room.id}`, {
                          state: { autoLoginPassword: passwordRef.current, isImpersonating: true },
                        });
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.85rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                      }}
                    >
                      Manage Room
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </WideTable>
        </TableWrapper>
      )}
    </ScrollContainer>
  );
}
