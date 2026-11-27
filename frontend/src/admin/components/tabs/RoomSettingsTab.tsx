import React, { useState, useEffect, useRef } from 'react';
import type { AdminController } from '../../hooks';
import { copyTextToClipboard } from '../../../chat/utils';
import { PasswordStrengthIndicator } from '../../../components/PasswordStrengthIndicator';
import {
  ScrollContainer,
  SettingsStack,
  SettingsCard,
  SettingsCardHeader,
  SettingsTitleGroup,
  SettingsIconBadge,
  SettingsStatusPill,
  SettingsCallout,
  SettingsIdMetaRow,
  SettingsIdChip,
  SettingsMiniCopyBtn,
  SettingsFieldsGroup,
  SettingsField,
  SettingsLabelRow,
  SettingsCounter,
  SettingsInput,
  SettingsTextArea,
  SettingsPasswordWrapper,
  SettingsPasswordToggle,
  SettingsHint,
  SettingsActionRow,
  SettingsPrimaryButton,
  SettingsDangerOutlineButton,
  SettingsInlineAlert,
  SettingsAlertBody,
  SettingsAlertClose,
} from '../../AdminStyledComponents';

export interface RoomSettingsTabProps {
  admin: AdminController;
}

interface SectionAlertProps {
  success?: string;
  error?: string;
  onDismiss: () => void;
}

function SectionAlert({ success, error, onDismiss }: SectionAlertProps) {
  const message = error || success;
  if (!message) return null;
  const isError = Boolean(error);

  return (
    <SettingsInlineAlert $variant={isError ? 'error' : 'success'} role={isError ? 'alert' : 'status'}>
      <SettingsAlertBody>
        {isError ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )}
        <span>{message}</span>
      </SettingsAlertBody>
      <SettingsAlertClose type="button" onClick={onDismiss} aria-label="Dismiss notification" title="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </SettingsAlertClose>
    </SettingsInlineAlert>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  onChange: (value: string) => void;
  children?: React.ReactNode;
}

function PasswordField({
  id,
  label,
  value,
  placeholder,
  visible,
  onToggleVisible,
  onChange,
  children,
}: PasswordFieldProps) {
  return (
    <SettingsField>
      <SettingsLabelRow>
        <label htmlFor={id}>{label}</label>
      </SettingsLabelRow>
      <SettingsPasswordWrapper>
        <SettingsInput
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
        />
        <SettingsPasswordToggle
          type="button"
          onClick={onToggleVisible}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          title={visible ? 'Hide' : 'Show'}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </SettingsPasswordToggle>
      </SettingsPasswordWrapper>
      {children}
    </SettingsField>
  );
}

export function RoomSettingsTab({ admin }: RoomSettingsTabProps) {
  const {
    canonicalRoomId,
    roomId,
    roomSettingsName,
    setRoomSettingsName,
    roomSettingsDesc,
    setRoomSettingsDesc,
    handleSaveRoomDetails,
    detailsSaving,
    roomIdSaving,
    passwordSaving,
    detailsSuccess,
    setDetailsSuccess,
    detailsError,
    setDetailsError,
    roomSettingsAlias,
    roomSettingsLastIdChange,
    roomSettingsNewId,
    setRoomSettingsNewId,
    handleSaveRoomId,
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
    handleChangeJoinPassword,
    roomSettingsHasJoinPassword,
    handleRemoveJoinPassword,
    passwordSuccess,
    setPasswordSuccess,
    passwordError,
    setPasswordError,
  } = admin;

  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [copiedIdKey, setCopiedIdKey] = useState<'active' | 'canonical' | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const activeDisplayId = roomSettingsAlias || canonicalRoomId || roomId;
  const fallbackOriginalId = canonicalRoomId || roomId;

  const handleCopyIdChip = async (value: string, key: 'active' | 'canonical') => {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setCopiedIdKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedIdKey(null), 1800);
    }
  };

  return (
    <ScrollContainer>
      <SettingsStack>
        {/* 1. Room Details */}
        <SettingsCard>
          <SettingsCardHeader>
            <SettingsTitleGroup>
              <SettingsIconBadge aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </SettingsIconBadge>
              <div>
                <h2>Room Details</h2>
                <p>Update the public name and description shown on your room card.</p>
              </div>
            </SettingsTitleGroup>
          </SettingsCardHeader>

          <SettingsFieldsGroup>
            <SettingsField>
              <SettingsLabelRow>
                <label htmlFor="room-settings-name">Room Name</label>
                <SettingsCounter $nearLimit={roomSettingsName.length >= 45}>
                  {roomSettingsName.length}/50
                </SettingsCounter>
              </SettingsLabelRow>
              <SettingsInput
                id="room-settings-name"
                type="text"
                value={roomSettingsName}
                onChange={(e) => {
                  setRoomSettingsName(e.target.value);
                  if (detailsError) setDetailsError('');
                  if (detailsSuccess) setDetailsSuccess('');
                }}
                placeholder="e.g. Chill Lounge"
                maxLength={50}
              />
            </SettingsField>

            <SettingsField>
              <SettingsLabelRow>
                <label htmlFor="room-settings-desc">Room Description</label>
                <SettingsCounter $nearLimit={roomSettingsDesc.length >= 135}>
                  {roomSettingsDesc.length}/150
                </SettingsCounter>
              </SettingsLabelRow>
              <SettingsTextArea
                id="room-settings-desc"
                rows={3}
                value={roomSettingsDesc}
                onChange={(e) => {
                  setRoomSettingsDesc(e.target.value);
                  if (detailsError) setDetailsError('');
                  if (detailsSuccess) setDetailsSuccess('');
                }}
                placeholder="What is this room about?"
                maxLength={150}
              />
            </SettingsField>

            <SettingsActionRow>
              <SettingsPrimaryButton type="button" onClick={handleSaveRoomDetails} disabled={detailsSaving}>
                {detailsSaving ? 'Saving...' : 'Save Room Details'}
              </SettingsPrimaryButton>
            </SettingsActionRow>
          </SettingsFieldsGroup>

          <SectionAlert
            success={detailsSuccess}
            error={detailsError}
            onDismiss={() => {
              setDetailsSuccess('');
              setDetailsError('');
            }}
          />
        </SettingsCard>

        {/* 2. Custom Room ID (URL Alias) */}
        <SettingsCard>
          <SettingsCardHeader>
            <SettingsTitleGroup>
              <SettingsIconBadge aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </SettingsIconBadge>
              <div>
                <h3>Custom Room ID (URL Alias)</h3>
                <p>Customize the ID displayed on /room and your shareable room URL.</p>
              </div>
            </SettingsTitleGroup>
          </SettingsCardHeader>

          <SettingsCallout>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              <strong>Important: </strong>
              Your permanent original ID always works as a fallback link. Changing your custom Room ID updates what is
              shown on /room and replaces your previous custom URL alias.
            </div>
          </SettingsCallout>

          <SettingsIdMetaRow>
            <SettingsIdChip title={activeDisplayId}>
              <span>Active ID:</span>
              <code>{activeDisplayId}</code>
              <SettingsMiniCopyBtn
                type="button"
                $copied={copiedIdKey === 'active'}
                onClick={() => void handleCopyIdChip(activeDisplayId, 'active')}
                aria-label="Copy Active Room ID"
                title="Copy Active ID"
              >
                {copiedIdKey === 'active' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </SettingsMiniCopyBtn>
            </SettingsIdChip>

            {fallbackOriginalId && fallbackOriginalId !== activeDisplayId && (
              <SettingsIdChip title={fallbackOriginalId}>
                <span>Original ID:</span>
                <code>{fallbackOriginalId}</code>
                <SettingsMiniCopyBtn
                  type="button"
                  $copied={copiedIdKey === 'canonical'}
                  onClick={() => void handleCopyIdChip(fallbackOriginalId, 'canonical')}
                  aria-label="Copy Original Room ID"
                  title="Copy Original ID"
                >
                  {copiedIdKey === 'canonical' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </SettingsMiniCopyBtn>
              </SettingsIdChip>
            )}
          </SettingsIdMetaRow>

          <SettingsFieldsGroup>
            <SettingsField>
              <SettingsLabelRow>
                <label htmlFor="room-settings-custom-id">New Custom Room ID</label>
                {roomSettingsAlias && (
                  <SettingsStatusPill $tone="info">Current: {roomSettingsAlias}</SettingsStatusPill>
                )}
              </SettingsLabelRow>
              <SettingsInput
                id="room-settings-custom-id"
                type="text"
                value={roomSettingsNewId}
                onChange={(e) => {
                  setRoomSettingsNewId(e.target.value.replace(/[^a-zA-Z0-9._]/g, ''));
                  if (roomIdError) setRoomIdError('');
                  if (roomIdSuccess) setRoomIdSuccess('');
                }}
                placeholder="e.g. my_cool_room"
                maxLength={30}
              />
              <SettingsHint>
                Letters, numbers, dots, and underscores only (1–30 chars).
                {roomSettingsLastIdChange && ` Last changed on ${new Date(roomSettingsLastIdChange).toLocaleDateString()}.`}
              </SettingsHint>
            </SettingsField>

            <SettingsActionRow>
              <SettingsPrimaryButton type="button" onClick={handleSaveRoomId} disabled={roomIdSaving}>
                {roomIdSaving ? 'Saving...' : 'Save Room ID'}
              </SettingsPrimaryButton>
            </SettingsActionRow>
          </SettingsFieldsGroup>

          <SectionAlert
            success={roomIdSuccess}
            error={roomIdError}
            onDismiss={() => {
              setRoomIdSuccess('');
              setRoomIdError('');
            }}
          />
        </SettingsCard>

        {/* 3. Join Password & Privacy */}
        <SettingsCard>
          <SettingsCardHeader>
            <SettingsTitleGroup>
              <SettingsIconBadge aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </SettingsIconBadge>
              <div>
                <h3>Join Password &amp; Privacy</h3>
                <p>Control whether users need a password to enter this chat room.</p>
              </div>
            </SettingsTitleGroup>
            <SettingsStatusPill $tone={roomSettingsHasJoinPassword ? 'private' : 'public'}>
              {roomSettingsHasJoinPassword ? 'Private · Password Protected' : 'Public · Listed on /room'}
            </SettingsStatusPill>
          </SettingsCardHeader>

          <SettingsCallout>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              <strong>Note: </strong>
              {roomSettingsHasJoinPassword
                ? 'Enter your current join password to change it, or remove the password to list this room on the public /room directory again.'
                : 'This room is currently public with no join password. Setting a password below will automatically make it private and hide it from /room.'}
            </div>
          </SettingsCallout>

          <SettingsFieldsGroup>
            {roomSettingsHasJoinPassword && (
              <PasswordField
                id="room-settings-current-pw"
                label="Current Join Password"
                value={roomSettingsCurrentPassword}
                placeholder="Enter current join password"
                visible={showCurrentPw}
                onToggleVisible={() => setShowCurrentPw((v) => !v)}
                onChange={(val) => {
                  setRoomSettingsCurrentPassword(val);
                  if (passwordError) setPasswordError('');
                  if (passwordSuccess) setPasswordSuccess('');
                }}
              />
            )}

            <PasswordField
              id="room-settings-new-pw"
              label={roomSettingsHasJoinPassword ? 'New Join Password' : 'Join Password'}
              value={roomSettingsNewPassword}
              placeholder="At least 6 characters"
              visible={showNewPw}
              onToggleVisible={() => setShowNewPw((v) => !v)}
              onChange={(val) => {
                setRoomSettingsNewPassword(val);
                if (passwordError) setPasswordError('');
                if (passwordSuccess) setPasswordSuccess('');
              }}
            >
              <PasswordStrengthIndicator password={roomSettingsNewPassword} />
            </PasswordField>

            <PasswordField
              id="room-settings-confirm-pw"
              label="Confirm Password"
              value={roomSettingsConfirmPassword}
              placeholder="Re-enter join password"
              visible={showConfirmPw}
              onToggleVisible={() => setShowConfirmPw((v) => !v)}
              onChange={(val) => {
                setRoomSettingsConfirmPassword(val);
                if (passwordError) setPasswordError('');
                if (passwordSuccess) setPasswordSuccess('');
              }}
            />

            <SettingsActionRow>
              <SettingsPrimaryButton type="button" onClick={handleChangeJoinPassword} disabled={passwordSaving}>
                {passwordSaving
                  ? 'Saving...'
                  : roomSettingsHasJoinPassword
                  ? 'Change Join Password'
                  : 'Set Join Password'}
              </SettingsPrimaryButton>

              {roomSettingsHasJoinPassword && (
                <SettingsDangerOutlineButton
                  type="button"
                  onClick={handleRemoveJoinPassword}
                  disabled={passwordSaving}
                  title="Remove password and make room public"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                    <span style={{ lineHeight: 1.15 }}>Remove Password</span>
                    <span style={{ fontSize: '0.68rem', opacity: 0.85, fontWeight: 500, marginTop: '0.1rem' }}>
                      Makes room public
                    </span>
                  </div>
                </SettingsDangerOutlineButton>
              )}
            </SettingsActionRow>
          </SettingsFieldsGroup>

          <SectionAlert
            success={passwordSuccess}
            error={passwordError}
            onDismiss={() => {
              setPasswordSuccess('');
              setPasswordError('');
            }}
          />
        </SettingsCard>
      </SettingsStack>
    </ScrollContainer>
  );
}
