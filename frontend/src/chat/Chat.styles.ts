import styled from 'styled-components';

export const ChatSearchContainer = styled.div<{ $active: boolean; $isClosing?: boolean }>`
  display: flex;
  align-items: center;
  background: ${p => p.$active || p.$isClosing ? 'var(--bg-elevated)' : 'transparent'};
  border-radius: 20px;
  border: none;
  padding: 0;
  width: ${p => p.$active ? '240px' : '40px'};
  height: 40px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  will-change: width;

  @media (max-width: 768px) {
    position: absolute;
    /* When active, move to right: 0 to cover the whole header. When closed, stay at right: 48px (left of Users button) */
    right: ${p => p.$active || p.$isClosing ? '0' : '48px'};
    top: 50%;
    transform: translateY(-50%);
    width: ${p => p.$active ? 'calc(100vw - 2rem)' : '40px'};
    z-index: 10;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
`;

export const SearchPlaceholder = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: block;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
  }
`;

export const HeaderActionsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;

  @media (max-width: 768px) {
    position: relative;
    height: 40px;
    /* Removed padding-right so MobileUserListToggle sits naturally at the right edge */
  }
`;

export const ChatSearchInput = styled.input<{ $active: boolean }>`
  background: transparent;
  border: none;
  color: #fff;
  flex: 1;
  width: 100%;
  min-width: 0;
  opacity: ${p => p.$active ? 1 : 0};
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 0.9rem;
  padding: 0 0 0 0.5rem;
  pointer-events: ${p => p.$active ? 'auto' : 'none'};
  &:focus { outline: none; }
  &::placeholder { color: #94a3b8; }
`;

export const ChatSearchButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  flex-shrink: 0;
  &:hover { 
    transform: scale(1.15); 
    border-color: rgba(59, 130, 246, 0.5); 
    background: rgba(59, 130, 246, 0.1);
    color: var(--text-primary);
    box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4); 
  }
  &:active { transform: scale(0.9); }
  svg { width: 18px; height: 18px; transition: transform 0.5s cubic-bezier(0.34,1.56,0.64,1); }
`;

export const SearchNotFoundToast = styled.div<{ $visible: boolean }>`
  position: absolute;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%) translateY(${p => p.$visible ? '0' : '20px'}) scale(${p => p.$visible ? 1 : 0.95});
  opacity: ${p => p.$visible ? 1 : 0};
  pointer-events: none;
  background: rgba(30, 30, 30, 0.95);
  color: #fff;
  padding: 10px 24px;
  border-radius: 30px;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 1000;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  
  @media (max-width: 768px) {
    bottom: 80px;
    padding: 8px 18px;
    font-size: 0.88rem;
  }
`;

export const CopiedToast = styled.div<{ $visible: boolean }>`
  position: absolute;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%) translateY(${p => p.$visible ? '0' : '20px'}) scale(${p => p.$visible ? 1 : 0.95});
  opacity: ${p => p.$visible ? 1 : 0};
  pointer-events: none;
  background: rgba(22, 27, 34, 0.96);
  color: #f0f6fc;
  padding: 9px 22px;
  border-radius: 30px;
  font-size: 0.92rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 10002;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);

  @media (max-width: 768px) {
    bottom: 80px;
    padding: 8px 18px;
    font-size: 0.86rem;
  }
`;

// Re-export all styled components from ChatStyledComponents
export * from './ChatStyledComponents';
