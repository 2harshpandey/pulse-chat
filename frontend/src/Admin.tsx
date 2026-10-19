import React from 'react';
import {
  AdminContainer,
  HeaderRow,
  Title,
  Badge,
  StatusDot,
  PanelThemeToggle,
  LogoutButton,
  TabContainer,
  TabButton,
  TabContent,
} from './admin/AdminStyledComponents';
import { useAdminController } from './admin/hooks';
import {
  AdminLoginView,
  AdminModals,
  MessagesTab,
  UsersTab,
  ReportsTab,
  AccessLinksTab,
  SecurityTab,
  LiveActivityTab,
  ServerLogsTab,
  AllRoomsTab,
  RoomSettingsTab,
} from './admin/components';

const Admin = () => {
  const admin = useAdminController();

  if (!admin.isAuthenticated) {
    if (admin.location.state?.autoLoginPassword || admin.isLoading) {
      return (
        <AdminContainer style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              color: admin.isDark ? '#f1f5f9' : '#1e293b',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(99,102,241,0.3)',
                borderTopColor: '#6366f1',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p>Authenticating...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </AdminContainer>
      );
    }

    return (
      <AdminLoginView
        isDark={admin.isDark}
        toggleTheme={admin.toggleTheme}
        urlRoomId={admin.urlRoomId}
        roomId={admin.roomId}
        setRoomId={admin.setRoomId}
        password={admin.password}
        setPassword={admin.setPassword}
        passwordFocused={admin.passwordFocused}
        setPasswordFocused={admin.setPasswordFocused}
        isPasswordVisible={admin.isPasswordVisible}
        setIsPasswordVisible={admin.setIsPasswordVisible}
        adminPasswordInputRef={admin.adminPasswordInputRef}
        focusAdminPasswordInput={admin.focusAdminPasswordInput}
        handleKeyDown={admin.handleKeyDown}
        handleLogin={admin.handleLogin}
        isLoading={admin.isLoading}
        error={admin.error}
        setError={admin.setError}
        onNavigateHome={() => admin.navigate('/')}
      />
    );
  }

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
          {admin.lockdownStatus.isActive && (
            <Badge $color="red">
              <StatusDot $color="red" /> Lockdown Active
            </Badge>
          )}
          <PanelThemeToggle
            onClick={admin.toggleTheme}
            title={admin.isDark ? 'Light mode' : 'Dark mode'}
            aria-label={admin.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {admin.isDark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </PanelThemeToggle>
          <LogoutButton onClick={admin.handleLogout}>Logout</LogoutButton>
        </div>
      </HeaderRow>

      <TabContainer>
        <TabButton active={admin.activeTab === 'messages'} onClick={() => admin.setActiveTab('messages')}>
          Message Log
        </TabButton>
        <TabButton active={admin.activeTab === 'users'} onClick={() => admin.setActiveTab('users')}>
          Users
        </TabButton>
        <TabButton active={admin.activeTab === 'reports'} onClick={() => admin.setActiveTab('reports')}>
          Reports
        </TabButton>
        <TabButton active={admin.activeTab === 'access'} onClick={() => admin.setActiveTab('access')}>
          Access Links
        </TabButton>
        <TabButton active={admin.activeTab === 'security'} onClick={() => admin.setActiveTab('security')}>
          Security
        </TabButton>
        {(admin.roomId === 'me' || admin.roomId === 'global') && (
          <>
            <TabButton active={admin.activeTab === 'activity'} onClick={() => admin.setActiveTab('activity')}>
              Live Activity
            </TabButton>
            <TabButton active={admin.activeTab === 'logs'} onClick={() => admin.setActiveTab('logs')}>
              Server Logs
            </TabButton>
            <TabButton active={admin.activeTab === 'rooms'} onClick={() => admin.setActiveTab('rooms')}>
              All Rooms
            </TabButton>
          </>
        )}
        {admin.roomId !== 'me' && admin.roomId !== 'global' && (
          <TabButton active={admin.activeTab === 'settings'} onClick={() => admin.setActiveTab('settings')}>
            Room Settings
          </TabButton>
        )}
      </TabContainer>

      <TabContent>
        {admin.activeTab === 'messages' && <MessagesTab admin={admin} />}
        {admin.activeTab === 'users' && <UsersTab admin={admin} />}
        {admin.activeTab === 'reports' && <ReportsTab admin={admin} />}
        {admin.activeTab === 'access' && <AccessLinksTab admin={admin} />}
        {admin.activeTab === 'security' && <SecurityTab admin={admin} />}
        {(admin.roomId === 'me' || admin.roomId === 'global') && admin.activeTab === 'activity' && (
          <LiveActivityTab admin={admin} />
        )}
        {(admin.roomId === 'me' || admin.roomId === 'global') && admin.activeTab === 'logs' && (
          <ServerLogsTab admin={admin} />
        )}
        {(admin.roomId === 'me' || admin.roomId === 'global') && admin.activeTab === 'rooms' && (
          <AllRoomsTab admin={admin} />
        )}
        {admin.roomId !== 'me' && admin.roomId !== 'global' && admin.activeTab === 'settings' && (
          <RoomSettingsTab admin={admin} />
        )}
      </TabContent>

      <AdminModals
        showPinModal={admin.showPinModal}
        setShowPinModal={admin.setShowPinModal}
        pinDuration={admin.pinDuration}
        setPinDuration={admin.setPinDuration}
        handleConfirmDuration={admin.handleConfirmDuration}
        showReplaceModal={admin.showReplaceModal}
        setShowReplaceModal={admin.setShowReplaceModal}
        submitPin={admin.submitPin}
        showBulkDeleteModal={admin.showBulkDeleteModal}
        setShowBulkDeleteModal={admin.setShowBulkDeleteModal}
        selectedMessageCount={admin.selectedMessages.size}
        bulkDeleteAction={admin.bulkDeleteAction}
        setBulkDeleteAction={admin.setBulkDeleteAction}
        bulkDeleteVanish={admin.bulkDeleteVanish}
        setBulkDeleteVanish={admin.setBulkDeleteVanish}
        handleBulkActionSubmit={admin.handleBulkActionSubmit}
        roomId={admin.roomId}
      />
    </AdminContainer>
  );
};

export default Admin;
