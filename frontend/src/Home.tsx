import React, { useEffect, useState, useRef } from 'react';
import styled, { keyframes, createGlobalStyle } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './ThemeContext';

const GlobalHomeStyle = createGlobalStyle`
  html, body, #root {
    position: static !important;
    overflow: visible !important;
    height: auto !important;
    min-height: 100vh !important;
  }
  body {
    overflow-x: clip !important;
  }
  body {
    background-color: var(--bg-primary);
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary);
  }
`;

const gradientFlow = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const float = keyframes`
  0% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(5deg); }
  100% { transform: translateY(0px) rotate(0deg); }
`;

const pulseGlow = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  70% { box-shadow: 0 0 0 20px rgba(59, 130, 246, 0); }
  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
`;

const HeroContainer = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: clip;
  background: var(--bg-primary);
`;

const TopNav = styled.nav`
  padding: 2rem 4rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  z-index: 10;
  
  @media (max-width: 768px) {
    padding: 1.5rem 2rem;
  }
`;

const Logo = styled.a`
  font-size: 1.75rem;
  font-weight: 800;
  cursor: pointer;
  text-decoration: none;
  letter-spacing: -1px;
  background: linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  &::before {
    content: '';
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #3b82f6;
    animation: ${pulseGlow} 2s infinite;
  }
`;

const ContentWrapper = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 10;
  text-align: center;
`;



const Title = styled.h1`
  font-size: clamp(3rem, 8vw, 6rem);
  font-weight: 900;
  line-height: 1.1;
  margin: 0 0 1.5rem;
  letter-spacing: -2px;
  max-width: 900px;
  
  span {
    background: linear-gradient(270deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
    background-size: 300% 300%;
    animation: ${gradientFlow} 8s ease infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const Description = styled.p`
  font-size: clamp(1.1rem, 2.5vw, 1.5rem);
  color: var(--text-secondary);
  max-width: 650px;
  margin: 0 0 3rem;
  line-height: 1.6;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
`;

const PrimaryButton = styled.button`
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  color: #ffffff;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.125rem;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.5);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  white-space: nowrap;

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 20px 35px -5px rgba(139, 92, 246, 0.6);
  }

  &:active {
    transform: translateY(1px);
  }
`;

const SecondaryButton = styled.button`
  background: var(--bg-secondary);
  color: ${p => p.$primary ? '#ffffff' : 'var(--text-primary)'};
  border: 1px solid var(--border-secondary);
  padding: 1rem 2rem;
  font-size: 1.125rem;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  white-space: nowrap;

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    background: var(--bg-hover);
    border-color: var(--border-focus);
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  }

  &:active {
    transform: translateY(1px);
  }
`;

// Background Decorative Elements
const Orb = styled.div<{ $color: string; $size: string; $top: string; $left: string; $delay: string }>`
  position: absolute;
  width: ${p => p.$size};
  height: ${p => p.$size};
  background: ${p => p.$color};
  border-radius: 50%;
  top: ${p => p.$top};
  left: ${p => p.$left};
  filter: blur(100px);
  opacity: 0.15;
  animation: ${float} 10s ease-in-out infinite;
  animation-delay: ${p => p.$delay};
  pointer-events: none;
  z-index: 1;
`;

const FeaturesSection = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2rem;
  width: 100%;
  max-width: 1200px;
  margin-top: 5rem;
  position: relative;
  z-index: 10;
`;

const FeatureCard = styled.div`
  flex: 1 1 300px;
  max-width: 400px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  padding: 2rem;
  border-radius: 24px;
  text-align: left;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: transform 0.3s ease, background 0.3s ease;

  &:hover {
    transform: translateY(-5px);
    background: var(--bg-secondary);
    border-color: rgba(59, 130, 246, 0.3);
  }

  h3 {
    font-size: 1.25rem;
    margin: 0 0 1rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.5;
    font-size: 0.95rem;
  }
`;

const IconWrapper = styled.div<{ $color: string }>`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: ${p => p.$color}20;
  color: ${p => p.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  svg {
    width: 24px;
    height: 24px;
  }
`;

const NavActions = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const ThemeToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  text-decoration: none;

  svg {
    width: 22px;
    height: 22px;
    transition: transform 0.3s ease, color 0.3s ease;
  }

  &:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: var(--text-primary);
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4);
  }
  
  &:active {
    transform: translateY(1px);
  }
  
  &:hover svg {
    transform: rotate(30deg);
  }
`;

const NavIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  text-decoration: none;

  svg {
    width: 22px;
    height: 22px;
    transition: transform 0.3s ease, color 0.3s ease;
  }

  &:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: var(--text-primary);
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4);

    svg {
      transform: scale(1.1);
      color: #60a5fa;
    }
  }

  &:active {
    transform: translateY(1px);
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(var(--bg-primary-rgb, 15, 23, 42), 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const ModalContent = styled.div`
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  border-radius: 24px;
  padding: 2.5rem;
  width: 100%;
  max-width: 460px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: ${float} 0.5s ease-out;

  @media (max-width: 480px) {
    padding: 1.5rem;
    border-radius: 20px;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-secondary);
  color: var(--text-primary);
  padding: 0.875rem 1rem;
  border-radius: 12px;
  font-size: 1rem;
  transition: all 0.2s;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const EyeButton = styled.button`
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  
  &:hover {
    color: var(--text-primary);
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
`;

const Button = styled.button<{ $primary?: boolean }>`
  background: ${p => p.$primary ? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' : 'var(--bg-hover)'};
  color: ${p => p.$primary ? '#ffffff' : 'var(--text-primary)'};
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${p => p.$primary ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' : 'rgba(255, 255, 255, 0.15)'};
    transform: translateY(-1px);
  }
`;

const ErrorMessage = styled.div`
  color: #ef4444;
  font-size: 0.875rem;
  margin-top: -0.5rem;
  margin-bottom: 1rem;
`;

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminRoomId, setAdminRoomId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const adminPasswordInputRef = useRef<HTMLInputElement>(null);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminRoomId.trim() && !adminPassword.trim()) {
      setAdminError('Both Room ID and Admin Password are required.');
      return;
    }
    if (!adminRoomId.trim()) {
      setAdminError('Please enter the Room ID.');
      return;
    }
    if (!adminPassword.trim()) {
      setAdminError('Please enter the Admin Password.');
      return;
    }

    setIsAdminLoading(true);
    setAdminError('');

    try {
      const apiBase = import.meta.env.REACT_APP_API_URL || '';
      const roomId = adminRoomId.trim();
      const trimmedPassword = adminPassword.trim();
      const passwordAttempts = (trimmedPassword && trimmedPassword !== adminPassword)
        ? [adminPassword, trimmedPassword]
        : [adminPassword];

      let isValid = false;
      let statusError = '';

      for (const candidate of passwordAttempts) {
        const authHeaders = { 'x-admin-password': candidate, 'x-room-id': roomId };
        const usersRes = await fetch(`${apiBase}/api/admin/users`, { headers: authHeaders });

        if (usersRes.ok) {
          isValid = true;
          break;
        } else if (usersRes.status !== 401) {
          statusError = `Login service unavailable (${usersRes.status}). Please try again.`;
        }
      }

      if (isValid) {
        navigate(`/admin/${roomId}`, { state: { autoLoginPassword: adminPassword } });
      } else {
        setAdminError(statusError || 'Room ID or password is incorrect.');
      }
    } catch (err) {
      setAdminError('Network error. Please check your connection.');
    } finally {
      setIsAdminLoading(false);
    }
  };


  useEffect(() => {
    window.scrollTo(0, 0);
    setMounted(true);
  }, []);

  return (
    <>
      <GlobalHomeStyle />
      <HeroContainer>
        <Orb $color="#3b82f6" $size="400px" $top="10%" $left="-5%" $delay="0s" />
        <Orb $color="#8b5cf6" $size="500px" $top="45%" $left="60%" $delay="-2s" />
        <Orb $color="#ec4899" $size="300px" $top="75%" $left="10%" $delay="-4s" />

        <TopNav>
          <Logo href="/">Pulse Chat</Logo>
          <NavActions>
            <ThemeToggle onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </ThemeToggle>
            <NavIconButton 
              onClick={() => navigate('/about-developer')}
              title="About Developer" 
              aria-label="About Developer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </NavIconButton>
            <NavIconButton 
              as="a" 
              href="https://github.com/2harshpandey/pulse-chat" 
              target="_blank" 
              rel="noopener noreferrer" 
              title="GitHub Repository" 
              aria-label="GitHub Repository"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" /></svg>
            </NavIconButton>
          </NavActions>
        </TopNav>

        <ContentWrapper style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.8s ease' }}>
          <Title>
            Connect without limits.<br />
            <span>Chat reimagined.</span>
          </Title>
          <Description>
            Experience lightning-fast messaging with uncompromising privacy. Create custom rooms, share media instantly, and chat globally in a stunning premium interface.
          </Description>

          <ButtonGroup>
            <PrimaryButton onClick={() => navigate('/room/global')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Join Global Chat
            </PrimaryButton>
            <SecondaryButton onClick={() => navigate('/room')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Browse Rooms
            </SecondaryButton>
            <SecondaryButton onClick={() => setIsAdminModalOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              Admin Panel
            </SecondaryButton>
          </ButtonGroup>

          <FeaturesSection>
            <FeatureCard>
              <IconWrapper $color="#3b82f6">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </IconWrapper>
              <h3>Secure Rooms</h3>
              <p>Create private, password-protected chat rooms or open public lounges. You control who enters.</p>
            </FeatureCard>
            <FeatureCard>
              <IconWrapper $color="#ec4899">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </IconWrapper>
              <h3>Rich Media</h3>
              <p>Upload photos, videos, files, and GIFs effortlessly. Link previews are automatically generated.</p>
            </FeatureCard>
            <FeatureCard>
              <IconWrapper $color="#8b5cf6">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
                </svg>
              </IconWrapper>
              <h3>Real-time Sync</h3>
              <p>Lightning-fast WebSocket delivery with instant read receipts, typing indicators, and emoji reactions.</p>
            </FeatureCard>
          </FeaturesSection>
        </ContentWrapper>
      </HeroContainer>

      {isAdminModalOpen && (
        <ModalOverlay onClick={() => { setIsAdminModalOpen(false); setAdminError(''); }}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1.5rem', color: 'var(--text-heading)', fontSize: '1.5rem' }}>Room Admin Login</h2>
            <form onSubmit={handleAdminSubmit}>
              <FormGroup>
                <Label>Room ID</Label>
                <Input
                  type="text"
                  placeholder="Enter the Room ID you manage"
                  value={adminRoomId}
                  onChange={(e) => {
                    setAdminRoomId(e.target.value);
                    if (adminError) setAdminError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adminPasswordInputRef.current?.focus();
                    }
                  }}
                  autoFocus={!window.matchMedia('(pointer: coarse)').matches}
                />
              </FormGroup>
              <FormGroup>
                <Label>Admin Password</Label>
                <InputWrapper>
                  <Input
                    ref={adminPasswordInputRef}
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
                <Button type="button" onClick={() => { setIsAdminModalOpen(false); setAdminError(''); }} disabled={isAdminLoading}>Cancel</Button>
                <Button type="submit" $primary disabled={isAdminLoading}>
                  {isAdminLoading ? 'Verifying...' : 'Continue to Admin'}
                </Button>
              </ModalActions>
            </form>
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
};

export default Home;
