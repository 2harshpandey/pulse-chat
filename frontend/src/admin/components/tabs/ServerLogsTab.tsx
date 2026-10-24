import React, { useMemo } from 'react';
import type { AdminController } from '../../hooks';
import { formatServerLogLine } from '../../utils';
import { LogViewerContainer, LogsTabHeaderRow } from '../../AdminStyledComponents';
import { LogsCopyButton } from '../LogsCopyButton';

export interface ServerLogsTabProps {
  admin: AdminController;
}

export function ServerLogsTab({ admin }: ServerLogsTabProps) {
  const { isServerLogsLoading, serverLogs } = admin;

  const formattedLogsText = useMemo(() => {
    return serverLogs
      .filter((log) => typeof log === 'string' && log.trim().length > 0)
      .map((log) => formatServerLogLine(log))
      .join('\n');
  }, [serverLogs]);

  const hasLogs = serverLogs.some((log) => typeof log === 'string' && log.trim().length > 0);

  return (
    <>
      <LogsTabHeaderRow>
        <h2>Server Logs</h2>
        <LogsCopyButton
          getLogsText={() => formattedLogsText}
          hasLogs={hasLogs && !isServerLogsLoading}
          label="Copy Logs"
        />
      </LogsTabHeaderRow>
      {isServerLogsLoading ? (
        <p>Loading server logs...</p>
      ) : (
        <LogViewerContainer>
          {serverLogs.map((log, index) => (
            <div key={index}>{formatServerLogLine(log)}</div>
          ))}
        </LogViewerContainer>
      )}
    </>
  );
}
