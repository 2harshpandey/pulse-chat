import React from 'react';
import type { AdminController } from '../../hooks';
import { PasswordStrengthIndicator } from '../../../components/PasswordStrengthIndicator';
import {
  ScrollContainer,
  Input,
  TextArea,
  Button,
} from '../../AdminStyledComponents';

export interface RoomSettingsTabProps {
  admin: AdminController;
}

export function RoomSettingsTab({ admin }: RoomSettingsTabProps) {
  const {
    roomSettingsName,
    setRoomSettingsName,
    roomSettingsDesc,
    setRoomSettingsDesc,
    handleSaveRoomDetails,
    roomSettingsLoading,
    roomSettingsAlias,
    roomSettingsLastIdChange,
    roomSettingsNewId,
    setRoomSettingsNewId,
    handleSaveRoomId,
    roomIdSuccess,
    roomIdError,
    roomSettingsCurrentPassword,
    setRoomSettingsCurrentPassword,
    roomSettingsNewPassword,
    setRoomSettingsNewPassword,
    roomSettingsConfirmPassword,
    setRoomSettingsConfirmPassword,
    handleChangeJoinPassword,
    roomSettingsHasJoinPassword,
    handleRemoveJoinPassword,
    roomSettingsSuccess,
    roomSettingsError,
  } = admin;

  return (
    <ScrollContainer>
      <div style={{ marginBottom: '2rem' }}>
        <h2>Room Details</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Update the public information about your room.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px' }}>
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
                maxWidth: '300px',
              }}
            >
              <label style={{ fontWeight: 600 }}>Room Name</label>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{roomSettingsName.length}/50</span>
            </div>
            <Input
              type="text"
              value={roomSettingsName}
              onChange={(e) => setRoomSettingsName(e.target.value)}
              placeholder="e.g. Chill Lounge"
              maxLength={50}
            />
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <label style={{ fontWeight: 600 }}>Room Description</label>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{roomSettingsDesc.length}/200</span>
            </div>
            <TextArea
              rows={3}
              value={roomSettingsDesc}
              onChange={(e) => setRoomSettingsDesc(e.target.value)}
              placeholder="What is this room about?"
              maxLength={200}
            />
          </div>
          <Button style={{ maxWidth: '300px' }} onClick={handleSaveRoomDetails} disabled={roomSettingsLoading}>
            {roomSettingsLoading ? 'Saving...' : 'Save Room Details'}
          </Button>
        </div>
      </div>

      <div style={{ marginTop: '3rem', marginBottom: '2rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 20, height: 20, color: '#3b82f6' }}
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          Custom Room ID (URL Alias)
        </h3>
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ color: '#cbd5e1', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
            Customize your room link! Changing this will make your room accessible via a unique URL.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'flex-start',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 18, height: 18, color: '#3b82f6', flexShrink: 0, marginTop: '2px' }}
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5 }}>
              <span style={{ color: '#60a5fa', fontWeight: 600 }}>Important: </span>
              Your room's permanent original ID will always work as a fallback. However, if you change your custom Room
              ID, anyone using your old custom ID link won't be able to join anymore.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px' }}>
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <label style={{ fontWeight: 600 }}>Custom Room ID</label>
              {roomSettingsAlias && (
                <span style={{ fontSize: '0.8rem', color: '#10b981' }}>Current ID: {roomSettingsAlias}</span>
              )}
            </div>
            {roomSettingsLastIdChange && (
              <small style={{ color: '#94a3b8', display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                Last changed on: {new Date(roomSettingsLastIdChange).toLocaleDateString()}
              </small>
            )}
            <Input
              type="text"
              value={roomSettingsNewId}
              onChange={(e) => setRoomSettingsNewId(e.target.value.replace(/[^a-zA-Z0-9._]/g, ''))}
              placeholder="e.g. my-cool-room"
              maxLength={30}
            />
            <small style={{ color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
              Letters, numbers, dots, and underscores only. 1-30 chars.
            </small>
          </div>
          <Button style={{ maxWidth: '300px' }} onClick={handleSaveRoomId} disabled={roomSettingsLoading}>
            {roomSettingsLoading ? 'Saving...' : 'Save Room ID'}
          </Button>

          {(roomIdSuccess || roomIdError) && (
            <div
              style={{
                padding: '1rem',
                borderRadius: '8px',
                background: roomIdError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                color: roomIdError ? '#ef4444' : '#22c55e',
                border: `1px solid ${roomIdError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.9rem',
                maxWidth: '400px',
              }}
            >
              {roomIdError ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              )}
              <span style={{ fontWeight: 500, lineHeight: 1.4 }}>{roomIdError || roomIdSuccess}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '3rem', marginBottom: '2rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 20, height: 20, color: '#3b82f6' }}
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Change Join Password
        </h3>
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ color: '#cbd5e1', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
            Change the password required for regular users to join this chat room.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'flex-start',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 18, height: 18, color: '#3b82f6', flexShrink: 0, marginTop: '2px' }}
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5 }}>
              <span style={{ color: '#60a5fa', fontWeight: 600 }}>Note: </span>
              If there is no current password, leave the current password field blank. Adding a join password to a
              public chat room will automatically make it a private chat room.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '300px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Current Join Password</label>
            <Input
              type="password"
              value={roomSettingsCurrentPassword}
              onChange={(e) => setRoomSettingsCurrentPassword(e.target.value)}
              placeholder="Enter current join password"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>New Join Password</label>
            <Input
              type="password"
              value={roomSettingsNewPassword}
              onChange={(e) => setRoomSettingsNewPassword(e.target.value)}
              placeholder="Enter new join password"
            />
            <PasswordStrengthIndicator password={roomSettingsNewPassword} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Confirm New Password</label>
            <Input
              type="password"
              value={roomSettingsConfirmPassword}
              onChange={(e) => setRoomSettingsConfirmPassword(e.target.value)}
              placeholder="Re-enter new join password"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button onClick={handleChangeJoinPassword} disabled={roomSettingsLoading} style={{ flex: 1 }}>
              {roomSettingsLoading ? 'Saving...' : 'Change Join Password'}
            </Button>

            {roomSettingsHasJoinPassword && (
              <button
                onClick={handleRemoveJoinPassword}
                disabled={roomSettingsLoading}
                title="Remove password and make room public"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  padding: '0.4rem 1.25rem',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontWeight: 600,
                  cursor: roomSettingsLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: roomSettingsLoading ? 0.5 : 1,
                }}
                onMouseOver={(e) => {
                  if (!roomSettingsLoading) {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!roomSettingsLoading) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                  }
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                  <span style={{ lineHeight: 1.1 }}>Remove Password</span>
                  <span style={{ fontSize: '0.65rem', opacity: 0.8, fontWeight: 500, marginTop: '0.15rem' }}>
                    Makes room public
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {(roomSettingsSuccess || roomSettingsError) && (
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: '8px',
            background: roomSettingsError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            color: roomSettingsError ? '#ef4444' : '#22c55e',
            border: `1px solid ${roomSettingsError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.9rem',
            maxWidth: '400px',
          }}
        >
          {roomSettingsError ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 18, height: 18, flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 18, height: 18, flexShrink: 0 }}
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          )}
          <span style={{ fontWeight: 500, lineHeight: 1.4 }}>{roomSettingsError || roomSettingsSuccess}</span>
        </div>
      )}
    </ScrollContainer>
  );
}
