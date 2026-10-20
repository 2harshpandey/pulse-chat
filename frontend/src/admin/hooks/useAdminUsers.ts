import { useState, useMemo } from 'react';
import type { UserProfile, BlockedUserData, LoggedInUser, UserReportData } from '../types';
import { sanitizePathId } from '../utils';

interface UseAdminUsersOptions {
  apiUrl: string;
  apiHeaders: () => Record<string, string>;
}

export function useAdminUsers({ apiUrl, apiHeaders }: UseAdminUsersOptions) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [onlineUsersList, setOnlineUsersList] = useState<UserProfile[]>([]);
  const [loggedInUsersList, setLoggedInUsersList] = useState<LoggedInUser[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserData[]>([]);
  const [userReports, setUserReports] = useState<UserReportData[]>([]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [users]);

  const sortedReports = useMemo(() => {
    return [...userReports].sort((a, b) => {
      const aTime = new Date(a.reportedAt).getTime();
      const bTime = new Date(b.reportedAt).getTime();
      return bTime - aTime;
    });
  }, [userReports]);

  const handleForceLogout = async (userId: string) => {
    if (!window.confirm('Force logout this user?')) return;
    try {
      const safeId = sanitizePathId(userId);
      await fetch(`${apiUrl}/api/admin/force-logout/${safeId}`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      setOnlineUsersList((prev) => prev.filter((u) => u.userId !== userId));
      setLoggedInUsersList((prev) => prev.filter((u) => u.userId !== userId));
    } catch (err) {
      console.error('Failed to force logout', err);
    }
  };

  const handleForceLogoutAll = async () => {
    if (!window.confirm(`Force logout ALL ${onlineUsersList.length} online user(s)? This cannot be undone.`)) return;
    try {
      await fetch(`${apiUrl}/api/admin/force-logout-all`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      setOnlineUsersList([]);
      setLoggedInUsersList([]);
    } catch (err) {
      console.error('Failed to force logout all', err);
    }
  };

  const handleBlockUser = async (userId: string, username: string) => {
    const reason = prompt(`Block user "${username}"? Enter a reason (optional):`);
    if (reason === null) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/block-user`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ userId, username, reason }),
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers((prev) => [data.blockedUser, ...prev.filter((u) => u.userId !== userId)]);
        setOnlineUsersList((prev) => prev.filter((u) => u.userId !== userId));
        setLoggedInUsersList((prev) => prev.filter((u) => u.userId !== userId));
      }
    } catch (err) {
      console.error('Failed to block user', err);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    if (!window.confirm('Unblock this user?')) return;
    try {
      const safeId = sanitizePathId(userId);
      const res = await fetch(`${apiUrl}/api/admin/unblock-user/${safeId}`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers((prev) => prev.map((u) => (u.userId === userId ? data.blockedUser : u)));
      }
    } catch (err) {
      console.error('Failed to unblock user', err);
    }
  };

  return {
    users,
    setUsers,
    sortedUsers,
    onlineUsersList,
    setOnlineUsersList,
    loggedInUsersList,
    setLoggedInUsersList,
    blockedUsers,
    setBlockedUsers,
    userReports,
    setUserReports,
    sortedReports,
    handleForceLogout,
    handleForceLogoutAll,
    handleBlockUser,
    handleUnblockUser,
  };
}
