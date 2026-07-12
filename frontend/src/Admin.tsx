import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from './ThemeContext';
import {
  AdminContainer, Title, LoginFormContainer, LoginBox, AdminOrb,
  AdminLoginBrand, AdminBrandLogo, AdminBrandWordmark, AdminHeartbeatSvg,
  AdminBrandSubtitle, AdminInputGroup, AdminInputIcon, AdminStyledInput,
  AdminEyeBtn, AdminSubmitBtn, AdminThemeToggle, AdminFormHomeButton, AdminSecuredLine,
  PanelThemeToggle, HeaderRow, Input, SelectWrapper, Select,
  FilterContainer, FilterToggleButton, MessageFilterCollapse,
  Button, ErrorMessage, TabContainer, TabButton, TabContent,
  Table, Th, StickyTh, Td, TableWrapper, MessageLogScrollContainer,
  MessageLogTableWrapper, NoWrapTd, ExpandTd, WideTable, MessageLogTable,
  LogoutButton, DangerButton, SuccessButton, SmallButton,
  SmallDangerButton, SmallSuccessButton, SmallWarningButton,
  PremiumExportButton,
  ActivityLogContainer, LogViewerContainer, ActivityLogItem,
  SectionTitle, Card, LinkCard, Badge, StatusDot,
  LinkUrlBox, CopyButton, UsedByList, LockdownPanel, LockdownOption,
  AuditLogEntry, AdminLogLink, ScrollContainer, EmptyState,
  CustomTimeInput, ClearHistoryButton, HideFrontendButton,
  ResponsiveTableWrapper, MobileCardList, UserCard, UserCardHeader,
  UserCardMeta, UserCardMetaRow, UserCardMetaLabel, UserCardMetaValue,
  UserCardActions, TextArea,
  float1, float2, float3,
  ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, RadioGroup, RadioLabel
} from './admin/AdminStyledComponents';
import { PasswordStrengthIndicator } from './components/PasswordStrengthIndicator';
import type {
  UserProfile, TempLinkData, BlockedUserData, LockdownData,
  AuditLogData, LoggedInUser, UserReportData, Tab,
} from './admin/types';
import {
  sanitizeUrl, isTenorUrl, sanitizePathId,
  formatDate, formatTime, formatDateTime, formatDuration,
  formatServerLogLine, getTimeRemaining, getLinkStatus, auditTypeLabel,
} from './admin/utils';

// ===================== ADMIN COMPONENT =====================
const Admin = () => {
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

  const submitPin = (replaceOldest = false) => {
    if (!pinTargetId) {
      alert('Error: Message ID could not be identified for pinning.');
      return;
    }
    console.log('[Admin] submitPin called for:', pinTargetId, 'duration:', pinDuration, 'replace:', replaceOldest);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'pin_message',
        messageId: pinTargetId,
        durationMs: pinDuration,
        replaceOldest
      }));
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
    setPinDuration(24 * 60 * 60 * 1000); // Default to 24 hours
    setShowPinModal(true);
  };

  const handleUnpin = (messageId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'unpin_message',
        messageId
      }));
    }
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Pulse - Admin Panel';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      document.body.classList.add('hide-global-home-btn');
    } else {
      document.body.classList.remove('hide-global-home-btn');
    }
    return () => document.body.classList.remove('hide-global-home-btn');
  }, [isAuthenticated]);

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

  // Message Log filters
  const [filterMessageId, setFilterMessageId] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterEventType, setFilterEventType] = useState('All');
  const [filterContent, setFilterContent] = useState('');

  // Reset displayed logs when filters change
  useEffect(() => {
    setDisplayedLogsCount(50);
  }, [filterMessageId, filterUser, filterEventType, filterContent]);

  // New feature states
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
    const interval = setInterval(() => setLinkTimerKey(k => k + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activityLogRef.current) activityLogRef.current.scrollTop = 0;
  }, [activityLogs]);

  // --- WebSocket ---
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  useEffect(() => {
    if (!isAuthenticated) return;
    const storedPassword = passwordRef.current;
    if (!storedPassword) return;

    const currentRoomId = roomIdRef.current;
    console.log('[Admin WS] Connecting admin WebSocket for room:', currentRoomId);

    const wsUrl = `${import.meta.env.REACT_APP_API_URL?.replace('http', 'ws') || 'ws://localhost:8080'}?admin=true`;
    ws.current = new WebSocket(wsUrl);
    ws.current.onopen = () => {
      console.log('[Admin WS] WebSocket open, sending admin_auth for room:', currentRoomId);
      ws.current?.send(JSON.stringify({ type: 'admin_auth', roomId: currentRoomId, password: storedPassword }));
    };
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'activity':
          setActivityLogs(prev => {
            const newLogs = [`[${new Date().toLocaleTimeString()}] ${message.data}`, ...prev].slice(0, 50);
            sessionStorage.setItem('admin-activity-logs', JSON.stringify(newLogs));
            return newLogs;
          });
          break;
        case 'history':
          setHistoryLogs(prev => [message.data, ...prev].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          break;
        case 'chat_cleared':
          setHistoryLogs([]);
          setActivityLogs(prev => [`[${new Date().toLocaleTimeString()}] Chat history permanently cleared.`, ...prev]);
          break;
        case 'chat_hidden_for_everyone':
          setActivityLogs(prev => [`[${new Date().toLocaleTimeString()}] All existing chats were hidden from frontend for everyone.`, ...prev]);
          break;
        case 'bulk_history_update':
          setHistoryLogs(prev => {
            const updated = [...prev];
            message.data.events.forEach((ev: any) => {
              const idx = updated.findIndex(l => (l._id === ev._id || l.messageId === (ev.message?.id || ev.messageId)));
              if (idx !== -1) updated[idx] = ev;
            });
            return updated;
          });
          break;
        case 'bulk_history_delete':
          setHistoryLogs(prev => prev.filter(l => {
            const id = l.messageId || l.message?.id || l.message?._id || l._id;
            return !message.data.messageIds.includes(id);
          }));
          break;
        case 'error':
        case 'pin_error':
          alert(`Error: ${message.message || 'Unknown error'}`);
          break;
        case 'pinned_messages_update':
          setPinnedMessages(message.data);
          break;
        case 'user_joined':
          setOnlineUsersList(prev => prev.some(u => u.userId === message.data.userId) ? prev : [...prev, message.data]);
          break;
        case 'user_left':
          setOnlineUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
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
          setTempLinks(prev => {
            if (prev.some(l => l._id === message.data._id)) return prev;
            return [message.data, ...prev];
          });
          break;
        case 'temp_link_revoked':
          setTempLinks(prev => prev.map(l => l._id === message.data._id ? message.data : l));
          break;
        case 'user_blocked':
          setBlockedUsers(prev => [message.data, ...prev.filter(u => u.userId !== message.data.userId)]);
          setOnlineUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          setLoggedInUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          break;
        case 'user_unblocked':
          setBlockedUsers(prev => prev.map(u => u.userId === message.data.userId ? message.data : u));
          break;
        case 'user_force_logged_out':
          setOnlineUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          setLoggedInUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          break;
        case 'user_logged_out':
          setOnlineUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          setLoggedInUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          break;
        case 'lockdown_update':
          setLockdownStatus(message.data);
          break;
        case 'audit_log':
          setAuditLogs(prev => [{ ...message.data, _id: Date.now().toString() }, ...prev].slice(0, 200));
          break;
        case 'user_reported':
          setUserReports(prev => [message.data, ...prev].slice(0, 500));
          break;
        default: break;
      }
    };
    ws.current.onclose = () => console.log('Admin WebSocket disconnected');
    ws.current.onerror = (error) => console.error('Admin WebSocket error:', error);
    return () => { if (ws.current) ws.current.close(); };
  }, [isAuthenticated, roomId]);

  const apiHeaders = useCallback(() => ({
    'x-admin-password': passwordRef.current,
    'x-room-id': roomId,
    'Content-Type': 'application/json',
  }), [roomId]);
  const apiUrl = import.meta.env.REACT_APP_API_URL || '';

  // --- Auth ---
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

      const passwordAttempts = (trimmedPassword && trimmedPassword !== enteredPassword)
        ? [enteredPassword, trimmedPassword]
        : [enteredPassword];

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

      // Fetch rooms independently for blazing fast tab load
      if (roomId === 'me' || roomId === 'global') {
        setIsRoomsLoading(true);
        fetch(`${apiUrl}/api/admin/rooms`, { headers })
          .then(res => res.ok ? res.json() : [])
          .then(data => {
            if (Array.isArray(data)) setGlobalRooms(data);
          })
          .catch(() => { })
          .finally(() => setIsRoomsLoading(false));
      }

      // Fetch history independently for instant message log load
      setIsHistoryLoading(true);
      fetch(`${apiUrl}/api/admin/history`, { headers })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (Array.isArray(data)) {
            setHistoryLogs(data.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          }
        })
        .catch(() => { })
        .finally(() => setIsHistoryLoading(false));

      // Fetch massive server logs independently so it doesn't block other tabs
      if (roomId === 'me' || roomId === 'global') {
        setIsServerLogsLoading(true);
        fetch(`${apiUrl}/api/admin/server-logs`, { headers })
          .then(res => res.ok ? res.text() : '')
          .then(text => {
            if (text) setServerLogs(text.split('\n').reverse());
          })
          .catch(() => { })
          .finally(() => setIsServerLogsLoading(false));
      }

      const [tempLinksRes, blockedRes, lockdownRes, auditRes, reportsRes, loggedInRes, detailsRes] = await Promise.allSettled([
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
        // Clear the state so it doesn't re-trigger
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

  const handlePermanentClear = async () => {
    const enteredPassword = prompt("Re-enter admin password to confirm:");
    if (enteredPassword !== passwordRef.current) { alert("Incorrect password."); return; }
    if (window.confirm("ARE YOU SURE?\n\nThis will permanently delete all messages and events.")) {
      try {
        const res = await fetch(`${apiUrl}/api/admin/history`, { method: 'DELETE', headers: apiHeaders() });
        if (res.ok) { setHistoryLogs([]); setActivityLogs([]); alert("Logs cleared."); }
      } catch (err) { console.error('Failed to clear logs', err); }
    }
  };

  const handleDeleteRoom = async () => {
    const enteredPassword = prompt("Re-enter admin password to confirm:");
    if (enteredPassword !== passwordRef.current) { alert("Incorrect password."); return; }
    if (window.confirm("ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete this chat room, all its messages, and disconnect all users. THIS ACTION CANNOT BE UNDONE.")) {
      try {
        const res = await fetch(`${apiUrl}/api/admin/room`, { method: 'DELETE', headers: apiHeaders() });
        if (res.ok) {
          alert("Room successfully deleted.");
          navigate('/room', { replace: true });
        } else {
          const data = await res.json();
          alert(`Failed to delete room: ${data.error || 'Unknown error'}`);
        }
      } catch (err) { console.error('Failed to delete room', err); }
    }
  };

  const handleHideAllFromFrontend = async () => {
    const enteredPassword = prompt("Re-enter admin password to confirm:");
    if (enteredPassword !== passwordRef.current) { alert("Incorrect password."); return; }
    if (window.confirm("ARE YOU SURE?\n\nThis will hide all existing chats from the frontend for everyone without deleting them from the database.")) {
      try {
        const res = await fetch(`${apiUrl}/api/messages/hide-all-frontend`, {
          method: 'POST',
          headers: { 'x-admin-secret': import.meta.env.REACT_APP_ADMIN_SECRET || '', 'x-room-id': roomId },
        });
        if (res.ok) {
          alert("All existing chats are now hidden from frontend for everyone.");
        } else {
          const d = await res.json();
          alert(`Error: ${d.error || 'Failed.'}`);
        }
      } catch {
        alert("A network error occurred.");
      }
    }
  };

  const handleRefreshServerLogs = async () => {
    if (!passwordRef.current) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/server-logs`, { headers: { 'x-admin-password': passwordRef.current, 'x-room-id': roomId } });
      if (res.ok) setServerLogs((await res.text()).split('\n').reverse());
    } catch (err) { console.error("Failed to fetch server logs", err); }
  };

  // --- Temp Link Actions ---
  const handleCreateTempLink = async () => {
    setCreatingLink(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/temp-links`, { method: 'POST', headers: apiHeaders() });
      if (res.ok) {
        const newLink = await res.json();
        setTempLinks(prev => {
          if (prev.some(l => l._id === newLink._id)) return prev;
          return [newLink, ...prev];
        });
      } else {
        console.error('Failed to create temp link:', await res.text());
      }
    } catch (err) { console.error('Failed to create temp link', err); }
    setCreatingLink(false);
  };

  const handleRevokeTempLink = async (id: string) => {
    try {
      const safeId = sanitizePathId(id);
      const res = await fetch(`${apiUrl}/api/admin/temp-links/${safeId}/revoke`, { method: 'POST', headers: apiHeaders() });
      if (res.ok) {
        const revokedLink = await res.json();
        setTempLinks(prev => prev.map(l => l._id === id ? revokedLink : l));
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

  const handleCopyLink = (token: string, id: string) => {
    const link = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    });
  };

  // --- User Actions ---
  const handleForceLogout = async (userId: string) => {
    if (!window.confirm('Force logout this user?')) return;
    try {
      const safeId = sanitizePathId(userId);
      await fetch(`${apiUrl}/api/admin/force-logout/${safeId}`, { method: 'POST', headers: apiHeaders() });
      setOnlineUsersList(prev => prev.filter(u => u.userId !== userId));
      setLoggedInUsersList(prev => prev.filter(u => u.userId !== userId));
    } catch (err) { console.error('Failed to force logout', err); }
  };

  const handleForceLogoutAll = async () => {
    if (!window.confirm(`Force logout ALL ${onlineUsersList.length} online user(s)? This cannot be undone.`)) return;
    try {
      await fetch(`${apiUrl}/api/admin/force-logout-all`, { method: 'POST', headers: apiHeaders() });
      setOnlineUsersList([]);
      setLoggedInUsersList([]);
    } catch (err) { console.error('Failed to force logout all', err); }
  };

  const handleBlockUser = async (userId: string, username: string) => {
    const reason = prompt(`Block user "${username}"? Enter a reason (optional):`);
    if (reason === null) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/block-user`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ userId, username, reason }),
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(prev => [data.blockedUser, ...prev.filter(u => u.userId !== userId)]);
        setOnlineUsersList(prev => prev.filter(u => u.userId !== userId));
        setLoggedInUsersList(prev => prev.filter(u => u.userId !== userId));
      }
    } catch (err) { console.error('Failed to block user', err); }
  };

  const handleUnblockUser = async (userId: string) => {
    if (!window.confirm('Unblock this user?')) return;
    try {
      const safeId = sanitizePathId(userId);
      const res = await fetch(`${apiUrl}/api/admin/unblock-user/${safeId}`, { method: 'POST', headers: apiHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(prev => prev.map(u => u.userId === userId ? data.blockedUser : u));
      }
    } catch (err) { console.error('Failed to unblock user', err); }
  };

  // --- Lockdown Actions ---
  const handleSetLockdown = async (type: string) => {
    try {
      const body: any = { type };
      if (type === 'custom') {
        const mins = parseInt(customLockdownMinutes);
        if (!mins || mins <= 0) { alert('Enter a valid number of minutes.'); return; }
        body.customMinutes = mins;
      }
      const res = await fetch(`${apiUrl}/api/admin/login-lockdown`, {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify(body),
      });
      if (res.ok) setLockdownStatus(await res.json());
    } catch (err) { console.error('Failed to set lockdown', err); }
  };

  const handleRemoveLockdown = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/login-lockdown`, { method: 'DELETE', headers: apiHeaders() });
      if (res.ok) setLockdownStatus({ isActive: false });
    } catch (err) { console.error('Failed to remove lockdown', err); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin();
  };

  // --- Room Settings Actions ---
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
    } catch (err) {
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
          newPassword: roomSettingsNewPassword
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
    } catch (err) {
      setRoomSettingsError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
  };

  const handleRemoveJoinPassword = async () => {
    if (!window.confirm("Are you sure you want to remove the join password? The room will become public again.")) {
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
    } catch (err) {
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
    } catch (err) {
      setRoomIdError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
  };

  // --- Render Helpers ---
  const renderEventType = (logType: string) => {
    switch (logType) {
      case 'create': return 'Create';
      case 'edit': return 'Edit';
      case 'upload': return 'Upload';
      case 'delete_everyone': return 'Delete (Everyone)';
      default: return logType;
    }
  };

  const renderMessageDetails = (log: any) => {
    const formatMedia = (content: any) => {
      if (!content) return '"[Empty]"';
      const text = content.text || '';
      if (content.url) {
        const isGif = isTenorUrl(content.url);
        const fileName = content.originalName || (isGif ? 'GIF' : 'Uploaded File');
        const safeHref = sanitizeUrl(content.url);
        return <>{text && `"${text}" `}{safeHref ? <AdminLogLink href={safeHref} target="_blank" rel="noopener noreferrer">[{fileName}]</AdminLogLink> : <span>[{fileName}]</span>}</>;
      }
      return `"${text}"`;
    };
    switch (log.type) {
      case 'create': return <>Content: {formatMedia(log.message)}</>;
      case 'edit': return <>Old: "{log.oldText}" → New: "{log.newText}"</>;
      case 'delete_everyone': return <>Deleted: {formatMedia(log.deletedContent)}</>;
      case 'upload': return `File: '${log.file.originalname}' (${(log.file.size / 1024).toFixed(2)} KB)`;
      default: return JSON.stringify(log);
    }
  };

  const enrichedHistoryLogs = useMemo(() => {
    const userMap = new Map(users.map(u => [u.userId, u.username]));
    return historyLogs.map(log => {
      let resolvedUsername = log.username;
      if (!resolvedUsername || resolvedUsername === 'Unknown') {
        resolvedUsername = userMap.get(log.userId) || 'Unknown';
      }
      return { ...log, username: resolvedUsername };
    });
  }, [historyLogs, users]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [users]);

  const filteredHistoryLogs = useMemo(() => {
    return enrichedHistoryLogs.filter(log => {
      const messageIdMatch = filterMessageId ? (log.messageId || log.message?.id)?.toLowerCase().includes(filterMessageId.toLowerCase()) : true;
      const userMatch = filterUser ? (log.username || '').toLowerCase().includes(filterUser.toLowerCase()) : true;
      const eventTypeMatch = filterEventType === 'All' ? true 
        : filterEventType === 'Deleted by admin' ? (log.message?.deletedBy === 'admin' || log.message?.vanished === true)
        : log.type === filterEventType.toLowerCase().replace(' (everyone)', '_everyone');
      const contentMatch = !filterContent ? true : (() => {
        const lc = filterContent.toLowerCase();
        if (log.type === 'create' && log.message?.text) return log.message.text.toLowerCase().includes(lc);
        if (log.type === 'edit') return (log.oldText?.toLowerCase().includes(lc)) || (log.newText?.toLowerCase().includes(lc));
        if (log.type === 'delete_everyone' && log.deletedContent?.text) return log.deletedContent.text.toLowerCase().includes(lc);
        if (log.type === 'upload' && log.file?.originalname) return log.file.originalname.toLowerCase().includes(lc);
        return false;
      })();
      return messageIdMatch && userMatch && eventTypeMatch && contentMatch;
    });
  }, [enrichedHistoryLogs, filterMessageId, filterUser, filterEventType, filterContent]);

  const extractMessageId = (log: any) => log.messageId || log.message?.id || log.message?._id || log._id;

  // Build a set of message IDs that were later deleted by their user.
  // This lets Create event rows show "Sent · Later deleted" instead of the
  // misleading "Active" badge when the message no longer exists.
  const laterDeletedByUserIds = useMemo(() => {
    const ids = new Set<string>();
    enrichedHistoryLogs.forEach(log => {
      if (log.type === 'delete_everyone') {
        const id = extractMessageId(log);
        if (id) ids.add(id);
      }
    });
    return ids;
  }, [enrichedHistoryLogs]);

  const validSelectionLogs = useMemo(() => {
    return filteredHistoryLogs.filter(log => !!extractMessageId(log));
  }, [filteredHistoryLogs]);

  const uniqueValidMessageIds = useMemo(() => {
    const ids = new Set<string>();
    validSelectionLogs.forEach(log => {
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
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkActionSubmit = async () => {
    if (selectedMessages.size === 0) return;
    try {
      const res = await fetch(`${import.meta.env.REACT_APP_API_URL || 'http://localhost:8080'}/api/admin/messages/bulk-action`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          messageIds: Array.from(selectedMessages),
          action: bulkDeleteAction,
          vanish: bulkDeleteVanish
        })
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

  const sortedReports = useMemo(() => {
    return [...userReports].sort((a, b) => {
      const aTime = new Date(a.reportedAt).getTime();
      const bTime = new Date(b.reportedAt).getTime();
      return bTime - aTime;
    });
  }, [userReports]);

  // =========== LOGIN SCREEN ===========
  if (!isAuthenticated) {
    if (location.state?.autoLoginPassword || isLoading) {
      return (
        <AdminContainer style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: isDark ? '#f1f5f9' : '#1e293b' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p>Authenticating...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </AdminContainer>
      );
    }

    return (
      <LoginFormContainer>
        <AdminOrb $color="rgba(99,102,241,0.3)" $size={500} $top="-10%" $left="-10%" $anim={float1} />
        <AdminOrb $color="rgba(59,130,246,0.25)" $size={400} $top="60%" $left="60%" $anim={float2} />
        <AdminOrb $color="rgba(236,72,153,0.18)" $size={350} $top="30%" $left="70%" $anim={float3} />
        <LoginBox>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', width: '100%' }}>
            <AdminFormHomeButton
              onClick={() => navigate('/')}
              title="Back to Home"
              aria-label="Back to Home"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </AdminFormHomeButton>
            <AdminThemeToggle
              onClick={toggleTheme}
              title={isDark ? 'Light mode' : 'Dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              )}
            </AdminThemeToggle>
          </div>
          <AdminLoginBrand style={{ marginTop: 0 }}>
            <AdminBrandLogo src="/pulse_logo.webp" alt="Pulse Admin" />
            <AdminBrandWordmark><span>Pulse</span> Chat</AdminBrandWordmark>
            <AdminHeartbeatSvg viewBox="0 0 120 30" width="120" height="30">
              <path d="M0 15 L30 15 L38 5 L46 25 L54 8 L60 15 L90 15 L98 5 L106 25 L114 8 L120 15" />
            </AdminHeartbeatSvg>
            <AdminBrandSubtitle>{!urlRoomId ? "Main Admin Console" : "Admin Control Panel"}</AdminBrandSubtitle>
          </AdminLoginBrand>
          {!!urlRoomId && (
            <AdminInputGroup $focused={false} style={{ marginBottom: '1rem' }}>
              <AdminInputIcon $focused={false}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              </AdminInputIcon>
              <AdminStyledInput
                id="admin-room-id"
                type="text"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={handleKeyDown}
                autoFocus={!window.matchMedia('(pointer: coarse)').matches}
              />
            </AdminInputGroup>
          )}

          <AdminInputGroup $focused={passwordFocused}>
            <AdminInputIcon $focused={passwordFocused}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </AdminInputIcon>
            <AdminStyledInput
              ref={adminPasswordInputRef}
              id="admin-password"
              name="admin-password"
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder="Enter admin password"
              autoComplete="current-password"
              autoFocus={!urlRoomId && !window.matchMedia('(pointer: coarse)').matches}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
            <AdminEyeBtn
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={() => {
                const pos = adminPasswordInputRef.current?.selectionStart ?? null;
                setIsPasswordVisible(prev => !prev);
                requestAnimationFrame(() => focusAdminPasswordInput(pos));
              }}
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
              title={isPasswordVisible ? 'Hide password' : 'Show password'}
            >
              {isPasswordVisible ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </AdminEyeBtn>
          </AdminInputGroup>
          <AdminSubmitBtn onClick={() => handleLogin()} disabled={isLoading} $loading={isLoading}>
            {isLoading ? 'Authenticating...' : 'Login'}
          </AdminSubmitBtn>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <AdminSecuredLine>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            Protected admin access
          </AdminSecuredLine>
        </LoginBox>
      </LoginFormContainer>
    );
  }

  // =========== MAIN ADMIN PANEL ===========
  return (
    <AdminContainer>
      <HeaderRow>
        <Title>
          <a href="/admin">
            <img src="/pulse_logo.webp" alt="Pulse Admin Panel" />
            <span>Pulse</span> Chat
          </a>
        </Title>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {lockdownStatus.isActive && (
            <Badge $color="red"><StatusDot $color="red" /> Lockdown Active</Badge>
          )}
          <PanelThemeToggle
            onClick={toggleTheme}
            title={isDark ? 'Light mode' : 'Dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </PanelThemeToggle>
          <LogoutButton onClick={handleLogout}>Logout</LogoutButton>
        </div>
      </HeaderRow>

      <TabContainer>
        <TabButton active={activeTab === 'messages'} onClick={() => setActiveTab('messages')}>Message Log</TabButton>
        <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')}>Users</TabButton>
        <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')}>Reports</TabButton>
        <TabButton active={activeTab === 'access'} onClick={() => setActiveTab('access')}>Access Links</TabButton>
        <TabButton active={activeTab === 'security'} onClick={() => setActiveTab('security')}>Security</TabButton>
        {(roomId === 'me' || roomId === 'global') && (
          <>
            <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>Live Activity</TabButton>
            <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>Server Logs</TabButton>
            <TabButton active={activeTab === 'rooms'} onClick={() => setActiveTab('rooms')}>All Rooms</TabButton>
          </>
        )}
        {roomId !== 'me' && roomId !== 'global' && (
          <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Room Settings</TabButton>
        )}
      </TabContainer>

      <TabContent>
        {/* ===== MESSAGE LOG ===== */}
        {activeTab === 'messages' && (
          <MessageLogScrollContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>Message Log</h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <DangerButton
                  onClick={() => setShowBulkDeleteModal(true)}
                  disabled={selectedMessages.size === 0}
                  style={{
                    opacity: selectedMessages.size === 0 ? 0.5 : 1,
                    cursor: selectedMessages.size === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Delete Message(s) {selectedMessages.size > 0 ? `(${selectedMessages.size})` : ''}
                </DangerButton>
                {roomId !== 'me' && roomId !== 'global' && (
                  <ClearHistoryButton onClick={handleDeleteRoom} style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}>
                    Delete Chat Room
                  </ClearHistoryButton>
                )}
                <PremiumExportButton onClick={async () => {
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
                }}>
                  {roomId === 'me' ? 'Export Private Messages' : 'Export Messages'}
                </PremiumExportButton>

                {(roomId === 'me' || roomId === 'global') && (
                  <PremiumExportButton onClick={async () => {
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
                  }}>
                    Export All Rooms
                  </PremiumExportButton>
                )}
              </div>
            </div>
            <FilterToggleButton
              type="button"
              $open={showMessageFilters}
              onClick={() => setShowMessageFilters(prev => !prev)}
              aria-label={showMessageFilters ? 'Hide message log filters' : 'Show message log filters'}
              title={showMessageFilters ? 'Hide filters' : 'Show filters'}
            >
              {showMessageFilters ? 'Hide filters' : 'Show filters'}
            </FilterToggleButton>
            <MessageFilterCollapse $open={showMessageFilters}>
              <FilterContainer>
                <Input type="text" placeholder="Filter by Message ID" value={filterMessageId} onChange={(e) => setFilterMessageId(e.target.value)} />
                <Input type="text" placeholder="Filter by User" value={filterUser} onChange={(e) => setFilterUser(e.target.value)} />
                <SelectWrapper>
                  <Select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value)}>
                    <option value="All">All Events</option>
                    <option value="Create">Create</option>
                    <option value="Edit">Edit</option>
                    <option value="Upload">Upload</option>
                    <option value="Delete (Everyone)">Delete (Everyone)</option>
                    <option value="Deleted by admin">Deleted by admin</option>
                  </Select>
                </SelectWrapper>
                <Input type="text" placeholder="Filter by Content" value={filterContent} onChange={(e) => setFilterContent(e.target.value)} />
              </FilterContainer>
            </MessageFilterCollapse>
            {isHistoryLoading ? <p>Loading history...</p> : (
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
                    {filteredHistoryLogs.slice(0, displayedLogsCount).map((log, index) => {
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
                          <Td>{log.username} ({log.userId})</Td>
                          <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b', minWidth: '180px', maxWidth: '250px', wordBreak: 'break-all' }}>{log.messageId || log.message?.id || log.message?._id || log._id || 'N/A'}</Td>
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
                            ) : log.type === 'delete_everyone' ? (
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Badge $color="yellow" style={{ whiteSpace: 'nowrap' }}>Deleted by User</Badge>
                              </div>
                            ) : log.type === 'create' && laterDeletedByUserIds.has(extractMessageId(log)) ? (
                              // This create event's message was later deleted by the user.
                              // Show "Sent" + a secondary indicator so the admin isn't confused
                              // by seeing "Active" on a message that no longer exists.
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                <Badge $color="green" style={{ whiteSpace: 'nowrap' }}>Sent</Badge>
                                <Badge $color="yellow" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>↳ Deleted by User</Badge>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Badge $color="green" style={{ whiteSpace: 'nowrap' }}>Active</Badge>
                              </div>
                            )}
                          </Td>
                          <ExpandTd>{renderMessageDetails(log)}</ExpandTd>
                          <NoWrapTd>
                            {log.type === 'create' && (log.messageId || log.message?.id || log.message?._id || log._id) && (
                              pinnedMessages.some(p => p.id === (log.messageId || log.message?.id || log.message?._id || log._id)) ? (
                                <SmallDangerButton onClick={() => handleUnpin(log.messageId || log.message?.id || log.message?._id || log._id)}>Unpin</SmallDangerButton>
                              ) : (
                                <SmallSuccessButton onClick={() => handleInitiatePin(log.messageId || log.message?.id || log.message?._id || log._id)}>Pin</SmallSuccessButton>
                              )
                            )}
                          </NoWrapTd>
                        </tr>
                      )
                    })}
                  </tbody>
                </MessageLogTable>
                {displayedLogsCount < filteredHistoryLogs.length && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                    <Button onClick={() => setDisplayedLogsCount(prev => prev + 50)}>
                      Load More Messages
                    </Button>
                  </div>
                )}
              </MessageLogTableWrapper>
            )}
          </MessageLogScrollContainer>
        )}

        {/* ===== USERS ===== */}
        {activeTab === 'users' && (
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
              <EmptyState><span>No users currently online</span></EmptyState>
            ) : (
              <>
                <ResponsiveTableWrapper>
                  <Table>
                    <thead><tr><Th>Username</Th><Th>User ID</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {onlineUsersList.map(user => (
                        <tr key={user.userId}>
                          <Td><div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><StatusDot $color="green" /><strong>{user.username}</strong></div></Td>
                          <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                          <Td>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                              <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>Block</SmallWarningButton>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </ResponsiveTableWrapper>
                <MobileCardList>
                  {onlineUsersList.map(user => (
                    <UserCard key={user.userId}>
                      <UserCardHeader>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <StatusDot $color="green" />
                          <strong style={{ fontSize: '1rem' }}>{user.username}</strong>
                        </div>
                        <Badge $color="green"><StatusDot $color="green" />Online</Badge>
                      </UserCardHeader>
                      <UserCardMeta>
                        <UserCardMetaRow>
                          <UserCardMetaLabel>User ID</UserCardMetaLabel>
                          <UserCardMetaValue style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>{user.userId}</UserCardMetaValue>
                        </UserCardMetaRow>
                      </UserCardMeta>
                      <UserCardActions>
                        <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                        <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>Block</SmallWarningButton>
                      </UserCardActions>
                    </UserCard>
                  ))}
                </MobileCardList>
              </>
            )}

            <SectionTitle style={{ marginTop: '2rem' }}>
              <StatusDot $color="yellow" /> Logged-In Sessions ({loggedInUsersList.length})
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>&mdash; includes offline</span>
            </SectionTitle>
            {loggedInUsersList.length === 0 ? (
              <EmptyState><span>No tracked sessions</span></EmptyState>
            ) : (
              <>
                <ResponsiveTableWrapper>
                  <Table>
                    <thead><tr><Th>Username</Th><Th>Status</Th><Th>Login Time</Th><Th>Via</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {loggedInUsersList.map(user => {
                        const isOnline = onlineUsersList.some(u => u.userId === user.userId);
                        return (
                          <tr key={user.userId}>
                            <Td><div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><StatusDot $color={isOnline ? 'green' : 'gray'} /><strong>{user.username}</strong></div></Td>
                            <Td><Badge $color={isOnline ? 'green' : 'gray'}>{isOnline ? 'Online' : 'Offline'}</Badge></Td>
                            <Td style={{ fontSize: '0.85rem' }}>{user.loginTime ? formatDateTime(user.loginTime) : 'N/A'}</Td>
                            <Td>{user.viaTempLink ? <Badge $color="blue">Temp Link</Badge> : <Badge $color="gray">Password</Badge>}</Td>
                            <Td>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                                <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>Block</SmallWarningButton>
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </ResponsiveTableWrapper>
                <MobileCardList>
                  {loggedInUsersList.map(user => {
                    const isOnline = onlineUsersList.some(u => u.userId === user.userId);
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
                            <UserCardMetaValue>{user.loginTime ? formatDateTime(user.loginTime) : 'N/A'}</UserCardMetaValue>
                          </UserCardMetaRow>
                          <UserCardMetaRow>
                            <UserCardMetaLabel>Via</UserCardMetaLabel>
                            <UserCardMetaValue>{user.viaTempLink ? <Badge $color="blue">Temp Link</Badge> : <Badge $color="gray">Password</Badge>}</UserCardMetaValue>
                          </UserCardMetaRow>
                        </UserCardMeta>
                        <UserCardActions>
                          <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                          <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>Block</SmallWarningButton>
                        </UserCardActions>
                      </UserCard>
                    );
                  })}
                </MobileCardList>
              </>
            )}

            <SectionTitle style={{ marginTop: '2rem' }}>
              All Registered Users ({users.length})
            </SectionTitle>
            <ResponsiveTableWrapper>
              <Table>
                <thead><tr><Th>User ID</Th><Th>Username</Th></tr></thead>
                <tbody>
                  {sortedUsers.map(user => (
                    <tr key={user.userId}>
                      <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                      <Td>{user.username}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </ResponsiveTableWrapper>
            <MobileCardList>
              {sortedUsers.map(user => (
                <UserCard key={user.userId}>
                  <UserCardHeader>
                    <strong style={{ fontSize: '1rem' }}>{user.username}</strong>
                  </UserCardHeader>
                  <UserCardMeta>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>User ID</UserCardMetaLabel>
                      <UserCardMetaValue style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>{user.userId}</UserCardMetaValue>
                    </UserCardMetaRow>
                  </UserCardMeta>
                </UserCard>
              ))}
            </MobileCardList>
          </ScrollContainer>
        )}

        {/* ===== REPORTS ===== */}
        {activeTab === 'reports' && (
          <ScrollContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>User Reports</h2>
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
                        const messagePreview = report.messageText?.trim()
                          || (report.messageType === 'image'
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
                                <Badge $color={report.reportedUserIsOnline ? 'green' : 'gray'}>{report.reportedUserIsOnline ? 'Online' : 'Offline'}</Badge>
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>{report.reportedUserId}</div>
                            </Td>
                            <Td>
                              <div><strong>{report.reporterUsername}</strong></div>
                              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>{report.reporterUserId}</div>
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
                            <Td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{report.reportedUserJoinedAt ? formatDateTime(report.reportedUserJoinedAt) : '—'}</Td>
                            <Td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{report.reportedUserCurrentSessionLoginTime ? formatDateTime(report.reportedUserCurrentSessionLoginTime) : '—'}</Td>
                            <Td style={{ whiteSpace: 'nowrap' }}>{formatDuration(report.reportedUserCurrentSessionDurationMs)}</Td>
                            <Td style={{ minWidth: '200px', fontSize: '0.76rem' }}>
                              {joinHistory.length > 0
                                ? joinHistory.map((entry) => formatDateTime(entry)).join(' | ')
                                : '—'}
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
                    const messagePreview = report.messageText?.trim()
                      || (report.messageType === 'image'
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
                            <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>{report.reportedUserId}</span>
                          </div>
                          <Badge $color={report.reportedUserIsOnline ? 'green' : 'gray'}>{report.reportedUserIsOnline ? 'Online' : 'Offline'}</Badge>
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
                            <UserCardMetaValue>{report.reportedUserJoinedAt ? formatDateTime(report.reportedUserJoinedAt) : '—'}</UserCardMetaValue>
                          </UserCardMetaRow>
                          <UserCardMetaRow>
                            <UserCardMetaLabel>Session Started</UserCardMetaLabel>
                            <UserCardMetaValue>{report.reportedUserCurrentSessionLoginTime ? formatDateTime(report.reportedUserCurrentSessionLoginTime) : '—'}</UserCardMetaValue>
                          </UserCardMetaRow>
                          <UserCardMetaRow>
                            <UserCardMetaLabel>Joined For</UserCardMetaLabel>
                            <UserCardMetaValue>{formatDuration(report.reportedUserCurrentSessionDurationMs)}</UserCardMetaValue>
                          </UserCardMetaRow>
                        </UserCardMeta>
                        <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: '10px', padding: '0.6rem 0.7rem', marginBottom: '0.5rem' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            Report Reason
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{report.reason}</div>
                        </div>
                        <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: '10px', padding: '0.6rem 0.7rem', marginBottom: '0.5rem' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
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
        )}

        {/* ===== ACCESS LINKS ===== */}
        {activeTab === 'access' && (
          <ScrollContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
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
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                <span>No links created yet</span>
                <span style={{ fontSize: '0.8rem' }}>Click "Generate New Link" to create one</span>
              </EmptyState>
            ) : (
              tempLinks.map(link => {
                const { status, label } = getLinkStatus(link);
                const badgeColor = status === 'active' ? 'green' : status === 'revoked' ? 'red' : 'gray';
                const dotColor = badgeColor === 'green' ? 'green' : badgeColor === 'red' ? 'red' : 'gray';
                return (
                  <LinkCard key={link._id} $variant={status === 'active' ? 'success' : undefined}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <Badge $color={badgeColor}><StatusDot $color={dotColor} />{label}</Badge>
                        {status === 'active' && (
                          <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>⏱️ {getTimeRemaining(link.expiresAt)} remaining</span>
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
                          Used by: {link.usedBy.map((u, i) => (
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
        )}

        {/* ===== SECURITY ===== */}
        {activeTab === 'security' && (
          <ScrollContainer>
            {/* Login Lockdown */}
            <SectionTitle>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Login Lockdown
            </SectionTitle>
            <Card $variant={lockdownStatus.isActive ? 'danger' : 'default'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <Badge $color={lockdownStatus.isActive ? 'red' : 'green'}>
                  <StatusDot $color={lockdownStatus.isActive ? 'red' : 'green'} />
                  {lockdownStatus.isActive ? 'LOCKDOWN ACTIVE' : 'No Lockdown'}
                </Badge>
                {lockdownStatus.isActive && lockdownStatus.endTime && (
                  <span style={{ fontSize: '0.85rem', color: '#991b1b' }}>Until: {formatDateTime(lockdownStatus.endTime)}</span>
                )}
                {lockdownStatus.isActive && !lockdownStatus.endTime && (
                  <span style={{ fontSize: '0.85rem', color: '#991b1b', fontWeight: 600 }}>Indefinite</span>
                )}
              </div>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
                When active, no new users can log in. Logged-in users can reconnect. Temp links still work.
              </p>
              {lockdownStatus.isActive ? (
                <SuccessButton onClick={handleRemoveLockdown}>🔓 Disable Lockdown</SuccessButton>
              ) : (
                <LockdownPanel>
                  {['1hr', '6hr', '12hr', '1day', '3days'].map(t => (
                    <LockdownOption key={t} onClick={() => handleSetLockdown(t)}>
                      {t === '1hr' ? '1 Hour' : t === '6hr' ? '6 Hours' : t === '12hr' ? '12 Hours' : t === '1day' ? '1 Day' : '3 Days'}
                    </LockdownOption>
                  ))}
                  <LockdownOption onClick={() => handleSetLockdown('indefinite')}>Until I Allow</LockdownOption>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CustomTimeInput type="number" placeholder="Minutes" value={customLockdownMinutes} onChange={e => setCustomLockdownMinutes(e.target.value)} min="1" />
                    <LockdownOption onClick={() => handleSetLockdown('custom')}>Custom</LockdownOption>
                  </div>
                </LockdownPanel>
              )}
            </Card>

            {/* Blocked Users */}
            <SectionTitle style={{ marginTop: '2rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
              Blocked Users ({blockedUsers.filter(u => u.isBlocked).length})
            </SectionTitle>
            {blockedUsers.filter(u => u.isBlocked).length === 0 ? (
              <EmptyState><span>No blocked users</span></EmptyState>
            ) : (
              <Table>
                <thead><tr><Th>Username</Th><Th>User ID</Th><Th>Blocked At</Th><Th>Reason</Th><Th>Known IPs</Th><Th>Actions</Th></tr></thead>
                <tbody>
                  {blockedUsers.filter(u => u.isBlocked).map(user => (
                    <tr key={user._id}>
                      <Td><strong>{user.username}</strong></Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                      <Td style={{ fontSize: '0.85rem' }}>{formatDateTime(user.blockedAt)}</Td>
                      <Td style={{ fontSize: '0.85rem' }}>{user.reason || '—'}</Td>
                      <Td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{user.fingerprints?.ips?.length > 0 ? user.fingerprints.ips.join(', ') : '—'}</Td>
                      <Td><SmallSuccessButton onClick={() => handleUnblockUser(user.userId)}>Unblock</SmallSuccessButton></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            {/* Block History */}
            {blockedUsers.filter(u => !u.isBlocked).length > 0 && (
              <>
                <SectionTitle style={{ marginTop: '2rem' }}>Block History</SectionTitle>
                <Table>
                  <thead><tr><Th>Username</Th><Th>Blocked At</Th><Th>Unblocked At</Th><Th>Reason</Th></tr></thead>
                  <tbody>
                    {blockedUsers.filter(u => !u.isBlocked).map(user => (
                      <tr key={user._id}>
                        <Td>{user.username}</Td>
                        <Td style={{ fontSize: '0.85rem' }}>{formatDateTime(user.blockedAt)}</Td>
                        <Td style={{ fontSize: '0.85rem' }}>{user.unblockedAt ? formatDateTime(user.unblockedAt) : '—'}</Td>
                        <Td>{user.reason || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}

            {/* Audit Logs */}
            <SectionTitle style={{ marginTop: '2rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              Audit Logs
            </SectionTitle>
            {auditLogs.length === 0 ? (
              <EmptyState><span>No audit logs yet</span></EmptyState>
            ) : (
              auditLogs.map(log => (
                <AuditLogEntry key={log._id} $type={log.type}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <strong>{auditTypeLabel(log.type)}</strong>
                      <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.8rem' }}>
                        {log.details?.userId && <span>User: {log.details.username || log.details.userId} </span>}
                        {log.details?.reason && <span>· Reason: {log.details.reason} </span>}
                        {log.details?.token && <span>· Token: {log.details.token} </span>}
                        {log.details?.type && log.type.includes('lockdown') && <span>· Duration: {log.details.type} </span>}
                        {log.ip && <span>· IP: {log.ip} </span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.timestamp)}
                    </span>
                  </div>
                </AuditLogEntry>
              ))
            )}
          </ScrollContainer>
        )}

        {/* ===== LIVE ACTIVITY ===== */}
        {(roomId === 'me' || roomId === 'global') && activeTab === 'activity' && (
          <>
            <h2>Real-Time Activity</h2>
            <ActivityLogContainer ref={activityLogRef}>
              {activityLogs.map((log, index) => (
                <ActivityLogItem key={index}>{log}</ActivityLogItem>
              ))}
            </ActivityLogContainer>
          </>
        )}

        {/* ===== SERVER LOGS ===== */}
        {(roomId === 'me' || roomId === 'global') && activeTab === 'logs' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>Server Logs</h2>
              <Button onClick={handleRefreshServerLogs}>Refresh</Button>
            </div>
            {isServerLogsLoading ? <p>Loading server logs...</p> : (
              <LogViewerContainer>
                {serverLogs.map((log, index) => <div key={index}>{formatServerLogLine(log)}</div>)}
              </LogViewerContainer>
            )}
          </>
        )}
        {/* ===== ALL ROOMS (SUPER ADMIN ONLY) ===== */}
        {(roomId === 'me' || roomId === 'global') && activeTab === 'rooms' && (
          <ScrollContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>All Chat Rooms</h2>
              <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Total: {globalRooms.length}</span>
            </div>
            {isRoomsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', background: 'var(--panel-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', backdropFilter: 'blur(10px)' }}>
                <div style={{ position: 'relative', width: '50px', height: '50px' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--border-color)', opacity: 0.3 }}></div>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: 'var(--primary-color)', animation: 'pulse-spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}></div>
                </div>
                <span style={{ marginTop: '1.5rem', color: 'var(--text-color)', fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.5px' }}>Fetching Rooms</span>
                <span style={{ marginTop: '0.5rem', color: 'var(--text-color)', opacity: 0.6, fontSize: '0.9rem' }}>Securely loading data...</span>
                <style>{`@keyframes pulse-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              </div>
            ) : globalRooms.length === 0 ? (
              <EmptyState><span>No rooms created yet.</span></EmptyState>
            ) : (
              <TableWrapper>
                <WideTable>
                  <thead>
                    <tr>
                      <StickyTh>Name</StickyTh>
                      <StickyTh>Room ID (Alias)</StickyTh>
                      <StickyTh>Status</StickyTh>
                      <StickyTh>Created</StickyTh>
                      <StickyTh style={{ textAlign: 'right' }}>Actions</StickyTh>
                    </tr>
                  </thead>
                  <tbody>
                    {globalRooms.map((room) => (
                      <tr key={room._id}>
                        <Td>
                          <strong style={{ display: 'block', fontSize: '1.05rem', color: 'var(--text-color)' }}>{room.name || 'Unnamed Room'}</strong>
                        </Td>
                        <Td>
                          <code style={{ background: 'var(--bg-color)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                            {room.alias || room.id}
                          </code>
                        </Td>
                        <Td>
                          {room.hasJoinPassword ? (
                            <Badge $color="purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" style={{ marginRight: '4px' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>Private</Badge>
                          ) : (
                            <Badge $color="green">Public</Badge>
                          )}
                        </Td>
                        <Td style={{ color: '#64748b', fontSize: '0.9rem' }}>
                          {new Date(room.createdAt).toLocaleDateString()}
                        </Td>
                        <Td style={{ textAlign: 'right' }}>
                          <Button
                            onClick={() => {
                              // Impersonate Room Admin by navigating and passing the super admin password
                              navigate(`/admin/${room.id}`, { state: { autoLoginPassword: passwordRef.current, isImpersonating: true } });
                            }}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: '#3b82f6', color: 'white', border: 'none' }}
                          >
                            Manage Room
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </WideTable>
              </TableWrapper>
            )}
          </ScrollContainer>
        )}

        {/* ===== SETTINGS ===== */}
        {roomId !== 'me' && roomId !== 'global' && activeTab === 'settings' && (
          <ScrollContainer>
            <div style={{ marginBottom: '2rem' }}>
              <h2>Room Details</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Update the public information about your room.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', maxWidth: '300px' }}>
                    <label style={{ margin: 0, fontWeight: 600 }}>Room Name</label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{roomSettingsName.length}/50</span>
                  </div>
                  <Input
                    type="text"
                    value={roomSettingsName}
                    onChange={e => setRoomSettingsName(e.target.value)}
                    placeholder="Enter room name"
                    maxLength={50}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', maxWidth: '300px' }}>
                    <label style={{ margin: 0, fontWeight: 600 }}>Room Description</label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{roomSettingsDesc.length}/150</span>
                  </div>
                  <TextArea
                    value={roomSettingsDesc}
                    onChange={e => setRoomSettingsDesc(e.target.value)}
                    placeholder="Enter a brief description"
                    maxLength={150}
                  />
                </div>
                <Button style={{ maxWidth: '300px' }} onClick={handleSaveRoomDetails} disabled={roomSettingsLoading}>
                  {roomSettingsLoading ? 'Saving...' : 'Save Details'}
                </Button>
              </div>
            </div>

            <div style={{ marginBottom: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
              <h2>Room ID</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Change the custom URL/ID of your room.
                <strong style={{ color: '#ef4444' }}> Note: This can only be done once every 14 days.</strong>
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px' }}>
                {roomSettingsLastIdChange && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 -0.5rem' }}>
                    Last changed: {new Date(roomSettingsLastIdChange).toLocaleDateString('en-GB')}
                  </p>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', maxWidth: '300px' }}>
                    <label style={{ margin: 0, fontWeight: 600 }}>New Room ID</label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{roomSettingsNewId.length}/30</span>
                  </div>
                  <Input
                    type="text"
                    value={roomSettingsNewId}
                    onChange={e => setRoomSettingsNewId(e.target.value.replace(/[^a-zA-Z0-9._]/g, ''))}
                    placeholder="e.g. my-cool-room"
                    maxLength={30}
                  />
                  <small style={{ color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                    Letters, numbers, dots, and underscores only. 1-30 chars.
                  </small>
                </div>
                <Button style={{ maxWidth: '300px' }} onClick={handleSaveRoomId} disabled={roomSettingsLoading}>
                  {roomSettingsLoading ? 'Saving...' : 'Save Room ID'}
                </Button>

                {(roomIdSuccess || roomIdError) && (
                  <div style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    background: roomIdError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                    color: roomIdError ? '#ef4444' : '#22c55e',
                    border: `1px solid ${roomIdError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.9rem',
                    maxWidth: '400px'
                  }}>
                    {roomIdError ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                      </svg>
                    )}
                    <span style={{ fontWeight: 500, lineHeight: 1.4 }}>{roomIdError || roomIdSuccess}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '3rem', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, color: '#3b82f6' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Change Join Password
              </h3>
              <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ color: '#cbd5e1', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
                  Change the password required for regular users to join this chat room.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: '#3b82f6', flexShrink: 0, marginTop: '2px' }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5 }}>
                    <span style={{ color: '#60a5fa', fontWeight: 600 }}>Note: </span>
                    If there is no current password, leave the current password field blank. Adding a join password to a public chat room will automatically make it a private chat room.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '300px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Current Join Password</label>
                  <Input
                    type="password"
                    value={roomSettingsCurrentPassword}
                    onChange={e => setRoomSettingsCurrentPassword(e.target.value)}
                    placeholder="Enter current join password"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>New Join Password</label>
                  <Input
                    type="password"
                    value={roomSettingsNewPassword}
                    onChange={e => setRoomSettingsNewPassword(e.target.value)}
                    placeholder="Enter new join password"
                  />
                  <PasswordStrengthIndicator password={roomSettingsNewPassword} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Confirm New Password</label>
                  <Input
                    type="password"
                    value={roomSettingsConfirmPassword}
                    onChange={e => setRoomSettingsConfirmPassword(e.target.value)}
                    placeholder="Re-enter new join password"
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <Button onClick={handleChangeJoinPassword} disabled={roomSettingsLoading} style={{ flex: 1 }}>
                    {roomSettingsLoading ? 'Saving...' : 'Change Join Password'}
                  </Button>

                  {roomSettingsHasJoinPassword && (
                    <button
                      onClick={handleRemoveJoinPassword}
                      disabled={roomSettingsLoading}
                      title="Remove password and make room public"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.6rem',
                        padding: '0.4rem 1.25rem',
                        borderRadius: '8px',
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontWeight: 600,
                        cursor: roomSettingsLoading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        opacity: roomSettingsLoading ? 0.5 : 1
                      }}
                      onMouseOver={(e) => {
                        if (!roomSettingsLoading) {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!roomSettingsLoading) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                        }
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                      </svg>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                        <span style={{ lineHeight: 1.1 }}>Remove Password</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.8, fontWeight: 500, marginTop: '0.15rem' }}>Makes room public</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(roomSettingsSuccess || roomSettingsError) && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                borderRadius: '8px',
                background: roomSettingsError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                color: roomSettingsError ? '#ef4444' : '#22c55e',
                border: `1px solid ${roomSettingsError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.9rem',
                maxWidth: '400px'
              }}>
                {roomSettingsError ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                )}
                <span style={{ fontWeight: 500, lineHeight: 1.4 }}>{roomSettingsError || roomSettingsSuccess}</span>
              </div>
            )}
          </ScrollContainer>
        )}
      </TabContent>

      {showPinModal && (
        <ModalOverlay onClick={() => setShowPinModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHeader>Choose how long your pin lasts</ModalHeader>
            <ModalBody>You can unpin at any time.</ModalBody>
            <RadioGroup>
              <RadioLabel>
                <input type="radio" name="pinDuration" checked={pinDuration === 24 * 60 * 60 * 1000} onChange={() => setPinDuration(24 * 60 * 60 * 1000)} />
                <span>24 hours</span>
              </RadioLabel>
              <RadioLabel>
                <input type="radio" name="pinDuration" checked={pinDuration === 7 * 24 * 60 * 60 * 1000} onChange={() => setPinDuration(7 * 24 * 60 * 60 * 1000)} />
                <span>7 days</span>
              </RadioLabel>
              <RadioLabel>
                <input type="radio" name="pinDuration" checked={pinDuration === 30 * 24 * 60 * 60 * 1000} onChange={() => setPinDuration(30 * 24 * 60 * 60 * 1000)} />
                <span>30 days</span>
              </RadioLabel>
              <RadioLabel>
                <input type="radio" name="pinDuration" checked={pinDuration === null} onChange={() => setPinDuration(null)} />
                <span>Until I unpin or replace</span>
              </RadioLabel>
            </RadioGroup>
            <ModalFooter>
              <Button style={{ background: '#475569', color: '#f1f5f9' }} onClick={() => setShowPinModal(false)}>Cancel</Button>
              <Button onClick={handleConfirmDuration}>Pin</Button>
            </ModalFooter>
          </ModalContent>
        </ModalOverlay>
      )}

      {showReplaceModal && (
        <ModalOverlay onClick={() => setShowReplaceModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHeader>Replace oldest pin?</ModalHeader>
            <ModalBody>Your new pin will replace the oldest one.</ModalBody>
            <ModalFooter>
              <Button style={{ background: '#475569', color: '#f1f5f9' }} onClick={() => setShowReplaceModal(false)}>Cancel</Button>
              <Button onClick={() => submitPin(true)}>Continue</Button>
            </ModalFooter>
          </ModalContent>
        </ModalOverlay>
      )}

      {showBulkDeleteModal && (
        <ModalOverlay>
          <ModalContent>
            <ModalHeader>
              <h3 style={{ margin: 0 }}>Delete {selectedMessages.size} Message(s)</h3>
            </ModalHeader>
            <ModalBody>
              <p style={{ marginBottom: '1rem', color: '#94a3b8' }}>
                Choose how you want to handle the selected messages:
              </p>
              <RadioGroup>
                <RadioLabel>
                  <input type="radio" name="bulkDeleteAction" value="hide" checked={bulkDeleteAction === 'hide'} onChange={() => setBulkDeleteAction('hide')} />
                  <div>
                    <strong>Hide from frontend (Keep in DB)</strong>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Shows a deleted bubble to users by default. Original text remains in the database for admins to review.</p>
                  </div>
                </RadioLabel>
                <RadioLabel>
                  <input type="radio" name="bulkDeleteAction" value="delete" checked={bulkDeleteAction === 'delete'} onChange={() => setBulkDeleteAction('delete')} />
                  <div>
                    <strong>Delete from database</strong>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Shows a deleted bubble to users by default. The original text and media are permanently scrubbed from the database to save space and ensure privacy.</p>
                  </div>
                </RadioLabel>
              </RadioGroup>

              {(roomId === 'me' || roomId === 'global') && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={bulkDeleteVanish} 
                      onChange={e => setBulkDeleteVanish(e.target.checked)} 
                      style={{ marginTop: '0.2rem', width: '1.1rem', height: '1.1rem' }}
                    />
                    <div>
                      <strong style={{ display: 'block', color: '#ef4444' }}>Vanish without a trace</strong>
                      <span style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
                        Super Admin only. Do not show a deleted bubble on the frontend. The messages will completely disappear for all users.
                      </span>
                    </div>
                  </label>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button onClick={() => setShowBulkDeleteModal(false)}>Cancel</Button>
              <DangerButton onClick={handleBulkActionSubmit}>Confirm Deletion</DangerButton>
            </ModalFooter>
          </ModalContent>
        </ModalOverlay>
      )}
    </AdminContainer>
  );
};

export default Admin;
