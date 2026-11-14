import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../ThemeContext';
import { resolveApiBaseUrl } from '../../chat/utils';
import { extractRoomIdFromInput } from '../../rooms/utils';

export const useHomeController = () => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminRoomId, setAdminRoomId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const adminPasswordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    setMounted(true);
  }, []);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoomInput = extractRoomIdFromInput(adminRoomId);
    if (!cleanRoomInput && !adminPassword.trim()) {
      setAdminError('Both Room ID and Admin Password are required.');
      return;
    }
    if (!cleanRoomInput) {
      setAdminError('Please enter the Room ID.');
      return;
    }
    if (!adminPassword.trim()) {
      setAdminError('Please enter the Admin Password.');
      return;
    }

    setIsAdminLoading(true);
    setAdminError('');

    try {
      const apiBase = resolveApiBaseUrl();
      const lowerInput = cleanRoomInput.toLowerCase();
      let targetRoomId = lowerInput === 'me'
        ? 'me'
        : lowerInput === 'global'
        ? 'global'
        : cleanRoomInput;

      // Check if room metadata can resolve the canonical room ID case-insensitively
      try {
        const metaRes = await fetch(`${apiBase}/api/rooms/${encodeURIComponent(cleanRoomInput)}/meta`);
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          if (metaData && metaData.id) {
            targetRoomId = metaData.id;
          }
        }
      } catch (_) {
        // Fallback to targetRoomId
      }

      const trimmedPassword = adminPassword.trim();
      const passwordAttempts = (trimmedPassword && trimmedPassword !== adminPassword)
        ? [adminPassword, trimmedPassword]
        : [adminPassword];

      let isValid = false;
      let statusError = '';

      for (const candidate of passwordAttempts) {
        const authHeaders = { 'x-admin-password': candidate, 'x-room-id': targetRoomId };
        const usersRes = await fetch(`${apiBase}/api/admin/users`, { headers: authHeaders });

        if (usersRes.ok) {
          isValid = true;
          break;
        } else if (usersRes.status !== 401) {
          statusError = `Login service unavailable (${usersRes.status}). Please try again.`;
        }
      }

      if (isValid) {
        navigate(`/admin/${targetRoomId}`, { state: { autoLoginPassword: adminPassword } });
      } else {
        setAdminError(statusError || 'Room ID or password is incorrect.');
      }
    } catch {
      setAdminError('Network error. Please check your connection.');
    } finally {
      setIsAdminLoading(false);
    }
  };

  return {
    navigate,
    isDark,
    toggleTheme,
    mounted,
    isAdminModalOpen,
    setIsAdminModalOpen,
    adminRoomId,
    setAdminRoomId,
    adminPassword,
    setAdminPassword,
    isPasswordVisible,
    setIsPasswordVisible,
    adminError,
    setAdminError,
    isAdminLoading,
    adminPasswordInputRef,
    handleAdminSubmit
  };
};

export type HomeController = ReturnType<typeof useHomeController>;
