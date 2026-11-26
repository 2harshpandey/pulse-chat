import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRoomsController } from './rooms/hooks';
import { useDocumentTitle } from './pageTitle';
import { REPO_URL, getPublicSeoConfig, useRouteSeo } from './seo';
import {
  GlobalRoomsStyle,
  TopControls,
  NavCircleButton,
  Orb,
  PageContainer,
  InputWrapper,
  Input,
  ClearButton,
  Grid,
  Button,
  RoomsGuideSection,
  RoomsGuideGrid,
  RoomsGuideCard,
  RoomsFooter,
} from './rooms/RoomsStyledComponents';
import {
  RoomsHeader,
  RoomCardItem,
  CreateRoomModal,
  JoinRoomModal
} from './rooms/components';

const Rooms: React.FC = () => {
  const {
    isDark,
    toggleTheme,
    navigate,
    navigateToRoom,
    rooms,
    loading,
    searchQuery,
    setSearchQuery,
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
  } = useRoomsController();

  const roomsSeo = useMemo(() => getPublicSeoConfig('rooms'), []);
  useDocumentTitle(roomsSeo.title);
  useRouteSeo(roomsSeo);

  return (
    <>
      <GlobalRoomsStyle />
      <TopControls as="nav" aria-label="Room directory controls">
        <NavCircleButton
          as="a"
          href="/"
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            navigate('/');
          }}
          title="Back to PulseChat Home"
          aria-label="Back to Home"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </NavCircleButton>
        <NavCircleButton type="button" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          )}
        </NavCircleButton>
      </TopControls>
      <Orb $color="var(--orb-primary)" $size="500px" $top="-10%" $left="-10%" />
      <Orb $color="var(--orb-accent)" $size="450px" $top="55%" $left="75%" />

      <PageContainer>
        <RoomsHeader
          onNavigateGlobal={() => navigate('/room/global')}
          onOpenJoinModal={() => setIsJoinModalOpen(true)}
          onOpenCreateModal={() => setIsModalOpen(true)}
        />

        <div style={{ marginBottom: '2rem' }}>
          <InputWrapper style={{ width: '100%', maxWidth: '500px' }}>
            <Input
              id="room-search-input"
              name="roomSearch"
              type="text"
              placeholder="Search public rooms by ID or Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
              aria-label="Search public rooms by ID or Name"
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
                <RoomCardItem
                  key={room.id}
                  room={room}
                  copiedId={copiedId}
                  onCopyId={handleCopyId}
                  onJoin={navigateToRoom}
                />
              ))
            )}
          </Grid>
        )}

        {!loading && hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
            <Button type="button" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}

        <RoomsGuideSection aria-labelledby="room-guide-heading">
          <h2 id="room-guide-heading">How PulseChat Rooms Work</h2>
          <p>
            Join open community conversations in seconds or spin up an isolated room with custom IDs, passwords, and moderation controls.
          </p>
          <RoomsGuideGrid>
            <RoomsGuideCard>
              <h3>Open Public Lounges</h3>
              <p>
                Jump directly into <Link to="/room/global" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Global Chat</Link> or any listed public room with just a display name, with no account registration required.
              </p>
            </RoomsGuideCard>
            <RoomsGuideCard>
              <h3>Password-Protected Spaces</h3>
              <p>
                Lock custom rooms with a join password and a separate admin password to control access, manage participants, and curate pinned announcements.
              </p>
            </RoomsGuideCard>
            <RoomsGuideCard>
              <h3>Temporary Invite Links</h3>
              <p>
                Share time-limited invite URLs from any room&apos;s admin dashboard so guests can enter immediately without exposing your main room password.
              </p>
            </RoomsGuideCard>
          </RoomsGuideGrid>
        </RoomsGuideSection>

        <RoomsFooter>
          <span>PulseChat Directory</span>
          <nav aria-label="Footer navigation">
            <Link to="/">PulseChat Home</Link>
            <Link to="/room/global">Global Chat</Link>
            <Link to="/about-developer">About Developer</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
        </RoomsFooter>
      </PageContainer>

      <CreateRoomModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateRoom}
        onKeyDown={handleFormKeyDown}
        roomName={roomName}
        setRoomName={setRoomName}
        description={description}
        setDescription={setDescription}
        customId={customId}
        setCustomId={setCustomId}
        checkingId={checkingId}
        idAvailable={idAvailable}
        isPrivate={isPrivate}
        setIsPrivate={setIsPrivate}
        joinPassword={joinPassword}
        setJoinPassword={setJoinPassword}
        adminPassword={adminPassword}
        setAdminPassword={setAdminPassword}
        showJoinPassword={showJoinPassword}
        setShowJoinPassword={setShowJoinPassword}
        showAdminPassword={showAdminPassword}
        setShowAdminPassword={setShowAdminPassword}
        formError={formError}
      />

      <JoinRoomModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSubmit={handleJoinSubmit}
        onKeyDown={handleFormKeyDown}
        joinRoomId={joinRoomId}
        setJoinRoomId={setJoinRoomId}
        joinUsername={joinUsername}
        setJoinUsername={setJoinUsername}
        joinPasswordInput={joinPasswordInput}
        setJoinPasswordInput={setJoinPasswordInput}
        showJoinModalPw={showJoinModalPw}
        setShowJoinModalPw={setShowJoinModalPw}
        joinModalError={joinModalError}
        isJoining={isJoining}
      />
    </>
  );
};

export default Rooms;
