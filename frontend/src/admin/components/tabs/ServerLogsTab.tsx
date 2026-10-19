import React from 'react';
import type { AdminController } from '../../hooks';
import { formatServerLogLine } from '../../utils';
import { Button, LogViewerContainer } from '../../AdminStyledComponents';

export interface ServerLogsTabProps {
  admin: AdminController;
}

export function ServerLogsTab({ admin }: ServerLogsTabProps) {
  const { handleRefreshServerLogs, isServerLogsLoading, serverLogs } = admin;

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Server Logs</h2>
        <Button onClick={handleRefreshServerLogs}>Refresh</Button>
      </div>
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
