import React, { createContext, useState, ReactNode } from 'react';

// This interface is now exported and includes all necessary fields
export interface UserProfile {
  userId: string;
  username: string;
  isTyping?: boolean; // Added for the typing indicator
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
    if (userId && username) {
      return { userId, username };
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
    localStorage.removeItem('pulseUserId');
    localStorage.removeItem('pulseUsername');
    setProfile(null);
  };

  return (
    <UserContext.Provider value={{ profile, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};