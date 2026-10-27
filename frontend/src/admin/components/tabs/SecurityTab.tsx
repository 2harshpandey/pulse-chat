import React from 'react';
import type { AdminController } from '../../hooks';
import { formatDateTime, auditTypeLabel } from '../../utils';
import {
  ScrollContainer,
  SectionTitle,
  Card,
  Badge,
  StatusDot,
  SuccessButton,
  LockdownPanel,
  LockdownOption,
  CustomTimeInput,
  EmptyState,
  Table,
  Th,
  Td,
  SmallSuccessButton,
  AuditLogEntry,
} from '../../AdminStyledComponents';

export interface SecurityTabProps {
  admin: AdminController;
}

export function SecurityTab({ admin }: SecurityTabProps) {
  const {
    lockdownStatus,
    handleRemoveLockdown,
    handleSetLockdown,
    customLockdownMinutes,
    setCustomLockdownMinutes,
    blockedUsers,
    handleUnblockUser,
    auditLogs,
  } = admin;

  return (
    <ScrollContainer>
      {/* Login Lockdown */}
      <SectionTitle>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Login Lockdown
      </SectionTitle>
      <Card $variant={lockdownStatus.isActive ? 'danger' : 'default'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Badge $color={lockdownStatus.isActive ? 'red' : 'green'}>
            <StatusDot $color={lockdownStatus.isActive ? 'red' : 'green'} />
            {lockdownStatus.isActive ? 'LOCKDOWN ACTIVE' : 'No Lockdown'}
          </Badge>
          {lockdownStatus.isActive && lockdownStatus.endTime && (
            <span style={{ fontSize: '0.85rem', color: '#991b1b' }}>Until: {formatDateTime(lockdownStatus.endTime)}</span>
          )}
          {lockdownStatus.isActive && !lockdownStatus.endTime && (
            <span style={{ fontSize: '0.85rem', color: '#991b1b', fontWeight: 600 }}>Indefinite</span>
          )}
        </div>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
          When active, no new users can log in. Logged-in users can reconnect. Temp links still work.
        </p>
        {lockdownStatus.isActive ? (
          <SuccessButton onClick={handleRemoveLockdown}>🔓 Disable Lockdown</SuccessButton>
        ) : (
          <LockdownPanel>
            {['1hr', '6hr', '12hr', '1day', '3days'].map((t) => (
              <LockdownOption key={t} onClick={() => handleSetLockdown(t)}>
                {t === '1hr' ? '1 Hour' : t === '6hr' ? '6 Hours' : t === '12hr' ? '12 Hours' : t === '1day' ? '1 Day' : '3 Days'}
              </LockdownOption>
            ))}
            <LockdownOption onClick={() => handleSetLockdown('indefinite')}>Until I Allow</LockdownOption>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CustomTimeInput
                type="number"
                placeholder="Minutes"
                value={customLockdownMinutes}
                onChange={(e) => setCustomLockdownMinutes(e.target.value)}
                min="1"
              />
              <LockdownOption onClick={() => handleSetLockdown('custom')}>Custom</LockdownOption>
            </div>
          </LockdownPanel>
        )}
      </Card>

      {/* Blocked Users */}
      <SectionTitle style={{ marginTop: '2rem' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        Blocked Users ({blockedUsers.filter((u) => u.isBlocked).length})
      </SectionTitle>
      {blockedUsers.filter((u) => u.isBlocked).length === 0 ? (
        <EmptyState>
          <span>No blocked users</span>
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Username</Th>
              <Th>User ID</Th>
              <Th>Blocked At</Th>
              <Th>Reason</Th>
              <Th>Known IPs</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {blockedUsers
              .filter((u) => u.isBlocked)
              .map((user) => (
                <tr key={user._id}>
                  <Td>
                    <strong>{user.username}</strong>
                  </Td>
                  <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                  <Td style={{ fontSize: '0.85rem' }}>{formatDateTime(user.blockedAt)}</Td>
                  <Td style={{ fontSize: '0.85rem' }}>{user.reason || '—'}</Td>
                  <Td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {user.fingerprints?.ips?.length > 0 ? user.fingerprints.ips.join(', ') : '—'}
                  </Td>
                  <Td>
                    <SmallSuccessButton onClick={() => handleUnblockUser(user.userId)}>Unblock</SmallSuccessButton>
                  </Td>
                </tr>
              ))}
          </tbody>
        </Table>
      )}

      {/* Block History */}
      {blockedUsers.filter((u) => !u.isBlocked).length > 0 && (
        <>
          <SectionTitle style={{ marginTop: '2rem' }}>Block History</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Username</Th>
                <Th>Blocked At</Th>
                <Th>Unblocked At</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {blockedUsers
                .filter((u) => !u.isBlocked)
                .map((user) => (
                  <tr key={user._id}>
                    <Td>{user.username}</Td>
                    <Td style={{ fontSize: '0.85rem' }}>{formatDateTime(user.blockedAt)}</Td>
                    <Td style={{ fontSize: '0.85rem' }}>
                      {user.unblockedAt ? formatDateTime(user.unblockedAt) : '—'}
                    </Td>
                    <Td>{user.reason || '—'}</Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </>
      )}

      {/* Audit Logs */}
      <SectionTitle style={{ marginTop: '2rem' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Audit Logs
      </SectionTitle>
      {auditLogs.length === 0 ? (
        <EmptyState>
          <span>No audit logs yet</span>
        </EmptyState>
      ) : (
        auditLogs.map((log) => (
          <AuditLogEntry key={log._id} $type={log.type}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <strong>{auditTypeLabel(log.type, log.details)}</strong>
                <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.8rem' }}>
                  {(admin.roomId === 'me' || admin.roomId === 'global') && log.roomId && (
                    <span style={{ fontWeight: 600, color: '#3b82f6', marginRight: '0.5rem' }}>
                      [Room: {log.roomId}]
                    </span>
                  )}
                  {typeof log.details === 'string' && (
                    <span>{log.details} </span>
                  )}
                  {(log.details?.username || log.details?.userId) && (
                    <span>User: {log.details.username || log.details.userId} </span>
                  )}
                  {log.details?.count !== undefined && (
                    <span>
                      {(log.details?.username || log.details?.userId) ? '· ' : ''}
                      Count: {log.details.count} {log.type?.includes('user') || log.type?.includes('force') ? `user${log.details.count === 1 ? '' : 's'}` : `message${log.details.count === 1 ? '' : 's'}`} </span>
                  )}
                  {log.details?.action && (
                    <span>· Action: {log.details.action === 'delete' ? 'Permanent delete (no bubble)' : 'Hidden from chat (no bubble)'} </span>
                  )}
                  {log.details?.reason && <span>· Reason: {log.details.reason} </span>}
                  {log.details?.token && <span>· Token: {log.details.token} </span>}
                  {log.details?.attempts && <span>· Attempts: {log.details.attempts} </span>}
                  {log.details?.lockoutSeconds && <span>· Lockout: {log.details.lockoutSeconds}s </span>}
                  {log.details?.remainingSeconds && <span>· Remaining: {log.details.remainingSeconds}s </span>}
                  {log.details?.type && log.type.includes('lockdown') && <span>· Duration: {log.details.type} </span>}
                  {log.details?.targetRoomId && <span>· Target Room: {log.details.targetRoomId} </span>}
                  {log.ip && <span>· IP: {log.ip} </span>}
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {formatDateTime(log.timestamp)}
              </span>
            </div>
          </AuditLogEntry>
        ))
      )}
    </ScrollContainer>
  );
}
