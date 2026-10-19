import React from 'react';
import type { AdminController } from '../../hooks';
import { ActivityLogContainer, ActivityLogItem } from '../../AdminStyledComponents';

export interface LiveActivityTabProps {
  admin: AdminController;
}

export function LiveActivityTab({ admin }: LiveActivityTabProps) {
  const { activityLogRef, activityLogs } = admin;

  return (
    <>
      <h2>Real-Time Activity</h2>
      <ActivityLogContainer ref={activityLogRef}>
        {activityLogs.map((log, index) => (
          <ActivityLogItem key={index}>{log}</ActivityLogItem>
        ))}
      </ActivityLogContainer>
    </>
  );
}
