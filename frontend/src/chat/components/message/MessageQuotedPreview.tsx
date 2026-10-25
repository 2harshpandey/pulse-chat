import React from 'react';
import type { Message } from '../../types';
import { resolveReplyTargetId } from '../../utils';
import { quoteLog } from '../../constants';
import { QuotedMessageContainer, QuotedMediaThumb } from '../../ChatStyledComponents';
import { formatAudioDuration } from './AudioMessagePlayer';

interface MessageQuotedPreviewProps {
  msg: Message;
  currentUserId: string;
  sender: 'me' | 'other';
  quotedPreviewThumbUrl: string;
  scrollToMessage: (
    messageId: string,
    sourceMessageId?: string,
    behavior?: 'auto' | 'smooth',
    force?: boolean,
    replyingToPayload?: any
  ) => Promise<void> | void;
}

export const MessageQuotedPreview: React.FC<MessageQuotedPreviewProps> = React.memo(({
  msg,
  currentUserId,
  sender,
  quotedPreviewThumbUrl,
  scrollToMessage,
}) => {
  const [thumbLoadError, setThumbLoadError] = React.useState(false);
  const [isLocating, setIsLocating] = React.useState(false);

  React.useEffect(() => {
    setThumbLoadError(false);
  }, [quotedPreviewThumbUrl]);

  if (!msg.replyingTo) return null;

  return (
    <QuotedMessageContainer
      $sender={sender}
      data-quote-swipe-ignore
      role="button"
      tabIndex={0}
      style={isLocating ? { cursor: 'wait', opacity: 0.88 } : undefined}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
      onClick={async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isLocating) return;
        if (msg.replyingTo) {
          const replyTargetId = resolveReplyTargetId(msg.replyingTo, msg.id);
          quoteLog('quoted-window click', {
            sourceMessageId: msg.id,
            rawReplyingTo: msg.replyingTo,
            resolvedReplyTargetId: replyTargetId,
          });
          if (replyTargetId) {
            try {
              setIsLocating(true);
              await scrollToMessage(replyTargetId, msg.id, 'auto', true, msg.replyingTo);
            } finally {
              setIsLocating(false);
            }
          }
        }
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p>{msg.replyingTo.username}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, marginTop: '1px' }}>
          <span style={{
            flex: '0 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            ...(msg.replyingTo.isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : {})
          }}>
            {msg.replyingTo.isDeleted
              ? (msg.replyingTo.deletedBy === 'admin'
                  ? 'This message has been deleted by an admin.'
                  : (msg.replyingTo.deletedBy === currentUserId
                      ? 'You deleted this message.'
                      : 'This message has been deleted.'))
              : (msg.replyingTo.text ||
                 (msg.replyingTo.type === 'video' ? 'Video' :
                  msg.replyingTo.type === 'image' ? 'Photo' :
                  msg.replyingTo.type === 'audio' ? 'Voice Message' :
                  msg.replyingTo.type === 'file' ? 'File' : ''))}
          </span>
          {!msg.replyingTo.isDeleted && msg.replyingTo.type === 'audio' && Boolean(msg.replyingTo.duration && msg.replyingTo.duration > 0) && (
            <span
              data-testid="quoted-audio-duration-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3.5px',
                padding: '1px 7px',
                borderRadius: '9999px',
                fontSize: '0.70rem',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.01em',
                flexShrink: 0,
                background: sender === 'me'
                  ? 'rgba(255, 255, 255, 0.22)'
                  : 'rgba(59, 130, 246, 0.16)',
                color: sender === 'me'
                  ? '#ffffff'
                  : 'var(--accent-primary, #3b82f6)',
                border: sender === 'me'
                  ? '1px solid rgba(255, 255, 255, 0.32)'
                  : '1px solid rgba(59, 130, 246, 0.25)',
              }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {formatAudioDuration(msg.replyingTo.duration!)}
            </span>
          )}
        </div>
      </div>
      {!msg.replyingTo.isDeleted && msg.replyingTo.type === 'audio' && (
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '6px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: sender === 'me' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(59, 130, 246, 0.18)',
            color: sender === 'me' ? '#ffffff' : '#3b82f6',
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
      )}
      {!msg.replyingTo.isDeleted && (msg.replyingTo.url || quotedPreviewThumbUrl) && (msg.replyingTo.type === 'image' || msg.replyingTo.type === 'video') && (
        quotedPreviewThumbUrl && !thumbLoadError ? (
          <QuotedMediaThumb>
            <img
              src={quotedPreviewThumbUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setThumbLoadError(true)}
            />
          </QuotedMediaThumb>
        ) : msg.replyingTo.url ? (
          <QuotedMediaThumb>
            {msg.replyingTo.type === 'video' ? (
              <video
                src={msg.replyingTo.url}
                muted
                playsInline
                preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
              />
            ) : (
              <img
                src={msg.replyingTo.url}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </QuotedMediaThumb>
        ) : (
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '6px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.28)',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              color: 'rgba(241, 245, 249, 0.95)',
              fontSize: '0.66rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {msg.replyingTo.type === 'video' ? 'Video' : 'Photo'}
          </div>
        )
      )}
    </QuotedMessageContainer>
  );
});

MessageQuotedPreview.displayName = 'MessageQuotedPreview';
