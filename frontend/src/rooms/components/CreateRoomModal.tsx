import React from 'react';
import { PasswordStrengthIndicator } from '../../components/PasswordStrengthIndicator';
import {
  ModalOverlay,
  ModalContent,
  FormGroup,
  Label,
  Input,
  InputWrapper,
  CheckboxLabel,
  PasswordToggle,
  ErrorMessageContainer,
  Button
} from '../RoomsStyledComponents';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLFormElement>) => void;
  roomName: string;
  setRoomName: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  customId: string;
  setCustomId: (val: string) => void;
  checkingId: boolean;
  idAvailable: boolean | null;
  isPrivate: boolean;
  setIsPrivate: (val: boolean) => void;
  joinPassword: string;
  setJoinPassword: (val: string) => void;
  adminPassword: string;
  setAdminPassword: (val: string) => void;
  showJoinPassword: boolean;
  setShowJoinPassword: (val: boolean) => void;
  showAdminPassword: boolean;
  setShowAdminPassword: (val: boolean) => void;
  formError: string;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onKeyDown,
  roomName,
  setRoomName,
  description,
  setDescription,
  customId,
  setCustomId,
  checkingId,
  idAvailable,
  isPrivate,
  setIsPrivate,
  joinPassword,
  setJoinPassword,
  adminPassword,
  setAdminPassword,
  showJoinPassword,
  setShowJoinPassword,
  showAdminPassword,
  setShowAdminPassword,
  formError
}) => {
  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-heading)', letterSpacing: '-0.01em' }}>
          Create New Room
        </h2>
        <form onSubmit={onSubmit} onKeyDown={onKeyDown}>
          <FormGroup>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <Label htmlFor="create-room-name" style={{ margin: 0 }}>Room Name</Label>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{roomName.length}/50</span>
            </div>
            <Input
              id="create-room-name"
              name="roomName"
              type="text"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="e.g. Developer Lounge"
              maxLength={50}
              autoFocus={!window.matchMedia('(pointer: coarse)').matches}
            />
          </FormGroup>

          <FormGroup>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <Label htmlFor="create-room-desc" style={{ margin: 0 }}>Description (Optional)</Label>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{description.length}/150</span>
            </div>
            <Input
              id="create-room-desc"
              name="roomDescription"
              as="textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this room about?"
              style={{ minHeight: '120px', resize: 'none' }}
              maxLength={150}
            />
          </FormGroup>

          <FormGroup>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <Label htmlFor="create-room-custom-id" style={{ margin: 0 }}>Room ID</Label>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{customId.length}/30</span>
            </div>
            <InputWrapper>
              <Input
                id="create-room-custom-id"
                name="customId"
                type="text"
                value={customId}
                onChange={e => setCustomId(e.target.value.replace(/[^a-zA-Z0-9._]/g, ''))}
                placeholder="e.g. dev_lounge (alphanumeric, dots, underscores)"
                maxLength={30}
              />
            </InputWrapper>
            {customId && (
              <div
                style={{
                  fontSize: '0.85rem',
                  marginTop: '0.5rem',
                  color: checkingId
                    ? 'var(--text-secondary)'
                    : idAvailable === true
                    ? 'var(--accent-green)'
                    : idAvailable === false
                    ? 'var(--accent-red)'
                    : 'var(--text-secondary)',
                }}
              >
                {checkingId
                  ? 'Checking availability...'
                  : idAvailable === true
                  ? '✓ ID is available'
                  : idAvailable === false
                  ? '✗ ID is taken'
                  : 'Unable to check availability'}
              </div>
            )}
          </FormGroup>

          <FormGroup>
            <CheckboxLabel htmlFor="create-room-is-private">
              <input
                id="create-room-is-private"
                name="isPrivate"
                type="checkbox"
                checked={isPrivate}
                onChange={e => setIsPrivate(e.target.checked)}
                style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
              />
              Private Room (Hidden from public list)
            </CheckboxLabel>
          </FormGroup>

          {isPrivate && (
            <FormGroup>
              <Label htmlFor="create-room-join-pw">Join Password (Optional)</Label>
              <InputWrapper>
                <Input
                  id="create-room-join-pw"
                  name="joinPassword"
                  type={showJoinPassword ? "text" : "password"}
                  value={joinPassword}
                  onChange={e => setJoinPassword(e.target.value)}
                  placeholder="Enter password for users to join"
                  autoComplete="new-password"
                  style={{ paddingRight: '2.5rem' }}
                />
                <PasswordToggle type="button" onClick={() => setShowJoinPassword(!showJoinPassword)} aria-label="Toggle password visibility">
                  {showJoinPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </PasswordToggle>
              </InputWrapper>
              <PasswordStrengthIndicator password={joinPassword} />
            </FormGroup>
          )}

          <FormGroup>
            <Label htmlFor="create-room-admin-pw">Admin Password</Label>
            <InputWrapper>
              <Input
                id="create-room-admin-pw"
                name="adminPassword"
                type={showAdminPassword ? "text" : "password"}
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="Password for room moderation"
                autoComplete="new-password"
                style={{ paddingRight: '2.5rem' }}
              />
              <PasswordToggle type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} aria-label="Toggle password visibility">
                {showAdminPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </PasswordToggle>
            </InputWrapper>
            <PasswordStrengthIndicator password={adminPassword} />
          </FormGroup>

          {formError && (
            <ErrorMessageContainer>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{formError}</span>
            </ErrorMessageContainer>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <Button type="button" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
              Cancel
            </Button>
            <Button $primary type="submit" style={{ flex: 1, justifyContent: 'center' }}>
              Create Room
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalOverlay>
  );
};
