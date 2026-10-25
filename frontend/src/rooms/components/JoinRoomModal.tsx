import React from 'react';
import {
  ModalOverlay,
  ModalContent,
  FormGroup,
  Label,
  Input,
  InputWrapper,
  PasswordToggle,
  ErrorMessageContainer,
  Button
} from '../RoomsStyledComponents';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLFormElement>) => void;
  joinRoomId: string;
  setJoinRoomId: (val: string) => void;
  joinUsername: string;
  setJoinUsername: (val: string) => void;
  joinPasswordInput: string;
  setJoinPasswordInput: (val: string) => void;
  showJoinModalPw: boolean;
  setShowJoinModalPw: (val: boolean) => void;
  joinModalError: string;
  isJoining: boolean;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onKeyDown,
  joinRoomId,
  setJoinRoomId,
  joinUsername,
  setJoinUsername,
  joinPasswordInput,
  setJoinPasswordInput,
  showJoinModalPw,
  setShowJoinModalPw,
  joinModalError,
  isJoining
}) => {
  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 800 }}>Join Room</h2>
        <form onSubmit={onSubmit} onKeyDown={onKeyDown}>
          <FormGroup>
            <Label>Room ID</Label>
            <Input
              type="text"
              value={joinRoomId}
              onChange={e => {
                let val = e.target.value;
                if (val.includes('/room/')) {
                  val = val.split('/room/').pop()?.split('?')[0]?.split('#')[0] || val;
                } else if (val.endsWith('/me') || val.includes('/me?') || val.includes('/me#') || val === '/me') {
                  val = 'me';
                }
                setJoinRoomId(val.replace(/[^a-zA-Z0-9._]/g, ''));
              }}
              placeholder="e.g. dev_lounge or full link"
              autoFocus={typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)')?.matches}
            />
          </FormGroup>

          <FormGroup>
            <Label>Username</Label>
            <Input
              type="text"
              value={joinUsername}
              onChange={e => setJoinUsername(e.target.value)}
              placeholder="Enter your username"
              maxLength={30}
            />
          </FormGroup>

          <FormGroup>
            <Label>Password (if any)</Label>
            <InputWrapper>
              <Input
                type={showJoinModalPw ? "text" : "password"}
                value={joinPasswordInput}
                onChange={e => setJoinPasswordInput(e.target.value)}
                placeholder="Enter password if required"
                style={{ paddingRight: '2.5rem' }}
              />
              <PasswordToggle type="button" onClick={() => setShowJoinModalPw(!showJoinModalPw)} aria-label="Toggle password visibility">
                {showJoinModalPw ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </PasswordToggle>
            </InputWrapper>
          </FormGroup>

          {joinModalError && (
            <ErrorMessageContainer>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{joinModalError}</span>
            </ErrorMessageContainer>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <Button type="button" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
              Cancel
            </Button>
            <Button $primary type="submit" disabled={isJoining} style={{ flex: 1, justifyContent: 'center', opacity: isJoining ? 0.7 : 1 }}>
              {isJoining ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                  </svg>
                  Verifying...
                </>
              ) : (
                'Join Room'
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalOverlay>
  );
};
