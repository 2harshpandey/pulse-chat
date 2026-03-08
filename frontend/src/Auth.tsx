import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { UserProfile } from './UserContext';
import { useTheme } from './ThemeContext';

// --- UTILITY ---
const getUserId = (): string => {
  let userId = localStorage.getItem('pulseUserId');
  if (!userId) {
    const array = new Uint32Array(3);
    window.crypto.getRandomValues(array);
    userId = Date.now().toString(36) + Array.from(array, n => n.toString(36)).join('');
    localStorage.setItem('pulseUserId', userId);
  }
  return userId;
};

const collectFingerprint = () => ({
  screenResolution: `${window.screen.width}x${window.screen.height}`,
  platform: navigator.platform || '',
  language: navigator.language || '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
});

// --- ANIMATIONS ---
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
`;

const float1 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25%  { transform: translate(40px, -60px) scale(1.1); }
  50%  { transform: translate(-20px, 40px) scale(0.95); }
  75%  { transform: translate(30px, 20px) scale(1.05); }
`;

const float2 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25%  { transform: translate(-50px, 30px) scale(1.05); }
  50%  { transform: translate(30px, -40px) scale(0.9); }
  75%  { transform: translate(-20px, -20px) scale(1.1); }
`;

const float3 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25%  { transform: translate(20px, 50px) scale(0.95); }
  50%  { transform: translate(-40px, -30px) scale(1.1); }
  75%  { transform: translate(30px, -20px) scale(1); }
`;

const drawLine = keyframes`
  from { stroke-dashoffset: 180; }
  to   { stroke-dashoffset: 0; }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.35); }
  50%      { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
`;

const shimmer = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// --- STYLED COMPONENTS ---
const PageWrapper = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  z-index: 0;
  padding: 1.5rem;
`;

const AnimatedBg = styled.div`
  position: fixed;
  inset: 0;
  background: var(--login-bg);
  overflow: hidden;
  z-index: 0;
  transition: background 0.5s ease;
`;

const Orb = styled.div<{ $color: string; $darkColor: string; $size: number; $top: string; $left: string; $anim: ReturnType<typeof keyframes> }>`
  position: absolute;
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  border-radius: 50%;
  background: ${p => p.$color};
  filter: blur(80px);
  opacity: 0.6;
  animation: ${p => p.$anim} 20s ease-in-out infinite;
  top: ${p => p.$top};
  left: ${p => p.$left};
  will-change: transform;

  [data-theme='dark'] & {
    background: ${p => p.$darkColor};
    opacity: 0.3;
  }
`;

const FormContainer = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
`;

const GlassCard = styled.div<{ $hasError?: boolean }>`
  background: var(--login-card-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--login-card-border);
  border-radius: 24px;
  padding: 2.5rem;
  box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.15);
  animation: ${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1),
             ${(p: any) => p.$hasError ? shake : 'none'} 0.4s ease;
  transition: background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease;
  position: relative;

  [data-theme='dark'] & {
    box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.5);
  }

  @media (max-width: 480px) {
    padding: 2rem 1.5rem;
    border-radius: 20px;
  }
`;

const TopBar = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.25rem;
`;

const ThemeToggle = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-primary);
  background: var(--bg-elevated);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  flex-shrink: 0;

  &:hover {
    transform: scale(1.1);
    border-color: var(--accent-blue);
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.15);
  }
  &:active { transform: scale(0.95); }

  svg {
    width: 18px;
    height: 18px;
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
`;

const BrandSection = styled.div`
  text-align: center;
  margin-bottom: 2rem;
`;

const BrandLogo = styled.img`
  width: 90px;
  height: 90px;
  object-fit: contain;
  margin-bottom: 0.75rem;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
`;

const BrandName = styled.h1`
  font-size: 2.2rem;
  font-weight: 800;
  background: linear-gradient(135deg, var(--text-heading), var(--accent-indigo));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.03em;
  margin-bottom: 0;
`;

const HeartbeatSvg = styled.svg`
  display: block;
  margin: 0.6rem auto 0;
  overflow: visible;

  path {
    fill: none;
    stroke: var(--accent-indigo);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 180;
    animation: ${drawLine} 1.5s ease-out forwards;
    filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.25));
  }
`;

const BrandSubtitle = styled.p`
  font-size: 0.9rem;
  color: var(--text-tertiary);
  margin-top: 0.75rem;
  transition: color 0.3s ease;
`;

const TempBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 1rem;
  margin-bottom: 1rem;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12));
  border: 1px solid rgba(99,102,241,0.2);
  color: var(--accent-indigo);
  font-size: 0.8rem;
  font-weight: 600;
  animation: ${pulseGlow} 2.5s ease-in-out infinite;
`;

const InviteText = styled.p`
  font-size: 0.88rem;
  color: var(--text-tertiary);
  margin-bottom: 1.5rem;
  line-height: 1.55;
  transition: color 0.3s ease;
`;

const InputGroup = styled.div<{ $focused?: boolean }>`
  position: relative;
  margin-bottom: 1rem;
  border-radius: 12px;
  border: 1.5px solid ${(p: any) => p.$focused ? 'var(--accent-indigo)' : 'var(--border-secondary)'};
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  box-shadow: ${(p: any) => p.$focused ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none'};
  background: var(--bg-input);
  overflow: hidden;
  display: flex;
  align-items: center;
`;

const InputIcon = styled.div<{ $focused?: boolean }>`
  position: absolute;
  left: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${(p: any) => p.$focused ? 'var(--accent-indigo)' : 'var(--text-muted)'};
  transition: color 0.3s ease;
  display: flex;
  align-items: center;
  z-index: 1;
  svg { width: 18px; height: 18px; }
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 0.9rem 1rem 0.9rem 2.75rem;
  border: none;
  background: transparent;
  font-size: 0.95rem;
  color: var(--text-primary);
  outline: none;
  transition: color 0.3s ease;

  &::placeholder {
    color: var(--text-muted);
    transition: color 0.3s ease;
  }
`;

const PasswordToggle = styled.button`
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.4rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  z-index: 1;

  &:hover { color: var(--text-secondary); }
  svg { width: 18px; height: 18px; }
`;

const SubmitBtn = styled.button<{ $loading?: boolean }>`
  width: 100%;
  padding: 0.9rem 1rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #4F46E5, #3B82F6);
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
  margin-top: 0.5rem;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 30px -5px rgba(79, 70, 229, 0.5);
  }
  &:active:not(:disabled) { transform: translateY(0); }
  &:disabled { opacity: 0.65; cursor: not-allowed; transform: none; }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    background-size: 200% 100%;
    animation: ${(p: any) => p.$loading ? shimmer : 'none'} 1.5s infinite;
  }
`;

const ErrorText = styled.p`
  color: var(--accent-red);
  margin-top: 1rem;
  font-size: 0.85rem;
  text-align: center;
  animation: ${fadeInUp} 0.3s ease-out;
`;

const SecuredLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 1.5rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  transition: color 0.3s ease;
  svg { width: 12px; height: 12px; }
`;

// --- COMPONENT ---
interface AuthProps {
  onAuthSuccess: (profile: UserProfile) => void;
  tempToken?: string | null;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess, tempToken }) => {
  const { isDark, toggleTheme } = useTheme();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState(() => localStorage.getItem('pulseUsername') || '');
  const [error, setError] = useState(() => {
    const pending = sessionStorage.getItem('authError');
    if (pending) { sessionStorage.removeItem('authError'); return pending; }
    return '';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const isTempLink = !!tempToken;

  // Keyboard-aware scrolling for touch devices.
  // When the virtual keyboard opens the VisualViewport shrinks — we scroll
  // the focused input into view so it isn't hidden behind the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        requestAnimationFrame(() => {
          (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  const handleLogin = async () => {
    if (!isTempLink && !password) { setError('Please enter a password.'); return; }
    if (!username.trim()) { setError('Please enter a username.'); return; }
    if (username.length > 30) { setError('Username cannot exceed 30 characters.'); return; }
    setIsLoading(true);
    setError('');
    try {
      const apiBase = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
      const fingerprint = collectFingerprint();

      if (isTempLink) {
        const resp = await fetch(`${apiBase}/api/auth/verify-temp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tempToken, username: username.trim(), userId: getUserId(), fingerprint }),
        });
        if (resp.ok) {
          localStorage.setItem('pulseUsername', username.trim());
          onAuthSuccess({ userId: getUserId(), username: username.trim() });
        } else {
          const d = await resp.json().catch(() => ({}));
          setError(d.error || 'This link is invalid or has expired.');
        }
      } else {
        const resp = await fetch(`${apiBase}/api/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, username: username.trim(), userId: getUserId(), fingerprint }),
        });
        if (resp.ok) {
          localStorage.setItem('pulseUsername', username.trim());
          onAuthSuccess({ userId: getUserId(), username: username.trim() });
        } else {
          const d = await resp.json().catch(() => ({}));
          if (resp.status === 409) setError(d.error || 'That username is already in use.');
          else if (resp.status === 403) setError(d.error || 'Access denied.');
          else setError('Incorrect password.');
        }
      }
    } catch {
      setError('Could not connect to the server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleLogin(); };

  return (
    <>
      <AnimatedBg>
        <Orb $color="rgba(99,102,241,0.3)"  $darkColor="rgba(99,102,241,0.25)" $size={500} $top="-10%" $left="-10%"  $anim={float1} />
        <Orb $color="rgba(59,130,246,0.25)"  $darkColor="rgba(59,130,246,0.2)"  $size={400} $top="60%"  $left="60%"   $anim={float2} />
        <Orb $color="rgba(236,72,153,0.18)"  $darkColor="rgba(236,72,153,0.15)" $size={350} $top="20%"  $left="75%"   $anim={float3} />
      </AnimatedBg>

      <PageWrapper>
        <FormContainer>
          <GlassCard $hasError={!!error}>
            <TopBar>
              <ThemeToggle onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
                {isDark ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </ThemeToggle>
            </TopBar>

            <BrandSection>
              <BrandLogo src="/pulse_logo.png" alt="Pulse" />
              {isTempLink && <BrandName>You're Invited!</BrandName>}
              <HeartbeatSvg viewBox="0 0 120 30" width="120" height="30">
                <path d="M0 15 L30 15 L38 5 L46 25 L54 8 L60 15 L90 15 L98 5 L106 25 L114 8 L120 15" />
              </HeartbeatSvg>
              {isTempLink ? (
                <>
                  <TempBadge>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    Invite Link
                  </TempBadge>
                  <InviteText>You've been invited to join the chat. Enter a username to get started — no password needed!</InviteText>
                </>
              ) : (
                <BrandSubtitle>Join the conversation</BrandSubtitle>
              )}
            </BrandSection>

            <InputGroup $focused={usernameFocused}>
              <InputIcon $focused={usernameFocused}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </InputIcon>
              <StyledInput
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => setUsernameFocused(false)}
                maxLength={30}
                autoFocus
              />
            </InputGroup>

            {!isTempLink && (
              <InputGroup $focused={passwordFocused}>
                <InputIcon $focused={passwordFocused}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </InputIcon>
                <StyledInput
                  type={showPw ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  disabled={isLoading}
                  style={{ paddingRight: '3rem' }}
                />
                <PasswordToggle type="button" onClick={() => setShowPw(p => !p)}>
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </PasswordToggle>
              </InputGroup>
            )}

            <SubmitBtn onClick={handleLogin} disabled={isLoading} $loading={isLoading}>
              {isLoading ? 'Connecting...' : 'Join Chat'}
            </SubmitBtn>

            {error && <ErrorText>{error}</ErrorText>}

            <SecuredLine>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Secured connection
            </SecuredLine>
          </GlassCard>
        </FormContainer>
      </PageWrapper>
    </>
  );
};

export default Auth;
