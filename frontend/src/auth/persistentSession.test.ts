import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSessionToken, setSessionToken, removeSessionToken } from '../chat/utils';
import { getSessionToken as getAuthSessionToken, setSessionToken as setAuthSessionToken, removeSessionToken as removeAuthSessionToken } from './utils';

describe('Persistent Session Token Management', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(';').forEach(c => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists session token across simulated browser tab closure (sessionStorage wiped)', () => {
    const testToken = 'pls.payload_abc.sig_123';
    setSessionToken(testToken);

    // Verify token is in both storages initially
    expect(localStorage.getItem('pulseSessionToken')).toBe(testToken);
    expect(sessionStorage.getItem('pulseSessionToken')).toBe(testToken);

    // Simulate browser tab closure (browser clears sessionStorage)
    sessionStorage.clear();
    expect(sessionStorage.getItem('pulseSessionToken')).toBeNull();

    // Reopening tab: getSessionToken restores the session from localStorage
    const restored = getSessionToken();
    expect(restored).toBe(testToken);

    // And re-populates sessionStorage mirror
    expect(sessionStorage.getItem('pulseSessionToken')).toBe(testToken);
  });

  it('supports room-scoped persistent session tokens without cross-room clobbering', () => {
    const tokenRoomA = 'pls.token_room_a.sig_aaa';
    const tokenRoomB = 'pls.token_room_b.sig_bbb';

    setSessionToken(tokenRoomA, 'room-alpha');
    setSessionToken(tokenRoomB, 'room-beta');

    // Simulate tab close
    sessionStorage.clear();

    expect(getSessionToken('room-alpha')).toBe(tokenRoomA);
    expect(getSessionToken('room-beta')).toBe(tokenRoomB);
  });

  it('removes session tokens completely on explicit logout', () => {
    const testToken = 'pls.logout_test.sig_999';
    setSessionToken(testToken, 'private-room');

    expect(getSessionToken('private-room')).toBe(testToken);

    removeSessionToken('private-room');

    expect(getSessionToken('private-room')).toBeNull();
    expect(getSessionToken()).toBeNull();
    expect(localStorage.getItem('pulseSessionToken')).toBeNull();
    expect(localStorage.getItem('pulseSessionToken_private-room')).toBeNull();
    expect(sessionStorage.getItem('pulseSessionToken')).toBeNull();
    expect(sessionStorage.getItem('pulseSessionToken_private-room')).toBeNull();
  });

  it('auth utils mirrors chat utils behavior seamlessly', () => {
    const token = 'pls.auth_util_test.sig_777';
    setAuthSessionToken(token, 'me');

    sessionStorage.clear();
    expect(getAuthSessionToken('me')).toBe(token);

    removeAuthSessionToken('me');
    expect(getAuthSessionToken('me')).toBeNull();
  });
});
