/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { UserSidebar } from './components/UserSidebar';
import { SideMediaGallery, getMediaDateGroupLabel } from './components/SideMediaGallery';
import { MediaGalleryModal } from './components/modals/MediaGalleryModal';
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

  it('removes item in real time when pulse:message_deleted event is dispatched', async () => {
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
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: mockMediaItems, hasMore: false }),
      } as any)
    );

    render(<SideMediaGallery roomId="test-room" isActive={true} />);

    await waitFor(() => {
      expect(screen.getByTitle('holiday.jpg')).toBeDefined();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('pulse:message_deleted', { detail: { ids: ['msg-img-1'] } }));
    });

    await waitFor(() => {
      expect(screen.queryByTitle('holiday.jpg')).toBeNull();
    });
  });

  it('empties gallery in real time when pulse:chat_cleared event is dispatched', async () => {
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
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: mockMediaItems, hasMore: false }),
      } as any)
    );

    render(<SideMediaGallery roomId="test-room" isActive={true} />);

    await waitFor(() => {
      expect(screen.getByTitle('holiday.jpg')).toBeDefined();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('pulse:chat_cleared', { detail: { roomId: 'test-room' } }));
    });

    await waitFor(() => {
      expect(screen.queryByTitle('holiday.jpg')).toBeNull();
      expect(screen.getByText('No media sent in this room yet')).toBeDefined();
    });
  });

  it('strips trailing punctuation from links before opening', async () => {
    const mockMediaItems = [
      {
        id: 'msg-link-1',
        type: 'text',
        text: 'Check this: https://example.com/page.',
        userId: 'u1',
        username: 'Harsh',
        createdAt: '2026-11-15T10:00:00.000Z',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: mockMediaItems, hasMore: false }),
      } as any)
    );

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<SideMediaGallery roomId="test-room" isActive={true} />);

    await waitFor(() => {
      expect(screen.getByTitle('Open example.com')).toBeDefined();
    });

    const linkCard = screen.getByTitle('Open example.com');
    act(() => {
      fireEvent.click(linkCard);
    });

    expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/page', '_blank', 'noopener,noreferrer');
  });

  it('triggers onShowToast with download message when clicking a doc item', async () => {
    const mockMediaItems = [
      {
        id: 'msg-doc-1',
        type: 'file',
        originalName: 'notes.pdf',
        url: 'https://res.cloudinary.com/test/raw/upload/v1/notes.pdf',
        userId: 'u1',
        username: 'Harsh',
        size: 1024 * 500,
        createdAt: '2026-11-15T10:00:00.000Z',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: mockMediaItems, hasMore: false }),
      } as any)
    );

    const onShowToastMock = vi.fn();
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <SideMediaGallery
        roomId="test-room"
        isActive={true}
        onShowToast={onShowToastMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Download notes.pdf')).toBeDefined();
    });

    const docCard = screen.getByTitle('Download notes.pdf');
    act(() => {
      fireEvent.click(docCard);
    });

    expect(onShowToastMock).toHaveBeenCalledWith('Download started...');
    anchorClickSpy.mockRestore();
  });

  it('opens and renders MediaGalleryModal when allMessages contains disjoint chat messages', () => {
    const sideGalleryItems: Message[] = [
      {
        id: 'hist-img-1',
        type: 'image',
        url: 'https://res.cloudinary.com/test/image/upload/v1/hist1.jpg',
        originalName: 'historical_vacation.jpg',
        userId: 'u1',
        username: 'Harsh',
        timestamp: '2026-11-10T10:00:00.000Z',
        createdAt: '2026-11-10T10:00:00.000Z',
        sender: 'u1',
        text: 'Old photo from last week',
      },
      {
        id: 'hist-vid-2',
        type: 'video',
        url: 'https://res.cloudinary.com/test/video/upload/v1/hist2.mp4',
        originalName: 'historical_recording.mp4',
        userId: 'u2',
        username: 'Alice',
        timestamp: '2026-11-10T10:05:00.000Z',
        createdAt: '2026-11-10T10:05:00.000Z',
        sender: 'u2',
        text: 'Old video',
      },
    ];

    // Current chat feed only has recent text messages (typical production scenario)
    const recentChatFeedMessages: Message[] = [
      {
        id: 'recent-txt-101',
        type: 'text',
        text: 'Hey are you there?',
        userId: 'u1',
        username: 'Harsh',
        timestamp: '2026-11-15T18:00:00.000Z',
        createdAt: '2026-11-15T18:00:00.000Z',
        sender: 'u1',
      },
      {
        id: 'recent-txt-102',
        type: 'text',
        text: 'Yes, just testing the production site!',
        userId: 'u2',
        username: 'Alice',
        timestamp: '2026-11-15T18:01:00.000Z',
        createdAt: '2026-11-15T18:01:00.000Z',
        sender: 'u2',
      },
    ];

    const handleClose = vi.fn();

    render(
      <MediaGalleryModal
        isOpen={true}
        items={sideGalleryItems}
        initialIndex={0}
        allMessages={recentChatFeedMessages}
        onClose={handleClose}
      />
    );

    // Modal must NOT auto-close when items are not in recentChatFeedMessages
    expect(handleClose).not.toHaveBeenCalled();

    // Active item photo should be displayed
    const photo = screen.getByAltText('historical_vacation.jpg');
    expect(photo).toBeDefined();
    expect(photo.getAttribute('src')).toBe('https://res.cloudinary.com/test/image/upload/v1/hist1.jpg');

    // Header counter and sender should be rendered
    expect(screen.getByText('1 / 2')).toBeDefined();
    expect(screen.getByText(/Harsh/)).toBeDefined();
  });

  it('automatically centers the active thumbnail in the bottom filmstrip', async () => {
    const scrollToMock = vi.fn();
    window.HTMLElement.prototype.scrollTo = scrollToMock;

    const manyItems: Message[] = Array.from({ length: 15 }, (_, i) => ({
      id: `item-${i + 1}`,
      type: 'image',
      url: `https://res.cloudinary.com/test/image/upload/v1/pic${i + 1}.jpg`,
      originalName: `photo_${i + 1}.jpg`,
      userId: 'u1',
      username: 'Harsh',
      timestamp: '2026-11-15T10:00:00.000Z',
      createdAt: '2026-11-15T10:00:00.000Z',
      sender: 'u1',
    }));

    const origGetBoundingClientRect = window.HTMLElement.prototype.getBoundingClientRect;
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      return { left: 200, top: 505, width: 48, height: 48, right: 248, bottom: 553 } as DOMRect;
    };

    render(
      <MediaGalleryModal
        isOpen={true}
        items={manyItems}
        initialIndex={7}
        onClose={() => {}}
      />
    );

    // Initial index is 7, so item 8 is active
    expect(screen.getByText('8 / 15')).toBeDefined();

    // scrollTo should be called to center the active thumbnail
    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalled();
    });

    window.HTMLElement.prototype.getBoundingClientRect = origGetBoundingClientRect;
  });

  describe('Media Gallery Date Dividers and Grouping', () => {
    it('correctly calculates date labels in getMediaDateGroupLabel', () => {
      const now = new Date();

      // Empty or invalid
      expect(getMediaDateGroupLabel('')).toBe('');
      expect(getMediaDateGroupLabel(undefined)).toBe('');
      expect(getMediaDateGroupLabel('invalid-date')).toBe('');

      // Today
      expect(getMediaDateGroupLabel(now.toISOString())).toBe('Today');

      // Future (e.g. slight clock skew)
      const future = new Date(now.getTime() + 1000 * 60 * 5);
      expect(getMediaDateGroupLabel(future.toISOString())).toBe('Today');

      // Yesterday
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      expect(getMediaDateGroupLabel(yesterday.toISOString())).toBe('Yesterday');

      // 2 days ago (weekday)
      const twoDaysAgo = new Date(now);
      twoDaysAgo.setDate(now.getDate() - 2);
      const expectedWeekday2 = twoDaysAgo.toLocaleDateString(undefined, { weekday: 'long' });
      expect(getMediaDateGroupLabel(twoDaysAgo.toISOString())).toBe(expectedWeekday2);

      // 4 days ago (weekday)
      const fourDaysAgo = new Date(now);
      fourDaysAgo.setDate(now.getDate() - 4);
      const expectedWeekday4 = fourDaysAgo.toLocaleDateString(undefined, { weekday: 'long' });
      expect(getMediaDateGroupLabel(fourDaysAgo.toISOString())).toBe(expectedWeekday4);

      // 6 days ago (weekday)
      const sixDaysAgo = new Date(now);
      sixDaysAgo.setDate(now.getDate() - 6);
      const expectedWeekday6 = sixDaysAgo.toLocaleDateString(undefined, { weekday: 'long' });
      expect(getMediaDateGroupLabel(sixDaysAgo.toISOString())).toBe(expectedWeekday6);

      // 7 days ago (older -> formatted date)
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      const expectedDate7 = sevenDaysAgo.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      expect(getMediaDateGroupLabel(sevenDaysAgo.toISOString())).toBe(expectedDate7);

      // 30 days ago (older -> formatted date)
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const expectedDate30 = thirtyDaysAgo.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      expect(getMediaDateGroupLabel(thirtyDaysAgo.toISOString())).toBe(expectedDate30);
    });

    it('renders date dividers grouping items by Today, Yesterday, Day of Week, and older Date in SideMediaGallery', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const threeDaysAgo = new Date(now);
      threeDaysAgo.setDate(now.getDate() - 3);
      const tenDaysAgo = new Date(now);
      tenDaysAgo.setDate(now.getDate() - 10);

      const weekdayLabel = threeDaysAgo.toLocaleDateString(undefined, { weekday: 'long' });
      const olderDateLabel = tenDaysAgo.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

      const mockItems = [
        {
          id: 'item-today-1',
          type: 'image',
          url: 'https://res.cloudinary.com/test/image/upload/v1/pic1.jpg',
          originalName: 'today_photo1.jpg',
          createdAt: now.toISOString(),
        },
        {
          id: 'item-today-2',
          type: 'video',
          url: 'https://res.cloudinary.com/test/video/upload/v1/vid1.mp4',
          originalName: 'today_video2.mp4',
          createdAt: now.toISOString(),
        },
        {
          id: 'item-yesterday-1',
          type: 'image',
          url: 'https://res.cloudinary.com/test/image/upload/v1/pic2.jpg',
          originalName: 'yesterday_photo.jpg',
          createdAt: yesterday.toISOString(),
        },
        {
          id: 'item-weekday-1',
          type: 'file',
          url: 'https://res.cloudinary.com/test/raw/upload/v1/report.pdf',
          originalName: 'report.pdf',
          createdAt: threeDaysAgo.toISOString(),
        },
        {
          id: 'item-older-1',
          type: 'text',
          text: 'Visit https://pulsechat.tech for updates',
          createdAt: tenDaysAgo.toISOString(),
        },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: mockItems, hasMore: false }),
        } as any)
      );

      render(<SideMediaGallery roomId="test-room" isActive={true} />);

      await waitFor(() => {
        expect(screen.getByTitle('today_photo1.jpg')).toBeDefined();
        expect(screen.getByTitle('today_video2.mp4')).toBeDefined();
        expect(screen.getByTitle('yesterday_photo.jpg')).toBeDefined();
        expect(screen.getByTitle('Download report.pdf')).toBeDefined();
        expect(screen.getByTitle('Open pulsechat.tech')).toBeDefined();
      });

      // Verify separator dividers
      const separators = screen.getAllByRole('separator');
      expect(separators.length).toBe(4);

      // Today divider (only once, even though there are 2 items for today)
      expect(screen.getByText('Today')).toBeDefined();
      expect(screen.getAllByText('Today').length).toBe(1);

      // Yesterday divider
      expect(screen.getByText('Yesterday')).toBeDefined();

      // Weekday divider (e.g. Sunday/Monday/etc.)
      expect(screen.getByText(weekdayLabel)).toBeDefined();

      // Older date divider (e.g. Nov 7, 2026)
      expect(screen.getByText(olderDateLabel)).toBeDefined();
    });
  });
});
