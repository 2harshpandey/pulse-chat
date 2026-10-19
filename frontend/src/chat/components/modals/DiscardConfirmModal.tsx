import React from 'react';
import {
  ConfirmationModal,
  DiscardDialog,
  DiscardTitle,
  DiscardActions,
  DiscardBtnCancel,
  DiscardBtnConfirm,
} from '../../Chat.styles';

export interface DiscardConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DiscardConfirmModal: React.FC<DiscardConfirmModalProps> = ({
  isOpen,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <ConfirmationModal onClick={onCancel}>
      <DiscardDialog onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <DiscardTitle>Discard selection?</DiscardTitle>
        <DiscardActions>
          <DiscardBtnCancel onClick={onCancel}>Cancel</DiscardBtnCancel>
          <DiscardBtnConfirm onClick={onConfirm}>Discard</DiscardBtnConfirm>
        </DiscardActions>
      </DiscardDialog>
    </ConfirmationModal>
  );
};
