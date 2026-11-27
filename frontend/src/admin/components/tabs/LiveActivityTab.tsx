import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { AdminController } from '../../hooks';
import {
  ActivityLogContainer,
  ActivityLogItem,
  LogsTabHeaderRow,
  LogsHeaderTitleGroup,
  LogsRoomChip,
  LogsCountBadge,
  SettingsMiniCopyBtn,
} from '../../AdminStyledComponents';
import { LogsCopyButton } from '../LogsCopyButton';
import { copyTextToClipboard } from '../../../chat/utils';

export interface LiveActivityTabProps {
  admin: AdminController;
}

function renderActivityIcon(text: string): React.ReactNode {
  const lower = text.toLowerCase();
  const iconProps = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (lower.includes('failed') || lower.includes('blocked') || lower.includes('rejected') || lower.includes('warning') || lower.includes('error') || lower.includes('issue')) {
    return (
      <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
      </span>
    );
  }
  if (lower.includes('pinned') || lower.includes('unpinned') || lower.includes('lockdown') || lower.includes('force-logged') || lower.includes('reported')) {
    return (
      <span style={{ color: '#3b82f6', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
      </span>
    );
  }
  if (lower.includes('voice') || lower.includes('recording') || lower.includes('audio')) {
    return (
      <span style={{ color: '#8b5cf6', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
      </span>
    );
  }
  if (lower.includes('image') || lower.includes('photo')) {
    return (
      <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
      </span>
    );
  }
  if (lower.includes('video')) {
    return (
      <span style={{ color: '#06b6d4', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
      </span>
    );
  }
  if (lower.includes('file') || lower.includes('document') || lower.includes('album') || lower.includes('download')) {
    return (
      <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
      </span>
    );
  }
  if (lower.includes('react') || lower.includes('reaction')) {
    return (
      <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
      </span>
    );
  }
  if (lower.includes('reconnect') || lower.includes('connected')) {
    return (
      <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
      </span>
    );
  }
  if (lower.includes('disconnect') || lower.includes('logged out') || lower.includes('left')) {
    return (
      <span style={{ color: '#94a3b8', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="18" y1="11" x2="22" y2="11" /></svg>
      </span>
    );
  }
  if (lower.includes('message')) {
    return (
      <span style={{ color: '#3b82f6', display: 'inline-flex', alignItems: 'center' }}>
        <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </span>
    );
  }
  return (
    <span style={{ color: '#94a3b8', display: 'inline-flex', alignItems: 'center' }}>
      <svg {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
    </span>
  );
}

function formatActivityEntry(log: string) {
  const match = log.match(/^(\[[^\]]+\])\s*(\[Room:\s*[^\]]+\])?\s*(.*)$/);
  if (!match) {
    return {
      timestamp: '',
      roomBadge: '',
      content: log,
      icon: renderActivityIcon(log),
    };
  }
  return {
    timestamp: match[1],
    roomBadge: match[2] || '',
    content: match[3],
    icon: renderActivityIcon(match[3]),
  };
}

export function LiveActivityTab({ admin }: LiveActivityTabProps) {
  const { activityLogRef, activityLogs } = admin;
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const isSpecificRoom = Boolean(admin.roomId && admin.roomId !== 'me' && admin.roomId !== 'global');
  const displayRoomId = admin.roomSettingsAlias || admin.roomId || '';
  const canonicalId = admin.canonicalRoomId || admin.roomId || '';

  const handleCopyRoomId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!displayRoomId) return;
    const ok = await copyTextToClipboard(displayRoomId);
    if (ok) {
      setCopiedRoomId(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedRoomId(false), 1800);
    }
  };

  const validLogs = useMemo(
    () => activityLogs.filter((log) => typeof log === 'string' && log.trim().length > 0),
    [activityLogs]
  );

  return (
    <>
      <LogsTabHeaderRow>
        <LogsHeaderTitleGroup>
          <h2>Real-Time Activity</h2>
          {isSpecificRoom && (
            <LogsRoomChip
              title={
                canonicalId && canonicalId !== displayRoomId
                  ? `${displayRoomId} (Canonical ID: ${canonicalId})`
                  : `Room: ${displayRoomId}`
              }
            >
              <svg
                className="icon-room"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="4" y1="9" x2="20" y2="9" />
                <line x1="4" y1="15" x2="20" y2="15" />
                <line x1="10" y1="3" x2="8" y2="21" />
                <line x1="16" y1="3" x2="14" y2="21" />
              </svg>
              <span className="label-room">Room:</span>
              <code>{displayRoomId}</code>
              <SettingsMiniCopyBtn
                type="button"
                $copied={copiedRoomId}
                onClick={handleCopyRoomId}
                aria-label="Copy Room ID"
                title={copiedRoomId ? 'Copied Room ID!' : 'Copy Room ID'}
              >
                {copiedRoomId ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </SettingsMiniCopyBtn>
            </LogsRoomChip>
          )}
          {validLogs.length > 0 && (
            <LogsCountBadge>
              {validLogs.length} {validLogs.length === 1 ? 'event' : 'events'}
            </LogsCountBadge>
          )}
        </LogsHeaderTitleGroup>
        <LogsCopyButton
          getLogsText={() => validLogs.join('\n')}
          hasLogs={validLogs.length > 0}
          label="Copy Logs"
        />
      </LogsTabHeaderRow>
      <ActivityLogContainer ref={activityLogRef}>
        {validLogs.length === 0 ? (
          <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0.5rem' }}>
            No live activity recorded yet in this session. Real-time events will appear here as they occur.
          </div>
        ) : (
          validLogs.map((log, index) => {
            const parsed = formatActivityEntry(log);
            return (
              <ActivityLogItem key={index}>
                {parsed.timestamp && (
                  <span
                    style={{
                      color: '#94a3b8',
                      fontSize: '0.8rem',
                      marginRight: '0.5rem',
                      fontFamily: 'monospace',
                    }}
                  >
                    {parsed.timestamp}
                  </span>
                )}
                {parsed.roomBadge && (
                  <span
                    style={{
                      color: '#3b82f6',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      marginRight: '0.4rem',
                    }}
                  >
                    {parsed.roomBadge}
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '0.45rem', verticalAlign: '-1px' }}>{parsed.icon}</span>
                <span>{parsed.content}</span>
              </ActivityLogItem>
            );
          })
        )}
      </ActivityLogContainer>
    </>
  );
}
