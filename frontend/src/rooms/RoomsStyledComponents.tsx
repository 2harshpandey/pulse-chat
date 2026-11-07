import styled, { keyframes, createGlobalStyle } from 'styled-components';

export const GlobalRoomsStyle = createGlobalStyle`
  html, body, #root {
    position: static !important;
    overflow: visible !important;
    height: auto !important;
    min-height: 100vh !important;
  }
  body {
    overflow-x: clip !important;
    background-color: var(--bg-primary);
    margin: 0;
    font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;

export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const modalScaleIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
`;

export const TopControls = styled.div`
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 40;

  @media (max-width: 768px) {
    top: 1rem;
    left: 1rem;
    gap: 0.5rem;
  }
`;

export const NavCircleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  text-decoration: none;

  svg {
    width: 20px;
    height: 20px;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s ease;
  }

  &:hover {
    background: var(--bg-hover);
    border-color: rgba(59, 130, 246, 0.4);
    color: var(--text-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.15);

    svg {
      color: var(--accent-blue);
    }
  }

  &:active {
    transform: translateY(0);
  }
`;

export const ThemeToggle = NavCircleButton;

export const PageContainer = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  padding: 5.5rem 2.5rem 5rem;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  z-index: 10;
  box-sizing: border-box;

  @media (max-width: 768px) {
    padding: 5rem 1.25rem 3rem;
  }
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 2.25rem;
  flex-wrap: wrap;
  gap: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const HeaderActions = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 800px) {
    width: 100%;
    justify-content: flex-start;
  }

  @media (max-width: 640px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
    width: 100%;
    max-width: 420px;

    button {
      width: 100%;
      justify-content: center;
      padding: 0.8rem 0.5rem;
      font-size: 0.9rem;
      box-sizing: border-box;
    }

    button:last-child {
      grid-column: 1 / -1;
      padding: 0.85rem 1rem;
      font-size: 0.95rem;
    }
  }

  @media (max-width: 360px) {
    button {
      padding: 0.75rem 0.25rem;
      font-size: 0.825rem;
    }
  }
`;

export const Title = styled.h1`
  font-size: 2.25rem;
  font-weight: 800;
  margin: 0 0 0.4rem;
  color: var(--text-heading);
  letter-spacing: -0.02em;
`;

export const Subtitle = styled.p`
  margin: 0;
  color: var(--text-secondary);
  font-size: 1.05rem;
  line-height: 1.5;
`;

export const Button = styled.button<{ $primary?: boolean }>`
  background: ${p => p.$primary ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--bg-secondary)'};
  color: ${p => p.$primary ? '#ffffff' : 'var(--text-primary)'};
  border: ${p => p.$primary ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid var(--border-primary)'};
  padding: 0.75rem 1.35rem;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  box-shadow: ${p => p.$primary 
    ? 'inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 1px 2px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(37, 99, 235, 0.35)' 
    : '0 1px 2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.05)'};

  &:hover {
    transform: translateY(-1px);
    background: ${p => p.$primary ? 'linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%)' : 'var(--bg-hover)'};
    border-color: ${p => p.$primary ? 'rgba(255, 255, 255, 0.3)' : 'var(--border-secondary)'};
    color: ${p => p.$primary ? '#ffffff' : 'var(--text-heading)'};
    box-shadow: ${p => p.$primary 
      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 4px rgba(0, 0, 0, 0.12), 0 6px 16px -2px rgba(37, 99, 235, 0.45)' 
      : '0 4px 12px rgba(0, 0, 0, 0.08)'};
  }

  &:active {
    transform: translateY(0);
    box-shadow: ${p => p.$primary 
      ? 'inset 0 1px 2px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.05)' 
      : 'inset 0 1px 1px rgba(0, 0, 0, 0.1)'};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

export const JoinButton = styled.button`
  background: var(--bg-hover);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  padding: 0.45rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover {
    transform: translateY(-1px);
    background: #2563eb;
    border-color: #2563eb;
    color: #ffffff;
    box-shadow: 0 3px 10px rgba(37, 99, 235, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 1.5rem;
`;

export const RoomCard = styled.div`
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 18px;
  padding: 1.5rem;
  box-shadow: var(--shadow-card);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-card-hover);
    border-color: rgba(59, 130, 246, 0.35);
  }
`;

export const RoomDescription = styled.div`
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.5;
  border-top: 1px solid var(--border-primary);
  padding-top: 0.65rem;
  margin-top: 0.35rem;
  word-break: break-word;
  overflow-wrap: break-word;
  max-height: 4.5em;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-primary);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
`;

export const RoomHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.85rem;
  gap: 0.5rem;
`;

export const RoomName = styled.h3`
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-heading);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  word-break: break-all;

  svg {
    flex-shrink: 0;
  }
`;

export const CopyIcon = styled.button<{ $copied?: boolean }>`
  background: ${p => (p.$copied ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-elevated)')};
  border: 1px solid ${p => (p.$copied ? 'rgba(34, 197, 94, 0.4)' : 'var(--border-secondary)')};
  border-radius: 6px;
  color: ${p => (p.$copied ? '#22c55e' : 'var(--text-secondary)')};
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover {
    background: ${p => (p.$copied ? 'rgba(34, 197, 94, 0.25)' : 'rgba(59, 130, 246, 0.15)')};
    border-color: ${p => (p.$copied ? 'rgba(34, 197, 94, 0.6)' : 'rgba(59, 130, 246, 0.5)')};
    color: ${p => (p.$copied ? '#22c55e' : 'var(--accent-blue)')};
    transform: scale(1.06);
  }

  &:active {
    transform: scale(0.96);
  }
`;

export const RoomBadge = styled.span<{ $private?: boolean }>`
  font-size: 0.75rem;
  padding: 0.2rem 0.65rem;
  border-radius: 9999px;
  font-weight: 600;
  background: ${p => p.$private ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'};
  color: ${p => p.$private ? '#ef4444' : '#10b981'};
  border: 1px solid ${p => p.$private ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'};
  flex-shrink: 0;
`;

export const RoomStats = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 1.15rem;
  border-top: 1px solid var(--border-primary);
`;

export const Stat = styled.span`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  color: var(--text-secondary);

  svg {
    width: 16px;
    height: 16px;
    color: var(--text-tertiary);
  }
`;

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: var(--modal-overlay-bg, rgba(15, 23, 42, 0.5));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
`;

export const ModalContent = styled.div`
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  border-radius: 22px;
  padding: 2.25rem;
  width: 100%;
  max-width: 450px;
  box-shadow: var(--shadow-modal);
  animation: ${modalScaleIn} 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;

  @media (max-width: 480px) {
    padding: 1.5rem;
    border-radius: 20px;
  }
`;

export const FormGroup = styled.div`
  margin-bottom: 1.25rem;
`;

export const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
`;

export const Input = styled.input`
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-secondary);
  color: var(--text-primary);
  padding: 0.8rem 1rem;
  border-radius: 12px;
  font-size: 0.95rem;
  font-family: inherit;
  transition: all 0.2s ease;
  box-sizing: border-box;

  &::placeholder {
    color: var(--text-tertiary);
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }
`;

export const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 0.925rem;
  font-weight: 500;
  user-select: none;
`;

export const ErrorMessageContainer = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
  font-size: 0.875rem;
  font-weight: 500;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  animation: ${fadeInUp} 0.25s cubic-bezier(0.16, 1, 0.3, 1);

  svg {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 0.1rem;
  }
`;

export const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

export const PasswordToggle = styled.button`
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.4rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;

  &:hover {
    color: var(--text-primary);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

export const ClearButton = styled.button`
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

export const Orb = styled.div<{ $color: string; $size: string; $top: string; $left: string }>`
  position: fixed;
  width: ${p => p.$size};
  height: ${p => p.$size};
  background: radial-gradient(circle at center, ${p => p.$color} 0%, transparent 68%);
  top: ${p => p.$top};
  left: ${p => p.$left};
  opacity: var(--orb-opacity, 0.14);
  filter: blur(80px);
  pointer-events: none;
  z-index: 1;
`;
