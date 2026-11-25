import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatPageTitle, getRoomDisplayLabel, sanitizeTitleSegment, useDocumentTitle } from './pageTitle';
import { ThemeProvider } from './ThemeContext';
import { UserProvider } from './UserContext';
import Home from './Home';
import Rooms from './Rooms';
import Auth from './Auth';
import Admin from './Admin';
import { NotFoundPage, ForbiddenPage, ServerErrorPage } from './ErrorPages';
import { ChatHeader } from './chat/components/ChatHeader';

const LocationTracker: React.FC = () => {
  const loc = useLocation();
  return <div data-testid="current-path">{loc.pathname}</div>;
};

describe('Page Titles & Consistent Brand Logo Home Navigation', () => {
  const originalTitle = document.title;
  const originalFetch = globalThis.fetch;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    document.title = 'Pulse';
    localStorage.clear();
    sessionStorage.clear();
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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'room123',
        name: 'Design Room',
        requiresPassword: false,
        rooms: [],
        hasMore: false,
      }),
    } as any);
  });

  afterEach(() => {
    document.title = originalTitle;
    globalThis.fetch = originalFetch;
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('sanitizes control characters and formats route/room titles safely without exposing invite tokens', () => {
    expect(sanitizeTitleSegment('  Hello\n\r\tWorld  ')).toBe('Hello World');
    expect(formatPageTitle('Home')).toBe('Home - Pulse');
    expect(formatPageTitle('')).toBe('Pulse');
    expect(getRoomDisplayLabel('global')).toBe('Global Chat');
    expect(getRoomDisplayLabel('me')).toBe('Private Room');
    expect(getRoomDisplayLabel('abc', 'Study Group')).toBe('Study Group');
    expect(getRoomDisplayLabel('abc')).toBe('Room abc');
    // Temp invite links without resolved name must never expose tokens
    expect(getRoomDisplayLabel('secret-token-xyz', undefined, true)).toBe('Invite Room');
  });

  it('sets distinct document.title across Home, Explore Rooms, Room Login, Admin Login/Panel, and Error pages', () => {
    const rHome = render(
      <MemoryRouter initialEntries={['/']}>
        <ThemeProvider>
          <UserProvider>
            <Home />
          </UserProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(document.title).toBe('Home - Pulse');
    rHome.unmount();

    const rRooms = render(
      <MemoryRouter initialEntries={['/room']}>
        <ThemeProvider>
          <UserProvider>
            <Rooms />
          </UserProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(document.title).toBe('Explore Rooms - Pulse');
    rRooms.unmount();

    const rAuth = render(
      <MemoryRouter initialEntries={['/room/global']}>
        <ThemeProvider>
          <UserProvider>
            <Auth onAuthSuccess={vi.fn()} roomId="global" />
          </UserProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(document.title).toBe('Join Global Chat - Pulse');
    rAuth.unmount();

    const rMainAdmin = render(
      <MemoryRouter initialEntries={['/admin']}>
        <ThemeProvider>
          <Routes>
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(document.title).toBe('Main Admin Login - Pulse');
    rMainAdmin.unmount();

    const rRoomAdmin = render(
      <MemoryRouter initialEntries={['/admin/room123']}>
        <ThemeProvider>
          <Routes>
            <Route path="/admin/:roomId" element={<Admin />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(document.title).toBe('Admin Login: Room room123 - Pulse');
    rRoomAdmin.unmount();

    const r404 = render(
      <MemoryRouter>
        <ThemeProvider>
          <NotFoundPage />
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(document.title).toBe('404 Page Not Found - Pulse');
    r404.unmount();

    const r403 = render(
      <MemoryRouter>
        <ThemeProvider>
          <ForbiddenPage />
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(document.title).toBe('403 Access Denied - Pulse');
    r403.unmount();

    const r500 = render(
      <MemoryRouter>
        <ThemeProvider>
          <ServerErrorPage />
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(document.title).toBe('500 Internal Server Error - Pulse');
    r500.unmount();
  });

  it('only resets document.title on unmount if no newer route already updated it', () => {
    const TitleComp: React.FC<{ title: string }> = ({ title }) => {
      useDocumentTitle(title);
      return null;
    };
    const r = render(<TitleComp title="Old Route - Pulse" />);
    expect(document.title).toBe('Old Route - Pulse');
    document.title = 'New Route - Pulse';
    r.unmount();
    expect(document.title).toBe('New Route - Pulse');
  });

  it('navigates directly to Home (/) without page reload when clicking Pulse logo/brand text on Login, Admin Login, ChatHeader, and Error pages', () => {
    // 1. Auth Login card brand link
    const rAuth = render(
      <MemoryRouter initialEntries={['/me']}>
        <ThemeProvider>
          <LocationTracker />
          <Routes>
            <Route path="/me" element={<Auth onAuthSuccess={vi.fn()} roomId="me" />} />
            <Route path="/" element={<div>Home Destination</div>} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('current-path').textContent).toBe('/me');
    fireEvent.click(screen.getByLabelText('Go to Pulse Home'));
    expect(screen.getByTestId('current-path').textContent).toBe('/');
    rAuth.unmount();

    // 2. Admin Login brand link
    const rAdmin = render(
      <MemoryRouter initialEntries={['/admin']}>
        <ThemeProvider>
          <LocationTracker />
          <Routes>
            <Route path="/admin" element={<Admin />} />
            <Route path="/" element={<div>Home Destination</div>} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('current-path').textContent).toBe('/admin');
    fireEvent.click(screen.getByLabelText('Go to Pulse Home'));
    expect(screen.getByTestId('current-path').textContent).toBe('/');
    rAdmin.unmount();

    // 3. Error Page brand link
    const rErr = render(
      <MemoryRouter initialEntries={['/error/404']}>
        <ThemeProvider>
          <LocationTracker />
          <Routes>
            <Route path="/error/404" element={<NotFoundPage />} />
            <Route path="/" element={<div>Home Destination</div>} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('current-path').textContent).toBe('/error/404');
    fireEvent.click(screen.getByLabelText('Go to Pulse Home'));
    expect(screen.getByTestId('current-path').textContent).toBe('/');
    rErr.unmount();

    // 4. ChatHeader brand link calls onNavigateHome smoothly without full reload
    const onNavigateHome = vi.fn();
    const rChatHeader = render(
      <ChatHeader
        isConnected={true}
        isBrowserOnline={true}
        isSoundEnabled={true}
        isSoundToggleAnimating={false}
        onToggleSound={vi.fn()}
        isDark={true}
        onToggleTheme={vi.fn()}
        isSearchActive={false}
        isSearchClosing={false}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        onOpenSearch={vi.fn()}
        onCloseSearch={vi.fn()}
        isUserListVisible={false}
        onToggleUserList={vi.fn()}
        onNavigateHome={onNavigateHome}
      />
    );
    const chatBrandLink = screen.getByLabelText('Go to Pulse Home');
    expect(chatBrandLink.getAttribute('href')).toBe('/');
    const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
    chatBrandLink.dispatchEvent(clickEvt);
    expect(clickEvt.defaultPrevented).toBe(true);
    expect(onNavigateHome).toHaveBeenCalledTimes(1);
    rChatHeader.unmount();
  });

  it('includes complete 1200x630 Open Graph and Twitter summary_large_image tags backed by public/og-image.png', () => {
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    expect(html).toContain('<meta property="og:image" content="https://pulsechat.tech/og-image.png" />');
    expect(html).toContain('<meta property="og:image:type" content="image/png" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta name="twitter:image" content="https://pulsechat.tech/og-image.png" />');

    const ogImgPath = path.resolve(process.cwd(), 'public', 'og-image.png');
    const buf = fs.readFileSync(ogImgPath);
    // Verify PNG magic signature and 1200x630 IHDR dimensions
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(buf.toString('ascii', 12, 16)).toBe('IHDR');
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });
});
