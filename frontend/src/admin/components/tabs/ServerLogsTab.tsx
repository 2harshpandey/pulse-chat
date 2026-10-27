import React, { useMemo } from 'react';
import type { AdminController } from '../../hooks';
import { formatServerLogLine } from '../../utils';
import { LogViewerContainer, ServerLogItem, LogsTabHeaderRow } from '../../AdminStyledComponents';
import { LogsCopyButton } from '../LogsCopyButton';

export interface ServerLogsTabProps {
  admin: AdminController;
}

export function ServerLogsTab({ admin }: ServerLogsTabProps) {
  const { isServerLogsLoading, serverLogs } = admin;

  const validLogs = useMemo(() => {
    return serverLogs.filter((log) => typeof log === 'string' && log.trim().length > 0);
  }, [serverLogs]);

  const hasLogs = validLogs.length > 0;

  return (
    <>
      <LogsTabHeaderRow>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2>Server Logs</h2>
          {hasLogs && (
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
              {validLogs.length} {validLogs.length === 1 ? 'log' : 'logs'}
            </span>
          )}
        </div>
        <LogsCopyButton
          getLogsText={() => validLogs.map((log) => formatServerLogLine(log)).join('\n\n')}
          hasLogs={hasLogs && !isServerLogsLoading}
          label="Copy Logs"
        />
      </LogsTabHeaderRow>
      {isServerLogsLoading ? (
        <p>Loading server logs...</p>
      ) : (
        <LogViewerContainer>
          {validLogs.length === 0 ? (
            <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>No server logs available</div>
          ) : (
            validLogs.map((log, index) => (
              <ServerLogItem key={index}>{formatServerLogLine(log)}</ServerLogItem>
            ))
          )}
        </LogViewerContainer>
      )}
    </>
  );
}
