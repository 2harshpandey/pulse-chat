import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useTabUnreadIndicator,
  formatUnreadTabTitle,
  renderBadgedFaviconFrames,
} from './hooks/useTabUnreadIndicator';
import type { Message } from './types';

interface HarnessProps {
  roomId?: string;
  userId?: string;
  enabled?: boolean;
  baseTitle?: string;
}

const TabUnreadHarness: React.FC<HarnessProps> = ({
  roomId = 'room-1',
  userId = 'me',
  enabled = true,
  baseTitle,
}) => {
  useTabUnreadIndicator({ roomId, userId, enabled, baseTitle });
  return null;
};

const createMockCanvasContext = () => {
  const gradientMock = { addColorStop: vi.fn() };
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradientMock),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
};

describe('Desktop Browser Tab Unread Indicator', () => {
  const originalTitle = document.title;
  const originalUserAgent = navigator.userAgent;
  const originalMatchMedia = window.matchMedia;
  const originalImage = globalThis.Image;
  const originalCreateElement = document.createElement.bind(document);
  let frameCounter = 0;

  const setDesktopEnv = (touch = false, reducedMotion = false) => {
    Object.defineProperty(navigator, 'userAgent', {
      value: touch
        ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      configurable: true,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches:
        query === '(prefers-reduced-motion: reduce)'
          ? reducedMotion
          : !touch && (query.includes('fine') || query.includes('hover')),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  };

  const setVisibilityAndFocus = (visibilityState: 'visible' | 'hidden', focused: boolean) => {
    Object.defineProperty(document, 'visibilityState', {
      value: visibilityState,
      configurable: true,
    });
    document.hasFocus = vi.fn(() => focused);
  };

  const installOriginalFaviconLinks = () => {
    document.head.querySelectorAll('link[rel*="icon"]').forEach((el) => el.remove());
    const ico = originalCreateElement('link');
    ico.rel = 'icon';
    ico.type = 'image/x-icon';
    ico.href = 'http://localhost/favicon.ico';
    const png32 = originalCreateElement('link');
    png32.rel = 'icon';
    png32.type = 'image/png';
    png32.setAttribute('sizes', '32x32');
    png32.href = 'http://localhost/favicon-32x32.png';
    document.head.appendChild(ico);
    document.head.appendChild(png32);
  };

  const emitNewMessage = (partial: Partial<Message>, roomId = 'room-1') => {
    const message: Message = {
      id: partial.id || `msg-${Math.random().toString(36).slice(2)}`,
      userId: partial.userId ?? 'other-user',
      username: partial.username ?? 'Alex',
      text: partial.text ?? 'Hello there',
      type: partial.type ?? 'text',
      timestamp: partial.timestamp ?? new Date().toISOString(),
      createdAt: partial.createdAt ?? new Date().toISOString(),
      ...partial,
    };
    window.dispatchEvent(new CustomEvent('pulse:new_message', { detail: { message, roomId } }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    frameCounter = 0;
    document.title = 'Pulse';
    setDesktopEnv(false, false);
    setVisibilityAndFocus('visible', true);
    installOriginalFaviconLinks();

    class MockImage {
      complete = true;
      naturalWidth = 32;
      onload: (() => void) | null = null;
      private _src = '';
      set src(val: string) {
        this._src = val;
        if (this.onload) this.onload();
      }
      get src() {
        return this._src;
      }
    }
    (globalThis as any).Image = MockImage;

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: any) => {
      const el = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'canvas') {
        const canvas = el as HTMLCanvasElement;
        vi.spyOn(canvas, 'getContext').mockReturnValue(createMockCanvasContext());
        vi.spyOn(canvas, 'toDataURL').mockImplementation(() => {
          frameCounter += 1;
          return `data:image/png;base64,FRAME_${frameCounter}`;
        });
      }
      return el;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.title = originalTitle;
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
    window.matchMedia = originalMatchMedia;
    (globalThis as any).Image = originalImage;
    document.head.querySelectorAll('link[rel*="icon"]').forEach((el) => el.remove());
  });

  it('formats tab title cleanly with bounded count prefix before Pulse', () => {
    expect(formatUnreadTabTitle(0)).toBe('Pulse');
    expect(formatUnreadTabTitle(-2)).toBe('Pulse');
    expect(formatUnreadTabTitle(1)).toBe('(1) Pulse');
    expect(formatUnreadTabTitle(42)).toBe('(42) Pulse');
    expect(formatUnreadTabTitle(105)).toBe('(99+) Pulse');
  });

  it('shows unread prefix before Pulse and animated favicon badge when user is in another tab, and restores on return', () => {
    render(<TabUnreadHarness />);

    // Active visible tab -> incoming messages do not mark tab unread
    act(() => {
      emitNewMessage({ id: 'm1' });
    });
    expect(document.title).toBe('Pulse');
    expect(document.head.querySelector('link[data-pulse-tab-badge="true"]')).toBeNull();

    // User switches to another tab
    setVisibilityAndFocus('hidden', false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      emitNewMessage({ id: 'm2', text: 'Secret message that must never appear in title' });
    });
    expect(document.title).toBe('(1) Pulse');
    expect(document.title).not.toContain('Secret message');
    expect(document.title).not.toContain('Alex');

    const badgeLink = document.head.querySelector('link[data-pulse-tab-badge="true"]') as HTMLLinkElement;
    expect(badgeLink).not.toBeNull();
    const initialHref = badgeLink.href;
    expect(initialHref).toContain('data:image/png;base64,FRAME_');

    // Pulse animation swaps smoothly between frame 0 and frame 1 at 1000ms interval
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(badgeLink.href).not.toBe(initialHref);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(badgeLink.href).toBe(initialHref);

    // Additional message increments count
    act(() => {
      emitNewMessage({ id: 'm3' });
    });
    expect(document.title).toBe('(2) Pulse');

    // User switches back to Pulse tab -> restores original title & favicons
    setVisibilityAndFocus('visible', true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });

    expect(document.title).toBe('Pulse');
    expect(document.head.querySelector('link[data-pulse-tab-badge="true"]')).toBeNull();
    const restoredHrefs = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]')).map(
      (l) => l.getAttribute('href')
    );
    expect(restoredHrefs).toContain('http://localhost/favicon.ico');
    expect(restoredHrefs).toContain('http://localhost/favicon-32x32.png');
  });

  it('triggers when another desktop app/window is focused even if tab remains visible', () => {
    render(<TabUnreadHarness />);

    // Same tab stays visible behind another app window, but window loses focus
    setVisibilityAndFocus('visible', false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    act(() => {
      emitNewMessage({ id: 'm-blur-1' });
    });
    expect(document.title).toBe('(1) Pulse');
    expect(document.head.querySelector('link[data-pulse-tab-badge="true"]')).not.toBeNull();

    // User clicks back into Pulse window
    setVisibilityAndFocus('visible', true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(document.title).toBe('Pulse');
    expect(document.head.querySelector('link[data-pulse-tab-badge="true"]')).toBeNull();
  });

  it('ignores own messages, system notifications, duplicates, and updates on message deletion/clear', () => {
    render(<TabUnreadHarness userId="me" roomId="room-1" />);

    setVisibilityAndFocus('hidden', false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      emitNewMessage({ id: 'own-1', userId: 'me' });
      emitNewMessage({ id: 'sys-1', userId: 'other-user', type: 'system_notification', text: 'Alex joined the chat' });
      emitNewMessage({ id: 'other-room-1', userId: 'other-user' }, 'room-other');
    });
    expect(document.title).toBe('Pulse');

    // Duplicate ID does not double-count
    act(() => {
      emitNewMessage({ id: 'real-1', userId: 'other-user' });
      emitNewMessage({ id: 'real-1', userId: 'other-user' });
      emitNewMessage({ id: 'real-2', userId: 'other-user' });
    });
    expect(document.title).toBe('(2) Pulse');

    // Deleting one unread message updates count to 1; deleting the other clears badge
    act(() => {
      window.dispatchEvent(new CustomEvent('pulse:message_deleted', { detail: { ids: ['real-1'] } }));
    });
    expect(document.title).toBe('(1) Pulse');

    act(() => {
      window.dispatchEvent(new CustomEvent('pulse:message_deleted', { detail: { ids: ['real-2'] } }));
    });
    expect(document.title).toBe('Pulse');
    expect(document.head.querySelector('link[data-pulse-tab-badge="true"]')).toBeNull();

    // Re-add message and clear chat
    act(() => {
      emitNewMessage({ id: 'real-3', userId: 'other-user' });
    });
    expect(document.title).toBe('(1) Pulse');

    act(() => {
      window.dispatchEvent(new CustomEvent('pulse:chat_cleared', { detail: { roomId: 'room-1' } }));
    });
    expect(document.title).toBe('Pulse');
  });

  it('counts genuinely missed incoming messages synced on background reconnect, never initial history', () => {
    render(<TabUnreadHarness userId="me" roomId="room-1" />);

    // Initial history load even if hidden must never mark messages unread
    setVisibilityAndFocus('hidden', false);
    act(() => {
      window.dispatchEvent(
        new CustomEvent('pulse:history_synced', {
          detail: {
            roomId: 'room-1',
            isInitial: true,
            messages: [
              { id: 'h1', userId: 'other', type: 'text', createdAt: '2026-11-25T10:00:00.000Z' },
            ],
          },
        })
      );
    });
    expect(document.title).toBe('Pulse');

    // Subsequent reconnect sync while still idle catches strictly newer incoming messages only
    act(() => {
      window.dispatchEvent(
        new CustomEvent('pulse:history_synced', {
          detail: {
            roomId: 'room-1',
            isInitial: false,
            messages: [
              { id: 'h1', userId: 'other', type: 'text', createdAt: '2026-11-25T10:00:00.000Z' },
              { id: 'h2', userId: 'me', type: 'text', createdAt: '2026-11-25T10:01:00.000Z' },
              { id: 'h3', userId: 'other', type: 'text', createdAt: '2026-11-25T10:02:00.000Z' },
            ],
          },
        })
      );
    });
    expect(document.title).toBe('(1) Pulse');
  });

  it('does nothing on touch-only mobile/tablet devices', () => {
    setDesktopEnv(true, false);
    render(<TabUnreadHarness />);

    setVisibilityAndFocus('hidden', false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      emitNewMessage({ id: 'mobile-ignored-1' });
    });

    expect(document.title).toBe('Pulse');
    expect(document.head.querySelector('link[data-pulse-tab-badge="true"]')).toBeNull();
  });

  it('clears indicator when tab is disabled/displaced and avoids overwriting custom titles if never applied', () => {
    const { rerender } = render(<TabUnreadHarness enabled={true} />);

    setVisibilityAndFocus('hidden', false);
    act(() => {
      emitNewMessage({ id: 'disp-1' });
    });
    expect(document.title).toBe('(1) Pulse');

    // Displaced in favor of another tab -> clears immediately
    rerender(<TabUnreadHarness enabled={false} />);
    expect(document.title).toBe('Pulse');
    expect(document.head.querySelector('link[data-pulse-tab-badge="true"]')).toBeNull();

    // Unmounting after navigation set a custom title without unread badge preserves custom title
    document.title = 'Pulse - Admin Panel';
    const { unmount } = render(<TabUnreadHarness enabled={true} />);
    unmount();
    expect(document.title).toBe('Pulse - Admin Panel');
  });

  it('respects prefers-reduced-motion by keeping static badge frame without interval churn', () => {
    setDesktopEnv(false, true);
    render(<TabUnreadHarness />);

    setVisibilityAndFocus('hidden', false);
    act(() => {
      emitNewMessage({ id: 'rm-1' });
    });

    const badgeLink = document.head.querySelector('link[data-pulse-tab-badge="true"]') as HTMLLinkElement;
    const hrefAtStart = badgeLink.href;

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(badgeLink.href).toBe(hrefAtStart);
  });

  it('renders two distinct canvas favicon frames cleanly even without loaded base image', () => {
    const frames = renderBadgedFaviconFrames(5, null);
    expect(frames).not.toBeNull();
    expect(frames![0]).toContain('data:image/png;base64,');
    expect(frames![1]).toContain('data:image/png;base64,');
    expect(frames![0]).not.toBe(frames![1]);
  });

  it('preserves dynamic route baseTitle when showing and clearing unread count', () => {
    const { rerender } = render(<TabUnreadHarness baseTitle="Global Chat - Pulse" />);
    setVisibilityAndFocus('hidden', false);

    act(() => {
      emitNewMessage({ id: 'base-title-1' });
    });
    expect(document.title).toBe('(1) Global Chat - Pulse');

    // Room title finishes resolving while still idle
    rerender(<TabUnreadHarness baseTitle="Lounge - Pulse" />);
    expect(document.title).toBe('(1) Lounge - Pulse');

    setVisibilityAndFocus('visible', true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(document.title).toBe('Lounge - Pulse');
  });
});
