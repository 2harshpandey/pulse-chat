import styled, { css } from 'styled-components';

// ==========================================
// --- Side Panel & Media Gallery Styles ---
// ==========================================

export const SidePanelTabBar = styled.div`
  display: flex;
  gap: 4px;
  margin-bottom: 0.85rem;
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  padding: 3px;
  flex-shrink: 0;

  [data-theme='light'] & {
    background: #e2e8f0;
    border-color: #cbd5e1;
  }
`;

export const SidePanelTab = styled.button<{ $active?: boolean }>`
  flex: 1;
  padding: 6px 0;
  border-radius: 7px;
  border: none;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background-color 0.14s ease, color 0.14s ease, transform 0.14s ease;
  letter-spacing: 0.01em;

  span {
    color: inherit;
    transition: color 0.2s ease;
  }

  svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  &:active {
    transform: translateY(0) scale(0.96);
  }

  /* ─────────────── DARK MODE (DEFAULT) ─────────────── */
  /* Inactive state */
  background: transparent;
  color: var(--text-secondary);
  box-shadow: none;

  svg {
    opacity: 0.75;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
      transform: translateY(-1px);

      svg {
        opacity: 1;
        transform: scale(1.08);
      }
    }
  }

  /* Active state */
  &[aria-selected='true'],
  &[data-active='true'] {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95));
    color: #ffffff;
    box-shadow: 0 2px 10px rgba(59, 130, 246, 0.35);

    svg {
      opacity: 1;
      stroke: #ffffff;
    }

    &:hover {
      background: linear-gradient(135deg, rgba(37, 99, 235, 1), rgba(29, 78, 216, 1));
      color: #ffffff;
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);

      svg {
        opacity: 1;
        stroke: #ffffff;
        transform: scale(1.08);
      }
    }
  }

  /* ─────────────── LIGHT MODE ─────────────── */
  /* Inactive state - high contrast dark slate on light grey container */
  [data-theme='light'] & {
    background: transparent;
    color: #334155;
    box-shadow: none;

    svg {
      opacity: 0.85;
      stroke: #334155;
    }

    &:hover {
      background: rgba(255, 255, 255, 0.75);
      color: #0f172a;
      transform: translateY(-1px);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);

      svg {
        opacity: 1;
        stroke: #0f172a;
        transform: scale(1.08);
      }
    }
  }

  /* Active state - vibrant blue gradient with crisp white text and icon */
  [data-theme='light'] &[aria-selected='true'],
  [data-theme='light'] &[data-active='true'] {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);

    svg {
      opacity: 1;
      stroke: #ffffff;
    }

    &:hover {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);

      svg {
        opacity: 1;
        stroke: #ffffff;
        transform: scale(1.08);
      }
    }
  }

  ${p => p.$active && css`
    &[aria-selected='true'],
    &[data-active='true'],
    & {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95));
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(59, 130, 246, 0.35);

      svg {
        opacity: 1;
        stroke: #ffffff;
      }

      &:hover {
        background: linear-gradient(135deg, rgba(37, 99, 235, 1), rgba(29, 78, 216, 1));
        color: #ffffff;
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);

        svg {
          opacity: 1;
          stroke: #ffffff;
          transform: scale(1.08);
        }
      }
    }

    [data-theme='light'] &[aria-selected='true'],
    [data-theme='light'] &[data-active='true'],
    [data-theme='light'] & {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);

      svg {
        opacity: 1;
        stroke: #ffffff;
      }

      &:hover {
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        color: #ffffff;
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);

        svg {
          opacity: 1;
          stroke: #ffffff;
          transform: scale(1.08);
        }
      }
    }
  `}
`;

export const MediaGalleryPanelRoot = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
`;

export const MediaGalleryFilterBar = styled.div`
  display: flex;
  gap: 4px;
  padding-bottom: 8px;
  flex-shrink: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

export const MediaGalleryFilterChip = styled.button<{ $active?: boolean }>`
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid ${p => p.$active ? 'rgba(59, 130, 246, 0.8)' : 'var(--border-primary)'};
  background: ${p => p.$active ? 'rgba(59, 130, 246, 0.22)' : 'rgba(15, 23, 42, 0.3)'};
  color: ${p => p.$active ? '#93c5fd' : 'var(--text-secondary)'};
  font-size: 0.70rem;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: ${p => p.$active ? '0 0 10px rgba(59, 130, 246, 0.25)' : 'none'};
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
  letter-spacing: 0.01em;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      border-color: rgba(59, 130, 246, 0.6);
      background: rgba(59, 130, 246, 0.12);
      color: #93c5fd;
      transform: scale(1.03);
    }
  }

  &:active {
    transform: scale(0.95);
  }

  [data-theme='light'] & {
    background: ${p => p.$active ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0, 0, 0, 0.05)'};
    color: ${p => p.$active ? '#2563eb' : 'var(--text-secondary)'};
    border-color: ${p => p.$active ? 'rgba(59, 130, 246, 0.6)' : 'var(--border-secondary)'};

    &:hover {
      background: rgba(59, 130, 246, 0.1);
      color: #2563eb;
    }
  }
`;

export const MediaGalleryScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 4px;
  }

  [data-theme='light'] & {
    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.15);
    }
  }
`;

export const MediaGalleryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  align-content: start;
`;

export const MediaGalleryDateDivider = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin: 14px 0 6px 0;
  padding: 0 4px;
  user-select: none;

  &:first-child {
    margin-top: 4px;
  }

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0),
      rgba(255, 255, 255, 0.08) 25%,
      rgba(255, 255, 255, 0.14) 75%,
      rgba(255, 255, 255, 0)
    );

    [data-theme='light'] & {
      background: linear-gradient(
        to right,
        rgba(0, 0, 0, 0),
        rgba(0, 0, 0, 0.07) 25%,
        rgba(0, 0, 0, 0.12) 75%,
        rgba(0, 0, 0, 0)
      );
    }
  }

  @media (hover: hover) and (pointer: fine) {
    @keyframes mgDateFadeIn {
      from {
        opacity: 0;
        transform: translateY(-4px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    animation: mgDateFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
`;

export const MediaGalleryDateBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: capitalize;
  color: var(--text-secondary);
  background: rgba(30, 41, 59, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  margin: 0 8px;
  white-space: nowrap;
  pointer-events: none;

  [data-theme='light'] & {
    background: rgba(241, 245, 249, 0.95);
    border-color: rgba(0, 0, 0, 0.08);
    color: #475569;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
  }
`;

export const MediaGalleryTile = styled.div`
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.6);
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  contain: content;
  content-visibility: auto;
  contain-intrinsic-size: 100px 100px;
  transition: transform 0.15s ease, border-color 0.15s ease;

  [data-theme='light'] & {
    background: rgba(0, 0, 0, 0.04);
    border-color: var(--border-secondary);
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: scale(1.03);
      z-index: 2;
      border-color: rgba(59, 130, 246, 0.5);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    }
  }

  &:active {
    transform: scale(0.97);
  }

  &:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.7);
    outline-offset: 2px;
  }
`;

export const MediaGalleryTileImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
`;

export const MediaGalleryPlayOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  transition: background 0.15s ease;
  pointer-events: none;

  @media (hover: hover) and (pointer: fine) {
    ${MediaGalleryTile}:hover & {
      background: rgba(0, 0, 0, 0.45);
    }
  }
`;

export const MediaGalleryPlayIconCircle = styled.div`
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s ease;

  svg {
    width: 13px;
    height: 13px;
    fill: #ffffff;
    margin-left: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    ${MediaGalleryTile}:hover & {
      transform: scale(1.12);
    }
  }
`;

export const MediaGalleryDurationBadge = styled.div`
  position: absolute;
  bottom: 4px;
  right: 4px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.78);
  color: #f1f5f9;
  font-size: 0.64rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  pointer-events: none;
`;

export const MediaGalleryDocCard = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid var(--border-primary);
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  color: var(--text-secondary);
  font-size: 0.75rem;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(59, 130, 246, 0.09);
      border-color: rgba(59, 130, 246, 0.35);
      color: var(--text-primary);
      transform: translateX(2px);
    }
  }

  &:active {
    transform: scale(0.98);
  }

  &:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.7);
    outline-offset: 2px;
  }

  [data-theme='light'] & {
    background: rgba(0, 0, 0, 0.03);
    border-color: var(--border-secondary);

    &:hover {
      background: rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.3);
    }
  }
`;

export const MediaGalleryDocIcon = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #60a5fa;

  svg {
    width: 17px;
    height: 17px;
  }
`;

export const MediaGalleryDocInfo = styled.div`
  flex: 1;
  min-width: 0;
  overflow: hidden;
`;

export const MediaGalleryDocName = styled.div`
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const MediaGalleryDocMeta = styled.div`
  font-size: 0.67rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 1px;
`;

export const MediaGalleryLinkCard = styled(MediaGalleryDocCard)`
  &:hover {
    border-color: rgba(56, 189, 248, 0.4);
    background: rgba(56, 189, 248, 0.08);
  }
`;

export const MediaGalleryLinkIcon = styled(MediaGalleryDocIcon)`
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.25);
  color: #38bdf8;
`;

export const MediaGalleryEmptyState = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 16px;
  color: var(--text-muted);
  font-size: 0.8rem;
  text-align: center;

  svg {
    opacity: 0.4;
    color: var(--text-muted);
    width: 36px;
    height: 36px;
  }

  span {
    max-width: 180px;
    line-height: 1.4;
  }
`;

export const MediaGalleryErrorState = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 12px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  font-size: 0.76rem;
  text-align: center;

  button {
    margin-top: 4px;
    padding: 3px 10px;
    border-radius: 6px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.2);
    color: #ffffff;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.18s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.35);
    }
  }
`;

export const MediaGallerySpinner = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 0;

  &::after {
    content: '';
    width: 22px;
    height: 22px;
    border: 2px solid rgba(59, 130, 246, 0.2);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: mgSpin 0.7s linear infinite;
  }

  @keyframes mgSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const MediaGallerySentinel = styled.div`
  height: 2px;
  grid-column: 1 / -1;
`;
