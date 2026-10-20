export const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + encodeURIComponent(name) + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
};

export const setCookie = (name: string, value: string, days = 365): void => {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

export const deleteCookie = (name: string): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
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
      setCookie('pulseUserId', userId, 365);
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
