import React, { useEffect, useState } from 'react';
import styled, { keyframes, createGlobalStyle } from 'styled-components';
import { useNavigate } from 'react-router-dom';

import { resolveApiBaseUrl } from './chat/utils';

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
    background-color: #0f172a;
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #f8fafc;
  }
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

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 800;
  margin: 0 0 0.5rem;
  background: linear-gradient(135deg, #f8fafc, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const Subtitle = styled.p`
  margin: 0;
  color: #64748b;
  font-size: 1.1rem;
`;

const Button = styled.button<{ $primary?: boolean }>`
  background: ${p => p.$primary ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'rgba(30, 41, 59, 0.8)'};
  color: white;
  border: ${p => p.$primary ? 'none' : '1px solid rgba(255,255,255,0.1)'};
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
    background: ${p => p.$primary ? '' : 'rgba(51, 65, 85, 0.8)'};
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
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  padding: 1.5rem;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-4px);
    background: rgba(30, 41, 59, 0.8);
    border-color: rgba(59, 130, 246, 0.3);
    box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
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
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
  border-top: 1px solid rgba(255, 255, 255, 0.05);
`;

const Stat = styled.span`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.875rem;
  color: #94a3b8;
  
  svg {
    width: 16px;
    height: 16px;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const ModalContent = styled.div`
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  color: #cbd5e1;
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
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
  color: #f1f5f9;
  font-size: 0.95rem;
  user-select: none;
`;

const ErrorText = styled.p`
  color: #ef4444;
  font-size: 0.875rem;
  margin-top: 0.5rem;
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
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  
  &:hover {
    color: #f8fafc;
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
  color: #94a3b8;
  padding: 0.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;

  &:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.1);
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

const Rooms: React.FC = () => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showJoinPassword, setShowJoinPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinUsername, setJoinUsername] = useState(() => localStorage.getItem('pulseUsername') || '');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [showJoinModalPw, setShowJoinModalPw] = useState(false);
  const [joinModalError, setJoinModalError] = useState('');

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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

  useEffect(() => {
    fetchRooms(1);
  }, []);

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
        navigate(`/room/${data.room.id}`);
      } else {
        setFormError(data.error || 'Failed to create room.');
      }
    } catch (err) {
      setFormError('Network error while creating room.');
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
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

    localStorage.setItem('pulseUsername', joinUsername.trim());
    setIsJoinModalOpen(false);
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
      <Orb $color="#3b82f6" $size="500px" $top="-10%" $left="-10%" />
      <Orb $color="#ec4899" $size="400px" $top="60%" $left="80%" />

      <PageContainer>
        <Header>
          <div>
            <Title>Explore Rooms</Title>
            <Subtitle>Join a public lounge or create your own secure space.</Subtitle>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
          </div>
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
          <p style={{ color: '#94a3b8' }}>Loading rooms...</p>
        ) : (
          <Grid>
            {rooms.length === 0 ? (
              <p style={{ color: '#94a3b8', gridColumn: '1 / -1' }}>
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

                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div>Room ID: <code>{room.id}</code></div>
                    {room.description && (
                      <div style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.4, borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                        {room.description}
                      </div>
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
                      <Button style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => navigate(`/room/${room.id}`)}>
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
                <Label>Room Name</Label>
                <Input
                  type="text"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="e.g. Developer Lounge"
                  autoFocus={!window.matchMedia('(pointer: coarse)').matches}
                />
              </FormGroup>

              <FormGroup>
                <Label>Description (Optional)</Label>
                <Input
                  as="textarea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What is this room about?"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                />
              </FormGroup>

              <FormGroup>
                <Label>Room ID</Label>
                <InputWrapper>
                  <Input
                    type="text"
                    value={customId}
                    onChange={e => setCustomId(e.target.value.replace(/[^a-zA-Z0-9._]/g, ''))}
                    placeholder="e.g. dev_lounge (alphanumeric, dots, underscores)"
                  />
                </InputWrapper>
                {customId && (
                  <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: checkingId ? '#94a3b8' : idAvailable ? '#22c55e' : '#ef4444' }}>
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

              {formError && <ErrorText>{formError}</ErrorText>}

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

              {joinModalError && <ErrorText>{joinModalError}</ErrorText>}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <Button type="button" onClick={() => setIsJoinModalOpen(false)} style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </Button>
                <Button $primary type="submit" style={{ flex: 1, justifyContent: 'center' }}>
                  Join Room
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
