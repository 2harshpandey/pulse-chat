import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomSettingsTab } from './RoomSettingsTab';
import type { AdminController } from '../../hooks';

function createMockAdmin(overrides: Partial<AdminController> = {}): AdminController {
  return {
    canonicalRoomId: 'orig_id_123',
    roomId: 'dev_lounge',
    roomSettingsName: 'Dev Lounge',
    setRoomSettingsName: vi.fn(),
    roomSettingsDesc: '',
    setRoomSettingsDesc: vi.fn(),
    handleSaveRoomDetails: vi.fn(),
    detailsSaving: false,
    roomIdSaving: false,
    passwordSaving: false,
    detailsSuccess: '',
    setDetailsSuccess: vi.fn(),
    detailsError: '',
    setDetailsError: vi.fn(),
    roomSettingsAlias: 'dev_lounge',
    roomSettingsLastIdChange: null,
    roomSettingsNewId: 'dev_lounge',
    setRoomSettingsNewId: vi.fn(),
    handleSaveRoomId: vi.fn(),
    roomIdSuccess: '',
    setRoomIdSuccess: vi.fn(),
    roomIdError: '',
    setRoomIdError: vi.fn(),
    roomSettingsCurrentPassword: '',
    setRoomSettingsCurrentPassword: vi.fn(),
    roomSettingsNewPassword: '',
    setRoomSettingsNewPassword: vi.fn(),
    roomSettingsConfirmPassword: '',
    setRoomSettingsConfirmPassword: vi.fn(),
    handleChangeJoinPassword: vi.fn(),
    roomSettingsHasJoinPassword: false,
    handleRemoveJoinPassword: vi.fn(),
    passwordSuccess: '',
    setPasswordSuccess: vi.fn(),
    passwordError: '',
    setPasswordError: vi.fn(),
    ...overrides,
  } as unknown as AdminController;
}

describe('RoomSettingsTab layout, section alerts, and password UX', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('displays both Active ID and Original ID chips in Custom Room ID card and hides Current Join Password for public rooms', () => {
    const admin = createMockAdmin({
      canonicalRoomId: 'perm_room_id',
      roomSettingsAlias: 'dev_lounge',
      roomSettingsHasJoinPassword: false,
    });

    render(<RoomSettingsTab admin={admin} />);

    expect(screen.getByText('perm_room_id')).toBeInTheDocument();
    expect(screen.getByText('dev_lounge')).toBeInTheDocument();
    expect(screen.getByText('Public · Listed on /room')).toBeInTheDocument();

    // Public rooms must NOT show the Current Join Password input or Remove Password button
    expect(screen.queryByLabelText('Current Join Password')).toBeNull();
    expect(screen.queryByRole('button', { name: /remove password/i })).toBeNull();
    expect(screen.getByRole('button', { name: /set join password/i })).toBeInTheDocument();
  });

  it('shows Current Join Password and Remove Password button when room is private', () => {
    const admin = createMockAdmin({
      roomSettingsHasJoinPassword: true,
    });

    render(<RoomSettingsTab admin={admin} />);

    expect(screen.getByText('Private · Password Protected')).toBeInTheDocument();
    expect(screen.getByLabelText('Current Join Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change join password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove password/i })).toBeInTheDocument();
  });

  it('renders each section alert inside its own respective section card rather than at the bottom of the page', () => {
    const setDetailsSuccess = vi.fn();
    const admin = createMockAdmin({
      detailsSuccess: 'Room details updated successfully.',
      roomIdError: 'Room ID is already taken.',
      passwordSuccess: 'Join password removed. The room is now public and listed on /room.',
      setDetailsSuccess,
    });

    render(<RoomSettingsTab admin={admin} />);

    const detailsHeading = screen.getByRole('heading', { name: 'Room Details' });
    const detailsCard = detailsHeading.closest('section')!;
    expect(within(detailsCard).getByText('Room details updated successfully.')).toBeInTheDocument();

    const idHeading = screen.getByRole('heading', { name: /custom room id/i });
    const idCard = idHeading.closest('section')!;
    expect(within(idCard).getByText('Room ID is already taken.')).toBeInTheDocument();

    const pwHeading = screen.getByRole('heading', { name: /join password/i });
    const pwCard = pwHeading.closest('section')!;
    expect(
      within(pwCard).getByText('Join password removed. The room is now public and listed on /room.')
    ).toBeInTheDocument();

    // Dismissing details alert calls setDetailsSuccess('')
    const dismissBtn = within(detailsCard).getByRole('button', { name: /dismiss notification/i });
    fireEvent.click(dismissBtn);
    expect(setDetailsSuccess).toHaveBeenCalledWith('');
  });

  it('toggles password visibility smoothly when clicking eye button', () => {
    const admin = createMockAdmin({
      roomSettingsHasJoinPassword: true,
      roomSettingsNewPassword: 'secret123',
    });

    render(<RoomSettingsTab admin={admin} />);

    const newPwInput = screen.getByLabelText('New Join Password') as HTMLInputElement;
    expect(newPwInput.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /show new join password/i });
    fireEvent.click(toggleBtn);
    expect(newPwInput.type).toBe('text');
  });

  it('aligns character counters inside the same label row as Room Name and Room Description', () => {
    const admin = createMockAdmin({
      roomSettingsName: 'Dev Lounge',
      roomSettingsDesc: 'Hello',
    });

    render(<RoomSettingsTab admin={admin} />);

    const nameLabel = screen.getByText('Room Name');
    expect(nameLabel.parentElement?.textContent).toContain('10/50');

    const descLabel = screen.getByText('Room Description');
    expect(descLabel.parentElement?.textContent).toContain('5/150');
  });
});
