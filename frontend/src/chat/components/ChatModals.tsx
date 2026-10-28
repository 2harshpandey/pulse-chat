import React from 'react';
import type { useChatMedia, useChatSelection, useChatReactions } from '../hooks';
import {
  FilePreviewModal,
  FullEmojiPickerModal,
  DeleteConfirmModal,
  DiscardConfirmModal,
  ReportModal,
  LightboxModal,
  MediaGalleryModal,
  GifPickerModal,
} from './index';
import { getPresenceActivityForFiles } from '../utils';

import type { PresenceActivity } from '../types';

interface ChatModalsProps {
  isDark: boolean;
  isMobileView: boolean;
  fullEmojiPickerRef: React.RefObject<HTMLDivElement | null>;
  selection: ReturnType<typeof useChatSelection>;
  reactions: ReturnType<typeof useChatReactions>;
  media: ReturnType<typeof useChatMedia>;
  onSendFromPreview: () => void;
  onCaptionTyping?: (activity?: PresenceActivity) => void;
}

export const ChatModals: React.FC<ChatModalsProps> = ({
  isDark,
  isMobileView,
  fullEmojiPickerRef,
  selection,
  reactions,
  media,
  onSendFromPreview,
  onCaptionTyping,
}) => {
  return (
    <>
      <FilePreviewModal
        isOpen={media.showFilePreview && media.stagedFiles.length > 0}
        stagedFiles={media.stagedFiles}
        previewActiveIndex={media.previewActiveIndex}
        onSelectActiveIndex={media.setPreviewActiveIndex}
        onRemoveFile={(idx: number) => {
          media.setStagedFiles((prev) => {
            const next = prev.filter((_, i) => i !== idx);
            if (next.length === 0) {
              media.closeFilePreviewAndRestoreDraft();
            } else {
              if (media.previewActiveIndex >= next.length) {
                media.setPreviewActiveIndex(next.length - 1);
              }
              media.setPresenceActivity(getPresenceActivityForFiles(next));
            }
            return next;
          });
        }}
        onAddMoreFiles={() => {
          media.notifyNativeFilePickerOpen();
          media.addFileInputRef.current?.click();
        }}
        caption={media.previewCaption}
        onCaptionChange={media.setPreviewCaption}
        onClose={media.handleRequestCloseFilePreview}
        onSend={onSendFromPreview}
        onTyping={() => {
          const act = getPresenceActivityForFiles(media.stagedFiles);
          onCaptionTyping?.(act);
        }}
        captionInputRef={media.previewCaptionInputRef as any}
      />

      <FullEmojiPickerModal
        isOpen={Boolean(reactions.fullEmojiPickerPosition)}
        isMobileView={isMobileView}
        isDark={isDark}
        onClose={() => {
          reactions.setFullEmojiPickerPosition(null);
          reactions.messageIdForFullEmojiPickerRef.current = null;
        }}
        onEmojiSelect={(emojiData) => {
          const msgId = reactions.messageIdForFullEmojiPickerRef.current;
          reactions.setFullEmojiPickerPosition(null);
          reactions.messageIdForFullEmojiPickerRef.current = null;
          selection.handleCancelSelectMode();
          if (msgId) {
            reactions.handleReact(msgId, emojiData.emoji);
          }
        }}
        pickerRef={fullEmojiPickerRef as any}
      />

      <DeleteConfirmModal
        isOpen={selection.isDeleteConfirmationVisible}
        selectedCount={selection.selectedMessages.length}
        canDeleteForEveryone={selection.canDeleteForEveryone}
        onCancel={() => selection.setIsDeleteConfirmationVisible(false)}
        onDeleteForMe={selection.handleBulkDeleteForMe}
        onDeleteForEveryone={selection.handleBulkDeleteForEveryone}
      />

      <DiscardConfirmModal
        isOpen={media.isDiscardConfirmationVisible}
        onCancel={() => media.setIsDiscardConfirmationVisible(false)}
        onConfirm={() => {
          media.setIsDiscardConfirmationVisible(false);
          media.closeFilePreviewAndRestoreDraft();
        }}
      />

      <ReportModal
        isOpen={selection.isReportModalVisible}
        targetMessage={selection.reportTargetMessage}
        reportReason={selection.reportReason}
        onReportReasonChange={selection.setReportReason}
        reportError={selection.reportError}
        isSubmitting={selection.isSubmittingReport}
        onClose={selection.handleCloseReportModal}
        onSubmit={selection.handleSubmitReport}
      />

      <LightboxModal
        url={media.lightboxUrl}
        transform={media.lightboxTransform}
        isInteracting={media.isLightboxInteracting}
        canZoomIn={media.canZoomInLightbox}
        canZoomOut={media.canZoomOutLightbox}
        onClose={media.closeLightbox}
        onZoomIn={media.handleLightboxZoomIn}
        onZoomOut={media.handleLightboxZoomOut}
        onWheel={media.handleLightboxWheel}
        onPointerDown={media.handleLightboxPointerDown}
        onPointerMove={media.handleLightboxPointerMove}
        onPointerUp={media.handleLightboxPointerUp}
        onPointerCancel={media.handleLightboxPointerCancel}
        onImageLoad={media.handleLightboxImageLoad}
        frameRef={media.lightboxFrameRef as any}
        imageRef={media.lightboxImageRef as any}
      />

      <MediaGalleryModal
        isOpen={Boolean(media.mediaGallery)}
        items={media.mediaGallery?.items || []}
        initialIndex={media.mediaGallery?.initialIndex || 0}
        onClose={media.closeMediaGallery}
        onRequestDownload={media.handleRequestDownload}
        loadedMediaSrcById={media.loadedMediaSrcById}
        loadedMediaMessageSet={media.loadedMediaMessageSet}
        onRequestMediaLoad={media.handleRequestMediaLoad}
        currentUserId={media.userId}
      />

      <GifPickerModal
        isOpen={media.showGifPicker}
        onClose={media.closeGifPicker}
        searchTerm={media.gifSearchTerm}
        onSearchTermChange={media.setGifSearchTerm}
        isLoading={media.isLoadingGifs}
        error={media.gifError}
        onRetry={() => {
          media.setGifError('');
          media.setGifFetchKey((k) => k + 1);
        }}
        results={media.gifResults}
        onSelectGif={media.handleGifSelect}
        openedAtRef={media.gifPickerOpenedAtRef}
        contentRef={media.gifPickerRef as any}
        inputRef={media.gifSearchInputRef as any}
      />
    </>
  );
};
