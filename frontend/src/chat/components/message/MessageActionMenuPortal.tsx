import React from 'react';
import { createPortal } from 'react-dom';
import type { Message } from '../../types';
import { DeleteMenu, DeleteMenuItem } from '../../ChatStyledComponents';

interface MessageActionMenuPortalProps {
  msg: Message;
  menuPos: { top?: number; bottom?: number; right?: number; left?: number } | null;
  deleteMenuRef: React.RefObject<HTMLDivElement>;
  currentUserId: string;
  canEdit: boolean;
  handleSetReply: (msg: Message) => void;
  setActiveDeleteMenu: (id: string | null) => void;
  handleToggleSelectMessage: (id: string) => void;
  handleStartEdit: (msg: Message) => void;
  handleCopy: (msg: Message) => void;
  handleOpenReport: (msg: Message) => void;
  onDownloadAll?: () => void;
  onCancelDownload?: () => void;
  isDownloadingAlbum?: boolean;
}

export const MessageActionMenuPortal: React.FC<MessageActionMenuPortalProps> = React.memo(({
  msg,
  menuPos,
  deleteMenuRef,
  currentUserId,
  canEdit,
  handleSetReply,
  setActiveDeleteMenu,
  handleToggleSelectMessage,
  handleStartEdit,
  handleCopy,
  handleOpenReport,
  onDownloadAll,
  onCancelDownload,
  isDownloadingAlbum = false,
}) => {
  if (!menuPos) return null;

  return createPortal(
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
          <>
            <DeleteMenuItem onClick={() => { handleSetReply(msg); setActiveDeleteMenu(null); }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
              Reply
            </DeleteMenuItem>
            <DeleteMenuItem onClick={() => { handleToggleSelectMessage(msg.id); setActiveDeleteMenu(null); }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              Delete
            </DeleteMenuItem>
          </>
        ) : (
          <>
            <DeleteMenuItem onClick={() => { handleSetReply(msg); setActiveDeleteMenu(null); }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
              Reply
            </DeleteMenuItem>
            {onDownloadAll && (
              <DeleteMenuItem
                data-testid={isDownloadingAlbum ? 'cancel-album-download-menu-item' : 'download-album-menu-item'}
                onClick={() => {
                  if (isDownloadingAlbum && onCancelDownload) {
                    onCancelDownload();
                  } else {
                    onDownloadAll();
                  }
                  setActiveDeleteMenu(null);
                }}
                style={isDownloadingAlbum ? { color: '#fda4af' } : undefined}
              >
                {isDownloadingAlbum ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Cancel download
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download all
                  </>
                )}
              </DeleteMenuItem>
            )}
            {canEdit && (
              <DeleteMenuItem onClick={() => handleStartEdit(msg)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Edit
              </DeleteMenuItem>
            )}
            {msg.type !== 'video' && msg.type !== 'file' && (msg.text || msg.url) && (
              <DeleteMenuItem onClick={() => { handleCopy(msg); setActiveDeleteMenu(null); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy
              </DeleteMenuItem>
            )}
            {msg.userId !== currentUserId && (
              <DeleteMenuItem onClick={() => { handleOpenReport(msg); setActiveDeleteMenu(null); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                Report user
              </DeleteMenuItem>
            )}
            <DeleteMenuItem onClick={() => { handleToggleSelectMessage(msg.id); setActiveDeleteMenu(null); }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              Delete
            </DeleteMenuItem>
          </>
        )}
      </DeleteMenu>
    </div>,
    document.body
  );
});

MessageActionMenuPortal.displayName = 'MessageActionMenuPortal';
