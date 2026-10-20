import React, { useRef } from 'react';
import { MessageActions, ActionButton } from '../../ChatStyledComponents';

interface MessageDesktopActionsProps {
  msgId: string;
  sender: 'me' | 'other';
  isDeleted?: boolean;
  onOpenReactionPicker?: (messageId: string, rect: DOMRect, sender: 'me' | 'other') => void;
  openDeleteMenu: (messageId: string) => void;
  setMenuPos: (pos: { top?: number; bottom?: number; right?: number; left?: number } | null) => void;
}

export const MessageDesktopActions: React.FC<MessageDesktopActionsProps> = React.memo(({
  msgId,
  sender,
  isDeleted = false,
  onOpenReactionPicker,
  openDeleteMenu,
  setMenuPos,
}) => {
  const reactButtonRef = useRef<HTMLButtonElement>(null);

  const handleOpenMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const threshold = isDeleted ? 100 : 190;
    const isNearBottom = rect.bottom + threshold > window.innerHeight;
    const menuWidth = 168;
    const wouldClipLeft = rect.right - menuWidth < 8;
    const hPos = wouldClipLeft
      ? { left: Math.max(8, rect.left) }
      : { right: window.innerWidth - rect.right };

    setMenuPos(
      isNearBottom
        ? { bottom: window.innerHeight - rect.top + 4, ...hPos }
        : { top: rect.bottom + 4, ...hPos }
    );
    openDeleteMenu(msgId);
  };

  return (
    <MessageActions>
      {!isDeleted && onOpenReactionPicker && (
        <ActionButton
          ref={reactButtonRef}
          className="react-action-button"
          onClick={() => {
            if (reactButtonRef.current) {
              onOpenReactionPicker(msgId, reactButtonRef.current.getBoundingClientRect(), sender);
            }
          }}
          title="React"
          aria-label="Add reaction"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </ActionButton>
      )}
      <ActionButton
        onClick={handleOpenMore}
        title="More"
        aria-label="More actions"
        className="more-action-button"
        style={
          isDeleted
            ? { fontSize: '20px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
            : { fontSize: '20px' }
        }
      >
        &#8942;
      </ActionButton>
    </MessageActions>
  );
});

MessageDesktopActions.displayName = 'MessageDesktopActions';
