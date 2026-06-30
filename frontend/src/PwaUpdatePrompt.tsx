import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styled from 'styled-components';

const ToastContainer = styled.div`
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: max-content;
  max-width: 90vw;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  animation: slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);

  [data-theme='light'] & {
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(0, 0, 0, 0.05);
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.02) inset;
  }

  @keyframes slideDown {
    from { transform: translate(-50%, -100%); opacity: 0; }
    to { transform: translate(-50%, 0); opacity: 1; }
  }

  @media (max-width: 600px) {
    top: 16px;
    width: calc(100vw - 32px);
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`;

const ToastMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  color: #f8fafc;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.4;

  [data-theme='light'] & {
    color: #0f172a;
  }
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;

  [data-theme='light'] & {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-shrink: 0;

  @media (max-width: 600px) {
    width: 100%;
    justify-content: flex-end;
  }
`;

const Button = styled.button`
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
  }
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  [data-theme='light'] & {
    background: rgba(0, 0, 0, 0.05);
    color: #0f172a;
    border-color: rgba(0, 0, 0, 0.05);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  [data-theme='light'] &:hover {
    background: rgba(0, 0, 0, 0.1);
  }
`;

export const PwaUpdatePrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error: Error | any) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  useEffect(() => {
    if (offlineReady) {
      const timeout = setTimeout(() => {
        setOfflineReady(false);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <ToastContainer>
      <ToastMessage>
        <IconWrapper>
          {offlineReady ? (
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          )}
        </IconWrapper>
        <span>
          {offlineReady
            ? 'App is ready to work offline'
            : 'A new update is available'}
        </span>
      </ToastMessage>
      <ButtonGroup>
        {needRefresh && (
          <Button onClick={() => updateServiceWorker(true)}>
            Reload
          </Button>
        )}
        <CloseButton onClick={close}>Close</CloseButton>
      </ButtonGroup>
    </ToastContainer>
  );
};
