import styled, { css } from 'styled-components';
import { cardEntrance, slideUp } from './admin.animations';
import { Button, Input, TextArea } from './admin.layout.styles';

export const SettingsStack = styled.div`
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-bottom: 1.5rem;

  @media (max-width: 600px) {
    gap: 1rem;
    padding-bottom: 1rem;
  }
`;

export const SettingsCard = styled.section`
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  padding: 1.5rem;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  transition: border-color 0.25s ease, box-shadow 0.25s ease, background-color 0.3s ease;
  animation: ${cardEntrance} 0.35s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    border-color: var(--border-secondary);
  }

  @media (max-width: 600px) {
    padding: 1.1rem 0.95rem;
    border-radius: 12px;
    gap: 1rem;
  }
`;

export const SettingsCardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.85rem;
  flex-wrap: wrap;
`;

export const SettingsTitleGroup = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  min-width: 0;
  flex: 1 1 240px;

  h2,
  h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-heading);
    letter-spacing: -0.015em;
    line-height: 1.3;
  }

  p {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.45;
  }

  @media (max-width: 480px) {
    gap: 0.65rem;
    h2,
    h3 {
      font-size: 1.02rem;
    }
    p {
      font-size: 0.82rem;
    }
  }
`;

export const SettingsIconBadge = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.22);
  color: var(--accent-blue);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  [data-theme='dark'] & {
    background: rgba(59, 130, 246, 0.14);
    border-color: rgba(96, 165, 250, 0.25);
    color: #60a5fa;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

export const SettingsStatusPill = styled.span<{ $tone?: 'public' | 'private' | 'info' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.01em;
  background: var(--sp-bg);
  color: var(--sp-color);
  border: 1px solid var(--sp-border);

  ${(p) =>
    p.$tone === 'public'
      ? css`
          --sp-bg: rgba(16, 185, 129, 0.12);
          --sp-color: #047857;
          --sp-border: rgba(16, 185, 129, 0.28);
          --sp-dark-bg: rgba(16, 185, 129, 0.14);
          --sp-dark-color: #34d399;
          --sp-dark-border: rgba(52, 211, 153, 0.3);
        `
      : p.$tone === 'private'
      ? css`
          --sp-bg: rgba(245, 158, 11, 0.14);
          --sp-color: #b45309;
          --sp-border: rgba(245, 158, 11, 0.3);
          --sp-dark-bg: rgba(245, 158, 11, 0.14);
          --sp-dark-color: #fbbf24;
          --sp-dark-border: rgba(251, 191, 36, 0.3);
        `
      : css`
          --sp-bg: rgba(59, 130, 246, 0.1);
          --sp-color: #1d4ed8;
          --sp-border: rgba(59, 130, 246, 0.25);
          --sp-dark-bg: rgba(59, 130, 246, 0.14);
          --sp-dark-color: #93c5fd;
          --sp-dark-border: rgba(96, 165, 250, 0.28);
        `}

  [data-theme='dark'] & {
    background: var(--sp-dark-bg);
    color: var(--sp-dark-color);
    border-color: var(--sp-dark-border);
  }
`;

export const SettingsCallout = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: var(--text-secondary);
  font-size: 0.84rem;
  line-height: 1.5;

  svg {
    width: 17px;
    height: 17px;
    color: var(--accent-blue);
    flex-shrink: 0;
    margin-top: 2px;
  }

  strong {
    color: var(--accent-blue);
    font-weight: 600;
  }

  [data-theme='dark'] & {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.22);
    svg,
    strong {
      color: #60a5fa;
    }
  }
`;

export const SettingsIdMetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  width: 100%;
  max-width: 480px;
`;

export const SettingsIdChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.7rem;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  font-size: 0.78rem;
  color: var(--text-secondary);
  max-width: 100%;
  min-width: 0;

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const SettingsMiniCopyBtn = styled.button<{ $copied?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: ${(p) => (p.$copied ? 'rgba(16, 185, 129, 0.14)' : 'transparent')};
  color: ${(p) => (p.$copied ? '#10b981' : 'var(--text-secondary)')};
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-hover);
    color: ${(p) => (p.$copied ? '#10b981' : 'var(--accent-blue)')};
  }

  svg {
    width: 13px;
    height: 13px;
  }
`;

export const SettingsFieldsGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 480px;
`;

export const SettingsField = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export const SettingsLabelRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  width: 100%;
  margin-bottom: 0.45rem;

  label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
  }
`;

export const SettingsCounter = styled.span<{ $nearLimit?: boolean }>`
  font-size: 0.76rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${(p) => (p.$nearLimit ? '#f59e0b' : 'var(--text-secondary)')};
  flex-shrink: 0;
`;

export const SettingsInput = styled(Input)`
  max-width: 100%;
  margin-bottom: 0;
  font-size: 0.94rem;
`;

export const SettingsTextArea = styled(TextArea)`
  max-width: 100%;
  margin-bottom: 0;
  min-height: 104px;
  font-size: 0.94rem;
  resize: vertical;
`;

export const SettingsPasswordWrapper = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;

  input {
    padding-right: 2.65rem;
  }
`;

export const SettingsPasswordToggle = styled.button`
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease, background-color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

export const SettingsHint = styled.small`
  display: block;
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.4;
`;

export const SettingsActionRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
  flex-wrap: wrap;
  width: 100%;
  max-width: 480px;
`;

export const SettingsPrimaryButton = styled(Button)`
  padding: 0.7rem 1.35rem;
  font-size: 0.92rem;
  font-weight: 600;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  flex: 1 1 180px;

  @media (max-width: 480px) {
    width: 100%;
    flex: 1 1 100%;
  }
`;

export const SettingsDangerOutlineButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.55rem 1.1rem;
  min-height: 44px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #dc2626;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  flex: 1 1 170px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  [data-theme='dark'] & {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.35);
  }

  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.55);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
  }

  @media (max-width: 480px) {
    width: 100%;
    flex: 1 1 100%;
  }
`;

export const SettingsInlineAlert = styled.div<{ $variant: 'success' | 'error' }>`
  width: 100%;
  max-width: 480px;
  padding: 0.8rem 0.95rem;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.875rem;
  animation: ${slideUp} 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  background: var(--sa-bg);
  color: var(--sa-color);
  border: 1px solid var(--sa-border);

  ${(p) =>
    p.$variant === 'error'
      ? css`
          --sa-bg: rgba(239, 68, 68, 0.1);
          --sa-color: #b91c1c;
          --sa-border: rgba(239, 68, 68, 0.28);
          --sa-dark-bg: rgba(239, 68, 68, 0.12);
          --sa-dark-color: #fca5a5;
          --sa-dark-border: rgba(239, 68, 68, 0.28);
        `
      : css`
          --sa-bg: rgba(16, 185, 129, 0.1);
          --sa-color: #047857;
          --sa-border: rgba(16, 185, 129, 0.28);
          --sa-dark-bg: rgba(16, 185, 129, 0.12);
          --sa-dark-color: #6ee7b7;
          --sa-dark-border: rgba(16, 185, 129, 0.28);
        `}

  [data-theme='dark'] & {
    background: var(--sa-dark-bg);
    color: var(--sa-dark-color);
    border-color: var(--sa-dark-border);
  }
`;

export const SettingsAlertBody = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  font-weight: 500;
  line-height: 1.4;

  svg {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
  }
`;

export const SettingsAlertClose = styled.button`
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  padding: 0.2rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.18s ease, background-color 0.18s ease;

  &:hover {
    opacity: 1;
    background: rgba(128, 128, 128, 0.14);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;
