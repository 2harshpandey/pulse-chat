import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../../ThemeContext';
import { resolveApiBaseUrl, copyTextToClipboard } from '../../chat/utils';
import type {
  UserProfile,
  TempLinkData,
  BlockedUserData,
  LockdownData,
  AuditLogData,
  LoggedInUser,
  UserReportData,
  Tab,
} from '../types';
import { sanitizePathId } from '../utils';

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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteAction, setBulkDeleteAction] = useState<'hide' | 'delete'>('hide');
  const [bulkDeleteVanish, setBulkDeleteVanish] = useState(false);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [globalRooms, setGlobalRooms] = useState<any[]>([]);
  const [isRoomsLoading, setIsRoomsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isServerLogsLoading, setIsServerLogsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [activityLogs, setActivityLogs] = useState<string[]>(() => {
    const saved = sessionStorage.getItem('admin-activity-logs');
    return saved ? JSON.parse(saved) : [];
  });
  const ws = useRef<WebSocket | null>(null);
  const activityLogRef = useRef<HTMLDivElement>(null);
  const adminPasswordInputRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<string>('');
  const [showMessageFilters, setShowMessageFilters] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  );

  const [displayedLogsCount, setDisplayedLogsCount] = useState(50);

  const [pinTargetId, setPinTargetId] = useState<string | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDuration, setPinDuration] = useState<number | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);

  // Message Log filters
  const [filterMessageId, setFilterMessageId] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterEventType, setFilterEventType] = useState('All');
  const [filterContent, setFilterContent] = useState('');

  // Reset displayed logs when filters change
  useEffect(() => {
    setDisplayedLogsCount(50);
  }, [filterMessageId, filterUser, filterEventType, filterContent]);

  // Feature states
  const [tempLinks, setTempLinks] = useState<TempLinkData[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserData[]>([]);
  const [lockdownStatus, setLockdownStatus] = useState<LockdownData>({ isActive: false });
  const [auditLogs, setAuditLogs] = useState<AuditLogData[]>([]);
  const [loggedInUsersList, setLoggedInUsersList] = useState<LoggedInUser[]>([]);
  const [userReports, setUserReports] = useState<UserReportData[]>([]);
  const [onlineUsersList, setOnlineUsersList] = useState<UserProfile[]>([]);
  const [customLockdownMinutes, setCustomLockdownMinutes] = useState('');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [, setLinkTimerKey] = useState(0);

  // Room Settings
  const [roomSettingsName, setRoomSettingsName] = useState('');
  const [roomSettingsDesc, setRoomSettingsDesc] = useState('');
  const [roomSettingsNewId, setRoomSettingsNewId] = useState('');
  const [roomSettingsAlias, setRoomSettingsAlias] = useState('');
  const [roomSettingsLastIdChange, setRoomSettingsLastIdChange] = useState<string | null>(null);
  const [roomSettingsLoading, setRoomSettingsLoading] = useState(false);
  const [roomSettingsSuccess, setRoomSettingsSuccess] = useState('');
  const [roomSettingsError, setRoomSettingsError] = useState('');
  const [roomIdSuccess, setRoomIdSuccess] = useState('');
  const [roomIdError, setRoomIdError] = useState('');
  const [roomSettingsCurrentPassword, setRoomSettingsCurrentPassword] = useState('');
  const [roomSettingsNewPassword, setRoomSettingsNewPassword] = useState('');
  const [roomSettingsConfirmPassword, setRoomSettingsConfirmPassword] = useState('');
  const [roomSettingsHasJoinPassword, setRoomSettingsHasJoinPassword] = useState(false);

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

  // --- WebSocket ---
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  useEffect(() => {
    if (!isAuthenticated) return;
    const storedPassword = passwordRef.current;
    if (!storedPassword) return;

    const currentRoomId = roomIdRef.current;
    console.log('[Admin WS] Connecting admin WebSocket for room:', currentRoomId);

    const wsUrl = `${resolveApiBaseUrl().replace(/^http/, 'ws')}?admin=true`;
    ws.current = new WebSocket(wsUrl);
    ws.current.onopen = () => {
      console.log('[Admin WS] WebSocket open, sending admin_auth for room:', currentRoomId);
      ws.current?.send(JSON.stringify({ type: 'admin_auth', roomId: currentRoomId, password: storedPassword }));
    };
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'activity':
          setActivityLogs((prev) => {
            const newLogs = [`[${new Date().toLocaleTimeString()}] ${message.data}`, ...prev].slice(0, 50);
            sessionStorage.setItem('admin-activity-logs', JSON.stringify(newLogs));
            return newLogs;
          });
          break;
        case 'history':
          setHistoryLogs((prev) =>
            [message.data, ...prev].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          );
          break;
        case 'chat_cleared':
          setHistoryLogs([]);
          setActivityLogs((prev) => [`[${new Date().toLocaleTimeString()}] Chat history permanently cleared.`, ...prev]);
          break;
        case 'chat_hidden_for_everyone':
          setActivityLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] All existing chats were hidden from frontend for everyone.`,
            ...prev,
          ]);
          break;
        case 'bulk_history_update':
          setHistoryLogs((prev) => {
            const updated = [...prev];
            message.data.events.forEach((ev: any) => {
              const idx = updated.findIndex(
                (l) => l._id === ev._id || l.messageId === (ev.message?.id || ev.messageId)
              );
              if (idx !== -1) updated[idx] = ev;
            });
            return updated;
          });
          break;
        case 'bulk_history_delete':
          setHistoryLogs((prev) =>
            prev.filter((l) => {
              const id = l.messageId || l.message?.id || l.message?._id || l._id;
              return !message.data.messageIds.includes(id);
            })
          );
          break;
        case 'error':
        case 'pin_error':
          alert(`Error: ${message.message || 'Unknown error'}`);
          break;
        case 'pinned_messages_update':
          setPinnedMessages(message.data);
          break;
        case 'user_joined':
          setOnlineUsersList((prev) =>
            prev.some((u) => u.userId === message.data.userId) ? prev : [...prev, message.data]
          );
          break;
        case 'user_left':
          setOnlineUsersList((prev) => prev.filter((u) => u.userId !== message.data.userId));
          break;
        case 'users':
          setUsers(message.data);
          break;
        case 'online_users_admin':
          setOnlineUsersList(message.data);
          break;
        case 'logged_in_users':
          setLoggedInUsersList(message.data);
          break;
        case 'server_logs':
          setServerLogs(message.data.split('\n').reverse());
          break;
        case 'temp_link_created':
          setTempLinks((prev) => {
            if (prev.some((l) => l._id === message.data._id)) return prev;
            return [message.data, ...prev];
          });
          break;
        case 'temp_link_revoked':
          setTempLinks((prev) => prev.map((l) => (l._id === message.data._id ? message.data : l)));
          break;
        case 'user_blocked':
          setBlockedUsers((prev) => [message.data, ...prev.filter((u) => u.userId !== message.data.userId)]);
          setOnlineUsersList((prev) => prev.filter((u) => u.userId !== message.data.userId));
          setLoggedInUsersList((prev) => prev.filter((u) => u.userId !== message.data.userId));
          break;
        case 'user_unblocked':
          setBlockedUsers((prev) => prev.map((u) => (u.userId === message.data.userId ? message.data : u)));
          break;
        case 'user_force_logged_out':
          setOnlineUsersList((prev) => prev.filter((u) => u.userId !== message.data.userId));
          setLoggedInUsersList((prev) => prev.filter((u) => u.userId !== message.data.userId));
          break;
        case 'user_logged_out':
          setOnlineUsersList((prev) => prev.filter((u) => u.userId !== message.data.userId));
          setLoggedInUsersList((prev) => prev.filter((u) => u.userId !== message.data.userId));
          break;
        case 'lockdown_update':
          setLockdownStatus(message.data);
          break;
        case 'audit_log':
          setAuditLogs((prev) => [{ ...message.data, _id: Date.now().toString() }, ...prev].slice(0, 200));
          break;
        case 'user_reported':
          setUserReports((prev) => [message.data, ...prev].slice(0, 500));
          break;
        default:
          break;
      }
    };
    ws.current.onclose = () => console.log('Admin WebSocket disconnected');
    ws.current.onerror = (err) => console.error('Admin WebSocket error:', err);
    return () => {
      if (ws.current) ws.current.close();
    };
  }, [isAuthenticated, roomId]);

  const apiHeaders = useCallback(
    () => ({
      'x-admin-password': passwordRef.current,
      'x-room-id': roomId,
      'Content-Type': 'application/json',
    }),
    [roomId]
  );
  const apiUrl = resolveApiBaseUrl();

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
      setUsers(usersData);
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
      fetch(`${apiUrl}/api/admin/history`, { headers })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setHistoryLogs(data.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
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
            if (text) setServerLogs(text.split('\n').reverse());
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
        setTempLinks(await tempLinksRes.value.json());
      }
      if (blockedRes.status === 'fulfilled' && blockedRes.value.ok) {
        setBlockedUsers(await blockedRes.value.json());
      }
      if (lockdownRes.status === 'fulfilled' && lockdownRes.value.ok) {
        setLockdownStatus(await lockdownRes.value.json());
      }
      if (auditRes.status === 'fulfilled' && auditRes.value.ok) {
        setAuditLogs(await auditRes.value.json());
      }
      if (reportsRes.status === 'fulfilled' && reportsRes.value.ok) {
        setUserReports(await reportsRes.value.json());
      }
      if (loggedInRes.status === 'fulfilled' && loggedInRes.value.ok) {
        setLoggedInUsersList(await loggedInRes.value.json());
      }
      if (detailsRes.status === 'fulfilled' && detailsRes.value.ok) {
        const d = await detailsRes.value.json();
        setRoomSettingsName(d.name || '');
        setRoomSettingsDesc(d.description || '');
        setRoomSettingsAlias(d.alias || '');
        setRoomSettingsNewId(d.alias || roomId || '');
        setRoomSettingsLastIdChange(d.lastIdChangeAt || null);
        setRoomSettingsHasJoinPassword(d.hasJoinPassword || false);
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
    sessionStorage.removeItem('admin-activity-logs');
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

  // --- Pin Actions ---
  const submitPin = (replaceOldest = false) => {
    if (!pinTargetId) {
      alert('Error: Message ID could not be identified for pinning.');
      return;
    }
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: 'pin_message',
          messageId: pinTargetId,
          durationMs: pinDuration,
          replaceOldest,
        })
      );
    }
    setShowPinModal(false);
    setShowReplaceModal(false);
    setPinTargetId(null);
  };

  const handleConfirmDuration = () => {
    if (pinnedMessages.length >= 4) {
      setShowPinModal(false);
      setShowReplaceModal(true);
    } else {
      submitPin(false);
    }
  };

  const handleInitiatePin = (messageId: string) => {
    setPinTargetId(messageId);
    setPinDuration(24 * 60 * 60 * 1000);
    setShowPinModal(true);
  };

  const handleUnpin = (messageId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'unpin_message', messageId }));
    }
  };

  // --- Selection & Bulk Actions ---
  const extractMessageId = (log: any) => log.messageId || log.message?.id || log.message?._id || log._id;

  const enrichedHistoryLogs = useMemo(() => {
    const userMap = new Map(users.map((u) => [u.userId, u.username]));
    return historyLogs.map((log) => {
      let resolvedUsername = log.username;
      if (!resolvedUsername || resolvedUsername === 'Unknown') {
        resolvedUsername = userMap.get(log.userId) || 'Unknown';
      }
      return { ...log, username: resolvedUsername };
    });
  }, [historyLogs, users]);

  const filteredHistoryLogs = useMemo(() => {
    return enrichedHistoryLogs.filter((log) => {
      const messageIdMatch = filterMessageId
        ? (log.messageId || log.message?.id)?.toLowerCase().includes(filterMessageId.toLowerCase())
        : true;
      const userMatch = filterUser ? (log.username || '').toLowerCase().includes(filterUser.toLowerCase()) : true;
      const eventTypeMatch =
        filterEventType === 'All'
          ? true
          : filterEventType === 'Deleted by admin'
          ? log.message?.deletedBy === 'admin' || log.message?.vanished === true
          : log.type === filterEventType.toLowerCase().replace(' (everyone)', '_everyone');
      const contentMatch = !filterContent
        ? true
        : (() => {
            const lc = filterContent.toLowerCase();
            if (log.type === 'create' && log.message?.text) return log.message.text.toLowerCase().includes(lc);
            if (log.type === 'edit')
              return log.oldText?.toLowerCase().includes(lc) || log.newText?.toLowerCase().includes(lc);
            if (log.type === 'delete_everyone' && log.deletedContent?.text)
              return log.deletedContent.text.toLowerCase().includes(lc);
            if (log.type === 'upload' && log.file?.originalname)
              return log.file.originalname.toLowerCase().includes(lc);
            return false;
          })();
      return messageIdMatch && userMatch && eventTypeMatch && contentMatch;
    });
  }, [enrichedHistoryLogs, filterMessageId, filterUser, filterEventType, filterContent]);

  const laterDeletedByUserIds = useMemo(() => {
    const ids = new Set<string>();
    enrichedHistoryLogs.forEach((log) => {
      if (log.type === 'delete_everyone') {
        const id = extractMessageId(log);
        if (id) ids.add(id);
      }
    });
    return ids;
  }, [enrichedHistoryLogs]);

  const validSelectionLogs = useMemo(() => {
    return filteredHistoryLogs.filter((log) => !!extractMessageId(log));
  }, [filteredHistoryLogs]);

  const uniqueValidMessageIds = useMemo(() => {
    const ids = new Set<string>();
    validSelectionLogs.forEach((log) => {
      const id = extractMessageId(log);
      if (id) ids.add(id);
    });
    return ids;
  }, [validSelectionLogs]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedMessages(new Set(uniqueValidMessageIds));
    } else {
      setSelectedMessages(new Set());
    }
  };

  const handleSelectMessage = (id: string, checked: boolean) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkActionSubmit = async () => {
    if (selectedMessages.size === 0) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/messages/bulk-action`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          messageIds: Array.from(selectedMessages),
          action: bulkDeleteAction,
          vanish: bulkDeleteVanish,
        }),
      });
      if (res.ok) {
        setSelectedMessages(new Set());
        setShowBulkDeleteModal(false);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to perform bulk action.');
      }
    } catch (err) {
      console.error('Bulk action error:', err);
      alert('An error occurred while performing the bulk action.');
    }
  };

  // --- Temp Link Actions ---
  const handleCreateTempLink = async () => {
    setCreatingLink(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/temp-links`, { method: 'POST', headers: apiHeaders() });
      if (res.ok) {
        const newLink = await res.json();
        setTempLinks((prev) => {
          if (prev.some((l) => l._id === newLink._id)) return prev;
          return [newLink, ...prev];
        });
      } else {
        console.error('Failed to create temp link:', await res.text());
      }
    } catch (err) {
      console.error('Failed to create temp link', err);
    }
    setCreatingLink(false);
  };

  const handleRevokeTempLink = async (id: string) => {
    try {
      const safeId = sanitizePathId(id);
      const res = await fetch(`${apiUrl}/api/admin/temp-links/${safeId}/revoke`, { method: 'POST', headers: apiHeaders() });
      if (res.ok) {
        const revokedLink = await res.json();
        setTempLinks((prev) => prev.map((l) => (l._id === id ? revokedLink : l)));
      } else {
        const errText = await res.text();
        console.error('Failed to revoke temp link:', errText);
        alert('Failed to revoke link: ' + errText);
      }
    } catch (err: any) {
      console.error('Failed to revoke temp link', err);
      alert('Failed to revoke link: ' + err.message);
    }
  };

  const handleCopyLink = async (token: string, id: string) => {
    const link = `${window.location.origin}/join/${token}`;
    const ok = await copyTextToClipboard(link);
    if (ok) {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    }
  };

  // --- User Actions ---
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [users]);

  const handleForceLogout = async (userId: string) => {
    if (!window.confirm('Force logout this user?')) return;
    try {
      const safeId = sanitizePathId(userId);
      await fetch(`${apiUrl}/api/admin/force-logout/${safeId}`, { method: 'POST', headers: apiHeaders() });
      setOnlineUsersList((prev) => prev.filter((u) => u.userId !== userId));
      setLoggedInUsersList((prev) => prev.filter((u) => u.userId !== userId));
    } catch (err) {
      console.error('Failed to force logout', err);
    }
  };

  const handleForceLogoutAll = async () => {
    if (!window.confirm(`Force logout ALL ${onlineUsersList.length} online user(s)? This cannot be undone.`)) return;
    try {
      await fetch(`${apiUrl}/api/admin/force-logout-all`, { method: 'POST', headers: apiHeaders() });
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
      const res = await fetch(`${apiUrl}/api/admin/unblock-user/${safeId}`, { method: 'POST', headers: apiHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers((prev) => prev.map((u) => (u.userId === userId ? data.blockedUser : u)));
      }
    } catch (err) {
      console.error('Failed to unblock user', err);
    }
  };

  // --- Lockdown Actions ---
  const handleSetLockdown = async (type: string) => {
    try {
      const body: any = { type };
      if (type === 'custom') {
        const mins = parseInt(customLockdownMinutes);
        if (!mins || mins <= 0) {
          alert('Enter a valid number of minutes.');
          return;
        }
        body.customMinutes = mins;
      }
      const res = await fetch(`${apiUrl}/api/admin/login-lockdown`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(body),
      });
      if (res.ok) setLockdownStatus(await res.json());
    } catch (err) {
      console.error('Failed to set lockdown', err);
    }
  };

  const handleRemoveLockdown = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/login-lockdown`, { method: 'DELETE', headers: apiHeaders() });
      if (res.ok) setLockdownStatus({ isActive: false });
    } catch (err) {
      console.error('Failed to remove lockdown', err);
    }
  };

  // --- Reports Sorting ---
  const sortedReports = useMemo(() => {
    return [...userReports].sort((a, b) => {
      const aTime = new Date(a.reportedAt).getTime();
      const bTime = new Date(b.reportedAt).getTime();
      return bTime - aTime;
    });
  }, [userReports]);

  // --- Server Logs Actions ---
  const handleRefreshServerLogs = async () => {
    if (!passwordRef.current) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/server-logs`, {
        headers: { 'x-admin-password': passwordRef.current, 'x-room-id': roomId },
      });
      if (res.ok) setServerLogs((await res.text()).split('\n').reverse());
    } catch (err) {
      console.error('Failed to fetch server logs', err);
    }
  };

  // --- Room Actions ---
  const handleDeleteRoom = async () => {
    const enteredPassword = prompt('Re-enter admin password to confirm:');
    if (enteredPassword !== passwordRef.current) {
      alert('Incorrect password.');
      return;
    }
    if (
      window.confirm(
        'ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete this chat room, all its messages, and disconnect all users. THIS ACTION CANNOT BE UNDONE.'
      )
    ) {
      try {
        const res = await fetch(`${apiUrl}/api/admin/room`, { method: 'DELETE', headers: apiHeaders() });
        if (res.ok) {
          alert('Room successfully deleted.');
          navigate('/room', { replace: true });
        } else {
          const data = await res.json();
          alert(`Failed to delete room: ${data.error || 'Unknown error'}`);
        }
      } catch (err) {
        console.error('Failed to delete room', err);
      }
    }
  };

  const handleSaveRoomDetails = async () => {
    setRoomSettingsLoading(true);
    setRoomSettingsError('');
    setRoomSettingsSuccess('');
    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/details`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ name: roomSettingsName, description: roomSettingsDesc }),
      });
      const data = await res.json();
      if (res.ok) {
        setRoomSettingsSuccess('Room details updated successfully.');
      } else {
        setRoomSettingsError(data.error || 'Failed to update details.');
      }
    } catch {
      setRoomSettingsError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
  };

  const handleChangeJoinPassword = async () => {
    setRoomSettingsLoading(true);
    setRoomSettingsError('');
    setRoomSettingsSuccess('');

    if (roomSettingsNewPassword.length < 6) {
      setRoomSettingsError('New password must be at least 6 characters.');
      setRoomSettingsLoading(false);
      return;
    }

    if (roomSettingsCurrentPassword && roomSettingsNewPassword === roomSettingsCurrentPassword) {
      setRoomSettingsError('New password cannot be the same as the current password.');
      setRoomSettingsLoading(false);
      return;
    }

    if (roomSettingsNewPassword !== roomSettingsConfirmPassword) {
      setRoomSettingsError('New passwords do not match.');
      setRoomSettingsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/joinPassword`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          currentPassword: roomSettingsCurrentPassword,
          newPassword: roomSettingsNewPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRoomSettingsSuccess('Join password updated successfully.');
        setRoomSettingsCurrentPassword('');
        setRoomSettingsNewPassword('');
        setRoomSettingsConfirmPassword('');
        setRoomSettingsHasJoinPassword(true);
      } else {
        setRoomSettingsError(data.error || 'Failed to update join password.');
      }
    } catch {
      setRoomSettingsError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
  };

  const handleRemoveJoinPassword = async () => {
    if (!window.confirm('Are you sure you want to remove the join password? The room will become public again.')) {
      return;
    }

    setRoomSettingsLoading(true);
    setRoomSettingsError('');
    setRoomSettingsSuccess('');

    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/joinPassword`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setRoomSettingsSuccess('Join password removed successfully. The room is now public.');
        setRoomSettingsCurrentPassword('');
        setRoomSettingsNewPassword('');
        setRoomSettingsConfirmPassword('');
        setRoomSettingsHasJoinPassword(false);
      } else {
        setRoomSettingsError(data.error || 'Failed to remove join password.');
      }
    } catch {
      setRoomSettingsError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
  };

  const handleSaveRoomId = async () => {
    setRoomSettingsLoading(true);
    setRoomIdError('');
    setRoomIdSuccess('');
    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/roomId`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ newRoomId: roomSettingsNewId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRoomIdSuccess('Room ID updated successfully. You will be redirected...');
        setRoomSettingsAlias(data.newAlias);
        setRoomSettingsLastIdChange(data.lastIdChangeAt);
        setTimeout(() => {
          navigate(`/admin/${data.newAlias}`, { replace: true });
        }, 3000);
      } else {
        setRoomIdError(data.error || 'Failed to update Room ID.');
      }
    } catch {
      setRoomIdError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
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
    users,
    sortedUsers,
    historyLogs,
    enrichedHistoryLogs,
    filteredHistoryLogs,
    laterDeletedByUserIds,
    uniqueValidMessageIds,
    pinnedMessages,
    selectedMessages,
    showBulkDeleteModal,
    setShowBulkDeleteModal,
    bulkDeleteAction,
    setBulkDeleteAction,
    bulkDeleteVanish,
    setBulkDeleteVanish,
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
    displayedLogsCount,
    setDisplayedLogsCount,
    pinTargetId,
    showPinModal,
    setShowPinModal,
    pinDuration,
    setPinDuration,
    showReplaceModal,
    setShowReplaceModal,
    filterMessageId,
    setFilterMessageId,
    filterUser,
    setFilterUser,
    filterEventType,
    setFilterEventType,
    filterContent,
    setFilterContent,
    tempLinks,
    blockedUsers,
    lockdownStatus,
    auditLogs,
    loggedInUsersList,
    userReports,
    sortedReports,
    onlineUsersList,
    customLockdownMinutes,
    setCustomLockdownMinutes,
    copiedLinkId,
    creatingLink,
    roomSettingsName,
    setRoomSettingsName,
    roomSettingsDesc,
    setRoomSettingsDesc,
    roomSettingsNewId,
    setRoomSettingsNewId,
    roomSettingsAlias,
    roomSettingsLastIdChange,
    roomSettingsLoading,
    roomSettingsSuccess,
    roomSettingsError,
    roomIdSuccess,
    roomIdError,
    roomSettingsCurrentPassword,
    setRoomSettingsCurrentPassword,
    roomSettingsNewPassword,
    setRoomSettingsNewPassword,
    roomSettingsConfirmPassword,
    setRoomSettingsConfirmPassword,
    roomSettingsHasJoinPassword,
    focusAdminPasswordInput,
    handleLogin,
    handleLogout,
    handleKeyDown,
    submitPin,
    handleConfirmDuration,
    handleInitiatePin,
    handleUnpin,
    handleSelectAll,
    handleSelectMessage,
    handleBulkActionSubmit,
    handleCreateTempLink,
    handleRevokeTempLink,
    handleCopyLink,
    handleForceLogout,
    handleForceLogoutAll,
    handleBlockUser,
    handleUnblockUser,
    handleSetLockdown,
    handleRemoveLockdown,
    handleRefreshServerLogs,
    handleDeleteRoom,
    handleSaveRoomDetails,
    handleChangeJoinPassword,
    handleRemoveJoinPassword,
    handleSaveRoomId,
    apiHeaders,
    apiUrl,
    extractMessageId,
  };
}

export type AdminController = ReturnType<typeof useAdminController>;
