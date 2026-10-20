import styled from 'styled-components';

export const ModalOverlay = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
`;

export const ModalContent = styled.div`
  background: var(--bg-elevated, #1e293b);
  border: 1px solid var(--border-primary, #334155);
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  padding: 1.5rem;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
  color: white;
`;

export const ModalHeader = styled.h3`
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: var(--text-heading, #f8fafc);
`;

export const ModalBody = styled.p`
  margin: 0 0 1.5rem 0;
  font-size: 0.95rem;
  color: var(--text-secondary, #94a3b8);
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
`;

export const RadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1.5rem 0;
`;

export const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-primary, #334155);
  background: rgba(255,255,255,0.02);
  transition: all 0.2s;
  &:hover { background: rgba(255,255,255,0.05); }
  input:checked + span {
    color: var(--accent-blue, #3b82f6);
    font-weight: 600;
  }
`;
