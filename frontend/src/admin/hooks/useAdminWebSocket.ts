import React, { useEffect, useRef } from 'react';
import { resolveApiBaseUrl } from '../../chat/utils';
import type { UserProfile, BlockedUserData, LockdownData, AuditLogData, LoggedInUser, UserReportData, TempLinkData } from '../types';

interface UseAdminWebSocketOptions {
  isAuthenticated: boolean;
  roomId: string;
  passwordRef: React.MutableRefObject<string>;
  ws: React.MutableRefObject<WebSocket | null>;
  setActivityLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setHistoryLogs: React.Dispatch<React.SetStateAction<any[]>>;
  setPinnedMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setOnlineUsersList: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  setUsers: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  setLoggedInUsersList: React.Dispatch<React.SetStateAction<LoggedInUser[]>>;
  setServerLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setTempLinks: React.Dispatch<React.SetStateAction<TempLinkData[]>>;
  setBlockedUsers: React.Dispatch<React.SetStateAction<BlockedUserData[]>>;
  setLockdownStatus: React.Dispatch<React.SetStateAction<LockdownData>>;
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogData[]>>;
  setUserReports: React.Dispatch<React.SetStateAction<UserReportData[]>>;
}

export function useAdminWebSocket({
  isAuthenticated,
  roomId,
  passwordRef,
  ws,
  setActivityLogs,
  setHistoryLogs,
  setPinnedMessages,
  setOnlineUsersList,
  setUsers,
  setLoggedInUsersList,
  setServerLogs,
  setTempLinks,
  setBlockedUsers,
  setLockdownStatus,
  setAuditLogs,
  setUserReports,
}: UseAdminWebSocketOptions) {
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
          if ((currentRoomId !== 'me' && currentRoomId !== 'global') && message.roomId && message.roomId !== currentRoomId) {
            break;
          }
          setActivityLogs((prev) => {
            const newLogs = [`[${new Date().toLocaleTimeString()}] ${message.data}`, ...prev].slice(0, 300);
            sessionStorage.setItem(`admin-activity-logs-${currentRoomId}`, JSON.stringify(newLogs));
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
          setActivityLogs((prev) => {
            const newLogs = [`[${new Date().toLocaleTimeString()}] Chat history permanently cleared.`, ...prev];
            sessionStorage.setItem(`admin-activity-logs-${currentRoomId}`, JSON.stringify(newLogs));
            return newLogs;
          });
          break;
        case 'chat_hidden_for_everyone':
          setActivityLogs((prev) => {
            const newLogs = [
              `[${new Date().toLocaleTimeString()}] All existing chats were hidden from frontend for everyone.`,
              ...prev,
            ];
            sessionStorage.setItem(`admin-activity-logs-${currentRoomId}`, JSON.stringify(newLogs));
            return newLogs;
          });
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
          setPinnedMessages(
            (Array.isArray(message.data) ? message.data : []).filter(
              (m: any) =>
                m &&
                !m.isDeleted &&
                !m.vanished &&
                m.text !== 'This message has been deleted by an admin.'
            )
          );
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
          if (currentRoomId === 'me' || currentRoomId === 'global') {
            setServerLogs(message.data.split('\n').filter((l: string) => l.trim().length > 0).reverse());
          }
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
          if ((currentRoomId !== 'me' && currentRoomId !== 'global') && message.data?.roomId && message.data.roomId !== currentRoomId) {
            break;
          }
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
  }, [
    isAuthenticated,
    roomId,
    passwordRef,
    ws,
    setActivityLogs,
    setHistoryLogs,
    setPinnedMessages,
    setOnlineUsersList,
    setUsers,
    setLoggedInUsersList,
    setServerLogs,
    setTempLinks,
    setBlockedUsers,
    setLockdownStatus,
    setAuditLogs,
    setUserReports,
  ]);
}
