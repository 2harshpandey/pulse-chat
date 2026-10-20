export const getUserId = (): string => {
  let userId = localStorage.getItem('pulseUserId');
  if (!userId) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(3);
      window.crypto.getRandomValues(array);
      userId = Date.now().toString(36) + Array.from(array, n => n.toString(36)).join('');
    } else {
      userId = Date.now().toString(36) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }
    localStorage.setItem('pulseUserId', userId);
  }
  return userId;
};

export const collectFingerprint = () => ({
  screenResolution: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
  platform: typeof navigator !== 'undefined' ? navigator.platform || '' : '',
  language: typeof navigator !== 'undefined' ? navigator.language || '' : '',
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '',
});
