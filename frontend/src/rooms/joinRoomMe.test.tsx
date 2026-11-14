import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { JoinRoomModal } from './components/JoinRoomModal';
import { extractRoomIdFromInput } from './utils';

describe('extractRoomIdFromInput helper', () => {
  it('handles casing and formats correctly', () => {
    expect(extractRoomIdFromInput('me')).toBe('me');
    expect(extractRoomIdFromInput('ME')).toBe('me');
    expect(extractRoomIdFromInput('/me')).toBe('me');
    expect(extractRoomIdFromInput('/ME')).toBe('me');
    expect(extractRoomIdFromInput('https://pulsechat.tech/me')).toBe('me');
    expect(extractRoomIdFromInput('https://pulsechat.tech/ME')).toBe('me');
    expect(extractRoomIdFromInput('https://pulsechat.tech/room/me')).toBe('me');
    expect(extractRoomIdFromInput('https://pulsechat.tech/ROOM/me')).toBe('me');
    expect(extractRoomIdFromInput('https://pulsechat.tech/ROOM/ME')).toBe('me');

    expect(extractRoomIdFromInput('global')).toBe('global');
    expect(extractRoomIdFromInput('GLOBAL')).toBe('global');
    expect(extractRoomIdFromInput('Global')).toBe('global');
    expect(extractRoomIdFromInput('/global')).toBe('global');
    expect(extractRoomIdFromInput('/GLOBAL')).toBe('global');
    expect(extractRoomIdFromInput('https://pulsechat.tech/room/global')).toBe('global');
    expect(extractRoomIdFromInput('https://pulsechat.tech/ROOM/GLOBAL')).toBe('global');

    expect(extractRoomIdFromInput('dev_lounge')).toBe('dev_lounge');
    expect(extractRoomIdFromInput('DEV_LOUNGE')).toBe('DEV_LOUNGE');
    expect(extractRoomIdFromInput('Dev_Lounge')).toBe('Dev_Lounge');
    expect(extractRoomIdFromInput('https://pulsechat.tech/room/Dev_Lounge')).toBe('Dev_Lounge');
    expect(extractRoomIdFromInput('https://pulsechat.tech/ROOM/Dev_Lounge')).toBe('Dev_Lounge');
    expect(extractRoomIdFromInput('http://localhost:3000/Room/my_custom-room.1?token=xyz#top')).toBe('my_custom-room.1');
  });
});

describe('JoinRoomModal - Case Insensitive Room Support', () => {
  it('normalizes /me input and full /me URL to "me" case-insensitively', () => {
    let roomIdValue = '';
    const setJoinRoomId = vi.fn((val: string) => {
      roomIdValue = val;
    });

    const { getByPlaceholderText } = render(
      <JoinRoomModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
        joinRoomId={roomIdValue}
        setJoinRoomId={setJoinRoomId}
        joinUsername="Harsh"
        setJoinUsername={vi.fn()}
        joinPasswordInput=""
        setJoinPasswordInput={vi.fn()}
        showJoinModalPw={false}
        setShowJoinModalPw={vi.fn()}
        joinModalError=""
        isJoining={false}
      />
    );

    const input = getByPlaceholderText('e.g. dev_lounge or full link');

    // Test typing "/me"
    fireEvent.change(input, { target: { value: '/me' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('me');

    // Test typing uppercase "/ME"
    fireEvent.change(input, { target: { value: '/ME' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('me');

    // Test pasting uppercase URL "https://pulsechat.tech/ME"
    fireEvent.change(input, { target: { value: 'https://pulsechat.tech/ME' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('me');

    // Test pasting room URL "https://pulsechat.tech/ROOM/me"
    fireEvent.change(input, { target: { value: 'https://pulsechat.tech/ROOM/me' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('me');

    // Test pasting uppercase room URL "https://pulsechat.tech/ROOM/GLOBAL"
    fireEvent.change(input, { target: { value: 'https://pulsechat.tech/ROOM/GLOBAL' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('global');

    // Test pasting custom private room URL "https://pulsechat.tech/ROOM/my_secret.room"
    fireEvent.change(input, { target: { value: 'https://pulsechat.tech/ROOM/my_secret.room' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('my_secret.room');

    // Test typing custom room ID directly
    fireEvent.change(input, { target: { value: 'Secret_Lounge' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('Secret_Lounge');
  });
});
