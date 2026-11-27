export const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + encodeURIComponent(name) + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
};

// Issue 14: Default lifetime reduced from 365 to 30 days. SameSite changed from
// Lax to Strict — this app is single-origin and does not rely on cross-site cookie sending.
export const setCookie = (name: string, value: string, days = 30): void => {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict${isHttps ? '; Secure' : ''}`;
};

export const deleteCookie = (name: string): void => {
  if (typeof document === 'undefined') return;
  const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict${isHttps ? '; Secure' : ''}`;
};

const parseSignedTokenPayload = (token: string): Record<string, any> | null => {
  if (!token || !token.startsWith('pls.')) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    const parsed = JSON.parse(atob(base64 + pad));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const getSignedTokenRoomId = (token: string): string | null => {
  const parsed = parseSignedTokenPayload(token);
  return typeof parsed?.roomId === 'string' ? parsed.roomId : null;
};

export const getSignedTokenUserId = (token: string): string | null => {
  const parsed = parseSignedTokenPayload(token);
  return typeof parsed?.userId === 'string' ? parsed.userId : null;
};

const isTokenValidForRoom = (token: string, roomId: string): boolean => {
  const payloadRoomId = getSignedTokenRoomId(token);
  if (payloadRoomId === null) return true; // Non-JSON or legacy opaque token
  const normalizedTarget = roomId.trim().toLowerCase() || 'me';
  const normalizedTokenRoom = payloadRoomId.trim().toLowerCase() || 'me';
  return normalizedTarget === normalizedTokenRoom;
};

const readRoomScopedToken = (roomKey: string): string | null => (
  localStorage.getItem(`pulseSessionToken_${roomKey}`) ||
  sessionStorage.getItem(`pulseSessionToken_${roomKey}`) ||
  getCookie(`pulseSessionToken_${roomKey}`)
);

export const getSessionToken = (roomId?: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    let token: string | null = null;
    let fromUnscopedFallback = false;

    if (roomId) {
      const candidate = readRoomScopedToken(roomId) || (roomId.toLowerCase() !== roomId ? readRoomScopedToken(roomId.toLowerCase()) : null);
      if (candidate && isTokenValidForRoom(candidate, roomId)) {
        token = candidate;
      }
    }

    if (!token) {
      const globalCandidate =
        localStorage.getItem('pulseSessionToken') ||
        sessionStorage.getItem('pulseSessionToken') ||
        getCookie('pulseSessionToken');
      if (globalCandidate) {
        if (!roomId || isTokenValidForRoom(globalCandidate, roomId)) {
          token = globalCandidate;
          fromUnscopedFallback = Boolean(roomId);
        }
      }
    }

    if (token) {
      try {
        if (roomId && (!fromUnscopedFallback || getSignedTokenRoomId(token) !== null)) {
          if (!sessionStorage.getItem(`pulseSessionToken_${roomId}`)) {
            sessionStorage.setItem(`pulseSessionToken_${roomId}`, token);
          }
          if (!localStorage.getItem(`pulseSessionToken_${roomId}`)) {
            localStorage.setItem(`pulseSessionToken_${roomId}`, token);
          }
        }
        if (!fromUnscopedFallback) {
          if (!sessionStorage.getItem('pulseSessionToken')) {
            sessionStorage.setItem('pulseSessionToken', token);
          }
          if (!localStorage.getItem('pulseSessionToken')) {
            localStorage.setItem('pulseSessionToken', token);
          }
        }
      } catch (_) {}
      return token;
    }
  } catch (_) {}
  return null;
};

export const setSessionToken = (token: string, roomId?: string): void => {
  if (typeof window === 'undefined' || !token) return;
  try {
    localStorage.setItem('pulseSessionToken', token);
    sessionStorage.setItem('pulseSessionToken', token);
    setCookie('pulseSessionToken', token, 30);
    if (roomId) {
      localStorage.setItem(`pulseSessionToken_${roomId}`, token);
      sessionStorage.setItem(`pulseSessionToken_${roomId}`, token);
      setCookie(`pulseSessionToken_${roomId}`, token, 30);
      const lowerRoom = roomId.toLowerCase();
      if (lowerRoom !== roomId) {
        localStorage.setItem(`pulseSessionToken_${lowerRoom}`, token);
        sessionStorage.setItem(`pulseSessionToken_${lowerRoom}`, token);
      }
    }
  } catch (_) {}
};

export const removeSessionToken = (roomId?: string): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('pulseSessionToken');
    sessionStorage.removeItem('pulseSessionToken');
    deleteCookie('pulseSessionToken');
    if (roomId) {
      localStorage.removeItem(`pulseSessionToken_${roomId}`);
      sessionStorage.removeItem(`pulseSessionToken_${roomId}`);
      deleteCookie(`pulseSessionToken_${roomId}`);
      const lowerRoom = roomId.toLowerCase();
      if (lowerRoom !== roomId) {
        localStorage.removeItem(`pulseSessionToken_${lowerRoom}`);
        sessionStorage.removeItem(`pulseSessionToken_${lowerRoom}`);
        deleteCookie(`pulseSessionToken_${lowerRoom}`);
      }
    } else {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('pulseSessionToken_')) {
          localStorage.removeItem(key);
        }
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('pulseSessionToken_')) {
          sessionStorage.removeItem(key);
        }
      }
    }
  } catch (_) {}
};

export const hasAnyRoomSessionToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem('pulseSessionToken') || sessionStorage.getItem('pulseSessionToken')) {
      return true;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('pulseSessionToken_') && localStorage.getItem(k)) return true;
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('pulseSessionToken_') && sessionStorage.getItem(k)) return true;
    }
  } catch (_) {}
  return false;
};

export const setUserIdForRoom = (userId: string, roomId?: string): void => {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem('pulseUserId', userId);
    setCookie('pulseUserId', userId, 30);
    if (roomId) {
      localStorage.setItem(`pulseUserId_${roomId}`, userId);
      const lowerRoom = roomId.toLowerCase();
      if (lowerRoom !== roomId) {
        localStorage.setItem(`pulseUserId_${lowerRoom}`, userId);
      }
    }
  } catch (_) {}
};

export const getUserId = (): string => {
  let userId: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      userId = localStorage.getItem('pulseUserId') || getCookie('pulseUserId');
    } catch (_) {}
  }
  if (!userId) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(3);
      window.crypto.getRandomValues(array);
      userId = Date.now().toString(36) + Array.from(array, n => n.toString(36)).join('');
    } else {
      userId = Date.now().toString(36) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }
  }
  if (typeof window !== 'undefined' && userId) {
    try {
      localStorage.setItem('pulseUserId', userId);
      // Issue 14: 30-day cookie lifetime instead of 365
      setCookie('pulseUserId', userId, 30);
    } catch (_) {}
  }
  return userId;
};

export const getUserIdForRoom = (roomId?: string): string => {
  if (typeof window !== 'undefined' && roomId) {
    try {
      const token = getSessionToken(roomId);
      const tokenUserId = token ? getSignedTokenUserId(token) : null;
      if (tokenUserId) return tokenUserId;

      const lowerRoom = roomId.toLowerCase();
      const storedRoomUserId =
        localStorage.getItem(`pulseUserId_${roomId}`) ||
        (lowerRoom !== roomId ? localStorage.getItem(`pulseUserId_${lowerRoom}`) : null);
      if (storedRoomUserId) return storedRoomUserId;
    } catch (_) {}
  }
  return getUserId();
};

export const getStoredRoomProfile = (
  roomId?: string
): { userId: string; username: string; roomId: string } | null => {
  if (typeof window === 'undefined' || !roomId) return null;
  try {
    const token = getSessionToken(roomId);
    if (!token) return null;

    const lowerRoom = roomId.toLowerCase();
    const username =
      localStorage.getItem(`pulseUsername_${roomId}`) ||
      (lowerRoom !== roomId ? localStorage.getItem(`pulseUsername_${lowerRoom}`) : null) ||
      localStorage.getItem('pulseUsername') ||
      getCookie('pulseUsername');

    if (!username) return null;

    const userId = getUserIdForRoom(roomId);
    if (!userId) return null;

    return { userId, username, roomId };
  } catch {
    return null;
  }
};

export const collectFingerprint = () => ({
  screenResolution: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
  platform: typeof navigator !== 'undefined' ? navigator.platform || '' : '',
  language: typeof navigator !== 'undefined' ? navigator.language || '' : '',
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '',
});
