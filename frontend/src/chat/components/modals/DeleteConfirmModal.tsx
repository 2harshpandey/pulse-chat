import React, { useEffect } from 'react';
import {
  DeleteDialogOverlay,
  DeleteDialogCard,
  DeleteDialogTitle,
  DeleteDialogSubtitle,
  DeleteDialogActions,
  DeleteBtnPrimary,
  DeleteBtnSecondary,
  DeleteBtnCancel,
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
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isPlural = selectedCount > 1;
  const showDeleteForEveryone = Boolean(canDeleteForEveryone && onDeleteForEveryone);

  return (
    <DeleteDialogOverlay
      data-testid="delete-confirm-overlay"
      onClick={onCancel}
    >
      <DeleteDialogCard
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        data-testid="delete-confirm-dialog"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <DeleteDialogTitle id="delete-confirm-title">
          Delete {selectedCount} message{isPlural ? 's' : ''}?
        </DeleteDialogTitle>

        <DeleteDialogSubtitle>
          {showDeleteForEveryone
            ? `Choose whether to remove ${isPlural ? 'these messages' : 'this message'} for everyone or only from your view.`
            : `This will remove ${isPlural ? 'these messages' : 'this message'} from your session view.`}
        </DeleteDialogSubtitle>

        <DeleteDialogActions $columns={showDeleteForEveryone ? 1 : 2}>
          {showDeleteForEveryone && onDeleteForEveryone ? (
            <>
              <DeleteBtnPrimary type="button" onClick={onDeleteForEveryone}>
                Delete for everyone
              </DeleteBtnPrimary>
              <DeleteBtnSecondary type="button" onClick={onDeleteForMe}>
                Delete for me
              </DeleteBtnSecondary>
              <DeleteBtnCancel type="button" onClick={onCancel}>
                Cancel
              </DeleteBtnCancel>
            </>
          ) : (
            <>
              <DeleteBtnCancel type="button" onClick={onCancel}>
                Cancel
              </DeleteBtnCancel>
              <DeleteBtnPrimary type="button" onClick={onDeleteForMe}>
                Delete for me
              </DeleteBtnPrimary>
            </>
          )}
        </DeleteDialogActions>
      </DeleteDialogCard>
    </DeleteDialogOverlay>
  );
};
