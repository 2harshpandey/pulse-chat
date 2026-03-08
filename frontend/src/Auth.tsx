import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { UserProfile } from './UserContext'; // Import the full profile type

// --- UTILITY ---
const getUserId = (): string => {
  let userId = localStorage.getItem('pulseUserId');
  if (!userId) {
    // Use crypto.getRandomValues() for a cryptographically secure user ID.
    const array = new Uint32Array(3);
    window.crypto.getRandomValues(array);
    userId = Date.now().toString(36) + Array.from(array, n => n.toString(36)).join('');
    localStorage.setItem('pulseUserId', userId);
  }
  return userId;
};

// --- Device Fingerprint Collection ---
const collectFingerprint = () => ({
  screenResolution: `${window.screen.width}x${window.screen.height}`,
  platform: navigator.platform || '',
  language: navigator.language || '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
});

// --- ANIMATIONS ---
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
`;

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); }
`;

// --- STYLED COMPONENTS ---
const AuthContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background-color: #e2e8f0;
`;
const AuthBox = styled.div<{ $hasError?: boolean }>`
  background: white;
  padding: 2.5rem;
  border-radius: 1rem;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
  width: 100%;
  max-width: 400px;
  text-align: center;
  animation: ${fadeIn} 0.4s ease-out, ${props => props.$hasError ? shake : 'none'} 0.4s ease;
`;

const PasswordInputWrapper = styled.div`
  position: relative;
  width: 100%;
  margin-bottom: 1rem;
`;

const EyeIconButton = styled.button`
  position: absolute;
  top: 50%;
  right: 0.25rem;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  
  &:hover {
    color: #4a5568;
  }
`;

const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: bold;
  color: #1e293b;
  margin-bottom: 1.5rem;
`;

const Subtitle = styled.p`
  font-size: 0.9rem;
  color: #64748b;
  margin-bottom: 1.5rem;
  line-height: 1.4;
`;

const TempLinkBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  margin-bottom: 1.25rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #dbeafe, #e0e7ff);
  color: #3730a3;
  font-size: 0.8rem;
  font-weight: 600;
  animation: ${pulse} 2s ease-in-out infinite;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.5rem;
  font-size: 1rem;
  margin-bottom: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  &:focus {
    outline: none;
    border-color: #4F46E5;
    box-shadow: 0 0 0 2px #c7d2fe;
  }
`;

const PasswordInput = styled(Input)`
  padding-right: 3rem; /* Make space for the icon */
  margin-bottom: 0;
`;

const Button = styled.button`
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 0.5rem;
  background-color: #4F46E5;
  color: white;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.2s;
  &:hover {
    background-color: #4338CA;
    transform: scale(1.02);
  }
  &:disabled {
    background-color: #9ca3af;
    cursor: not-allowed;
    transform: none;
  }
`;
const ErrorMessage = styled.p<{ $visible?: boolean }>`
  color: #DC2626;
  margin-top: 1rem;
  font-size: 0.9rem;
  animation: ${fadeIn} 0.3s ease-out;
`;


// --- COMPONENT ---
interface AuthProps {
  onAuthSuccess: (profile: UserProfile) => void;
  tempToken?: string | null;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess, tempToken }) => {
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [username, setUsername] = useState(() => localStorage.getItem('pulseUsername') || '');
  const [error, setError] = useState(() => {
    const pending = sessionStorage.getItem('authError');
    if (pending) { sessionStorage.removeItem('authError'); return pending; }
    return '';
  });
  const [isLoading, setIsLoading] = useState(false);

  const isTempLink = !!tempToken;

  const handleLogin = async () => {
    if (!isTempLink && !password) {
      setError('Please enter a password.');
      return;
    }
    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }
    if (username.length > 30) {
      setError('Username cannot exceed 30 characters.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const apiBase = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
      const fingerprint = collectFingerprint();

      if (isTempLink) {
        // Temp link login - no password required
        const url = `${apiBase}/api/auth/verify-temp`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tempToken, username: username.trim(), userId: getUserId(), fingerprint }),
        });
        if (response.ok) {
          localStorage.setItem('pulseUsername', username.trim());
          onAuthSuccess({ userId: getUserId(), username: username.trim() });
        } else {
          const data = await response.json().catch(() => ({}));
          setError(data.error || 'This link is invalid or has expired.');
        }
      } else {
        // Normal login with password
        const url = `${apiBase}/api/auth/verify`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, username: username.trim(), userId: getUserId(), fingerprint }),
        });
        if (response.ok) {
          localStorage.setItem('pulseUsername', username.trim());
          onAuthSuccess({ userId: getUserId(), username: username.trim() });
        } else {
          const data = await response.json().catch(() => ({}));
          if (response.status === 409) {
            setError(data.error || 'That username is already in use. Please choose a different one.');
          } else if (response.status === 403) {
            setError(data.error || 'Access denied.');
          } else {
            setError('Incorrect password.');
          }
        }
      }
    } catch {
      setError('Could not connect to the server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContainer>
      <AuthBox $hasError={!!error}>
        <Title>{isTempLink ? 'You\'re Invited!' : 'Join Pulse'}</Title>
        {isTempLink && (
          <>
            <TempLinkBadge>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Invite Link
            </TempLinkBadge>
            <Subtitle>You've been invited to join the chat. Just enter a username to get started — no password needed!</Subtitle>
          </>
        )}
        <Input
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          maxLength={30}
          autoFocus
        />
        {!isTempLink && (
          <PasswordInputWrapper>
            <PasswordInput
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              disabled={isLoading}
            />
            <EyeIconButton type="button" onClick={() => setIsPasswordVisible(prev => !prev)}>
              {isPasswordVisible ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              )}
            </EyeIconButton>
          </PasswordInputWrapper>
        )}
        <Button onClick={handleLogin} disabled={isLoading}>
          {isLoading ? 'Verifying...' : isTempLink ? 'Join Chat' : 'Join Chat'}
        </Button>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </AuthBox>
    </AuthContainer>
  );
};

export default Auth;
