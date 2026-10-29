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
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
};

export const deleteCookie = (name: string): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
};

export const getSessionToken = (roomId?: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    let token: string | null = null;
    if (roomId) {
      token =
        localStorage.getItem(`pulseSessionToken_${roomId}`) ||
        sessionStorage.getItem(`pulseSessionToken_${roomId}`) ||
        getCookie(`pulseSessionToken_${roomId}`);
    }
    if (!token) {
      token =
        localStorage.getItem('pulseSessionToken') ||
        sessionStorage.getItem('pulseSessionToken') ||
        getCookie('pulseSessionToken');
    }
    if (token) {
      try {
        if (roomId) {
          if (!sessionStorage.getItem(`pulseSessionToken_${roomId}`)) {
            sessionStorage.setItem(`pulseSessionToken_${roomId}`, token);
          }
          if (!localStorage.getItem(`pulseSessionToken_${roomId}`)) {
            localStorage.setItem(`pulseSessionToken_${roomId}`, token);
          }
        }
        if (!sessionStorage.getItem('pulseSessionToken')) {
          sessionStorage.setItem('pulseSessionToken', token);
        }
        if (!localStorage.getItem('pulseSessionToken')) {
          localStorage.setItem('pulseSessionToken', token);
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

export const collectFingerprint = () => ({
  screenResolution: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
  platform: typeof navigator !== 'undefined' ? navigator.platform || '' : '',
  language: typeof navigator !== 'undefined' ? navigator.language || '' : '',
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '',
});
