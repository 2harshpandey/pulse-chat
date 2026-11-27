import styled, { css } from 'styled-components';
import { slideUp, tabContentFade, cardEntrance, badgePop, pulse, emptyFloat } from './admin.animations';
import { Input, SelectWrapper, Select, Button } from './admin.layout.styles';

export const TabContainer = styled.div`
  display: flex;
  padding-top: 4px; /* Prevents tabs from getting clipped when translating Y on hover */
  border-bottom: 1px solid var(--border-secondary);
  margin-bottom: -1px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  flex-shrink: 0;
  transition: border-color 0.3s ease;
  &::-webkit-scrollbar { display: none; }
`;

export const TabButton = styled.button<{ active: boolean }>`
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  background-color: ${(p: any) => p.active ? 'var(--bg-tab-active)' : 'transparent'};
  color: ${(p: any) => p.active ? 'var(--accent-blue)' : 'var(--text-secondary)'};
  border: 1px solid ${(p: any) => p.active ? 'var(--border-secondary)' : 'transparent'};
  border-bottom: 1px solid ${(p: any) => p.active ? 'var(--bg-tab-active)' : 'var(--border-secondary)'};
  margin-bottom: -1px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  outline: none;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 50%;
    transform: translateX(-50%) scaleX(${(p: any) => p.active ? 1 : 0});
    width: 60%;
    height: 2px;
    background: var(--accent-blue);
    border-radius: 1px;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &:hover {
    color: var(--accent-blue);
    transform: translateY(-1px);
  }
  &:active { transform: translateY(0) scale(0.97); }
  @media (max-width: 600px) { padding: 0.6rem 1rem; font-size: 0.875rem; }
  @media (max-width: 380px) { padding: 0.5rem 0.65rem; font-size: 0.78rem; }
`;

export const TabContent = styled.div`
  border: 1px solid var(--border-secondary);
  padding: 2rem;
  border-radius: 0 8px 8px 8px;
  background-color: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  transition: background-color 0.3s ease, border-color 0.3s ease;
  animation: ${tabContentFade} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  @media (max-width: 768px) {
    padding: 0.85rem 0.65rem;
    flex: none;
    min-height: auto;
    overflow: visible;
    border-radius: 8px;
  }
  @media (max-width: 480px) {
    padding: 0.75rem 0.5rem;
    border-radius: 8px;
  }
  @media (max-height: 500px) { padding: 0.4rem 0.5rem; }
`;

export const MessagesHeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding-top: 4px;

  @media (max-width: 600px) {
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-top: 2px;
  }
`;

export const MessagesHeaderTitleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-heading);
    letter-spacing: -0.02em;
    line-height: 1.2;

    @media (max-width: 600px) {
      font-size: 1.25rem;
    }
    @media (max-width: 380px) {
      font-size: 1.1rem;
    }
  }
`;

export const MessagesCountBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 9999px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-secondary);
  letter-spacing: 0.01em;
  white-space: nowrap;
`;

export const MessagesToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-top: 4px;
  padding-bottom: 4px;

  @media (max-width: 600px) {
    width: 100%;
    gap: 0.4rem;
    padding-top: 2px;
    padding-bottom: 2px;
  }
`;

export const ToolbarButton = styled.button<{
  $variant?: 'primary' | 'danger' | 'default';
  $active?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.825rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  letter-spacing: -0.01em;
  box-sizing: border-box;

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }

  background: var(--tb-bg);
  color: var(--tb-color);
  border: 1px solid var(--tb-border);
  box-shadow: var(--tb-shadow);

  &:hover:not(:disabled) {
    background: var(--tb-hover-bg);
    color: var(--tb-hover-color);
    border-color: var(--tb-hover-border);
    box-shadow: var(--tb-hover-shadow);
    transform: translateY(-1px);
  }

  [data-theme='dark'] & {
    background: var(--tb-dark-bg);
    color: var(--tb-dark-color);
    border-color: var(--tb-dark-border);

    &:hover:not(:disabled) {
      background: var(--tb-dark-hover-bg);
      color: var(--tb-dark-hover-color);
      border-color: var(--tb-dark-hover-border);
    }
  }

  ${(p: any) =>
    p.$variant === 'danger'
      ? css`
          --tb-bg: #ef4444;
          --tb-color: #ffffff;
          --tb-border: #dc2626;
          --tb-shadow: 0 1px 2px rgba(239, 68, 68, 0.2);
          --tb-hover-bg: #dc2626;
          --tb-hover-color: #ffffff;
          --tb-hover-border: #dc2626;
          --tb-hover-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
          --tb-dark-bg: #b91c1c;
          --tb-dark-color: #ffffff;
          --tb-dark-border: #ef4444;
          --tb-dark-hover-bg: #dc2626;
          --tb-dark-hover-color: #ffffff;
          --tb-dark-hover-border: #f87171;
        `
      : p.$variant === 'primary'
      ? css`
          --tb-bg: #2563eb;
          --tb-color: #ffffff;
          --tb-border: #1d4ed8;
          --tb-shadow: 0 1px 2px rgba(37, 99, 235, 0.16);
          --tb-hover-bg: #1d4ed8;
          --tb-hover-color: #ffffff;
          --tb-hover-border: #1d4ed8;
          --tb-hover-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
          --tb-dark-bg: #1e40af;
          --tb-dark-color: #ffffff;
          --tb-dark-border: #3b82f6;
          --tb-dark-hover-bg: #2563eb;
          --tb-dark-hover-color: #ffffff;
          --tb-dark-hover-border: #60a5fa;
        `
      : css`
          --tb-bg: ${p.$active ? 'var(--bg-tab-active)' : 'var(--bg-tertiary)'};
          --tb-color: ${p.$active ? 'var(--accent-blue)' : 'var(--text-secondary)'};
          --tb-border: ${p.$active ? 'var(--accent-blue)' : 'var(--border-secondary)'};
          --tb-shadow: none;
          --tb-hover-bg: var(--bg-hover);
          --tb-hover-color: var(--accent-blue);
          --tb-hover-border: var(--accent-blue);
          --tb-hover-shadow: none;
          --tb-dark-bg: ${p.$active ? 'var(--bg-tab-active)' : 'var(--bg-tertiary)'};
          --tb-dark-color: ${p.$active ? '#60a5fa' : 'var(--text-secondary)'};
          --tb-dark-border: ${p.$active ? '#3b82f6' : 'var(--border-secondary)'};
          --tb-dark-hover-bg: var(--bg-hover);
          --tb-dark-hover-color: #93c5fd;
          --tb-dark-hover-border: #60a5fa;
        `}

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  @media (max-width: 600px) {
    padding: 0.4rem 0.6rem;
    font-size: 0.78rem;
    flex: 1 1 auto;
    min-width: 0;
  }
`;

export const FilterBadgeDot = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  background-color: var(--accent-blue);
  color: #ffffff;
`;

export const ClearFiltersButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 6px;
  border: 1px dashed var(--border-secondary);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    color: #ef4444;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
  }
`;

export const FilterFooterRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.4rem;
  grid-column: 1 / -1;
  font-size: 0.75rem;
  color: var(--text-muted);
  gap: 0.5rem;
  flex-wrap: wrap;
`;

export const ResponsiveButtonLabel = styled.span`
  @media (max-width: 600px) {
    .long-label {
      display: none;
    }
    .short-label {
      display: inline;
    }
  }
  @media (min-width: 601px) {
    .long-label {
      display: inline;
    }
    .short-label {
      display: none;
    }
  }
`;

export const FilterContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.85rem;
  background-color: var(--bg-filter);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.03);
  flex-shrink: 0;
  transition: background-color 0.3s ease, border-color 0.3s ease;
  animation: ${slideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  ${Input}, ${SelectWrapper} {
    width: 100%;
    max-width: none;
    margin-bottom: 0;
  }

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.6rem;
    padding: 0.75rem;
  }

  @media (max-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    padding: 0.55rem;

    ${Input} {
      padding: 0.4rem 0.6rem;
      font-size: 0.8rem;
      height: 35px;
      border-radius: 6px;
    }

    ${SelectWrapper} {
      height: 35px;
      margin-bottom: 0;
      &::after {
        right: 0.6rem;
        width: 0.5rem;
        height: 0.5rem;
      }
    }

    ${Select} {
      padding: 0.4rem 1.6rem 0.4rem 0.6rem;
      font-size: 0.8rem;
      height: 35px;
      border-radius: 6px;
    }
  }

  @media (max-height: 500px) {
    grid-template-columns: repeat(4, 1fr);
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    margin-bottom: 0.3rem;
  }
`;

export const FilterToggleButton = styled.button<{ $open: boolean; $hasActive?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid ${(p: any) => (p.$hasActive ? 'var(--accent-blue)' : 'var(--border-secondary)')};
  background: ${(p: any) => (p.$hasActive ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)')};
  color: ${(p: any) => (p.$hasActive ? 'var(--accent-blue)' : 'var(--text-secondary)')};
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
  font-size: 0.825rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;

  svg {
    width: 14px;
    height: 14px;
    transition: transform 0.2s ease;
  }

  &:hover {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid var(--accent-blue);
    outline-offset: 2px;
  }

  @media (max-width: 600px) {
    padding: 0.4rem 0.6rem;
    font-size: 0.78rem;
    flex: 1 1 auto;
    min-width: 0;
  }
`;

export const MessageFilterCollapse = styled.div<{ $open: boolean }>`
  display: ${(p: any) => (p.$open ? 'block' : 'none')};
  animation: ${(p: any) => (p.$open ? slideUp : 'none')} 0.22s ease;
`;

export const PremiumExportButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.65rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 8px;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  letter-spacing: -0.01em;

  /* Light mode (default): High-contrast enterprise cobalt blue */
  background-color: #2563eb;
  color: #ffffff;
  border: 1px solid #1d4ed8;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.18);

  &:hover {
    background-color: #1d4ed8;
    border-color: #1e40af;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.28);
    transform: translateY(-1px);
  }

  &:active {
    background-color: #1e40af;
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  /* Dark mode: Deep royal sapphire with crisp accent border */
  [data-theme='dark'] & {
    background-color: #1e40af;
    color: #ffffff;
    border: 1px solid #3b82f6;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1);

    &:hover {
      background-color: #2563eb;
      border-color: #60a5fa;
      box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
      transform: translateY(-1px);
    }

    &:active {
      background-color: #1d4ed8;
      transform: translateY(0);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
  }

  &:disabled {
    background-color: #94a3af;
    border-color: #94a3af;
    color: #f1f5f9;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
    opacity: 0.6;
  }

  svg {
    width: 15px;
    height: 15px;
    stroke-width: 2.2;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }

  &:hover svg {
    transform: translateY(1px);
  }

  @media (max-width: 600px) {
    padding: 0.55rem 0.95rem;
    font-size: 0.825rem;
  }
`;

export const ActivityLogContainer = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  background-color: #1a202c;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  overflow-y: auto;
  border: 1px solid var(--border-primary);
  transition: border-color 0.3s ease;
  @media (max-width: 768px) { padding: 0.75rem; font-size: 0.78rem; }
  @media (max-height: 500px) { padding: 0.4rem 0.5rem; font-size: 0.75rem; }
`;

export const LogViewerContainer = styled.pre`
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: scroll;
  overflow-x: auto;
  background-color: #1a202c;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  border: 1px solid var(--border-primary);
  transition: border-color 0.3s ease;
  @media (max-width: 768px) { padding: 0.75rem; font-size: 0.78rem; }
  @media (max-height: 500px) { padding: 0.4rem 0.5rem; font-size: 0.75rem; }
`;

export const ServerLogItem = styled.div`
  margin-bottom: 1.2em;
  line-height: 1.5;
  word-break: break-all;
  content-visibility: auto;
  contain-intrinsic-size: 0 45px;
  &:last-child {
    margin-bottom: 0;
  }
`;

export const ActivityLogItem = styled.div`
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  line-height: 1.5;
  animation: ${cardEntrance} 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  transition: background-color 0.2s ease;
  word-break: break-word;
  content-visibility: auto;
  contain-intrinsic-size: 0 35px;
  &:hover {
    background-color: rgba(255, 255, 255, 0.04);
  }
`;

export const LogsTabHeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding-top: 2px;
  flex-shrink: 0;

  h2 {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    white-space: nowrap;
    transition: color 0.3s ease;
  }

  @media (max-width: 600px) {
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    h2 {
      font-size: 1.2rem;
    }
  }
`;

export const LogsHeaderTitleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  min-width: 0;

  h2 {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    white-space: nowrap;
    transition: color 0.3s ease;
  }

  @media (max-width: 600px) {
    gap: 0.5rem;
    h2 {
      font-size: 1.2rem;
    }
  }
`;

export const LogsRoomChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.55rem;
  border-radius: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.2;
  transition: all 0.2s ease;
  max-width: 320px;
  min-width: 0;

  svg.icon-room {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    color: var(--accent-blue);
  }

  span.label-room {
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-weight: 600;
    color: var(--text-primary);
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
  }

  &:hover {
    border-color: var(--border-primary);
    background: var(--bg-secondary);
  }

  @media (max-width: 600px) {
    max-width: 240px;
    code {
      max-width: 105px;
    }
  }

  @media (max-width: 400px) {
    max-width: 180px;
    code {
      max-width: 65px;
    }
  }
`;

export const LogsCountBadge = styled(MessagesCountBadge)``;

export const LogsCopyButton = styled.button<{ $copied?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.5rem 0.95rem;
  font-size: 0.84rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  letter-spacing: -0.01em;
  font-family: inherit;

  /* Default / Idle State using CSS vars so instances never collide in dark mode */
  background: var(--lcb-bg);
  color: var(--lcb-color);
  border: 1px solid var(--lcb-border);
  box-shadow: var(--lcb-shadow);

  ${(p: any) =>
    p.$copied
      ? css`
          --lcb-bg: #ecfdf5;
          --lcb-color: #059669;
          --lcb-border: #10b981;
          --lcb-shadow: 0 0 0 1px rgba(16, 185, 129, 0.2), 0 2px 8px rgba(16, 185, 129, 0.15);
          --lcb-hover-bg: #d1fae5;
          --lcb-hover-color: #059669;
          --lcb-hover-border: #059669;
          --lcb-hover-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
          --lcb-dark-bg: rgba(16, 185, 129, 0.15);
          --lcb-dark-color: #34d399;
          --lcb-dark-border: #10b981;
          --lcb-dark-shadow: 0 0 0 1px rgba(16, 185, 129, 0.3), 0 2px 10px rgba(16, 185, 129, 0.2);
          --lcb-dark-hover-bg: rgba(16, 185, 129, 0.22);
          --lcb-dark-hover-color: #34d399;
          --lcb-dark-hover-border: #34d399;
          --lcb-dark-hover-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
        `
      : css`
          --lcb-bg: var(--bg-secondary);
          --lcb-color: var(--text-secondary);
          --lcb-border: var(--border-secondary);
          --lcb-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          --lcb-hover-bg: var(--bg-hover);
          --lcb-hover-color: var(--accent-blue);
          --lcb-hover-border: var(--accent-blue);
          --lcb-hover-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
          --lcb-dark-bg: var(--bg-tab-active);
          --lcb-dark-color: var(--text-primary);
          --lcb-dark-border: var(--border-secondary);
          --lcb-dark-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          --lcb-dark-hover-bg: #334155;
          --lcb-dark-hover-color: #93c5fd;
          --lcb-dark-hover-border: #60a5fa;
          --lcb-dark-hover-shadow: 0 4px 14px rgba(59, 130, 246, 0.2);
        `}

  [data-theme='dark'] & {
    background: var(--lcb-dark-bg);
    color: var(--lcb-dark-color);
    border-color: var(--lcb-dark-border);
    box-shadow: var(--lcb-dark-shadow);
  }

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    background: var(--lcb-hover-bg);
    color: var(--lcb-hover-color);
    border-color: var(--lcb-hover-border);
    box-shadow: var(--lcb-hover-shadow);

    [data-theme='dark'] & {
      background: var(--lcb-dark-hover-bg);
      color: var(--lcb-dark-hover-color);
      border-color: var(--lcb-dark-hover-border);
      box-shadow: var(--lcb-dark-hover-shadow);
    }
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &:hover:not(:disabled) svg {
    transform: ${(p: any) => (p.$copied ? 'scale(1.15)' : 'scale(1.1)')};
  }

  @media (max-width: 600px) {
    padding: 0.42rem 0.75rem;
    font-size: 0.8rem;
  }
`;

export const Card = styled.div<{ $variant?: 'default' | 'success' | 'warning' | 'danger' }>`
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: ${cardEntrance} 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  &:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
  &:active { transform: translateY(0); }

  ${(p: any) => {
    switch (p.$variant) {
      case 'success':
        return `
          --card-bg: linear-gradient(135deg, #f0fdf4, #dcfce7);
          --card-border: #86efac;
          --card-dark-bg: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.22));
          --card-dark-border: rgba(52, 211, 153, 0.35);
        `;
      case 'warning':
        return `
          --card-bg: linear-gradient(135deg, #fffbeb, #fef3c7);
          --card-border: #fcd34d;
          --card-dark-bg: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(120, 53, 15, 0.22));
          --card-dark-border: rgba(251, 191, 36, 0.35);
        `;
      case 'danger':
        return `
          --card-bg: linear-gradient(135deg, #fef2f2, #fee2e2);
          --card-border: #fca5a5;
          --card-dark-bg: linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(127, 29, 29, 0.28));
          --card-dark-border: rgba(248, 113, 113, 0.38);
        `;
      default:
        return `
          --card-bg: var(--bg-secondary);
          --card-border: var(--border-primary);
          --card-dark-bg: var(--bg-secondary);
          --card-dark-border: var(--border-primary);
        `;
    }
  }}

  [data-theme='dark'] & {
    background: var(--card-dark-bg);
    border-color: var(--card-dark-border);
  }

  @media (max-width: 480px) { padding: 1rem; border-radius: 8px; }
`;

export const LinkCard = styled(Card)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

export const Badge = styled.span<{ $color: 'green' | 'red' | 'yellow' | 'gray' | 'blue' | 'purple' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  animation: ${badgePop} 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition: transform 0.2s ease;
  background: var(--badge-bg);
  color: var(--badge-color);
  border: 1px solid var(--badge-border);

  ${(p: any) => {
    switch (p.$color) {
      case 'green':
        return `
          --badge-bg: #dcfce7;
          --badge-color: #166534;
          --badge-border: transparent;
          --badge-dark-bg: rgba(16, 185, 129, 0.18);
          --badge-dark-color: #34d399;
          --badge-dark-border: rgba(52, 211, 153, 0.3);
        `;
      case 'red':
        return `
          --badge-bg: #fee2e2;
          --badge-color: #991b1b;
          --badge-border: transparent;
          --badge-dark-bg: rgba(239, 68, 68, 0.2);
          --badge-dark-color: #fca5a5;
          --badge-dark-border: rgba(248, 113, 113, 0.35);
        `;
      case 'yellow':
        return `
          --badge-bg: #fef3c7;
          --badge-color: #92400e;
          --badge-border: transparent;
          --badge-dark-bg: rgba(245, 158, 11, 0.18);
          --badge-dark-color: #fcd34d;
          --badge-dark-border: rgba(251, 191, 36, 0.3);
        `;
      case 'gray':
        return `
          --badge-bg: #f3f4f6;
          --badge-color: #374151;
          --badge-border: transparent;
          --badge-dark-bg: rgba(148, 163, 184, 0.16);
          --badge-dark-color: #cbd5e1;
          --badge-dark-border: rgba(148, 163, 184, 0.28);
        `;
      case 'blue':
        return `
          --badge-bg: #dbeafe;
          --badge-color: #1e40af;
          --badge-border: transparent;
          --badge-dark-bg: rgba(59, 130, 246, 0.2);
          --badge-dark-color: #93c5fd;
          --badge-dark-border: rgba(96, 165, 250, 0.3);
        `;
      case 'purple':
        return `
          --badge-bg: #f3e8ff;
          --badge-color: #7e22ce;
          --badge-border: transparent;
          --badge-dark-bg: rgba(168, 85, 247, 0.2);
          --badge-dark-color: #d8b4fe;
          --badge-dark-border: rgba(192, 132, 252, 0.32);
        `;
      default:
        return `
          --badge-bg: transparent;
          --badge-color: inherit;
          --badge-border: transparent;
          --badge-dark-bg: transparent;
          --badge-dark-color: inherit;
          --badge-dark-border: transparent;
        `;
    }
  }}

  [data-theme='dark'] & {
    background: var(--badge-dark-bg);
    color: var(--badge-dark-color);
    border-color: var(--badge-dark-border);
  }
`;

export const LockdownMetaText = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: #991b1b;

  [data-theme='dark'] & {
    color: #fca5a5;
  }
`;

export const LinkTimerText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #047857;

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  [data-theme='dark'] & {
    color: #34d399;
  }
`;

export const StatusDot = styled.span<{ $color: 'green' | 'red' | 'yellow' | 'gray' }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  background-color: ${(p: any) => {
    switch (p.$color) {
      case 'green': return '#22c55e';
      case 'red': return '#ef4444';
      case 'yellow': return '#f59e0b';
      case 'gray': return '#9ca3af';
      default: return '#9ca3af';
    }
  }};
  ${(p: any) => p.$color === 'green' && css`animation: ${pulse} 2s ease-in-out infinite;`}
`;

export const LinkUrlBox = styled.div`
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  padding: 0.6rem 1rem;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--text-secondary);
  word-break: break-all;
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.25s ease;
  &:hover { border-color: var(--accent-blue); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.08); }
`;

export const CopyButton = styled.button`
  background: none;
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 600;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
  &:hover { background: var(--bg-hover); border-color: var(--text-muted); color: var(--text-primary); transform: scale(1.05); }
  &:active { transform: scale(0.95); }
`;

export const UsedByList = styled.div`
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: 0.5rem;
  transition: color 0.3s ease;
`;

export const LockdownPanel = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--border-primary);
  margin-bottom: 1rem;
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  animation: ${slideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  &:hover { box-shadow: var(--shadow-sm); }
  @media (max-width: 480px) { padding: 0.75rem; gap: 0.4rem; }
`;

export const LockdownOption = styled.button<{ $active?: boolean }>`
  padding: 0.5rem 1rem;
  border-radius: 10px;
  border: 1px solid ${(p: any) => p.$active ? '#3B82F6' : 'var(--border-secondary)'};
  background: ${(p: any) => p.$active ? '#3B82F6' : 'var(--bg-secondary)'};
  color: ${(p: any) => p.$active ? 'white' : 'var(--text-secondary)'};
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: ${(p: any) => p.$active ? '0 4px 14px rgba(59, 130, 246, 0.3)' : 'none'};
  &:hover { border-color: #3B82F6; transform: translateY(-2px); box-shadow: 0 4px 14px rgba(59, 130, 246, 0.2); }
  &:active { transform: translateY(0) scale(0.97); }
`;

export const AuditLogEntry = styled.div<{ $type?: string }>`
  padding: 0.6rem 0.8rem;
  border-left: 3px solid ${(p: any) => {
    if (p.$type?.includes('blocked')) return '#ef4444';
    if (p.$type?.includes('unblocked')) return '#22c55e';
    if (p.$type?.includes('bruteforce') || p.$type?.includes('auth_failed')) return '#dc2626';
    if (p.$type?.includes('failed') || p.$type?.includes('rate_limit')) return '#f59e0b';
    if (p.$type?.includes('temp_link')) return '#3B82F6';
    if (p.$type?.includes('lockdown')) return '#8b5cf6';
    if (p.$type?.includes('force')) return '#f97316';
    if (p.$type?.includes('disappear') || p.$type?.includes('deleted')) return '#f43f5e';
    if (p.$type?.includes('hidden')) return '#8b5cf6';
    return '#94a3b8';
  }};
  background: var(--bg-tertiary);
  margin-bottom: 0.5rem;
  border-radius: 0 8px 8px 0;
  font-size: 0.85rem;
  animation: ${cardEntrance} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-primary);
  transition: all 0.25s ease;
  &:hover { transform: translateX(4px); background: var(--bg-hover); }
  @media (max-width: 480px) { padding: 0.5rem 0.6rem; font-size: 0.8rem; }
`;

export const AdminLogLink = styled.a`
  color: #3B82F6;
  text-decoration: none;
  font-weight: 600;
  &:hover { text-decoration: underline; }
  [data-theme='dark'] & { color: #f59e0b; }
`;

export const ScrollContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  padding-right: 0.5rem;
  @media (max-width: 768px) {
    flex: none;
    min-height: auto;
    overflow: visible;
    padding-right: 0;
  }
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
  text-align: center;
  gap: 0.75rem;
  transition: color 0.3s ease;
  animation: ${slideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1);

  svg { animation: ${emptyFloat} 3s ease-in-out infinite; }
`;

export const CustomTimeInput = styled.input`
  padding: 0.5rem;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  font-size: 0.85rem;
  width: 100px;
  background: var(--bg-input);
  color: var(--text-primary);
  transition: border-color 0.3s ease, background-color 0.3s ease, color 0.3s ease;
  &:focus { outline: none; border-color: var(--border-focus); }
`;

export const ClearHistoryButton = styled(Button)`
  background-color: #e53e3e;
  flex-shrink: 0;
  &:hover { background-color: #c53030; }
`;

export const DeleteRoomButton = styled(Button)`
  background-color: #991b1b;
  color: white;
  border: none;
  flex-shrink: 0;
  transition: all 0.2s;
  &:hover { 
    background-color: #7f1d1d; 
    box-shadow: 0 4px 12px rgba(153, 27, 27, 0.4);
  }
`;

export const HideFrontendButton = styled(Button)`
  background-color: #d97706;
  flex-shrink: 0;
  &:hover { background-color: #b45309; }
`;
