import { useMemo } from 'react';
import type { AdminController } from '../../hooks';
import { formatServerLogLine } from '../../utils';
import {
  LogViewerContainer,
  ServerLogItem,
  LogsTabHeaderRow,
  LogsHeaderTitleGroup,
  LogsCountBadge,
} from '../../AdminStyledComponents';
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
        <LogsHeaderTitleGroup>
          <h2>Server Logs</h2>
          {hasLogs && (
            <LogsCountBadge>
              {validLogs.length} {validLogs.length === 1 ? 'log' : 'logs'}
            </LogsCountBadge>
          )}
        </LogsHeaderTitleGroup>
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
