import React from 'react';

export const CHUNK_RELOAD_KEY = 'pulse_chunk_reload_at';
export const CHUNK_RELOAD_COOLDOWN_MS = 15_000;
export const SW_UPDATE_CHECK_DEBOUNCE_MS = 3_000;
export const SW_PERIODIC_CHECK_MS = 5 * 60 * 1000;
export const SW_SAFE_AUTO_RELOAD_WINDOW_MS = 8_000;

const CHUNK_LOAD_PENDING_TIMEOUT_MS = 8_000;

export interface PWAUpdaterOptions {
  /** Override SW registration condition (defaults to `import.meta.env.PROD`). */
  registerSW?: boolean;
  /** Custom reload callback (defaults to `window.location.reload()`). */
  onReload?: () => void;
  /** Periodic update check interval in ms (defaults to 5 minutes). */
  periodicCheckMs?: number;
}

const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported module',
  'loading chunk',
  'loading css chunk',
  'unable to preload css',
  'failed to load module script',
  'strict mime type checking is enforced',
  'disallowed mime type',
  'failed to load dynamically imported module',
];

let swUpdatePending = false;
let activeRegistration: ServiceWorkerRegistration | null = null;
let reloadTriggered = false;
let activeReloadHandler: (() => void) | null = null;
let cleanupActiveUpdater: (() => void) | null = null;
const failedRouteResetters = new Set<() => void>();

/**
 * Resets any cached failed lazy route factories so subsequent navigations retry cleanly.
 */
export function resetFailedLazyRoutes(): void {
  failedRouteResetters.forEach((reset) => {
    try {
      reset();
    } catch {
      // Ignore
    }
  });
  failedRouteResetters.clear();
}

function extractErrorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const causeText =
      error.cause && error.cause !== error ? ` ${extractErrorText(error.cause)}` : '';
    return `${error.name || ''} ${error.message || ''}${causeText}`;
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : '';
    const message = typeof record.message === 'string' ? record.message : '';
    const causeText =
      record.cause && record.cause !== error ? ` ${extractErrorText(record.cause)}` : '';
    return `${name} ${message}${causeText}`;
  }
  return String(error);
}

/**
 * Returns true if the error looks like a stale/evicted Vite chunk or MIME mismatch failure.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name;
    if (name === 'ChunkLoadError') return true;
  }
  const normalized = extractErrorText(error).toLowerCase();
  if (!normalized) return false;
  if (CHUNK_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }
  return (
    normalized.includes('dynamically imported module') &&
    (normalized.includes('404') || normalized.includes('failed') || normalized.includes('error'))
  );
}

function getSafeSessionStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // Ignore storage access errors in restricted/private contexts
  }
  return null;
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function isUserBusyInApp(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (active && active instanceof HTMLElement) {
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
      return true;
    }
  }
  if (document.querySelector('[role="dialog"], [aria-modal="true"], [data-modal-open="true"]')) {
    return true;
  }
  return false;
}

function performReload(): void {
  if (activeReloadHandler) {
    activeReloadHandler();
    return;
  }
  if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
    window.location.reload();
  }
}

/**
 * Reloads the page at the current URL to pick up newly deployed assets/SW,
 * guarded by an offline check and a sessionStorage cooldown to avoid reload loops.
 */
export function tryReloadForStaleChunk(_reason?: string, now = Date.now()): boolean {
  if (reloadTriggered) return true;
  if (!isOnline()) return false;

  const storage = getSafeSessionStorage();
  if (storage) {
    try {
      const raw = storage.getItem(CHUNK_RELOAD_KEY);
      if (raw !== null) {
        const lastAt = Number(raw);
        if (Number.isFinite(lastAt) && now - lastAt >= 0 && now - lastAt < CHUNK_RELOAD_COOLDOWN_MS) {
          return false;
        }
      }
      storage.setItem(CHUNK_RELOAD_KEY, String(now));
    } catch {
      // Proceed even if sessionStorage write fails
    }
  }

  reloadTriggered = true;

  try {
    if (activeRegistration?.waiting) {
      activeRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch {
    // Best-effort nudge to waiting SW
  }

  performReload();
  return true;
}

function waitDuringPendingReload<M>(fallbackError: unknown): Promise<M> {
  return new Promise<M>((_, reject) => {
    setTimeout(() => {
      reloadTriggered = false;
      reject(fallbackError);
    }, CHUNK_LOAD_PENDING_TIMEOUT_MS);
  });
}

/**
 * Runs a dynamic `import()` with stale-chunk / pending-SW reload recovery.
 */
export async function importWithChunkRetry<M>(importer: () => Promise<M>): Promise<M> {
  if (swUpdatePending && tryReloadForStaleChunk('sw-pending-import')) {
    return waitDuringPendingReload<M>(
      new Error('Failed to fetch dynamically imported module (reload timed out)')
    );
  }

  try {
    const mod = await importer();
    if (!mod) {
      throw new Error('Failed to load dynamically imported module');
    }
    return mod;
  } catch (error) {
    if (isChunkLoadError(error) && tryReloadForStaleChunk('chunk-load-error')) {
      return waitDuringPendingReload<M>(error);
    }
    throw error;
  }
}

/**
 * Wraps `React.lazy` in a resilient component that:
 * 1) Reloads automatically instead of flashing RouteErrorBoundary on evicted chunks/pending updates, and
 * 2) Never permanently caches a rejected `React.lazy` promise across route navigations or reconnects.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): React.FC<React.ComponentProps<T>> {
  let cachedModule: { default: T } | null = null;
  let activeLazy: React.LazyExoticComponent<T>;

  const resetActiveLazy = () => {
    activeLazy = React.lazy(loadModule);
  };

  const loadModule = async (): Promise<{ default: T }> => {
    if (cachedModule) return cachedModule;

    if (swUpdatePending && tryReloadForStaleChunk('sw-pending-navigation')) {
      return waitDuringPendingReload<{ default: T }>(
        new Error('Failed to fetch dynamically imported module (reload timed out)')
      ).catch((timeoutErr) => {
        failedRouteResetters.add(resetActiveLazy);
        throw timeoutErr;
      });
    }

    try {
      const mod = await importer();
      if (!mod || !mod.default) {
        throw new Error('Failed to load dynamically imported module');
      }
      cachedModule = mod;
      return mod;
    } catch (error) {
      if (isChunkLoadError(error) && tryReloadForStaleChunk('chunk-load-error')) {
        return waitDuringPendingReload<{ default: T }>(error).catch((timeoutErr) => {
          failedRouteResetters.add(resetActiveLazy);
          throw timeoutErr;
        });
      }
      failedRouteResetters.add(resetActiveLazy);
      throw error;
    }
  };

  activeLazy = React.lazy(loadModule);

  const LazyRouteWithRetry: React.FC<React.ComponentProps<T>> = (props) => {
    if (cachedModule) {
      const ResolvedComponent = cachedModule.default;
      return React.createElement(ResolvedComponent, props);
    }

    return React.createElement(activeLazy, props);
  };

  (LazyRouteWithRetry as unknown as { __loadForTest?: typeof loadModule }).__loadForTest = loadModule;
  return LazyRouteWithRetry;
}

/**
 * Installs Vite preload error recovery, eager SW registration with `updateViaCache: 'none'`,
 * resume/visibility update checks, and safe automatic reload on genuine SW updates.
 */
export function initPWAUpdater(options: PWAUpdaterOptions = {}): () => void {
  if (cleanupActiveUpdater) {
    return cleanupActiveUpdater;
  }

  activeReloadHandler = options.onReload ?? null;

  if (typeof window === 'undefined') {
    return () => {};
  }

  let disposed = false;
  let lastResumeOrBootAt = Date.now();
  let lastUpdateCheckAt = 0;
  let periodicTimer: ReturnType<typeof setInterval> | null = null;
  let watchedReg: ServiceWorkerRegistration | null = null;
  const installingCleanups: Array<() => void> = [];

  const onPreloadError = (event: Event) => {
    const preloadEvent = event as Event & { payload?: unknown; detail?: unknown };
    const payload = preloadEvent.payload ?? preloadEvent.detail;
    if (!payload || isChunkLoadError(payload)) {
      // Do NOT call event.preventDefault(): in Vite 8 __vitePreload, preventing default
      // suppresses throwing and resolves import() to `undefined` before reload completes.
      // Leaving default intact lets lazyWithRetry / importWithChunkRetry catch the real error
      // and hold Suspense cleanly until the reload tears down the page.
      tryReloadForStaleChunk('vite:preloadError');
    }
  };

  window.addEventListener('vite:preloadError', onPreloadError);

  const shouldRegisterSW =
    options.registerSW !== undefined ? options.registerSW : Boolean(import.meta.env.PROD);
  const swContainer =
    shouldRegisterSW && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : null;

  let hadController = Boolean(swContainer?.controller);

  const checkForUpdate = (force = false) => {
    if (disposed || !activeRegistration || !isOnline()) return;
    const now = Date.now();
    if (!force && now - lastUpdateCheckAt < SW_UPDATE_CHECK_DEBOUNCE_MS) return;
    lastUpdateCheckAt = now;
    void activeRegistration.update().catch(() => {
      // Ignore transient network errors when checking for SW updates
    });
  };

  const nudgeWaitingWorker = (reg: ServiceWorkerRegistration | null) => {
    if (!reg) return;
    if (reg.waiting && swContainer?.controller) {
      try {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        // Ignore postMessage failures
      }
    }
  };

  const onUpdateFound = () => {
    if (disposed || !watchedReg) return;
    const installing = watchedReg.installing;
    if (!installing) return;
    const onStateChange = () => {
      if (disposed) return;
      if (installing.state === 'installed') {
        nudgeWaitingWorker(watchedReg);
      }
    };
    installing.addEventListener('statechange', onStateChange);
    installingCleanups.push(() => {
      installing.removeEventListener('statechange', onStateChange);
    });
  };

  const onControllerChange = () => {
    if (disposed) return;
    if (!hadController) {
      // First-ever SW installation on this origin; mark installed so later updates trigger cleanly
      hadController = true;
      return;
    }

    swUpdatePending = true;
    const withinSafeWindow = Date.now() - lastResumeOrBootAt <= SW_SAFE_AUTO_RELOAD_WINDOW_MS;
    const isVisible =
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    if (withinSafeWindow && isVisible && !isUserBusyInApp()) {
      if (tryReloadForStaleChunk('sw-controllerchange')) {
        swUpdatePending = false;
      }
    }
  };

  const onResume = (reason: string) => {
    if (disposed) return;
    lastResumeOrBootAt = Date.now();
    if (swUpdatePending && !isUserBusyInApp()) {
      if (tryReloadForStaleChunk(reason)) {
        swUpdatePending = false;
        return;
      }
    }
    checkForUpdate();
  };

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      onResume('visibility-resume');
    }
  };

  const onPageShow = () => {
    onResume('pageshow-resume');
  };

  const onOnline = () => {
    resetFailedLazyRoutes();
    if (swContainer) {
      onResume('online-resume');
    }
  };

  window.addEventListener('online', onOnline);

  if (swContainer) {
    swContainer.addEventListener('controllerchange', onControllerChange);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    window.addEventListener('pageshow', onPageShow);

    const intervalMs = options.periodicCheckMs ?? SW_PERIODIC_CHECK_MS;
    if (intervalMs > 0) {
      periodicTimer = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          checkForUpdate();
        }
      }, intervalMs);
    }

    Promise.resolve()
      .then(() =>
        swContainer.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })
      )
      .then((reg) => {
        if (disposed) return;
        activeRegistration = reg;
        watchedReg = reg;
        reg.addEventListener('updatefound', onUpdateFound);
        nudgeWaitingWorker(reg);
        checkForUpdate(true);
      })
      .catch(() => {
        // Ignore SW registration failure (e.g., insecure origin or disabled storage)
      });
  }

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('vite:preloadError', onPreloadError);
    window.removeEventListener('online', onOnline);
    if (swContainer) {
      swContainer.removeEventListener('controllerchange', onControllerChange);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      window.removeEventListener('pageshow', onPageShow);
    }
    while (installingCleanups.length > 0) {
      installingCleanups.pop()?.();
    }
    if (watchedReg) {
      watchedReg.removeEventListener('updatefound', onUpdateFound);
      watchedReg = null;
    }
    if (periodicTimer !== null) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
    activeRegistration = null;
    activeReloadHandler = null;
    reloadTriggered = false;
    swUpdatePending = false;
    cleanupActiveUpdater = null;
  };

  cleanupActiveUpdater = cleanup;
  return cleanup;
}

/**
 * Resets module state between unit tests. Not intended for application runtime use.
 */
export function __resetPWAUpdaterForTests(): void {
  if (cleanupActiveUpdater) {
    cleanupActiveUpdater();
  }
  failedRouteResetters.clear();
  swUpdatePending = false;
  activeRegistration = null;
  reloadTriggered = false;
  activeReloadHandler = null;
  const storage = getSafeSessionStorage();
  if (storage) {
    try {
      storage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      // Ignore
    }
  }
}

export function __markSWUpdatePendingForTests(pending: boolean): void {
  swUpdatePending = pending;
}
