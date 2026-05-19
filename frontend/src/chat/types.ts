// --- SHARED TYPES ---
// All interfaces and type aliases used across Chat components.

export interface ReplyContext {
  id: string;
  username: string;
  text: string;
  type: 'text' | 'image' | 'video' | 'file';
  url?: string;
  isDeleted?: boolean;
}

export interface Message {
  id: string;
  userId: string;
  username: string;
  type: 'text' | 'image' | 'video' | 'file' | 'system_notification';
  text?: string;
  url?: string;
  originalName?: string;
  size?: number;
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
  reactions?: { [emoji: string]: { userId: string; username: string }[] };
  edited?: boolean;
  replyingTo?: ReplyContext;
  isDeleted?: boolean;
  deletedBy?: string;
  isUploading?: boolean;
  uploadError?: boolean;
  cursor?: string;
}

export interface Gif {
  id: string;
  url: string;
  preview: string;
}

export type RouterHistoryState = {
  usr?: Record<string, unknown>;
  key?: string;
  idx?: number;
  overlayGuard?: boolean;
  [key: string]: unknown;
};

export type DownloadProgressCallback = (progress: number) => void; // 0–1

export interface LinkPreviewData {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  hostname: string;
  siteName?: string | null;
}

export interface MessageItemProps {
  msg: Message;
  showUsername: boolean;
  currentUserId: string;
  activeDeleteMenu: string | null;
  deleteMenuRef: React.RefObject<HTMLDivElement>;
  handleSetReply: (message: Message) => void;
  handleReact: (messageId: string, emoji: string) => void;
  openDeleteMenu: (messageId: string) => void;
  openLightbox: (url: string) => void;
  isMediaLoaded: boolean;
  onRequestMediaLoad: (messageId: string, mediaUrl?: string) => void;
  isMediaLoadInProgress: boolean;
  mediaLoadProgress: number;
  loadedMediaSrc?: string;
  onRequestDownload: (messageId: string, mediaUrl: string, filename: string) => void;
  isDownloadInProgress: boolean;
  downloadProgress: number;
  deleteForMe: (messageId: string) => void;
  deleteForEveryone: (messageId: string) => void;
  scrollToMessage: (messageId: string, sourceMessageId?: string, behavior?: 'auto' | 'smooth', force?: boolean, replyingToPayload?: any) => void;
  isSelectModeActive: boolean;
  isSelected: boolean;
  handleToggleSelectMessage: (messageId: string) => void;
  setActiveDeleteMenu: (id: string | null) => void;
  handleCopy: (message: Message) => void;
  handleOpenReport: (message: Message) => void;
  handleStartEdit: (message: Message) => void;
  handleCancelSelectMode: () => void;
  isMobileView: boolean;
  onOpenReactionPicker: (messageId: string, rect: DOMRect, sender: 'me' | 'other') => void;
  setReactionsPopup: (popup: { messageId: string; reactions: { [emoji: string]: { userId: string; username: string; }[] }; rect: DOMRect } | null) => void;
  selectedMessages: string[];
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string) => void;
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null;
  editingMessageId: string | null;
  handleCancelEdit: () => void;
  onVideoFullscreenEnter?: (messageId: string) => void;
}

export interface TypingIndicatorProps {
  onlineUsers: import('../UserContext').UserProfile[];
  currentUserId: string;
}
