import { resolveApiBaseUrl } from './utils';

interface DiagnosticContext {
  ws: WebSocket | null;
  roomId: string;
  userId: string;
  username: string;
}

const context: DiagnosticContext = {
  ws: null,
  roomId: 'unknown',
  userId: '',
  username: '',
};

export const initTelemetryContext = (
  ws: WebSocket | null,
  roomId?: string,
  userId?: string,
  username?: string
) => {
  if (ws !== undefined) context.ws = ws;
  if (roomId) context.roomId = roomId;
  if (userId) context.userId = userId;
  if (username) context.username = username;
};

export const updateTelemetryWs = (ws: WebSocket | null) => {
  context.ws = ws;
};

// Debounce map to prevent flooding for continuous interactions
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Sends a non-blocking diagnostic event to the server.
 * Uses WebSocket if connected (< 0.05ms execution time, zero overhead).
 * Falls back to navigator.sendBeacon or fire-and-forget fetch if WebSocket is not open.
 * Never throws, never blocks the main thread, never causes re-renders.
 */
export const sendClientDiagnostic = (
  event: string,
  details?: Record<string, any>,
  options?: { debounceMs?: number; debounceKey?: string }
) => {
  if (options?.debounceMs && options?.debounceMs > 0) {
    const key = options.debounceKey || event;
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key);
        dispatchDiagnostic(event, details);
      }, options.debounceMs)
    );
    return;
  }
  dispatchDiagnostic(event, details);
};

const isTestEnv = (): boolean => {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return true;
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE === 'test') return true;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return true;
  return false;
};

const dispatchDiagnostic = (event: string, details?: Record<string, any>) => {
  if (isTestEnv()) return;

  try {
    let roomId = context.roomId;
    if (!roomId || roomId === 'unknown') {
      if (typeof window !== 'undefined') {
        const pathMatch = window.location.pathname.match(/\/room\/([^/?#]+)/i);
        roomId =
          pathMatch?.[1] ||
          sessionStorage.getItem('pulse_room_id') ||
          localStorage.getItem('pulse_room_id') ||
          sessionStorage.getItem('pulseRoomId') ||
          localStorage.getItem('pulseRoomId') ||
          'global';
      } else {
        roomId = 'global';
      }
    }

    let userId = context.userId;
    if (!userId && typeof window !== 'undefined') {
      userId =
        sessionStorage.getItem('pulse_user_id') ||
        localStorage.getItem('pulse_user_id') ||
        sessionStorage.getItem('pulseUserId') ||
        localStorage.getItem('pulseUserId') ||
        '';
    }

    let username = context.username;
    if (!username && typeof window !== 'undefined') {
      username =
        sessionStorage.getItem('username') ||
        localStorage.getItem('username') ||
        sessionStorage.getItem('pulse_username') ||
        localStorage.getItem('pulse_username') ||
        '';
    }

    const payload = {
      type: 'client_diagnostic',
      event,
      roomId,
      userId,
      username,
      details: details || {},
      timestamp: Date.now(),
    };

    if (context.ws && context.ws.readyState === WebSocket.OPEN) {
      context.ws.send(JSON.stringify(payload));
      return;
    }

    if (typeof window !== 'undefined') {
      const url = `${resolveApiBaseUrl()}/api/telemetry/diagnostic`;
      const body = JSON.stringify(payload);
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    }
  } catch (_) {
    // Guaranteed non-blocking & fail-safe
  }
};
