import React from 'react';
import type { Message } from '../../types';
import { resolveReplyTargetId } from '../../utils';
import { quoteLog } from '../../constants';
import { QuotedMessageContainer, QuotedMediaThumb } from '../../ChatStyledComponents';

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
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (msg.replyingTo) {
          const replyTargetId = resolveReplyTargetId(msg.replyingTo, msg.id);
          quoteLog('quoted-window click', {
            sourceMessageId: msg.id,
            rawReplyingTo: msg.replyingTo,
            resolvedReplyTargetId: replyTargetId,
          });
          if (replyTargetId) scrollToMessage(replyTargetId, msg.id, 'auto', true, msg.replyingTo);
        }
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p>{msg.replyingTo.username}</p>
        <span style={msg.replyingTo.isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : undefined}>
          {msg.replyingTo.isDeleted
            ? (msg.replyingTo.deletedBy === 'admin'
                ? 'This message has been deleted by an admin.'
                : (msg.replyingTo.deletedBy === currentUserId
                    ? 'You deleted this message.'
                    : 'This message has been deleted.'))
            : msg.replyingTo.text}
        </span>
      </div>
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
