import React from 'react';
import type { AdminController } from '../../hooks';
import { formatDateTime, formatDuration } from '../../utils';
import {
  ScrollContainer,
  SectionTitle,
  Badge,
  StatusDot,
  EmptyState,
  ResponsiveTableWrapper,
  Table,
  Th,
  Td,
  MobileCardList,
  UserCard,
  UserCardHeader,
  UserCardMeta,
  UserCardMetaRow,
  UserCardMetaLabel,
  UserCardMetaValue,
} from '../../AdminStyledComponents';

export interface ReportsTabProps {
  admin: AdminController;
}

export function ReportsTab({ admin }: ReportsTabProps) {
  const { sortedReports } = admin;

  return (
    <ScrollContainer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <SectionTitle style={{ margin: 0 }}>User Reports</SectionTitle>
        <Badge $color={sortedReports.length > 0 ? 'red' : 'gray'}>
          <StatusDot $color={sortedReports.length > 0 ? 'red' : 'gray'} />
          {sortedReports.length} report{sortedReports.length === 1 ? '' : 's'}
        </Badge>
      </div>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Reports help moderation review users with full context, including report reason, message snapshot, account join time, and recent join history.
      </p>

      {sortedReports.length === 0 ? (
        <EmptyState>
          <span>No reports yet</span>
          <span style={{ fontSize: '0.8rem' }}>Reported users will appear here in real time.</span>
        </EmptyState>
      ) : (
        <>
          <ResponsiveTableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>Reported User</Th>
                  <Th>Reporter</Th>
                  <Th>Reason</Th>
                  <Th>Message</Th>
                  <Th>Reported At</Th>
                  <Th>Joined At</Th>
                  <Th>Session Started</Th>
                  <Th>Joined For</Th>
                  <Th>Join History</Th>
                </tr>
              </thead>
              <tbody>
                {sortedReports.map((report) => {
                  const joinHistory = Array.isArray(report.reportedUserJoinHistory)
                    ? report.reportedUserJoinHistory.slice(-5).reverse()
                    : [];
                  const messagePreview =
                    report.messageText?.trim() ||
                    (report.messageType === 'image'
                      ? '[Image message]'
                      : report.messageType === 'video'
                      ? '[Video message]'
                      : report.messageType === 'file'
                      ? '[File attachment]'
                      : '[No text]');

                  return (
                    <tr key={report._id}>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <strong>{report.reportedUsername}</strong>
                          <Badge $color={report.reportedUserIsOnline ? 'green' : 'gray'}>
                            {report.reportedUserIsOnline ? 'Online' : 'Offline'}
                          </Badge>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                          {report.reportedUserId}
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <strong>{report.reporterUsername}</strong>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>
                          {report.reporterUserId}
                        </div>
                      </Td>
                      <Td style={{ minWidth: '170px' }}>{report.reason}</Td>
                      <Td style={{ minWidth: '190px' }}>
                        <div style={{ fontSize: '0.82rem' }}>{messagePreview}</div>
                        {report.messageId && (
                          <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                            Message ID: {report.messageId}
                          </div>
                        )}
                      </Td>
                      <Td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{formatDateTime(report.reportedAt)}</Td>
                      <Td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {report.reportedUserJoinedAt ? formatDateTime(report.reportedUserJoinedAt) : '—'}
                      </Td>
                      <Td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {report.reportedUserCurrentSessionLoginTime
                          ? formatDateTime(report.reportedUserCurrentSessionLoginTime)
                          : '—'}
                      </Td>
                      <Td style={{ whiteSpace: 'nowrap' }}>
                        {formatDuration(report.reportedUserCurrentSessionDurationMs)}
                      </Td>
                      <Td style={{ minWidth: '200px', fontSize: '0.76rem' }}>
                        {joinHistory.length > 0 ? joinHistory.map((entry) => formatDateTime(entry)).join(' | ') : '—'}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </ResponsiveTableWrapper>

          <MobileCardList>
            {sortedReports.map((report) => {
              const joinHistory = Array.isArray(report.reportedUserJoinHistory)
                ? report.reportedUserJoinHistory.slice(-4).reverse()
                : [];
              const messagePreview =
                report.messageText?.trim() ||
                (report.messageType === 'image'
                  ? '[Image message]'
                  : report.messageType === 'video'
                  ? '[Video message]'
                  : report.messageType === 'file'
                  ? '[File attachment]'
                  : '[No text]');

              return (
                <UserCard key={report._id}>
                  <UserCardHeader>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                      <strong style={{ fontSize: '0.98rem' }}>{report.reportedUsername}</strong>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>
                        {report.reportedUserId}
                      </span>
                    </div>
                    <Badge $color={report.reportedUserIsOnline ? 'green' : 'gray'}>
                      {report.reportedUserIsOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </UserCardHeader>
                  <UserCardMeta>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>Reporter</UserCardMetaLabel>
                      <UserCardMetaValue>{report.reporterUsername}</UserCardMetaValue>
                    </UserCardMetaRow>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>Reported At</UserCardMetaLabel>
                      <UserCardMetaValue>{formatDateTime(report.reportedAt)}</UserCardMetaValue>
                    </UserCardMetaRow>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>Joined At</UserCardMetaLabel>
                      <UserCardMetaValue>
                        {report.reportedUserJoinedAt ? formatDateTime(report.reportedUserJoinedAt) : '—'}
                      </UserCardMetaValue>
                    </UserCardMetaRow>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>Session Started</UserCardMetaLabel>
                      <UserCardMetaValue>
                        {report.reportedUserCurrentSessionLoginTime
                          ? formatDateTime(report.reportedUserCurrentSessionLoginTime)
                          : '—'}
                      </UserCardMetaValue>
                    </UserCardMetaRow>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>Joined For</UserCardMetaLabel>
                      <UserCardMetaValue>
                        {formatDuration(report.reportedUserCurrentSessionDurationMs)}
                      </UserCardMetaValue>
                    </UserCardMetaRow>
                  </UserCardMeta>
                  <div
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '10px',
                      padding: '0.6rem 0.7rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                        marginBottom: '0.3rem',
                      }}
                    >
                      Report Reason
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{report.reason}</div>
                  </div>
                  <div
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '10px',
                      padding: '0.6rem 0.7rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                        marginBottom: '0.3rem',
                      }}
                    >
                      Reported Message
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{messagePreview}</div>
                    {report.messageId && (
                      <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.3rem' }}>
                        Message ID: {report.messageId}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    <strong>Join History:</strong>{' '}
                    {joinHistory.length > 0 ? joinHistory.map((entry) => formatDateTime(entry)).join(' | ') : '—'}
                  </div>
                </UserCard>
              );
            })}
          </MobileCardList>
        </>
      )}
    </ScrollContainer>
  );
}
