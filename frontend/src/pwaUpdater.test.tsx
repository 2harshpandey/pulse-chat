import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_KEY,
  SW_UPDATE_CHECK_DEBOUNCE_MS,
  __markSWUpdatePendingForTests,
  __resetPWAUpdaterForTests,
  importWithChunkRetry,
  initPWAUpdater,
  isChunkLoadError,
  lazyWithRetry,
  tryReloadForStaleChunk,
} from './pwaUpdater';

interface MockServiceWorkerContainer {
  controller: ServiceWorker | null;
  register: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, fn: EventListener) => void;
  removeEventListener: (type: string, fn: EventListener) => void;
  dispatch: (type: string) => void;
}

function createMockServiceWorkerEnv(initialController: ServiceWorker | null) {
  const containerListeners = new Map<string, Set<EventListener>>();
  const regListeners = new Map<string, Set<EventListener>>();

  const registration = {
    waiting: null as ServiceWorker | null,
    installing: null as ServiceWorker | null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((type: string, fn: EventListener) => {
      if (!regListeners.has(type)) regListeners.set(type, new Set());
      regListeners.get(type)!.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: EventListener) => {
      regListeners.get(type)?.delete(fn);
    }),
  };

  const container: MockServiceWorkerContainer = {
    controller: initialController,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (type: string, fn: EventListener) => {
      if (!containerListeners.has(type)) containerListeners.set(type, new Set());
      containerListeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: EventListener) => {
      containerListeners.get(type)?.delete(fn);
    },
    dispatch: (type: string) => {
      containerListeners.get(type)?.forEach((fn) => fn(new Event(type)));
    },
  };

  return { container, registration };
}

describe('pwaUpdater', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');

  beforeEach(() => {
    __resetPWAUpdaterForTests();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    __resetPWAUpdaterForTests();
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    }
    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine);
    }
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('isChunkLoadError', () => {
    it('detects dynamic import, MIME, CSS preload, and ChunkLoadError failures', () => {
      expect(
        isChunkLoadError(
          new TypeError('Failed to fetch dynamically imported module: https://example.com/assets/Rooms-123.js')
        )
      ).toBe(true);
      expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
      expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
      expect(
        isChunkLoadError(
          new Error(
            'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced.'
          )
        )
      ).toBe(true);
      expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/Rooms.css'))).toBe(true);

      const err = new Error('Loading chunk 4 failed');
      err.name = 'ChunkLoadError';
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('does not match unrelated runtime errors', () => {
      expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(
        false
      );
      expect(isChunkLoadError(new Error('Network request timed out'))).toBe(false);
      expect(isChunkLoadError(null)).toBe(false);
    });
  });

  describe('tryReloadForStaleChunk', () => {
    it('reloads once and enforces cooldown via sessionStorage', () => {
      const reloadSpy = vi.fn();
      const cleanup = initPWAUpdater({ registerSW: false, onReload: reloadSpy });

      expect(tryReloadForStaleChunk('first', 100_000)).toBe(true);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('100000');

      // Reset active instance without clearing sessionStorage to simulate the next page boot
      cleanup();
      const reloadSpy2 = vi.fn();
      initPWAUpdater({ registerSW: false, onReload: reloadSpy2 });

      // Within cooldown -> blocked so no reload loop occurs
      expect(tryReloadForStaleChunk('second', 100_000 + CHUNK_RELOAD_COOLDOWN_MS - 1)).toBe(false);
      expect(reloadSpy2).not.toHaveBeenCalled();

      // Past cooldown -> allowed again
      expect(tryReloadForStaleChunk('third', 100_000 + CHUNK_RELOAD_COOLDOWN_MS + 1)).toBe(true);
      expect(reloadSpy2).toHaveBeenCalledTimes(1);
    });

    it('does not reload when offline', () => {
      const reloadSpy = vi.fn();
      initPWAUpdater({ registerSW: false, onReload: reloadSpy });
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => false,
      });

      expect(tryReloadForStaleChunk('offline', 200_000)).toBe(false);
      expect(reloadSpy).not.toHaveBeenCalled();
    });
  });

  describe('lazyWithRetry & importWithChunkRetry', () => {
    it('returns module cleanly on normal load', async () => {
      const Dummy: React.FC = () => null;
      const LazyComp = lazyWithRetry(() => Promise.resolve({ default: Dummy }));
      const loadFn = (LazyComp as unknown as { __loadForTest: () => Promise<unknown> }).__loadForTest;
      await expect(loadFn()).resolves.toEqual({ default: Dummy });
    });

    it('reloads cleanly without immediately rejecting when a chunk import fails online', async () => {
      const reloadSpy = vi.fn();
      initPWAUpdater({ registerSW: false, onReload: reloadSpy });

      const LazyComp = lazyWithRetry(() =>
        Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/Rooms-old.js'))
      );
      const loadFn = (LazyComp as unknown as { __loadForTest: () => Promise<unknown> }).__loadForTest;

      let settled = false;
      void loadFn().then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );

      await new Promise((r) => setTimeout(r, 20));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);
    });

    it('rethrows non-chunk errors immediately without reloading', async () => {
      const reloadSpy = vi.fn();
      initPWAUpdater({ registerSW: false, onReload: reloadSpy });

      const LazyComp = lazyWithRetry(() => Promise.reject(new Error('Syntax crash inside component')));
      const loadFn = (LazyComp as unknown as { __loadForTest: () => Promise<unknown> }).__loadForTest;

      await expect(loadFn()).rejects.toThrow('Syntax crash inside component');
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('reloads immediately when navigating while a SW update is already pending', async () => {
      const reloadSpy = vi.fn();
      initPWAUpdater({ registerSW: false, onReload: reloadSpy });
      __markSWUpdatePendingForTests(true);

      const importer = vi.fn(() => Promise.resolve({ default: (() => null) as React.FC }));
      const LazyComp = lazyWithRetry(importer);
      const loadFn = (LazyComp as unknown as { __loadForTest: () => Promise<unknown> }).__loadForTest;

      void loadFn().catch(() => {});
      await new Promise((r) => setTimeout(r, 10));

      expect(importer).not.toHaveBeenCalled();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('recovers when navigating back after an offline failure without permanent React.lazy rejection caching', async () => {
      initPWAUpdater({ registerSW: false, onReload: vi.fn() });

      let shouldFail = true;
      const RecoveredView: React.FC = () => <div>Recovered Route Content</div>;
      const LazyRoute = lazyWithRetry(() =>
        shouldFail
          ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
          : Promise.resolve({ default: RecoveredView })
      );

      class TestBoundary extends React.Component<
        { children: React.ReactNode },
        { failed: boolean }
      > {
        state = { failed: false };
        static getDerivedStateFromError() {
          return { failed: true };
        }
        render() {
          return this.state.failed ? <div>Offline fallback</div> : this.props.children;
        }
      }

      // Suppress React error boundary stderr noise during expected offline failure
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        const { unmount } = render(
          <TestBoundary>
            <React.Suspense fallback={<div>Loading</div>}>
              <LazyRoute />
            </React.Suspense>
          </TestBoundary>
        );
        expect(await screen.findByText('Offline fallback')).toBeTruthy();
        unmount();

        // Back online on a subsequent visit: must succeed cleanly without stale React.lazy rejection
        shouldFail = false;
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
        window.dispatchEvent(new Event('online'));
        render(
          <TestBoundary>
            <React.Suspense fallback={<div>Loading</div>}>
              <LazyRoute />
            </React.Suspense>
          </TestBoundary>
        );
        expect(await screen.findByText('Recovered Route Content')).toBeTruthy();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it('importWithChunkRetry triggers reload on chunk errors and resolves normal imports', async () => {
      const reloadSpy = vi.fn();
      initPWAUpdater({ registerSW: false, onReload: reloadSpy });

      await expect(importWithChunkRetry(() => Promise.resolve({ default: 42 }))).resolves.toEqual({
        default: 42,
      });

      let settled = false;
      void importWithChunkRetry(() =>
        Promise.reject(new TypeError('Failed to fetch dynamically imported module: vendor-old.js'))
      ).then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );

      await new Promise((r) => setTimeout(r, 20));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);
    });
  });

  describe('initPWAUpdater lifecycle', () => {
    it('intercepts vite:preloadError and triggers reload without calling preventDefault()', () => {
      const reloadSpy = vi.fn();
      initPWAUpdater({ registerSW: false, onReload: reloadSpy });

      const evt = new Event('vite:preloadError', { cancelable: true }) as Event & {
        payload?: unknown;
      };
      evt.payload = new TypeError('Failed to fetch dynamically imported module');

      window.dispatchEvent(evt);
      // Do not suppress default so Vite 8 __vitePreload still throws instead of resolving undefined
      expect(evt.defaultPrevented).toBe(false);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('registers SW with updateViaCache none, checks updates on resume, and handles first-install vs genuine update', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-28T10:00:00Z'));

      const { container, registration } = createMockServiceWorkerEnv(null);
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: container,
      });

      const reloadSpy = vi.fn();
      initPWAUpdater({ registerSW: true, onReload: reloadSpy, periodicCheckMs: 0 });

      // Flush microtask registration
      await vi.advanceTimersByTimeAsync(0);

      expect(container.register).toHaveBeenCalledWith('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      expect(registration.update).toHaveBeenCalledTimes(1);

      // First-ever SW installation should NOT reload, but upgrades hadController -> true
      container.dispatch('controllerchange');
      expect(reloadSpy).not.toHaveBeenCalled();

      // Debounced visibility resume check
      vi.setSystemTime(new Date(Date.now() + SW_UPDATE_CHECK_DEBOUNCE_MS + 100));
      document.dispatchEvent(new Event('visibilitychange'));
      expect(registration.update).toHaveBeenCalledTimes(2);

      // Second controllerchange IS a real update -> reloads right away when visible & idle
      container.dispatch('controllerchange');
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('defers reload while user is typing in an input, then reloads cleanly on resume after blur', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-28T10:00:00Z'));

      const fakeController = {} as ServiceWorker;
      const { container } = createMockServiceWorkerEnv(fakeController);
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: container,
      });

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const reloadSpy = vi.fn();
      initPWAUpdater({ registerSW: true, onReload: reloadSpy, periodicCheckMs: 0 });
      await vi.advanceTimersByTimeAsync(0);

      container.dispatch('controllerchange');
      expect(reloadSpy).not.toHaveBeenCalled();

      // User finishes typing and returns to PWA
      input.blur();
      document.dispatchEvent(new Event('visibilitychange'));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });
});
