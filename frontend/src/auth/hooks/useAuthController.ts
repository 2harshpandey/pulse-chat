import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserProfile } from '../../UserContext';
import { useTheme } from '../../ThemeContext';
import { resolveApiBaseUrl } from '../../chat/utils';
import { collectFingerprint, setSessionToken } from '../AuthStyledComponents';
import { getSessionToken, getUserIdForRoom, setUserIdForRoom } from '../utils';

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
    const lowerRoom = (roomId || '').toLowerCase();
    if (lowerRoom === 'global') return false;
    if (lowerRoom === 'me') return true;
    return null;
  });
  const [passwordFocused, setPasswordFocused] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [roomDescription, setRoomDescription] = useState('');
  const [roomName, setRoomName] = useState('');
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);

  useEffect(() => {
    setRoomName('');
    setRoomDescription('');
    setError('');
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || tempToken;
    const lowerRoom = (roomId || '').toLowerCase();
    if (token) {
      setIsTempLink(true);
      setRequiresPassword(false);
      return;
    }

    setIsTempLink(false);
    if (lowerRoom === 'global') {
      setRequiresPassword(false);
      return;
    }

    if (lowerRoom === 'me') {
      setRequiresPassword(true);
      return;
    }

    if (roomId) {
      setRequiresPassword(null);
      const controller = new AbortController();
      const apiBase = resolveApiBaseUrl();
      fetch(`${apiBase}/api/rooms/${roomId}/meta`, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (controller.signal.aborted) return;
          if (!res.ok) {
            setRequiresPassword(false);
            setError((data && data.error) || (res.status === 404 ? 'Chat room not found.' : 'Failed to load room details.'));
            return;
          }
          if (data && data.id && data.id !== roomId) {
            navigate(data.id === 'me' ? '/me' : `/room/${data.id}`, { replace: true, state: location.state });
            return;
          }
          if (data && typeof data.requiresPassword === 'boolean') {
            setRequiresPassword(data.requiresPassword);
          } else {
            setRequiresPassword(true);
          }
          if (data && data.name) setRoomName(String(data.name));
          if (data && data.description) setRoomDescription(data.description);
        })
        .catch((err: any) => {
          if (err?.name === 'AbortError' || controller.signal.aborted) return;
          console.error(err);
          setRequiresPassword(true);
          setError('Could not load room details. Please try again.');
        });
      return () => controller.abort();
    }
  }, [roomId, tempToken, navigate]);

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
    const clearRouterSecretState = () => {
      if (routerState?.password || routerState?.autoJoin) {
        navigate(location.pathname, { replace: true, state: {} });
      }
    };
    if (!isTempLink && roomId === 'me' && !password) {
      clearRouterSecretState();
      setError('Please enter a password.');
      return;
    }
    if (!username.trim()) {
      clearRouterSecretState();
      setError('Please enter a username.');
      return;
    }
    if (username.length > 30) {
      clearRouterSecretState();
      setError('Username cannot exceed 30 characters.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const apiBase = resolveApiBaseUrl();
      const fingerprint = collectFingerprint();
      const existingSessionToken = getSessionToken(roomId);
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (existingSessionToken) {
        authHeaders['x-session-token'] = existingSessionToken;
      }

      if (isTempLink) {
        let token = new URLSearchParams(window.location.search).get('token') || tempToken || '';
        token = token.trim();
        const submittingUserId = getUserIdForRoom(roomId);
        const resp = await fetch(`${apiBase}/api/auth/verify-temp`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ token, username: username.trim(), userId: submittingUserId, fingerprint, ...(roomId ? { roomId } : {}) }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const verifiedRoomId = data.roomId || roomId || 'me';
          if (data.sessionToken) {
            setSessionToken(data.sessionToken, verifiedRoomId);
          }
          localStorage.setItem('pulseUsername', username.trim());
          localStorage.setItem(`pulseUsername_${verifiedRoomId}`, username.trim());
          if (verifiedRoomId.toLowerCase() !== verifiedRoomId) {
            localStorage.setItem(`pulseUsername_${verifiedRoomId.toLowerCase()}`, username.trim());
          }
          localStorage.setItem('pulseRoomId', verifiedRoomId);
          const verifiedUserId = data.userId || submittingUserId;
          setUserIdForRoom(verifiedUserId, verifiedRoomId);
          try {
            sessionStorage.setItem(`pulseVerifiedTemp_${token}`, verifiedRoomId);
          } catch (_) {}
          onAuthSuccess({ userId: verifiedUserId, username: username.trim(), roomId: verifiedRoomId });
          if (isTempLink) {
            navigate(verifiedRoomId === 'me' ? '/me' : `/room/${verifiedRoomId}`, { replace: true });
          }
        } else {
          const d = await resp.json().catch(() => ({}));
          if (resp.status === 429) {
            setError(d.error || 'Too many attempts. Please wait a moment before trying again.');
          } else {
            setError(d.error || 'This link is invalid or has expired.');
          }
        }
      } else {
        const submittingUserId = getUserIdForRoom(roomId);
        const resp = await fetch(`${apiBase}/api/auth/verify`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ password, username: username.trim(), userId: submittingUserId, fingerprint, roomId }),
        });
        if (resp.ok) {
          const data = await resp.json().catch(() => ({}));
          const resolvedRoomId = data.roomId || roomId;
          if (data.sessionToken) {
            setSessionToken(data.sessionToken, resolvedRoomId);
          }
          localStorage.setItem('pulseUsername', username.trim());
          localStorage.setItem(`pulseUsername_${resolvedRoomId}`, username.trim());
          if (resolvedRoomId && resolvedRoomId.toLowerCase() !== resolvedRoomId) {
            localStorage.setItem(`pulseUsername_${resolvedRoomId.toLowerCase()}`, username.trim());
          }
          if (resolvedRoomId) {
            localStorage.setItem('pulseRoomId', resolvedRoomId);
          }
          const verifiedUserId = data.userId || submittingUserId;
          setUserIdForRoom(verifiedUserId, resolvedRoomId);
          onAuthSuccess({ userId: verifiedUserId, username: username.trim(), roomId: resolvedRoomId });
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
      clearRouterSecretState();
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
    roomName,
    autoJoinAttempted,
    handleLogin,
    handleKeyDown,
    focusPasswordInput
  };
};

export type AuthController = ReturnType<typeof useAuthController>;
