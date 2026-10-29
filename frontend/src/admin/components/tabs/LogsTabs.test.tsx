import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveActivityTab } from './LiveActivityTab';
import { ServerLogsTab } from './ServerLogsTab';
import { LogsCopyButton } from '../LogsCopyButton';
import type { AdminController } from '../../hooks';
import * as chatUtils from '../../../chat/utils';

function createMockAdmin(overrides: Partial<AdminController> = {}): AdminController {
  return {
    roomId: 'global',
    activityLogRef: { current: null },
    activityLogs: [],
    serverLogs: [],
    isServerLogsLoading: false,
    handleRefreshServerLogs: vi.fn(),
    ...overrides,
  } as unknown as AdminController;
}

describe('LogsCopyButton and Logs Tabs', () => {
  let copySpy: any;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    copySpy = vi.spyOn(chatUtils, 'copyTextToClipboard').mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('LogsCopyButton component', () => {
    it('renders with copy icon and label', () => {
      render(<LogsCopyButton getLogsText={() => 'Sample log'} hasLogs={true} />);

      const button = screen.getByRole('button', { name: /copy logs/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
      expect(screen.getByText('Copy Logs')).toBeInTheDocument();
    });

    it('is disabled when hasLogs is false', () => {
      render(<LogsCopyButton getLogsText={() => ''} hasLogs={false} />);

      const button = screen.getByRole('button', { name: /copy logs/i });
      expect(button).toBeDisabled();
    });

    it('copies text and displays "Copied!" feedback, then resets', async () => {
      const getLogs = vi.fn(() => 'Line 1\nLine 2');
      render(<LogsCopyButton getLogsText={getLogs} hasLogs={true} />);

      const button = screen.getByRole('button', { name: /copy logs/i });
      fireEvent.click(button);

      expect(getLogs).toHaveBeenCalledTimes(1);
      expect(copySpy).toHaveBeenCalledWith('Line 1\nLine 2');

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });

      // Fast forward 2000ms
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByText('Copy Logs')).toBeInTheDocument();
      });
    });
  });

  describe('LiveActivityTab', () => {
    it('renders heading, log items, and functional copy button', async () => {
      const admin = createMockAdmin({
        activityLogs: [
          '[7:39:08 PM] An admin client connected to admin channel.',
          '[7:35:15 PM] [Room: room-b] User \'genericUser\' connected.',
        ],
      });

      render(<LiveActivityTab admin={admin} />);

      expect(screen.getByRole('heading', { level: 2, name: /real-time activity/i })).toBeInTheDocument();
      expect(screen.getByText('2 events')).toBeInTheDocument();
      expect(screen.getByText('[7:39:08 PM]')).toBeInTheDocument();
      expect(screen.getByText('An admin client connected to admin channel.')).toBeInTheDocument();
      expect(screen.getByText('[Room: room-b]')).toBeInTheDocument();
      expect(screen.getByText("User 'genericUser' connected.")).toBeInTheDocument();

      const copyBtn = screen.getByRole('button', { name: /copy logs/i });
      expect(copyBtn).toBeEnabled();

      fireEvent.click(copyBtn);

      expect(copySpy).toHaveBeenCalledWith(
        '[7:39:08 PM] An admin client connected to admin channel.\n[7:35:15 PM] [Room: room-b] User \'genericUser\' connected.'
      );

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });

    it('disables copy button when activityLogs is empty and shows empty state', () => {
      const admin = createMockAdmin({ activityLogs: [] });
      render(<LiveActivityTab admin={admin} />);

      expect(screen.getByText(/no live activity recorded yet/i)).toBeInTheDocument();
      const copyBtn = screen.getByRole('button', { name: /copy logs/i });
      expect(copyBtn).toBeDisabled();
    });
  });

  describe('ServerLogsTab', () => {
    it('renders heading, log items, copy button, and ensures refresh button is removed', async () => {
      const sampleJsonLog = JSON.stringify({
        level: 'info',
        message: 'A new client connected!',
        timestamp: '2026-10-24T19:02:13.000Z',
      });

      const admin = createMockAdmin({
        serverLogs: [sampleJsonLog],
        isServerLogsLoading: false,
      });

      render(<ServerLogsTab admin={admin} />);

      expect(screen.getByRole('heading', { level: 2, name: /server logs/i })).toBeInTheDocument();

      // Refresh button must be removed completely
      expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();

      const copyBtn = screen.getByRole('button', { name: /copy logs/i });
      expect(copyBtn).toBeEnabled();

      fireEvent.click(copyBtn);

      expect(copySpy).toHaveBeenCalledTimes(1);
      const copiedContent = copySpy.mock.calls[0][0];
      expect(copiedContent).toContain('IST');
      expect(copiedContent).toMatch(/\b(AM|PM)\s+IST/);
      expect(copiedContent).toContain('A new client connected!');

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });

    it('formats server log lines with AM or PM beside IST', async () => {
      const { formatServerLogLine } = await import('../../utils');

      // Test 1: UTC ISO date conversion to IST with AM/PM
      const isoLog = JSON.stringify({
        level: 'info',
        message: 'Test ISO',
        timestamp: '2026-10-24T19:02:13.000Z',
      });
      const formattedIso = formatServerLogLine(isoLog);
      expect(formattedIso).toMatch(/\d{2}:\d{2}:\d{2}\s+(AM|PM)\s+IST/);

      // Test 2: Existing 24h IST log without AM/PM is converted
      const oldIstLog = JSON.stringify({
        level: 'info',
        message: 'Reconnected',
        timestamp: '2026-10-29 13:55:18 IST',
      });
      const formattedOldIst = formatServerLogLine(oldIstLog);
      expect(formattedOldIst).toContain('2026-10-29 01:55:18 PM IST');

      // Test 3: Log already with AM/PM IST remains unchanged
      const newIstLog = JSON.stringify({
        level: 'info',
        message: 'User joined',
        timestamp: '2026-10-29 02:30:00 PM IST',
      });
      const formattedNew = formatServerLogLine(newIstLog);
      expect(formattedNew).toContain('2026-10-29 02:30:00 PM IST');
    });

    it('disables copy button while server logs are loading', () => {
      const admin = createMockAdmin({
        serverLogs: ['sample log'],
        isServerLogsLoading: true,
      });

      render(<ServerLogsTab admin={admin} />);

      expect(screen.getByText('Loading server logs...')).toBeInTheDocument();
      const copyBtn = screen.getByRole('button', { name: /copy logs/i });
      expect(copyBtn).toBeDisabled();
    });

    it('separates copied logs with an empty line between each log entry', async () => {
      const log1 = 'Log line 1';
      const log2 = 'Log line 2';
      const admin = createMockAdmin({
        serverLogs: [log1, log2],
        isServerLogsLoading: false,
      });

      render(<ServerLogsTab admin={admin} />);

      const copyBtn = screen.getByRole('button', { name: /copy logs/i });
      fireEvent.click(copyBtn);

      expect(copySpy).toHaveBeenCalledWith('Log line 1\n\nLog line 2');
      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });
});
