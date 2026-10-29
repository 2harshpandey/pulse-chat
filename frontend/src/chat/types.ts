// --- SHARED TYPES ---
// All interfaces and type aliases used across Chat components.

export interface ReplyContext {
  id: string;
  username: string;
  text: string;
  type: 'text' | 'image' | 'video' | 'file' | 'audio' | 'poll' | 'group';
  url?: string;
  duration?: number;
  isDeleted?: boolean;
  deletedBy?: string;
  poll?: any;
  mediaCount?: number;
  isGroup?: boolean;
}

export interface Message {
  id: string;
  _id?: string;
  userId: string;
  username: string;
  type: 'text' | 'image' | 'video' | 'file' | 'audio' | 'system_notification' | 'poll' | 'group';
  text?: string;
  url?: string;
  originalName?: string;
  size?: number;
  duration?: number;
  waveform?: number[];
  poll?: { question: string; options?: any[] };
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
  reactions?: { [emoji: string]: { userId: string; username: string; isAlbum?: boolean }[] };
  edited?: boolean;
  replyingTo?: ReplyContext;
  isDeleted?: boolean;
  vanished?: boolean;
  deletedBy?: string;
  pinned?: { pinnedAt: string; expiresAt?: string | null } | null;
  isUploading?: boolean;
  uploadError?: boolean;
  clientTempId?: string;
  localBlobUrl?: string;
  cursor?: string;
  mediaCount?: number;
  isGroup?: boolean;
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
  favicon?: string | null;
  hostname: string;
  siteName?: string | null;
}

export interface ReactionSourceEntry {
  userId: string;
  username: string;
  emoji: string;
  messageId: string;
  isAlbum?: boolean;
  mediaThumbUrl?: string;
  isVideo?: boolean;
}

export interface ReactionsPopupData {
  messageId: string;
  reactions: { [emoji: string]: { userId: string; username: string }[] };
  rect?: DOMRect;
  reactionSources?: ReactionSourceEntry[];
}

export interface MessageItemProps {
  msg: Message;
  isLastMessage?: boolean;
  scrollToBottom?: () => void;
  isPinned?: boolean;
  showUsername: boolean;
  currentUserId: string;
  activeDeleteMenu: string | null;
  deleteMenuRef: React.RefObject<HTMLDivElement>;
  handleSetReply: (message: Message) => void;
  handleReact: (messageId: string, emoji: string, isAlbum?: boolean) => void;
  openDeleteMenu: (messageId: string) => void;
  openLightbox: (url: string) => void;
  openMediaGallery?: (items: Message[], initialIndex: number) => void;
  isMediaLoaded: boolean;
  onRequestMediaLoad: (messageId: string, mediaUrl?: string) => void;
  onMediaLoad?: (messageId: string) => void;
  isMediaLoadInProgress: boolean;
  mediaLoadProgress: number;
  loadedMediaSrc?: string;
  onRequestDownload: (messageId: string, mediaUrl: string, filename: string) => void;

  deleteForMe: (messageId: string) => void;
  deleteForEveryone: (messageId: string) => void;
  scrollToMessage: (messageId: string, sourceMessageId?: string, behavior?: 'auto' | 'smooth', force?: boolean, replyingToPayload?: any) => Promise<void> | void;
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
  setReactionsPopup: (popup: ReactionsPopupData | null) => void;
  selectedMessages: string[];
  isMobileReactionPickerHidden?: boolean;
  handleOpenFullEmojiPicker: (rect: DOMRect, messageId: string) => void;
  reactionPickerData: { messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null;
  editingMessageId: string | null;
  handleSetEditingMessageId: (id: string | null) => void;
  handleCancelEdit: () => void;
  onVideoFullscreenEnter?: (messageId: string) => void;
  onResumeUpload?: (messageId: string) => void;
  onCancelUpload?: (messageId: string) => void;
  onMediaError?: (messageId: string, url?: string) => void;
  quotedGroupInfo?: { count: number; primaryId: string; caption?: string };
}

export interface TypingIndicatorProps {
  onlineUsers: import('../UserContext').UserProfile[];
  currentUserId: string;
}

export type { PresenceActivity } from '../UserContext';
