import React from 'react';
import type { AdminController } from '../../hooks';
import { getLinkStatus, getTimeRemaining, formatDateTime, formatTime } from '../../utils';
import {
  ScrollContainer,
  Button,
  EmptyState,
  LinkCard,
  Badge,
  StatusDot,
  LinkUrlBox,
  CopyButton,
  UsedByList,
  SmallDangerButton,
} from '../../AdminStyledComponents';

export interface AccessLinksTabProps {
  admin: AdminController;
}

export function AccessLinksTab({ admin }: AccessLinksTabProps) {
  const {
    handleCreateTempLink,
    creatingLink,
    tempLinks,
    handleCopyLink,
    copiedLinkId,
    handleRevokeTempLink,
  } = admin;

  return (
    <ScrollContainer>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Temporary Access Links</h2>
        <Button onClick={handleCreateTempLink} disabled={creatingLink}>
          {creatingLink ? 'Creating...' : '+ Generate New Link'}
        </Button>
      </div>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Generate secure temporary links for password-free access. Links expire in 5 minutes.
      </p>

      {tempLinks.length === 0 ? (
        <EmptyState>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span>No links created yet</span>
          <span style={{ fontSize: '0.8rem' }}>Click "Generate New Link" to create one</span>
        </EmptyState>
      ) : (
        tempLinks.map((link) => {
          const { status, label } = getLinkStatus(link);
          const badgeColor = status === 'active' ? 'green' : status === 'revoked' ? 'red' : 'gray';
          const dotColor = badgeColor === 'green' ? 'green' : badgeColor === 'red' ? 'red' : 'gray';
          return (
            <LinkCard key={link._id} $variant={status === 'active' ? 'success' : undefined}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <Badge $color={badgeColor}>
                    <StatusDot $color={dotColor} />
                    {label}
                  </Badge>
                  {status === 'active' && (
                    <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                      ⏱️ {getTimeRemaining(link.expiresAt)} remaining
                    </span>
                  )}
                </div>
                <LinkUrlBox>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {window.location.origin}/join/{link.token.substring(0, 12)}...
                  </span>
                  {status === 'active' && (
                    <CopyButton onClick={() => handleCopyLink(link.token, link._id)}>
                      {copiedLinkId === link._id ? '✓ Copied!' : 'Copy'}
                    </CopyButton>
                  )}
                </LinkUrlBox>
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                  Created: {formatDateTime(link.createdAt)}
                  {link.revokedAt && ` · Revoked: ${formatDateTime(link.revokedAt)}`}
                </div>
                {link.usedBy && link.usedBy.length > 0 && (
                  <UsedByList>
                    Used by:{' '}
                    {link.usedBy.map((u, i) => (
                      <Badge key={i} $color="blue" style={{ marginLeft: '0.3rem' }}>
                        {u.username} ({formatTime(u.joinedAt)})
                      </Badge>
                    ))}
                  </UsedByList>
                )}
              </div>
              {status === 'active' && (
                <SmallDangerButton onClick={() => handleRevokeTempLink(link._id)}>Revoke</SmallDangerButton>
              )}
            </LinkCard>
          );
        })
      )}
    </ScrollContainer>
  );
}
