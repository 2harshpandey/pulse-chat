import React from 'react';
import { AuthController } from '../hooks';
import {
  GlassCard,
  TopBar,
  FormHomeButton,
  TopBarButton,
  InfoButton,
  Tooltip,
  BrandSection,
  BrandLogo,
  BrandWordmark,
  BrandTagline,
  HeartbeatSvg,
  TempBadge,
  InviteText,
  BrandSubtitle,
  InputGroup,
  InputIcon,
  StyledInput,
  PasswordToggle,
  SubmitBtn,
  ErrorText,
  SecuredLine
} from '../AuthStyledComponents';

interface AuthCardProps {
  controller: AuthController;
  roomId?: string;
}

export const AuthCard: React.FC<AuthCardProps> = ({ controller, roomId = 'me' }) => {
  const {
    isDark,
    toggleTheme,
    navigate,
    password,
    setPassword,
    showPw,
    setShowPw,
    username,
    setUsername,
    error,
    setError,
    isLoading,
    usernameFocused,
    setUsernameFocused,
    isTempLink,
    requiresPassword,
    passwordFocused,
    setPasswordFocused,
    passwordInputRef,
    showInfo,
    setShowInfo,
    roomDescription,
    handleLogin,
    handleKeyDown,
    focusPasswordInput
  } = controller;

  return (
    <GlassCard $hasError={!!error}>
      <TopBar>
        <FormHomeButton onClick={() => navigate('/')} title="Back to Home" aria-label="Back to Home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </FormHomeButton>
        <div style={{ display: 'flex', gap: '8px' }}>
          <TopBarButton className="spin-on-hover" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </TopBarButton>
          {roomDescription && (
            <InfoButton 
               onMouseEnter={() => setShowInfo(true)} 
               onMouseLeave={() => setShowInfo(false)}
               onClick={() => setShowInfo(!showInfo)}
               aria-label="Room Information"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: isDark ? '#94a3b8' : '#64748b' }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <Tooltip $visible={showInfo}>{roomDescription}</Tooltip>
            </InfoButton>
          )}
        </div>
      </TopBar>

      <BrandSection>
        <BrandLogo src="/pulse_logo.webp" alt="Pulse" />
        <BrandWordmark><span>Pulse</span> Chat</BrandWordmark>
        {isTempLink && <BrandTagline>You're Invited!</BrandTagline>}
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

      {requiresPassword === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '120px', marginBottom: '1rem' }}>
          <div style={{ width: '30px', height: '30px', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          <InputGroup $focused={usernameFocused}>
            <InputIcon $focused={usernameFocused}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </InputIcon>
            <StyledInput
              id="username"
              name="username"
              type="text"
              placeholder="Enter your username"
              autoComplete="username"
              value={username}
              onChange={e => {
                setUsername(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setUsernameFocused(true)}
              onBlur={() => setUsernameFocused(false)}
              maxLength={30}
              autoFocus={!window.matchMedia('(pointer: coarse)').matches}
            />
          </InputGroup>

          {requiresPassword && (
            <InputGroup $focused={passwordFocused}>
              <InputIcon $focused={passwordFocused}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </InputIcon>
              <StyledInput
                ref={passwordInputRef}
                id="password"
                name="password"
                type={showPw ? 'text' : 'password'}
                placeholder={roomId === 'me' ? "Password" : "Password (if any)"}
                autoComplete="current-password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                disabled={isLoading}
                style={{ paddingRight: '3rem' }}
              />
              <PasswordToggle
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => {
                  const pos = passwordInputRef.current?.selectionStart ?? null;
                  setShowPw(!showPw);
                  requestAnimationFrame(() => focusPasswordInput(pos));
                }}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                title={showPw ? 'Hide password' : 'Show password'}
              >
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
        </>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <SecuredLine>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Secured connection
      </SecuredLine>
    </GlassCard>
  );
};
