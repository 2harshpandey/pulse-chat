import React from 'react';
import { extractRoomIdFromInput } from '../../rooms/utils';
import {
  ModalOverlay,
  ModalContent,
  FormGroup,
  Label,
  Input,
  InputWrapper,
  EyeButton,
  ErrorMessage,
  ModalActions,
  Button
} from '../HomeStyledComponents';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  adminRoomId: string;
  setAdminRoomId: (val: string) => void;
  adminPassword: string;
  setAdminPassword: (val: string) => void;
  isPasswordVisible: boolean;
  setIsPasswordVisible: (val: boolean) => void;
  adminError: string;
  setAdminError: (val: string) => void;
  isLoading: boolean;
  passwordInputRef: React.RefObject<HTMLInputElement>;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  adminRoomId,
  setAdminRoomId,
  adminPassword,
  setAdminPassword,
  isPasswordVisible,
  setIsPasswordVisible,
  adminError,
  setAdminError,
  isLoading,
  passwordInputRef
}) => {
  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={() => { onClose(); setAdminError(''); }}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 1.5rem', color: 'var(--text-heading)', fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
          Room Admin Login
        </h2>
        <form onSubmit={onSubmit}>
          <FormGroup>
            <Label>Room ID</Label>
            <Input
              type="text"
              placeholder="e.g. dev_lounge, global, or full link"
              value={adminRoomId}
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes('/') || val.includes(':')) {
                  setAdminRoomId(extractRoomIdFromInput(val));
                } else {
                  setAdminRoomId(val.replace(/[^a-zA-Z0-9._-]/g, ''));
                }
                if (adminError) setAdminError('');
              }}
              onPaste={(e) => {
                const pastedText = e.clipboardData.getData('text');
                if (pastedText && (pastedText.includes('/') || pastedText.includes(':'))) {
                  e.preventDefault();
                  setAdminRoomId(extractRoomIdFromInput(pastedText));
                  if (adminError) setAdminError('');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  passwordInputRef.current?.focus();
                }
              }}
              autoFocus={typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)')?.matches}
            />
          </FormGroup>
          <FormGroup>
            <Label>Admin Password</Label>
            <InputWrapper>
              <Input
                ref={passwordInputRef as any}
                type={isPasswordVisible ? 'text' : 'password'}
                placeholder="Enter admin password"
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  if (adminError) setAdminError('');
                }}
              />
              <EyeButton
                type="button"
                onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                title={isPasswordVisible ? 'Hide password' : 'Show password'}
              >
                {isPasswordVisible ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </EyeButton>
            </InputWrapper>
          </FormGroup>
          {adminError && <ErrorMessage>{adminError}</ErrorMessage>}
          <ModalActions>
            <Button type="button" onClick={() => { onClose(); setAdminError(''); }} disabled={isLoading}>Cancel</Button>
            <Button type="submit" $primary disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Continue to Admin'}
            </Button>
          </ModalActions>
        </form>
      </ModalContent>
    </ModalOverlay>
  );
};
