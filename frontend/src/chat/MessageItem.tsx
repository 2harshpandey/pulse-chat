import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDrag } from '@use-gesture/react';
import type { Message, MessageItemProps } from './types';
import { LONG_PRESS_CANCEL_MOVE_PX, QUICK_REACTIONS, filterValidReactions, quoteLog } from './constants';
import {
  getMessageElementId, getQuotedPreviewThumbUrl, wrapEmojis,
  sanitizeMediaUrl, getBlobUrl, revokeBlobUrl, getMediaCacheLookupKey,
  inferredContentLengthByUrlCache, resolveApiBaseUrl,
  buildDownloadProxyUrl, normalizeMessageId, resolveReplyTargetId,
} from './utils';
import {
  MessageRow, MessageBubble, Username, FooterContainer, Timestamp,
  QuotedMessageContainer, QuotedMediaThumb, MessageActions, ActionButton,
  SelectCheckboxContainer, Checkbox, MobileReactionPicker, ReactionEmoji,
  ReactionsContainer, DeleteMenu, DeleteMenuItem, SystemMessage,
  MessageText, ReactionEmojiSpan, ReactionCountSpan,
} from './ChatStyledComponents';
import { renderMessageContent, detectFirstUrl } from './renderMessage';
import { LinkPreview } from './LinkPreview';
import { getCachedMediaBlob, setCachedMediaBlob } from '../mediaCache';

export const MessageItem = React.memo(({
  msg,
  showUsername,
  currentUserId,
  activeDeleteMenu,
  deleteMenuRef,
  handleSetReply,
  handleReact,
  openDeleteMenu,
  openLightbox,
  isMediaLoaded,
  onRequestMediaLoad,
  isMediaLoadInProgress,
  mediaLoadProgress,
  loadedMediaSrc,
  onRequestDownload,
  isDownloadInProgress,
  downloadProgress,
  deleteForMe,
  deleteForEveryone,
  scrollToMessage,
  isSelectModeActive,
  isSelected,
  handleToggleSelectMessage,
  setActiveDeleteMenu,
  handleCopy,
  handleOpenReport,
  handleStartEdit,
  handleCancelSelectMode,
  isMobileView,
  onOpenReactionPicker,
  setReactionsPopup,
  selectedMessages,
  handleOpenFullEmojiPicker,
  reactionPickerData,
  editingMessageId,
  handleCancelEdit,
  onVideoFullscreenEnter
}: MessageItemProps) => {
  const isEditing = editingMessageId === msg.id;
  const quotedPreviewThumbUrl = msg.replyingTo && !msg.replyingTo.isDeleted && (msg.replyingTo.type === 'image' || msg.replyingTo.type === 'video')
    ? getQuotedPreviewThumbUrl(msg.replyingTo.type, msg.replyingTo.url)
    : '';
  const messageRowRef = useRef<HTMLDivElement>(null!);
  const messageBubbleRef = useRef<HTMLDivElement>(null!);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right?: number; left?: number } | null>(null);
  const [resolvedContentSize, setResolvedContentSize] = useState<number | undefined>(() => {
    if (typeof msg.size === 'number' && msg.size > 0) return msg.size;
    const safeUrl = sanitizeMediaUrl(msg.url);
    return safeUrl ? inferredContentLengthByUrlCache.get(safeUrl) : undefined;
  });

  const messageWithResolvedSize = useMemo<Message>(() => {
    if (typeof resolvedContentSize !== 'number' || resolvedContentSize <= 0 || msg.size === resolvedContentSize) {
      return msg;
    }
    return { ...msg, size: resolvedContentSize };
  }, [msg, resolvedContentSize]);

  useEffect(() => {
    if (typeof msg.size === 'number' && msg.size > 0) {
      setResolvedContentSize(msg.size);
      const safeUrl = sanitizeMediaUrl(msg.url);
      if (safeUrl) inferredContentLengthByUrlCache.set(safeUrl, msg.size);
      return;
    }

    const safeUrl = sanitizeMediaUrl(msg.url);
    if (!safeUrl) {
      setResolvedContentSize(undefined);
      return;
    }

    setResolvedContentSize(inferredContentLengthByUrlCache.get(safeUrl));
  }, [msg.id, msg.size, msg.url]);

  useEffect(() => {
    if (typeof msg.size === 'number' && msg.size > 0) return;
    if (!msg.url) return;
    if (msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'file') return;

    const safeUrl = sanitizeMediaUrl(msg.url);
    if (!safeUrl) return;
    if (inferredContentLengthByUrlCache.has(safeUrl)) return;

    const abortController = new AbortController();
    const metadataUrl = buildDownloadProxyUrl(safeUrl, msg.originalName);

    void fetch(metadataUrl, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
      signal: abortController.signal,
    }).then((response) => {
      if (!response.ok) return;
      const contentLengthHeader = response.headers.get('content-length');
      const parsedLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
      if (!Number.isFinite(parsedLength) || parsedLength <= 0) return;
      inferredContentLengthByUrlCache.set(safeUrl, parsedLength);
      setResolvedContentSize(parsedLength);
    }).catch(() => {
      // Ignore metadata failures: UI can still function without explicit size.
    });

    return () => abortController.abort();
  }, [msg.id, msg.originalName, msg.size, msg.type, msg.url]);

  // Keep menuPos in sync: clear it whenever this row's menu is closed from outside.
  useEffect(() => {
    if (activeDeleteMenu !== msg.id) setMenuPos(null);
  }, [activeDeleteMenu, msg.id]);

  // Close menu on any scroll (e.g. user scrolls while menu is open).
  useEffect(() => {
    if (activeDeleteMenu !== msg.id || !menuPos) return;
    const close = () => { setActiveDeleteMenu(null); };
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  }, [activeDeleteMenu, msg.id, menuPos, setActiveDeleteMenu]);
  // Tracks whether the pointer-down landed on a media preview element.
  // When true the gesture-tap handler skips selection so the lightbox/player
  // can open without also selecting the message.
  const mediaWasTapped = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeTransitionResetTimerRef = useRef<number | null>(null);
  const reactButtonRef = useRef<HTMLButtonElement>(null!);
  const wasLongPressed = useRef(false);
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressTapSelectionRef = useRef(false);
  const ignoreSwipeGestureRef = useRef(false);
  const swipeOffsetRef = useRef(0);

  const resetSwipePosition = useCallback((animate: boolean) => {
    if (!messageRowRef.current) return;
    swipeOffsetRef.current = 0;
    if (swipeTransitionResetTimerRef.current !== null) {
      window.clearTimeout(swipeTransitionResetTimerRef.current);
      swipeTransitionResetTimerRef.current = null;
    }

    messageRowRef.current.style.transform = 'translateX(0px)';
    messageRowRef.current.style.transition = animate ? 'transform 0.2s ease-out' : 'none';

    if (animate) {
      swipeTransitionResetTimerRef.current = window.setTimeout(() => {
        if (!messageRowRef.current) return;
        messageRowRef.current.style.transition = 'none';
        swipeTransitionResetTimerRef.current = null;
      }, 220);
    }
  }, []);

  const isSwipeQuoteIgnoredTarget = useCallback((target: HTMLElement) => {
    if (target.closest('[data-allow-quote-swipe]')) return false;
    return Boolean(
      target.closest('[data-quote-swipe-ignore]') ||
      target.closest('button, a, input, textarea, [contenteditable="true"]')
    );
  }, []);

  useDrag(({ active, movement: [mx, my], last, tap, first, event }) => {
    const target = event.target as HTMLElement;

    if (first) {
      ignoreSwipeGestureRef.current = isSwipeQuoteIgnoredTarget(target);
    }

    if (ignoreSwipeGestureRef.current) {
      if (last) {
        ignoreSwipeGestureRef.current = false;
        if (swipeOffsetRef.current > 0) {
          resetSwipePosition(true);
        }
      }
      return;
    }

    // If a drag gesture is active (i.e., user is scrolling), cancel the long-press timer.
    if (active && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      suppressTapSelectionRef.current = true;
    }

    if (tap) {
      // If the tap was on the MobileReactionPicker, ignore it completely.
      // The picker stays mounted while the full emoji panel is open, so
      // target.closest reliably catches taps on any of its buttons.
      if (target.closest('.mobile-reaction-picker')) {
        return;
      }

      // Ignore synthetic tap events that are actually part of a scroll gesture.
      if (suppressTapSelectionRef.current) {
        suppressTapSelectionRef.current = false;
        mediaWasTapped.current = false;
        return;
      }

      // If this 'tap' is the end of a long press, reset the flag and do nothing.
      if (wasLongPressed.current) {
        wasLongPressed.current = false;
        return;
      }
      // Otherwise, if it's a genuine tap in select mode, toggle the selection.
      if (isSelectModeActive) {
        // If the tap landed on the checkbox, let the checkbox's own handler
        // deal with it ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ don't also toggle from the useDrag tap.
        if (target.closest('[data-checkbox]')) {
          return;
        }
        // If the tap landed directly on a media preview (image/video/GIF),
        // let the lightbox/player handle it without also selecting the message.
        if (mediaWasTapped.current) {
          mediaWasTapped.current = false;
          return;
        }
        handleToggleSelectMessage(msg.id);
        return;
      }
    }

    // When a gesture ends as a drag (not a tap), clean up refs so the
    // next tap always starts from a known-good state.
    if (last && !tap) {
      mediaWasTapped.current = false;
      wasLongPressed.current = false;
      suppressTapSelectionRef.current = false;
      ignoreSwipeGestureRef.current = false;
    }

    // Always restore the row position at the end of any gesture. This prevents
    // partially shifted bubbles when a horizontal swipe drifts vertically.
    if (last && swipeOffsetRef.current > 0) {
      resetSwipePosition(true);
    }

    if (!isMobileView || isSelectModeActive || isDeleted || !messageRowRef.current) {
      return;
    }

    const isHorizontalGesture = Math.abs(mx) > Math.abs(my);

    if (last) {
      // If the drag ended as a rightward horizontal swipe, trigger reply.
      if (isHorizontalGesture && mx > 70) {
        handleSetReply(msg);
      }
      return;
    }

    if (!active) {
      return;
    }

    // While scrolling vertically (or dragging left), keep the row anchored.
    if (!isHorizontalGesture || mx <= 0) {
      if (swipeOffsetRef.current > 0) {
        resetSwipePosition(false);
      }
      return;
    }

    // During a valid horizontal drag, update position with sane bounds.
    const newX = Math.min(Math.max(mx, 0), 80);
    if (newX === swipeOffsetRef.current) {
      return;
    }
    swipeOffsetRef.current = newX;
    messageRowRef.current.style.transform = `translateX(${newX}px)`;
    messageRowRef.current.style.transition = 'none';
  }, {
    filterTaps: true,
    eventOptions: { passive: true },
    target: messageRowRef,
    drag: { threshold: 10, axis: 'x' }
  });

  const validReactions = useMemo(() => filterValidReactions(msg.reactions), [msg.reactions]);

  const currentUserReaction = useMemo(() => {
    for (const [emoji, users] of Object.entries(validReactions)) {
      if (users.some((r: { userId: string }) => r.userId === currentUserId)) {
        return emoji;
      }
    }
    return null;
  }, [validReactions, currentUserId]);

  // Reset gesture refs when Virtuoso recycles this component for a different message
  const prevMsgIdRef = useRef(msg.id);
  useLayoutEffect(() => {
    if (prevMsgIdRef.current !== msg.id) {
      prevMsgIdRef.current = msg.id;
      wasLongPressed.current = false;
      mediaWasTapped.current = false;
      suppressTapSelectionRef.current = false;
      ignoreSwipeGestureRef.current = false;
      touchStartPointRef.current = null;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      resetSwipePosition(false);
    }
  }, [msg.id, resetSwipePosition]);

  useEffect(() => {
    return () => {
      if (swipeTransitionResetTimerRef.current !== null) {
        window.clearTimeout(swipeTransitionResetTimerRef.current);
        swipeTransitionResetTimerRef.current = null;
      }
    };
  }, []);

  // Reset wasLongPressed only when select mode is DEACTIVATED.
  // We must NOT reset it when select mode is activated ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the long-press
  // timer sets it just before the re-render that activates select mode,
  // and the tap handler needs it to avoid immediately deselecting the
  // message when the touch ends.
  useEffect(() => {
    if (!isSelectModeActive) {
      wasLongPressed.current = false;
      suppressTapSelectionRef.current = false;
      ignoreSwipeGestureRef.current = false;
    }
  }, [isSelectModeActive]);

  const sender = msg.userId === currentUserId ? 'me' : 'other';

  const messageTime = new Date(msg.timestamp).getTime();
  const now = new Date().getTime();
  const canEdit = msg.userId === currentUserId && (now - messageTime) < 15 * 60 * 1000 && msg.text;
  const isDeleted = msg.isDeleted;
  const handleVideoFullscreenEnterForMessage = useCallback(() => {
    onVideoFullscreenEnter?.(msg.id);
  }, [onVideoFullscreenEnter, msg.id]);

  const isLongPressIgnoredTarget = useCallback((target: HTMLElement) => {
    return Boolean(
      target.closest('.mobile-reaction-picker') ||
      target.closest('[data-quote-swipe-ignore]') ||
      target.closest('button, a, input, textarea, [contenteditable="true"]')
    );
  }, []);

  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isMobileView || !('touches' in e)) {
      return;
    }

    // Don't start a long-press timer when the touch/click lands on the
    // MobileReactionPicker ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â otherwise the 500 ms timer fires, toggles
    // selection (deselecting the message), and unmounts the picker before
    // the user's onClick can fire on the emoji button.
    const target = e.target as HTMLElement;
    if (isLongPressIgnoredTarget(target)) {
      return;
    }

    if (e.touches.length !== 1) {
      return;
    }

    const touch = e.touches[0];
    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    suppressTapSelectionRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressTimerRef.current = setTimeout(() => {
      if (!suppressTapSelectionRef.current) {
        handleToggleSelectMessage(msg.id);
        wasLongPressed.current = true;
      }
    }, 500);
  };

  const handleLongPressMove = (e: React.TouchEvent) => {
    if (!touchStartPointRef.current || e.touches.length === 0) {
      return;
    }

    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPointRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPointRef.current.y);

    if (dx > LONG_PRESS_CANCEL_MOVE_PX || dy > LONG_PRESS_CANCEL_MOVE_PX) {
      suppressTapSelectionRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPointRef.current = null;
  };

  const handleLongPressCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPointRef.current = null;
    suppressTapSelectionRef.current = true;
    resetSwipePosition(true);
  };

  return (
    <React.Fragment>
      <MessageRow
        id={getMessageElementId(msg.id)}
        data-message-id={normalizeMessageId(msg.id)}
        ref={messageRowRef}
        $sender={sender}
        $isSelected={isSelected}
        $isActiveDeleteMenu={activeDeleteMenu === msg.id}
        $isGrouped={!showUsername}
        onDoubleClick={(e) => {
          if (!isMobileView && !isSelectModeActive && !isDeleted) {
            // Only quote when double-clicking *outside* the message bubble
            // (i.e. the empty space beside the bubble). If the double-click
            // target is inside the bubble, ignore it so normal text selection
            // and interactions work.
            if (messageBubbleRef.current && messageBubbleRef.current.contains(e.target as Node)) {
              return;
            }
            e.preventDefault();
            handleSetReply(msg);
          }
        }}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchMove={handleLongPressMove}
        onTouchEnd={handleLongPressEnd}
        onTouchCancel={handleLongPressCancel}
      >
        {isSelectModeActive && (!isMobileView || selectedMessages.length > 1) && (
          <SelectCheckboxContainer
            data-checkbox
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSelectMessage(msg.id);
            }}
          >
            <Checkbox checked={isSelected} />
          </SelectCheckboxContainer>
        )}
        <div
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: sender === 'me' ? 'flex-end' : 'flex-start', width: '100%' }}
        >
          {!isDeleted && showUsername && <Username $sender={sender}>{msg.username}</Username>}
          <MessageBubble
            ref={messageBubbleRef}
            $sender={sender}
            $messageType={msg.type}
            $isUploading={msg.isUploading}
            $uploadError={msg.uploadError}
            style={{
              marginBottom: (!isDeleted && msg.reactions && Object.keys(msg.reactions).length > 0) ? '18px' : undefined,
              ...(isEditing ? {
                outline: '2px solid rgba(99, 102, 241, 0.55)',
                outlineOffset: '2px',
                boxShadow: '0 0 0 4px rgba(99, 102, 241, 0.12)',
              } : {}),
            }}
          >
            {msg.replyingTo && (
              <QuotedMessageContainer
                $sender={sender}
                data-quote-swipe-ignore
                role="button"
                tabIndex={0}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
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
                    {msg.replyingTo.isDeleted ? 'This message has been deleted.' : msg.replyingTo.text}
                  </span>
                </div>
                {!msg.replyingTo.isDeleted && msg.replyingTo.url && (msg.replyingTo.type === 'image' || msg.replyingTo.type === 'video') && (
                  quotedPreviewThumbUrl ? (
                    <QuotedMediaThumb>
                      <img
                        src={quotedPreviewThumbUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
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
                        textTransform: 'uppercase'
                      }}
                    >
                      {msg.replyingTo.type === 'video' ? 'Video' : 'Photo'}
                    </div>
                  )
                )}
              </QuotedMessageContainer>
            )}
            {isDeleted ? (
              <>
                <MessageText style={{ fontStyle: 'italic', color: sender === 'me' ? '#bfdbfe' : '#a0aec0', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'default' }}>
                  {msg.deletedBy === currentUserId ? 'You deleted this message.' : 'This message has been deleted.'}
                </MessageText>
                {!isMobileView && (
                  <MessageActions>
                    <ActionButton
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const isNearBottom = rect.bottom + 100 > window.innerHeight;
                        const menuWidth = 168;
                        const wouldClipLeft = rect.right - menuWidth < 8;
                        const hPos = wouldClipLeft
                          ? { left: Math.max(8, rect.left) }
                          : { right: window.innerWidth - rect.right };
                        setMenuPos(isNearBottom
                          ? { bottom: window.innerHeight - rect.top + 4, ...hPos }
                          : { top: rect.bottom + 4, ...hPos }
                        );
                        openDeleteMenu(msg.id);
                      }}
                      title="More"
                      aria-label="More actions"
                      className="more-action-button"
                      style={{ fontSize: '20px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >&#8942;</ActionButton>
                  </MessageActions>
                )}
                <FooterContainer $sender={sender}>
                  <Timestamp $sender={sender}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Timestamp>
                </FooterContainer>
              </>
            ) : (
              <>
                {selectedMessages[0] === msg.id && selectedMessages.length === 1 && (
                  <MobileReactionPicker
                    $sender={sender}
                    className="mobile-reaction-picker"
                  >
                    {QUICK_REACTIONS.map(emoji => (
                      <ReactionEmoji key={emoji} onClick={(e) => {
                        e.stopPropagation();
                        handleReact(msg.id, emoji);
                        handleCancelSelectMode();
                      }}>{emoji}</ReactionEmoji>
                    ))}
                    {currentUserReaction ? (
                      <ReactionEmoji onClick={(e) => {
                        e.stopPropagation();
                        handleReact(msg.id, currentUserReaction);
                        handleCancelSelectMode();
                      }}>{currentUserReaction}</ReactionEmoji>
                    ) : (
                      <ReactionEmoji $isPlusIcon={true} onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Capture rect & msgId synchronously (e.currentTarget becomes null
                        // after the event returns). Do NOT call handleCancelSelectMode here
                        // ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â keeping select mode active means the MobileReactionPicker stays
                        // mounted, so target.closest('.mobile-reaction-picker') reliably
                        // catches the useDrag tap that fires when the finger lifts.
                        // Select mode is cancelled in the emoji panel's onEmojiClick instead.
                        const msgId = msg.id;
                        const rect = e.currentTarget.getBoundingClientRect();
                        handleOpenFullEmojiPicker(rect, msgId);
                      }}>+</ReactionEmoji>
                    )}
                  </MobileReactionPicker>
                )}
                {!isMobileView && (
                  <MessageActions>
                    <ActionButton ref={reactButtonRef} className="react-action-button" onClick={() => onOpenReactionPicker(msg.id, reactButtonRef.current!.getBoundingClientRect(), sender)} title="React" aria-label="Add reaction">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const isNearBottom = rect.bottom + 190 > window.innerHeight;
                        // Approximate menu width. If anchoring from the right would push
                        // the menu off the left edge of the screen, anchor from left instead.
                        const menuWidth = 168;
                        const wouldClipLeft = rect.right - menuWidth < 8;
                        const hPos = wouldClipLeft
                          ? { left: Math.max(8, rect.left) }
                          : { right: window.innerWidth - rect.right };
                        setMenuPos(isNearBottom
                          ? { bottom: window.innerHeight - rect.top + 4, ...hPos }
                          : { top: rect.bottom + 4, ...hPos }
                        );
                        openDeleteMenu(msg.id);
                      }}
                      title="More"
                      aria-label="More actions"
                      className="more-action-button"
                      style={{ fontSize: '20px' }}
                    >&#8942;</ActionButton>
                  </MessageActions>
                )}
                {/* DeleteMenu rendered as fixed portal ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â see block after </MessageRow> */}
                {msg.type === 'text' && !msg.url && msg.text && (() => { const _u = detectFirstUrl(msg.text); return _u ? <LinkPreview url={_u} sender={sender} /> : null; })()}
                {renderMessageContent(
                  messageWithResolvedSize,
                  openLightbox,
                  isMobileView && isSelectModeActive ? () => { mediaWasTapped.current = true; } : undefined,
                  sender,
                  handleVideoFullscreenEnterForMessage,
                  isMediaLoaded,
                  onRequestMediaLoad,
                  isMediaLoadInProgress,
                  mediaLoadProgress,
                  onRequestDownload,
                  isDownloadInProgress,
                  downloadProgress,
                  loadedMediaSrc
                )}
                <FooterContainer $sender={sender}>
                  <Timestamp $sender={sender}>{msg.edited && <span>(edited) </span>}{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Timestamp>
                </FooterContainer>
              </>
            )}
            {Object.keys(validReactions).length > 0 && (() => {
              const totalReactions = Object.values(validReactions).flat().length;
              const uniqueEmojis = Object.keys(validReactions);
              return (
                <ReactionsContainer $sender={sender} onClick={(e) => setReactionsPopup({ messageId: msg.id, reactions: validReactions, rect: e.currentTarget.getBoundingClientRect() })}>
                  {uniqueEmojis.slice(0, 3).map(emoji => <ReactionEmojiSpan key={emoji}>{emoji}</ReactionEmojiSpan>)}
                  <ReactionCountSpan>{totalReactions}</ReactionCountSpan>
                </ReactionsContainer>
              );
            })()}
          </MessageBubble>
        </div>
      </MessageRow>
      {activeDeleteMenu === msg.id && menuPos && createPortal(
        <div
          ref={deleteMenuRef}
          style={{
            position: 'fixed',
            ...(menuPos.top !== undefined ? { top: menuPos.top } : { bottom: menuPos.bottom }),
            ...(menuPos.left !== undefined ? { left: menuPos.left } : { right: menuPos.right }),
            zIndex: 9999,
          }}
        >
          <DeleteMenu>
            {msg.isDeleted ? (
              <DeleteMenuItem onClick={() => { handleToggleSelectMessage(msg.id); setActiveDeleteMenu(null); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                Delete
              </DeleteMenuItem>
            ) : (
              <>
                <DeleteMenuItem onClick={() => { handleSetReply(msg); setActiveDeleteMenu(null); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                  Reply
                </DeleteMenuItem>
                {canEdit && (
                  <DeleteMenuItem onClick={() => handleStartEdit(msg)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    Edit
                  </DeleteMenuItem>
                )}
                {msg.type !== 'video' && msg.type !== 'file' && (msg.text || msg.url) &&
                  <DeleteMenuItem onClick={() => { handleCopy(msg); setActiveDeleteMenu(null); }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy
                  </DeleteMenuItem>
                }
                {msg.userId !== currentUserId && (
                  <DeleteMenuItem onClick={() => { handleOpenReport(msg); setActiveDeleteMenu(null); }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    Report user
                  </DeleteMenuItem>
                )}
                <DeleteMenuItem onClick={() => { handleToggleSelectMessage(msg.id); setActiveDeleteMenu(null); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                  Delete
                </DeleteMenuItem>
              </>
            )}
          </DeleteMenu>
        </div>,
        document.body
      )}
    </React.Fragment>
  );
});
