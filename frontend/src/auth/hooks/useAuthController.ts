import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserProfile } from '../../UserContext';
import { useTheme } from '../../ThemeContext';
import { resolveApiBaseUrl } from '../../chat/utils';
import { getUserId, collectFingerprint } from '../AuthStyledComponents';

interface UseAuthControllerProps {
  onAuthSuccess: (profile: UserProfile) => void;
  tempToken?: string | null;
  roomId?: string;
}

export const useAuthController = ({
  onAuthSuccess,
  tempToken,
  roomId = 'me'
}: UseAuthControllerProps) => {
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const routerState = location.state as { autoJoin?: boolean, username?: string, password?: string } | null;

  const [password, setPassword] = useState(routerState?.password || '');
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState(() => routerState?.username || localStorage.getItem(`pulseUsername_${roomId}`) || '');
  const [error, setError] = useState(() => {
    const pending = sessionStorage.getItem('authError');
    if (pending) { sessionStorage.removeItem('authError'); return pending; }
    return '';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [isTempLink, setIsTempLink] = useState(!!tempToken);
  const [requiresPassword, setRequiresPassword] = useState<boolean | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('token') || tempToken) return false;
    if (roomId === 'global') return false;
    if (roomId === 'me') return true;
    return null;
  });
  const [passwordFocused, setPasswordFocused] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [roomDescription, setRoomDescription] = useState('');
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || tempToken;
    if (token) {
      setIsTempLink(true);
      setRequiresPassword(false);
    } else if (roomId === 'global') {
      setRequiresPassword(false);
    } else if (roomId && roomId !== 'me') {
      const apiBase = resolveApiBaseUrl();
      fetch(`${apiBase}/api/rooms/${roomId}/meta`)
        .then(res => res.json())
        .then(data => {
          if (data && data.id && data.id !== roomId) {
            navigate(`/room/${data.id}`, { replace: true, state: location.state });
            return;
          }
          if (data && typeof data.requiresPassword === 'boolean') {
            setRequiresPassword(data.requiresPassword);
          }
          if (data && data.description) setRoomDescription(data.description);
        })
        .catch(console.error);
    }
  }, [roomId, tempToken]);

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
    if (!isTempLink && roomId === 'me' && !password) { setError('Please enter a password.'); return; }
    if (!username.trim()) { setError('Please enter a username.'); return; }
    if (username.length > 30) { setError('Username cannot exceed 30 characters.'); return; }
    setIsLoading(true);
    setError('');
    try {
      const apiBase = resolveApiBaseUrl();
      const fingerprint = collectFingerprint();

      if (isTempLink) {
        let token = new URLSearchParams(window.location.search).get('token') || tempToken || '';
        token = token.trim();
        const resp = await fetch(`${apiBase}/api/auth/verify-temp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, username: username.trim(), userId: getUserId(), fingerprint, roomId }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.sessionToken) {
            // Issue 3: Store session token ONLY in sessionStorage (tab-lifetime), never in
            // localStorage (permanent). This eliminates the XSS token-theft escalation path.
            sessionStorage.setItem('pulseSessionToken', data.sessionToken);
          }
          localStorage.setItem('pulseUsername', username.trim());
          localStorage.setItem(`pulseUsername_${roomId}`, username.trim());
          if (data.roomId) {
            localStorage.setItem('pulseRoomId', data.roomId);
          }
          if (routerState?.autoJoin) {
            navigate(location.pathname, { replace: true, state: {} });
          }
          onAuthSuccess({ userId: getUserId(), username: username.trim(), roomId: data.roomId });
        } else {
          const d = await resp.json().catch(() => ({}));
          if (resp.status === 429) {
            setError(d.error || 'Too many attempts. Please wait a moment before trying again.');
          } else {
            setError(d.error || 'This link is invalid or has expired.');
          }
        }
      } else {
        const resp = await fetch(`${apiBase}/api/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, username: username.trim(), userId: getUserId(), fingerprint, roomId }),
        });
        if (resp.ok) {
          const data = await resp.json().catch(() => ({}));
          if (data.sessionToken) {
            // Issue 3: sessionStorage only — not localStorage
            sessionStorage.setItem('pulseSessionToken', data.sessionToken);
          }
          const resolvedRoomId = data.roomId || roomId;
          localStorage.setItem('pulseUsername', username.trim());
          localStorage.setItem(`pulseUsername_${resolvedRoomId}`, username.trim());
          if (resolvedRoomId) {
            localStorage.setItem('pulseRoomId', resolvedRoomId);
          }
          if (routerState?.autoJoin) {
            navigate(location.pathname, { replace: true, state: {} });
          }
          onAuthSuccess({ userId: getUserId(), username: username.trim(), roomId: resolvedRoomId });
        } else {
          const d = await resp.json().catch(() => ({}));
          if (resp.status === 409) {
            setError(d.error || 'That username is already in use.');
          } else if (resp.status === 403) {
            setError(d.error || 'Access denied.');
          } else if (resp.status === 429) {
            setError(d.error || 'Too many attempts. Please wait a moment before trying again.');
          } else if (resp.status === 401) {
            setError(d.error || 'Incorrect password.');
          } else {
            setError(d.error || 'Authentication failed. Please try again.');
          }
        }
      }
    } catch {
      setError('Could not connect to the server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (routerState?.autoJoin && !autoJoinAttempted && username) {
      setAutoJoinAttempted(true);
      handleLogin();
    }
  }, [routerState, autoJoinAttempted, username]);

  const focusPasswordInput = useCallback((pos?: number | null) => {
    const input = passwordInputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
      if (pos !== undefined && pos !== null) {
        input.setSelectionRange(pos, pos);
      }
    } catch {
      input.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (usernameFocused && !isTempLink && !password && requiresPassword) {
        e.preventDefault();
        focusPasswordInput();
      } else {
        handleLogin();
      }
    }
  };

  return {
    isDark,
    toggleTheme,
    navigate,
    routerState,
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
    autoJoinAttempted,
    handleLogin,
    handleKeyDown,
    focusPasswordInput
  };
};

export type AuthController = ReturnType<typeof useAuthController>;
