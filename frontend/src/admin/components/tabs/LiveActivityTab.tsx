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

export function LiveActivityTab({ admin }: LiveActivityTabProps) {
  const { activityLogRef, activityLogs } = admin;

  const validLogs = useMemo(
    () => activityLogs.filter((log) => typeof log === 'string' && log.trim().length > 0),
    [activityLogs]
  );

  return (
    <>
      <LogsTabHeaderRow>
        <h2>Real-Time Activity</h2>
        <LogsCopyButton
          getLogsText={() => validLogs.join('\n')}
          hasLogs={validLogs.length > 0}
          label="Copy Logs"
        />
      </LogsTabHeaderRow>
      <ActivityLogContainer ref={activityLogRef}>
        {activityLogs.map((log, index) => (
          <ActivityLogItem key={index}>{log}</ActivityLogItem>
        ))}
      </ActivityLogContainer>
    </>
  );
}
