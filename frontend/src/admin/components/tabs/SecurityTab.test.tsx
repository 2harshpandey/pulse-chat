import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecurityTab } from './SecurityTab';
import { auditTypeLabel } from '../../utils';
import type { AdminController } from '../../hooks';
import type { AuditLogData } from '../../types';

function createMockAdmin(overrides: Partial<AdminController> = {}): AdminController {
  return {
    roomId: 'test-room',
    lockdownStatus: { isActive: false },
    handleRemoveLockdown: vi.fn(),
    handleSetLockdown: vi.fn(),
    customLockdownMinutes: '30',
    setCustomLockdownMinutes: vi.fn(),
    blockedUsers: [],
    handleUnblockUser: vi.fn(),
    auditLogs: [],
    ...overrides,
  } as unknown as AdminController;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Audit Log Label Formatting and SecurityTab', () => {
  describe('auditTypeLabel utility', () => {
    it('formats messages_deleted_disappear with delete action correctly', () => {
      const label = auditTypeLabel('messages_deleted_disappear', { action: 'delete' });
      expect(label).toBe('🗑️ Messages Deleted (Disappeared)');
    });

    it('formats messages_deleted_disappear with hide action correctly', () => {
      const label = auditTypeLabel('messages_deleted_disappear', { action: 'hide' });
      expect(label).toBe('💨 Messages Vanished (Hidden)');
    });

    it('formats messages_deleted_disappear with no details as standard disappeared message', () => {
      const label = auditTypeLabel('messages_deleted_disappear');
      expect(label).toBe('🗑️ Messages Deleted (Disappeared)');
    });

    it('formats messages_deleted_bubble and messages_hidden properly', () => {
      expect(auditTypeLabel('messages_deleted_bubble')).toBe('🗑️ Messages Deleted (Bubble Kept)');
      expect(auditTypeLabel('messages_hidden')).toBe('👁️ Messages Hidden');
    });

    it('formats room_deleted properly', () => {
      expect(auditTypeLabel('room_deleted')).toBe('🗑️ Room Deleted');
    });

    it('formats standard security audit types with icons', () => {
      expect(auditTypeLabel('join_failed_username_taken')).toBe('⚠️ Join Failed (Username Taken)');
      expect(auditTypeLabel('join_failed_password')).toBe('❌ Join Failed (Wrong Password)');
      expect(auditTypeLabel('user_force_logged_out')).toBe('🔒 Force Logged Out');
      expect(auditTypeLabel('potential_bruteforce_detected')).toBe('🚨 Potential Brute Force Detected');
    });

    it('formats unknown underscored types into Title Case fallback', () => {
      expect(auditTypeLabel('custom_security_event')).toBe('Custom Security Event');
    });
  });

  describe('SecurityTab component rendering', () => {
    it('renders audit log for vanished messages with count and action', () => {
      const sampleLogs: AuditLogData[] = [
        {
          _id: 'log-1',
          type: 'messages_deleted_disappear',
          details: { count: 3, action: 'delete' },
          timestamp: new Date().toISOString(),
        },
      ];

      const admin = createMockAdmin({ auditLogs: sampleLogs });
      render(<SecurityTab admin={admin} />);

      expect(screen.getByText('🗑️ Messages Deleted (Disappeared)')).toBeInTheDocument();
      expect(screen.getByText(/Count:\s*3\s*messages/i)).toBeInTheDocument();
      expect(screen.getByText(/Action:\s*Permanent delete/i)).toBeInTheDocument();
    });

    it('renders audit log for hidden vanished messages correctly', () => {
      const sampleLogs: AuditLogData[] = [
        {
          _id: 'log-2',
          type: 'messages_deleted_disappear',
          details: { count: 1, action: 'hide' },
          timestamp: new Date().toISOString(),
        },
      ];

      const admin = createMockAdmin({ auditLogs: sampleLogs });
      render(<SecurityTab admin={admin} />);

      expect(screen.getByText('💨 Messages Vanished (Hidden)')).toBeInTheDocument();
      expect(screen.getByText(/Count:\s*1\s*message/i)).toBeInTheDocument();
      expect(screen.getByText(/Action:\s*Hidden from chat/i)).toBeInTheDocument();
    });

    it('renders audit log with room badge when viewed from super admin room "me"', () => {
      const sampleLogs: AuditLogData[] = [
        {
          _id: 'log-3',
          roomId: 'room-alpha',
          type: 'join_failed_password',
          details: { username: 'genericUser' },
          ip: '192.168.1.1',
          timestamp: new Date().toISOString(),
        },
      ];

      const admin = createMockAdmin({ roomId: 'me', auditLogs: sampleLogs });
      render(<SecurityTab admin={admin} />);

      expect(screen.getByText('[Room: room-alpha]')).toBeInTheDocument();
      expect(screen.getByText('❌ Join Failed (Wrong Password)')).toBeInTheDocument();
      expect(screen.getByText(/User:\s*genericUser/i)).toBeInTheDocument();
      expect(screen.getByText(/IP:\s*192\.168\.1\.1/i)).toBeInTheDocument();
    });
  });
});
