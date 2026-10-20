import React, { createContext, useState, ReactNode } from 'react';
import { clearCachedMediaForUser } from './mediaCache';
import { getCookie, setCookie, deleteCookie } from './chat/utils';

// This interface is now exported and includes all necessary fields
export interface UserProfile {
  userId: string;
  username: string;
  roomId?: string;
  isTyping?: boolean; // Added for the typing indicator
  activity?: 'typing' | 'gif_selecting';
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
        setCookie('pulseUserId', userId, 365);
        setCookie('pulseUsername', username, 365);
        if (roomId) setCookie('pulseRoomId', roomId, 365);
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
      setCookie('pulseUserId', userProfile.userId, 365);
      setCookie('pulseUsername', userProfile.username, 365);
      if (userProfile.roomId) {
        setCookie('pulseRoomId', userProfile.roomId, 365);
      }
    } catch (_) {}
    setProfile(userProfile);
  };

  const logout = () => {
    const userId = localStorage.getItem('pulseUserId') || getCookie('pulseUserId') || '';
    if (userId) {
      void clearCachedMediaForUser(userId);
    }
    try {
      localStorage.removeItem('pulseUsername');
      localStorage.removeItem('pulseRoomId');
      sessionStorage.removeItem('chatCleared'); // Reset the chat clear flag on logout
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