import React, { useEffect, useState } from 'react';
import styled, { keyframes, createGlobalStyle } from 'styled-components';
import { useNavigate } from 'react-router-dom';

import { resolveApiBaseUrl } from './chat/utils';
import { useTheme } from './ThemeContext';

const apiBase = resolveApiBaseUrl();

const GlobalRoomsStyle = createGlobalStyle`
  html, body, #root {
    position: static !important;
    overflow: visible !important;
    height: auto !important;
    min-height: 100vh !important;
  }
  body {
    overflow-x: clip !important;
  }
  body {
    background-color: var(--bg-primary);
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary);
  }
`;

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const float = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
`;

const PageContainer = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  padding: 4rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  z-index: 10;

  @media (max-width: 768px) {
    padding: 5rem 1rem 2rem;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 3rem;
  flex-wrap: wrap;
  gap: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 800px) {
    width: 100%;
    justify-content: flex-start;
  }

  @media (max-width: 500px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    width: 100%;
    
    button {
      width: 100%;
      justify-content: center;
      padding: 0.8rem 0.5rem;
      font-size: 0.95rem;
    }

    button:last-child {
      grid-column: 1 / -1;
    }
  }
`;

const ThemeToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  text-decoration: none;
  
  position: absolute;
  top: 1.5rem;
  left: 5.5rem;
  z-index: 9999;

  @media (max-width: 768px) {
    top: 1rem;
    left: 4.2rem;
    width: 40px;
    height: 40px;
    
    svg {
      width: 18px;
      height: 18px;
    }
  }

  svg {
    width: 22px;
    height: 22px;
    transition: transform 0.3s ease, color 0.3s ease;
  }

  &:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: var(--text-primary);
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4);
  }
  
  &:active {
    transform: translateY(1px);
  }
  
  &:hover svg {
    transform: rotate(30deg);
  }
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 800;
  margin: 0 0 0.5rem;
  color: var(--text-heading);
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--text-secondary);
  font-size: 1.1rem;
`;

const Button = styled.button<{ $primary?: boolean }>`
  background: ${p => p.$primary ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'var(--bg-secondary)'};
  color: ${p => p.$primary ? '#ffffff' : 'var(--text-primary)'};
  border: ${p => p.$primary ? 'none' : '1px solid var(--border-primary)'};
  padding: 0.875rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${p => p.$primary ? '0 10px 20px -5px rgba(59, 130, 246, 0.4)' : 'none'};
    background: ${p => p.$primary ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--bg-hover)'};
  }

  @media (max-width: 480px) {
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    width: 100%;
    justify-content: center;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 1.5rem;
`;

const RoomCard = styled.div`
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 20px;
  padding: 1.5rem;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-4px);
    background: var(--bg-hover);
    border-color: rgba(59, 130, 246, 0.3);
    box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
  }
`;

const RoomDescription = styled.div`
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.4;
  border-top: 1px solid var(--border-primary);
  padding-top: 0.5rem;
  margin-top: 0.25rem;
  word-break: break-word;
  overflow-wrap: break-word;
  max-height: 4.2em;
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-primary);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
`;

const RoomHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
`;

const RoomName = styled.h3`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  word-break: break-all;
`;
const CopyIcon = styled.button`
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-secondary);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--border-primary);
    color: var(--text-primary);
    transform: scale(1.05);
  }
  
  &:active {
    transform: scale(0.95);
  }
`;

const RoomBadge = styled.span<{ $private?: boolean }>`
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-weight: 600;
  background: ${p => p.$private ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'};
  color: ${p => p.$private ? '#ef4444' : '#22c55e'};
  border: 1px solid ${p => p.$private ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'};
`;

const RoomStats = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-secondary);
`;

const Stat = styled.span`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  
  svg {
    width: 16px;
    height: 16px;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(var(--bg-primary-rgb, 15, 23, 42), 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const ModalContent = styled.div`
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  border-radius: 24px;
  padding: 2.5rem;
  width: 100%;
  max-width: 460px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: ${float} 0.5s ease-out;

  @media (max-width: 480px) {
    padding: 1.5rem;
    border-radius: 20px;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-secondary);
  color: var(--text-primary);
  padding: 0.875rem 1rem;
  border-radius: 12px;
  font-size: 1rem;
  transition: all 0.2s;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 0.95rem;
  user-select: none;
`;

const ErrorMessageContainer = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 12px;
  background: var(--error-bg, rgba(239, 68, 68, 0.08));
  border: 1px solid var(--error-border, rgba(239, 68, 68, 0.2));
  color: var(--error-text, #ef4444);
  font-size: 0.9rem;
  font-weight: 500;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  animation: ${fadeInUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.05);

  svg {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 0.1rem;
  }
`;

import { PasswordStrengthIndicator } from './components/PasswordStrengthIndicator';

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const PasswordToggle = styled.button`
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.4rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  
  &:hover {
    color: var(--text-primary);
  }
  
  svg {
    width: 18px;
    height: 18px;
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Orb = styled.div<{ $color: string; $size: string; $top: string; $left: string }>`
  position: fixed;
  width: ${p => p.$size};
  height: ${p => p.$size};
  background: ${p => p.$color};
  border-radius: 50%;
  top: ${p => p.$top};
  left: ${p => p.$left};
  filter: blur(120px);
  opacity: 0.1;
  pointer-events: none;
  z-index: 1;
`;

interface Room {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  onlineCount?: number;
  totalMessages?: number;
}

const getSavedState = () => {
  try {
    const saved = sessionStorage.getItem('pulse_rooms_state');
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
};

const Rooms: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const initialState = React.useMemo(getSavedState, []);
  
  const [rooms, setRooms] = useState<Room[]>(initialState?.rooms || []);
  const [loading, setLoading] = useState(!initialState);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [description, setDescription] = useState('');
  const [customId, setCustomId] = useState('');
  const [idAvailable, setIdAvailable] = useState<boolean | null>(null);
  const [checkingId, setCheckingId] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [searchQuery, setSearchQuery] = useState(initialState?.searchQuery || '');
  const [showJoinPassword, setShowJoinPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinUsername, setJoinUsername] = useState(() => localStorage.getItem('pulseUsername') || '');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [showJoinModalPw, setShowJoinModalPw] = useState(false);
  const [joinModalError, setJoinModalError] = useState('');

  const [page, setPage] = useState(initialState?.page || 1);
  const [hasMore, setHasMore] = useState(initialState?.hasMore || false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const saveStateBeforeNavigating = () => {
    sessionStorage.setItem('pulse_rooms_state', JSON.stringify({
      rooms,
      page,
      hasMore,
      searchQuery,
      scrollY: window.scrollY
    }));
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA') return;

      const form = e.currentTarget;
      const inputs = Array.from(form.querySelectorAll('input:not([type="checkbox"]), textarea, button[type="submit"]')) as HTMLElement[];
      const index = inputs.indexOf(target);

      const submitButton = inputs.find(el => el.tagName === 'BUTTON' && (el as HTMLButtonElement).type === 'submit');
      const submitIndex = inputs.indexOf(submitButton || inputs[inputs.length - 1]);

      if (index > -1 && index < submitIndex - 1) {
        e.preventDefault();
        inputs[index + 1].focus();
      }
    }
  };

  const isInitialMountForScroll = React.useRef(true);

  useEffect(() => {
    if (isInitialMountForScroll.current && initialState) {
      isInitialMountForScroll.current = false;
      setTimeout(() => {
        window.scrollTo(0, initialState.scrollY || 0);
      }, 50);
      sessionStorage.removeItem('pulse_rooms_state');
    }
  }, [initialState]);

  // Use a separate ref for the search/fetch effect so we don't clobber state
  const isInitialMountForFetch = React.useRef(true);

  useEffect(() => {
    const trimmedId = customId.trim();
    if (!trimmedId) {
      setIdAvailable(null);
      setCheckingId(false);
      return;
    }
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(trimmedId)) {
      setIdAvailable(false);
      setCheckingId(false);
      return;
    }
    setCheckingId(true);
    const delay = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/api/rooms/check-id?id=${encodeURIComponent(customId.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setIdAvailable(data.available);
        } else {
          setIdAvailable(null);
        }
      } catch {
        setIdAvailable(null);
      } finally {
        setCheckingId(false);
      }
    }, 1000);
    return () => clearTimeout(delay);
  }, [customId]);

  const fetchRooms = async (pageNumber = 1) => {
    try {
      if (pageNumber === 1) setLoading(true);
      else setIsLoadingMore(true);

      const res = await fetch(`${apiBase}/api/rooms?page=${pageNumber}`);
      if (res.ok) {
        const data = await res.json();
        const newRooms = Array.isArray(data) ? data : (data.rooms || []);
        const more = data.hasMore || false;

        if (pageNumber === 1) {
          setRooms(newRooms);
        } else {
          setRooms(prev => [...prev, ...newRooms]);
        }
        setHasMore(more);
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (isInitialMountForFetch.current) {
      isInitialMountForFetch.current = false;
      if (initialState) return; // Skip fetching on mount if we restored from state
    }
    if (!searchQuery.trim()) {
      setPage(1);
      fetchRooms(1);
      return;
    }
    const delay = setTimeout(async () => {
      setLoading(true);
      setPage(1);
      try {
        const res = await fetch(`${apiBase}/api/rooms/search?q=${encodeURIComponent(searchQuery.trim())}&page=1`);
        if (res.ok) {
          const data = await res.json();
          const newRooms = Array.isArray(data) ? data : (data.rooms || []);
          const more = data.hasMore || false;
          setRooms(newRooms);
          setHasMore(more);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  const loadMore = async () => {
    const nextPage = page + 1;
    setPage(nextPage);

    if (searchQuery.trim()) {
      setIsLoadingMore(true);
      try {
        const res = await fetch(`${apiBase}/api/rooms/search?q=${encodeURIComponent(searchQuery.trim())}&page=${nextPage}`);
        if (res.ok) {
          const data = await res.json();
          const newRooms = Array.isArray(data) ? data : (data.rooms || []);
          const more = data.hasMore || false;
          setRooms(prev => [...prev, ...newRooms]);
          setHasMore(more);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsLoadingMore(false);
      }
    } else {
      fetchRooms(nextPage);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return setFormError('Room Name is required');
    if (!customId.trim()) return setFormError('Room ID is required');
    if (idAvailable === false) return setFormError('Please choose an available Room ID');

    if (adminPassword.length < 6) return setFormError('Admin Password must be at least 6 characters');
    if (isPrivate && joinPassword && joinPassword.length < 6) return setFormError('Join Password must be at least 6 characters');

    setFormError('');

    try {
      const res = await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName,
          description: description.trim() || undefined,
          customId: customId.trim() || undefined,
          isPrivate,
          joinPassword: joinPassword || undefined,
          adminPassword
        })
      });

      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        saveStateBeforeNavigating();
        navigate(`/room/${data.room.id}`);
      } else {
        setFormError(data.error || 'Failed to create room.');
      }
    } catch (err) {
      setFormError('Network error while creating room.');
    }
  };

  const [isJoining, setIsJoining] = useState(false);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinModalError('');

    if (!joinRoomId.trim()) {
      setJoinModalError('Room ID is required.');
      return;
    }
    if (!joinUsername.trim()) {
      setJoinModalError('Username is required.');
      return;
    }

    setIsJoining(true);
    try {
      const res = await fetch(`${apiBase}/api/rooms/verify-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: joinRoomId.trim(), password: joinPasswordInput })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setJoinModalError(data.error || 'Failed to verify room.');
        setIsJoining(false);
        return;
      }
    } catch (err) {
      setJoinModalError('Network error while checking room.');
      setIsJoining(false);
      return;
    }

    setIsJoining(false);
    localStorage.setItem('pulseUsername', joinUsername.trim());
    setIsJoinModalOpen(false);
    saveStateBeforeNavigating();
    navigate(`/room/${joinRoomId.trim()}`, {
      state: {
        autoJoin: true,
        username: joinUsername.trim(),
        password: joinPasswordInput
      }
    });
  };

  return (
    <>
      <GlobalRoomsStyle />
      <ThemeToggle onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </ThemeToggle>
      <Orb $color="#3b82f6" $size="500px" $top="-10%" $left="-10%" />
      <Orb $color="#ec4899" $size="400px" $top="60%" $left="80%" />

      <PageContainer>
        <Header>
          <div>
            <Title>Explore Rooms</Title>
            <Subtitle>Join a public lounge or create your own secure space.</Subtitle>
          </div>
          <HeaderActions>
            <Button onClick={() => navigate('/room/global')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Global Chat
            </Button>
            <Button onClick={() => setIsJoinModalOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Join Room
            </Button>
            <Button $primary onClick={() => setIsModalOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Room
            </Button>
          </HeaderActions>
        </Header>

        <div style={{ marginBottom: '2rem' }}>
          <InputWrapper style={{ width: '100%', maxWidth: '500px' }}>
            <Input
              type="text"
              placeholder="Search public rooms by ID or Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
            {searchQuery && (
              <ClearButton onClick={() => setSearchQuery('')} aria-label="Clear search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </ClearButton>
            )}
          </InputWrapper>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading rooms...</p>
        ) : (
          <Grid>
            {rooms.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>
                {searchQuery.trim() ? `No rooms found matching "${searchQuery}".` : 'No public rooms available. Create the first one!'}
              </p>
            ) : (
              rooms.map(room => (
                <RoomCard key={room.id}>
                  <RoomHeader>
                    <RoomName>
                      {room.isPrivate ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="2" y1="12" x2="22" y2="12"></line>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                      )}
                      {room.name}
                    </RoomName>
                    <RoomBadge $private={room.isPrivate}>{room.isPrivate ? 'Private' : 'Public'}</RoomBadge>
                  </RoomHeader>

                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '0.5rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', minWidth: 0 }}>
                      <span style={{ flexShrink: 0 }}>Room ID:</span>
                      <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={room.id}>
                        {room.id}
                      </code>
                      <CopyIcon 
                        title="Copy Room ID" 
                        onClick={(e) => handleCopyId(e, room.id)}
                      >
                        {copiedId === room.id ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                      </CopyIcon>
                    </div>
                    {room.description && (
                      <RoomDescription>
                        {room.description}
                      </RoomDescription>
                    )}
                  </div>

                  <RoomStats>
                    <Stat>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                      {room.onlineCount || 0} Online
                    </Stat>
                    <div style={{ marginLeft: 'auto' }}>
                      <Button style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => { saveStateBeforeNavigating(); navigate(`/room/${room.id}`); }}>
                        Join
                      </Button>
                    </div>
                  </RoomStats>
                </RoomCard>
              ))
            )}
          </Grid>
        )}

        {!loading && hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
            <Button onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </PageContainer>

      {isModalOpen && (
        <ModalOverlay onClick={() => setIsModalOpen(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 800 }}>Create New Room</h2>
            <form onSubmit={handleCreateRoom} onKeyDown={handleFormKeyDown}>
              <FormGroup>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <Label style={{ margin: 0 }}>Room Name</Label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{roomName.length}/50</span>
                </div>
                <Input
                  type="text"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="e.g. Developer Lounge"
                  maxLength={50}
                  autoFocus={!window.matchMedia('(pointer: coarse)').matches}
                />
              </FormGroup>

              <FormGroup>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <Label style={{ margin: 0 }}>Description (Optional)</Label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{description.length}/150</span>
                </div>
                <Input
                  as="textarea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What is this room about?"
                  style={{ minHeight: '150px', resize: 'none' }}
                  maxLength={150}
                />
              </FormGroup>

              <FormGroup>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <Label style={{ margin: 0 }}>Room ID</Label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{customId.length}/30</span>
                </div>
                <InputWrapper>
                  <Input
                    type="text"
                    value={customId}
                    onChange={e => setCustomId(e.target.value.replace(/[^a-zA-Z0-9._]/g, ''))}
                    placeholder="e.g. dev_lounge (alphanumeric, dots, underscores)"
                    maxLength={30}
                  />
                </InputWrapper>
                {customId && (
                  <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: checkingId ? 'var(--text-secondary)' : idAvailable ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {checkingId ? 'Checking availability...' : idAvailable ? '✓ ID is available' : '✗ ID is taken'}
                  </div>
                )}
              </FormGroup>

              <FormGroup>
                <CheckboxLabel>
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={e => setIsPrivate(e.target.checked)}
                    style={{ width: '1.25rem', height: '1.25rem', accentColor: '#3b82f6' }}
                  />
                  Private Room (Hidden from public list)
                </CheckboxLabel>
              </FormGroup>

              {isPrivate && (
                <FormGroup>
                  <Label>Join Password (Optional)</Label>
                  <InputWrapper>
                    <Input
                      type={showJoinPassword ? "text" : "password"}
                      value={joinPassword}
                      onChange={e => setJoinPassword(e.target.value)}
                      placeholder="Enter password for users to join"
                      style={{ paddingRight: '2.5rem' }}
                    />
                    <PasswordToggle type="button" onClick={() => setShowJoinPassword(!showJoinPassword)} aria-label="Toggle password visibility">
                      {showJoinPassword ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </PasswordToggle>
                  </InputWrapper>
                  <PasswordStrengthIndicator password={joinPassword} />
                </FormGroup>
              )}

              <FormGroup>
                <Label>Admin Password</Label>
                <InputWrapper>
                  <Input
                    type={showAdminPassword ? "text" : "password"}
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    placeholder="Password for room moderation"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <PasswordToggle type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} aria-label="Toggle password visibility">
                    {showAdminPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </PasswordToggle>
                </InputWrapper>
                <PasswordStrengthIndicator password={adminPassword} />
              </FormGroup>

              {formError && (
                <ErrorMessageContainer>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{formError}</span>
                </ErrorMessageContainer>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <Button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </Button>
                <Button $primary type="submit" style={{ flex: 1, justifyContent: 'center' }}>
                  Create Room
                </Button>
              </div>
            </form>
          </ModalContent>
        </ModalOverlay>
      )}

      {isJoinModalOpen && (
        <ModalOverlay onClick={() => setIsJoinModalOpen(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 800 }}>Join Room</h2>
            <form onSubmit={handleJoinSubmit} onKeyDown={handleFormKeyDown}>
              <FormGroup>
                <Label>Room ID</Label>
                <Input
                  type="text"
                  value={joinRoomId}
                  onChange={e => {
                    let val = e.target.value;
                    if (val.includes('/room/')) {
                      val = val.split('/room/').pop() || val;
                    }
                    setJoinRoomId(val.replace(/[^a-zA-Z0-9._]/g, ''));
                  }}
                  placeholder="e.g. dev_lounge or full link"
                  autoFocus={!window.matchMedia('(pointer: coarse)').matches}
                />
              </FormGroup>

              <FormGroup>
                <Label>Username</Label>
                <Input
                  type="text"
                  value={joinUsername}
                  onChange={e => setJoinUsername(e.target.value)}
                  placeholder="Enter your username"
                  maxLength={30}
                />
              </FormGroup>

              <FormGroup>
                <Label>Password (if any)</Label>
                <InputWrapper>
                  <Input
                    type={showJoinModalPw ? "text" : "password"}
                    value={joinPasswordInput}
                    onChange={e => setJoinPasswordInput(e.target.value)}
                    placeholder="Enter password if required"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <PasswordToggle type="button" onClick={() => setShowJoinModalPw(!showJoinModalPw)} aria-label="Toggle password visibility">
                    {showJoinModalPw ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </PasswordToggle>
                </InputWrapper>
              </FormGroup>

              {joinModalError && (
                <ErrorMessageContainer>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{joinModalError}</span>
                </ErrorMessageContainer>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <Button type="button" onClick={() => setIsJoinModalOpen(false)} style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </Button>
                <Button $primary type="submit" disabled={isJoining} style={{ flex: 1, justifyContent: 'center', opacity: isJoining ? 0.7 : 1 }}>
                  {isJoining ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                      </svg>
                      Verifying...
                    </>
                  ) : (
                    'Join Room'
                  )}
                </Button>
              </div>
            </form>
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
};

export default Rooms;
