import React from 'react';
import type { Message, Gif } from '../../types';
import { quoteLog } from '../../constants';
import {
  isGiphyUrl,
  resolveReplyTargetId,
  audioDurationCache,
  setAudioDurationCache,
  subscribeAudioDuration,
  resolveAudioDuration,
  getDeletedForMeIds,
  preserveKeyboardFocus,
} from '../../utils';
import { MediaAlbumIcon } from '../message/MediaAlbumIcon';
import { getDeletedForMeMessageLabel } from '../message/MessageQuotedPreview';
import { formatAudioDuration } from '../message';
import {
  CancelPreviewButton,
  EditPreviewContainer,
  EditPreviewIcon,
  EditPreviewText,
  EditPreviewDismiss,
  ReplyPreviewContainer,
  ReplyText,
  FilePreviewImage,
  FilePreviewContainer,
  FilePreviewInfo,
} from '../../Chat.styles';

export interface ReplyEditPreviewBannerProps {
  currentUserId: string;
  editingMessageId: string | null;
  editingMessageOriginalText: string;
  onCancelEdit: () => void;
  replyingTo: Message | null;
  onCancelReply: () => void;
  onScrollToMessage: (id: string, sourceId?: string, behavior?: 'auto' | 'smooth', force?: boolean, payload?: any) => void;
  replyPreviewRef?: React.RefObject<HTMLDivElement>;
  stagedFile: File | null;
  onCancelStagedFile: () => void;
  stagedFiles: File[];
  onCancelStagedFiles: () => void;
  showFilePreview: boolean;
  stagedGif: Gif | null;
  onCancelStagedGif: () => void;
  onErrorToast?: (msg: string) => void;
}

/**
 * Renders the composer context banners (edit, reply, staged file/album, and staged GIF previews).
 */
export const ReplyEditPreviewBanner: React.FC<ReplyEditPreviewBannerProps> = ({
  currentUserId,
  editingMessageId,
  editingMessageOriginalText,
  onCancelEdit,
  replyingTo,
  onCancelReply,
  onScrollToMessage,
  replyPreviewRef,
  stagedFile,
  onCancelStagedFile,
  stagedFiles,
  onCancelStagedFiles,
  showFilePreview,
  stagedGif,
  onCancelStagedGif,
  onErrorToast,
}) => {
  const stagedFilePreviewUrl = React.useMemo(() => {
    if (!stagedFile) return '';
    return URL.createObjectURL(stagedFile);
  }, [stagedFile]);

  React.useEffect(() => {
    return () => {
      if (stagedFilePreviewUrl) {
        URL.revokeObjectURL(stagedFilePreviewUrl);
      }
    };
  }, [stagedFilePreviewUrl]);

  const [replyAudioDuration, setReplyAudioDuration] = React.useState<number | null>(() => {
    if (replyingTo?.type === 'audio') {
      if (replyingTo.duration && replyingTo.duration > 0) return replyingTo.duration;
      if (replyingTo.id && audioDurationCache.has(replyingTo.id)) return audioDurationCache.get(replyingTo.id)!;
      if (replyingTo.url && audioDurationCache.has(replyingTo.url)) return audioDurationCache.get(replyingTo.url)!;
    }
    return null;
  });

  React.useEffect(() => {
    if (replyingTo?.type !== 'audio') {
      setReplyAudioDuration(null);
      return;
    }

    const targetId = replyingTo.id;
    const targetUrl = replyingTo.url;

    if (replyingTo.duration && replyingTo.duration > 0) {
      setReplyAudioDuration(replyingTo.duration);
      if (targetId) setAudioDurationCache(targetId, replyingTo.duration);
      if (targetUrl) setAudioDurationCache(targetUrl, replyingTo.duration);
    } else {
      const cached = (targetId && audioDurationCache.get(targetId)) || (targetUrl && audioDurationCache.get(targetUrl));
      if (cached) {
        setReplyAudioDuration(cached);
      }
    }

    const unsubscribe = subscribeAudioDuration((key, dur) => {
      if ((targetId && key === targetId) || (targetUrl && key === targetUrl)) {
        setReplyAudioDuration(dur);
      }
    });

    let active = true;
    if (targetUrl || targetId) {
      resolveAudioDuration(targetUrl, targetId).then((dur) => {
        if (active && dur) {
          setReplyAudioDuration(dur);
        }
      });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [replyingTo?.id, replyingTo?.url, replyingTo?.type, replyingTo?.duration]);

  const renderReplyPreview = () => {
    if (!replyingTo) return null;

    const isGroupReply = Boolean(
      replyingTo.isGroup ||
      replyingTo.type === 'group' ||
      (typeof replyingTo.mediaCount === 'number' && replyingTo.mediaCount > 1)
    );
    const groupMediaCount = replyingTo.mediaCount || 2;
    const replyCaption = replyingTo.text?.trim() || '';
    const displayCaption = replyCaption && !/^\d+\s+media$/i.test(replyCaption) ? replyCaption : '';

    return (
      <ReplyPreviewContainer
        ref={replyPreviewRef}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const replyTargetId = resolveReplyTargetId(replyingTo);
          quoteLog('reply-preview click', {
            rawReplyingTo: replyingTo,
            resolvedReplyTargetId: replyTargetId,
          });
          if (replyTargetId) {
            const deletedForMeIds = getDeletedForMeIds(currentUserId);
            const isDeletedForMe = Boolean(
              deletedForMeIds.has(replyTargetId) ||
              (replyingTo.id && deletedForMeIds.has(replyingTo.id)) ||
              ((replyingTo as any)._id && deletedForMeIds.has((replyingTo as any)._id)) ||
              ((replyingTo as any).messageId && deletedForMeIds.has((replyingTo as any).messageId)) ||
              ((replyingTo as any).clientTempId && deletedForMeIds.has((replyingTo as any).clientTempId)) ||
              (replyingTo.isDeleted && replyingTo.deletedBy === currentUserId)
            );
            if (isDeletedForMe) {
              const mediaLabel = getDeletedForMeMessageLabel(replyingTo);
              onErrorToast?.(`This ${mediaLabel} is deleted by you for your session.`);
              return;
            }
            onScrollToMessage(replyTargetId, undefined, 'auto', true, replyingTo);
          }
        }}
      >
        {isGroupReply ? (
          <div
            data-testid="reply-preview-group-badge"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '6px',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MediaAlbumIcon size={22} />
          </div>
        ) : replyingTo.type === 'video' && replyingTo.url ? (
          <video src={replyingTo.url} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
        ) : (replyingTo.type === 'image' || replyingTo.type === 'video') && replyingTo.url ? (
          <FilePreviewImage src={replyingTo.url} alt="Reply preview" />
        ) : replyingTo.type === 'audio' ? (
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '6px',
            background: 'rgba(59, 130, 246, 0.15)',
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
        ) : null}
        <ReplyText>
          <p>Replying to {replyingTo.username}</p>
          <span style={replyingTo.isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : undefined}>
            {(() => {
              if (replyingTo.isDeleted) {
                return replyingTo.deletedBy === 'admin'
                  ? 'This message has been deleted by an admin.'
                  : replyingTo.deletedBy === currentUserId
                    ? 'You deleted this message.'
                    : 'This message has been deleted.';
              }
              if (isGroupReply) {
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <MediaAlbumIcon size={14} style={{ opacity: 0.85, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{groupMediaCount} media</span>
                    {displayCaption ? <span>• {displayCaption}</span> : null}
                  </span>
                );
              }
              if (replyingTo.text) return replyingTo.text;
              if (isGiphyUrl(replyingTo.url)) return 'GIF';
              if (replyingTo.type === 'image') return 'Image';
              if (replyingTo.type === 'video') return 'Video';
              if (replyingTo.type === 'audio') {
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>{replyingTo.text || 'Voice Message'}</span>
                    {Boolean(replyAudioDuration && replyAudioDuration > 0) && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '1px 6px',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#3b82f6',
                      }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        {formatAudioDuration(replyAudioDuration!)}
                      </span>
                    )}
                  </span>
                );
              }
              return 'Message';
            })()}
          </span>
        </ReplyText>
        <CancelPreviewButton
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onCancelReply();
          }}
        >
          &times;
        </CancelPreviewButton>
      </ReplyPreviewContainer>
    );
  };

  return (
    <>
      {editingMessageId && (
        <EditPreviewContainer>
          <EditPreviewIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </EditPreviewIcon>
          <EditPreviewText>
            <p>Editing message</p>
            <span>{editingMessageOriginalText || 'Message'}</span>
          </EditPreviewText>
          <EditPreviewDismiss
            onPointerDown={preserveKeyboardFocus}
            onMouseDown={preserveKeyboardFocus}
            onClick={onCancelEdit}
            title="Cancel editing (Esc)"
            aria-label="Cancel editing"
          >
            &times;
          </EditPreviewDismiss>
        </EditPreviewContainer>
      )}

      {renderReplyPreview()}

      {stagedFile && !showFilePreview && (
        <FilePreviewContainer>
          {stagedFile.type.startsWith('image/') ? (
            <FilePreviewImage src={stagedFilePreviewUrl} alt="Preview" />
          ) : stagedFile.type.startsWith('video/') ? (
            <video src={stagedFilePreviewUrl} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: '8px', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          )}
          <FilePreviewInfo>{stagedFile.name}</FilePreviewInfo>
          <CancelPreviewButton
            onPointerDown={preserveKeyboardFocus}
            onMouseDown={preserveKeyboardFocus}
            onClick={onCancelStagedFile}
          >
            &times;
          </CancelPreviewButton>
        </FilePreviewContainer>
      )}

      {stagedFiles.length > 0 && !showFilePreview && (
        <FilePreviewContainer>
          <FilePreviewInfo>
            {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''} ready
          </FilePreviewInfo>
          <CancelPreviewButton
            onPointerDown={preserveKeyboardFocus}
            onMouseDown={preserveKeyboardFocus}
            onClick={onCancelStagedFiles}
          >
            &times;
          </CancelPreviewButton>
        </FilePreviewContainer>
      )}

      {stagedGif && (
        <FilePreviewContainer>
          <FilePreviewImage src={stagedGif.preview} alt="GIF Preview" />
          <FilePreviewInfo>GIF</FilePreviewInfo>
          <CancelPreviewButton
            onPointerDown={preserveKeyboardFocus}
            onMouseDown={preserveKeyboardFocus}
            onClick={onCancelStagedGif}
          >
            &times;
          </CancelPreviewButton>
        </FilePreviewContainer>
      )}
    </>
  );
};
