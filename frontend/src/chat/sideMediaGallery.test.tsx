/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { UserSidebar } from './components/UserSidebar';
import { SideMediaGallery } from './components/SideMediaGallery';
import type { Message } from './types';

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
if (typeof window !== 'undefined') {
  window.IntersectionObserver = MockIntersectionObserver as any;
}

describe('Media Viewer Side Panel and Tab Switching', () => {
  const mockOnlineUsers = [
    { userId: 'u1', username: 'Harsh' },
    { userId: 'u2', username: 'Alice' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Online tab as active by default and displays online users', () => {
    render(
      <UserSidebar
        isVisible={true}
        onClose={vi.fn()}
        onlineUsers={mockOnlineUsers}
        currentUserId="u1"
        roomId="me"
        onClearChat={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    const onlineTab = screen.getByRole('tab', { name: /^Online$/i });
    const mediaTab = screen.getByRole('tab', { name: /^Media$/i });

    expect(onlineTab.getAttribute('aria-selected')).toBe('true');
    expect(mediaTab.getAttribute('aria-selected')).toBe('false');

    expect(screen.getByText('Online (2)')).toBeDefined();
    expect(screen.getByText(/Harsh \(You\)/i)).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('switches to Media tab when Media button is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [],
            hasMore: false,
          }),
      } as any)
    );

    render(
      <UserSidebar
        isVisible={true}
        onClose={vi.fn()}
        onlineUsers={mockOnlineUsers}
        currentUserId="u1"
        roomId="me"
        onClearChat={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    const mediaTab = screen.getByRole('tab', { name: /^Media$/i });
    act(() => {
      fireEvent.click(mediaTab);
    });

    expect(mediaTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /^Online$/i }).getAttribute('aria-selected')).toBe('false');

    // Filter chips should be visible
    expect(screen.getByRole('tab', { name: 'Photos' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Videos' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Docs' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Links' })).toBeDefined();
  });

  it('resets to Online tab when sidebar is closed and reopened (mobile toggle behavior)', () => {
    const { rerender } = render(
      <UserSidebar
        isVisible={true}
        onClose={vi.fn()}
        onlineUsers={mockOnlineUsers}
        currentUserId="u1"
        roomId="me"
        onClearChat={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    // Switch to Media tab
    const mediaTab = screen.getByRole('tab', { name: /^Media$/i });
    act(() => {
      fireEvent.click(mediaTab);
    });
    expect(mediaTab.getAttribute('aria-selected')).toBe('true');

    // Simulate closing sidebar
    rerender(
      <UserSidebar
        isVisible={false}
        onClose={vi.fn()}
        onlineUsers={mockOnlineUsers}
        currentUserId="u1"
        roomId="me"
        onClearChat={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    // Simulate reopening sidebar (e.g. mobile button clicked)
    rerender(
      <UserSidebar
        isVisible={true}
        onClose={vi.fn()}
        onlineUsers={mockOnlineUsers}
        currentUserId="u1"
        roomId="me"
        onClearChat={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    // Must be reset back to Online tab by default
    const onlineTab = screen.getByRole('tab', { name: /^Online$/i });
    expect(onlineTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Online (2)')).toBeDefined();
  });


  it('implements mutually exclusive single-select toggle on filters', async () => {
    let requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((req: any) => {
      requestedUrls.push(String(req));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], hasMore: false }),
      } as any);
    });

    render(
      <SideMediaGallery
        roomId="test-room"
        isActive={true}
      />
    );

    const photosChip = screen.getByRole('tab', { name: 'Photos' });
    const videosChip = screen.getByRole('tab', { name: 'Videos' });

    // Initial state: no filter active
    expect(photosChip.getAttribute('aria-selected')).toBe('false');
    expect(videosChip.getAttribute('aria-selected')).toBe('false');

    // Click Photos -> applies Photos filter
    act(() => {
      fireEvent.click(photosChip);
    });
    expect(photosChip.getAttribute('aria-selected')).toBe('true');
    expect(videosChip.getAttribute('aria-selected')).toBe('false');

    // Click Videos -> removes Photos, applies Videos
    act(() => {
      fireEvent.click(videosChip);
    });
    expect(photosChip.getAttribute('aria-selected')).toBe('false');
    expect(videosChip.getAttribute('aria-selected')).toBe('true');

    // Click Videos again -> removes Videos (toggles off)
    act(() => {
      fireEvent.click(videosChip);
    });
    expect(photosChip.getAttribute('aria-selected')).toBe('false');
    expect(videosChip.getAttribute('aria-selected')).toBe('false');
  });

  it('scrolls the filter bar horizontally when mouse wheel event is fired on desktop', () => {
    render(<SideMediaGallery roomId="test-room" isActive={true} />);
    const filterBar = screen.getByRole('tablist', { name: /media filters/i });
    expect(filterBar.scrollLeft).toBe(0);

    act(() => {
      fireEvent.wheel(filterBar, { deltaY: 85 });
    });
    expect(filterBar.scrollLeft).toBe(85);
  });

  it('clicking a photo or video thumbnail triggers openMediaGallery with all playable items and initialIndex', async () => {
    const mockMediaItems = [
      {
        id: 'msg-img-1',
        type: 'image',
        url: 'https://res.cloudinary.com/test/image/upload/v1/pic1.jpg',
        originalName: 'holiday.jpg',
        userId: 'u1',
        username: 'Harsh',
        createdAt: '2026-11-15T10:00:00.000Z',
      },
      {
        id: 'msg-vid-2',
        type: 'video',
        url: 'https://res.cloudinary.com/test/video/upload/v1/vid1.mp4',
        originalName: 'clip.mp4',
        userId: 'u2',
        username: 'Alice',
        createdAt: '2026-11-15T10:05:00.000Z',
        duration: 35,
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: mockMediaItems, hasMore: false }),
      } as any)
    );

    const mockOpenMediaGallery = vi.fn();
    const mockOpenLightbox = vi.fn();

    render(
      <SideMediaGallery
        roomId="test-room"
        isActive={true}
        openMediaGallery={mockOpenMediaGallery}
        openLightbox={mockOpenLightbox}
      />
    );

    // Wait for items to load
    await waitFor(() => {
      expect(screen.getByTitle('holiday.jpg')).toBeDefined();
      expect(screen.getByTitle('clip.mp4')).toBeDefined();
    });

    // Click on the video
    const videoTile = screen.getByTitle('clip.mp4');
    act(() => {
      fireEvent.click(videoTile);
    });

    expect(mockOpenMediaGallery).toHaveBeenCalledTimes(1);
    const [itemsPassed, initialIndexPassed, optionsPassed] = mockOpenMediaGallery.mock.calls[0];

    // Both playable items should be in the gallery
    expect(itemsPassed).toHaveLength(2);
    // Initial index should be 1 (the clicked video)
    expect(initialIndexPassed).toBe(1);
    expect(optionsPassed).toEqual({ autoPlayVideo: true });
  });
});
