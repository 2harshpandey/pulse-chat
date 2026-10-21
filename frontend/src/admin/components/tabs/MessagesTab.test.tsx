import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MessagesTab } from './MessagesTab';
import type { AdminController } from '../../hooks';

function createMockAdmin(overrides: Partial<AdminController> = {}): AdminController {
  return {
    roomId: 'global',
    selectedMessages: new Set<string>(),
    setShowBulkDeleteModal: vi.fn(),
    handleDeleteRoom: vi.fn(),
    apiUrl: 'http://localhost:8080',
    apiHeaders: vi.fn(() => ({ 'Content-Type': 'application/json' })),
    showMessageFilters: true,
    setShowMessageFilters: vi.fn(),
    filterMessageId: '',
    setFilterMessageId: vi.fn(),
    filterUser: '',
    setFilterUser: vi.fn(),
    filterEventType: 'All',
    setFilterEventType: vi.fn(),
    filterContent: '',
    setFilterContent: vi.fn(),
    isHistoryLoading: false,
    uniqueValidMessageIds: new Set<string>(),
    handleSelectAll: vi.fn(),
    filteredHistoryLogs: [],
    displayedLogsCount: 50,
    setDisplayedLogsCount: vi.fn(),
    extractMessageId: vi.fn((log: any) => log?.id || log?._id || 'msg-1'),
    handleSelectMessage: vi.fn(),
    laterDeletedByUserIds: new Set<string>(),
    pinnedMessages: [],
    handleUnpin: vi.fn(),
    handleInitiatePin: vi.fn(),
    hasMoreLogs: false,
    isLoadingMoreLogs: false,
    loadMoreLogs: vi.fn(),
    ...overrides,
  } as unknown as AdminController;
}

describe('MessagesTab responsive toolbar and controls', () => {
  it('renders title, events badge, and action toolbar correctly', () => {
    const admin = createMockAdmin({
      filteredHistoryLogs: [{ id: '1', type: 'create', username: 'alice', timestamp: Date.now() }],
    });

    render(<MessagesTab admin={admin} />);

    expect(screen.getByText('Message Log')).toBeInTheDocument();
    expect(screen.getByText('1 event')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all rooms/i })).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    expect(deleteBtn).toBeDisabled();
  });

  it('enables delete button with count when messages are selected', () => {
    const selected = new Set<string>(['msg-1', 'msg-2']);
    const admin = createMockAdmin({ selectedMessages: selected });

    render(<MessagesTab admin={admin} />);

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    expect(deleteBtn).not.toBeDisabled();
    expect(deleteBtn).toHaveTextContent('(2)');
  });

  it('triggers setShowMessageFilters when filter toggle is clicked', () => {
    const setShowMessageFilters = vi.fn();
    const admin = createMockAdmin({ setShowMessageFilters });

    render(<MessagesTab admin={admin} />);

    const filterBtn = screen.getByRole('button', { name: /hide message log filters|show message log filters/i });
    fireEvent.click(filterBtn);

    expect(setShowMessageFilters).toHaveBeenCalledTimes(1);
  });

  it('displays active filter count and clears all filters when clear is clicked', () => {
    const setFilterMessageId = vi.fn();
    const setFilterUser = vi.fn();
    const setFilterEventType = vi.fn();
    const setFilterContent = vi.fn();

    const admin = createMockAdmin({
      filterUser: 'alice',
      filterEventType: 'Edit',
      setFilterMessageId,
      setFilterUser,
      setFilterEventType,
      setFilterContent,
      filteredHistoryLogs: [],
    });

    render(<MessagesTab admin={admin} />);

    // Active filters badge should show count (2)
    expect(screen.getByText('2')).toBeInTheDocument();

    // Clear filters button should be visible
    const clearBtn = screen.getByRole('button', { name: /clear filters/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);

    expect(setFilterMessageId).toHaveBeenCalledWith('');
    expect(setFilterUser).toHaveBeenCalledWith('');
    expect(setFilterEventType).toHaveBeenCalledWith('All');
    expect(setFilterContent).toHaveBeenCalledWith('');
  });
});
