import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTheme } from './ThemeContext';
import {
  AdminContainer, Title, LoginFormContainer, LoginBox, AdminOrb,
  AdminLoginBrand, AdminBrandLogo, AdminBrandWordmark, AdminHeartbeatSvg,
  AdminBrandSubtitle, AdminInputGroup, AdminInputIcon, AdminStyledInput,
  AdminEyeBtn, AdminSubmitBtn, AdminThemeToggle, AdminSecuredLine,
  PanelThemeToggle, HeaderRow, Input, SelectWrapper, Select,
  FilterContainer, FilterToggleButton, MessageFilterCollapse,
  Button, ErrorMessage, TabContainer, TabButton, TabContent,
  Table, Th, StickyTh, Td, TableWrapper, MessageLogScrollContainer,
  MessageLogTableWrapper, NoWrapTd, ExpandTd, WideTable, MessageLogTable,
  LogoutButton, DangerButton, SuccessButton, SmallButton,
  SmallDangerButton, SmallSuccessButton, SmallWarningButton,
  ActivityLogContainer, LogViewerContainer, ActivityLogItem,
  SectionTitle, Card, LinkCard, Badge, StatusDot,
  LinkUrlBox, CopyButton, UsedByList, LockdownPanel, LockdownOption,
  AuditLogEntry, AdminLogLink, ScrollContainer, EmptyState,
  CustomTimeInput, ClearHistoryButton, HideFrontendButton,
  ResponsiveTableWrapper, MobileCardList, UserCard, UserCardHeader,
  UserCardMeta, UserCardMetaRow, UserCardMetaLabel, UserCardMetaValue,
  UserCardActions,
  float1, float2, float3,
} from './admin/AdminStyledComponents';
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
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
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

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Pulse - Admin Panel';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setShowMessageFilters(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const focusAdminPasswordInput = useCallback(() => {
    const input = adminPasswordInputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }, []);

  // Message Log filters
  const [filterMessageId, setFilterMessageId] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterEventType, setFilterEventType] = useState('All');
  const [filterContent, setFilterContent] = useState('');

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

  // Refresh link countdown timers every second
  useEffect(() => {
    const interval = setInterval(() => setLinkTimerKey(k => k + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activityLogRef.current) activityLogRef.current.scrollTop = 0;
  }, [activityLogs]);

  // --- WebSocket ---
  useEffect(() => {
    if (!isAuthenticated) return;
    const storedPassword = passwordRef.current;
    if (!storedPassword) return;

    const wsUrl = `${process.env.REACT_APP_API_URL?.replace('http', 'ws') || 'ws://localhost:8080'}?admin=true`;
    ws.current = new WebSocket(wsUrl);
    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: 'admin_auth', password: storedPassword }));
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
          setTempLinks(prev => [message.data, ...prev]);
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
  }, [isAuthenticated]);

  const apiHeaders = useCallback(() => ({
    'x-admin-password': passwordRef.current,
    'Content-Type': 'application/json',
  }), []);
  const apiUrl = process.env.REACT_APP_API_URL || '';

  // --- Auth ---
  const handleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const enteredPassword = password;
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
        const authHeaders = { 'x-admin-password': candidate };
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
        setError('Incorrect password.');
        return;
      }

      passwordRef.current = authenticatedPassword;
      setPassword(authenticatedPassword);
      setUsers(usersData);
      setIsAuthenticated(true);

      const headers = { 'x-admin-password': authenticatedPassword };
      const [historyRes, serverLogsRes, tempLinksRes, blockedRes, lockdownRes, auditRes, reportsRes, loggedInRes] = await Promise.allSettled([
        fetch(`${apiUrl}/api/admin/history`, { headers }),
        fetch(`${apiUrl}/api/admin/server-logs`, { headers }),
        fetch(`${apiUrl}/api/admin/temp-links`, { headers }),
        fetch(`${apiUrl}/api/admin/blocked-users`, { headers }),
        fetch(`${apiUrl}/api/admin/login-lockdown`, { headers }),
        fetch(`${apiUrl}/api/admin/audit-logs`, { headers }),
        fetch(`${apiUrl}/api/admin/reports`, { headers }),
        fetch(`${apiUrl}/api/admin/logged-in-users`, { headers }),
      ]);

      if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
        const historyData = await historyRes.value.json();
        setHistoryLogs(historyData.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }

      if (serverLogsRes.status === 'fulfilled' && serverLogsRes.value.ok) {
        setServerLogs((await serverLogsRes.value.text()).split('\n').reverse());
      }

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
    } catch {
      setError('An error occurred while trying to log in.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    if (ws.current) ws.current.close();
    passwordRef.current = '';
    sessionStorage.removeItem('admin-activity-logs');
    setIsAuthenticated(false);
    setPassword('');
    setActivityLogs([]);
  };

  const handlePermanentClear = async () => {
    const enteredPassword = prompt("Re-enter admin password to confirm:");
    if (enteredPassword !== passwordRef.current) { alert("Incorrect password."); return; }
    if (window.confirm("ARE YOU SURE?\n\nThis will permanently delete all messages and events.")) {
      try {
        const res = await fetch(`${apiUrl}/api/messages/all`, {
          method: 'DELETE',
          headers: { 'x-admin-secret': process.env.REACT_APP_ADMIN_SECRET || '' },
        });
        if (res.ok) { alert("All chat history deleted."); setHistoryLogs([]); }
        else { const d = await res.json(); alert(`Error: ${d.error || 'Failed.'}`); }
      } catch { alert("A network error occurred."); }
    }
  };

  const handleHideAllFromFrontend = async () => {
    const enteredPassword = prompt("Re-enter admin password to confirm:");
    if (enteredPassword !== passwordRef.current) { alert("Incorrect password."); return; }
    if (window.confirm("ARE YOU SURE?\n\nThis will hide all existing chats from the frontend for everyone without deleting them from the database.")) {
      try {
        const res = await fetch(`${apiUrl}/api/messages/hide-all-frontend`, {
          method: 'POST',
          headers: { 'x-admin-secret': process.env.REACT_APP_ADMIN_SECRET || '' },
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
      const res = await fetch(`${apiUrl}/api/admin/server-logs`, { headers: { 'x-admin-password': passwordRef.current } });
      if (res.ok) setServerLogs((await res.text()).split('\n').reverse());
    } catch (err) { console.error("Failed to fetch server logs", err); }
  };

  // --- Temp Link Actions ---
  const handleCreateTempLink = async () => {
    setCreatingLink(true);
    try {
      // State is updated via the WebSocket 'temp_link_created' broadcast â€” do NOT also
      // update from the HTTP response or the link will appear twice in the list.
      const res = await fetch(`${apiUrl}/api/admin/temp-links`, { method: 'POST', headers: apiHeaders() });
      if (!res.ok) { console.error('Failed to create temp link:', await res.text()); }
    } catch (err) { console.error('Failed to create temp link', err); }
    setCreatingLink(false);
  };

  const handleRevokeTempLink = async (id: string) => {
    try {
      const safeId = sanitizePathId(id);
      // State is updated via the WebSocket 'temp_link_revoked' broadcast â€” do NOT also
      // update from the HTTP response or the link status will flicker / update twice.
      const res = await fetch(`${apiUrl}/api/admin/temp-links/${safeId}/revoke`, { method: 'POST', headers: apiHeaders() });
      if (!res.ok) { console.error('Failed to revoke temp link:', await res.text()); }
    } catch (err) { console.error('Failed to revoke temp link', err); }
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
      case 'edit': return <>Old: "{log.oldText}" â†’ New: "{log.newText}"</>;
      case 'delete_everyone': return <>Deleted: {formatMedia(log.deletedContent)}</>;
      case 'upload': return `File: '${log.file.originalname}' (${(log.file.size / 1024).toFixed(2)} KB)`;
      default: return JSON.stringify(log);
    }
  };

  const enrichedHistoryLogs = useMemo(() => {
    const userMap = new Map(users.map(u => [u.userId, u.username]));
    return historyLogs.map(log => ({ ...log, username: log.username || userMap.get(log.userId) || 'Unknown' }));
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
      const eventTypeMatch = filterEventType === 'All' ? true : log.type === filterEventType.toLowerCase().replace(' (everyone)', '_everyone');
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

  const sortedReports = useMemo(() => {
    return [...userReports].sort((a, b) => {
      const aTime = new Date(a.reportedAt).getTime();
      const bTime = new Date(b.reportedAt).getTime();
      return bTime - aTime;
    });
  }, [userReports]);

  // =========== LOGIN SCREEN ===========
  if (!isAuthenticated) {
    return (
      <LoginFormContainer>
        <AdminOrb $color="rgba(99,102,241,0.3)" $size={500} $top="-10%" $left="-10%" $anim={float1} />
        <AdminOrb $color="rgba(59,130,246,0.25)" $size={400} $top="60%" $left="60%" $anim={float2} />
        <AdminOrb $color="rgba(236,72,153,0.18)" $size={350} $top="30%" $left="70%" $anim={float3} />
        <LoginBox>
          <AdminThemeToggle
            onClick={toggleTheme}
            title={isDark ? 'Light mode' : 'Dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </AdminThemeToggle>
          <AdminLoginBrand>
            <AdminBrandLogo src="/pulse_logo.webp" alt="Pulse Admin" />
            <AdminBrandWordmark><span>Pulse</span> Chat</AdminBrandWordmark>
            <AdminHeartbeatSvg viewBox="0 0 120 30" width="120" height="30">
              <path d="M0 15 L30 15 L38 5 L46 25 L54 8 L60 15 L90 15 L98 5 L106 25 L114 8 L120 15" />
            </AdminHeartbeatSvg>
            <AdminBrandSubtitle>Admin Control Panel</AdminBrandSubtitle>
          </AdminLoginBrand>
          <AdminInputGroup $focused={passwordFocused}>
            <AdminInputIcon $focused={passwordFocused}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </AdminInputIcon>
            <AdminStyledInput
              ref={adminPasswordInputRef}
              id="admin-password"
              name="admin-password"
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder="Enter admin password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoFocus
            />
            <AdminEyeBtn
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={() => {
                setIsPasswordVisible(prev => !prev);
                requestAnimationFrame(focusAdminPasswordInput);
              }}
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
              title={isPasswordVisible ? 'Hide password' : 'Show password'}
            >
              {isPasswordVisible ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </AdminEyeBtn>
          </AdminInputGroup>
          <AdminSubmitBtn onClick={handleLogin} disabled={isLoading} $loading={isLoading}>
            {isLoading ? 'Authenticating...' : 'Login'}
          </AdminSubmitBtn>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <AdminSecuredLine>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
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
        <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>Live Activity</TabButton>
        <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>Server Logs</TabButton>
      </TabContainer>

      <TabContent>
        {/* ===== MESSAGE LOG ===== */}
        {activeTab === 'messages' && (
          <MessageLogScrollContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>Message Log</h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <HideFrontendButton onClick={handleHideAllFromFrontend}>Hide Existing Chats (Frontend)</HideFrontendButton>
                <ClearHistoryButton onClick={handlePermanentClear}>Clear Chat History</ClearHistoryButton>
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
                  </Select>
                </SelectWrapper>
                <Input type="text" placeholder="Filter by Content" value={filterContent} onChange={(e) => setFilterContent(e.target.value)} />
              </FilterContainer>
            </MessageFilterCollapse>
            {isLoading ? <p>Loading history...</p> : (
              <MessageLogTableWrapper>
                <MessageLogTable>
                  <thead>
                    <tr>
                      <StickyTh>Date</StickyTh>
                      <StickyTh>Time</StickyTh>
                      <StickyTh>Event</StickyTh>
                      <StickyTh>User</StickyTh>
                      <StickyTh>Message ID</StickyTh>
                      <StickyTh>Details</StickyTh>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoryLogs.map((log, index) => (
                      <tr key={index}>
                        <NoWrapTd>{formatDate(log.timestamp)}</NoWrapTd>
                        <NoWrapTd>{formatTime(log.timestamp)}</NoWrapTd>
                        <NoWrapTd>{renderEventType(log.type)}</NoWrapTd>
                        <Td>{log.username} ({log.userId})</Td>
                        <NoWrapTd style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{log.messageId || log.message?.id || 'N/A'}</NoWrapTd>
                        <ExpandTd>{renderMessageDetails(log)}</ExpandTd>
                      </tr>
                    ))}
                  </tbody>
                </MessageLogTable>
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
                  âš¡ Force Logout All ({onlineUsersList.length})
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
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>â€” includes offline</span>
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
                            <Td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{report.reportedUserJoinedAt ? formatDateTime(report.reportedUserJoinedAt) : 'â€”'}</Td>
                            <Td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{report.reportedUserCurrentSessionLoginTime ? formatDateTime(report.reportedUserCurrentSessionLoginTime) : 'â€”'}</Td>
                            <Td style={{ whiteSpace: 'nowrap' }}>{formatDuration(report.reportedUserCurrentSessionDurationMs)}</Td>
                            <Td style={{ minWidth: '200px', fontSize: '0.76rem' }}>
                              {joinHistory.length > 0
                                ? joinHistory.map((entry) => formatDateTime(entry)).join(' | ')
                                : 'â€”'}
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
                            <UserCardMetaValue>{report.reportedUserJoinedAt ? formatDateTime(report.reportedUserJoinedAt) : 'â€”'}</UserCardMetaValue>
                          </UserCardMetaRow>
                          <UserCardMetaRow>
                            <UserCardMetaLabel>Session Started</UserCardMetaLabel>
                            <UserCardMetaValue>{report.reportedUserCurrentSessionLoginTime ? formatDateTime(report.reportedUserCurrentSessionLoginTime) : 'â€”'}</UserCardMetaValue>
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
                          {joinHistory.length > 0 ? joinHistory.map((entry) => formatDateTime(entry)).join(' | ') : 'â€”'}
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
                {creatingLink ? 'â³ Creating...' : '+ Generate New Link'}
              </Button>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Generate secure temporary links for password-free access. Links expire in 5 minutes.
            </p>

            {tempLinks.length === 0 ? (
              <EmptyState>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
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
                          <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>â± {getTimeRemaining(link.expiresAt)} remaining</span>
                        )}
                      </div>
                      <LinkUrlBox>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {window.location.origin}/join/{link.token.substring(0, 12)}...
                        </span>
                        {status === 'active' && (
                          <CopyButton onClick={() => handleCopyLink(link.token, link._id)}>
                            {copiedLinkId === link._id ? 'âœ“ Copied!' : 'Copy'}
                          </CopyButton>
                        )}
                      </LinkUrlBox>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                        Created: {formatDateTime(link.createdAt)}
                        {link.revokedAt && ` Â· Revoked: ${formatDateTime(link.revokedAt)}`}
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
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
                <SuccessButton onClick={handleRemoveLockdown}>ðŸ”“ Disable Lockdown</SuccessButton>
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
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
                      <Td style={{ fontSize: '0.85rem' }}>{user.reason || 'â€”'}</Td>
                      <Td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{user.fingerprints?.ips?.length > 0 ? user.fingerprints.ips.join(', ') : 'â€”'}</Td>
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
                        <Td style={{ fontSize: '0.85rem' }}>{user.unblockedAt ? formatDateTime(user.unblockedAt) : 'â€”'}</Td>
                        <Td>{user.reason || 'â€”'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}

            {/* Audit Logs */}
            <SectionTitle style={{ marginTop: '2rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
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
                        {log.details?.reason && <span>Â· Reason: {log.details.reason} </span>}
                        {log.details?.token && <span>Â· Token: {log.details.token} </span>}
                        {log.details?.type && log.type.includes('lockdown') && <span>Â· Duration: {log.details.type} </span>}
                        {log.ip && <span>Â· IP: {log.ip} </span>}
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
        {activeTab === 'activity' && (
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
        {activeTab === 'logs' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>Server Logs</h2>
              <Button onClick={handleRefreshServerLogs}>Refresh</Button>
            </div>
            {isLoading ? <p>Loading server logs...</p> : (
              <LogViewerContainer>
                {serverLogs.map((log, index) => <div key={index}>{formatServerLogLine(log)}</div>)}
              </LogViewerContainer>
            )}
          </>
        )}
      </TabContent>
    </AdminContainer>
  );
};

export default Admin;
