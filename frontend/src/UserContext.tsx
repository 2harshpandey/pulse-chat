import React, { createContext, useState, ReactNode } from 'react';
import { clearCachedMediaForUser } from './mediaCache';

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
    const userId = localStorage.getItem('pulseUserId');
    const username = localStorage.getItem('pulseUsername');
    const roomId = localStorage.getItem('pulseRoomId') || undefined;
    if (userId && username) {
      return { userId, username, roomId };
    }
  }
  return null;
};

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);

  const login = (userProfile: UserProfile) => {
    localStorage.setItem('pulseUserId', userProfile.userId);
    localStorage.setItem('pulseUsername', userProfile.username);
    setProfile(userProfile);
  };

  const logout = () => {
    const userId = localStorage.getItem('pulseUserId') || '';
    if (userId) {
      void clearCachedMediaForUser(userId);
    }
    localStorage.removeItem('pulseUsername');
    localStorage.removeItem('pulseRoomId');
    sessionStorage.removeItem('chatCleared'); // Reset the chat clear flag on logout
    setProfile(null);
  };

  return (
    <UserContext.Provider value={{ profile, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};