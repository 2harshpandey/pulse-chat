import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '../ThemeContext';
import { UserProvider } from '../UserContext';
import Chat from '../Chat';
import { setSessionToken, getSessionToken, removeSessionToken, setUserIdForRoom, getStoredRoomProfile } from './utils';

const encodePayload = (obj: Record<string, unknown>) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('Room Session Isolation & Nonexistent Room Navigation', () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(';').forEach((c) => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
    });
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
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    window.matchMedia = originalMatchMedia;
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('preserves /me session token, userId, and login when visiting a nonexistent room like /room/fgdgrtggd', async () => {
    const meUserId = 'u_harsh_original_123';
    const meToken = `pls.${encodePayload({ userId: meUserId, roomId: 'me', iat: Date.now() })}.sig_me`;

    localStorage.setItem('pulseUsername', 'Harsh');
    localStorage.setItem('pulseUsername_me', 'Harsh');
    localStorage.setItem('pulseRoomId', 'me');
    setUserIdForRoom(meUserId, 'me');
    setSessionToken(meToken, 'me');

    const wsConstructorSpy = vi.fn();
    (globalThis as any).WebSocket = wsConstructorSpy;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/rooms/fgdgrtggd/meta')) {
        return new Response(JSON.stringify({ error: 'Room not found.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as any;

    const rInvalid = render(
      <MemoryRouter initialEntries={['/room/fgdgrtggd']}>
        <ThemeProvider>
          <UserProvider>
            <Routes>
              <Route path="/room/:roomId" element={<Chat />} />
              <Route path="/me" element={<Chat isMe={true} />} />
            </Routes>
          </UserProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Room not found.')).toBeDefined();
    });

    // Must NOT open a WebSocket or overwrite /me's stored room/session!
    expect(wsConstructorSpy).not.toHaveBeenCalled();
    expect(getSessionToken('me')).toBe(meToken);
    expect(localStorage.getItem('pulseRoomId')).toBe('me');
    expect(localStorage.getItem('pulseUsername')).toBe('Harsh');
    expect(localStorage.getItem('pulseUserId')).toBe(meUserId);

    rInvalid.unmount();

    // Returning to /me still resolves the exact original profile without prompting for password
    const restoredProfile = getStoredRoomProfile('me');
    expect(restoredProfile).toEqual({
      userId: meUserId,
      username: 'Harsh',
      roomId: 'me',
    });
  });

  it('retains /me stored profile after logging out from a different room, and clears /me on explicit /me logout', () => {
    const meUserId = 'u_me_owner_999';
    const meToken = `pls.${encodePayload({ userId: meUserId, roomId: 'me', iat: Date.now() })}.sig_me`;
    const otherToken = `pls.${encodePayload({ userId: 'u_other_111', roomId: 'other_room', iat: Date.now() })}.sig_other`;

    localStorage.setItem('pulseUsername', 'Harsh');
    localStorage.setItem('pulseUsername_me', 'Harsh');
    localStorage.setItem('pulseUsername_other_room', 'Harsh');
    setUserIdForRoom(meUserId, 'me');
    setSessionToken(meToken, 'me');
    setSessionToken(otherToken, 'other_room');

    // Logout from other_room ONLY removes other_room token
    localStorage.removeItem('pulseUsername');
    localStorage.removeItem('pulseRoomId');
    removeSessionToken('other_room');

    // /me profile still restores with exact original userId and username
    expect(getStoredRoomProfile('me')).toEqual({
      userId: meUserId,
      username: 'Harsh',
      roomId: 'me',
    });

    // Explicit logout of /me removes /me token -> getStoredRoomProfile('me') becomes null
    removeSessionToken('me');
    expect(getStoredRoomProfile('me')).toBeNull();
  });
});
