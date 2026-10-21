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
  }
  body {
    background-color: var(--bg-primary);
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary);
  }
`;

export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const float = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
`;

export const PageContainer = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  padding: 4rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  z-index: 10;

  @media (max-width: 768px) {
    padding: 5rem 1rem 2rem;
  }
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 3rem;
  flex-wrap: wrap;
  gap: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const HeaderActions = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 800px) {
    width: 100%;
    justify-content: flex-start;
  }

  @media (max-width: 500px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    width: 100%;
    
    button {
      width: 100%;
      justify-content: center;
      padding: 0.8rem 0.5rem;
      font-size: 0.95rem;
    }

    button:last-child {
      grid-column: 1 / -1;
    }
  }
`;

export const ThemeToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  text-decoration: none;
  
  position: absolute;
  top: 1.5rem;
  left: 5.5rem;
  z-index: 40;

  @media (max-width: 768px) {
    top: 1rem;
    left: 4.2rem;
    width: 40px;
    height: 40px;
    
    svg {
      width: 18px;
      height: 18px;
    }
  }

  svg {
    width: 22px;
    height: 22px;
    transition: transform 0.3s ease, color 0.3s ease;
  }

  &:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: var(--text-primary);
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4);
  }
  
  &:active {
    transform: translateY(1px);
  }
  
  &:hover svg {
    transform: rotate(30deg);
  }
`;

export const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 800;
  margin: 0 0 0.5rem;
  color: var(--text-heading);
`;

export const Subtitle = styled.p`
  margin: 0;
  color: var(--text-secondary);
  font-size: 1.1rem;
`;

export const Button = styled.button<{ $primary?: boolean }>`
  background: ${p => p.$primary ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'var(--bg-secondary)'};
  color: ${p => p.$primary ? '#ffffff' : 'var(--text-primary)'};
  border: ${p => p.$primary ? 'none' : '1px solid var(--border-primary)'};
  padding: 0.875rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${p => p.$primary ? '0 10px 20px -5px rgba(59, 130, 246, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)'};
    background: ${p => p.$primary ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--bg-hover)'};
    border-color: ${p => p.$primary ? 'transparent' : 'var(--border-secondary, #475569)'};
  }

  @media (max-width: 480px) {
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    width: 100%;
    justify-content: center;
  }
`;

export const JoinButton = styled.button`
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-secondary);
  padding: 0.5rem 1.15rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    transform: translateY(-2px);
    background: rgba(59, 130, 246, 0.15);
    border-color: var(--accent-blue, #3b82f6);
    color: var(--text-heading, #ffffff);
    box-shadow: 0 0 0 1px var(--accent-blue, #3b82f6), 0 4px 12px rgba(59, 130, 246, 0.25);
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
  border-radius: 20px;
  padding: 1.5rem;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-4px);
    background: var(--bg-hover);
    border-color: rgba(59, 130, 246, 0.3);
    box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
  }
`;

export const RoomDescription = styled.div`
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.4;
  border-top: 1px solid var(--border-primary);
  padding-top: 0.5rem;
  margin-top: 0.25rem;
  word-break: break-word;
  overflow-wrap: break-word;
  max-height: 4.2em;
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
  align-items: flex-start;
  margin-bottom: 1rem;
  gap: 0.2rem;
`;

export const RoomName = styled.h3`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  word-break: break-all;
  
  svg {
    flex-shrink: 0;
    margin-top: 0.15rem;
  }
`;

export const CopyIcon = styled.button`
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-secondary);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--border-primary);
    color: var(--text-primary);
    transform: scale(1.05);
  }
  
  &:active {
    transform: scale(0.95);
  }
`;

export const RoomBadge = styled.span<{ $private?: boolean }>`
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-weight: 600;
  background: ${p => p.$private ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'};
  color: ${p => p.$private ? '#ef4444' : '#22c55e'};
  border: 1px solid ${p => p.$private ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'};
  flex-shrink: 0;
`;

export const RoomStats = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-secondary);
`;

export const Stat = styled.span`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  
  svg {
    width: 16px;
    height: 16px;
  }
`;

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(var(--bg-primary-rgb, 15, 23, 42), 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

export const ModalContent = styled.div`
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  border-radius: 24px;
  padding: 2.5rem;
  width: 100%;
  max-width: 460px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: ${float} 0.5s ease-out;

  @media (max-width: 480px) {
    padding: 1.5rem;
    border-radius: 20px;
  }
`;

export const FormGroup = styled.div`
  margin-bottom: 1.5rem;
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
  padding: 0.875rem 1rem;
  border-radius: 12px;
  font-size: 1rem;
  transition: all 0.2s;
  box-sizing: border-box;

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
  font-size: 0.95rem;
  user-select: none;
`;

export const ErrorMessageContainer = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 12px;
  background: var(--error-bg, rgba(239, 68, 68, 0.08));
  border: 1px solid var(--error-border, rgba(239, 68, 68, 0.2));
  color: var(--error-text, #ef4444);
  font-size: 0.9rem;
  font-weight: 500;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  animation: ${fadeInUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.05);

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
  transition: color 0.2s;
  
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
  padding: 0.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;

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
  background: radial-gradient(circle at center, ${p => p.$color} 0%, transparent 65%);
  top: ${p => p.$top};
  left: ${p => p.$left};
  opacity: 0.1;
  pointer-events: none;
  z-index: 1;
`;
