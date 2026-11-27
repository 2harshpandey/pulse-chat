import React, { useState, useRef, useEffect } from 'react';

interface UseAdminRoomSettingsOptions {
  apiUrl: string;
  apiHeaders: () => Record<string, string>;
  passwordRef: React.MutableRefObject<string>;
  navigate: (to: string, options?: any) => void;
  isImpersonating?: boolean;
  onAliasUpdated?: (newAlias: string) => void;
}

export function useAdminRoomSettings({
  apiUrl,
  apiHeaders,
  passwordRef,
  navigate,
  isImpersonating = false,
  onAliasUpdated,
}: UseAdminRoomSettingsOptions) {
  const [roomSettingsName, setRoomSettingsName] = useState('');
  const [roomSettingsDesc, setRoomSettingsDesc] = useState('');
  const [roomSettingsNewId, setRoomSettingsNewId] = useState('');
  const [roomSettingsAlias, setRoomSettingsAlias] = useState('');
  const [roomSettingsLastIdChange, setRoomSettingsLastIdChange] = useState<string | null>(null);

  const [detailsSaving, setDetailsSaving] = useState(false);
  const [roomIdSaving, setRoomIdSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [detailsSuccess, setDetailsSuccess] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const [roomIdSuccess, setRoomIdSuccess] = useState('');
  const [roomIdError, setRoomIdError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [roomSettingsCurrentPassword, setRoomSettingsCurrentPassword] = useState('');
  const [roomSettingsNewPassword, setRoomSettingsNewPassword] = useState('');
  const [roomSettingsConfirmPassword, setRoomSettingsConfirmPassword] = useState('');
  const [roomSettingsHasJoinPassword, setRoomSettingsHasJoinPassword] = useState(false);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const roomSettingsLoading = detailsSaving || roomIdSaving || passwordSaving;

  const handleDeleteRoom = async () => {
    const enteredPassword = prompt('Re-enter admin password to confirm:');
    if (enteredPassword !== passwordRef.current) {
      alert('Incorrect password.');
      return;
    }
    if (
      window.confirm(
        'ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete this chat room, all its messages, and disconnect all users. THIS ACTION CANNOT BE UNDONE.'
      )
    ) {
      try {
        const res = await fetch(`${apiUrl}/api/admin/room`, { method: 'DELETE', headers: apiHeaders() });
        if (res.ok) {
          alert('Room successfully deleted.');
          navigate('/room', { replace: true });
        } else {
          const data = await res.json();
          alert(`Failed to delete room: ${data.error || 'Unknown error'}`);
        }
      } catch (err) {
        console.error('Failed to delete room', err);
      }
    }
  };

  const handleSaveRoomDetails = async () => {
    setDetailsError('');
    setDetailsSuccess('');

    if (!roomSettingsName.trim()) {
      setDetailsError('Room name cannot be empty.');
      return;
    }

    setDetailsSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/details`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ name: roomSettingsName.trim(), description: roomSettingsDesc }),
      });
      const data = await res.json();
      if (res.ok) {
        if (typeof data.name === 'string') setRoomSettingsName(data.name);
        if (typeof data.description === 'string') setRoomSettingsDesc(data.description);
        setDetailsSuccess('Room details updated successfully.');
      } else {
        setDetailsError(data.error || 'Failed to update details.');
      }
    } catch {
      setDetailsError('Network error occurred.');
    } finally {
      setDetailsSaving(false);
    }
  };

  const handleChangeJoinPassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (roomSettingsHasJoinPassword && !roomSettingsCurrentPassword) {
      setPasswordError('Please enter your current join password.');
      return;
    }

    if (roomSettingsNewPassword.trim().length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }

    if (roomSettingsHasJoinPassword && roomSettingsNewPassword === roomSettingsCurrentPassword) {
      setPasswordError('New password cannot be the same as the current password.');
      return;
    }

    if (roomSettingsNewPassword !== roomSettingsConfirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/joinPassword`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          currentPassword: roomSettingsHasJoinPassword ? roomSettingsCurrentPassword : '',
          newPassword: roomSettingsNewPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordSuccess(
          roomSettingsHasJoinPassword
            ? 'Join password updated successfully.'
            : 'Join password set. This room is now private and hidden from the public /room directory.'
        );
        setRoomSettingsCurrentPassword('');
        setRoomSettingsNewPassword('');
        setRoomSettingsConfirmPassword('');
        setRoomSettingsHasJoinPassword(true);
      } else {
        setPasswordError(data.error || 'Failed to update join password.');
      }
    } catch {
      setPasswordError('Network error occurred.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleRemoveJoinPassword = async () => {
    if (!window.confirm('Are you sure you want to remove the join password? The room will become public again.')) {
      return;
    }

    setPasswordSaving(true);
    setPasswordError('');
    setPasswordSuccess('');

    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/joinPassword`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordSuccess('Join password removed. The room is now public and listed on /room.');
        setRoomSettingsCurrentPassword('');
        setRoomSettingsNewPassword('');
        setRoomSettingsConfirmPassword('');
        setRoomSettingsHasJoinPassword(false);
      } else {
        setPasswordError(data.error || 'Failed to remove join password.');
      }
    } catch {
      setPasswordError('Network error occurred.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSaveRoomId = async () => {
    setRoomIdError('');
    setRoomIdSuccess('');

    const cleanNewId = roomSettingsNewId.trim();
    if (!cleanNewId || cleanNewId === '.' || cleanNewId === '..' || !/^[a-zA-Z0-9._]{1,30}$/.test(cleanNewId)) {
      setRoomIdError('Room ID must be 1-30 characters using letters, numbers, dots, or underscores.');
      return;
    }

    setRoomIdSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/roomId`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ newRoomId: cleanNewId }),
      });
      const data = await res.json();
      if (res.ok) {
        if (!data.newAlias) {
          setRoomIdSuccess('Room ID is already set to this value.');
          return;
        }
        setRoomIdSuccess('Room ID updated successfully. Redirecting to updated admin URL...');
        setRoomSettingsAlias(data.newAlias);
        setRoomSettingsNewId(data.newAlias);
        setRoomSettingsLastIdChange(data.lastIdChangeAt);
        if (onAliasUpdated) {
          onAliasUpdated(data.newAlias);
        }
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = setTimeout(() => {
          navigate(`/admin/${data.newAlias}`, {
            replace: true,
            state: { autoLoginPassword: passwordRef.current, isImpersonating },
          });
        }, 2500);
      } else {
        setRoomIdError(data.error || 'Failed to update Room ID.');
      }
    } catch {
      setRoomIdError('Network error occurred.');
    } finally {
      setRoomIdSaving(false);
    }
  };

  return {
    roomSettingsName,
    setRoomSettingsName,
    roomSettingsDesc,
    setRoomSettingsDesc,
    roomSettingsNewId,
    setRoomSettingsNewId,
    roomSettingsAlias,
    setRoomSettingsAlias,
    roomSettingsLastIdChange,
    setRoomSettingsLastIdChange,
    roomSettingsLoading,
    detailsSaving,
    roomIdSaving,
    passwordSaving,
    detailsSuccess,
    setDetailsSuccess,
    detailsError,
    setDetailsError,
    roomIdSuccess,
    setRoomIdSuccess,
    roomIdError,
    setRoomIdError,
    passwordSuccess,
    setPasswordSuccess,
    passwordError,
    setPasswordError,
    roomSettingsCurrentPassword,
    setRoomSettingsCurrentPassword,
    roomSettingsNewPassword,
    setRoomSettingsNewPassword,
    roomSettingsConfirmPassword,
    setRoomSettingsConfirmPassword,
    roomSettingsHasJoinPassword,
    setRoomSettingsHasJoinPassword,
    handleDeleteRoom,
    handleSaveRoomDetails,
    handleChangeJoinPassword,
    handleRemoveJoinPassword,
    handleSaveRoomId,
  };
}
