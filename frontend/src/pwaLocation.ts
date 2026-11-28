/**
 * PWA Location Persistence & Restoration Helper
 * Ensures that when a user closes/cuts the PWA and reopens it,
 * they resume from their exact previous location (chat room, admin panel login, rooms list, etc.)
 */

export const PWA_LAST_LOCATION_KEY = 'pulse_pwa_last_location';

/**
 * Detects if the application is currently running as an installed PWA.
 */
export const isRunningAsPWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer?.includes('android-app://') ||
      new URLSearchParams(window.location.search).get('pwa') === '1'
    );
  } catch {
    return false;
  }
};

/**
 * Validates that a path is a safe, internal relative path.
 * Rejects external URLs, protocol-relative paths, backslash evasions, and error routes.
 */
export const isSafePWAPath = (path: unknown): path is string => {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return false;
  }
  // Disallow javascript:, data:, or any protocol schemes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed, 'https://pulsechat.tech');
    if (parsed.origin !== 'https://pulsechat.tech') return false;
    // Do not restore error pages (404, 500, etc.)
    if (parsed.pathname.startsWith('/error/')) return false;
    return true;
  } catch {
    return false;
  }
};

/**
 * Persists the current PWA location into localStorage.
 */
export const savePWALocation = (fullPath: string): void => {
  if (typeof window === 'undefined') return;
  if (!isSafePWAPath(fullPath)) return;
  try {
    localStorage.setItem(PWA_LAST_LOCATION_KEY, fullPath.trim());
  } catch (_) {}
};

/**
 * Retrieves the saved PWA location if valid.
 */
export const getSavedPWALocation = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(PWA_LAST_LOCATION_KEY);
    if (isSafePWAPath(saved)) {
      return saved.trim();
    }
  } catch (_) {}
  return null;
};

/**
 * Clears the saved PWA location (e.g. on logout or intentional reset).
 */
export const clearSavedPWALocation = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PWA_LAST_LOCATION_KEY);
  } catch (_) {}
};

/**
 * Synchronously checks and restores the PWA location before ReactDOM render.
 * Replaces window.history state so BrowserRouter starts directly at the saved route.
 */
export const restorePWALocationPreRender = (): void => {
  if (typeof window === 'undefined') return;
  if (!isRunningAsPWA()) return;

  const currentPath = window.location.pathname;
  // Only restore if the PWA was launched at its root landing page
  if (currentPath !== '/' && currentPath !== '/index.html') return;

  const saved = getSavedPWALocation();
  if (saved && saved !== '/' && saved !== '/index.html') {
    try {
      window.history.replaceState(null, '', saved);
    } catch (_) {}
  }
};

