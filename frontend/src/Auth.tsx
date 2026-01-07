import React, { useState } from 'react';
import styled from 'styled-components';
import { UserProfile } from './UserContext'; // Import the full profile type

// --- UTILITY ---
const getUserId = (): string => {
  let userId = localStorage.getItem('pulseUserId');
  if (!userId) {
    userId = Date.now().toString() + Math.random().toString(36).substring(2);
    localStorage.setItem('pulseUserId', userId);
  }
  return userId;
};

// --- STYLED COMPONENTS ---
const AuthContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background-color: #e2e8f0;
`;
const AuthBox = styled.div`
  background: white;
  padding: 2.5rem;
  border-radius: 1rem;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
  width: 100%;
  max-width: 400px;
  text-align: center;
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
const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.5rem;
  font-size: 1rem;
  margin-bottom: 1rem;
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
`;
const ErrorMessage = styled.p`
  color: #DC2626;
  margin-top: 1rem;
`;


// --- COMPONENT ---
interface AuthProps {
  onAuthSuccess: (profile: UserProfile) => void;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [username, setUsername] = useState(() => localStorage.getItem('pulseUsername') || '');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (password !== 'Khushi123') {
      setError('Incorrect password.');
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
    localStorage.setItem('pulseUsername', username);
    onAuthSuccess({ userId: getUserId(), username });
  };

  return (
    <AuthContainer>
      <AuthBox>
        <Title>Join Pulse</Title>
        <Input
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={30}
        />
        <PasswordInputWrapper>
          <PasswordInput
            type={isPasswordVisible ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          <EyeIconButton type="button" onClick={() => setIsPasswordVisible(prev => !prev)}>
            {isPasswordVisible ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            )}
          </EyeIconButton>
        </PasswordInputWrapper>
        <Button onClick={handleLogin}>Join Chat</Button>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </AuthBox>
    </AuthContainer>
  );
};

export default Auth;
