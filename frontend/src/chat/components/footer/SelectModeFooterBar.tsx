import React from 'react';
import type { Message } from '../../types';
import {
  isPhotoOrGif,
  isGifMessage,
  hasMediaAttachment,
  isNonTouchDevice,
  copyImageToClipboard,
  copyTextToClipboard,
} from '../../utils';
import {
  SelectModeFooter,
  CancelPreviewButton,
  EditButton,
  CopyButton,
  CopyOptionsPopover,
  CopyOptionItem,
  CopyOptionDivider,
  ReportButton,
  DownloadAllButton,
  DeleteButton,
} from '../../Chat.styles';

export interface SelectModeFooterBarProps {
  selectedMessages: string[];
  selectedMessage?: Message;
  canEditSelectedMessage: boolean;
  isMobileView: boolean;
  currentUserId: string;
  onCancelSelectMode: () => void;
  onStartEdit: (msg: Message) => void;
  onOpenReport: (msg: Message) => void;
  onInitiateDelete: () => void;
  hasSelectedMedia?: boolean;
  selectedMediaCount?: number;
  onDownloadSelectedMedia?: () => void;
}

/**
 * Multi-select action bar shown in place of the composer when messages are selected.
 */
export const SelectModeFooterBar: React.FC<SelectModeFooterBarProps> = ({
  selectedMessages,
  selectedMessage,
  canEditSelectedMessage,
  isMobileView,
  currentUserId,
  onCancelSelectMode,
  onStartEdit,
  onOpenReport,
  onInitiateDelete,
  hasSelectedMedia,
  selectedMediaCount,
  onDownloadSelectedMedia,
}) => {
  const [isCopyMenuOpen, setIsCopyMenuOpen] = React.useState(false);
  const copyMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isCopyMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setIsCopyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isCopyMenuOpen]);

  const renderCopyAction = () => {
    if (!selectedMessage || selectedMessage.isDeleted || selectedMessages.length !== 1) return null;
    if (!isMobileView && isNonTouchDevice()) return null;

    const isPhotoGif = isPhotoOrGif(selectedMessage);
    const isGif = isGifMessage(selectedMessage);
    const hasCaption = Boolean(selectedMessage.text?.trim());
    const hasMedia = hasMediaAttachment(selectedMessage);

    const isPhotoGifWithCaption = isPhotoGif && hasCaption;
    const isPhotoGifWithoutCaption = isPhotoGif && !hasCaption;
    const isOtherMediaWithCaption = hasMedia && !isPhotoGif && hasCaption;
    const isPlainText = !hasMedia && hasCaption;

    const canShowCopy = isPhotoGifWithCaption || isPhotoGifWithoutCaption || isOtherMediaWithCaption || isPlainText;
    if (!canShowCopy) return null;

    const handleCopyClick = async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (isPhotoGifWithCaption) {
        setIsCopyMenuOpen((prev) => !prev);
        return;
      }

      if (isPhotoGifWithoutCaption && selectedMessage.url) {
        await copyImageToClipboard(selectedMessage.url, undefined, { isGif });
        onCancelSelectMode();
        return;
      }

      const textToCopy = selectedMessage.text || '';
      if (textToCopy) {
        const success = await copyTextToClipboard(textToCopy);
        if (success && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('pulse:status_toast', {
              detail: {
                message: isOtherMediaWithCaption ? 'Caption copied to clipboard' : 'Copied to clipboard',
              },
            })
          );
        }
      }
      onCancelSelectMode();
    };

    const handleCopyImageOption = async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsCopyMenuOpen(false);
      if (selectedMessage.url) {
        await copyImageToClipboard(selectedMessage.url, undefined, { isGif });
      }
      onCancelSelectMode();
    };

    const handleCopyCaptionOption = async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsCopyMenuOpen(false);
      if (selectedMessage.text) {
        const success = await copyTextToClipboard(selectedMessage.text);
        if (success && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('pulse:status_toast', {
              detail: { message: 'Caption copied to clipboard' },
            })
          );
        }
      }
      onCancelSelectMode();
    };

    const copyMediaLabel = isGif ? 'Copy GIF' : 'Copy image';
    const copyLabel = isPhotoGifWithCaption
      ? 'Copy options'
      : isPhotoGifWithoutCaption
      ? copyMediaLabel
      : isOtherMediaWithCaption
      ? 'Copy caption'
      : 'Copy';

    return (
      <div style={{ position: 'relative' }} ref={copyMenuRef}>
        <CopyButton
          data-testid="select-copy-btn"
          onClick={handleCopyClick}
          title={copyLabel}
          aria-label={copyLabel}
          style={
            isCopyMenuOpen
              ? {
                  backgroundColor: '#475569',
                  boxShadow: '0 0 0 2px rgba(56, 189, 248, 0.45)',
                }
              : undefined
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </CopyButton>

        {isPhotoGifWithCaption && isCopyMenuOpen && (
          <CopyOptionsPopover
            data-testid="copy-options-popover"
            role="menu"
            aria-label="Copy options"
          >
            <CopyOptionItem
              type="button"
              role="menuitem"
              data-testid="popover-copy-image-btn"
              onClick={handleCopyImageOption}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>{copyMediaLabel}</span>
            </CopyOptionItem>
            <CopyOptionDivider />
            <CopyOptionItem
              type="button"
              role="menuitem"
              data-testid="popover-copy-caption-btn"
              onClick={handleCopyCaptionOption}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
              <span>Copy caption</span>
            </CopyOptionItem>
          </CopyOptionsPopover>
        )}
      </div>
    );
  };

  return (
    <SelectModeFooter>
      <CancelPreviewButton onClick={onCancelSelectMode}>&times;</CancelPreviewButton>
      <span>{selectedMessages.length} selected</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {canEditSelectedMessage && selectedMessage && (
          <EditButton
            onClick={() => {
              onStartEdit(selectedMessage);
              onCancelSelectMode();
            }}
            title="Edit"
            aria-label="Edit selected message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </EditButton>
        )}
        {renderCopyAction()}
        {hasSelectedMedia && onDownloadSelectedMedia && (
          <DownloadAllButton
            onClick={() => {
              onDownloadSelectedMedia();
            }}
            title={selectedMediaCount && selectedMediaCount > 1 ? 'Download all as ZIP' : 'Download'}
            aria-label={selectedMediaCount && selectedMediaCount > 1 ? 'Download all selected media as ZIP' : 'Download selected media'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </DownloadAllButton>
        )}
        {isMobileView && selectedMessages.length === 1 && selectedMessage && !selectedMessage.isDeleted && selectedMessage.userId !== currentUserId && selectedMessage.type !== 'system_notification' && (
          <ReportButton
            onClick={() => {
              onOpenReport(selectedMessage);
              onCancelSelectMode();
            }}
            title="Report"
            aria-label="Report selected message"
          >
            <svg style={{ position: 'relative', left: '1px' }} xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
              <line x1="4" y1="22" x2="4" y2="15"></line>
            </svg>
          </ReportButton>
        )}
        <DeleteButton onClick={onInitiateDelete} title="Delete" aria-label="Delete selected messages">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </DeleteButton>
      </div>
    </SelectModeFooter>
  );
};
