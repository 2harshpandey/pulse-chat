import React from 'react';
import { VideoPlayer } from '../../VideoPlayer';
import { sanitizeMediaUrl, getBlobUrl } from '../../utils';
import {
  FilePreviewModal as StyledFilePreviewModal,
  FilePreviewModalHeader,
  FilePreviewModalClose,
  FilePreviewModalFilename,
  FilePreviewModalBody,
  FilePreviewModalFooter,
  FilePreviewThumbStrip,
  FilePreviewThumb,
  FilePreviewAddBtn,
  FilePreviewRemoveBtn,
  FilePreviewCaptionInput,
  FilePreviewSendBtn,
  FilePreviewNoPreview,
} from '../../Chat.styles';

export interface FilePreviewModalProps {
  isOpen: boolean;
  stagedFiles: File[];
  previewActiveIndex: number;
  onSelectActiveIndex: (index: number) => void;
  onRemoveFile: (index: number) => void;
  onAddMoreFiles: () => void;
  caption: string;
  onCaptionChange: (caption: string) => void;
  onClose: () => void;
  onSend: () => void;
  onTyping?: () => void;
  onTypingStop?: () => void;
  captionInputRef?: React.RefObject<HTMLInputElement>;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  stagedFiles,
  previewActiveIndex,
  onSelectActiveIndex,
  onRemoveFile,
  onAddMoreFiles,
  caption,
  onCaptionChange,
  onClose,
  onSend,
  onTyping,
  onTypingStop,
  captionInputRef,
}) => {
  if (!isOpen || stagedFiles.length === 0) return null;

  const activeFile = stagedFiles[previewActiveIndex] || stagedFiles[0];
  const isImg = activeFile?.type.startsWith('image/');
  const isVid = activeFile?.type.startsWith('video/');
  const ext = activeFile?.name.split('.').pop()?.toUpperCase() || '';
  const sizeKB = activeFile ? activeFile.size / 1024 : 0;
  const sizeLabel = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${Math.round(sizeKB)} KB`;

  return (
    <StyledFilePreviewModal>
      <FilePreviewModalHeader>
        <FilePreviewModalClose aria-label="Close preview" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </FilePreviewModalClose>
        <FilePreviewModalFilename>{activeFile?.name}</FilePreviewModalFilename>
      </FilePreviewModalHeader>

      <FilePreviewModalBody>
        {isImg ? (
          <img
            src={sanitizeMediaUrl(getBlobUrl(activeFile))}
            alt="File preview"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }}
          />
        ) : isVid ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <VideoPlayer src={sanitizeMediaUrl(getBlobUrl(activeFile))} />
          </div>
        ) : (
          <FilePreviewNoPreview>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p>No preview available</p>
            <span>
              {sizeLabel} - {ext}
            </span>
          </FilePreviewNoPreview>
        )}
      </FilePreviewModalBody>

      {stagedFiles.length > 1 && (
        <FilePreviewThumbStrip>
          {stagedFiles.map((f, idx) => {
            const tIsImg = f.type.startsWith('image/');
            const tIsVid = f.type.startsWith('video/');
            return (
              <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
                <FilePreviewThumb $active={idx === previewActiveIndex} onClick={() => onSelectActiveIndex(idx)}>
                  {tIsImg ? (
                    <img src={sanitizeMediaUrl(getBlobUrl(f))} alt="" />
                  ) : tIsVid ? (
                    <video src={sanitizeMediaUrl(getBlobUrl(f))} />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                </FilePreviewThumb>
                <FilePreviewRemoveBtn
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(idx);
                  }}
                >
                  &times;
                </FilePreviewRemoveBtn>
              </div>
            );
          })}
          <FilePreviewAddBtn onClick={onAddMoreFiles}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </FilePreviewAddBtn>
        </FilePreviewThumbStrip>
      )}

      {stagedFiles.length === 1 && (
        <FilePreviewThumbStrip>
          <FilePreviewAddBtn onClick={onAddMoreFiles}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </FilePreviewAddBtn>
        </FilePreviewThumbStrip>
      )}

      <FilePreviewModalFooter>
        <FilePreviewCaptionInput
          ref={captionInputRef}
          placeholder="Add a caption..."
          value={caption}
          onChange={(e) => {
            const val = e.target.value;
            onCaptionChange(val);
            if (val.trim()) {
              onTyping?.();
            } else {
              onTypingStop?.();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <FilePreviewSendBtn onClick={onSend}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </FilePreviewSendBtn>
      </FilePreviewModalFooter>
    </StyledFilePreviewModal>
  );
};
