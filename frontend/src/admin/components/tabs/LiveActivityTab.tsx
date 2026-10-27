import React, { useMemo } from 'react';
import type { AdminController } from '../../hooks';
import {
  ActivityLogContainer,
  ActivityLogItem,
  LogsTabHeaderRow,
} from '../../AdminStyledComponents';
import { LogsCopyButton } from '../LogsCopyButton';

export interface LiveActivityTabProps {
  admin: AdminController;
}

function getActivityIcon(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('failed') || lower.includes('blocked') || lower.includes('rejected') || lower.includes('warning') || lower.includes('error') || lower.includes('issue')) {
    return '⚠️';
  }
  if (lower.includes('pinned') || lower.includes('unpinned') || lower.includes('lockdown') || lower.includes('force-logged') || lower.includes('reported')) {
    return '🛡️';
  }
  if (lower.includes('voice') || lower.includes('recording') || lower.includes('audio')) {
    return '🎙️';
  }
  if (lower.includes('image') || lower.includes('photo')) {
    return '📷';
  }
  if (lower.includes('video')) {
    return '🎬';
  }
  if (lower.includes('file') || lower.includes('document') || lower.includes('album') || lower.includes('download')) {
    return '📎';
  }
  if (lower.includes('poll')) {
    return '📊';
  }
  if (lower.includes('react') || lower.includes('reaction')) {
    return '✨';
  }
  if (lower.includes('reconnect') || lower.includes('connected')) {
    return '🟢';
  }
  if (lower.includes('disconnect') || lower.includes('logged out') || lower.includes('left')) {
    return '⚪';
  }
  if (lower.includes('message')) {
    return '💬';
  }
  return 'ℹ️';
}

function formatActivityEntry(log: string) {
  const match = log.match(/^(\[[^\]]+\])\s*(\[Room:\s*[^\]]+\])?\s*(.*)$/);
  if (!match) {
    return {
      timestamp: '',
      roomBadge: '',
      content: log,
      icon: getActivityIcon(log),
    };
  }
  return {
    timestamp: match[1],
    roomBadge: match[2] || '',
    content: match[3],
    icon: getActivityIcon(match[3]),
  };
}

export function LiveActivityTab({ admin }: LiveActivityTabProps) {
  const { activityLogRef, activityLogs } = admin;

  const validLogs = useMemo(
    () => activityLogs.filter((log) => typeof log === 'string' && log.trim().length > 0),
    [activityLogs]
  );

  return (
    <>
      <LogsTabHeaderRow>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2>
            Real-Time Activity{' '}
            {admin.roomId !== 'me' && admin.roomId !== 'global' && (
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'normal' }}>
                · Room: {admin.roomId}
              </span>
            )}
          </h2>
          {validLogs.length > 0 && (
            <span
              style={{
                fontSize: '0.8rem',
                color: '#94a3b8',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                fontWeight: 500,
              }}
            >
              {validLogs.length} {validLogs.length === 1 ? 'event' : 'events'}
            </span>
          )}
        </div>
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
                <span style={{ marginRight: '0.35rem' }}>{parsed.icon}</span>
                <span>{parsed.content}</span>
              </ActivityLogItem>
            );
          })
        )}
      </ActivityLogContainer>
    </>
  );
}
