import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, renderHook, act } from '@testing-library/react';
import { AdminLoginModal } from './components/AdminLoginModal';
import { useHomeController } from './hooks/useHomeController';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock ThemeContext
vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    isDark: true,
    toggleTheme: vi.fn(),
  }),
}));

describe('AdminLoginModal - Case Insensitive Room Input', () => {
  it('normalizes room ID input and pasted links case-insensitively', () => {
    let adminRoomId = '';
    const setAdminRoomId = vi.fn((val: string) => {
      adminRoomId = val;
    });

    const { getByPlaceholderText } = render(
      <AdminLoginModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        adminRoomId={adminRoomId}
        setAdminRoomId={setAdminRoomId}
        adminPassword=""
        setAdminPassword={vi.fn()}
        isPasswordVisible={false}
        setIsPasswordVisible={vi.fn()}
        adminError=""
        setAdminError={vi.fn()}
        isLoading={false}
        passwordInputRef={{ current: null }}
      />
    );

    const input = getByPlaceholderText('e.g. dev_lounge, global, or full link');

    // 1. Typing "/global" or "/GLOBAL"
    fireEvent.change(input, { target: { value: '/GLOBAL' } });
    expect(setAdminRoomId).toHaveBeenCalledWith('global');

    // 2. Typing "/me" or "/ME"
    fireEvent.change(input, { target: { value: '/ME' } });
    expect(setAdminRoomId).toHaveBeenCalledWith('me');

    // 3. Pasting full admin URL "https://pulsechat.tech/admin/GLOBAL"
    fireEvent.change(input, { target: { value: 'https://pulsechat.tech/admin/GLOBAL' } });
    expect(setAdminRoomId).toHaveBeenCalledWith('global');

    // 4. Pasting room URL "https://pulsechat.tech/room/Dev_Lounge"
    fireEvent.change(input, { target: { value: 'https://pulsechat.tech/room/Dev_Lounge' } });
    expect(setAdminRoomId).toHaveBeenCalledWith('Dev_Lounge');

    // 5. Typing custom room ID with mixed casing
    fireEvent.change(input, { target: { value: 'Dev_Lounge' } });
    expect(setAdminRoomId).toHaveBeenCalledWith('Dev_Lounge');
  });
});

describe('useHomeController - Case Insensitive Admin Login Form', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockNavigate.mockClear();
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('normalizes uppercase "GLOBAL" and navigates to canonical /admin/global', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/rooms/GLOBAL/meta') || url.includes('/api/rooms/global/meta')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'global', name: 'Global Chat' }),
        });
      }
      if (url.includes('/api/admin/users')) {
        expect(init?.headers).toMatchObject({
          'x-room-id': 'global',
          'x-admin-password': 'secret_password',
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const { result } = renderHook(() => useHomeController());

    act(() => {
      result.current.setAdminRoomId('GLOBAL');
      result.current.setAdminPassword('secret_password');
    });

    await act(async () => {
      await result.current.handleAdminSubmit({ preventDefault: vi.fn() } as any);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/admin/global', {
      state: { autoLoginPassword: 'secret_password' },
    });
    expect(result.current.adminError).toBe('');
  });

  it('normalizes uppercase "ME" and navigates to /admin/me', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/rooms/ME/meta') || url.includes('/api/rooms/me/meta')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'me', name: 'Private Room' }),
        });
      }
      if (url.includes('/api/admin/users')) {
        expect(init?.headers).toMatchObject({
          'x-room-id': 'me',
          'x-admin-password': 'secret_password',
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const { result } = renderHook(() => useHomeController());

    act(() => {
      result.current.setAdminRoomId('ME');
      result.current.setAdminPassword('secret_password');
    });

    await act(async () => {
      await result.current.handleAdminSubmit({ preventDefault: vi.fn() } as any);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/admin/me', {
      state: { autoLoginPassword: 'secret_password' },
    });
    expect(result.current.adminError).toBe('');
  });

  it('resolves canonical room id case-insensitively for custom rooms via metadata and navigates cleanly', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/rooms/DEV_LOUNGE/meta')) {
        // Returns canonical ID "Dev_Lounge"
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'Dev_Lounge', name: 'Developer Lounge' }),
        });
      }
      if (url.includes('/api/admin/users')) {
        expect(init?.headers).toMatchObject({
          'x-room-id': 'Dev_Lounge',
          'x-admin-password': 'room_admin_pw',
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const { result } = renderHook(() => useHomeController());

    act(() => {
      result.current.setAdminRoomId('DEV_LOUNGE');
      result.current.setAdminPassword('room_admin_pw');
    });

    await act(async () => {
      await result.current.handleAdminSubmit({ preventDefault: vi.fn() } as any);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/admin/Dev_Lounge', {
      state: { autoLoginPassword: 'room_admin_pw' },
    });
    expect(result.current.adminError).toBe('');
  });

  it('handles full admin URL pasted into the form and navigates to the extracted room', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/rooms/dev_lounge/meta')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'Dev_Lounge', name: 'Developer Lounge' }),
        });
      }
      if (url.includes('/api/admin/users')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const { result } = renderHook(() => useHomeController());

    act(() => {
      result.current.setAdminRoomId('https://pulsechat.tech/admin/dev_lounge');
      result.current.setAdminPassword('room_admin_pw');
    });

    await act(async () => {
      await result.current.handleAdminSubmit({ preventDefault: vi.fn() } as any);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/admin/Dev_Lounge', {
      state: { autoLoginPassword: 'room_admin_pw' },
    });
  });
});

