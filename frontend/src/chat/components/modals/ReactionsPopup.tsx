import React, { useState, useRef, useEffect } from 'react';
import { sanitizeMediaUrl, preserveKeyboardFocus } from '../../utils';
import type { ReactionsPopupData } from '../../types';
import {
  ReactionsPopupModal,
  ReactionsPopupContent,
  ReactionsPopupHeader,
  ReactionTab,
  ReactionsUserList,
  ReactionUserRow,
  UserAvatar,
} from '../../styles/chat.message.styles';

export interface ReactionsPopupProps {
  popupData: ReactionsPopupData;
  currentUserId: string;
  onClose: () => void;
  onRemoveReaction: (emoji: string, targetMessageId?: string, isAlbum?: boolean) => void;
}

/**
 * Interactive modal listing per-emoji reaction counts, users, and removal actions.
 */
export const ReactionsPopup: React.FC<ReactionsPopupProps> = ({
  popupData,
  currentUserId,
  onClose,
  onRemoveReaction,
}) => {
  const [activeTab, setActiveTab] = useState('All');
  const tabsRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      tabsEl.scrollTo({
        left: tabsEl.scrollLeft + e.deltaY,
        behavior: 'smooth',
      });
    };

    tabsEl.addEventListener('wheel', onWheel);
    return () => tabsEl.removeEventListener('wheel', onWheel);
  }, []);

  const allReactions = popupData.reactionSources && popupData.reactionSources.length > 0
    ? popupData.reactionSources
    : Object.entries(popupData.reactions).flatMap(([emoji, users]) =>
        users.map(user => ({ ...user, emoji, messageId: popupData.messageId }))
      );

  const reactionsForTab = activeTab === 'All'
    ? allReactions
    : allReactions.filter(r => r.emoji === activeTab);

  const sortedReactions = [...reactionsForTab].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return 0;
  });

  const tabs = ['All', ...Object.keys(popupData.reactions)];

  return (
    <ReactionsPopupModal
      onPointerDown={preserveKeyboardFocus}
      onMouseDown={preserveKeyboardFocus}
      onClick={onClose}
    >
      <ReactionsPopupContent
        onPointerDown={(e) => {
          e.stopPropagation();
          preserveKeyboardFocus(e);
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          preserveKeyboardFocus(e);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ReactionsPopupHeader ref={tabsRef}>
          {tabs.map(tab => {
            const count = tab === 'All'
              ? allReactions.length
              : popupData.reactions[tab]?.length || 0;
            if (count === 0) return null;
            return (
              <ReactionTab
                key={tab}
                active={tab === activeTab}
                onPointerDown={preserveKeyboardFocus}
                onMouseDown={preserveKeyboardFocus}
                onClick={() => setActiveTab(tab)}
              >
                <span>{tab}</span>
                <span>{count}</span>
              </ReactionTab>
            );
          })}
        </ReactionsPopupHeader>
        <ReactionsUserList>
          {sortedReactions.map((entry, index) => {
            const { userId, username, emoji, messageId, isAlbum, mediaThumbUrl, isVideo } = entry as any;
            // Defensive code: Handle potentially corrupt data where userId might be missing.
            const displayName = userId === currentUserId ? 'You' : (username || userId || 'Unknown User');
            const initial = displayName ? displayName.charAt(0).toUpperCase() : '?';

            return (
              <ReactionUserRow
                key={`${userId}_${emoji}_${messageId || index}_${index}`}
                onPointerDown={preserveKeyboardFocus}
                onMouseDown={preserveKeyboardFocus}
                onClick={() => {
                  if (userId === currentUserId) {
                    onRemoveReaction(emoji, messageId, isAlbum);
                  }
                }}
                style={{ cursor: userId === currentUserId ? 'pointer' : 'default' }}
              >
                <UserAvatar>{initial}</UserAvatar>
                <div style={{ flexGrow: 1, minWidth: 0, paddingRight: '8px' }}>
                  <p style={{ fontWeight: 'bold' }}>{displayName}</p>
                  {userId === currentUserId && (
                    <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Click to remove</span>
                  )}
                </div>
                {mediaThumbUrl ? (
                  <div
                    style={{
                      position: 'relative',
                      width: '44px',
                      height: '44px',
                      flexShrink: 0,
                      borderRadius: '8px',
                      overflow: 'visible',
                    }}
                  >
                    {isVideo ? (
                      <video
                        src={sanitizeMediaUrl(mediaThumbUrl)}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          display: 'block',
                          background: '#1e293b',
                        }}
                      />
                    ) : (
                      <img
                        src={sanitizeMediaUrl(mediaThumbUrl)}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          display: 'block',
                          background: '#1e293b',
                        }}
                      />
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '-4px',
                        right: '-6px',
                        fontSize: '18px',
                        lineHeight: 1,
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.75))',
                        pointerEvents: 'none',
                      }}
                    >
                      {emoji}
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '24px', flexShrink: 0 }}>{emoji}</span>
                )}
              </ReactionUserRow>
            );
          })}
        </ReactionsUserList>
      </ReactionsPopupContent>
    </ReactionsPopupModal>
  );
};
