import React from 'react';
import type { Message } from '../../types';
import { MIN_REPORT_REASON_LENGTH, MAX_REPORT_REASON_LENGTH } from '../../constants';
import {
  ReportModal as StyledReportModal,
  ReportDialog,
  ReportTitle,
  ReportSubtext,
  ReportMessageMeta,
  ReportReasonInput,
  ReportReasonMeta,
  ReportError,
  ReportActions,
  ConfirmationButton,
} from '../../Chat.styles';

export interface ReportModalProps {
  isOpen: boolean;
  targetMessage: Message | null;
  reportReason: string;
  onReportReasonChange: (reason: string) => void;
  reportError: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  targetMessage,
  reportReason,
  onReportReasonChange,
  reportError,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  if (!isOpen || !targetMessage) return null;

  const messagePreview =
    targetMessage.text?.trim() ||
    (targetMessage.type === 'image'
      ? '[Image message]'
      : targetMessage.type === 'video'
      ? '[Video message]'
      : targetMessage.type === 'file'
      ? '[File attachment]'
      : '[No text content]');

  return (
    <StyledReportModal onClick={onClose}>
      <ReportDialog onClick={(e) => e.stopPropagation()}>
        <ReportTitle>Report user</ReportTitle>
        <ReportSubtext>
          Reported user: <strong>{targetMessage.username}</strong>
        </ReportSubtext>
        <ReportMessageMeta>
          <strong>Reported message</strong>
          <span>{messagePreview}</span>
        </ReportMessageMeta>
        <ReportReasonInput
          value={reportReason}
          onChange={(e) => onReportReasonChange(e.target.value)}
          placeholder="Tell us why this user/message should be reviewed..."
          maxLength={MAX_REPORT_REASON_LENGTH}
          autoFocus={!('ontouchstart' in window || navigator.maxTouchPoints > 0)}
        />
        <ReportReasonMeta>
          <span>Minimum {MIN_REPORT_REASON_LENGTH} characters</span>
          <span>
            {reportReason.length}/{MAX_REPORT_REASON_LENGTH}
          </span>
        </ReportReasonMeta>
        {reportError && <ReportError>{reportError}</ReportError>}
        <ReportActions>
          <ConfirmationButton className="cancel" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </ConfirmationButton>
          <ConfirmationButton className="delete" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit report'}
          </ConfirmationButton>
        </ReportActions>
      </ReportDialog>
    </StyledReportModal>
  );
};
