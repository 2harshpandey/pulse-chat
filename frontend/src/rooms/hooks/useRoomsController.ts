import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveApiBaseUrl, copyTextToClipboard } from '../../chat/utils';
import { useTheme } from '../../ThemeContext';
import { Room, RoomsStateSnapshot } from '../types';

const apiBase = resolveApiBaseUrl();

const getSavedState = (): RoomsStateSnapshot | null => {
  try {
    const saved = sessionStorage.getItem('pulse_rooms_state');
    if (saved) return JSON.parse(saved);
  } catch { }
  return null;
};

export const useRoomsController = () => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const initialState = useMemo(getSavedState, []);

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

  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinUsername, setJoinUsername] = useState(() => localStorage.getItem('pulseUsername') || '');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [showJoinModalPw, setShowJoinModalPw] = useState(false);
  const [joinModalError, setJoinModalError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const [page, setPage] = useState(initialState?.page || 1);
  const [hasMore, setHasMore] = useState(initialState?.hasMore || false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const isInitialMountForScroll = useRef(true);
  const isInitialMountForFetch = useRef(true);

  const saveStateBeforeNavigating = () => {
    sessionStorage.setItem('pulse_rooms_state', JSON.stringify({
      rooms,
      page,
      hasMore,
      searchQuery,
      scrollY: window.scrollY
    }));
  };

  const handleCopyId = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyTextToClipboard(id);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
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

  // Restore scroll position if returning from a room
  useEffect(() => {
    if (isInitialMountForScroll.current && initialState) {
      isInitialMountForScroll.current = false;
      setTimeout(() => {
        window.scrollTo(0, initialState.scrollY || 0);
      }, 50);
      sessionStorage.removeItem('pulse_rooms_state');
    }
  }, [initialState]);

  // Debounce check custom room ID availability
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

  // Search or fetch effect
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
    } catch {
      setFormError('Network error while creating room.');
    }
  };

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
    } catch {
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

  const navigateToRoom = (roomId: string) => {
    saveStateBeforeNavigating();
    navigate(`/room/${roomId}`);
  };

  return {
    isDark,
    toggleTheme,
    navigate,
    navigateToRoom,
    rooms,
    loading,
    searchQuery,
    setSearchQuery,
    page,
    hasMore,
    isLoadingMore,
    loadMore,
    copiedId,
    handleCopyId,
    handleFormKeyDown,
    // Create Room Modal
    isModalOpen,
    setIsModalOpen,
    roomName,
    setRoomName,
    description,
    setDescription,
    customId,
    setCustomId,
    idAvailable,
    checkingId,
    isPrivate,
    setIsPrivate,
    joinPassword,
    setJoinPassword,
    adminPassword,
    setAdminPassword,
    showJoinPassword,
    setShowJoinPassword,
    showAdminPassword,
    setShowAdminPassword,
    formError,
    handleCreateRoom,
    // Join Room Modal
    isJoinModalOpen,
    setIsJoinModalOpen,
    joinRoomId,
    setJoinRoomId,
    joinUsername,
    setJoinUsername,
    joinPasswordInput,
    setJoinPasswordInput,
    showJoinModalPw,
    setShowJoinModalPw,
    joinModalError,
    isJoining,
    handleJoinSubmit
  };
};

export type RoomsController = ReturnType<typeof useRoomsController>;
