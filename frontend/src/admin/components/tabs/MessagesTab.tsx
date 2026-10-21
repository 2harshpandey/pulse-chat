import React from 'react';
import type { AdminController } from '../../hooks';
import { formatDate, formatTime, isGiphyUrl, sanitizeUrl } from '../../utils';
import {
  MessageLogScrollContainer,
  MessagesHeaderRow,
  MessagesHeaderTitleGroup,
  MessagesCountBadge,
  MessagesToolbar,
  ToolbarButton,
  FilterBadgeDot,
  ClearFiltersButton,
  FilterFooterRow,
  ResponsiveButtonLabel,
  FilterToggleButton,
  MessageFilterCollapse,
  FilterContainer,
  Input,
  SelectWrapper,
  Select,
  MessageLogTableWrapper,
  MessageLogTable,
  StickyTh,
  NoWrapTd,
  Td,
  Badge,
  StatusDot,
  ExpandTd,
  SmallDangerButton,
  SmallSuccessButton,
  Button,
  AdminLogLink,
} from '../../AdminStyledComponents';

export interface MessagesTabProps {
  admin: AdminController;
}

export function MessagesTab({ admin }: MessagesTabProps) {
  const {
    roomId,
    selectedMessages,
    setShowBulkDeleteModal,
    handleDeleteRoom,
    apiUrl,
    apiHeaders,
    showMessageFilters,
    setShowMessageFilters,
    filterMessageId,
    setFilterMessageId,
    filterUser,
    setFilterUser,
    filterEventType,
    setFilterEventType,
    filterContent,
    setFilterContent,
    isHistoryLoading,
    uniqueValidMessageIds,
    handleSelectAll,
    filteredHistoryLogs,
    displayedLogsCount,
    setDisplayedLogsCount,
    extractMessageId,
    handleSelectMessage,
    laterDeletedByUserIds,
    pinnedMessages,
    handleUnpin,
    handleInitiatePin,
    hasMoreLogs,
    isLoadingMoreLogs,
    loadMoreLogs,
  } = admin;

  const renderEventType = (logType: string) => {
    switch (logType) {
      case 'create':
        return 'Create';
      case 'edit':
        return 'Edit';
      case 'upload':
        return 'Upload';
      case 'delete_everyone':
      case 'delete':
        return 'Delete (Everyone)';
      default:
        return logType;
    }
  };

  const renderMessageDetails = (log: any) => {
    const formatMedia = (content: any) => {
      if (!content) return '"[Empty]"';
      const text = content.text || '';
      if (content.url) {
        const isGif = isGiphyUrl(content.url);
        const fileName = content.originalName || (isGif ? 'GIF' : 'Uploaded File');
        const safeHref = sanitizeUrl(content.url);
        return (
          <>
            {text && `"${text}" `}
            {safeHref ? (
              <AdminLogLink href={safeHref} target="_blank" rel="noopener noreferrer">
                [{fileName}]
              </AdminLogLink>
            ) : (
              <span>[{fileName}]</span>
            )}
          </>
        );
      }
      return `"${text}"`;
    };
    switch (log.type) {
      case 'create':
        return <>Content: {formatMedia(log.message)}</>;
      case 'edit':
        return (
          <>
            Old: "{log.oldText}" → New: "{log.newText}"
          </>
        );
      case 'delete_everyone':
      case 'delete':
        return <>Deleted: {formatMedia(log.deletedContent || log.message)}</>;
      case 'upload':
        return `File: '${log.file.originalname}' (${(log.file.size / 1024).toFixed(2)} KB)`;
      default:
        return JSON.stringify(log);
    }
  };

  const activeFiltersCount =
    (filterMessageId.trim() ? 1 : 0) +
    (filterUser.trim() ? 1 : 0) +
    (filterEventType !== 'All' ? 1 : 0) +
    (filterContent.trim() ? 1 : 0);

  const handleClearAllFilters = () => {
    setFilterMessageId('');
    setFilterUser('');
    setFilterEventType('All');
    setFilterContent('');
  };

  return (
    <MessageLogScrollContainer>
      <MessagesHeaderRow>
        <MessagesHeaderTitleGroup>
          <h2>Message Log</h2>
          <MessagesCountBadge>
            {filteredHistoryLogs.length} {filteredHistoryLogs.length === 1 ? 'event' : 'events'}
          </MessagesCountBadge>
        </MessagesHeaderTitleGroup>

        <MessagesToolbar>
          <FilterToggleButton
            type="button"
            $open={showMessageFilters}
            $hasActive={activeFiltersCount > 0}
            onClick={() => setShowMessageFilters((prev) => !prev)}
            aria-label={showMessageFilters ? 'Hide message log filters' : 'Show message log filters'}
            title={showMessageFilters ? 'Hide filters' : 'Show filters'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Filters</span>
            {activeFiltersCount > 0 && <FilterBadgeDot>{activeFiltersCount}</FilterBadgeDot>}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{
                width: '12px',
                height: '12px',
                transform: showMessageFilters ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </FilterToggleButton>

          <ToolbarButton
            type="button"
            $variant="primary"
            onClick={async () => {
              try {
                const res = await fetch(`${apiUrl}/api/admin/export-messages`, { headers: apiHeaders() });
                if (!res.ok) throw new Error('Failed to export messages');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `messages_export_${roomId}_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
              } catch (err) {
                console.error('Export failed', err);
                alert('Failed to export messages.');
              }
            }}
            title={roomId === 'me' ? 'Export Private Messages' : 'Export Room Messages'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <ResponsiveButtonLabel>
              <span className="long-label">{roomId === 'me' ? 'Export Private Messages' : 'Export Messages'}</span>
              <span className="short-label">{roomId === 'me' ? 'Export Private' : 'Export'}</span>
            </ResponsiveButtonLabel>
          </ToolbarButton>

          {(roomId === 'me' || roomId === 'global') && (
            <ToolbarButton
              type="button"
              $variant="primary"
              onClick={async () => {
                try {
                  const res = await fetch(`${apiUrl}/api/admin/export-all-messages`, { headers: apiHeaders() });
                  if (!res.ok) throw new Error('Failed to export all messages');
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `all_rooms_messages_export_${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                } catch (err) {
                  console.error('Export failed', err);
                  alert('Failed to export all messages.');
                }
              }}
              title="Export messages from all rooms"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <ResponsiveButtonLabel>
                <span className="long-label">Export All Rooms</span>
                <span className="short-label">All Rooms</span>
              </ResponsiveButtonLabel>
            </ToolbarButton>
          )}

          <ToolbarButton
            type="button"
            $variant="danger"
            onClick={() => setShowBulkDeleteModal(true)}
            disabled={selectedMessages.size === 0}
            title={
              selectedMessages.size === 0
                ? 'Select messages from the table below to delete'
                : `Delete ${selectedMessages.size} selected message(s)`
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <ResponsiveButtonLabel>
              <span className="long-label">
                Delete Message(s){selectedMessages.size > 0 ? ` (${selectedMessages.size})` : ''}
              </span>
              <span className="short-label">
                Delete{selectedMessages.size > 0 ? ` (${selectedMessages.size})` : ''}
              </span>
            </ResponsiveButtonLabel>
          </ToolbarButton>

          {roomId !== 'me' && roomId !== 'global' && (
            <ToolbarButton
              type="button"
              $variant="danger"
              onClick={handleDeleteRoom}
              style={{ background: '#7f1d1d', borderColor: '#991b1b' }}
              title="Delete this chat room and all messages"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
              Delete Room
            </ToolbarButton>
          )}
        </MessagesToolbar>
      </MessagesHeaderRow>

      <MessageFilterCollapse $open={showMessageFilters}>
        <FilterContainer>
          <Input
            type="text"
            placeholder="Filter by Message ID"
            value={filterMessageId}
            onChange={(e) => setFilterMessageId(e.target.value)}
          />
          <Input
            type="text"
            placeholder="Filter by User"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          />
          <SelectWrapper>
            <Select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value)}>
              <option value="All">All Events</option>
              <option value="Create">Create</option>
              <option value="Edit">Edit</option>
              <option value="Upload">Upload</option>
              <option value="Delete (Everyone)">Delete (Everyone)</option>
              <option value="Deleted by admin">Deleted by admin</option>
              <option value="Photo">Photo</option>
              <option value="Video">Video</option>
              <option value="GIF">GIF</option>
              <option value="Document">Document</option>
              <option value="Pinned Messages">Pinned Messages</option>
            </Select>
          </SelectWrapper>
          <Input
            type="text"
            placeholder="Filter by Content"
            value={filterContent}
            onChange={(e) => setFilterContent(e.target.value)}
          />
          {activeFiltersCount > 0 && (
            <FilterFooterRow>
              <span>
                {activeFiltersCount} active filter{activeFiltersCount > 1 ? 's' : ''} applied (
                {filteredHistoryLogs.length} event{filteredHistoryLogs.length === 1 ? '' : 's'} matching)
              </span>
              <ClearFiltersButton type="button" onClick={handleClearAllFilters}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Clear Filters
              </ClearFiltersButton>
            </FilterFooterRow>
          )}
        </FilterContainer>
      </MessageFilterCollapse>
      {isHistoryLoading ? (
        <p>Loading history...</p>
      ) : (
        <MessageLogTableWrapper>
          <MessageLogTable>
            <thead>
              <tr>
                <StickyTh style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={uniqueValidMessageIds.size > 0 && selectedMessages.size === uniqueValidMessageIds.size}
                    onChange={handleSelectAll}
                  />
                </StickyTh>
                <StickyTh>Date</StickyTh>
                <StickyTh>Time</StickyTh>
                <StickyTh>Event</StickyTh>
                <StickyTh>User</StickyTh>
                <StickyTh>Message ID</StickyTh>
                <StickyTh style={{ textAlign: 'center' }}>Status</StickyTh>
                <StickyTh style={{ width: '100%' }}>Details</StickyTh>
                <StickyTh>Actions</StickyTh>
              </tr>
            </thead>
            <tbody>
              {filteredHistoryLogs.length === 0 ? (
                <tr>
                  <Td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    {isLoadingMoreLogs ? 'Loading messages...' : 'No messages found.'}
                  </Td>
                </tr>
              ) : (
                filteredHistoryLogs.slice(0, displayedLogsCount).map((log, index) => {
                  const msgId = extractMessageId(log);
                  const isSelectable = !!msgId;
                  return (
                    <tr key={index}>
                      <NoWrapTd style={{ textAlign: 'center' }}>
                        {isSelectable && (
                          <input
                            type="checkbox"
                            checked={selectedMessages.has(msgId)}
                            onChange={(e) => handleSelectMessage(msgId, e.target.checked)}
                          />
                        )}
                      </NoWrapTd>
                      <NoWrapTd>{formatDate(log.timestamp)}</NoWrapTd>
                      <NoWrapTd>{formatTime(log.timestamp)}</NoWrapTd>
                      <NoWrapTd>{renderEventType(log.type)}</NoWrapTd>
                      <Td>
                        {log.username} ({log.userId})
                      </Td>
                      <Td
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          color: '#64748b',
                          minWidth: '180px',
                          maxWidth: '250px',
                          wordBreak: 'break-all',
                        }}
                      >
                        {log.messageId || log.message?.id || log.message?._id || log._id || 'N/A'}
                      </Td>
                      <Td style={{ textAlign: 'center' }}>
                        {log.message?.deletedBy === 'admin' || log.message?.vanished ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                            <Badge $color="red" style={{ whiteSpace: 'nowrap' }}>
                              <StatusDot $color="red" /> Deleted by Admin
                            </Badge>
                            {log.message?.vanished ? (
                              <Badge $color="gray" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                <StatusDot $color="gray" /> Vanished (No Bubble)
                              </Badge>
                            ) : (
                              <Badge $color="yellow" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                <StatusDot $color="yellow" /> Bubble Showing
                              </Badge>
                            )}
                          </div>
                        ) : (log.type === 'delete_everyone' || log.type === 'delete') ? (
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Badge $color="yellow" style={{ whiteSpace: 'nowrap' }}>
                              Deleted by User
                            </Badge>
                          </div>
                        ) : log.type === 'create' && (laterDeletedByUserIds.has(extractMessageId(log)) || (log.message?.isDeleted && log.message?.deletedBy !== 'admin')) ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                            <Badge $color="green" style={{ whiteSpace: 'nowrap' }}>
                              Sent
                            </Badge>
                            <Badge $color="yellow" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                              ↳ Deleted by User
                            </Badge>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Badge $color="green" style={{ whiteSpace: 'nowrap' }}>
                              Active
                            </Badge>
                          </div>
                        )}
                      </Td>
                      <ExpandTd>{renderMessageDetails(log)}</ExpandTd>
                      <NoWrapTd>
                        {log.type === 'create' &&
                          (log.messageId || log.message?.id || log.message?._id || log._id) &&
                          (pinnedMessages.some(
                            (p) => p.id === (log.messageId || log.message?.id || log.message?._id || log._id)
                          ) ? (
                            <SmallDangerButton
                              onClick={() =>
                                handleUnpin(log.messageId || log.message?.id || log.message?._id || log._id)
                              }
                            >
                              Unpin
                            </SmallDangerButton>
                          ) : (
                            <SmallSuccessButton
                              onClick={() =>
                                handleInitiatePin(log.messageId || log.message?.id || log.message?._id || log._id)
                              }
                            >
                              Pin
                            </SmallSuccessButton>
                          ))}
                      </NoWrapTd>
                    </tr>
                  );
                })
              )}
            </tbody>
          </MessageLogTable>
          {filteredHistoryLogs.length > 0 &&
            (displayedLogsCount < filteredHistoryLogs.length || (filterEventType !== 'Pinned Messages' && hasMoreLogs)) && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
              <Button onClick={loadMoreLogs} disabled={isLoadingMoreLogs}>
                {isLoadingMoreLogs ? 'Loading More Messages...' : 'Load More Messages'}
              </Button>
            </div>
          )}
          {filteredHistoryLogs.length > 0 &&
            !(displayedLogsCount < filteredHistoryLogs.length || (filterEventType !== 'Pinned Messages' && hasMoreLogs)) && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
              All messages loaded ({filteredHistoryLogs.length} total)
            </div>
          )}
        </MessageLogTableWrapper>
      )}
    </MessageLogScrollContainer>
  );
}
