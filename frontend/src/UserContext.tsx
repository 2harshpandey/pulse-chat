import React, { createContext, useState, ReactNode } from 'react';
import { clearCachedMediaForUser } from './mediaCache';
import { getCookie, setCookie, deleteCookie, removeSessionToken } from './chat/utils';

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
  logout: () => void;
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
      localStorage.setItem('pulseUserId', userProfile.userId);
      localStorage.setItem('pulseUsername', userProfile.username);
      if (userProfile.roomId) {
        localStorage.setItem('pulseRoomId', userProfile.roomId);
      }
      // Issue 14: 30-day cookies with SameSite=Strict (set in setCookie helper)
      setCookie('pulseUserId', userProfile.userId, 30);
      setCookie('pulseUsername', userProfile.username, 30);
      if (userProfile.roomId) {
        setCookie('pulseRoomId', userProfile.roomId, 30);
      }
    } catch (_) {}
    setProfile(userProfile);
  };

  const logout = () => {
    const userId = localStorage.getItem('pulseUserId') || getCookie('pulseUserId') || '';
    const currentRoomId = profile?.roomId || localStorage.getItem('pulseRoomId') || undefined;
    if (userId) {
      void clearCachedMediaForUser(userId);
    }
    try {
      localStorage.removeItem('pulseUsername');
      localStorage.removeItem('pulseRoomId');
      removeSessionToken(currentRoomId);
      sessionStorage.removeItem('chatCleared');
      deleteCookie('pulseUsername');
      deleteCookie('pulseRoomId');
    } catch (_) {}
    setProfile(null);
  };

  return (
    <UserContext.Provider value={{ profile, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};