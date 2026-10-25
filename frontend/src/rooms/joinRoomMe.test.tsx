import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { JoinRoomModal } from './components/JoinRoomModal';

describe('JoinRoomModal - /me Room Support', () => {
  it('normalizes /me input and full /me URL to "me"', () => {
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

    // Test pasting full URL "https://pulsechat.tech/me"
    fireEvent.change(input, { target: { value: 'https://pulsechat.tech/me' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('me');

    // Test pasting room URL "https://pulsechat.tech/room/me"
    fireEvent.change(input, { target: { value: 'https://pulsechat.tech/room/me' } });
    expect(setJoinRoomId).toHaveBeenCalledWith('me');
  });
});
