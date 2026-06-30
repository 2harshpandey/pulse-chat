import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styled from 'styled-components';

const ToastContainer = styled.div`
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 320px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: slideIn 0.3s ease-out;

  @keyframes slideIn {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;

const ToastMessage = styled.p`
  margin: 0;
  color: var(--text-primary);
  font-size: 0.95rem;
  line-height: 1.4;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const Button = styled.button`
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }
`;

const CloseButton = styled.button`
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
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
        {offlineReady
          ? 'App is ready to work offline.'
          : 'A new update is available. Reload to apply changes.'}
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
