// --- Browser History Overlay Guard Helpers ---

import type { RouterHistoryState } from '../types';

export const getCurrentHistoryPath = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const readRouterHistoryState = (): RouterHistoryState => {
  const raw = window.history.state;
  if (raw && typeof raw === 'object') {
    return { ...(raw as RouterHistoryState) };
  }
  return {};
};

export const readRouterUserState = (state: RouterHistoryState): Record<string, unknown> => {
  if (state.usr && typeof state.usr === 'object' && !Array.isArray(state.usr)) {
    return { ...(state.usr as Record<string, unknown>) };
  }
  return {};
};

export const buildOverlayGuardState = (
  baseState: RouterHistoryState,
  hasOverlayGuard: boolean,
  mode: 'push' | 'replace',
): RouterHistoryState => {
  const nextBase = { ...baseState };
  const nextUserState = readRouterUserState(baseState);

  if (Object.prototype.hasOwnProperty.call(nextBase, 'overlayGuard')) {
    if (nextBase.overlayGuard === true) {
      nextUserState.overlayGuard = true;
    }
    delete nextBase.overlayGuard;
  }

  if (hasOverlayGuard) {
    nextUserState.overlayGuard = true;
  } else {
    delete nextUserState.overlayGuard;
  }

  const fallbackIdx = Math.max(window.history.length - 1, 0);
  const currentIdx = typeof nextBase.idx === 'number' ? nextBase.idx : fallbackIdx;
  const currentKey = typeof nextBase.key === 'string' && nextBase.key
    ? nextBase.key
    : Math.random().toString(36).slice(2, 10);

  return {
    ...nextBase,
    usr: nextUserState,
    idx: mode === 'push' ? currentIdx + 1 : currentIdx,
    key: mode === 'push' ? Math.random().toString(36).slice(2, 10) : currentKey,
  };
};

export const pushOverlayGuardHistoryEntry = (): void => {
  const nextState = buildOverlayGuardState(readRouterHistoryState(), true, 'push');
  window.history.pushState(nextState, document.title, getCurrentHistoryPath());
};

export const clearOverlayGuardHistoryEntry = (): void => {
  const nextState = buildOverlayGuardState(readRouterHistoryState(), false, 'replace');
  window.history.replaceState(nextState, document.title, getCurrentHistoryPath());
};
