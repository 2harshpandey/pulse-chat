import React from 'react';
import {
  LoginFormContainer,
  LoginBox,
  AdminOrb,
  AdminFormHomeButton,
  AdminThemeToggle,
  AdminLoginBrand,
  AdminBrandLogo,
  AdminBrandWordmark,
  AdminHeartbeatSvg,
  AdminBrandSubtitle,
  AdminInputGroup,
  AdminInputIcon,
  AdminStyledInput,
  AdminEyeBtn,
  AdminSubmitBtn,
  ErrorMessage,
  AdminSecuredLine,
  float1,
  float2,
  float3,
} from '../AdminStyledComponents';

export interface AdminLoginViewProps {
  isDark: boolean;
  toggleTheme: () => void;
  urlRoomId?: string;
  roomId: string;
  setRoomId: (id: string) => void;
  password: string;
  setPassword: (pwd: string) => void;
  passwordFocused: boolean;
  setPasswordFocused: (focused: boolean) => void;
  isPasswordVisible: boolean;
  setIsPasswordVisible: React.Dispatch<React.SetStateAction<boolean>>;
  adminPasswordInputRef: React.RefObject<HTMLInputElement | null>;
  focusAdminPasswordInput: (pos?: number | null) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleLogin: (pwd?: string) => void;
  isLoading: boolean;
  error: string;
  setError: (err: string) => void;
  onNavigateHome: () => void;
}

export function AdminLoginView({
  isDark,
  toggleTheme,
  urlRoomId,
  roomId,
  setRoomId,
  password,
  setPassword,
  passwordFocused,
  setPasswordFocused,
  isPasswordVisible,
  setIsPasswordVisible,
  adminPasswordInputRef,
  focusAdminPasswordInput,
  handleKeyDown,
  handleLogin,
  isLoading,
  error,
  setError,
  onNavigateHome,
}: AdminLoginViewProps) {
  return (
    <LoginFormContainer>
      <AdminOrb $color="rgba(99,102,241,0.3)" $size={500} $top="-10%" $left="-10%" $anim={float1} />
      <AdminOrb $color="rgba(59,130,246,0.25)" $size={400} $top="60%" $left="60%" $anim={float2} />
      <AdminOrb $color="rgba(236,72,153,0.18)" $size={350} $top="30%" $left="70%" $anim={float3} />
      <LoginBox>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', width: '100%' }}>
          <AdminFormHomeButton
            onClick={onNavigateHome}
            title="Back to Home"
            aria-label="Back to Home"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </AdminFormHomeButton>
          <AdminThemeToggle
            onClick={toggleTheme}
            title={isDark ? 'Light mode' : 'Dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </AdminThemeToggle>
        </div>
        <AdminLoginBrand style={{ marginTop: 0 }}>
          <AdminBrandLogo src="/pulse_logo.webp" alt="Pulse Admin" />
          <AdminBrandWordmark><span>Pulse</span> Chat</AdminBrandWordmark>
          <AdminHeartbeatSvg viewBox="0 0 120 30" width="120" height="30">
            <path d="M0 15 L30 15 L38 5 L46 25 L54 8 L60 15 L90 15 L98 5 L106 25 L114 8 L120 15" />
          </AdminHeartbeatSvg>
          <AdminBrandSubtitle>{!urlRoomId ? 'Main Admin Console' : 'Admin Control Panel'}</AdminBrandSubtitle>
        </AdminLoginBrand>
        {!!urlRoomId && (
          <AdminInputGroup $focused={false} style={{ marginBottom: '1rem' }}>
            <AdminInputIcon $focused={false}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            </AdminInputIcon>
            <AdminStyledInput
              id="admin-room-id"
              type="text"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
              autoFocus={!window.matchMedia('(pointer: coarse)').matches}
            />
          </AdminInputGroup>
        )}

        <AdminInputGroup $focused={passwordFocused}>
          <AdminInputIcon $focused={passwordFocused}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </AdminInputIcon>
          <AdminStyledInput
            ref={adminPasswordInputRef as any}
            id="admin-password"
            name="admin-password"
            type={isPasswordVisible ? 'text' : 'password'}
            placeholder="Enter admin password"
            autoComplete="current-password"
            autoFocus={!urlRoomId && !window.matchMedia('(pointer: coarse)').matches}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />
          <AdminEyeBtn
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => {
              const pos = adminPasswordInputRef.current?.selectionStart ?? null;
              setIsPasswordVisible((prev) => !prev);
              requestAnimationFrame(() => focusAdminPasswordInput(pos));
            }}
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            title={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            {isPasswordVisible ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </AdminEyeBtn>
        </AdminInputGroup>
        <AdminSubmitBtn onClick={() => handleLogin()} disabled={isLoading} $loading={isLoading}>
          {isLoading ? 'Authenticating...' : 'Login'}
        </AdminSubmitBtn>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <AdminSecuredLine>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          Protected admin access
        </AdminSecuredLine>
      </LoginBox>
    </LoginFormContainer>
  );
}
