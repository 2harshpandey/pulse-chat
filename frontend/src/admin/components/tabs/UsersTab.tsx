import React from 'react';
import type { AdminController } from '../../hooks';
import { formatDateTime } from '../../utils';
import {
  ScrollContainer,
  DangerButton,
  SectionTitle,
  StatusDot,
  EmptyState,
  ResponsiveTableWrapper,
  Table,
  Th,
  Td,
  SmallDangerButton,
  SmallWarningButton,
  Badge,
  MobileCardList,
  UserCard,
  UserCardHeader,
  UserCardMeta,
  UserCardMetaRow,
  UserCardMetaLabel,
  UserCardMetaValue,
  UserCardActions,
} from '../../AdminStyledComponents';

export interface UsersTabProps {
  admin: AdminController;
}

export function UsersTab({ admin }: UsersTabProps) {
  const {
    onlineUsersList,
    handleForceLogoutAll,
    handleForceLogout,
    handleBlockUser,
    loggedInUsersList,
    users,
    sortedUsers,
  } = admin;

  return (
    <ScrollContainer>
      {onlineUsersList.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <DangerButton onClick={handleForceLogoutAll} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚡ Force Logout All ({onlineUsersList.length})
          </DangerButton>
        </div>
      )}
      <SectionTitle>
        <StatusDot $color="green" /> Online Users ({onlineUsersList.length})
      </SectionTitle>
      {onlineUsersList.length === 0 ? (
        <EmptyState>
          <span>No users currently online</span>
        </EmptyState>
      ) : (
        <>
          <ResponsiveTableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>Username</Th>
                  <Th>User ID</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {onlineUsersList.map((user) => (
                  <tr key={user.userId}>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <StatusDot $color="green" />
                        <strong>{user.username}</strong>
                      </div>
                    </Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                        <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>
                          Block
                        </SmallWarningButton>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </ResponsiveTableWrapper>
          <MobileCardList>
            {onlineUsersList.map((user) => (
              <UserCard key={user.userId}>
                <UserCardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <StatusDot $color="green" />
                    <strong style={{ fontSize: '1rem' }}>{user.username}</strong>
                  </div>
                  <Badge $color="green">
                    <StatusDot $color="green" />
                    Online
                  </Badge>
                </UserCardHeader>
                <UserCardMeta>
                  <UserCardMetaRow>
                    <UserCardMetaLabel>User ID</UserCardMetaLabel>
                    <UserCardMetaValue
                      style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}
                    >
                      {user.userId}
                    </UserCardMetaValue>
                  </UserCardMetaRow>
                </UserCardMeta>
                <UserCardActions>
                  <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                  <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>
                    Block
                  </SmallWarningButton>
                </UserCardActions>
              </UserCard>
            ))}
          </MobileCardList>
        </>
      )}

      <SectionTitle style={{ marginTop: '2rem' }}>
        <StatusDot $color="yellow" /> Logged-In Sessions ({loggedInUsersList.length})
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>
          &mdash; includes offline
        </span>
      </SectionTitle>
      {loggedInUsersList.length === 0 ? (
        <EmptyState>
          <span>No tracked sessions</span>
        </EmptyState>
      ) : (
        <>
          <ResponsiveTableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>Username</Th>
                  <Th>Status</Th>
                  <Th>Login Time</Th>
                  <Th>Via</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {loggedInUsersList.map((user) => {
                  const isOnline = onlineUsersList.some((u) => u.userId === user.userId);
                  return (
                    <tr key={user.userId}>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <StatusDot $color={isOnline ? 'green' : 'gray'} />
                          <strong>{user.username}</strong>
                        </div>
                      </Td>
                      <Td>
                        <Badge $color={isOnline ? 'green' : 'gray'}>{isOnline ? 'Online' : 'Offline'}</Badge>
                      </Td>
                      <Td style={{ fontSize: '0.85rem' }}>
                        {user.loginTime ? formatDateTime(user.loginTime) : 'N/A'}
                      </Td>
                      <Td>
                        {user.viaTempLink ? <Badge $color="blue">Temp Link</Badge> : <Badge $color="gray">Password</Badge>}
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>
                            Force Logout
                          </SmallDangerButton>
                          <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>
                            Block
                          </SmallWarningButton>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </ResponsiveTableWrapper>
          <MobileCardList>
            {loggedInUsersList.map((user) => {
              const isOnline = onlineUsersList.some((u) => u.userId === user.userId);
              return (
                <UserCard key={user.userId}>
                  <UserCardHeader>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <StatusDot $color={isOnline ? 'green' : 'gray'} />
                      <strong style={{ fontSize: '1rem' }}>{user.username}</strong>
                    </div>
                    <Badge $color={isOnline ? 'green' : 'gray'}>{isOnline ? 'Online' : 'Offline'}</Badge>
                  </UserCardHeader>
                  <UserCardMeta>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>Login</UserCardMetaLabel>
                      <UserCardMetaValue>
                        {user.loginTime ? formatDateTime(user.loginTime) : 'N/A'}
                      </UserCardMetaValue>
                    </UserCardMetaRow>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>Via</UserCardMetaLabel>
                      <UserCardMetaValue>
                        {user.viaTempLink ? <Badge $color="blue">Temp Link</Badge> : <Badge $color="gray">Password</Badge>}
                      </UserCardMetaValue>
                    </UserCardMetaRow>
                  </UserCardMeta>
                  <UserCardActions>
                    <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                    <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>
                      Block
                    </SmallWarningButton>
                  </UserCardActions>
                </UserCard>
              );
            })}
          </MobileCardList>
        </>
      )}

      <SectionTitle style={{ marginTop: '2rem' }}>All Registered Users ({users.length})</SectionTitle>
      <ResponsiveTableWrapper>
        <Table>
          <thead>
            <tr>
              <Th>User ID</Th>
              <Th>Username</Th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.userId}>
                <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                <Td>{user.username}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </ResponsiveTableWrapper>
      <MobileCardList>
        {sortedUsers.map((user) => (
          <UserCard key={user.userId}>
            <UserCardHeader>
              <strong style={{ fontSize: '1rem' }}>{user.username}</strong>
            </UserCardHeader>
            <UserCardMeta>
              <UserCardMetaRow>
                <UserCardMetaLabel>User ID</UserCardMetaLabel>
                <UserCardMetaValue style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>
                  {user.userId}
                </UserCardMetaValue>
              </UserCardMetaRow>
            </UserCardMeta>
          </UserCard>
        ))}
      </MobileCardList>
    </ScrollContainer>
  );
}
