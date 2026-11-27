import React, { createContext, useState, ReactNode } from 'react';
import { clearCachedMediaForUser } from './mediaCache';
import { getCookie, setCookie, deleteCookie, removeSessionToken, hasAnyRoomSessionToken, setUserIdForRoom } from './chat/utils';
import { clearSavedPWALocation } from './pwaLocation';

export type PresenceActivity =
  | 'typing'
  | 'gif_selecting'
  | 'recording_audio'
  | 'sending_audio'
  | 'sending_photo'
  | 'sending_video'
  | 'sending_file'
  | 'sending_media'
  | 'sending_gif';

// This interface is now exported and includes all necessary fields
export interface UserProfile {
  userId: string;
  username: string;
  roomId?: string;
  isTyping?: boolean; // Added for the typing indicator
  activity?: PresenceActivity;
}

interface UserContextType {
  profile: UserProfile | null;
  login: (profile: UserProfile) => void;
  logout: (roomIdOverride?: string) => void;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

const initialProfile = (): UserProfile | null => {
  if (typeof window !== 'undefined') {
    let userId: string | null = null;
    let username: string | null = null;
    let roomId: string | undefined = undefined;

    try {
      userId = localStorage.getItem('pulseUserId') || getCookie('pulseUserId');
      username = localStorage.getItem('pulseUsername') || getCookie('pulseUsername');
      roomId = localStorage.getItem('pulseRoomId') || getCookie('pulseRoomId') || undefined;
    } catch (_) {}

    if (userId && username) {
      try {
        if (!localStorage.getItem('pulseUserId')) localStorage.setItem('pulseUserId', userId);
        if (!localStorage.getItem('pulseUsername')) localStorage.setItem('pulseUsername', username);
        if (roomId && !localStorage.getItem('pulseRoomId')) localStorage.setItem('pulseRoomId', roomId);
        // Issue 14: Reduce cookie lifetime from 365 to 30 days. SameSite=Strict is set in setCookie.
        setCookie('pulseUserId', userId, 30);
        setCookie('pulseUsername', username, 30);
        if (roomId) setCookie('pulseRoomId', roomId, 30);
      } catch (_) {}
      return { userId, username, roomId };
    }
  }
  return null;
};

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);

  const login = (userProfile: UserProfile) => {
    try {
      setUserIdForRoom(userProfile.userId, userProfile.roomId);
      localStorage.setItem('pulseUsername', userProfile.username);
      if (userProfile.roomId) {
        localStorage.setItem(`pulseUsername_${userProfile.roomId}`, userProfile.username);
        const lowerRoom = userProfile.roomId.toLowerCase();
        if (lowerRoom !== userProfile.roomId) {
          localStorage.setItem(`pulseUsername_${lowerRoom}`, userProfile.username);
        }
        localStorage.setItem('pulseRoomId', userProfile.roomId);
      }
      // Issue 14: 30-day cookies with SameSite=Strict (set in setCookie helper)
      setCookie('pulseUsername', userProfile.username, 30);
      if (userProfile.roomId) {
        setCookie('pulseRoomId', userProfile.roomId, 30);
      }
    } catch (_) {}
    setProfile(userProfile);
  };

  const logout = (roomIdOverride?: string) => {
    const userId = localStorage.getItem('pulseUserId') || getCookie('pulseUserId') || '';
    const currentRoomId = roomIdOverride || profile?.roomId || localStorage.getItem('pulseRoomId') || undefined;
    try {
      removeSessionToken(currentRoomId);
      if (userId && !hasAnyRoomSessionToken()) {
        void clearCachedMediaForUser(userId);
      }
      localStorage.removeItem('pulseUsername');
      localStorage.removeItem('pulseRoomId');
      sessionStorage.removeItem('chatCleared');
      deleteCookie('pulseUsername');
      deleteCookie('pulseRoomId');
      clearSavedPWALocation();
    } catch (_) {}
    setProfile(null);
  };

  return (
    <UserContext.Provider value={{ profile, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};