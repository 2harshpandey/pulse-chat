/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PWA_LAST_LOCATION_KEY,
  isRunningAsPWA,
  isSafePWAPath,
  savePWALocation,
  getSavedPWALocation,
  clearSavedPWALocation,
  restorePWALocationPreRender,
} from './pwaLocation';

describe('PWA Location Persistence & Restoration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('isRunningAsPWA detection', () => {
    it('returns false in standard browser viewport', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      delete (window.navigator as any).standalone;

      expect(isRunningAsPWA()).toBe(false);
    });

    it('returns true when display-mode: standalone matches', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: standalone'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(isRunningAsPWA()).toBe(true);
    });

    it('returns true when iOS navigator.standalone is true', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      (window.navigator as any).standalone = true;

      expect(isRunningAsPWA()).toBe(true);
    });

    it('returns true when window-controls-overlay matches', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: window-controls-overlay'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      delete (window.navigator as any).standalone;

      expect(isRunningAsPWA()).toBe(true);
    });
  });

  describe('isSafePWAPath validation', () => {
    it('allows valid internal relative paths', () => {
      expect(isSafePWAPath('/')).toBe(true);
      expect(isSafePWAPath('/room')).toBe(true);
      expect(isSafePWAPath('/room/alpha-room')).toBe(true);
      expect(isSafePWAPath('/me')).toBe(true);
      expect(isSafePWAPath('/admin')).toBe(true);
      expect(isSafePWAPath('/admin/alpha-room')).toBe(true);
      expect(isSafePWAPath('/about-developer')).toBe(true);
      expect(isSafePWAPath('/join/sample-invite-token')).toBe(true);
      expect(isSafePWAPath('/room/beta?filter=photo#active')).toBe(true);
    });

    it('rejects external URLs, open redirects, and protocol relative paths', () => {
      expect(isSafePWAPath('https://evil.com')).toBe(false);
      expect(isSafePWAPath('http://attacker.org/room')).toBe(false);
      expect(isSafePWAPath('//evil.com/room')).toBe(false);
      expect(isSafePWAPath('/\\evil.com')).toBe(false);
      expect(isSafePWAPath('javascript:alert(1)')).toBe(false);
      expect(isSafePWAPath('data:text/html,<h1>XSS</h1>')).toBe(false);
      expect(isSafePWAPath(null)).toBe(false);
      expect(isSafePWAPath(undefined)).toBe(false);
      expect(isSafePWAPath('')).toBe(false);
    });

    it('rejects error routes so users are never trapped on crash pages', () => {
      expect(isSafePWAPath('/error/404')).toBe(false);
      expect(isSafePWAPath('/error/500')).toBe(false);
      expect(isSafePWAPath('/error/403')).toBe(false);
      expect(isSafePWAPath('/error/429')).toBe(false);
    });
  });

  describe('save, get, and clear PWA location', () => {
    it('saves and retrieves valid path from localStorage', () => {
      savePWALocation('/room/test-123');
      expect(getSavedPWALocation()).toBe('/room/test-123');
      expect(localStorage.getItem(PWA_LAST_LOCATION_KEY)).toBe('/room/test-123');
    });

    it('does not save unsafe paths', () => {
      savePWALocation('https://malicious.com');
      expect(getSavedPWALocation()).toBeNull();
      expect(localStorage.getItem(PWA_LAST_LOCATION_KEY)).toBeNull();
    });

    it('clears saved path on clearSavedPWALocation', () => {
      savePWALocation('/admin/general');
      expect(getSavedPWALocation()).toBe('/admin/general');

      clearSavedPWALocation();
      expect(getSavedPWALocation()).toBeNull();
      expect(localStorage.getItem(PWA_LAST_LOCATION_KEY)).toBeNull();
    });
  });

  describe('restorePWALocationPreRender', () => {
    it('does nothing when not running as PWA', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false } as any));
      delete (window.navigator as any).standalone;
      savePWALocation('/room/crypto-chat');

      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      restorePWALocationPreRender();

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('restores saved chat room route when running in PWA at root /', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: standalone'),
      } as any));

      savePWALocation('/room/my-secret-room');

      // Emulate initial launch at root /
      window.history.replaceState(null, '', '/');
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      restorePWALocationPreRender();

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/room/my-secret-room');
    });

    it('restores room admin panel location so user lands on admin login on reopening PWA', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: standalone'),
      } as any));

      savePWALocation('/admin/room-alpha');

      window.history.replaceState(null, '', '/');
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      restorePWALocationPreRender();

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/admin/room-alpha');
    });

    it('restores /room list page when cut from /room', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: standalone'),
      } as any));

      savePWALocation('/room');

      window.history.replaceState(null, '', '/');
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      restorePWALocationPreRender();

      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/room');
    });

    it('does not overwrite deep link when PWA is launched directly with a room URL', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: standalone'),
      } as any));

      savePWALocation('/room/old-room');

      // User clicked a shared link to /room/new-room
      window.history.replaceState(null, '', '/room/new-room');
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      restorePWALocationPreRender();

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('does nothing when saved location is already /', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: standalone'),
      } as any));

      savePWALocation('/');

      window.history.replaceState(null, '', '/');
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      restorePWALocationPreRender();

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });
  });
});

