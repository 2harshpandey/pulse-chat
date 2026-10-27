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

export const AlbumDownloadToast = styled.div<{ $visible: boolean; $isError?: boolean }>`
  position: absolute;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%) translateY(${p => p.$visible ? '0' : '16px'}) scale(${p => p.$visible ? 1 : 0.94});
  opacity: ${p => p.$visible ? 1 : 0};
  pointer-events: ${p => p.$visible ? 'auto' : 'none'};
  background: ${p => p.$isError ? 'rgba(30, 15, 20, 0.94)' : 'rgba(15, 23, 42, 0.92)'};
  color: ${p => p.$isError ? '#fecaca' : '#f1f5f9'};
  padding: 10px 22px;
  border-radius: 30px;
  font-size: 0.88rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: ${p => p.$isError 
    ? '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(239, 68, 68, 0.35)' 
    : '0 10px 30px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(56, 189, 248, 0.18)'};
  transition: all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 10002;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid ${p => p.$isError ? 'rgba(239, 68, 68, 0.45)' : 'rgba(56, 189, 248, 0.25)'};
  max-width: min(calc(100vw - 48px), 640px);
  width: max-content;
  justify-content: center;
  box-sizing: border-box;
  white-space: normal;
  word-break: break-word;
  text-align: center;
  line-height: 1.4;

  [data-theme='light'] & {
    background: ${p => p.$isError ? 'rgba(254, 242, 242, 0.96)' : 'rgba(255, 255, 255, 0.95)'};
    color: ${p => p.$isError ? '#991b1b' : '#0f172a'};
    border: 1px solid ${p => p.$isError ? 'rgba(239, 68, 68, 0.5)' : '#cbd5e1'};
    box-shadow: ${p => p.$isError
      ? '0 10px 25px rgba(239, 68, 68, 0.2), 0 0 0 1px rgba(239, 68, 68, 0.3)'
      : '0 10px 25px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'};
  }

  svg {
    width: 17px;
    height: 17px;
    color: ${p => p.$isError ? '#ef4444' : '#38bdf8'};
    stroke: ${p => p.$isError ? '#ef4444' : '#38bdf8'};
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    bottom: 82px;
    padding: 11px 18px;
    font-size: 0.83rem;
    width: calc(100vw - 32px);
    max-width: calc(100vw - 32px);
    border-radius: 24px;
  }
`;

export const AlbumDownloadCancelButton = styled.button`
  background: rgba(244, 63, 94, 0.16);
  border: 1px solid rgba(244, 63, 94, 0.35);
  color: #fda4af;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;

  svg {
    width: 12px;
    height: 12px;
    color: #fda4af;
    animation: none !important;
  }

  &:hover {
    background: rgba(244, 63, 94, 0.28);
    border-color: rgba(244, 63, 94, 0.6);
    color: #fff;
    transform: scale(1.05);

    svg {
      color: #fff;
    }
  }

  &:active {
    transform: scale(0.95);
  }
`;

// Re-export all styled components from ChatStyledComponents
export * from './ChatStyledComponents';
