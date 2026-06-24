export interface UserProfile {
  userId: string;
  username: string;
  createdAt?: string;
}

export interface TempLinkData {
  _id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  isRevoked: boolean;
  revokedAt: string | null;
  usedBy: { username: string; joinedAt: string }[];
}

export interface BlockedUserData {
  _id: string;
  userId: string;
  username: string;
  isBlocked: boolean;
  blockedAt: string;
  unblockedAt: string | null;
  reason: string;
  fingerprints: {
    ips: string[];
    userAgents: string[];
    deviceHashes: string[];
  };
}

export interface LockdownData {
  isActive: boolean;
  type?: string;
  startTime?: string;
  endTime?: string | null;
}

export interface AuditLogData {
  _id: string;
  type: string;
  details: any;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

export interface LoggedInUser {
  userId: string;
  username: string;
  loginTime: string;
  ip?: string;
  userAgent?: string;
  viaTempLink?: boolean;
}

export interface UserReportData {
  _id: string;
  reporterUserId: string;
  reporterUsername: string;
  reporterIp?: string;
  reporterUserAgent?: string;
  reportedUserId: string;
  reportedUsername: string;
  reason: string;
  messageId?: string;
  messageType?: string;
  messageText?: string;
  messageUrl?: string;
  messageTimestamp?: string | null;
  reportedUserJoinedAt?: string | null;
  reportedUserLastSeen?: string | null;
  reportedUserCurrentSessionLoginTime?: string | null;
  reportedUserCurrentSessionDurationMs?: number | null;
  reportedUserIsOnline?: boolean;
  reportedUserJoinHistory?: string[];
  reportedAt: string;
}

export type Tab = 'messages' | 'users' | 'reports' | 'access' | 'security' | 'activity' | 'logs' | 'settings';
