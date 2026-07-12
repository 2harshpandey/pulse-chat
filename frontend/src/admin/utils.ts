import type { TempLinkData } from './types';

/**
 * Sanitizes a URL before using it as an href/src attribute.
 */
export const sanitizeUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.href;
  } catch {
    return '';
  }
};

export const isGiphyUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'giphy.com' || hostname.endsWith('.giphy.com');
  } catch {
    return false;
  }
};

// Sanitize a server-issued ID before interpolating it into a URL path segment.
// Our userIds are base-36 alphanumeric; MongoDB ObjectIds are 24 hex chars.
// Stripping anything outside [a-zA-Z0-9_-] + percent-encoding prevents path traversal.
export const sanitizePathId = (id: string): string =>
  encodeURIComponent(id.replace(/[^a-zA-Z0-9_-]/g, ''));

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const formatDateTime = (dateString: string): string =>
  `${formatDate(dateString)} ${formatTime(dateString)}`;

export const formatDuration = (durationMs?: number | null): string => {
  if (!durationMs || durationMs <= 0) return '—';
  const totalSeconds = Math.floor(durationMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

// Rewrites the "timestamp" field inside a raw Winston JSON log line to IST
export const formatServerLogLine = (line: string): string => {
  try {
    const parsed = JSON.parse(line);
    if (parsed.timestamp) {
      // Try to parse the timestamp and convert to IST
      const date = new Date(parsed.timestamp);
      if (!isNaN(date.getTime())) {
        const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        parsed.timestamp =
          `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
          `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())} IST`;
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return line;
  }
};

export const getTimeRemaining = (expiresAt: string): string => {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

export const getLinkStatus = (link: TempLinkData): { status: 'active' | 'expired' | 'revoked'; label: string } => {
  if (link.isRevoked) return { status: 'revoked', label: 'Revoked' };
  if (new Date() > new Date(link.expiresAt)) return { status: 'expired', label: 'Expired' };
  return { status: 'active', label: 'Active' };
};

export const auditTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'user_blocked': '🚫 User Blocked',
    'user_unblocked': '✅ User Unblocked',
    'user_force_logged_out': '🔒 Force Logged Out',
    'join_failed_blocked': '⛔ Join Failed (Blocked)',
    'join_failed_lockdown': '🔐 Join Failed (Lockdown)',
    'join_failed_password': '❌ Join Failed (Wrong Password)',
    'join_failed_username_taken': '⚠️ Join Failed (Username Taken)',
    'temp_link_created': '🔗 Temp Link Created',
    'temp_link_revoked': '🔗 Temp Link Revoked',
    'temp_link_used': '🔗 Temp Link Used',
    'temp_link_expired_attempt': '🔗 Expired Link Attempt',
    'lockdown_enabled': '🔒 Lockdown Enabled',
    'lockdown_disabled': '🔓 Lockdown Disabled',
  };
  return labels[type] || type;
};
