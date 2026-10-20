import React, { useState } from 'react';

interface UseAdminRoomSettingsOptions {
  apiUrl: string;
  apiHeaders: () => Record<string, string>;
  passwordRef: React.MutableRefObject<string>;
  navigate: (to: string, options?: any) => void;
}

export function useAdminRoomSettings({
  apiUrl,
  apiHeaders,
  passwordRef,
  navigate,
}: UseAdminRoomSettingsOptions) {
  const [roomSettingsName, setRoomSettingsName] = useState('');
  const [roomSettingsDesc, setRoomSettingsDesc] = useState('');
  const [roomSettingsNewId, setRoomSettingsNewId] = useState('');
  const [roomSettingsAlias, setRoomSettingsAlias] = useState('');
  const [roomSettingsLastIdChange, setRoomSettingsLastIdChange] = useState<string | null>(null);
  const [roomSettingsLoading, setRoomSettingsLoading] = useState(false);
  const [roomSettingsSuccess, setRoomSettingsSuccess] = useState('');
  const [roomSettingsError, setRoomSettingsError] = useState('');
  const [roomIdSuccess, setRoomIdSuccess] = useState('');
  const [roomIdError, setRoomIdError] = useState('');
  const [roomSettingsCurrentPassword, setRoomSettingsCurrentPassword] = useState('');
  const [roomSettingsNewPassword, setRoomSettingsNewPassword] = useState('');
  const [roomSettingsConfirmPassword, setRoomSettingsConfirmPassword] = useState('');
  const [roomSettingsHasJoinPassword, setRoomSettingsHasJoinPassword] = useState(false);

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
    setRoomSettingsLoading(true);
    setRoomSettingsError('');
    setRoomSettingsSuccess('');
    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/details`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ name: roomSettingsName, description: roomSettingsDesc }),
      });
      const data = await res.json();
      if (res.ok) {
        setRoomSettingsSuccess('Room details updated successfully.');
      } else {
        setRoomSettingsError(data.error || 'Failed to update details.');
      }
    } catch {
      setRoomSettingsError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
  };

  const handleChangeJoinPassword = async () => {
    setRoomSettingsLoading(true);
    setRoomSettingsError('');
    setRoomSettingsSuccess('');

    if (roomSettingsNewPassword.length < 6) {
      setRoomSettingsError('New password must be at least 6 characters.');
      setRoomSettingsLoading(false);
      return;
    }

    if (roomSettingsCurrentPassword && roomSettingsNewPassword === roomSettingsCurrentPassword) {
      setRoomSettingsError('New password cannot be the same as the current password.');
      setRoomSettingsLoading(false);
      return;
    }

    if (roomSettingsNewPassword !== roomSettingsConfirmPassword) {
      setRoomSettingsError('New passwords do not match.');
      setRoomSettingsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/joinPassword`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          currentPassword: roomSettingsCurrentPassword,
          newPassword: roomSettingsNewPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRoomSettingsSuccess('Join password updated successfully.');
        setRoomSettingsCurrentPassword('');
        setRoomSettingsNewPassword('');
        setRoomSettingsConfirmPassword('');
        setRoomSettingsHasJoinPassword(true);
      } else {
        setRoomSettingsError(data.error || 'Failed to update join password.');
      }
    } catch {
      setRoomSettingsError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
  };

  const handleRemoveJoinPassword = async () => {
    if (!window.confirm('Are you sure you want to remove the join password? The room will become public again.')) {
      return;
    }

    setRoomSettingsLoading(true);
    setRoomSettingsError('');
    setRoomSettingsSuccess('');

    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/joinPassword`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setRoomSettingsSuccess('Join password removed successfully. The room is now public.');
        setRoomSettingsCurrentPassword('');
        setRoomSettingsNewPassword('');
        setRoomSettingsConfirmPassword('');
        setRoomSettingsHasJoinPassword(false);
      } else {
        setRoomSettingsError(data.error || 'Failed to remove join password.');
      }
    } catch {
      setRoomSettingsError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
  };

  const handleSaveRoomId = async () => {
    setRoomSettingsLoading(true);
    setRoomIdError('');
    setRoomIdSuccess('');
    try {
      const res = await fetch(`${apiUrl}/api/rooms/admin/roomId`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ newRoomId: roomSettingsNewId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRoomIdSuccess('Room ID updated successfully. You will be redirected...');
        setRoomSettingsAlias(data.newAlias);
        setRoomSettingsLastIdChange(data.lastIdChangeAt);
        setTimeout(() => {
          navigate(`/admin/${data.newAlias}`, { replace: true });
        }, 3000);
      } else {
        setRoomIdError(data.error || 'Failed to update Room ID.');
      }
    } catch {
      setRoomIdError('Network error occurred.');
    }
    setRoomSettingsLoading(false);
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
    setRoomSettingsLoading,
    roomSettingsSuccess,
    setRoomSettingsSuccess,
    roomSettingsError,
    setRoomSettingsError,
    roomIdSuccess,
    setRoomIdSuccess,
    roomIdError,
    setRoomIdError,
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
