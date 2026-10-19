import React from 'react';
import {
  ConfirmationModal,
  ConfirmationContent,
  ConfirmationButton,
} from '../../Chat.styles';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  selectedCount: number;
  canDeleteForEveryone?: boolean;
  onCancel: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone?: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  selectedCount,
  canDeleteForEveryone,
  onCancel,
  onDeleteForMe,
  onDeleteForEveryone,
}) => {
  if (!isOpen) return null;

  return (
    <ConfirmationModal onClick={onCancel}>
      <ConfirmationContent onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <h3>
          Delete {selectedCount} message{selectedCount > 1 ? 's' : ''}?
        </h3>
        <div>
          <ConfirmationButton className="cancel" onClick={onCancel}>
            Cancel
          </ConfirmationButton>
          <ConfirmationButton className="delete" onClick={onDeleteForMe}>
            Delete for me
          </ConfirmationButton>
          {canDeleteForEveryone && onDeleteForEveryone && (
            <ConfirmationButton className="delete" onClick={onDeleteForEveryone}>
              Delete for everyone
            </ConfirmationButton>
          )}
        </div>
      </ConfirmationContent>
    </ConfirmationModal>
  );
};
