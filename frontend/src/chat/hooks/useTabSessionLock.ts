import { useState, useEffect, useRef, useCallback } from 'react';

const TAB_LOCK_TTL_MS = 9000;
const TAB_HEARTBEAT_INTERVAL_MS = 3000;
const TAB_PROBE_TIMEOUT_MS = 120;
const CHANNEL_NAME = 'pulse_chat_tab_sync';

interface TabLockPayload {
  tabId: string;
  updatedAt: number;
  claimedAt?: number;
}

const createTabId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tab_${crypto.randomUUID()}`;
  }
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const readTabLock = (lockKey: string): TabLockPayload | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(lockKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.tabId === 'string' && typeof parsed.updatedAt === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const writeTabLock = (lockKey: string, payload: TabLockPayload): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(lockKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-mode errors
  }
};

const removeTabLockIfOwned = (lockKey: string, myTabId: string): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    const current = readTabLock(lockKey);
    if (current && current.tabId === myTabId) {
      localStorage.removeItem(lockKey);
    }
  } catch {
    // Ignore storage errors
  }
};

export interface UseTabSessionLockProps {
  userId?: string;
  roomId?: string;
  enabled: boolean;
  onDisplaced?: () => void;
}

export function useTabSessionLock({
  userId,
  roomId,
  enabled,
  onDisplaced,
}: UseTabSessionLockProps) {
  const tabIdRef = useRef<string>(createTabId());
  const lockKey = enabled && userId && roomId ? `pulse_active_tab_${roomId}_${userId}` : '';

  const [isDisplacedByOtherTab, setIsDisplacedByOtherTab] = useState(false);
  const [isCheckingTabLock, setIsCheckingTabLock] = useState(false);
  const [tabClaimEpoch, setTabClaimEpoch] = useState(0);

  const isTabBlockedRef = useRef(false);
  const isCheckingTabLockRef = useRef(false);
  const forceTakeoverRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDisplacedRef = useRef(onDisplaced);
  onDisplacedRef.current = onDisplaced;

  const stopLockHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const startLockHeartbeat = useCallback(
    (activeKey: string) => {
      stopLockHeartbeat();
      if (!activeKey) return;
      const myTabId = tabIdRef.current;
      writeTabLock(activeKey, { tabId: myTabId, updatedAt: Date.now() });
      heartbeatIntervalRef.current = setInterval(() => {
        if (!isTabBlockedRef.current && !isCheckingTabLockRef.current) {
          writeTabLock(activeKey, { tabId: myTabId, updatedAt: Date.now() });
        }
      }, TAB_HEARTBEAT_INTERVAL_MS);
    },
    [stopLockHeartbeat]
  );

  const yieldToOtherTab = useCallback(() => {
    stopLockHeartbeat();
    isCheckingTabLockRef.current = false;
    setIsCheckingTabLock(false);
    if (!isTabBlockedRef.current) {
      isTabBlockedRef.current = true;
      setIsDisplacedByOtherTab(true);
    }
    onDisplacedRef.current?.();
  }, [stopLockHeartbeat]);

  const claimHere = useCallback(() => {
    if (!lockKey) return;
    const myTabId = tabIdRef.current;
    if (probeTimerRef.current) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }
    isCheckingTabLockRef.current = false;
    setIsCheckingTabLock(false);
    isTabBlockedRef.current = false;
    setIsDisplacedByOtherTab(false);
    forceTakeoverRef.current = true;

    writeTabLock(lockKey, {
      tabId: myTabId,
      updatedAt: Date.now(),
      claimedAt: Date.now(),
    });

    try {
      channelRef.current?.postMessage({
        type: 'CLAIM',
        lockKey,
        tabId: myTabId,
      });
    } catch {
      // Best effort
    }

    startLockHeartbeat(lockKey);
    setTabClaimEpoch((prev) => prev + 1);
  }, [lockKey, startLockHeartbeat]);

  const markDisplacedExternally = useCallback(() => {
    yieldToOtherTab();
  }, [yieldToOtherTab]);

  useEffect(() => {
    if (!enabled || !lockKey) {
      stopLockHeartbeat();
      isTabBlockedRef.current = false;
      isCheckingTabLockRef.current = false;
      setIsDisplacedByOtherTab(false);
      setIsCheckingTabLock(false);
      return;
    }

    const myTabId = tabIdRef.current;
    let disposed = false;

    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
    channelRef.current = bc;

    const handleChannelMessage = (event: MessageEvent) => {
      if (disposed || !event?.data || event.data.lockKey !== lockKey) return;
      const msg = event.data;

      if (msg.type === 'PROBE' && msg.fromTabId !== myTabId) {
        if (!isTabBlockedRef.current && !isCheckingTabLockRef.current) {
          try {
            bc?.postMessage({ type: 'ALIVE', lockKey, tabId: myTabId });
          } catch {
            // Best effort
          }
        }
        return;
      }

      if (msg.type === 'ALIVE' && msg.tabId !== myTabId) {
        if (isCheckingTabLockRef.current) {
          if (probeTimerRef.current) {
            clearTimeout(probeTimerRef.current);
            probeTimerRef.current = null;
          }
          yieldToOtherTab();
        }
        return;
      }

      if (msg.type === 'CLAIM' && msg.tabId !== myTabId) {
        yieldToOtherTab();
      }
    };

    if (bc) {
      bc.addEventListener('message', handleChannelMessage);
    }

    const handleStorage = (e: StorageEvent) => {
      if (disposed || e.key !== lockKey || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as TabLockPayload;
        if (parsed && parsed.tabId && parsed.tabId !== myTabId && parsed.claimedAt) {
          yieldToOtherTab();
        }
      } catch {
        // Ignore malformed storage payload
      }
    };
    window.addEventListener('storage', handleStorage);

    const releaseOwnedLock = () => {
      removeTabLockIfOwned(lockKey, myTabId);
      try {
        bc?.postMessage({ type: 'RELEASE', lockKey, tabId: myTabId });
      } catch {
        // Ignore
      }
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) {
        releaseOwnedLock();
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', releaseOwnedLock);

    // Check existing lock cleanly on mount
    const existingLock = readTabLock(lockKey);
    const hasFreshOtherLock = Boolean(
      existingLock &&
      existingLock.tabId !== myTabId &&
      Date.now() - existingLock.updatedAt <= TAB_LOCK_TTL_MS
    );

    if (!hasFreshOtherLock) {
      isCheckingTabLockRef.current = false;
      isTabBlockedRef.current = false;
      setIsCheckingTabLock(false);
      setIsDisplacedByOtherTab(false);
      startLockHeartbeat(lockKey);
    } else if (bc) {
      // Another lock exists and is recent; probe over BroadcastChannel (<= 120ms) to verify it isn't a crashed tab
      isCheckingTabLockRef.current = true;
      setIsCheckingTabLock(true);
      try {
        bc.postMessage({ type: 'PROBE', lockKey, fromTabId: myTabId });
      } catch {
        // Best effort
      }
      probeTimerRef.current = setTimeout(() => {
        if (disposed) return;
        probeTimerRef.current = null;
        if (isCheckingTabLockRef.current) {
          // No active tab replied within 120ms -> stale lock from a closed/crashed tab
          isCheckingTabLockRef.current = false;
          isTabBlockedRef.current = false;
          setIsCheckingTabLock(false);
          setIsDisplacedByOtherTab(false);
          startLockHeartbeat(lockKey);
          setTabClaimEpoch((prev) => prev + 1);
        }
      }, TAB_PROBE_TIMEOUT_MS);
    } else {
      // No BroadcastChannel support -> rely on localStorage lock freshness
      yieldToOtherTab();
    }

    return () => {
      disposed = true;
      stopLockHeartbeat();
      if (probeTimerRef.current) {
        clearTimeout(probeTimerRef.current);
        probeTimerRef.current = null;
      }
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', releaseOwnedLock);
      releaseOwnedLock();
      if (bc) {
        bc.removeEventListener('message', handleChannelMessage);
        try {
          bc.close();
        } catch {
          // Ignore
        }
      }
      channelRef.current = null;
    };
  }, [enabled, lockKey, startLockHeartbeat, stopLockHeartbeat, yieldToOtherTab]);

  return {
    tabId: tabIdRef.current,
    isDisplacedByOtherTab,
    isCheckingTabLock,
    tabClaimEpoch,
    isTabBlockedRef,
    isCheckingTabLockRef,
    forceTakeoverRef,
    claimHere,
    markDisplacedExternally,
  };
}
