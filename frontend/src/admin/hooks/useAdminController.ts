import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../../ThemeContext';
import { resolveApiBaseUrl } from '../../chat/utils';
import type { UserProfile, Tab } from '../types';
import { useAdminTempLinks } from './useAdminTempLinks';
import { useAdminSecurity } from './useAdminSecurity';
import { useAdminUsers } from './useAdminUsers';
import { useAdminRoomSettings } from './useAdminRoomSettings';
import { useAdminMessages } from './useAdminMessages';
import { useAdminWebSocket } from './useAdminWebSocket';

export function useAdminController() {
  const { isDark, toggleTheme } = useTheme();
  const { roomId: urlRoomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [roomId, setRoomId] = useState(urlRoomId || 'me');
  const [isImpersonating] = useState(!!location.state?.isImpersonating);
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [globalRooms, setGlobalRooms] = useState<any[]>([]);
  const [isRoomsLoading, setIsRoomsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isServerLogsLoading, setIsServerLogsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [activityLogs, setActivityLogs] = useState<string[]>(() => {
    const targetRoom = urlRoomId || 'me';
    try {
      const saved = sessionStorage.getItem(`admin-activity-logs-${targetRoom}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`admin-activity-logs-${roomId}`);
      setActivityLogs(saved ? JSON.parse(saved) : []);
    } catch {
      setActivityLogs([]);
    }
  }, [roomId]);

  const ws = useRef<WebSocket | null>(null);
  const activityLogRef = useRef<HTMLDivElement>(null);
  const adminPasswordInputRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<string>('');
  const [showMessageFilters, setShowMessageFilters] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  );

  const [, setLinkTimerKey] = useState(0);

  const apiHeaders = useCallback(
    () => ({
      'x-admin-password': passwordRef.current,
      'x-room-id': roomId,
      'Content-Type': 'application/json',
    }),
    [roomId]
  );
  const apiUrl = resolveApiBaseUrl();

  // --- Domain Sub-hooks ---
  const usersHook = useAdminUsers({ apiUrl, apiHeaders });
  const messagesHook = useAdminMessages({
    apiUrl,
    apiHeaders,
    users: usersHook.users,
    ws,
  });
  const tempLinksHook = useAdminTempLinks({ apiUrl, apiHeaders });
  const securityHook = useAdminSecurity({ apiUrl, apiHeaders });
  const roomSettingsHook = useAdminRoomSettings({
    apiUrl,
    apiHeaders,
    passwordRef,
    navigate,
  });

  // --- WebSocket Connection ---
  useAdminWebSocket({
    isAuthenticated,
    roomId,
    passwordRef,
    ws,
    setActivityLogs,
    setHistoryLogs: messagesHook.setHistoryLogs,
    setPinnedMessages: messagesHook.setPinnedMessages,
    setOnlineUsersList: usersHook.setOnlineUsersList,
    setUsers: usersHook.setUsers,
    setLoggedInUsersList: usersHook.setLoggedInUsersList,
    setServerLogs,
    setTempLinks: tempLinksHook.setTempLinks,
    setBlockedUsers: usersHook.setBlockedUsers,
    setLockdownStatus: securityHook.setLockdownStatus,
    setAuditLogs: securityHook.setAuditLogs,
    setUserReports: usersHook.setUserReports,
  });

  // Refresh link countdown timers every second
  useEffect(() => {
    const interval = setInterval(() => setLinkTimerKey((k) => k + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activityLogRef.current) activityLogRef.current.scrollTop = 0;
  }, [activityLogs]);

  // Window title
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Pulse - Admin Panel';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  // Hide global home button when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      document.body.classList.add('hide-global-home-btn');
    } else {
      document.body.classList.remove('hide-global-home-btn');
    }
    return () => document.body.classList.remove('hide-global-home-btn');
  }, [isAuthenticated]);

  // Screen resize for message filters
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setShowMessageFilters(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const focusAdminPasswordInput = useCallback((pos?: number | null) => {
    const input = adminPasswordInputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
      if (pos !== undefined && pos !== null) {
        input.setSelectionRange(pos, pos);
      }
    } catch {
      input.focus();
    }
  }, []);

  // --- Auth Handlers ---
  const handleLogin = async (providedPassword?: string) => {
    setIsLoading(true);
    setError('');
    try {
      const enteredPassword = providedPassword || password;
      const trimmedPassword = enteredPassword.trim();
      if (!enteredPassword) {
        setError('Please enter admin password.');
        return;
      }

      const passwordAttempts =
        trimmedPassword && trimmedPassword !== enteredPassword ? [enteredPassword, trimmedPassword] : [enteredPassword];

      let authenticatedPassword: string | null = null;
      let usersData: UserProfile[] = [];

      for (const candidate of passwordAttempts) {
        const authHeaders = { 'x-admin-password': candidate, 'x-room-id': roomId };
        const usersRes = await fetch(`${apiUrl}/api/admin/users`, { headers: authHeaders });

        if (usersRes.status === 401) {
          continue;
        }

        if (!usersRes.ok) {
          setError(`Admin login service unavailable (${usersRes.status}). Please try again.`);
          return;
        }

        usersData = await usersRes.json();
        authenticatedPassword = candidate;
        break;
      }

      if (!authenticatedPassword) {
        setError('Room ID or password is incorrect.');
        return;
      }

      passwordRef.current = authenticatedPassword;
      setPassword(authenticatedPassword);
      usersHook.setUsers(usersData);
      setIsAuthenticated(true);

      // Update URL if the user changed the room ID manually
      if (urlRoomId !== roomId && !(urlRoomId === undefined && roomId === 'me')) {
        navigate(`/admin/${roomId}`, { replace: true, state: { autoLoginPassword: authenticatedPassword } });
      }

      const headers = { 'x-admin-password': authenticatedPassword, 'x-room-id': roomId };

      // Fetch rooms independently
      if (roomId === 'me' || roomId === 'global') {
        setIsRoomsLoading(true);
        fetch(`${apiUrl}/api/admin/rooms`, { headers })
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            if (Array.isArray(data)) setGlobalRooms(data);
          })
          .catch(() => {})
          .finally(() => setIsRoomsLoading(false));
      }

      // Fetch history independently
      setIsHistoryLoading(true);
      fetch(`${apiUrl}/api/admin/history?limit=100`, { headers })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const rawEvents = Array.isArray(data) ? data : data.events || [];
          const hasMore = Array.isArray(data) ? data.length >= 100 : Boolean(data.hasMore);
          const oldestCursor = Array.isArray(data)
            ? rawEvents.length > 0
              ? rawEvents[rawEvents.length - 1].createdAt
              : null
            : data.oldestCreatedAt;

          if (messagesHook.filterEventType === 'All') {
            messagesHook.setHistoryLogs(
              rawEvents.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            );
            messagesHook.setHasMoreLogs(hasMore);
            messagesHook.setOldestLogCursor(oldestCursor);
            messagesHook.setDisplayedLogsCount(50);
          }
        })
        .catch(() => {})
        .finally(() => setIsHistoryLoading(false));

      // Fetch server logs independently
      if (roomId === 'me' || roomId === 'global') {
        setIsServerLogsLoading(true);
        fetch(`${apiUrl}/api/admin/server-logs`, { headers })
          .then((res) => (res.ok ? res.text() : ''))
          .then((text) => {
            if (text) setServerLogs(text.split('\n').filter((l) => l.trim().length > 0).reverse());
          })
          .catch(() => {})
          .finally(() => setIsServerLogsLoading(false));
      }

      const [tempLinksRes, blockedRes, lockdownRes, auditRes, reportsRes, loggedInRes, detailsRes] =
        await Promise.allSettled([
          fetch(`${apiUrl}/api/admin/temp-links`, { headers }),
          fetch(`${apiUrl}/api/admin/blocked-users`, { headers }),
          fetch(`${apiUrl}/api/admin/login-lockdown`, { headers }),
          fetch(`${apiUrl}/api/admin/audit-logs`, { headers }),
          fetch(`${apiUrl}/api/admin/reports`, { headers }),
          fetch(`${apiUrl}/api/admin/logged-in-users`, { headers }),
          fetch(`${apiUrl}/api/rooms/admin/details`, { headers }),
        ]);

      if (tempLinksRes.status === 'fulfilled' && tempLinksRes.value.ok) {
        tempLinksHook.setTempLinks(await tempLinksRes.value.json());
      }
      if (blockedRes.status === 'fulfilled' && blockedRes.value.ok) {
        usersHook.setBlockedUsers(await blockedRes.value.json());
      }
      if (lockdownRes.status === 'fulfilled' && lockdownRes.value.ok) {
        securityHook.setLockdownStatus(await lockdownRes.value.json());
      }
      if (auditRes.status === 'fulfilled' && auditRes.value.ok) {
        securityHook.setAuditLogs(await auditRes.value.json());
      }
      if (reportsRes.status === 'fulfilled' && reportsRes.value.ok) {
        usersHook.setUserReports(await reportsRes.value.json());
      }
      if (loggedInRes.status === 'fulfilled' && loggedInRes.value.ok) {
        usersHook.setLoggedInUsersList(await loggedInRes.value.json());
      }
      if (detailsRes.status === 'fulfilled' && detailsRes.value.ok) {
        const d = await detailsRes.value.json();
        roomSettingsHook.setRoomSettingsName(d.name || '');
        roomSettingsHook.setRoomSettingsDesc(d.description || '');
        roomSettingsHook.setRoomSettingsAlias(d.alias || '');
        roomSettingsHook.setRoomSettingsNewId(d.alias || roomId || '');
        roomSettingsHook.setRoomSettingsLastIdChange(d.lastIdChangeAt || null);
        roomSettingsHook.setRoomSettingsHasJoinPassword(d.hasJoinPassword || false);
      }
    } catch {
      setError('An error occurred while trying to log in.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (location.state?.autoLoginPassword && !isAuthenticated && !isLoading) {
      handleLogin(location.state.autoLoginPassword).then(() => {
        navigate(location.pathname, { replace: true, state: {} });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.autoLoginPassword, isAuthenticated, location.pathname, navigate]);

  const handleLogout = () => {
    if (ws.current) ws.current.close();
    passwordRef.current = '';
    try {
      sessionStorage.removeItem('admin-activity-logs');
      sessionStorage.removeItem(`admin-activity-logs-${roomId}`);
    } catch (_) {}
    setIsAuthenticated(false);
    setPassword('');
    setActivityLogs([]);
    if (isImpersonating) {
      navigate('/admin', { replace: true });
    } else {
      navigate(location.pathname, { replace: true, state: {} });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  // --- Server Logs Actions ---
  const handleRefreshServerLogs = async () => {
    if (!passwordRef.current || (roomId !== 'me' && roomId !== 'global')) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/server-logs`, {
        headers: { 'x-admin-password': passwordRef.current, 'x-room-id': roomId },
      });
      if (res.ok) setServerLogs((await res.text()).split('\n').filter((l) => l.trim().length > 0).reverse());
    } catch (err) {
      console.error('Failed to fetch server logs', err);
    }
  };

  return {
    isDark,
    toggleTheme,
    urlRoomId,
    roomId,
    setRoomId,
    navigate,
    location,
    isImpersonating,
    password,
    setPassword,
    isPasswordVisible,
    setIsPasswordVisible,
    passwordFocused,
    setPasswordFocused,
    isAuthenticated,
    error,
    setError,
    serverLogs,
    globalRooms,
    isRoomsLoading,
    isHistoryLoading,
    isServerLogsLoading,
    isLoading,
    activeTab,
    setActiveTab,
    activityLogs,
    activityLogRef,
    adminPasswordInputRef,
    passwordRef,
    showMessageFilters,
    setShowMessageFilters,
    focusAdminPasswordInput,
    handleLogin,
    handleLogout,
    handleKeyDown,
    handleRefreshServerLogs,
    apiHeaders,
    apiUrl,
    // Users
    users: usersHook.users,
    sortedUsers: usersHook.sortedUsers,
    onlineUsersList: usersHook.onlineUsersList,
    loggedInUsersList: usersHook.loggedInUsersList,
    blockedUsers: usersHook.blockedUsers,
    userReports: usersHook.userReports,
    sortedReports: usersHook.sortedReports,
    handleForceLogout: usersHook.handleForceLogout,
    handleForceLogoutAll: usersHook.handleForceLogoutAll,
    handleBlockUser: usersHook.handleBlockUser,
    handleUnblockUser: usersHook.handleUnblockUser,
    // Messages
    historyLogs: messagesHook.historyLogs,
    enrichedHistoryLogs: messagesHook.enrichedHistoryLogs,
    filteredHistoryLogs: messagesHook.filteredHistoryLogs,
    laterDeletedByUserIds: messagesHook.laterDeletedByUserIds,
    uniqueValidMessageIds: messagesHook.uniqueValidMessageIds,
    pinnedMessages: messagesHook.pinnedMessages,
    selectedMessages: messagesHook.selectedMessages,
    showBulkDeleteModal: messagesHook.showBulkDeleteModal,
    setShowBulkDeleteModal: messagesHook.setShowBulkDeleteModal,
    bulkDeleteAction: messagesHook.bulkDeleteAction,
    setBulkDeleteAction: messagesHook.setBulkDeleteAction,
    bulkDeleteVanish: messagesHook.bulkDeleteVanish,
    setBulkDeleteVanish: messagesHook.setBulkDeleteVanish,
    displayedLogsCount: messagesHook.displayedLogsCount,
    setDisplayedLogsCount: messagesHook.setDisplayedLogsCount,
    hasMoreLogs: messagesHook.hasMoreLogs,
    isLoadingMoreLogs: messagesHook.isLoadingMoreLogs,
    loadMoreLogs: messagesHook.loadMoreLogs,
    pinTargetId: messagesHook.pinTargetId,
    showPinModal: messagesHook.showPinModal,
    setShowPinModal: messagesHook.setShowPinModal,
    pinDuration: messagesHook.pinDuration,
    setPinDuration: messagesHook.setPinDuration,
    showReplaceModal: messagesHook.showReplaceModal,
    setShowReplaceModal: messagesHook.setShowReplaceModal,
    filterMessageId: messagesHook.filterMessageId,
    setFilterMessageId: messagesHook.setFilterMessageId,
    filterUser: messagesHook.filterUser,
    setFilterUser: messagesHook.setFilterUser,
    filterEventType: messagesHook.filterEventType,
    setFilterEventType: messagesHook.setFilterEventType,
    filterContent: messagesHook.filterContent,
    setFilterContent: messagesHook.setFilterContent,
    submitPin: messagesHook.submitPin,
    handleConfirmDuration: messagesHook.handleConfirmDuration,
    handleInitiatePin: messagesHook.handleInitiatePin,
    handleUnpin: messagesHook.handleUnpin,
    extractMessageId: messagesHook.extractMessageId,
    handleSelectAll: messagesHook.handleSelectAll,
    handleSelectMessage: messagesHook.handleSelectMessage,
    handleBulkActionSubmit: messagesHook.handleBulkActionSubmit,
    // Temp Links
    tempLinks: tempLinksHook.tempLinks,
    copiedLinkId: tempLinksHook.copiedLinkId,
    creatingLink: tempLinksHook.creatingLink,
    handleCreateTempLink: tempLinksHook.handleCreateTempLink,
    handleRevokeTempLink: tempLinksHook.handleRevokeTempLink,
    handleCopyLink: tempLinksHook.handleCopyLink,
    // Security
    lockdownStatus: securityHook.lockdownStatus,
    auditLogs: securityHook.auditLogs,
    customLockdownMinutes: securityHook.customLockdownMinutes,
    setCustomLockdownMinutes: securityHook.setCustomLockdownMinutes,
    handleSetLockdown: securityHook.handleSetLockdown,
    handleRemoveLockdown: securityHook.handleRemoveLockdown,
    // Room Settings
    roomSettingsName: roomSettingsHook.roomSettingsName,
    setRoomSettingsName: roomSettingsHook.setRoomSettingsName,
    roomSettingsDesc: roomSettingsHook.roomSettingsDesc,
    setRoomSettingsDesc: roomSettingsHook.setRoomSettingsDesc,
    roomSettingsNewId: roomSettingsHook.roomSettingsNewId,
    setRoomSettingsNewId: roomSettingsHook.setRoomSettingsNewId,
    roomSettingsAlias: roomSettingsHook.roomSettingsAlias,
    roomSettingsLastIdChange: roomSettingsHook.roomSettingsLastIdChange,
    roomSettingsLoading: roomSettingsHook.roomSettingsLoading,
    roomSettingsSuccess: roomSettingsHook.roomSettingsSuccess,
    roomSettingsError: roomSettingsHook.roomSettingsError,
    roomIdSuccess: roomSettingsHook.roomIdSuccess,
    roomIdError: roomSettingsHook.roomIdError,
    roomSettingsCurrentPassword: roomSettingsHook.roomSettingsCurrentPassword,
    setRoomSettingsCurrentPassword: roomSettingsHook.setRoomSettingsCurrentPassword,
    roomSettingsNewPassword: roomSettingsHook.roomSettingsNewPassword,
    setRoomSettingsNewPassword: roomSettingsHook.setRoomSettingsNewPassword,
    roomSettingsConfirmPassword: roomSettingsHook.roomSettingsConfirmPassword,
    setRoomSettingsConfirmPassword: roomSettingsHook.setRoomSettingsConfirmPassword,
    roomSettingsHasJoinPassword: roomSettingsHook.roomSettingsHasJoinPassword,
    handleDeleteRoom: roomSettingsHook.handleDeleteRoom,
    handleSaveRoomDetails: roomSettingsHook.handleSaveRoomDetails,
    handleChangeJoinPassword: roomSettingsHook.handleChangeJoinPassword,
    handleRemoveJoinPassword: roomSettingsHook.handleRemoveJoinPassword,
    handleSaveRoomId: roomSettingsHook.handleSaveRoomId,
  };
}

export type AdminController = ReturnType<typeof useAdminController>;
