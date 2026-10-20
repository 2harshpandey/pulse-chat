import { useState } from 'react';
import type { LockdownData, AuditLogData } from '../types';

interface UseAdminSecurityOptions {
  apiUrl: string;
  apiHeaders: () => Record<string, string>;
}

export function useAdminSecurity({ apiUrl, apiHeaders }: UseAdminSecurityOptions) {
  const [lockdownStatus, setLockdownStatus] = useState<LockdownData>({ isActive: false });
  const [auditLogs, setAuditLogs] = useState<AuditLogData[]>([]);
  const [customLockdownMinutes, setCustomLockdownMinutes] = useState('');

  const handleSetLockdown = async (type: string) => {
    try {
      const body: any = { type };
      if (type === 'custom') {
        const mins = parseInt(customLockdownMinutes, 10);
        if (!mins || mins <= 0) {
          alert('Enter a valid number of minutes.');
          return;
        }
        body.customMinutes = mins;
      }
      const res = await fetch(`${apiUrl}/api/admin/login-lockdown`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setLockdownStatus(await res.json());
      }
    } catch (err) {
      console.error('Failed to set lockdown', err);
    }
  };

  const handleRemoveLockdown = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/login-lockdown`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      if (res.ok) {
        setLockdownStatus({ isActive: false });
      }
    } catch (err) {
      console.error('Failed to remove lockdown', err);
    }
  };

  return {
    lockdownStatus,
    setLockdownStatus,
    auditLogs,
    setAuditLogs,
    customLockdownMinutes,
    setCustomLockdownMinutes,
    handleSetLockdown,
    handleRemoveLockdown,
  };
}
