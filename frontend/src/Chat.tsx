import React, { useState, useEffect, useLayoutEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { createPortal, flushSync } from 'react-dom';
import styled, { createGlobalStyle, keyframes, css } from 'styled-components';
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import { useDrag } from '@use-gesture/react';
import { UserContext, UserProfile } from './UserContext';
import { useTheme } from './ThemeContext';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Auth from './Auth';
import { getCachedMediaBlob, setCachedMediaBlob } from './mediaCache';
import { transferManager } from './chat/TransferManager';
import type { Message, Gif, ReplyContext, RouterHistoryState, DownloadProgressCallback, LinkPreviewData, MessageItemProps, TypingIndicatorProps } from './chat/types';
import {
  MAX_MESSAGE_LENGTH, GIF_FETCH_LIMIT, getInputDraftKey, isDesktopInteractionDevice,
  INITIAL_HISTORY_BATCH_SIZE, HISTORY_PAGE_SIZE, START_REACHED_COOLDOWN_MS, INITIAL_FIRST_ITEM_INDEX,
  scrollLog, quoteLog, quoteWarn, MAX_LINK_PREVIEW_CACHE_ENTRIES,
  MAX_NEW_MESSAGE_INDICATOR_COUNT, MAX_LOADED_MEDIA_TRACKING, MAX_QUOTE_JUMP_STACK_DEPTH,
  MAX_QUOTE_AUTO_LOAD_PAGES, QUOTE_JUMP_TARGET_TOP_RATIO, FULLSCREEN_RESTORE_VISIBILITY_MARGIN,
  FULLSCREEN_RESTORE_FALLBACK_DELAY_MS, PHOTO_LIGHTBOX_MIN_SCALE, PHOTO_LIGHTBOX_MAX_SCALE,
  PHOTO_LIGHTBOX_STEP, PHOTO_LIGHTBOX_WHEEL_SENSITIVITY, LONG_PRESS_CANCEL_MOVE_PX,
  MIN_REPORT_REASON_LENGTH, MAX_REPORT_REASON_LENGTH, SPEEDS,
  QUICK_REACTIONS, normalizeReactionEmoji, filterValidReactions,
} from './chat/constants';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import {
  getUserId, normalizeMessageId, getMessageElementId, normalizeOverlayText,
  EMOJI_SEQUENCE_RE, wrapEmojis, findMessageElement, resolveReplyTargetId,
  ALLOWED_DOWNLOAD_HOSTS, resolveApiBaseUrl,  buildDownloadProxyUrl, fetchBlobWithProgress, downloadFile,
  sanitizeMediaUrl, isGiphyUrl, withCloudinaryTransform,
  getQuotedPreviewThumbUrl, getMediaGatePreviewUrl, formatMediaSize,
  getMediaCacheLookupKey, getFileContainerLabel, chooseReadableFilename,
  sanitizeFilename, inferredContentLengthByUrlCache, getCurrentHistoryPath,
  readRouterHistoryState, readRouterUserState, buildOverlayGuardState,
  pushOverlayGuardHistoryEntry, clearOverlayGuardHistoryEntry,
  getBlobUrl, revokeBlobUrl, getDeletedForMeIds, addDeletedForMeIds,
} from './chat/utils';
import { NOTIFICATION_BEEP } from './chat/audioConstants';
import { VirtualMessageWrapper } from './chat/VirtualMessageWrapper';

const ChatSearchContainer = styled.div<{ $active: boolean; $isClosing?: boolean }>`
  display: flex;
  align-items: center;
  background: ${p => p.$active || p.$isClosing ? 'var(--bg-elevated)' : 'transparent'};
  border-radius: 20px;
  border: none;
  padding: 0;
  width: ${p => p.$active ? '240px' : '40px'};
  height: 40px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  will-change: width;

  @media (max-width: 768px) {
    position: absolute;
    /* When active, move to right: 0 to cover the whole header. When closed, stay at right: 48px (left of Users button) */
    right: ${p => p.$active || p.$isClosing ? '0' : '48px'};
    top: 50%;
    transform: translateY(-50%);
    width: ${p => p.$active ? 'calc(100vw - 2rem)' : '40px'};
    z-index: 10;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
`;

const SearchPlaceholder = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: block;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
  }
`;

const HeaderActionsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;

  @media (max-width: 768px) {
    position: relative;
    height: 40px;
    /* Removed padding-right so MobileUserListToggle sits naturally at the right edge */
  }
`;

const ChatSearchInput = styled.input<{ $active: boolean }>`
  background: transparent;
  border: none;
  color: #fff;
  flex: 1;
  width: 100%;
  min-width: 0;
  opacity: ${p => p.$active ? 1 : 0};
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 0.9rem;
  padding: 0 0 0 0.5rem;
  pointer-events: ${p => p.$active ? 'auto' : 'none'};
  &:focus { outline: none; }
  &::placeholder { color: #94a3b8; }
`;

const ChatSearchButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  flex-shrink: 0;
  &:hover { 
    transform: scale(1.15); 
    border-color: rgba(59, 130, 246, 0.5); 
    background: rgba(59, 130, 246, 0.1);
    color: var(--text-primary);
    box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4); 
  }
  &:active { transform: scale(0.9); }
  svg { width: 18px; height: 18px; transition: transform 0.5s cubic-bezier(0.34,1.56,0.64,1); }
`;

const SearchNotFoundToast = styled.div<{ $visible: boolean }>`
  position: absolute;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%) translateY(${p => p.$visible ? '0' : '20px'}) scale(${p => p.$visible ? 1 : 0.95});
  opacity: ${p => p.$visible ? 1 : 0};
  pointer-events: none;
  background: rgba(30, 30, 30, 0.95);
  color: #fff;
  padding: 10px 24px;
  border-radius: 30px;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 1000;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  
  @media (max-width: 768px) {
    bottom: 100px;
  }
`;

import {
  GlobalStyle,
  EmojiPickerWrapper, MobileEmojiPanel,
  DragDropOverlay, DragDropCard, DragDropIconWrapper, DragDropTitle, DragDropSubtitle,
  AppContainer, Header, HeaderTitle, SoundToggleButton, SoundToggleIcon,
  PinnedBannerContainer, PinnedBannerIconWrapper, PinnedCycleIndicator,
  PinnedCycleSegment, PinnedBannerContentWrapper, PinnedBannerLabel, PinnedBannerText,
  LayoutContainer, ChatWindow, MessagesContainer, MessagesAndScrollWrapper,
  MessageRow, Username, MobileReactionPicker, MessageBubble,
  EditPreviewContainer, EditPreviewIcon, EditPreviewText, EditPreviewDismiss,
  FooterContainer, Timestamp, Footer, InputContainer,
  PlusMenuButton, PlusMenu, PlusMenuItem,
  MessageInput, InputTextWrapper, InputHighlightOverlay, CharacterCounter, SendButton,
  FileAttachmentCard, FileAttachmentMeta, FileAttachmentName, FileAttachmentDetails,
  MediaContent, MediaDownloadOverlayBtn, MediaImageWrapper, MediaVideoWrapperDiv,
  MediaLoadGate, MediaLoadIcon, MediaLoadLabel, MediaLoadPreview, MediaSizeBadge,
  InlineDownloadBtn,
  FilePreviewModal, FilePreviewModalHeader, FilePreviewModalClose, FilePreviewModalFilename,
  FilePreviewModalBody, FilePreviewModalFooter, FilePreviewThumbStrip, FilePreviewThumb,
  FilePreviewAddBtn, FilePreviewRemoveBtn, FilePreviewCaptionInput, FilePreviewSendBtn,
  FilePreviewNoPreview, FilePreviewContainer, FilePreviewImage, FilePreviewInfo, CancelPreviewButton,
  ConfirmationButton, ReactionsContainer,
  Lightbox, LightboxCloseButton, LightboxFrame, LightboxImage, LightboxToolbar, LightboxZoomButton,
  DeleteMenu, DeleteMenuItem,
  UserSidebar, SidebarBackdrop, UserList, UserListItem, MobileUserListToggle, ThemeToggleBtn,
  ClearChatButton, LogoutButton,
  GifPickerModal, GifPickerContent, GifSearchBar, GifGrid, GifGridItem,
  BouncingDots, TypingIndicatorContainer,
  ReplyPreviewContainer, ReplyText,
  QuotedMessageContainer, QuotedMediaThumb,
  LinkPreviewCard, LinkPreviewImage, LinkPreviewBody, LinkPreviewSiteName, LinkPreviewTitle, LinkPreviewDesc,
  ReactionPicker, ReactionEmoji,
  ReactionsPopup,
  ReactionsPopupModal, ReactionsPopupContent, ReactionsPopupHeader, ReactionTab,
  ReactionsUserList, UserAvatar, ReactionUserRow, ReactionEmojiSpan, ReactionCountSpan,
  MessageActions, ActionButton, SelectCheckboxContainer, Checkbox,
  SelectModeFooter, DeleteButton, CopyButton, EditButton, ReportButton,
  ConfirmationModal, ConfirmationContent,
  ReportModal, ReportDialog, ReportTitle, ReportSubtext, ReportMessageMeta,
  ReportReasonInput, ReportReasonMeta, ReportError, ReportActions,
  DiscardDialog, DiscardTitle, DiscardActions, DiscardBtnCancel, DiscardBtnConfirm,
  VideoPlayerWrapper, CVPContainer, CVPControls, CVPTimelineWrapper, CVPTimelineTrack,
  CVPTimelineFill, CVPTimelineThumb, CVPBottomRow, CVPIconBtn, CVPTime, CVPSpeedBtn,
  CVPVolumeWrapper, CVPDoubleTapOverlay, CVPTapIndicator, CVPCenterPlayBtn,
  DownloadProgressRing, MessageText, SystemMessage,
  ScrollToBottomButton, NewMessagesBadge,
} from './chat/ChatStyledComponents';
import { VideoPlayer } from './chat/VideoPlayer';
import { MediaDisplay } from './chat/MediaDisplay';
import { renderMessageContent, detectFirstUrl, CANDIDATE_URL_RE, renderTextWithLinks } from './chat/renderMessage';
import { LinkPreview } from './chat/LinkPreview';
import { linkPreviewCache, rememberLinkPreview } from './chat/linkPreviewState';
import { MessageItem } from './chat/MessageItem';
import { TypingIndicator, FilmIcon, FileIcon } from './chat/TypingIndicator';

const getDateSeparatorText = (timestamp: string | number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
};

type UploadCacheEntry = {
  status: 'uploading' | 'success' | 'error';
  promise?: Promise<any>;
  data?: any;
  error?: string;
};

const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return resolve(file);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1920;
      const MAX_HEIGHT = 1080;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) return resolve(file);
        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => resolve(file);
  });
};

function Chat({ isMe, isTempLink }: { isMe?: boolean; isTempLink?: boolean } = {}) {
  const userContext = useContext(UserContext);
  const { token: tempToken, roomId: urlRoomId } = useParams<{ token?: string; roomId?: string }>();
  const roomId = isMe ? 'me' : (urlRoomId || userContext?.profile?.roomId || 'me');
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (userContext?.profile && roomId && roomId !== 'me') {
      const apiBase = resolveApiBaseUrl();
      fetch(`${apiBase}/api/rooms/${roomId}/meta`)
        .then(res => res.json())
        .then(data => {
          if (data && data.id && data.id !== roomId) {
            navigate(`/room/${data.id}`, { replace: true, state: location.state });
          }
        })
        .catch(console.error);
    }
  }, [userContext?.profile, roomId, navigate, location.state]);

  // --- STATE MANAGEMENT ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const [loadedMediaMessageIds, setLoadedMediaMessageIds] = useState<string[]>([]);
  const [mediaLoadProgressById, setMediaLoadProgressById] = useState<Record<string, number>>({});
  const [loadedMediaSrcById, setLoadedMediaSrcById] = useState<Record<string, string>>({});
  const [downloadProgressById, setDownloadProgressById] = useState<Record<string, number>>({});
  const [inputMessage, setInputMessage] = useState('');
  const [preMediaDraft, setPreMediaDraft] = useState('');
  const normalizedOverlayMessage = useMemo(() => normalizeOverlayText(inputMessage), [inputMessage]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxTransform, setLightboxTransform] = useState<{ scale: number; x: number; y: number }>({
    scale: PHOTO_LIGHTBOX_MIN_SCALE,
    x: 0,
    y: 0,
  });
  const [lightboxNaturalSize, setLightboxNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [isLightboxInteracting, setIsLightboxInteracting] = useState(false);
  const [activeDeleteMenu, setActiveDeleteMenu] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [isDiscardConfirmationVisible, setIsDiscardConfirmationVisible] = useState(false);
  const [previewActiveIndex, setPreviewActiveIndex] = useState(0);
  const [previewCaption, setPreviewCaption] = useState('');
  const [stagedGif, setStagedGif] = useState<Gif | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifResults, setGifResults] = useState<Gif[]>([]);
  const [gifSearchTerm, setGifSearchTerm] = useState('');
  const [gifError, setGifError] = useState('');
  const [gifFetchKey, setGifFetchKey] = useState(0); // increment to force-retry
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  const [isDesktopInteraction, setIsDesktopInteraction] = useState(isDesktopInteractionDevice);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isSearchClosing, setIsSearchClosing] = useState(false);
  
  const handleCloseSearch = useCallback(() => {
    setIsSearchActive(false);
    setIsSearchClosing(true);
    setTimeout(() => setIsSearchClosing(false), 300); // match CSS transition duration
  }, []);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [showSearchNotFound, setShowSearchNotFound] = useState(false);
  const scrollBeforeSearchRef = useRef<number | null>(null);
  // Tracks whether the user was at the very bottom when they opened the search bar.
  // Used to reliably restore to bottom after search closes (can't rely on saved scrollTop
  // because the container resizes when data switches back to the full message list).
  const wasAtBottomBeforeSearchRef = useRef<boolean>(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isUserListVisible, setIsUserListVisible] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('pulseSoundEnabled');
    return stored === null ? true : stored === 'true';
  });
  const isSoundEnabledRef = useRef(isSoundEnabled);
  const [isSoundToggleAnimating, setIsSoundToggleAnimating] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isSelectModeActive, setIsSelectModeActive] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [isDeleteConfirmationVisible, setIsDeleteConfirmationVisible] = useState(false);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [reportTargetMessage, setReportTargetMessage] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportError, setReportError] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [canDeleteForEveryone, setCanDeleteForEveryone] = useState(false);
  const [fullEmojiPickerPosition, setFullEmojiPickerPosition] = useState<DOMRect | null>(null);
  const checkIsMobile = () => typeof window !== 'undefined' ? (window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches) : false;
  const [isMobileView, setIsMobileView] = useState(checkIsMobile);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageOriginalText, setEditingMessageOriginalText] = useState<string>('');
  const [priorDraftBeforeEdit, setPriorDraftBeforeEdit] = useState<string>('');
  const [isScrollToBottomVisible, setIsScrollToBottomVisible] = useState(false);
  const [newMessagesWhileScrolledUp, setNewMessagesWhileScrolledUp] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historySessionId, setHistorySessionId] = useState(0);
  const [isJumpingToPinned, setIsJumpingToPinned] = useState(false);
  const lastPingAtRef = useRef<number>(Date.now());

  const groupStartMessageIdsRef = useRef<Set<string>>(new Set());
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
  const [oldestLoadedAt, setOldestLoadedAt] = useState<string | null>(null);
  const prependScrollLockRef = useRef<number>(0);
  const pendingPrependMessagesRef = useRef<Message[] | null>(null);
  const pendingFirstItemIndexRef = useRef<number | null>(null);
  const initialTopMostItemIndexRef = useRef<number | null>(null);
  if (historyLoaded && initialTopMostItemIndexRef.current === null) {
    initialTopMostItemIndexRef.current = INITIAL_FIRST_ITEM_INDEX + (messages.length > 0 ? messages.length - 1 : 0);
  }
  // --- FIX: Unified firstItemIndex — single source of truth ---
  // The ref and state are kept perfectly in sync via setFirstItemIndex().
  // The ref is used in scroll callbacks (stale closure-safe), the state
  // is passed to <Virtuoso firstItemIndex={firstItemIndex}> for rendering.
  const [firstItemIndex, setFirstItemIndexState] = useState(INITIAL_FIRST_ITEM_INDEX);
  const firstItemIndexRef = useRef(INITIAL_FIRST_ITEM_INDEX);
  const setFirstItemIndex = useCallback((valOrUpdater: number | ((prev: number) => number)) => {
    // Keep ref in sync synchronously — callbacks always read the latest value.
    setFirstItemIndexState((prev) => {
      const next = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater;
      firstItemIndexRef.current = next;
      scrollLog('firstItemIndex →', next);
      return next;
    });
  }, []);
  const hasMoreOlderMessagesRef = useRef(hasMoreOlderMessages);
  const oldestLoadedAtRef = useRef<string | null>(oldestLoadedAt);
  // Use a ref (not state) for the message ID associated with the full emoji picker.
  // EmojiPicker from emoji-picker-react may cache its onEmojiClick prop and call
  // a stale closure — reading from a ref guarantees we always get the current value.
  // fullEmojiPickerPosition (state) already controls whether the panel is shown;
  // we only need the ref to carry the message ID into the callback.
  const messageIdForFullEmojiPickerRef = useRef<string | null>(null);
  const [reactionsPopup, setReactionsPopup] = useState<{ messageId: string; reactions: { [emoji: string]: { userId: string; username: string; }[] }; rect: DOMRect } | null>(null);
  const [reactionPickerData, setReactionPickerData] = useState<{ messageId: string; rect: DOMRect; sender: 'me' | 'other' } | null>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<DOMRect | null>(null);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null!);
  const plusButtonRef = useRef<HTMLButtonElement>(null!);
  // Refs to track video fullscreen context so we can restore the exact
  // pre-fullscreen scroll position when the user exits fullscreen.


  // --- REFS ---
  const ws = useRef<WebSocket | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const isLoadingOlderRef = useRef(false);
  // Set to true during search-close scroll restoration to block loadOlderMessages().
  // Without this guard, overflowAnchor fires onScroll with a small scrollTop during the
  // data-switch (searchResults → messages), which triggers loadOlderMessages() and
  // changes scrollHeight before we can restore the correct position.
  const suppressOlderMessageLoadRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messageHeightsRef = useRef<{ [id: string]: number }>({});
  const scrollAtSelectModeRef = useRef<number | null>(null);
  const scrollAtReactionPickerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isSelectModeActive && chatContainerRef.current) {
      scrollAtSelectModeRef.current = chatContainerRef.current.scrollTop;
    } else if (!isSelectModeActive) {
      scrollAtSelectModeRef.current = null;
    }
  }, [isSelectModeActive]);

  useEffect(() => {
    if (reactionPickerData && chatContainerRef.current) {
      scrollAtReactionPickerRef.current = chatContainerRef.current.scrollTop;
    } else if (!reactionPickerData) {
      scrollAtReactionPickerRef.current = null;
    }
  }, [reactionPickerData]);

  const filteredMessages = useMemo(() => {
    if (activeSearchQuery.trim()) {
      // Use server search results when active; empty array while loading (searchResults is null)
      return searchResults ?? [];
    }
    return messages;
  }, [messages, activeSearchQuery, searchResults]);

  useEffect(() => {
    // Only show "not found" once loading is complete and results are truly empty
    if (activeSearchQuery.trim() && !isSearchLoading && filteredMessages.length === 0) {
      setShowSearchNotFound(true);
      const timer = setTimeout(() => setShowSearchNotFound(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowSearchNotFound(false);
    }
  }, [activeSearchQuery, filteredMessages.length, isSearchLoading]);

  // ─── CRITICAL: block loadOlderMessages for the ENTIRE search session ───
  // useLayoutEffect fires synchronously after React commits the DOM, BEFORE the browser's
  // layout step where overflowAnchor runs. This ensures the flag is set before overflowAnchor
  // fires its queued onScroll event (which would trigger loadOlderMessages).
  //
  // The flag must be set on BOTH the open and close transitions:
  //
  // ① Search OPENS (activeSearchQuery becomes non-empty):
  //   filteredMessages switches to searchResults → overflowAnchor resets scrollTop to 0
  //   (no DOM anchor exists in the completely new content) → onScroll fires with scrollTop < 2500
  //   → loadOlderMessages() would prepend older messages, inflating scrollHeight.
  //   After search closes, applyRestore sets scrollTop = savedValue in the now-LARGER container,
  //   landing ABOVE the intended position (earlier/older messages). Blocked here.
  //
  // ② Search CLOSES (activeSearchQuery becomes ''):
  //   filteredMessages switches back to messages → overflowAnchor fires again → same risk.
  //   Blocked here too.
  useLayoutEffect(() => {
    if (activeSearchQuery) {
      // Search just became ACTIVE — block loadOlderMessages for the entire search session
      suppressOlderMessageLoadRef.current = true;
    } else if (scrollBeforeSearchRef.current !== null) {
      // Search just CLOSED with a saved position to restore — keep blocking during restoration
      suppressOlderMessageLoadRef.current = true;
    } else {
      // Not in search mode, nothing to restore — clear any stale flag
      suppressOlderMessageLoadRef.current = false;
    }
  }, [activeSearchQuery]);

  useEffect(() => {
    if (activeSearchQuery || scrollBeforeSearchRef.current === null) {
      // If closing search but nothing to restore, ensure the flag is cleared
      if (!activeSearchQuery) suppressOlderMessageLoadRef.current = false;
      return;
    }

    const targetScroll = scrollBeforeSearchRef.current;
    const wasAtBottom = wasAtBottomBeforeSearchRef.current;
    scrollBeforeSearchRef.current = null;
    wasAtBottomBeforeSearchRef.current = false;

    const scroller = chatContainerRef.current;
    if (!scroller) return;

    // suppressOlderMessageLoadRef.current is already true — set by the useLayoutEffect above
    // before the browser's layout step so overflowAnchor's onScroll can't trigger loadOlderMessages.

    let lastHeight = scroller.scrollHeight;
    let stableFrames = 0;
    let rafId: number;
    let cleanup: (() => void) | undefined;

    const applyRestore = () => {
      // Temporarily suppress overflowAnchor so the browser doesn't fight our scrollTop
      const prev = scroller.style.overflowAnchor;
      scroller.style.overflowAnchor = 'none';

      if (wasAtBottom) {
        // User was at the very bottom — scroll to the absolute maximum
        scroller.scrollTop = scroller.scrollHeight;
      } else {
        const max = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = Math.min(Math.max(targetScroll, 0), max);
      }

      // Re-enable overflowAnchor and unblock loadOlderMessages after one frame
      requestAnimationFrame(() => {
        scroller.style.overflowAnchor = prev || '';
        suppressOlderMessageLoadRef.current = false;
      });
    };

    const checkStable = () => {
      const currentHeight = scroller.scrollHeight;
      if (currentHeight === lastHeight) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        lastHeight = currentHeight;
      }

      if (stableFrames >= 2) {
        // Height has been stable for 2 consecutive frames — content has settled
        cleanup?.();
        applyRestore();
      } else {
        rafId = requestAnimationFrame(checkStable);
      }
    };

    // Kick off the stability-check loop
    rafId = requestAnimationFrame(checkStable);

    // Safety timeout: if content never stabilizes within 500ms, apply anyway
    const safetyTimer = window.setTimeout(() => {
      cleanup?.();
      applyRestore();
    }, 500);

    cleanup = () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(safetyTimer);
      suppressOlderMessageLoadRef.current = false; // Always unblock on cleanup
      cleanup = undefined;
    };

    return () => cleanup?.();
  }, [activeSearchQuery]);
  const isNativeFilePickerOpenRef = useRef(false);
  // Initialize to Date.now() so that on the very first tab-switch (e.g. the page
  // was opened in a background tab), timeHidden computes as a small number (< 5 s)
  // rather than as Date.now() - 0 = a huge number that would falsely trigger a reconnect
  // and tear down a socket that is still in the middle of its initial handshake.
  const lastHiddenTimeRef = useRef<number>(Date.now());
  // Tracks whether we've done the very first scroll-to-bottom after history loads.
  // Must be a ref (not state) so it doesn't trigger re-renders.
  const hasInitialScrolled = useRef(false);
  const previousScrollMetricsRef = useRef<{ height: number; top: number } | null>(null);
  const initialHistoryBottomStabilized = useRef(false);
  const suppressInitialBottomPinRef = useRef(false);
  // Tracks whether the user is currently at the bottom of the chat.
  const isAtBottomRef = useRef(true);
  const messageTailSnapshotRef = useRef<{ length: number; lastId: string | null }>({ length: 0, lastId: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const previewCaptionInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const deleteMenuRef = useRef<HTMLDivElement>(null!);
  const gifPickerRef = useRef<HTMLDivElement>(null!);
  // Tracks when the GIF picker was last opened (epoch ms).
  // Used to ignore the phantom synthetic click that mobile browsers fire
  // ~300 ms after pointerdown, which would otherwise immediately close the modal.
  const gifPickerOpenedAtRef = useRef<number>(0);
  const keyboardWasOpenBeforeGifRef = useRef<boolean>(false);
  const keyboardWasOpenBeforeEmojiRef = useRef<boolean>(false);
  const restoreKeyboardAfterEmojiCloseRef = useRef<boolean>(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null!);
  const fullEmojiPickerRef = useRef<HTMLDivElement>(null!);
  const emojiButtonRef = useRef<HTMLButtonElement>(null!);
  const gifSearchInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null!);
  const inputOverlayRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string>(getUserId());
  const uploadCacheRef = useRef<Map<File, UploadCacheEntry>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cooldown flag: true while we're within the throttle window after sending start_typing.
  // Prevents sending start_typing more than once per ~3 s even on rapid keystrokes.
  const typingCooldownRef = useRef(false);
  const presenceActivityRef = useRef<'typing' | 'gif_selecting' | null>(null);
  const resizeRafRef = useRef<number>(0);
  const lastInputHeightRef = useRef<number>(0);
  const lastInputValueLengthRef = useRef<number>(0);
  const skipNextInputLayoutSyncRef = useRef(false);
  const stableViewportHeightRef = useRef<number>(window.innerHeight);
  const stableViewportWidthRef = useRef<number>(window.innerWidth);
  const appliedViewportHeightRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioCtxUnlockedRef = useRef(false);
  const lastNotificationSoundAtRef = useRef<number>(0);
  const fullscreenScrollSnapshotRef = useRef<{ messageId: string; scrollTop: number; bottomOffset: number; clientHeight: number } | null>(null);
  const isVideoFullscreenSessionRef = useRef(false);
  const suppressProgrammaticScrollUntilRef = useRef<number>(0);
  const quoteJumpLockRef = useRef(false);
  const quoteJumpLockTimeoutRef = useRef<number | null>(null);
  const pendingBottomScrollTimeoutsRef = useRef<number[]>([]);
  // WebSocket auto-reconnect management refs
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef<number>(2000); // starts at 2 s, doubles on each retry
  const mediaLoadInFlightRef = useRef<Set<string>>(new Set());
  const mediaBlobUrlMapRef = useRef<Map<string, string>>(new Map());
  const mediaCacheHydrationInFlightRef = useRef<Set<string>>(new Set());
  const downloadInFlightRef = useRef<Set<string>>(new Set());
  const downloadAbortControllersRef = useRef(new Map<string, AbortController>());
  const mediaLoadAbortControllersRef = useRef(new Map<string, AbortController>());
  const isVirtuosoScrollingRef = useRef(false);
  const pendingTopLoadAfterScrollRef = useRef(false);
  const pendingTopLoadTimerRef = useRef<number | null>(null);
  // Cooldown timestamp: prevents startReached from firing more often than
  // START_REACHED_COOLDOWN_MS. Virtuoso calls startReached on every scroll
  // frame near the top; without throttling, repeated prepends near the
  // threshold can still look jittery during slow upward drag.
  const lastStartReachedAtRef = useRef<number>(0);
  const quoteJumpReturnStackRef = useRef<string[]>([]);
  const lightboxFrameRef = useRef<HTMLDivElement>(null);
  const lightboxPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lightboxDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const lightboxPinchRef = useRef<{
    startDistance: number;
    startScale: number;
    focalImageX: number;
    focalImageY: number;
  } | null>(null);
  const lightboxTransformRef = useRef(lightboxTransform);
  const lightboxImageRef = useRef<HTMLImageElement>(null);
  const lastLightboxTapRef = useRef<number>(0);

  // Base API URL: upgrade http:// to https:// when the page itself is on HTTPS.
  // Mobile networks and many corporate proxies enforce mixed-content policy strictly.
  const apiBase = resolveApiBaseUrl();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOnline = () => setIsBrowserOnline(true);
      const handleOffline = () => setIsBrowserOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const shouldPlayNotificationSound = () => {
    if (typeof document === 'undefined') return false;
    if (!isSoundEnabledRef.current) return false;
    // Play if the page is hidden (different app / minimised) OR if the
    // document is not focused (user is on a different tab in the same browser).
    const isHidden = document.visibilityState === 'hidden';
    const isBlurred = !document.hasFocus();
    return isHidden || isBlurred;
  };

  const playNotificationSound = useCallback((_variant: 'join' | 'message') => {
    if (!shouldPlayNotificationSound()) return;
    const now = Date.now();
    if (now - lastNotificationSoundAtRef.current < 420) return;
    lastNotificationSoundAtRef.current = now;

    const ctx = audioCtxRef.current;
    const buf = audioBufferRef.current;
    if (!ctx || !buf) return;

    const tryPlay = () => {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        source.start(0);
      } catch {
        // Ignore play errors
      }
    };

    if (ctx.state === 'suspended') {
      // Context may still be suspended before the first user gesture.
      // Attempt to resume and then play.
      ctx.resume().then(() => {
        audioCtxUnlockedRef.current = true;
        tryPlay();
      }).catch(() => {});
    } else {
      tryPlay();
    }
  }, [isSoundEnabled]);

  const notifyNativeFilePickerOpen = useCallback(() => {
    isNativeFilePickerOpenRef.current = true;
    window.setTimeout(() => {
      isNativeFilePickerOpenRef.current = false;
    }, 120000);
    try {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'file_picker_open', ttlMs: 120000, roomId }));
      }
    } catch (_) {
      // Best-effort presence grace only.
    }
  }, []);

  const markNativeFilePickerClosed = useCallback(() => {
    isNativeFilePickerOpenRef.current = false;
    try {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'file_picker_close', roomId }));
      }
    } catch (_) {
      // Best-effort presence cleanup only.
    }
  }, []);

  useEffect(() => {
    const primaryInput = fileInputRef.current;
    const addInput = addFileInputRef.current;

    if (primaryInput) primaryInput.addEventListener('cancel', markNativeFilePickerClosed);
    if (addInput) addInput.addEventListener('cancel', markNativeFilePickerClosed);

    return () => {
      if (primaryInput) primaryInput.removeEventListener('cancel', markNativeFilePickerClosed);
      if (addInput) addInput.removeEventListener('cancel', markNativeFilePickerClosed);
    };
  }, [markNativeFilePickerClosed]);

  useEffect(() => {
    if (!userContext?.profile) return;

    // Unlock the AudioContext on the first user interaction.
    // Browsers require a user gesture before audio can play; calling resume()
    // here permanently unlocks the context for all future background plays.
    const unlockAudio = () => {
      let justCreated = false;
      if (!audioCtxRef.current) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;
          justCreated = true;
          // Decode base64 WAV → ArrayBuffer → AudioBuffer
          const base64 = NOTIFICATION_BEEP.split(',')[1];
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          ctx.decodeAudioData(bytes.buffer).then(buf => {
            audioBufferRef.current = buf;
          }).catch(() => {});
        } catch {
          // Web Audio API not available
        }
      }

      const ctx = audioCtxRef.current;
      if (ctx && !audioCtxUnlockedRef.current) {
        audioCtxUnlockedRef.current = true; 
        
        // If we JUST created it inside a user gesture, the browser will automatically 
        // transition it to 'running'. Calling resume() synchronously here races with the 
        // browser's internal initialization and triggers a false-positive Chrome warning.
        if (!justCreated && ctx.state === 'suspended') {
          ctx.resume().catch(() => {
            audioCtxUnlockedRef.current = false; // revert if it failed
          });
        }
      }
    };

    window.addEventListener('click', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
    window.addEventListener('touchstart', unlockAudio, { capture: true });

    return () => {
      window.removeEventListener('click', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
      window.removeEventListener('touchstart', unlockAudio, { capture: true });
    };
  }, [userContext?.profile]);

  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
    try {
      localStorage.setItem('pulseSoundEnabled', String(isSoundEnabled));
    } catch {
      // Ignore storage errors.
    }
  }, [isSoundEnabled]);

  useEffect(() => {
    if (!isSoundToggleAnimating) return;
    const timer = window.setTimeout(() => setIsSoundToggleAnimating(false), 700);
    return () => window.clearTimeout(timer);
  }, [isSoundToggleAnimating]);

  useEffect(() => {
    document.body.classList.add('hide-global-home-btn');
    return () => {
      document.body.classList.remove('hide-global-home-btn');
    };
  }, []);

  const setPresenceActivity = useCallback((nextActivity: 'typing' | 'gif_selecting' | null) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (presenceActivityRef.current === nextActivity) return;

    try {
      if (nextActivity) {
        ws.current.send(JSON.stringify({ type: 'start_typing', activity: nextActivity, roomId }));
      } else {
        ws.current.send(JSON.stringify({ type: 'stop_typing', roomId }));
      }
      presenceActivityRef.current = nextActivity;
    } catch (_) {
      // Ignore transient send errors during reconnect windows.
    }
  }, []);

  const closeEmojiPicker = useCallback((restoreKeyboard: boolean = false) => {
    setEmojiPickerPosition((prev) => {
      if (!prev) return prev;
      restoreKeyboardAfterEmojiCloseRef.current = restoreKeyboard && keyboardWasOpenBeforeEmojiRef.current;
      if (!restoreKeyboardAfterEmojiCloseRef.current) {
        keyboardWasOpenBeforeEmojiRef.current = false;
      }
      return null;
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    if (!media) return;
    const update = () => setIsDesktopInteraction(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreOlderMessagesRef.current = hasMoreOlderMessages;
  }, [hasMoreOlderMessages]);

  useEffect(() => {
    oldestLoadedAtRef.current = oldestLoadedAt;
  }, [oldestLoadedAt]);

  useEffect(() => {
    return () => {
      if (pendingTopLoadTimerRef.current !== null) {
        window.clearTimeout(pendingTopLoadTimerRef.current);
        pendingTopLoadTimerRef.current = null;
      }
      pendingTopLoadAfterScrollRef.current = false;
      mediaBlobUrlMapRef.current.forEach((url) => URL.revokeObjectURL(url));
      mediaBlobUrlMapRef.current.clear();
      mediaCacheHydrationInFlightRef.current.clear();
      mediaLoadInFlightRef.current.clear();
      downloadInFlightRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (userContext?.profile) return;

    if (pendingTopLoadTimerRef.current !== null) {
      window.clearTimeout(pendingTopLoadTimerRef.current);
      pendingTopLoadTimerRef.current = null;
    }
    pendingTopLoadAfterScrollRef.current = false;

    mediaLoadAbortControllersRef.current.forEach((controller) => controller.abort());
    mediaLoadAbortControllersRef.current.clear();
    mediaLoadInFlightRef.current.clear();
    mediaCacheHydrationInFlightRef.current.clear();

    mediaBlobUrlMapRef.current.forEach((url) => URL.revokeObjectURL(url));
    mediaBlobUrlMapRef.current.clear();

    setLoadedMediaMessageIds([]);
    setLoadedMediaSrcById({});
    setMediaLoadProgressById({});

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    setMessages([]);
    setHistoryLoaded(false);
    initialTopMostItemIndexRef.current = null;
    setFirstItemIndexState(INITIAL_FIRST_ITEM_INDEX);
    firstItemIndexRef.current = INITIAL_FIRST_ITEM_INDEX;
    setOldestLoadedAt(null);
    oldestLoadedAtRef.current = null;
    setHasMoreOlderMessages(true);
    hasMoreOlderMessagesRef.current = true;
  }, [userContext?.profile]);

  useEffect(() => {
    const liveMessageIds = new Set(messages.map((m) => m.id));

    setLoadedMediaSrcById((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [messageId, src] of Object.entries(prev)) {
        if (liveMessageIds.has(messageId)) {
          next[messageId] = src;
        } else {
          changed = true;
          const blobUrl = mediaBlobUrlMapRef.current.get(messageId);
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            mediaBlobUrlMapRef.current.delete(messageId);
          }
        }
      }
      return changed ? next : prev;
    });

    setMediaLoadProgressById((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [messageId, progress] of Object.entries(prev)) {
        if (liveMessageIds.has(messageId)) next[messageId] = progress;
        else changed = true;
      }
      return changed ? next : prev;
    });

    setDownloadProgressById((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [messageId, progress] of Object.entries(prev)) {
        if (liveMessageIds.has(messageId)) next[messageId] = progress;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [messages]);

  useEffect(() => {
    const currentLength = messages.length;
    const currentLastId = currentLength > 0 ? messages[currentLength - 1].id : null;
    const prevSnapshot = messageTailSnapshotRef.current;

    if (!historyLoaded) {
      messageTailSnapshotRef.current = { length: currentLength, lastId: currentLastId };
      return;
    }

    if (currentLength > prevSnapshot.length && prevSnapshot.length > 0) {
      if (isAtBottomRef.current) {
        // Auto-scroll to bottom if the user is already there
        requestAnimationFrame(() => scrollToBottom('smooth', true));
      } else {

        let appendedStart = -1;

        if (messages[prevSnapshot.length - 1]?.id === prevSnapshot.lastId) {
          appendedStart = prevSnapshot.length;
        } else if (prevSnapshot.lastId) {
          const previousLastIndex = messages.findIndex((m) => m.id === prevSnapshot.lastId);
          if (previousLastIndex >= 0 && previousLastIndex < currentLength - 1) {
            appendedStart = previousLastIndex + 1;
          }
        }

        if (appendedStart >= 0) {
          const incomingCount = messages
            .slice(appendedStart)
            .reduce((count, msg) => {
              if (msg.type === 'system_notification') return count;
              if (msg.userId === userIdRef.current) return count;
              return count + 1;
            }, 0);

          if (incomingCount > 0) {
            setNewMessagesWhileScrolledUp((prev) =>
              Math.min(prev + incomingCount, MAX_NEW_MESSAGE_INDICATOR_COUNT)
            );
          }
        }
      }
    }

    messageTailSnapshotRef.current = { length: currentLength, lastId: currentLastId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded, messages]);

  useEffect(() => {
    if (!userContext?.profile || messages.length === 0) return;

    let isCancelled = false;
    const loadedMessageIds = new Set(loadedMediaMessageIds);
    const userId = userIdRef.current;

    messages.forEach((message) => {
      if (!message?.id || !message?.url) return;
      if (message.isUploading) return;
      if (message.type !== 'image' && message.type !== 'video') return;
      if (loadedMessageIds.has(message.id)) return;
      if (Object.prototype.hasOwnProperty.call(loadedMediaSrcById, message.id)) return;
      if (mediaLoadInFlightRef.current.has(message.id)) return;

      const safeUrl = sanitizeMediaUrl(message.url);
      if (!safeUrl) return;

      const lookupKey = getMediaCacheLookupKey(message.id, safeUrl);
      if (mediaCacheHydrationInFlightRef.current.has(lookupKey)) return;
      mediaCacheHydrationInFlightRef.current.add(lookupKey);

      void getCachedMediaBlob(userId, message.id, safeUrl)
        .then((cachedBlob) => {
          if (isCancelled || !cachedBlob || cachedBlob.size <= 0) return;
          if (!messagesRef.current.some((m) => m.id === message.id)) return;

          const objectUrl = URL.createObjectURL(cachedBlob);
          const previousBlobUrl = mediaBlobUrlMapRef.current.get(message.id);
          if (previousBlobUrl && previousBlobUrl !== objectUrl) {
            URL.revokeObjectURL(previousBlobUrl);
          }
          mediaBlobUrlMapRef.current.set(message.id, objectUrl);

          setLoadedMediaSrcById((prev) => ({ ...prev, [message.id]: objectUrl }));
          setLoadedMediaMessageIds((prev) => {
            if (prev.includes(message.id)) return prev;
            const next = [...prev, message.id];
            return next.length > MAX_LOADED_MEDIA_TRACKING
              ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
              : next;
          });
        })
        .finally(() => {
          mediaCacheHydrationInFlightRef.current.delete(lookupKey);
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [messages, loadedMediaMessageIds, loadedMediaSrcById, userContext?.profile]);

  const syncInputOverlayScroll = useCallback(() => {
    if (!messageInputRef.current || !inputOverlayRef.current) return;
    inputOverlayRef.current.scrollTop = messageInputRef.current.scrollTop;
    inputOverlayRef.current.scrollLeft = messageInputRef.current.scrollLeft;
  }, []);

  const resetInputLayerHeight = () => {
    const textarea = messageInputRef.current;
    const overlay = inputOverlayRef.current;

    cancelAnimationFrame(resizeRafRef.current);
    lastInputHeightRef.current = 0;

    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.overflowY = 'hidden';
      textarea.scrollTop = 0;
      textarea.scrollLeft = 0;
    }

    if (overlay) {
      overlay.style.height = 'auto';
      overlay.style.overflowY = 'hidden';
      overlay.scrollTop = 0;
      overlay.scrollLeft = 0;
    }
  };

  const syncInputLayerLayout = (textarea: HTMLTextAreaElement | null = messageInputRef.current, value?: string, shouldMaintainBottom = true) => {
    if (!textarea) return;

    const overlay = inputOverlayRef.current;
    const nextValue = value ?? textarea.value;
    const isShrinking = nextValue.length < lastInputValueLengthRef.current;

    cancelAnimationFrame(resizeRafRef.current);
    const wasAtBottom = isAtBottomRef.current;

    resizeRafRef.current = requestAnimationFrame(() => {
      if (!nextValue) {
        resetInputLayerHeight();
        lastInputValueLengthRef.current = 0;
        return;
      }

      if (isShrinking) {
        textarea.style.height = 'auto';
        if (overlay) overlay.style.height = 'auto';
      }

      const nextHeight = Math.min(textarea.scrollHeight, 120);
      const nextHeightPx = `${nextHeight}px`;
      const nextOverflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';

      const previousHeight = lastInputHeightRef.current;
      if (previousHeight !== nextHeight || textarea.style.height !== nextHeightPx) {
        textarea.style.height = nextHeightPx;
        if (overlay) overlay.style.height = nextHeightPx;
        lastInputHeightRef.current = nextHeight;

        if (shouldMaintainBottom && wasAtBottom && nextHeight > previousHeight) {
          requestAnimationFrame(() => scrollToBottom('auto', true));
        }
      } else if (overlay) {
        overlay.style.height = nextHeightPx;
      }

      textarea.style.overflowY = nextOverflowY;
      if (overlay) overlay.style.overflowY = nextOverflowY;
      lastInputValueLengthRef.current = nextValue.length;
      syncInputOverlayScroll();
    });
  };

  useLayoutEffect(() => {
    if (skipNextInputLayoutSyncRef.current) {
      skipNextInputLayoutSyncRef.current = false;
      return;
    }
    if (inputMessage) {
      syncInputLayerLayout(messageInputRef.current, inputMessage, true);
    } else {
      resetInputLayerHeight();
    }
  }, [inputMessage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    skipNextInputLayoutSyncRef.current = true;
    setInputMessage(nextValue);
    // Fire typing indicator outside of React's render cycle so it never
    // delays the state update that makes the character appear.
    handleTyping();
    syncInputLayerLayout(e.target, nextValue, true);
  };
  const replyPreviewRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    isSelectModeActive,
    selectedMessageCount: selectedMessages.length,
    isDeleteConfirmationVisible,
    isReportModalVisible,
    lightboxUrl,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    isEmojiPickerOpen: !!emojiPickerPosition,
    isFullEmojiPickerOpen: !!fullEmojiPickerPosition,
    isPlusMenuOpen,
    isSearchActive,
  });

  useEffect(() => {
    if (isSearchActive) {
      // Delay focus to 300ms to allow the CSS expansion animation to finish completely.
      // Focusing earlier on mobile triggers the OS keyboard, which forces a heavy 
      // viewport resize and freezes the animation mid-way.
      setTimeout(() => {
        const input = document.getElementById('chat-search-input');
        if (input) input.focus();
      }, 300);
    }
  }, [isSearchActive]);

  useEffect(() => {
    if (!isSearchActive) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#chat-search-container')) {
        // Bug fix: also clear the query & filter so messages aren't stuck filtered
        // when the search bar is dismissed by clicking outside (without pressing X)
        setIsSearchActive(false);
        setChatSearchQuery('');
        setActiveSearchQuery('');
      }
    };
    // Capture phase so it runs before any stopPropagation
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
  }, [isSearchActive, isMobileView]);
  // Tracks whether we currently have a guard entry in the history stack.
  // Using a ref (not window.history.state) avoids stale-state issues when
  // overlays are closed programmatically rather than via the back button.
  const overlayGuardPushed = useRef(false);

  // Update ref whenever any overlay state changes
  useEffect(() => {
    stateRef.current = {
      isSelectModeActive,
      selectedMessageCount: selectedMessages.length,
      isDeleteConfirmationVisible,
      isReportModalVisible,
      lightboxUrl,
      isUserListVisible,
      replyingTo,
      showGifPicker,
      isEmojiPickerOpen: !!emojiPickerPosition,
      isFullEmojiPickerOpen: !!fullEmojiPickerPosition,
      isPlusMenuOpen,
      isSearchActive,
    };
  }, [
    isSelectModeActive,
    selectedMessages.length,
    isDeleteConfirmationVisible,
    isReportModalVisible,
    lightboxUrl,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    emojiPickerPosition,
    fullEmojiPickerPosition,
    isPlusMenuOpen,
    isSearchActive,
  ]);

  // Push exactly ONE history guard entry when going from "nothing open" to
  // "something open".  When the popstate handler consumes the guard it resets
  // the ref, so the *next* effect run (triggered by closing one layer while
  // others remain) will push a fresh guard automatically.
  useEffect(() => {
    if (!userContext?.profile) {
      overlayGuardPushed.current = false;
      return;
    }

    const hasSelectedMessages = selectedMessages.length > 0;
    const anyOpen =
      isDeleteConfirmationVisible ||
      isReportModalVisible ||
      isSelectModeActive ||
      hasSelectedMessages ||
      !!lightboxUrl ||
      isUserListVisible ||
      !!replyingTo ||
      showGifPicker ||
      !!emojiPickerPosition ||
      !!fullEmojiPickerPosition ||
      isPlusMenuOpen;
    if (anyOpen && !overlayGuardPushed.current) {
      pushOverlayGuardHistoryEntry();
      overlayGuardPushed.current = true;
    }
    if (!anyOpen) {
      overlayGuardPushed.current = false;
    }
  }, [
    isDeleteConfirmationVisible,
    isReportModalVisible,
    isSelectModeActive,
    selectedMessages.length,
    lightboxUrl,
    isUserListVisible,
    replyingTo,
    showGifPicker,
    emojiPickerPosition,
    fullEmojiPickerPosition,
    isPlusMenuOpen,
    userContext?.profile,
  ]);

  // --- LIFECYCLE & EVENT HANDLERS ---

  // Fetch GIFs when picker opens or search term changes (debounced)
  useEffect(() => {
    if (!showGifPicker) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const doFetch = async () => {
      setIsLoadingGifs(true);
      setGifError('');
      try {
        const q = gifSearchTerm.trim();
        const url = q
          ? `${apiBase}/api/gifs/search?q=${encodeURIComponent(q)}`
          : `${apiBase}/api/gifs/trending`;
          
        const res = await fetch(url);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error || `Failed to fetch GIFs (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        
        // The backend already formats the data as [{ id, preview, url }]
        setGifResults(data || []);
      } catch (err: any) {
        if (cancelled) return;
        console.error('GIF fetch error', err);
        setGifError(err.message || 'Failed to load GIFs');
        setGifResults([]);
      } finally {
        if (!cancelled) setIsLoadingGifs(false);
      }
    };

    // debounce searches; trending loads immediately
    timer = setTimeout(doFetch, gifSearchTerm.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [showGifPicker, gifSearchTerm, gifFetchKey]);

  useEffect(() => {
    if (showGifPicker) return;
    setGifSearchTerm('');
    setGifResults([]);
    setGifError('');
    setGifFetchKey(0);
    setIsLoadingGifs(false);
  }, [showGifPicker]);

  // - Mobile Visual Viewport Tracker (Keyboard + URL bar Fix) -
  // Modern mobile browsers (especially Android Chrome) dynamically change the visual viewport
  // when the software keyboard shifts between Letters <-> Emojis or when the URL bar expands
  // or collapses. We clamp the app height to the visible viewport to prevent the footer or
  // last messages from rendering below the screen on initial login.
  useEffect(() => {
    const isTextInput = (el: Element | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      return Boolean(el.closest('textarea, input, [contenteditable="true"]'));
    };

    const applyAppHeight = (nextHeight: number | null) => {
      if (nextHeight === null) {
        document.documentElement.style.removeProperty('--app-height');
        appliedViewportHeightRef.current = 0;
        return;
      }
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      const rounded = Math.round(nextHeight);
      if (Math.abs(rounded - appliedViewportHeightRef.current) < 1) return;
      appliedViewportHeightRef.current = rounded;
      document.documentElement.style.setProperty('--app-height', `${rounded}px`);
    };

    const getVisibleViewportHeight = () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
      const vvHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const layoutHeight = window.innerHeight;
      
      if (isIOS) {
        if (layoutHeight - vvHeight > 150) {
          return Math.min(layoutHeight, vvHeight);
        }
        return null;
      }
      
      return layoutHeight;
    };

    const updateStableViewportBaseline = () => {
      stableViewportWidthRef.current = window.innerWidth;
      const newHeight = getVisibleViewportHeight();
      stableViewportHeightRef.current = newHeight !== null ? newHeight : window.innerHeight;
      applyAppHeight(newHeight);
    };

    const handleViewportResize = () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
      
      const vvHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const layoutHeight = window.innerHeight;
      const visibleHeight = isIOS ? Math.min(layoutHeight, vvHeight) : layoutHeight;
      
      const widthDelta = Math.abs(window.innerWidth - stableViewportWidthRef.current);
      if (widthDelta > 40) {
        stableViewportWidthRef.current = window.innerWidth;
      }

      const vvOffsetTop = window.visualViewport ? window.visualViewport.offsetTop : 0;

      applyAppHeight(visibleHeight);

      // FIX FOR SAFARI / MOBILE BROWSERS:
      // When the keyboard opens, Safari may apply a visual viewport offset to keep
      // the focused input visible, effectively shifting the fixed layout viewport UP.
      // We counteract this by shifting the AppContainer DOWN by exactly that offset.
      if (isIOS) {
        document.documentElement.style.setProperty('--app-offset-top', `${vvOffsetTop}px`);
      } else {
        document.documentElement.style.setProperty('--app-offset-top', `0px`);
      }

      if (window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
    };

    const handleViewportScroll = () => {
      // Continuously prevent the layout from scrolling up, and keep offset synced
      const vvOffsetTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
      document.documentElement.style.setProperty('--app-offset-top', `${vvOffsetTop}px`);

      if (window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
    };



    updateStableViewportBaseline();
    handleViewportResize();
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('scroll', handleViewportScroll);
    window.addEventListener('scroll', handleViewportScroll, { passive: false });
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', handleViewportResize);
    window.addEventListener('focus', handleViewportResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleViewportScroll);
      window.removeEventListener('scroll', handleViewportScroll);
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', handleViewportResize);
      window.removeEventListener('focus', handleViewportResize);
    };
  }, []);

  // Mobile Back Button Handler
  useEffect(() => {
    if (!userContext?.profile) return;

    const handlePopState = () => {
      // The browser just consumed (popped) our guard entry, so mark it gone.
      // If more layers remain open the guard-push *effect* will automatically
      // push a fresh guard after React re-renders with the updated state.
      overlayGuardPushed.current = false;

      const {
        isSelectModeActive,
        selectedMessageCount,
        isDeleteConfirmationVisible,
        isReportModalVisible,
        lightboxUrl,
        isUserListVisible,
        replyingTo,
        showGifPicker,
        isEmojiPickerOpen,
        isFullEmojiPickerOpen,
        isPlusMenuOpen,
      } = stateRef.current;

      // Strict hierarchy: confirm modal → full-emoji → select mode → GIF → emoji → plus menu → lightbox → sidebar → quote.
      if (isDeleteConfirmationVisible) {
        setIsDeleteConfirmationVisible(false);
      } else if (isReportModalVisible) {
        setIsReportModalVisible(false);
        setReportError('');
        setIsSubmittingReport(false);
      } else if (isFullEmojiPickerOpen) {
        setFullEmojiPickerPosition(null);
        messageIdForFullEmojiPickerRef.current = null;
      } else if (isSelectModeActive || selectedMessageCount > 0) {
        setSelectedMessages([]);
        setIsSelectModeActive(false);
      } else if (showGifPicker) {
        closeGifPicker();
      } else if (isEmojiPickerOpen) {
        closeEmojiPicker(true);
      } else if (isPlusMenuOpen) {
        setIsPlusMenuOpen(false);
      } else if (lightboxUrl) {
        setLightboxUrl(null);
      } else if (isUserListVisible) {
        setIsUserListVisible(false);
      } else if (replyingTo) {
        setReplyingTo(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeEmojiPicker, userContext?.profile]);

  // WebSocket connection with auto-reconnect on tab-resume / network-restore
  useEffect(() => {
    if (!userContext?.profile) return;

    // Set to false in the cleanup function so pending reconnect timers never
    // fire after the component unmounts or the user logs out.
    let shouldReconnect = true;

    // Defined inside the effect so the handlers always close over the
    // latest userContext.profile and the setState functions.
    const connect = () => {
      // Already open or in the middle of connecting — nothing to do.
      if (
        ws.current &&
        (ws.current.readyState === WebSocket.OPEN ||
          ws.current.readyState === WebSocket.CONNECTING)
      ) return;

      // - WebSocket URL: always use wss:// on HTTPS pages -
      // Root cause of "works on WiFi, fails on mobile data":
      //
      //  1. Mobile carrier proxies intercept unencrypted ws:// connections and
      //     either terminate or drop them.  Home WiFi routers typically pass
      //     ws:// through without interference.
      //
      //  2. All modern browsers block mixed content (ws:// from an https:// page),
      //     but desktop browsers sometimes show a warning instead of hard-blocking,
      //     while mobile browsers always hard-block.
      //
      // Fix: derive the scheme from the PAGE protocol, not from the env-var prefix.
      //  • Page on https:// → always use wss://, regardless of env-var scheme
      //  • Page on http://  → use ws:// (local dev only)
      //  • No env var       → fall back to the page's own host/protocol
      const wsUrlBase = (() => {
        const base = import.meta.env.REACT_APP_API_URL;
        if (!base) {
          const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
          return `${proto}://${window.location.host}`;
        }
        return base.replace(
          /^https?:\/\//,
          window.location.protocol === 'https:' ? 'wss://' : 'ws://'
        );
      })();

      let wsUrl = `${wsUrlBase}?userId=${userIdRef.current}`;
      if (tempToken) wsUrl += `&token=${tempToken}`;
      else if (roomId) wsUrl += `&roomId=${roomId}`;

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        // Reset the backoff delay so the next disconnect starts from 2 s again.
        reconnectDelayRef.current = 2000;
        presenceActivityRef.current = null;
        ws.current?.send(
          JSON.stringify({ type: 'user_join', ...(userContext?.profile || {}), userId: userIdRef.current, roomId })
        );
      };

      // - Auto-reconnect with exponential backoff -
      // Mobile connections drop far more often than desktop WiFi (network
      // switching, carrier proxy timeouts, screen-off power saving).  Without
      // this, a single dropped socket means no more messages until the user
      // manually refreshes — the most common symptom reported on mobile data.
      ws.current.onclose = () => {
        setIsConnected(false);
        if (isNativeFilePickerOpenRef.current) {
          isNativeFilePickerOpenRef.current = false;
        }
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        typingCooldownRef.current = false;
        presenceActivityRef.current = null;
        console.log('WebSocket disconnected — scheduling reconnect');
        if (shouldReconnect) {
          reconnectTimerRef.current = setTimeout(() => {
            // Double the wait on each consecutive failure: 2 s → 4 s → 8 s → … → 30 s max.
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
            connect();
          }, reconnectDelayRef.current);
        }
      };

      ws.current.onerror = () => {
        setIsConnected(false);
        // Force close only if it is already open to prevent console errors
        if (ws.current?.readyState === 1) {
          ws.current.close();
        }
      };

      ws.current.onmessage = async (event: MessageEvent) => {
        const messageData = JSON.parse(event.data);
        if (messageData.type === 'ping') {
          lastPingAtRef.current = Date.now();
          return;
        }
        if (messageData.type === 'username_taken') {
          // The server rejected our join because someone else already holds this username.
          // Store the error so Auth.tsx can display it, then log out back to the login screen.
          sessionStorage.setItem('authError', messageData.message || 'That username is already in use. Please choose a different one.');
          if (overlayGuardPushed.current) {
            clearOverlayGuardHistoryEntry();
            overlayGuardPushed.current = false;
          }
          userContext?.logout();
          return;
        }
        if (messageData.type === 'force_logout') {
          // Admin forced this user out — store message and log out
          sessionStorage.setItem('authError', messageData.message || 'You have been logged out by an administrator.');
          if (overlayGuardPushed.current) {
            clearOverlayGuardHistoryEntry();
            overlayGuardPushed.current = false;
          }
          userContext?.logout();
          return;
        }
        if (messageData.type === 'pinned_messages_update') {
          setPinnedMessages(messageData.data);
          // If current pinned index is out of bounds, reset it
          setCurrentPinnedIndex(prev => {
            if (messageData.data.length === 0) return 0;
            return prev >= messageData.data.length ? 0 : prev;
          });
          return;
        }
        if (messageData.type === 'history') {
          // Reset the initial-scroll flag so the new history always jumps to bottom.
          hasInitialScrolled.current = false;
          initialHistoryBottomStabilized.current = false;
          suppressInitialBottomPinRef.current = false;
          initialTopMostItemIndexRef.current = null;
          const rawHistory = Array.isArray(messageData.data) ? messageData.data : [];
          const processed = filterVisibleMessages(rawHistory.map(normalizeMessage));

          // Pre-calculate group starts to freeze DOM heights and prevent Mutation Jitter
          groupStartMessageIdsRef.current.clear();
          for (let i = 0; i < processed.length; i++) {
            const current = processed[i];
            const prev = i > 0 ? processed[i - 1] : null;
            if (!prev || prev.type === 'system_notification' || prev.userId !== current.userId) {
              groupStartMessageIdsRef.current.add(current.id);
            }
          }

          setMessages(processed);
          setNewMessagesWhileScrolledUp(0);
          messageTailSnapshotRef.current = {
            length: processed.length,
            lastId: processed.length > 0 ? processed[processed.length - 1].id : null,
          };
          setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
          const cursorFromServer = typeof messageData.oldestCreatedAt === 'string' && messageData.oldestCreatedAt
            ? messageData.oldestCreatedAt
            : null;
          const nextOldestCursor = cursorFromServer || getMessageCursor(processed[0]);
          setOldestLoadedAt(nextOldestCursor);
          oldestLoadedAtRef.current = nextOldestCursor;
          const nextHasMore = typeof messageData.hasMoreHistory === 'boolean'
            ? messageData.hasMoreHistory
            : processed.length >= INITIAL_HISTORY_BATCH_SIZE;
          setHasMoreOlderMessages(nextHasMore);
          hasMoreOlderMessagesRef.current = nextHasMore;
          // Mark history as loaded so the Virtuoso component renders
          // for the first time already at the bottom —  no visible scroll.
          setHistoryLoaded(true);
          setHistorySessionId(prev => prev + 1); // Force Virtuoso destruction on Reconnect
          transferManager.restoreSessionDownloads().catch(console.error);
          transferManager.restoreSessionUploads().then((restoredUploads) => {
            if (restoredUploads.length > 0) {
              setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const uniqueRestored = restoredUploads.filter(m => !existingIds.has(m.id));
                return [...prev, ...uniqueRestored];
              });
            }
          });
        } else if (messageData.type === 'online_users') {
          setOnlineUsers(messageData.data);
        } else if (messageData.type === 'report_submitted') {
          setIsSubmittingReport(false);
          setReportError('');
          setReportReason('');
          setReportTargetMessage(null);
          setIsReportModalVisible(false);
        } else if (messageData.type === 'report_error') {
          setIsSubmittingReport(false);
          setReportError(typeof messageData.message === 'string' ? messageData.message : 'Failed to submit report. Please try again.');
        } else if (messageData.type === 'chat_cleared') {
          // Admin cleared all messages — wipe the local list immediately.
          setMessages([]);
          setNewMessagesWhileScrolledUp(0);
          messageTailSnapshotRef.current = { length: 0, lastId: null };
          setHasMoreOlderMessages(false);
          hasMoreOlderMessagesRef.current = false;
          setOldestLoadedAt(null);
          oldestLoadedAtRef.current = null;
          setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
        } else if (messageData.type === 'chat_hidden_for_everyone') {
          // Admin hid all existing chats from frontend globally (records remain in DB).
          // Clear currently loaded history so all clients immediately reflect this state.
          setMessages([]);
          setNewMessagesWhileScrolledUp(0);
          messageTailSnapshotRef.current = { length: 0, lastId: null };
          setHasMoreOlderMessages(false);
          hasMoreOlderMessagesRef.current = false;
          setOldestLoadedAt(null);
          oldestLoadedAtRef.current = null;
          setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
        } else if (messageData.type === 'update') {
          const normalizedUpdate = normalizeMessage(messageData.data);
          setMessages(prev =>
            prev.map(m => {
              if (m.id === normalizedUpdate.id) return { ...m, ...normalizedUpdate };
              if (normalizedUpdate.isDeleted && m.replyingTo && m.replyingTo.id === normalizedUpdate.id) {
                return { ...m, replyingTo: { ...m.replyingTo, isDeleted: true } };
              }
              return m;
            })
          );
          // If the currently quoted message (reply preview in footer) was updated, reflect changes.
          setReplyingTo(prev => {
            if (prev && prev.id === normalizedUpdate.id) {
              return { ...prev, ...normalizedUpdate };
            }
            return prev;
          });
        } else if (messageData.type === 'bulk_update') {
          const updatedMessages = messageData.messages.map(normalizeMessage);
          const updatedIds = new Set(updatedMessages.map((m: any) => m.id));
          const updatedMap = new Map<string, Message>(updatedMessages.map((m: any) => [m.id, m]));
          
          setMessages(prev =>
            prev.map(m => {
              if (updatedMap.has(m.id)) return { ...m, ...(updatedMap.get(m.id) as Message) };
              if (m.replyingTo && updatedIds.has(m.replyingTo.id)) {
                const updatedTarget = updatedMap.get(m.replyingTo.id);
                if (updatedTarget && updatedTarget.isDeleted) {
                  return { ...m, replyingTo: { ...m.replyingTo, isDeleted: true } };
                }
              }
              return m;
            })
          );
          
          setReplyingTo(prev => {
            if (prev && updatedIds.has(prev.id)) {
              const updatedTarget = updatedMap.get(prev.id);
              if (updatedTarget) return { ...prev, ...updatedTarget };
            }
            return prev;
          });
          
        } else if (messageData.type === 'bulk_delete') {
          const deletedIds = new Set(messageData.messageIds);
          setMessages(prev => prev.filter(m => !deletedIds.has(m.id)));
          
          setReplyingTo(prev => {
            if (prev && deletedIds.has(prev.id)) return null;
            return prev;
          });
        } else {
          const normalized = normalizeMessage(messageData);
          const isJoinNotification =
            normalized.type === 'system_notification' &&
            /has joined the chat/i.test(normalized.text || '');
          const isIncomingMessage =
            normalized.type !== 'system_notification' &&
            normalized.userId !== userIdRef.current;
          if (isJoinNotification || isIncomingMessage) {
            void playNotificationSound(isJoinNotification ? 'join' : 'message');
          }
          setMessages(prev => {
            // Deduplicate: system_notification messages (join/leave) can arrive
            // via broadcast while a reconnect also triggers a fresh history load.
            // If a message with the same id already exists, skip it.
            if (normalized.id && prev.some(m => m.id === normalized.id)) return prev;
            // Skip messages the user has deleted for themselves.
            if (normalized.id && getDeletedForMeIds(userIdRef.current).has(normalized.id)) return prev;

            const prevMsg = prev.length > 0 ? prev[prev.length - 1] : null;
            if (!prevMsg || prevMsg.type === 'system_notification' || prevMsg.userId !== normalized.userId) {
              groupStartMessageIdsRef.current.add(normalized.id);
            }

            return [...prev, normalized];
          });
        }
      };
    };

    // Initial connection
    connect();

    // --- Auto-reconnect triggers ---

    // 1. User returns to the tab / un-minimizes the browser on mobile.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const timeHidden = Date.now() - lastHiddenTimeRef.current;

        // If the browser was only in the background for a fraction of a second
        // (e.g., swiping between recent apps, accidental swipe, or checking a notification),
        // the OS TCP stack has not frozen the socket yet. We should NOT proactively
        // destroy the perfectly healthy socket.
        if (timeHidden > 0 && timeHidden < 5000) {
          return;
        }

        // If the socket is currently mid-handshake (CONNECTING), do NOT interrupt it.
        // Closing a CONNECTING socket produces a console error
        // "WebSocket is closed before the connection is established" and forces an
        // unnecessary reconnect race. Just wait — the onopen/onclose handlers will
        // fire naturally and the watchdog will catch any real failure.
        if (ws.current !== null && ws.current.readyState === WebSocket.CONNECTING) {
          return;
        }

        // We consider the socket "alive" if ALL of the following are true:
        //   1. The readyState is OPEN (not CONNECTING / CLOSING / CLOSED)
        //   2. A ping from the server arrived within the last 25 s (same threshold
        //      as the watchdog) — meaning the server can still reach us.
        //
        // If alive, there is nothing to do; the watchdog will catch actual zombie
        // connections on its next tick. Only force-reconnect when the socket is
        // absent, already closed, or we haven't heard a ping recently (stale).
        const socketIsAlive =
          ws.current !== null &&
          ws.current.readyState === WebSocket.OPEN &&
          Date.now() - lastPingAtRef.current < 25000;

        if (socketIsAlive) {
          // Connection is healthy — nothing to do.
          return;
        }

        // When waking up from background on mobile after a substantial delay, the OS
        // often leaves the TCP socket in a "zombie" half-open state. The connection
        // appears OPEN, but downstream data is stalled, leading to a ~60s delay until
        // timeout. To guarantee instant realtime delivery, we proactively close the
        // old socket and establish a fresh one.
        if (ws.current) {
          ws.current.onclose = null; // Prevent competing reconnect timers
          ws.current.close();
          ws.current = null;
          setIsConnected(false);

          // Manual cleanup that would normally happen in onclose
          if (isNativeFilePickerOpenRef.current) isNativeFilePickerOpenRef.current = false;
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
          }
          typingCooldownRef.current = false;
          presenceActivityRef.current = null;
        }

        // Force an immediate reconnect. If the OS network radio is asleep, this
        // will fail and trigger the exponential backoff, but the user will at
        // least see their old messages instead of a broken empty screen.
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        reconnectDelayRef.current = 1000; // Start with a fast 1-second retry if radio is asleep
        connect();
      }
    };

    // 2. Device regains network connectivity (e.g. came out of airplane mode).
    const handleOnline = () => connect();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      shouldReconnect = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (ws.current) {
        const socket = ws.current;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        
        // Prevent Chrome's "WebSocket is closed before the connection is established" warning
        // which happens mostly in React Strict Mode dev environments when the component unmounts instantly.
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => socket.close();
        } else {
          socket.onopen = null;
          socket.close();
        }
        ws.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [userContext?.profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Watchdog to detect silent TCP drops ---
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        if (Date.now() - lastPingAtRef.current > 25000) {
          console.warn('Frontend Heartbeat: Dead connection detected. Closing socket to force reconnect.');
          ws.current.close();
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // General click/keydown handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Capture the target synchronously, then defer the menu-closing
      // checks to the next macrotask so that the current touch-event
      // processing (and the keyboard-dismiss animation) isn't blocked
      // by DOM reads + React setState calls on the main thread.
      const target = event.target as Node;
      setTimeout(() => {
        // If click is on the three-dots button, let handleOpenDeleteMenu toggle it.
        const targetEl = event.target as Element;
        if (!targetEl.closest('.more-action-button')) {
          if (deleteMenuRef.current && !deleteMenuRef.current.contains(target)) setActiveDeleteMenu(null);
        }
        if (gifPickerRef.current && !gifPickerRef.current.contains(target)) closeGifPicker();
        if (plusMenuRef.current && !plusMenuRef.current.contains(target) && !plusButtonRef.current?.contains(target)) setIsPlusMenuOpen(false);
        if (emojiPickerRef.current && !emojiPickerRef.current.contains(target) && !emojiButtonRef.current?.contains(target)) {
          closeEmojiPicker(false);
        }
        // Full emoji picker (reactions) is closed exclusively by its own backdrop — not here.
      }, 0);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeEmojiPicker]);

  // - WhatsApp-style auto-focus (desktop only) -
  // When the user types any printable character while nothing (or a non-input)
  // element is focused, redirect keystrokes into the message input automatically.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only printable single characters; skip modifiers, function keys, etc.
      if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
      // Already in the input – nothing to do.
      if (document.activeElement === messageInputRef.current) return;
      // Don't steal focus from other text fields (e.g. the edit textarea).
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Don't redirect when overlays or select mode are active.
      if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible || isUserListVisible) return;
      // Don't redirect on mobile – mobile keyboard requires explicit tap.
      if (isMobileView) return;
      messageInputRef.current?.focus();
      // Do NOT call e.preventDefault() so the character is typed into the input.
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSelectModeActive, lightboxUrl, isDeleteConfirmationVisible, isUserListVisible, isMobileView]);

  // Close User List if switching to mobile view, and ensure it's closed on mount
  useEffect(() => {
    if (isMobileView) {
      setIsUserListVisible(false);
    }
  }, [isMobileView]);

  // Handle hardware back button to close overlays
  useEffect(() => {
    if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible || isUserListVisible) return;

    const handleBackButton = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) { // Mouse back/forward buttons
        // Handled by popstate
      }
    };

    window.addEventListener('mouseup', handleBackButton);
    return () => window.removeEventListener('mouseup', handleBackButton);
  }, [isSelectModeActive, lightboxUrl, isDeleteConfirmationVisible, isUserListVisible, isMobileView]);

  const closeFilePreviewAndRestoreDraft = useCallback(() => {
    setShowFilePreview(false);
    setStagedFiles([]);
    setPreviewCaption('');
    setPreviewActiveIndex(0);
    setInputMessage(preMediaDraft);
    setPreMediaDraft('');
  }, [preMediaDraft]);

  const handleRequestCloseFilePreview = useCallback(() => {
    if (stagedFiles.length > 0 || previewCaption) {
      setIsDiscardConfirmationVisible(true);
    } else {
      closeFilePreviewAndRestoreDraft();
    }
  }, [stagedFiles.length, previewCaption, closeFilePreviewAndRestoreDraft]);

  // - Unquote on Escape / Close file preview -
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showFilePreview) {
          handleRequestCloseFilePreview();
        } else if (lightboxUrl) {
          setLightboxUrl(null);
        } else if (editingMessageId) {
          // Cancel edit: restore prior draft and clear editing state
          setEditingMessageId(null);
          setEditingMessageOriginalText('');
          setInputMessage(priorDraftBeforeEdit);
          setPriorDraftBeforeEdit('');
          resetInputLayerHeight();
          requestAnimationFrame(() => { messageInputRef.current?.focus(); });
        } else if (replyingTo) {
          setReplyingTo(null);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleRequestCloseFilePreview, editingMessageId, lightboxUrl, priorDraftBeforeEdit, replyingTo, showFilePreview]);

  const getChatScrollerElement = useCallback((): HTMLElement | null => {
    if (!chatContainerRef.current) return null;
    return (chatContainerRef.current.querySelector('[data-virtuoso-scroller]') as HTMLElement | null) || chatContainerRef.current;
  }, []);

  const shouldSuppressProgrammaticScroll = useCallback((): boolean => {
    return (
      isVideoFullscreenSessionRef.current ||
      quoteJumpLockRef.current ||
      performance.now() < suppressProgrammaticScrollUntilRef.current
    );
  }, []);

  const clearPendingBottomScrollTimers = useCallback(() => {
    if (pendingBottomScrollTimeoutsRef.current.length === 0) return;
    pendingBottomScrollTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    pendingBottomScrollTimeoutsRef.current = [];
  }, []);

  const scheduleProgrammaticScrollSuppression = useCallback((durationMs: number) => {
    const until = performance.now() + Math.max(0, durationMs);
    suppressProgrammaticScrollUntilRef.current = Math.max(suppressProgrammaticScrollUntilRef.current, until);
  }, []);

  const engageQuoteJumpLock = useCallback((durationMs: number) => {
    quoteJumpLockRef.current = true;
    if (quoteJumpLockTimeoutRef.current !== null) {
      window.clearTimeout(quoteJumpLockTimeoutRef.current);
      quoteJumpLockTimeoutRef.current = null;
    }
    quoteJumpLockTimeoutRef.current = window.setTimeout(() => {
      quoteJumpLockRef.current = false;
      quoteJumpLockTimeoutRef.current = null;
    }, Math.max(0, durationMs));
  }, []);

  const clearQuoteJumpSuppression = useCallback(() => {
    quoteJumpLockRef.current = false;
    if (quoteJumpLockTimeoutRef.current !== null) {
      window.clearTimeout(quoteJumpLockTimeoutRef.current);
      quoteJumpLockTimeoutRef.current = null;
    }
    suppressProgrammaticScrollUntilRef.current = 0;
  }, []);

  // - Video fullscreen exit → restore scroll position -
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) return;

      // Prevent browser focus restoration from nudging the chat viewport.
      if (document.activeElement instanceof HTMLVideoElement) {
        document.activeElement.blur();
      }

      if (!isVideoFullscreenSessionRef.current) return;
      isVideoFullscreenSessionRef.current = false;

      // Cancel any queued multi-timeout bottom-pins so fullscreen exit has a
      // single scroll source of truth.
      clearPendingBottomScrollTimers();
      scheduleProgrammaticScrollSuppression(700);

      const snapshot = fullscreenScrollSnapshotRef.current;
      fullscreenScrollSnapshotRef.current = null;
      if (!snapshot) return;

      // We use two targeted timeouts instead of a constant loop:
      // 1. 50ms: Defeats the browser's native focus-restoration scroll jump immediately.
      // 2. 500ms: Aligns perfectly after all native animations (video shrink, URL bar resize) complete.
      // This allows the native transitions to play out smoothly without JavaScript fighting them and causing jitter.
      const restoreScroll = () => {
        const scroller = getChatScrollerElement();
        if (!scroller) return;

        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        
        // If the user was anchored to the very bottom before entering fullscreen,
        // keep them anchored to the bottom (vital for mobile URL bar resizes).
        const wasAtBottom = (snapshot.bottomOffset - snapshot.clientHeight) <= 20;
          
        if (wasAtBottom) {
          scroller.scrollTop = maxTop;
        } else {
          // Directly restore the exact scrollTop we captured before entering fullscreen.
          // This avoids race conditions where scrollHeight is temporarily inflated by
          // transitioning media elements.
          const target = snapshot.scrollTop;
          const clamped = Math.max(0, Math.min(target, maxTop));
          scroller.scrollTop = clamped;
        }
      };

      setTimeout(restoreScroll, 50);
      setTimeout(restoreScroll, 500);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [clearPendingBottomScrollTimers, getChatScrollerElement, scheduleProgrammaticScrollSuppression]);

  // - Drag-and-drop file upload -
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const fileArr = Array.from(files);
        const carriedCaption = inputMessage;
        setPreMediaDraft(carriedCaption);
        
        // Compress dropped images locally
        const compressedFiles = await Promise.all(fileArr.map(compressImage));
        
        setStagedFiles(compressedFiles);
        setPreviewActiveIndex(0);
        setPreviewCaption(carriedCaption);
        if (carriedCaption) {
          setInputMessage('');
          localStorage.removeItem(getInputDraftKey(userIdRef.current));
        }
        setShowFilePreview(true);
        setStagedGif(null);
      }
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const draftKey = getInputDraftKey(userIdRef.current);
    if (!userContext?.profile) {
      setInputMessage('');
      return;
    }

    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) setInputMessage(savedDraft.slice(0, MAX_MESSAGE_LENGTH));
    } catch (_) {
      // Ignore unavailable storage.
    }
  }, [userContext?.profile]);

  useEffect(() => {
    if (!userContext?.profile) return;
    try {
      const draftKey = getInputDraftKey(userIdRef.current);
      if (inputMessage) localStorage.setItem(draftKey, inputMessage);
      else localStorage.removeItem(draftKey);
    } catch (_) {
      // Ignore unavailable storage.
    }
  }, [inputMessage, userContext?.profile]);

  useEffect(() => {
    if (!showFilePreview || stagedFiles.length === 0 || !isDesktopInteraction) return;
    requestAnimationFrame(() => {
      const input = previewCaptionInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [isDesktopInteraction, showFilePreview, stagedFiles.length]);

  useEffect(() => {
    if (!showFilePreview || stagedFiles.length === 0 || !isDesktopInteraction) return;

    const handleDesktopPreviewTyping = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const target = e.target as Element | null;
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return;


      const input = previewCaptionInputRef.current;
      if (!input) return;
      e.preventDefault();
      const start = input.selectionStart ?? previewCaption.length;
      const end = input.selectionEnd ?? start;
      const nextCaption = `${previewCaption.slice(0, start)}${e.key}${previewCaption.slice(end)}`;
      setPreviewCaption(nextCaption);
      requestAnimationFrame(() => {
        input.focus();
        const nextCaret = start + e.key.length;
        input.setSelectionRange(nextCaret, nextCaret);
      });
    };
    document.addEventListener('keydown', handleDesktopPreviewTyping, true);
    return () => document.removeEventListener('keydown', handleDesktopPreviewTyping, true);
  }, [isDesktopInteraction, previewCaption, showFilePreview, stagedFiles.length]);

  useEffect(() => {
    if (!showGifPicker || !isDesktopInteraction) return;
    requestAnimationFrame(() => {
      const input = gifSearchInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [isDesktopInteraction, showGifPicker]);

  useEffect(() => {
    if (!showGifPicker || !isDesktopInteraction) return;

    const handleDesktopGifTyping = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as Element | null;
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return;

      const input = gifSearchInputRef.current;
      if (!input) return;

      if (e.key === 'Backspace') {
        if (!gifSearchTerm) return;
        e.preventDefault();
        const nextTerm = gifSearchTerm.slice(0, -1);
        setGifSearchTerm(nextTerm);
        requestAnimationFrame(() => {
          input.focus();
          const end = nextTerm.length;
          input.setSelectionRange(end, end);
        });
        return;
      }

      if (e.key.length !== 1) return;
      e.preventDefault();
      const nextTerm = `${gifSearchTerm}${e.key}`;
      setGifSearchTerm(nextTerm);
      requestAnimationFrame(() => {
        input.focus();
        const end = nextTerm.length;
        input.setSelectionRange(end, end);
      });
    };

    document.addEventListener('keydown', handleDesktopGifTyping, true);
    return () => document.removeEventListener('keydown', handleDesktopGifTyping, true);
  }, [gifSearchTerm, isDesktopInteraction, showGifPicker]);

  // - Keyboard auto-restore when closing GIF picker -
  useEffect(() => {
    if (showGifPicker) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      typingCooldownRef.current = false;
      setPresenceActivity('gif_selecting');
      return;
    }

    if (presenceActivityRef.current === 'gif_selecting') {
      setPresenceActivity(null);
    }

    if (keyboardWasOpenBeforeGifRef.current) {
      messageInputRef.current?.focus();
      keyboardWasOpenBeforeGifRef.current = false;
    }
  }, [setPresenceActivity, showGifPicker]);

  useEffect(() => {
    if (emojiPickerPosition) return;
    if (restoreKeyboardAfterEmojiCloseRef.current) {
      restoreKeyboardAfterEmojiCloseRef.current = false;
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
        keyboardWasOpenBeforeEmojiRef.current = false;
      });
      return;
    }
    keyboardWasOpenBeforeEmojiRef.current = false;
  }, [emojiPickerPosition]);

  useLayoutEffect(() => {
    if (messages.length > 0 && !hasInitialScrolled.current) {
      hasInitialScrolled.current = true;
      const scroller = chatContainerRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
  }, [messages.length]);

  useLayoutEffect(() => {
    if (previousScrollMetricsRef.current && chatContainerRef.current) {
      const scroller = chatContainerRef.current;
      const metrics = previousScrollMetricsRef.current;
      previousScrollMetricsRef.current = null;

      const newScrollHeight = scroller.scrollHeight;
      const heightDiff = newScrollHeight - metrics.height;

      if (heightDiff > 0) {
        scroller.scrollTop = metrics.top + heightDiff;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (!historyLoaded) return;
    if (initialHistoryBottomStabilized.current) return;
    initialHistoryBottomStabilized.current = true;

    const capturedTargetIndex = messagesRef.current.length - 1;
    if (capturedTargetIndex < 0) return;

    const timer = setTimeout(() => {

      if (shouldSuppressProgrammaticScroll()) return;
      if (suppressInitialBottomPinRef.current) return;
      const safeIndex = firstItemIndexRef.current + (messagesRef.current.length - 1);
      const scroller = chatContainerRef.current; if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, 300);

    return () => clearTimeout(timer);
  }, [historyLoaded, shouldSuppressProgrammaticScroll]);


  useEffect(() => {
    const handleResize = () => setIsMobileView(checkIsMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!userContext?.profile) {
      setIsUserListVisible(false);
    }
  }, [userContext?.profile]);

  const normalizeMessage = useCallback((msg: any): Message => {
    const normalizedId = normalizeMessageId(msg?.id ?? msg?._id);
    const normalizedReplyId = normalizeMessageId(msg?.replyingTo?.id ?? msg?.replyingTo?.messageId ?? msg?.replyingTo?._id);
    const baseMsg: any = {
      ...msg,
      ...(normalizedId ? { id: normalizedId } : {}),
      ...(msg?.replyingTo && normalizedReplyId
        ? { replyingTo: { ...msg.replyingTo, id: normalizedReplyId } }
        : {}),
    };

    if (baseMsg.reactions) {
      return { ...baseMsg, reactions: filterValidReactions(baseMsg.reactions) } as Message;
    }
    return baseMsg as Message;
  }, []);

  const getMessageCursor = useCallback((msg?: Message): string | null => {
    if (!msg) return null;
    return msg.createdAt || msg.timestamp || null;
  }, []);

  const markDeletedReplyTargets = useCallback((list: Message[], deletedIds: Set<string>): Message[] => {
    if (deletedIds.size === 0) return list;
    return list.map((m) =>
      m.replyingTo && deletedIds.has(m.replyingTo.id)
        ? { ...m, replyingTo: { ...m.replyingTo, isDeleted: true } }
        : m
    );
  }, []);

  const filterVisibleMessages = useCallback((allMsgs: Message[]): Message[] => {
    const clearTs = Number(localStorage.getItem(`pulseClearTimestamp_${userIdRef.current}`) || '0');
    const deletedForMeIds = getDeletedForMeIds(userIdRef.current);
    const filtered = (clearTs > 0
      ? allMsgs.filter(m => m.type === 'system_notification' || new Date(m.timestamp).getTime() > clearTs)
      : allMsgs
    ).filter(m => !deletedForMeIds.has(m.id));
    const deletedIds = new Set(filtered.filter(m => m.isDeleted).map(m => m.id));
    return markDeletedReplyTargets(filtered, deletedIds);
  }, [markDeletedReplyTargets]);

  // Bug fix #1: Full-history search via backend API.
  // Previously the frontend only searched the locally loaded ~50 messages.
  // Now we call /api/messages/search which queries the full database, then
  // apply filterVisibleMessages to strip out any deleted-for-me messages.
  useEffect(() => {
    if (!activeSearchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setIsSearchLoading(true);
    setSearchResults(null); // clear stale results while new search is in-flight
    fetch(
      `${apiBase}/api/messages/search?q=${encodeURIComponent(activeSearchQuery.trim())}`,
      { headers: { 'x-room-id': roomId } }
    )
      .then(res => {
        if (!res.ok) throw new Error('Search failed');
        return res.json();
      })
      .then((raw: any[]) => {
        if (cancelled) return;
        const normalized = raw.map(normalizeMessage);
        // Apply filterVisibleMessages so deleted-for-me messages are excluded
        const visibleResults = filterVisibleMessages(normalized);
        setSearchResults(visibleResults);
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Message search error:', err);
          setSearchResults([]); // treat error as empty so "not found" toast shows
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearchLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeSearchQuery, apiBase, roomId, normalizeMessage, filterVisibleMessages]);

  const fetchAndPrependOlderMessages = useCallback(async (beforeCursor: string, limitOverride?: number) => {
    const before = encodeURIComponent(beforeCursor);
    const limit = limitOverride || HISTORY_PAGE_SIZE;
    const res = await fetch(`${apiBase}/api/messages?before=${before}&limit=${limit}`, {
      headers: { 'x-room-id': roomId }
    });
    if (!res.ok) throw new Error('Failed to fetch older messages');

    const payload = await res.json();
    const rawBatch: any[] = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload.messages) ? payload.messages : []);
    const hasMore = Array.isArray(payload)
      ? rawBatch.length >= limit
      : Boolean(payload.hasMore);

    if (rawBatch.length === 0) {
      setHasMoreOlderMessages(false);
      hasMoreOlderMessagesRef.current = false;
      return { prependedCount: 0, hasMore: false, nextCursor: oldestLoadedAtRef.current };
    }

    const normalizedBatch = rawBatch.map(normalizeMessage);
    const filteredBatch = filterVisibleMessages(normalizedBatch);
    const nextCursor = getMessageCursor(normalizedBatch[0]) || beforeCursor;

    for (let i = 0; i < filteredBatch.length; i++) {
      const current = filteredBatch[i];
      const prev = i > 0 ? filteredBatch[i - 1] : null;
      if (!prev || prev.type === 'system_notification' || prev.userId !== current.userId) {
        groupStartMessageIdsRef.current.add(current.id);
      }
    }

    setOldestLoadedAt(nextCursor);
    oldestLoadedAtRef.current = nextCursor;

    const existingIdsSnapshot = new Set(messagesRef.current.map((m) => m.id));
    const prependedCount = filteredBatch.reduce((count, m) => count + (existingIdsSnapshot.has(m.id) ? 0 : 1), 0);

    // - FIX: Atomic prepend —  update firstItemIndex inside the same
    // setMessages updater so Virtuoso receives the new index and new data
    // in ONE React batch. Splitting into two setState calls means Virtuoso
    // can see the old index with the new (larger) data array for one frame,
    // causing the visible anchor row to jump upward —  the primary flicker
    // root cause on first-pass upward scroll.
    const prev = messagesRef.current;
    const prevIds = new Set(prev.map((m) => m.id));
    const uniqueOlder = filteredBatch.filter((m) => !prevIds.has(m.id));

    if (uniqueOlder.length > 0) {
      const combinedDeletedIds = new Set(
        [...prev, ...uniqueOlder].filter((m) => m.isDeleted).map((m) => m.id)
      );
      const patchedOlder = markDeletedReplyTargets(uniqueOlder, combinedDeletedIds);
      const patchedPrev = markDeletedReplyTargets(prev, combinedDeletedIds);

      const actualPrependedCount = patchedOlder.length;
      if (actualPrependedCount > 0) {
        const nextIdx = firstItemIndexRef.current - actualPrependedCount;
        const nextMessages = [...patchedOlder, ...patchedPrev];

        const scroller = chatContainerRef.current;
        if (scroller) {
          previousScrollMetricsRef.current = { height: scroller.scrollHeight, top: scroller.scrollTop };
        }

        // Always update atomically via React's automatic batching.
        // flushSync was forcing synchronous layout reflow which interrupted
        // the mobile compositor's momentum scroll physics, causing jitter.
        firstItemIndexRef.current = nextIdx;
        setFirstItemIndexState(nextIdx);
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        prependScrollLockRef.current = performance.now() + 800;
        scrollLog('prepend', actualPrependedCount, 'msgs → new firstItemIndex', nextIdx);
      }
    }

    setHasMoreOlderMessages(hasMore);
    hasMoreOlderMessagesRef.current = hasMore;

    return { prependedCount, hasMore, nextCursor };
  }, [apiBase, filterVisibleMessages, getMessageCursor, markDeletedReplyTargets, normalizeMessage]);

  const loadOlderMessages = useCallback(async () => {
    if (!historyLoaded || isLoadingOlderRef.current || !hasMoreOlderMessagesRef.current || !oldestLoadedAtRef.current) return;

    // We intentionally removed the isVirtuosoScrollingRef check here.
    // Virtuoso's JS anchoring physics must be allowed to seamlessly inject and 
    // offset the scroll list DURING momentum scroll. Delaying it forces the user
    // to hit the "roof" of the DOM, causing a violent layout snap.

    // - FIX: Throttle startReached -
    // Virtuoso fires startReached on every scroll frame near the top —  up to
    // 60 calls per second. The lock prevents parallel fetches and the cooldown
    // ensures we only prepend once per 1.5 s window.
    const now = performance.now();
    if (now - lastStartReachedAtRef.current < START_REACHED_COOLDOWN_MS) return;
    lastStartReachedAtRef.current = now;

    isLoadingOlderRef.current = true;
    try {
      await fetchAndPrependOlderMessages(oldestLoadedAtRef.current);
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      isLoadingOlderRef.current = false;
    }
  }, [fetchAndPrependOlderMessages, historyLoaded]);

  const handleVirtuosoIsScrolling = useCallback((isScrolling: boolean) => {
    isVirtuosoScrollingRef.current = isScrolling;

    if (isScrolling) {
      if (pendingTopLoadTimerRef.current !== null) {
        window.clearTimeout(pendingTopLoadTimerRef.current);
        pendingTopLoadTimerRef.current = null;
      }
      return;
    }

    // (Buffering logic removed as part of the jitter fix)

    if (pendingTopLoadAfterScrollRef.current) {
      if (pendingTopLoadTimerRef.current !== null) {
        window.clearTimeout(pendingTopLoadTimerRef.current);
      }
      // Use requestIdleCallback so the deferred prepend fires during browser
      // idle time rather than at an arbitrary fixed delay.  This avoids
      // triggering the fetch while the compositor is still settling touch
      // momentum scroll, which reduces the chance of visible jitter.
      // Fallback to a 200 ms timeout on browsers without requestIdleCallback.
      const scheduleLoad = () => {
        pendingTopLoadTimerRef.current = null;
        pendingTopLoadAfterScrollRef.current = false;
        void loadOlderMessages();
      };
      if (typeof requestIdleCallback === 'function') {
        const idleHandle = requestIdleCallback(scheduleLoad, { timeout: 200 });
        // Store a cancel handle compatible with clearTimeout — wrap in setTimeout
        // that we can cancel; the idle callback will fire first in normal cases.
        pendingTopLoadTimerRef.current = window.setTimeout(() => {
          // Safety fallback — if idle callback hasn't fired in 250 ms, run now.
          cancelIdleCallback(idleHandle);
          scheduleLoad();
        }, 250);
      } else {
        pendingTopLoadTimerRef.current = window.setTimeout(scheduleLoad, 200);
      }
    }
  }, [loadOlderMessages]);

  const handleVideoFullscreenEnter = useCallback((messageId: string) => {
    const scroller = getChatScrollerElement();
    if (!scroller) return;

    const scrollTop = scroller.scrollTop;
    isVideoFullscreenSessionRef.current = true;
    fullscreenScrollSnapshotRef.current = {
      messageId,
      scrollTop,
      bottomOffset: scroller.scrollHeight - scrollTop,
      clientHeight: scroller.clientHeight,
    };

    clearPendingBottomScrollTimers();
    scheduleProgrammaticScrollSuppression(1200);
  }, [clearPendingBottomScrollTimers, getChatScrollerElement, scheduleProgrammaticScrollSuppression]);

  const resetInput = () => {
    setInputMessage('');
    setPreMediaDraft('');
    setReplyingTo(null);
    setStagedFile(null);
    // Revoke blob URLs for any files being cleared so the browser can free memory.
    stagedFiles.forEach(revokeBlobUrl);
    setStagedFiles([]);
    setStagedGif(null);
    setShowFilePreview(false);
    setPreviewCaption('');
    setPreviewActiveIndex(0);
    resetInputLayerHeight();
    // Clear frontend typing state so subsequent keystrokes trigger start_typing again
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    typingCooldownRef.current = false;
    setPresenceActivity(null);
  };

  const handleSendMessage = async () => {
    // If editing a message, save the edit instead of sending a new message
    if (editingMessageId) {
      const trimmed = inputMessage.trim();
      if (trimmed && ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'edit',
          messageId: editingMessageId,
          newText: trimmed,
          roomId
        }));
      }
      setEditingMessageId(null);
      setEditingMessageOriginalText('');
      setInputMessage(priorDraftBeforeEdit);
      setPriorDraftBeforeEdit('');
      resetInputLayerHeight();
      requestAnimationFrame(() => { messageInputRef.current?.focus(); });
      return;
    }
    // If multi-file preview is open, send from there instead
    if (showFilePreview && stagedFiles.length > 0) {
      handleSendFromPreview();
      return;
    }
    if (!stagedFile && !stagedGif && !inputMessage.trim()) return;
    if (inputMessage.length > MAX_MESSAGE_LENGTH) return; // Exceed WhatsApp-style character limit
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !userContext?.profile) return;
    if (Date.now() - lastPingAtRef.current > 25000) return; // Prevent sending on dead connection

    const tempId = Date.now().toString();
    let replyContext: ReplyContext | undefined = undefined;
    if (replyingTo) {
      const { type } = replyingTo;
      if (type === 'system_notification') {
        setReplyingTo(null);
        return;
      }

      let replyText = replyingTo.text || 'Message';
      if (!replyingTo.text) {
        if (isGiphyUrl(replyingTo.url)) {
          replyText = 'GIF';
        } else if (replyingTo.type === 'image') {
          replyText = 'Image';
        } else if (replyingTo.type === 'video') {
          replyText = 'Video';
        }
      }
      replyContext = { id: replyingTo.id, username: replyingTo.username, text: replyText, type, url: replyingTo.url, isDeleted: replyingTo.isDeleted, deletedBy: replyingTo.deletedBy };
    }

    if (stagedFile) {
      const message: Message = {
        id: tempId,
        userId: userIdRef.current,
        username: userContext?.profile?.username || '',
        type: stagedFile.type.startsWith('image/') ? 'image' : stagedFile.type.startsWith('video/') ? 'video' : 'file',
        url: URL.createObjectURL(stagedFile),
        originalName: stagedFile.name,
        size: stagedFile.size,
        text: inputMessage,
        timestamp: new Date().toISOString(),
        replyingTo: replyContext,
        isUploading: true,
      };
      setMessages(prev => [...prev, message]);
      // Ensure the view scrolls to show the newly added message
      requestAnimationFrame(() => scrollToBottom());

      transferManager.startUpload(tempId, stagedFile, roomId, resolveApiBaseUrl(), userIdRef.current, message)
        .then(uploadedFileData => {
          const finalMessage = {
            ...message,
            ...uploadedFileData,
            originalName: chooseReadableFilename(uploadedFileData.originalName, message.originalName),
            isUploading: false,
            id: uploadedFileData.id,
          };
          setMessages(prev => prev.map(m => m.id === tempId ? finalMessage : m));
          ws.current?.send(JSON.stringify(finalMessage));
        })
        .catch(error => {
          if (error.message === 'Aborted') return; // Handled by TransferManager UI
          console.error('File upload failed!', error);
          const errorText = error instanceof Error && error.message ? error.message : 'Upload failed';
          setMessages(prev => prev.map(m => m.id === tempId ? {
            ...message,
            url: '',
            isUploading: false,
            uploadError: true,
            originalName: sanitizeFilename(message.originalName || stagedFile.name, 'file'),
            text: errorText,
          } : m));
        });

      const hadReply = !!replyingTo;
      resetInput();
      // After resetInput clears the reply preview, the footer height changes.
      // A delayed staggered scroll ensures we reach the true bottom after layout stabilizes.
      if (hadReply) forceScrollToBottomAsync();

    } else if (stagedGif) {
      const gifMessage: Message = { id: Date.now().toString(), userId: userIdRef.current, username: userContext?.profile?.username || '', type: 'image', url: stagedGif.url, text: inputMessage, timestamp: new Date().toISOString(), replyingTo: replyContext };
      setMessages(prev => [...prev, gifMessage]);
      requestAnimationFrame(() => scrollToBottom());
      ws.current?.send(JSON.stringify({ ...gifMessage, roomId }));
      const hadReply = !!replyingTo;
      resetInput();
      // After resetInput clears the reply preview, the footer height changes.
      // A delayed staggered scroll ensures we reach the true bottom after layout stabilizes.
      if (hadReply) forceScrollToBottomAsync();
    } else {
      const textMessage: Message = { id: Date.now().toString(), userId: userIdRef.current, username: userContext?.profile?.username || '', type: 'text', text: inputMessage, timestamp: new Date().toISOString(), replyingTo: replyContext };
      setMessages(prev => [...prev, textMessage]);
      requestAnimationFrame(() => scrollToBottom());
      ws.current?.send(JSON.stringify({ ...textMessage, roomId }));
      const hadReply = !!replyingTo;
      resetInput();
      // After resetInput clears the reply preview, the footer height changes.
      // A delayed staggered scroll ensures we reach the true bottom after layout stabilizes.
      if (hadReply) forceScrollToBottomAsync();
    }
  };

  const handleTyping = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    // Skip if the WebSocket send-buffer is backed up (slow / congested network).
    // 4 KB is a safe threshold – typing indicators are tiny but we don't want
    // to pile onto an already-struggling connection.
    if (ws.current.bufferedAmount > 4096) return;

    // Throttle: only send start_typing once per cooldown window (3 s).
    if (!typingCooldownRef.current || presenceActivityRef.current !== 'typing') {
      typingCooldownRef.current = true;
      setPresenceActivity('typing');
    }

    // Reset the stop-typing timer on every keystroke (debounce).
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setPresenceActivity(null);
      typingTimeoutRef.current = null;
      typingCooldownRef.current = false;
    }, 3000);
  }, [setPresenceActivity]);

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat? All messages will be hidden for you on this device.')) {
      localStorage.setItem(`pulseClearTimestamp_${userIdRef.current}`, Date.now().toString());
      setMessages([]);
      setHasMoreOlderMessages(false);
      setOldestLoadedAt(null);
      setFirstItemIndex(INITIAL_FIRST_ITEM_INDEX);
    }
  };

  const handleSetReply = useCallback((message: Message) => {
    if (message.type === 'system_notification') return;
    setReplyingTo(message);
    // Focus the input so the keyboard opens automatically on touch devices.
    // Use rAF so the reply-preview has time to render and shift the layout first.
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReact = useCallback((messageId: string, emoji: string) => {
    const canonicalEmoji = normalizeReactionEmoji(emoji);
    if (!canonicalEmoji || !ws.current || ws.current.readyState !== WebSocket.OPEN || !userContext?.profile || !messageId) return;
    const userId = userIdRef.current;
    const username = userContext?.profile?.username || '';

    // - Optimistic local update -
    // Apply the reaction change immediately in local state so the UI
    // feels instant. The server will broadcast the authoritative state
    // shortly after, which will reconcile any difference.
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions: Record<string, { userId: string; username: string }[]> = filterValidReactions(m.reactions);
      // Remove any existing reaction by this user
      let previousEmoji: string | null = null;
      for (const [e, users] of Object.entries(reactions)) {
        if (Array.isArray(users)) {
          const idx = users.findIndex((r: any) => r.userId === userId);
          if (idx > -1) {
            previousEmoji = e;
            users.splice(idx, 1);
            if (users.length === 0) delete reactions[e];
            break;
          }
        }
      }
      // If not toggling off the same emoji, add the new one
      if (previousEmoji !== canonicalEmoji) {
        if (!Array.isArray(reactions[canonicalEmoji])) reactions[canonicalEmoji] = [];
        reactions[canonicalEmoji].push({ userId, username });
      }
      return { ...m, reactions };
    }));

    // Send to server
    try {
      ws.current.send(JSON.stringify({ type: 'react', messageId, userId, emoji: canonicalEmoji, roomId }));
    } catch (e) {
      console.error('Failed to send reaction:', e);
    }
    setReactionPickerData(null);
  }, [userContext?.profile]);

  const deleteForMe = useCallback((messageId: string) => {
    addDeletedForMeIds(userIdRef.current, [messageId]);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  const deleteForEveryone = useCallback((messageId: string) => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({ type: 'delete_for_everyone', messageId, roomId }));
  }, []);

  const handleOpenReactionPicker = useCallback((messageId: string, rect: DOMRect, sender: 'me' | 'other') => {
    setReactionPickerData(prev => {
      if (prev?.messageId === messageId) return null;
      return { messageId, rect, sender };
    });
  }, []);

  // Removed background media upload in favor of TransferManager handling it upon send.
  const reactionPickerRef = useRef<HTMLDivElement>(null!);
  // Close reaction picker when clicking/tapping outside
  useEffect(() => {
    if (!reactionPickerData) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Element;
      // If the tap/click is on the button that opened the picker, let the
      // button's own onClick toggle it — otherwise we'd close-then-reopen.
      if (target.closest('.react-action-button')) return;
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(target)) {
        setReactionPickerData(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [reactionPickerData]);

  // When a reply preview appears, scroll the chat so the quoted message
  // is fully visible just above the preview — same as WhatsApp behaviour.
  useEffect(() => {
    if (!replyingTo) return;
    // Double rAF: first frame commits the DOM, second ensures layout is complete
    // (footer has grown to include the reply preview, container has shrunk).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const msgElement = findMessageElement(replyingTo.id);
        const container = chatContainerRef.current?.querySelector('[data-virtuoso-scroller]') as HTMLElement || chatContainerRef.current;
        if (!msgElement || !container) return;
        const containerRect = container.getBoundingClientRect();
        const msgRect = msgElement.getBoundingClientRect();
        const margin = 8;
        if (msgRect.bottom > containerRect.bottom - margin) {
          container.scrollBy({ top: msgRect.bottom - containerRect.bottom + margin, behavior: 'smooth' });
        }
      });
    });
  }, [replyingTo]);

  // When the message-actions menu opens, scroll the chat so the bottom of
  // the menu sits inside the visible area (above the footer).
  const handleOpenDeleteMenu = useCallback((messageId: string) => {
    // Toggle off if the same menu is already open.
    setActiveDeleteMenu(prev => prev === messageId ? null : messageId);
    setTimeout(() => {
      // If the menu just closed, deleteMenuRef.current will be null — no-op.
      if (!deleteMenuRef.current || !chatContainerRef.current) return;
      const container = chatContainerRef.current.querySelector('[data-virtuoso-scroller]') as HTMLElement || chatContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const menuRect = deleteMenuRef.current.getBoundingClientRect();
      // Scroll exactly enough so the menu bottom is 12 px above the container edge.
      const overflow = menuRect.bottom - containerRect.bottom + 12;
      if (overflow > 0) {
        container.scrollBy({ top: overflow, behavior: 'smooth' });
      }
    }, 50); // 50 ms gives React + browser time to fully render the menu
  }, []);

  // --- OVERLAY & HISTORY MANAGEMENT ---

  useEffect(() => {
    lightboxTransformRef.current = lightboxTransform;
  }, [lightboxTransform]);

  const clampLightboxOffset = useCallback((scale: number, x: number, y: number) => {
    const frame = lightboxFrameRef.current;
    const natural = lightboxNaturalSize;
    if (!frame || !natural || natural.width <= 0 || natural.height <= 0) {
      return { x, y };
    }

    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    if (!frameWidth || !frameHeight) {
      return { x, y };
    }

    const fitScale = Math.min(frameWidth / natural.width, frameHeight / natural.height);
    if (!Number.isFinite(fitScale) || fitScale <= 0) {
      return { x, y };
    }

    const baseWidth = natural.width * fitScale;
    const baseHeight = natural.height * fitScale;
    const scaledWidth = baseWidth * scale;
    const scaledHeight = baseHeight * scale;
    const maxX = Math.max((scaledWidth - baseWidth) / 2, 0);
    const maxY = Math.max((scaledHeight - baseHeight) / 2, 0);

    return {
      x: Math.min(Math.max(x, -maxX), maxX),
      y: Math.min(Math.max(y, -maxY), maxY),
    };
  }, [lightboxNaturalSize]);

  const getLightboxRelativePoint = useCallback((clientX: number, clientY: number) => {
    const frame = lightboxFrameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  }, []);

  const applyLightboxScale = useCallback((rawScale: number, focalPoint?: { x: number; y: number }) => {
    setLightboxTransform((prev) => {
      const nextScale = Math.min(PHOTO_LIGHTBOX_MAX_SCALE, Math.max(PHOTO_LIGHTBOX_MIN_SCALE, rawScale));
      if (nextScale <= PHOTO_LIGHTBOX_MIN_SCALE + 0.001) {
        return { scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 };
      }

      let nextX = prev.x;
      let nextY = prev.y;
      if (focalPoint) {
        const baseScale = Math.max(prev.scale, PHOTO_LIGHTBOX_MIN_SCALE);
        const focalImageX = (focalPoint.x - prev.x) / baseScale;
        const focalImageY = (focalPoint.y - prev.y) / baseScale;
        nextX = focalPoint.x - focalImageX * nextScale;
        nextY = focalPoint.y - focalImageY * nextScale;
      }

      const bounded = clampLightboxOffset(nextScale, nextX, nextY);
      return { scale: nextScale, x: bounded.x, y: bounded.y };
    });
  }, [clampLightboxOffset]);

  const beginLightboxPinch = useCallback(() => {
    const points = Array.from(lightboxPointersRef.current.values());
    if (points.length < 2) return;

    const [first, second] = points;
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    if (distance <= 0) return;

    const midpointX = (first.x + second.x) / 2;
    const midpointY = (first.y + second.y) / 2;
    const focal = getLightboxRelativePoint(midpointX, midpointY);
    if (!focal) return;

    const current = lightboxTransformRef.current;
    lightboxPinchRef.current = {
      startDistance: distance,
      startScale: current.scale,
      focalImageX: (focal.x - current.x) / Math.max(current.scale, PHOTO_LIGHTBOX_MIN_SCALE),
      focalImageY: (focal.y - current.y) / Math.max(current.scale, PHOTO_LIGHTBOX_MIN_SCALE),
    };
    lightboxDragRef.current = null;
  }, [getLightboxRelativePoint]);

  const finalizeLightboxGesture = useCallback((pointerId: number) => {
    const frame = lightboxFrameRef.current;
    if (frame?.hasPointerCapture(pointerId)) {
      frame.releasePointerCapture(pointerId);
    }

    lightboxPointersRef.current.delete(pointerId);

    if (lightboxPointersRef.current.size >= 2) {
      beginLightboxPinch();
      return;
    }

    lightboxPinchRef.current = null;

    if (lightboxPointersRef.current.size === 1 && lightboxTransformRef.current.scale > PHOTO_LIGHTBOX_MIN_SCALE) {
      const [remainingPointerId, point] = Array.from(lightboxPointersRef.current.entries())[0];
      lightboxDragRef.current = {
        pointerId: remainingPointerId,
        startX: point.x,
        startY: point.y,
        startOffsetX: lightboxTransformRef.current.x,
        startOffsetY: lightboxTransformRef.current.y,
      };
      return;
    }

    lightboxDragRef.current = null;
    if (lightboxImageRef.current) {
      lightboxImageRef.current.style.transition = '';
    }
    setIsLightboxInteracting(false);
  }, [beginLightboxPinch]);

  const handleLightboxPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.stopPropagation();

    // Check for double tap/click (only if it's a single pointer)
    const isMultiTouch = lightboxPointersRef.current.size > 0;
    const now = Date.now();
    const isDoubleTap = !isMultiTouch && (now - lastLightboxTapRef.current < 350);
    lastLightboxTapRef.current = now;

    if (isDoubleTap) {
      // Toggle zoom
      if (lightboxTransformRef.current.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001) {
        setLightboxTransform({ scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 });
      } else {
        // Zoom in to 2.5x where the user clicked
        const focal = getLightboxRelativePoint(e.clientX, e.clientY);
        if (focal) {
          applyLightboxScale(PHOTO_LIGHTBOX_MIN_SCALE * 2.5, focal);
        } else {
          applyLightboxScale(PHOTO_LIGHTBOX_MIN_SCALE * 2.5);
        }
      }
      return;
    }

    const current = lightboxTransformRef.current;
    const shouldTrackPointer = e.pointerType !== 'mouse' || current.scale > PHOTO_LIGHTBOX_MIN_SCALE;
    if (!shouldTrackPointer) return;

    lightboxPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lightboxFrameRef.current?.setPointerCapture(e.pointerId);
    if (lightboxImageRef.current) {
      lightboxImageRef.current.style.transition = 'none';
    }
    setIsLightboxInteracting(true);

    if (lightboxPointersRef.current.size >= 2) {
      beginLightboxPinch();
      return;
    }

    if (current.scale > PHOTO_LIGHTBOX_MIN_SCALE) {
      lightboxDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startOffsetX: current.x,
        startOffsetY: current.y,
      };
    }
  }, [beginLightboxPinch]);

  const handleLightboxPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!lightboxPointersRef.current.has(e.pointerId)) return;

    e.stopPropagation();
    lightboxPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (lightboxPointersRef.current.size >= 2) {
      if (!lightboxPinchRef.current) {
        beginLightboxPinch();
      }

      const pinch = lightboxPinchRef.current;
      if (!pinch) return;

      const points = Array.from(lightboxPointersRef.current.values());
      const [first, second] = points;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (distance <= 0) return;

      const midpointX = (first.x + second.x) / 2;
      const midpointY = (first.y + second.y) / 2;
      const focal = getLightboxRelativePoint(midpointX, midpointY);
      if (!focal) return;

      const scaled = pinch.startScale * (distance / pinch.startDistance);
      const nextScale = Math.min(PHOTO_LIGHTBOX_MAX_SCALE, Math.max(PHOTO_LIGHTBOX_MIN_SCALE, scaled));

      if (nextScale <= PHOTO_LIGHTBOX_MIN_SCALE + 0.001) {
        lightboxTransformRef.current = { scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 };
        if (lightboxImageRef.current) {
          lightboxImageRef.current.style.transform = `translate3d(0px, 0px, 0) scale(${PHOTO_LIGHTBOX_MIN_SCALE})`;
        }
        return;
      }

      const nextX = focal.x - pinch.focalImageX * nextScale;
      const nextY = focal.y - pinch.focalImageY * nextScale;
      const bounded = clampLightboxOffset(nextScale, nextX, nextY);
      const nextTransform = { scale: nextScale, x: bounded.x, y: bounded.y };
      lightboxTransformRef.current = nextTransform;
      if (lightboxImageRef.current) {
        lightboxImageRef.current.style.transform = `translate3d(${bounded.x}px, ${bounded.y}px, 0) scale(${nextScale})`;
      }
      return;
    }

    const drag = lightboxDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const currentScale = lightboxTransformRef.current.scale;
    if (currentScale <= PHOTO_LIGHTBOX_MIN_SCALE) return;

    const nextX = drag.startOffsetX + (e.clientX - drag.startX);
    const nextY = drag.startOffsetY + (e.clientY - drag.startY);
    const bounded = clampLightboxOffset(currentScale, nextX, nextY);
    const nextTransform = { scale: currentScale, x: bounded.x, y: bounded.y };
    lightboxTransformRef.current = nextTransform;
    if (lightboxImageRef.current) {
      lightboxImageRef.current.style.transform = `translate3d(${bounded.x}px, ${bounded.y}px, 0) scale(${currentScale})`;
    }
  }, [beginLightboxPinch, clampLightboxOffset, getLightboxRelativePoint]);

  const handleLightboxPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    finalizeLightboxGesture(e.pointerId);
    setLightboxTransform(lightboxTransformRef.current);
  }, [finalizeLightboxGesture]);

  const handleLightboxPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    finalizeLightboxGesture(e.pointerId);
    setLightboxTransform(lightboxTransformRef.current);
  }, [finalizeLightboxGesture]);

  const handleLightboxWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const focal = getLightboxRelativePoint(e.clientX, e.clientY);
    if (!focal) return;

    e.preventDefault();
    e.stopPropagation();

    const currentScale = lightboxTransformRef.current.scale;
    const factor = Math.exp(-e.deltaY * PHOTO_LIGHTBOX_WHEEL_SENSITIVITY);
    applyLightboxScale(currentScale * factor, focal);
  }, [applyLightboxScale, getLightboxRelativePoint]);

  const handleLightboxZoomIn = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    applyLightboxScale(lightboxTransformRef.current.scale + PHOTO_LIGHTBOX_STEP);
  }, [applyLightboxScale]);

  const handleLightboxZoomOut = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    applyLightboxScale(lightboxTransformRef.current.scale - PHOTO_LIGHTBOX_STEP);
  }, [applyLightboxScale]);

  const handleLightboxImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const nextWidth = e.currentTarget.naturalWidth;
    const nextHeight = e.currentTarget.naturalHeight;
    if (nextWidth > 0 && nextHeight > 0) {
      setLightboxNaturalSize({ width: nextWidth, height: nextHeight });
    }
  }, []);

  useEffect(() => {
    if (!lightboxUrl || !lightboxNaturalSize) return;

    const current = lightboxTransformRef.current;
    const bounded = clampLightboxOffset(current.scale, current.x, current.y);
    if (bounded.x !== current.x || bounded.y !== current.y) {
      setLightboxTransform({ scale: current.scale, x: bounded.x, y: bounded.y });
    }
  }, [clampLightboxOffset, lightboxNaturalSize, lightboxUrl]);

  useEffect(() => {
    if (lightboxUrl) return;

    lightboxPointersRef.current.clear();
    lightboxDragRef.current = null;
    lightboxPinchRef.current = null;
    setIsLightboxInteracting(false);
    setLightboxNaturalSize((prev) => (prev ? null : prev));
    setLightboxTransform((prev) => (
      prev.scale === PHOTO_LIGHTBOX_MIN_SCALE && prev.x === 0 && prev.y === 0
        ? prev
        : { scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 }
    ));
  }, [lightboxUrl]);

  useEffect(() => {
    if (!lightboxUrl) return;

    const handleResize = () => {
      const current = lightboxTransformRef.current;
      const bounded = clampLightboxOffset(current.scale, current.x, current.y);
      if (bounded.x !== current.x || bounded.y !== current.y) {
        setLightboxTransform({ scale: current.scale, x: bounded.x, y: bounded.y });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampLightboxOffset, lightboxUrl]);

  const openLightbox = useCallback((url: string) => {
    lightboxPointersRef.current.clear();
    lightboxDragRef.current = null;
    lightboxPinchRef.current = null;
    setLightboxNaturalSize(null);
    setIsLightboxInteracting(false);
    setLightboxTransform({ scale: PHOTO_LIGHTBOX_MIN_SCALE, x: 0, y: 0 });
    setLightboxUrl(url);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxUrl(null);
  }, []);

  const handleInitiateDelete = () => {
    const selectedMessageObjects = messages.filter(msg => selectedMessages.includes(msg.id));
    const allMessagesAreMine = selectedMessageObjects.every(msg => msg.userId === userIdRef.current);

    if (!allMessagesAreMine) {
      setCanDeleteForEveryone(false);
    } else {
      const timeLimit = 15 * 60 * 1000;
      const now = new Date().getTime();
      const allMessagesAreRecent = selectedMessageObjects.every(msg => (now - new Date(msg.timestamp).getTime()) < timeLimit);
      setCanDeleteForEveryone(allMessagesAreRecent);
    }
    setIsDeleteConfirmationVisible(true);
  };

  const handleToggleSelectMessage = useCallback((messageId: string) => {
    document.body.classList.remove('hide-mobile-picker');
    setSelectedMessages(prevSelected => {
      const newSelected = prevSelected.includes(messageId)
        ? prevSelected.filter(id => id !== messageId)
        : [...prevSelected, messageId];

      if (newSelected.length === 0) {
        setIsSelectModeActive(false);
        document.body.classList.remove('hide-mobile-picker');
      } else if (prevSelected.length === 0) {
        setIsSelectModeActive(true);
        if (!overlayGuardPushed.current) {
          pushOverlayGuardHistoryEntry();
          overlayGuardPushed.current = true;
        }
      }

      return newSelected;
    });
  }, []);

  const handleCancelSelectMode = useCallback(() => {
    document.body.classList.remove('hide-mobile-picker');
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  }, []);

  // Re-anchor scroll to bottom when select mode deactivates on mobile.
  // The select-mode footer swaps with the input footer, changing the chat
  // area height. Without re-anchoring, a gap appears at the bottom.
  const prevSelectModeRef = useRef(false);
  useEffect(() => {
    if (prevSelectModeRef.current && !isSelectModeActive) {
      requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          const scroller = chatContainerRef.current;
          if (scroller) scroller.scrollTop = scroller.scrollHeight;
        }
      });
    }
    prevSelectModeRef.current = isSelectModeActive;
  }, [isSelectModeActive, messages.length]);

  const handleBulkDeleteForMe = () => {
    addDeletedForMeIds(userIdRef.current, selectedMessages);
    setMessages(prev => prev.filter(m => !selectedMessages.includes(m.id)));
    // Replace the guard history entry in-place rather than calling back().
    // history.back() fires a popstate event that React Router v6 intercepts
    // and treats as a route navigation — on desktop (mouse-click path through
    // the three-dots portal) this causes React Router to land on a 404.
    // replaceState() silently overwrites the guard entry with no popstate,
    // so React Router never sees a navigation and the chat stays mounted.
    if (overlayGuardPushed.current) {
      clearOverlayGuardHistoryEntry();
      overlayGuardPushed.current = false;
    }
    setIsDeleteConfirmationVisible(false);
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  };

  const handleBulkDeleteForEveryone = () => {
    selectedMessages.forEach(id => {
      if (ws.current) {
        ws.current.send(JSON.stringify({ type: 'delete_for_everyone', messageId: id, roomId }));
      }
    });
    // Same fix as handleBulkDeleteForMe — use replaceState instead of back()
    // to avoid the popstate→React Router→404 issue on desktop mouse-click path.
    if (overlayGuardPushed.current) {
      clearOverlayGuardHistoryEntry();
      overlayGuardPushed.current = false;
    }
    setIsDeleteConfirmationVisible(false);
    setIsSelectModeActive(false);
    setSelectedMessages([]);
  };

  const handleCopy = useCallback(async (message: Message) => {
    try {
      if (message.type === 'image' && message.url) {
        // Copy the actual image to the clipboard.
        // The ClipboardItem constructor accepts a *Promise* for the blob value,
        // so clipboard.write() itself stays synchronous within the user-gesture
        // frame (critical for iOS/Android) while the fetch happens in the background.
        const url = sanitizeMediaUrl(message.url);
        if (url && navigator.clipboard.write) {
          const blobPromise = fetch(url)
            .then(res => res.blob())
            .then(blob => {
              // Clipboard API requires image/png on most browsers.
              // If the source is already PNG, use it directly.
              if (blob.type === 'image/png') return blob;
              // Otherwise convert via an offscreen canvas.
              return new Promise<Blob>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.naturalWidth;
                  canvas.height = img.naturalHeight;
                  canvas.getContext('2d')!.drawImage(img, 0, 0);
                  canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
                  URL.revokeObjectURL(img.src);
                };
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = URL.createObjectURL(blob);
              });
            });
          const item = new ClipboardItem({ 'image/png': blobPromise });
          await navigator.clipboard.write([item]);
          return;
        }
      }
      // Fallback: copy text content (for text messages, or if image copy isn't supported).
      const textToCopy = message.text || message.url || '';
      if (textToCopy) {
        await navigator.clipboard.writeText(textToCopy);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
      // Last-resort fallback: try copying as text.
      try {
        const fallbackText = message.text || message.url || '';
        if (fallbackText) await navigator.clipboard.writeText(fallbackText);
      } catch { /* silently fail */ }
    }
  }, []);

  const handleStartEdit = useCallback((message: Message) => {
    const draft = inputMessage;
    setPriorDraftBeforeEdit(draft);
    setEditingMessageOriginalText(message.text || '');
    setEditingMessageId(message.id);
    setInputMessage(message.text || '');
    setActiveDeleteMenu(null);
    // Focus the main composer and move cursor to end
    requestAnimationFrame(() => {
      const ta = messageInputRef.current;
      if (ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
        syncInputLayerLayout(ta, message.text || '', true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMessage]);

  const handleOpenReport = useCallback((message: Message) => {
    if (!message || message.userId === userIdRef.current || message.isDeleted || message.type === 'system_notification') {
      return;
    }
    setActiveDeleteMenu(null);
    setReportTargetMessage(message);
    setReportReason('');
    setReportError('');
    setIsSubmittingReport(false);
    setIsReportModalVisible(true);
  }, []);

  const handleCloseReportModal = useCallback(() => {
    setIsReportModalVisible(false);
    setIsSubmittingReport(false);
    setReportError('');
    setReportReason('');
    setReportTargetMessage(null);
  }, []);

  const handleSubmitReport = useCallback(() => {
    if (!reportTargetMessage || !ws.current || ws.current.readyState !== WebSocket.OPEN) {
      setReportError('Unable to submit report right now. Please try again.');
      return;
    }

    const normalizedReason = reportReason.replace(/\s+/g, ' ').trim();
    if (normalizedReason.length < MIN_REPORT_REASON_LENGTH) {
      setReportError(`Please enter at least ${MIN_REPORT_REASON_LENGTH} characters.`);
      return;
    }

    if (normalizedReason.length > MAX_REPORT_REASON_LENGTH) {
      setReportError(`Please keep the reason under ${MAX_REPORT_REASON_LENGTH} characters.`);
      return;
    }

    setIsSubmittingReport(true);
    setReportError('');

    ws.current.send(JSON.stringify({
      type: 'report_user',
      reportedUserId: reportTargetMessage.userId,
      reportedUsername: reportTargetMessage.username,
      messageId: reportTargetMessage.id,
      messageType: reportTargetMessage.type,
      reason: normalizedReason,
      roomId
    }));
  }, [reportReason, reportTargetMessage]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingMessageOriginalText('');
    setInputMessage(priorDraftBeforeEdit);
    setPriorDraftBeforeEdit('');
    resetInputLayerHeight();
    requestAnimationFrame(() => { messageInputRef.current?.focus(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorDraftBeforeEdit]);

  // Ref to track the last emitted atBottom state to avoid redundant updates
  const lastAtBottomStateRef = useRef(true);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    if (quoteJumpLockRef.current) {
      // During quote navigation we force a non-bottom state so followOutput
      // cannot pin back to the latest message.
      isAtBottomRef.current = false;
      if (lastAtBottomStateRef.current !== false) {
        lastAtBottomStateRef.current = false;
        setIsScrollToBottomVisible(true);
      }
      return;
    }

    isAtBottomRef.current = atBottom;

    // Only update visibility during user-initiated scroll, not programmatic scroll.
    // This prevents state-update cascades that cause render flicker during quote-jumps.
    // Also skip the state update while a prepend is in-flight — re-rendering the
    // Chat component mid-prepend can cause Virtuoso to recalculate item positions,
    // amplifying the scroll-anchor correction into visible flicker on touch devices.
    const isInProgrammaticScroll = performance.now() < suppressProgrammaticScrollUntilRef.current;
    const isPrependInFlight = isLoadingOlderRef.current;
    if (!isInProgrammaticScroll && !isPrependInFlight && lastAtBottomStateRef.current !== atBottom) {
      lastAtBottomStateRef.current = atBottom;
      setIsScrollToBottomVisible(!atBottom);
    }

    if (!atBottom) {
      // After first history render, user scroll-up should immediately cancel
      // any pending auto-pin-to-bottom stabilization timers.
      suppressInitialBottomPinRef.current = true;
    }
    if (atBottom) {
      setNewMessagesWhileScrolledUp(0);
      quoteJumpReturnStackRef.current = [];
    }
  }, []);

  const handleRequestMediaLoad = useCallback((messageId: string, mediaUrl?: string) => {
    if (!messageId || !mediaUrl) return;
    if (mediaLoadInFlightRef.current.has(messageId)) {
      mediaLoadAbortControllersRef.current.get(messageId)?.abort();
      mediaLoadAbortControllersRef.current.delete(messageId);
      mediaLoadInFlightRef.current.delete(messageId);
      setMediaLoadProgressById((prev) => {
        const { [messageId]: _discard, ...rest } = prev;
        return rest;
      });
      return;
    }

    const safeUrl = sanitizeMediaUrl(mediaUrl);
    if (!safeUrl) {
      setLoadedMediaMessageIds((prev) => {
        if (prev.includes(messageId)) return prev;
        const next = [...prev, messageId];
        return next.length > MAX_LOADED_MEDIA_TRACKING
          ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
          : next;
      });
      return;
    }

    const abortController = new AbortController();
    mediaLoadAbortControllersRef.current.set(messageId, abortController);
    mediaLoadInFlightRef.current.add(messageId);
    setMediaLoadProgressById((prev) => ({ ...prev, [messageId]: 0.02 }));

    void (async () => {
      try {
        const cachedBlob = await getCachedMediaBlob(userIdRef.current, messageId, safeUrl);
        if (abortController.signal.aborted) return;

        if (cachedBlob && cachedBlob.size > 0) {
          const objectUrl = URL.createObjectURL(cachedBlob);
          const previousBlobUrl = mediaBlobUrlMapRef.current.get(messageId);
          if (previousBlobUrl) URL.revokeObjectURL(previousBlobUrl);
          mediaBlobUrlMapRef.current.set(messageId, objectUrl);
          setLoadedMediaSrcById((prev) => ({ ...prev, [messageId]: objectUrl }));

          setLoadedMediaMessageIds((prev) => {
            if (prev.includes(messageId)) return prev;
            const next = [...prev, messageId];
            return next.length > MAX_LOADED_MEDIA_TRACKING
              ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
              : next;
          });
          return;
        }

        const blob = await fetchBlobWithProgress(safeUrl, (progress) => {
          setMediaLoadProgressById((prev) => {
            if (!(messageId in prev)) return prev;
            return { ...prev, [messageId]: Math.max(0.02, Math.min(1, progress)) };
          });
        }, abortController.signal);

        if (abortController.signal.aborted) return;

        const objectUrl = URL.createObjectURL(blob);
        const previousBlobUrl = mediaBlobUrlMapRef.current.get(messageId);
        if (previousBlobUrl) URL.revokeObjectURL(previousBlobUrl);
        mediaBlobUrlMapRef.current.set(messageId, objectUrl);
        setLoadedMediaSrcById((prev) => ({ ...prev, [messageId]: objectUrl }));

        void setCachedMediaBlob(userIdRef.current, messageId, safeUrl, blob);

        setLoadedMediaMessageIds((prev) => {
          if (prev.includes(messageId)) return prev;
          const next = [...prev, messageId];
          return next.length > MAX_LOADED_MEDIA_TRACKING
            ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
            : next;
        });
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        // Fallback: if prefetch progress fails (e.g. CORS/content-length mismatch),
        // still allow direct media rendering so the user isn't stuck on the load gate.
        setLoadedMediaMessageIds((prev) => {
          if (prev.includes(messageId)) return prev;
          const next = [...prev, messageId];
          return next.length > MAX_LOADED_MEDIA_TRACKING
            ? next.slice(next.length - MAX_LOADED_MEDIA_TRACKING)
            : next;
        });
      } finally {
        mediaLoadInFlightRef.current.delete(messageId);
        setMediaLoadProgressById((prev) => {
          if (!(messageId in prev)) return prev;
          const { [messageId]: _discard, ...rest } = prev;
          return rest;
        });
      }
    })();
  }, []);

  const handleRequestDownload = useCallback((messageId: string, mediaUrl: string, filename: string) => {
    if (!messageId || !mediaUrl) return;
    const transfer = transferManager.getTransfer(messageId);
    if (transfer?.type === 'download' && transfer?.state === 'downloading') {
      transferManager.pauseTransfer(messageId);
    } else if (transfer?.type === 'download' && transfer?.state === 'paused') {
      transferManager.resumeDownload(messageId, filename);
    } else {
      void transferManager.startDownload(messageId, mediaUrl, filename);
    }
  }, []);

  // Clicking on empty space in the chat area focuses the input (WhatsApp-style).
  // Only fires when the click target IS the scroll container itself (empty space),
  // not when it bubbles up from a message, button, or any other child element.
  const handleChatAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== chatContainerRef.current) return;
    if (isSelectModeActive || !!lightboxUrl || isDeleteConfirmationVisible) return;
    // On mobile, don't auto-focus the input when tapping empty space — 
    // the user may be intentionally dismissing the keyboard, and fighting
    // the blur causes a visible stutter in the keyboard animation.
    if (isMobileView) return;
    messageInputRef.current?.focus();
  }, [isSelectModeActive, lightboxUrl, isDeleteConfirmationVisible, isMobileView]);

  const highlightMessage = useCallback((messageId: string) => {
    if (!messageId) return;

    const maxAttempts = 24;
    const attemptDelayMs = 60;

    const applyHighlight = (attempt: number) => {
      const element = document.getElementById(getMessageElementId(messageId));
      if (!element) {
        if (attempt < maxAttempts) {
          window.setTimeout(() => applyHighlight(attempt + 1), attemptDelayMs);
        }
        return;
      }

      element.classList.remove('quote-jump-highlight');
      // Restart animation even when the same message is highlighted repeatedly.
      void element.getBoundingClientRect();
      element.classList.add('quote-jump-highlight');

      window.setTimeout(() => {
        element.classList.remove('quote-jump-highlight');
      }, 1300);
    };

    applyHighlight(0);
  }, []);

  const scrollToLoadedMessage = useCallback((messageId: string, behavior: 'auto' | 'smooth' = 'auto', force = false) => {
    const targetId = normalizeMessageId(messageId);
    if (!targetId) return false;
    const msgIndex = messagesRef.current.findIndex((m) => normalizeMessageId(m.id) === targetId);
    if (msgIndex === -1) return false;

    clearPendingBottomScrollTimers();
    engageQuoteJumpLock(2600);
    scheduleProgrammaticScrollSuppression(2600);
    lastAtBottomStateRef.current = false;
    isAtBottomRef.current = false;
    setIsScrollToBottomVisible(true);

    if (!force && shouldSuppressProgrammaticScroll()) return false;

    const ensureVisibleAndHighlight = (attempt: number) => {
      const element = findMessageElement(targetId);
      if (!element) {
        if (attempt < 25) window.setTimeout(() => ensureVisibleAndHighlight(attempt + 1), 40);
        return;
      }
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
      highlightMessage(targetId);
    };

    requestAnimationFrame(() => ensureVisibleAndHighlight(0));
    return true;
  }, [clearPendingBottomScrollTimers, engageQuoteJumpLock, highlightMessage, scheduleProgrammaticScrollSuppression, shouldSuppressProgrammaticScroll]);

  const resolveReplyNavigationTargetId = useCallback((
    requestedMessageId: string,
    sourceMessageId?: string,
    replyingToPayload?: any,
  ): string => {
    const sourceId = normalizeMessageId(sourceMessageId);
    const directRequested = normalizeMessageId(requestedMessageId);
    const idsInMemory = new Set(messagesRef.current.map((m) => normalizeMessageId(m.id)).filter(Boolean));

    const candidateIds = [
      directRequested,
      normalizeMessageId(replyingToPayload?.id),
      normalizeMessageId(replyingToPayload?.messageId),
      normalizeMessageId(replyingToPayload?._id),
    ].filter(Boolean);

    quoteLog('resolveReplyNavigationTargetId candidates', {
      requestedMessageId,
      sourceMessageId,
      candidateIds,
      inMemoryCount: idsInMemory.size,
    });

    for (const candidate of candidateIds) {
      if (sourceId && candidate === sourceId) continue;
      if (idsInMemory.has(candidate)) {
        quoteLog('resolveReplyNavigationTargetId resolved by direct candidate', { candidate });
        return candidate;
      }
    }

    if (!replyingToPayload) {
      quoteWarn('resolveReplyNavigationTargetId no payload; falling back to requested id', { directRequested });
      return directRequested;
    }

    const replyText = typeof replyingToPayload.text === 'string' ? replyingToPayload.text.trim() : '';
    const replyUsername = typeof replyingToPayload.username === 'string' ? replyingToPayload.username.trim() : '';
    const replyType = typeof replyingToPayload.type === 'string' ? replyingToPayload.type : '';
    const replyUrl = typeof replyingToPayload.url === 'string' ? replyingToPayload.url.trim() : '';

    const sourceIndex = sourceId
      ? messagesRef.current.findIndex((m) => normalizeMessageId(m.id) === sourceId)
      : -1;

    const metadataMatches = messagesRef.current
      .map((m, index) => ({ m, index }))
      .filter(({ m }) => {
        if (sourceId && normalizeMessageId(m.id) === sourceId) return false;
        if (replyUsername && m.username !== replyUsername) return false;
        if (replyType && m.type !== replyType) return false;
        if (replyUrl && (m.url || '').trim() !== replyUrl) return false;
        if (replyText && (m.text || '').trim() !== replyText) return false;
        if (!replyText && !replyUrl) return false;
        return true;
      });

    if (metadataMatches.length === 0) {
      quoteWarn('resolveReplyNavigationTargetId metadata matching failed; using requested id', {
        directRequested,
        replyUsername,
        replyType,
        hasReplyText: !!replyText,
        hasReplyUrl: !!replyUrl,
      });
      return directRequested;
    }

    const preferred = sourceIndex > 0
      ? metadataMatches.filter(({ index }) => index < sourceIndex)
      : metadataMatches;

    const chosen = preferred.length > 0
      ? preferred[preferred.length - 1]
      : metadataMatches[metadataMatches.length - 1];

    const resolved = normalizeMessageId(chosen.m.id) || directRequested;
    quoteLog('resolveReplyNavigationTargetId resolved via metadata', {
      resolved,
      metadataMatchCount: metadataMatches.length,
      sourceIndex,
      chosenIndex: chosen.index,
      chosenId: chosen.m.id,
    });
    return resolved;
  }, []);

  const scrollToMessage = useCallback((messageId: string, sourceMessageId?: string, behavior: 'auto' | 'smooth' = 'auto', force = false, replyingToPayload?: any) => {
    const targetId = resolveReplyNavigationTargetId(messageId, sourceMessageId, replyingToPayload);
    const sourceId = normalizeMessageId(sourceMessageId);

    quoteLog('scrollToMessage requested', {
      messageId,
      resolvedTargetId: targetId,
      sourceId,
      behavior,
      force,
      historyLoaded,
      loadedMessageCount: messagesRef.current.length,
    });

    if (targetId && sourceId && targetId === sourceId) {
      quoteWarn('scrollToMessage aborted: resolved target equals source', { targetId, sourceId });
      return;
    }

    if (sourceId && sourceId !== targetId) {
      const stack = quoteJumpReturnStackRef.current;
      const lastSourceId = stack[stack.length - 1];
      if (lastSourceId !== sourceId) {
        const nextStack = stack.length >= MAX_QUOTE_JUMP_STACK_DEPTH
          ? stack.slice(stack.length - MAX_QUOTE_JUMP_STACK_DEPTH + 1)
          : stack.slice();
        nextStack.push(sourceId);
        quoteJumpReturnStackRef.current = nextStack;
      }
    }

    return new Promise<void>((resolve) => {
      if (!targetId) {
        quoteWarn('scrollToMessage aborted: no resolved target id', { messageId, sourceId });
        resolve();
        return;
      }
      if (scrollToLoadedMessage(targetId, behavior, force)) {
        quoteLog('scrollToMessage resolved within loaded window', { targetId });
        resolve();
        return;
      }
      if (!historyLoaded) {
        quoteWarn('scrollToMessage aborted: history not loaded yet', { targetId });
        resolve();
        return;
      }

      void (async () => {
        let cursor = oldestLoadedAtRef.current;
        let hasMore = hasMoreOlderMessagesRef.current;
        let fetchedPages = 0;

        while (!messagesRef.current.some((m) => normalizeMessageId(m.id) === targetId) && hasMore && cursor && fetchedPages < MAX_QUOTE_AUTO_LOAD_PAGES) {
          if (isLoadingOlderRef.current) {
            await new Promise((res) => setTimeout(res, 80));
            cursor = oldestLoadedAtRef.current;
            hasMore = hasMoreOlderMessagesRef.current;
            continue;
          }

          isLoadingOlderRef.current = true;
          try {
            const result = await fetchAndPrependOlderMessages(cursor, 500);
            fetchedPages += 1;
            cursor = result.nextCursor;
            hasMore = result.hasMore;
          } catch (error) {
            console.error('Failed to auto-load quoted message history:', error);
            break;
          } finally {
            isLoadingOlderRef.current = false;
          }

          await new Promise((res) => setTimeout(res, 0));
        }

        quoteLog('scrollToMessage auto-load loop finished', {
          targetId,
          fetchedPages,
          hasMore,
          cursor,
          nowContainsTarget: messagesRef.current.some((m) => normalizeMessageId(m.id) === targetId),
        });

        requestAnimationFrame(() => {
          scrollToLoadedMessage(targetId, behavior, force);
          resolve();
        });
      })();
    });
  }, [fetchAndPrependOlderMessages, historyLoaded, resolveReplyNavigationTargetId, scrollToLoadedMessage]);

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto', force = false) => {
    if (!force && shouldSuppressProgrammaticScroll()) return;
    const applyScrollerBottom = () => {
      if (!force && shouldSuppressProgrammaticScroll()) return;
      const scroller = getChatScrollerElement();
      if (!scroller) return;
      try {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      } catch {
        if (behavior === 'auto') {
          scroller.scrollTop = scroller.scrollHeight;
        }
      }
      if (behavior === 'auto') {
        scroller.scrollTop = scroller.scrollHeight;
      }
      quoteLog('scrollToBottom applyScrollerBottom', {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      });
    };

    const scroller = chatContainerRef.current; 
    if (scroller && behavior === 'auto') {
      scroller.scrollTop = scroller.scrollHeight;
    }
    requestAnimationFrame(applyScrollerBottom);
  }, [getChatScrollerElement, shouldSuppressProgrammaticScroll]);

  const syncBottomStateFromScroller = useCallback(() => {
    const scroller = getChatScrollerElement();
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    const atBottom = distanceFromBottom <= 2;
    isAtBottomRef.current = atBottom;
    lastAtBottomStateRef.current = atBottom;
    setIsScrollToBottomVisible(!atBottom);
    if (atBottom) {
      setNewMessagesWhileScrolledUp(0);
      quoteJumpReturnStackRef.current = [];
    }
    quoteLog('syncBottomStateFromScroller', {
      atBottom,
      distanceFromBottom,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    });
  }, [getChatScrollerElement]);

  const forceScrollToBottomAsync = useCallback((allowDuringSuppression = false) => {
    clearPendingBottomScrollTimers();
    if (!allowDuringSuppression && shouldSuppressProgrammaticScroll()) return;

    scrollToBottom('auto', true);
    // Re-issue the scroll over the next 500ms to guarantee anchoring.
    // This perfectly tracks the mobile OS virtual keyboard retracting animation
    // and layout flex reflows (like reply previews unmounting).
    const delays = [50, 200, 450];
    pendingBottomScrollTimeoutsRef.current = delays.map((delay) =>
      window.setTimeout(() => {
        if (!allowDuringSuppression && shouldSuppressProgrammaticScroll()) return;
        scrollToBottom('auto', true);
      }, delay)
    );
  }, [clearPendingBottomScrollTimers, scrollToBottom, shouldSuppressProgrammaticScroll]);

  useEffect(() => {
    return () => {
      clearPendingBottomScrollTimers();
      if (quoteJumpLockTimeoutRef.current !== null) {
        window.clearTimeout(quoteJumpLockTimeoutRef.current);
        quoteJumpLockTimeoutRef.current = null;
      }
    };
  }, [clearPendingBottomScrollTimers]);

  const handleScrollToBottomButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const latestMessageId = messagesRef.current[messagesRef.current.length - 1]?.id || null;
    let returnTargetId: string | null = null;
    while (quoteJumpReturnStackRef.current.length > 0) {
      const candidate = quoteJumpReturnStackRef.current.pop() || null;
      if (!candidate) continue;
      // If hierarchy points to the bottom-most message, skip highlight behavior
      // and fall through to the normal bottom scroll action.
      if (latestMessageId && candidate === latestMessageId) continue;
      returnTargetId = candidate;
      break;
    }

    quoteLog('scroll-to-bottom button clicked', {
      latestMessageId,
      returnStackSize: quoteJumpReturnStackRef.current.length,
      returnTargetId,
    });

    if (returnTargetId && scrollToLoadedMessage(returnTargetId, 'auto', true)) {
      quoteLog('scroll-to-bottom performed quote-return jump', { returnTargetId });
      return;
    }

    // Explicitly blur any active input so that the mobile virtual keyboard closes 
    // when programmatically scrolling to bottom, fixing the issue where it snaps open again.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setNewMessagesWhileScrolledUp(0);
    clearQuoteJumpSuppression();
    quoteLog('scroll-to-bottom falling back to bottom anchor');
    scrollToBottom('auto', true);
    requestAnimationFrame(() => syncBottomStateFromScroller());
    window.setTimeout(() => syncBottomStateFromScroller(), 80);
    window.setTimeout(() => syncBottomStateFromScroller(), 220);
    window.setTimeout(() => syncBottomStateFromScroller(), 500);
  }, [clearQuoteJumpSuppression, scrollToBottom, isMobileView, scrollToLoadedMessage, syncBottomStateFromScroller]);

  const handleEmojiClick = (emojiData: EmojiClickData) => { setInputMessage(prev => prev + emojiData.emoji); };
  const handleOpenEmojiPicker = useCallback((rect: DOMRect) => {
    setEmojiPickerPosition((prev) => {
      if (prev) {
        restoreKeyboardAfterEmojiCloseRef.current = false;
        keyboardWasOpenBeforeEmojiRef.current = false;
        return null;
      }
      return rect;
    });
  }, []);

  const handleOpenFullEmojiPicker = useCallback((rect: DOMRect, messageId: string) => {
    // Blur any focused input to prevent the mobile keyboard from opening
    // alongside the emoji picker.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFullEmojiPickerPosition(rect);
    messageIdForFullEmojiPickerRef.current = messageId;
    setReactionPickerData(null);
    // Don't clear select mode here — the select mode was already cleared
    // by handleCancelSelectMode in the MobileReactionPicker onClick,
    // or this was opened from the desktop reaction picker (no select mode).
    // Clearing here caused a race condition where the message ID was lost.
  }, []);

  // --- PRE-RENDER HOOKS (must be before any early return to satisfy Rules of Hooks) ---
  const handleHeaderButtonPointerDown = useCallback((e: React.PointerEvent) => {
    if (isMobileView) {
      const vvHeight = window.visualViewport?.height || window.innerHeight;
      const isKeyboardLikelyOpen = (stableViewportHeightRef.current - vvHeight) > 96;
      if (isKeyboardLikelyOpen) {
        e.preventDefault();
      } else {
        messageInputRef.current?.blur();
      }
    } else {
      e.preventDefault();
    }
  }, [isMobileView]);

  const selectedMessageIds = useMemo(() => new Set(selectedMessages), [selectedMessages]);
  const loadedMediaMessageSet = useMemo(() => new Set(loadedMediaMessageIds), [loadedMediaMessageIds]);
  // - FIX: followOutput aggressively blocks during programmatic scroll -
  // The key insight: followOutput is called on EVERY scroll frame, and Virtuoso's
  // internal isAtBottom param can be true even when the user hasn't genuinely
  // scrolled to bottom (e.g., during animation). We must:
  // 1. Always return false during suppression window (prevents overrides)
  // 2. Only return 'auto' if BOTH suppressProgrammaticScroll window is expired AND user is at bottom
  // 3. Use our isAtBottomRef (set by real user scroll), not Virtuoso's param

  // --- RENDER ---
  if (!userContext?.profile) { return <Auth onAuthSuccess={userContext?.login ?? (() => { })} tempToken={tempToken || null} roomId={roomId} />; }

  const selectedMessage = messages.find(msg => msg.id === selectedMessages[0]);
  const canEditSelectedMessage = selectedMessages.length === 1 && selectedMessage && selectedMessage.userId === userIdRef.current && selectedMessage.text && (new Date().getTime() - new Date(selectedMessage.timestamp).getTime()) < 15 * 60 * 1000;
  const hasNewMessagesIndicator = newMessagesWhileScrolledUp > 0;
  const canZoomOutLightbox = lightboxTransform.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001;
  const canZoomInLightbox = lightboxTransform.scale < PHOTO_LIGHTBOX_MAX_SCALE - 0.001;
  const newMessagesIndicatorLabel = newMessagesWhileScrolledUp > MAX_NEW_MESSAGE_INDICATOR_COUNT
    ? `${MAX_NEW_MESSAGE_INDICATOR_COUNT}+`
    : String(newMessagesWhileScrolledUp);
  const scrollToLatestLabel = hasNewMessagesIndicator
    ? `Scroll to latest messages (${newMessagesWhileScrolledUp} new)`
    : 'Scroll to latest messages';
  const scrollToLatestTitle = hasNewMessagesIndicator
    ? `${newMessagesIndicatorLabel} new message${newMessagesWhileScrolledUp === 1 ? '' : 's'}`
    : 'Scroll to latest messages';
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && editingMessageId) {
      e.preventDefault();
      handleCancelEdit();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // On touchscreen devices (mobile/tablet) the on-screen keyboard's
      // Enter key is expected to insert a newline. Avoid intercepting it
      // there — allow the native behavior (so Shift+Enter still works too).
      if (isMobileView) {
        return;
      }
      e.preventDefault();
      handleSendMessage();
    }
  };
  const stageFilesForPreview = async (files: File[]) => {
    if (files.length === 0) return;
    const carriedCaption = inputMessage;
    setPreMediaDraft(carriedCaption);
    
    // Compress images locally to save bandwidth
    const compressedFiles = await Promise.all(files.map(compressImage));
    
    setStagedFiles(compressedFiles);
    setPreviewActiveIndex(0);
    setPreviewCaption(carriedCaption);
    if (carriedCaption) {
      setInputMessage('');
      localStorage.removeItem(getInputDraftKey(userIdRef.current));
      resetInputLayerHeight();
    }
    setShowFilePreview(true);
    setStagedGif(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    markNativeFilePickerClosed();
    const files = event.target.files;
    if (files && files.length > 0) {
      stageFilesForPreview(Array.from(files));
    }
    // Reset the input so re-selecting the same file triggers onChange
    if (event.target) event.target.value = '';
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const pastedText = clipboardData.getData('text');
    const textarea = e.currentTarget;

    const collectedFiles = new Map<string, File>();
    const addCollectedFile = (file: File | null) => {
      if (!file) return;

      const mime = file.type || 'application/octet-stream';
      const extensionFromMime = mime.includes('/') ? mime.split('/')[1].split('+')[0] : 'bin';
      const safeExt = (extensionFromMime || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
      const hasName = Boolean(file.name && file.name.trim());
      const fileName = hasName ? file.name : `pasted-${Date.now()}.${safeExt}`;
      const normalized = hasName
        ? file
        : new File([file], fileName, { type: mime, lastModified: Date.now() });

      const key = `${normalized.name}:${normalized.size}:${normalized.type}`;
      if (!collectedFiles.has(key)) collectedFiles.set(key, normalized);
    };

    Array.from(clipboardData.files || []).forEach((file) => addCollectedFile(file));

    // Some mobile keyboards expose GIF/image inserts through clipboard items
    // rather than clipboardData.files; support both paths.
    Array.from(clipboardData.items || []).forEach((item) => {
      if (item.kind !== 'file') return;
      if (!item.type || !item.type.startsWith('image/')) return;
      addCollectedFile(item.getAsFile());
    });

    const fileArr = Array.from(collectedFiles.values());
    if (fileArr.length === 0) {
      if (!pastedText) return;

      e.preventDefault();
      const selectionStart = textarea.selectionStart ?? inputMessage.length;
      const selectionEnd = textarea.selectionEnd ?? selectionStart;
      const nextValue = `${inputMessage.slice(0, selectionStart)}${pastedText}${inputMessage.slice(selectionEnd)}`.slice(0, MAX_MESSAGE_LENGTH);
      const nextCaretPosition = Math.min(selectionStart + pastedText.length, nextValue.length);

      skipNextInputLayoutSyncRef.current = true;
      setInputMessage(nextValue);
      textarea.value = nextValue;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
        textarea.scrollTop = textarea.scrollHeight;
        if (inputOverlayRef.current) inputOverlayRef.current.scrollTop = inputOverlayRef.current.scrollHeight;
        requestAnimationFrame(() => {
          textarea.scrollTop = textarea.scrollHeight;
          if (inputOverlayRef.current) inputOverlayRef.current.scrollTop = inputOverlayRef.current.scrollHeight;
        });
      });
      handleTyping();
      syncInputLayerLayout(textarea, nextValue, true);
      return;
    }

    e.preventDefault();
    stageFilesForPreview(fileArr);
  };

  const handleSendFromPreview = async () => {
    if (stagedFiles.length === 0) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !userContext?.profile) return;

    let replyContext: ReplyContext | undefined = undefined;
    if (replyingTo) {
      const { type } = replyingTo;
      if (type === 'system_notification') { setReplyingTo(null); return; }
      let replyText = replyingTo.text || 'Message';
      if (!replyingTo.text) {
        if (isGiphyUrl(replyingTo.url)) replyText = 'GIF';
        else if (replyingTo.type === 'image') replyText = 'Image';
        else if (replyingTo.type === 'video') replyText = 'Video';
      }
      replyContext = { id: replyingTo.id, username: replyingTo.username, text: replyText, type, url: replyingTo.url, isDeleted: replyingTo.isDeleted, deletedBy: replyingTo.deletedBy };
    }

    const caption = previewCaption.trim();

    for (let i = 0; i < stagedFiles.length; i++) {
      const file = stagedFiles[i];
      const tempId = Date.now().toString() + '_' + i;
      const fileType: 'image' | 'video' | 'file' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';

      const message: Message = {
        id: tempId,
        userId: userIdRef.current,
        username: userContext?.profile?.username || '',
        type: fileType,
        url: URL.createObjectURL(file),
        originalName: file.name,
        size: file.size,
        text: i === 0 ? caption : undefined,
        timestamp: new Date().toISOString(),
        replyingTo: i === 0 ? replyContext : undefined,
        isUploading: true,
      };
      setMessages(prev => [...prev, message]);
      requestAnimationFrame(() => scrollToBottom());

      transferManager.startUpload(tempId, file, roomId, resolveApiBaseUrl(), userIdRef.current, message)
        .then(uploadedFileData => {
          const finalMessage = {
            ...message,
            ...uploadedFileData,
            originalName: chooseReadableFilename(uploadedFileData.originalName, message.originalName),
            isUploading: false,
            id: uploadedFileData.id,
            text: i === 0 ? caption : undefined,
          };
          setMessages(prev => prev.map(m => m.id === tempId ? finalMessage : m));
          ws.current?.send(JSON.stringify(finalMessage));
        })
        .catch(error => {
          if (error.message === 'Aborted') return;
          console.error('File upload failed!', error);
          const errorText = error instanceof Error && error.message ? error.message : (typeof error === 'string' ? error : 'Upload failed');
          setMessages(prev => prev.map(m => m.id === tempId ? {
            ...message,
            url: '',
            isUploading: false,
            uploadError: true,
            originalName: sanitizeFilename(message.originalName || file.name, 'file'),
            text: errorText,
          } : m));
        });

    }

    resetInput();
  };

  const openGifPicker = () => {
    setGifSearchTerm('');
    setGifResults([]);
    setGifError('');
    setShowGifPicker(true);
  };

  const closeGifPicker = () => {
    setShowGifPicker(false);
    setGifSearchTerm('');
    setGifResults([]);
    setGifError('');
    setIsLoadingGifs(false);
  };

  const handleGifSelect = (gif: Gif) => { setStagedGif(gif); setStagedFile(null); setStagedFiles([]); setShowFilePreview(false); closeGifPicker(); };



  return (
    <>
      <DragDropOverlay $isVisible={isDragging}>
        <DragDropCard>
          <DragDropIconWrapper>
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          </DragDropIconWrapper>
          <DragDropTitle>Drop your file here</DragDropTitle>
          <DragDropSubtitle>Images, videos, PDFs and more - release to upload</DragDropSubtitle>
        </DragDropCard>
      </DragDropOverlay>
      {/* WhatsApp-style File Preview Modal */}
      {showFilePreview && stagedFiles.length > 0 && (() => {
        const activeFile = stagedFiles[previewActiveIndex] || stagedFiles[0];
        const isImg = activeFile?.type.startsWith('image/');
        const isVid = activeFile?.type.startsWith('video/');
        const ext = activeFile?.name.split('.').pop()?.toUpperCase() || '';
        const sizeKB = activeFile ? (activeFile.size / 1024) : 0;
        const sizeLabel = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${Math.round(sizeKB)} KB`;
        return (
          <FilePreviewModal>
            <FilePreviewModalHeader>
              <FilePreviewModalClose aria-label="Close preview" onClick={handleRequestCloseFilePreview}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </FilePreviewModalClose>
              <FilePreviewModalFilename>{activeFile?.name}</FilePreviewModalFilename>
            </FilePreviewModalHeader>
            <FilePreviewModalBody>
              {isImg ? (
                <img src={sanitizeMediaUrl(getBlobUrl(activeFile))} alt="File preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
              ) : isVid ? (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <VideoPlayer src={sanitizeMediaUrl(getBlobUrl(activeFile))} />
                </div>
              ) : (
                <FilePreviewNoPreview>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <p>No preview available</p>
                  <span>{sizeLabel} - {ext}</span>
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
                      <FilePreviewThumb $active={idx === previewActiveIndex} onClick={() => setPreviewActiveIndex(idx)}>
                        {tIsImg ? <img src={sanitizeMediaUrl(getBlobUrl(f))} alt="" /> : tIsVid ? <video src={sanitizeMediaUrl(getBlobUrl(f))} /> : (
                          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        )}
                      </FilePreviewThumb>
                      <FilePreviewRemoveBtn onClick={(e) => { e.stopPropagation(); setStagedFiles(prev => { const next = prev.filter((_, i) => i !== idx); if (next.length === 0) { closeFilePreviewAndRestoreDraft(); } else if (previewActiveIndex >= next.length) { setPreviewActiveIndex(next.length - 1); } return next; }); }}>&times;</FilePreviewRemoveBtn>
                    </div>
                  );
                })}
                <FilePreviewAddBtn onClick={() => { notifyNativeFilePickerOpen(); addFileInputRef.current?.click(); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </FilePreviewAddBtn>
              </FilePreviewThumbStrip>
            )}
            {stagedFiles.length === 1 && (
              <FilePreviewThumbStrip>
                <FilePreviewAddBtn onClick={() => { notifyNativeFilePickerOpen(); addFileInputRef.current?.click(); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </FilePreviewAddBtn>
              </FilePreviewThumbStrip>
            )}
            <FilePreviewModalFooter>
              <FilePreviewCaptionInput
                ref={previewCaptionInputRef}
                placeholder="Add a caption..."
                value={previewCaption}
                onChange={(e) => setPreviewCaption(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendFromPreview(); } }}
              />
              <FilePreviewSendBtn onClick={handleSendFromPreview}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </FilePreviewSendBtn>
            </FilePreviewModalFooter>
          </FilePreviewModal>
        );
      })()}
      {emojiPickerPosition && !isMobileView && (
        <div
          ref={emojiPickerRef}
          style={(() => {
            const pickerWidth = 350;
            let top = emojiPickerPosition.top - 450;
            let left = emojiPickerPosition.left;
            if (top < 0) top = emojiPickerPosition.bottom + 10;
            if (left + pickerWidth > window.innerWidth) left = window.innerWidth - pickerWidth - 10;
            if (left < 0) left = 10;
            return { position: 'absolute' as const, top: `${top}px`, left: `${left}px`, zIndex: 21 };
          })()}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            autoFocusSearch={false}
            theme={isDark ? Theme.DARK : Theme.LIGHT}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis={false}
          />
        </div>
      )}
      {fullEmojiPickerPosition && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.3)' }}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setFullEmojiPickerPosition(null); messageIdForFullEmojiPickerRef.current = null; }}
          />
          {isMobileView ? (
            <MobileEmojiPanel>
              <EmojiPicker
                onEmojiClick={(emojiData) => {
                  const msgId = messageIdForFullEmojiPickerRef.current;
                  setFullEmojiPickerPosition(null);
                  messageIdForFullEmojiPickerRef.current = null;
                  // Cancel select mode here (not in the + button handler) so the
                  // MobileReactionPicker stays mounted while the panel is open,
                  // keeping target.closest('.mobile-reaction-picker') reliable.
                  handleCancelSelectMode();
                  if (msgId) {
                    handleReact(msgId, emojiData.emoji);
                  }
                }}
                theme={isDark ? Theme.DARK : Theme.LIGHT}
                emojiStyle={EmojiStyle.NATIVE}
                autoFocusSearch={false}
                width="100%"
                lazyLoadEmojis={false}
              />
            </MobileEmojiPanel>
          ) : (
            <EmojiPickerWrapper
              ref={fullEmojiPickerRef}
              style={{
                position: 'fixed',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
              }}
            >
              <EmojiPicker
                onEmojiClick={(emojiData) => {
                  const msgId = messageIdForFullEmojiPickerRef.current;
                  setFullEmojiPickerPosition(null);
                  messageIdForFullEmojiPickerRef.current = null;
                  handleCancelSelectMode();
                  if (msgId) {
                    handleReact(msgId, emojiData.emoji);
                  }
                }}
                theme={isDark ? Theme.DARK : Theme.LIGHT}
                emojiStyle={EmojiStyle.NATIVE}
                autoFocusSearch={false}
                lazyLoadEmojis={false}
              />
            </EmojiPickerWrapper>
          )}
        </>
      )}
      {reactionPickerData && (
        <ReactionPicker
          ref={reactionPickerRef}
          $sender={reactionPickerData.sender}
          style={(() => {
            const pickerWidth = 280;
            let top = reactionPickerData.rect.top - 60;
            let left = reactionPickerData.rect.left;

            if (top < 0) {
              top = reactionPickerData.rect.bottom + 10;
            }

            if (reactionPickerData.sender === 'me') {
              left = reactionPickerData.rect.right - pickerWidth;
            }

            // Clamp within viewport
            if (left + pickerWidth > window.innerWidth) {
              left = window.innerWidth - pickerWidth - 10;
            }
            if (left < 10) left = 10;

            return { top: `${top}px`, left: `${left}px` };
          })()}
        >
          {QUICK_REACTIONS.map(emoji => (
            <ReactionEmoji key={emoji} onClick={(e) => { e.stopPropagation(); handleReact(reactionPickerData.messageId, emoji); }}>{emoji}</ReactionEmoji>
          ))}
          <ReactionEmoji $isPlusIcon={true} data-is-plus-icon="true" onClick={(e) => {
            e.stopPropagation();
            handleOpenFullEmojiPicker(e.currentTarget.getBoundingClientRect(), reactionPickerData.messageId);
          }}>+</ReactionEmoji>
        </ReactionPicker>
      )}

      {reactionsPopup && (
        <ReactionsPopup
          popupData={reactionsPopup}
          currentUserId={userIdRef.current}
          onClose={() => setReactionsPopup(null)}
          onRemoveReaction={(emoji) => {
            if (reactionsPopup) {
              handleReact(reactionsPopup.messageId, emoji); // Re-reacting with the same emoji removes it
            }
            setReactionsPopup(null);
          }}
        />
      )}
      <AppContainer>
        <Header>
          <HeaderTitle style={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <a href="/">
              <img src="/pulse_logo.webp" alt="Pulse Chat" style={{ flexShrink: 0 }} />
              <span style={{ flexShrink: 0 }}>Pulse</span> <span className="hide-on-narrow">Chat</span>
            </a>
            {(!isConnected || !isBrowserOnline) && (
              <div
                title="Offline"
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 8px 1px rgba(239,68,68,0.7)',
                  flexShrink: 0,
                  marginTop: '0.2rem'
                }}
              />
            )}
          </HeaderTitle>
          <HeaderActionsGroup>
            <SoundToggleButton
              type="button"
              $enabled={isSoundEnabled}
              onPointerDown={handleHeaderButtonPointerDown}
              onClick={() => {
                setIsSoundEnabled(prev => !prev);
                setIsSoundToggleAnimating(true);
              }}
              aria-pressed={isSoundEnabled}
              aria-label={isSoundEnabled ? 'Disable notification sounds' : 'Enable notification sounds'}
              title={isSoundEnabled ? 'Notification sounds on' : 'Notification sounds off'}
            >
              <SoundToggleIcon $enabled={isSoundEnabled} $animate={isSoundToggleAnimating} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <defs>
                  <linearGradient id="soundGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
                <path className="speaker-core" d="M6 13h6l6-5v16l-6-5H6z" fill="url(#soundGradient)" stroke="url(#soundGradient)" />
                <path className="speaker-wave" d="M22 12c2 2 2 6 0 8" stroke="url(#soundGradient)" />
                <path className="speaker-wave" d="M25 9c3.5 3.5 3.5 10.5 0 14" stroke="url(#soundGradient)" />
                <path className="speaker-muted" d="M21 12l7 7" stroke="url(#soundGradient)" />
                <path className="speaker-muted" d="M28 12l-7 7" stroke="url(#soundGradient)" />
              </SoundToggleIcon>
            </SoundToggleButton>
            <ThemeToggleBtn
              onPointerDown={handleHeaderButtonPointerDown}
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              )}
            </ThemeToggleBtn>
            <SearchPlaceholder />
            <ChatSearchContainer id="chat-search-container" $active={isSearchActive} $isClosing={isSearchClosing}>
              <ChatSearchButton 
                onClick={() => { 
                  if (!activeSearchQuery) {
                    // Save scroll position and bottom-state on the real scroller.
                    // chatContainerRef IS the scroller (plain div with overflowY:auto).
                    const scroller = chatContainerRef.current;
                    scrollBeforeSearchRef.current = scroller?.scrollTop ?? null;
                    // isAtBottomRef is set by the onScroll handler; read it here before
                    // the data switch changes scroll position.
                    wasAtBottomBeforeSearchRef.current = isAtBottomRef.current;
                  }
                  if (!isSearchActive) setIsSearchActive(true);
                  else setActiveSearchQuery(chatSearchQuery);
                }}
                style={{ cursor: 'pointer' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </ChatSearchButton>
              <ChatSearchInput
                id="chat-search-input"
                $active={isSearchActive}
                value={chatSearchQuery}
                onChange={e => {
                  const val = e.target.value;
                  setChatSearchQuery(val);
                  if (val.trim() === '') {
                    setActiveSearchQuery('');
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setChatSearchQuery('');
                    setActiveSearchQuery('');
                    handleCloseSearch();
                  } else if (e.key === 'Enter') {
                    if (!activeSearchQuery) {
                      const scroller = chatContainerRef.current;
                      scrollBeforeSearchRef.current = scroller?.scrollTop ?? null;
                      wasAtBottomBeforeSearchRef.current = isAtBottomRef.current;
                    }
                    setActiveSearchQuery(chatSearchQuery);
                  }
                }}
                placeholder="Search..."
              />
                <ChatSearchButton onClick={(e) => {
                  e.stopPropagation();
                  if (chatSearchQuery || activeSearchQuery) {
                    setChatSearchQuery('');
                    setActiveSearchQuery('');
                  } else {
                    handleCloseSearch();
                  }
                }}
                tabIndex={isSearchActive ? 0 : -1}
                aria-hidden={!isSearchActive}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </ChatSearchButton>
            </ChatSearchContainer>
            <MobileUserListToggle
              $isOpen={isUserListVisible}
              onPointerDown={handleHeaderButtonPointerDown}
              onClick={() => {
                if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
                setIsUserListVisible(!isUserListVisible);
              }}
              aria-label={isUserListVisible ? 'Hide online users' : 'Show online users'}
              title={isUserListVisible ? 'Hide online users' : 'Show online users'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </MobileUserListToggle>
          </HeaderActionsGroup>
        </Header>
        <LayoutContainer>
          <ChatWindow>
            {pinnedMessages.length > 0 && (
              <PinnedBannerContainer onClick={async () => {
                if (isJumpingToPinned) return;
                const currentMsg = pinnedMessages[currentPinnedIndex];
                if (currentMsg) {
                  setIsJumpingToPinned(true);
                  try {
                    await scrollToMessage(currentMsg.id || currentMsg._id || currentMsg.messageId, undefined, 'auto', true);
                  } finally {
                    setIsJumpingToPinned(false);
                    setCurrentPinnedIndex((prev) => (prev + 1) % pinnedMessages.length);
                  }
                } else {
                  setCurrentPinnedIndex((prev) => (prev + 1) % pinnedMessages.length);
                }
              }}>
                <PinnedBannerIconWrapper>
                  {isJumpingToPinned ? (
                    <>
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                      </svg>
                    </>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11V22H13V16H18V14L16 12Z"/>
                    </svg>
                  )}
                  {pinnedMessages.length > 1 && !isJumpingToPinned && (
                    <PinnedCycleIndicator>
                      {pinnedMessages.map((_, i) => (
                        <PinnedCycleSegment key={i} $active={i === currentPinnedIndex} />
                      ))}
                    </PinnedCycleIndicator>
                  )}
                </PinnedBannerIconWrapper>
                <PinnedBannerContentWrapper>
                  <PinnedBannerLabel>Pinned Message</PinnedBannerLabel>
                  <PinnedBannerText>
                    {(() => {
                      const msg = pinnedMessages[currentPinnedIndex];
                      if (!msg) return 'Attachment';
                      const isGif = !!msg.url?.match(/^https?:\/\/(?:[a-z0-9-]+\.)*giphy\.com\//i) || !!msg.text?.match(/^https?:\/\/(?:[a-z0-9-]+\.)*giphy\.com\//i) || msg.originalName?.toLowerCase().endsWith('.gif') || msg.url?.toLowerCase().split('?')[0].endsWith('.gif');
                      if (isGif) {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><path d="M10 9l-3 0 0 6 3 0"></path><path d="M14 9l-1 0 0 6 1 0"></path><path d="M19 9l-2 0 0 6"></path><path d="M17 12l2 0"></path></svg>
                            GIF
                          </div>
                        );
                      }
                      if (msg.type === 'image') {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                            Photo
                          </div>
                        );
                      }
                      if (msg.type === 'video') {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                            Video
                          </div>
                        );
                      }
                      if (msg.type === 'file') {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                            {msg.originalName || 'File'}
                          </div>
                        );
                      }
                      return msg.text || 'Attachment';
                    })()}
                  </PinnedBannerText>
                </PinnedBannerContentWrapper>
              </PinnedBannerContainer>
            )}
            <MessagesAndScrollWrapper>
              <MessagesContainer 
                onClick={handleChatAreaClick}
                $isScrollButtonVisible={isScrollToBottomVisible} 
                $isMobileView={isMobileView}
                ref={chatContainerRef as any}
                onScroll={(e) => {
                  const target = e.target as HTMLDivElement;
                  if (reactionPickerData && scrollAtReactionPickerRef.current !== null) {
                    if (Math.abs(target.scrollTop - scrollAtReactionPickerRef.current) > 20) {
                      setReactionPickerData(null);
                    }
                  }
                  if (isSelectModeActive && selectedMessages.length === 1 && scrollAtSelectModeRef.current !== null) {
                    if (Math.abs(target.scrollTop - scrollAtSelectModeRef.current) > 20) {
                      document.body.classList.add('hide-mobile-picker');
                    }
                  }
                  if (target.scrollTop < 2500 && !isLoadingOlderRef.current && hasMoreOlderMessages && !suppressOlderMessageLoadRef.current) {
                    loadOlderMessages();
                  }
                  const distanceFromBottom = target.scrollHeight - (target.scrollTop + target.clientHeight);
                  const atBottom = distanceFromBottom <= 20;
                  handleAtBottomStateChange(atBottom);
                }}
              >
                {historyLoaded && messages.length > 0 ? (() => {
                let viewportTop = chatContainerRef.current?.scrollTop ?? 0;
                if (scrollBeforeSearchRef.current !== null) {
                    viewportTop = scrollBeforeSearchRef.current;
                }
                const viewportBottom = viewportTop + (chatContainerRef.current?.clientHeight ?? 800);
                let currentY = 0;
                const fastMountVisibility = new Set<string>();
                const useFastMount = filteredMessages.length > 100;
                
                if (useFastMount) {
                   filteredMessages.forEach(msg => {
                       const h = messageHeightsRef.current[msg.id] ?? 80;
                       if (currentY + h > viewportTop - 3000 && currentY < viewportBottom + 3000) {
                           fastMountVisibility.add(msg.id);
                       }
                       currentY += h;
                   });
                }

                return (
                  filteredMessages.map((msg, index, displayArr) => {
                    if (msg.type === 'system_notification') {
                      return (
                        <div key={msg.id || index} style={{ display: 'flex', justifyContent: 'center', padding: '0.4rem 0' }}>
                          <SystemMessage>{msg.text}</SystemMessage>
                        </div>
                      );
                    }
                    const dataIndex = index;
                    const prevMsg = dataIndex > 0 ? displayArr[dataIndex - 1] : null;
                    const showUsername = !prevMsg || prevMsg.type === 'system_notification' || prevMsg.userId !== msg.userId;

                    const currentDateStr = msg.timestamp ? new Date(msg.timestamp).toDateString() : null;
                    const prevDateStr = prevMsg?.timestamp ? new Date(prevMsg.timestamp).toDateString() : null;
                    const showDateSeparator = currentDateStr && currentDateStr !== prevDateStr;

                    return (
                      <VirtualMessageWrapper
                        key={msg.id || `msg-${index}`}
                        id={msg.id}
                        containerRef={chatContainerRef}
                        messageHeightsRef={messageHeightsRef}
                        initialIsVisible={useFastMount ? fastMountVisibility.has(msg.id) : true}
                      >
                        <React.Fragment>
                        {showDateSeparator && (
                          <div style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0 1rem 0' }}>
                            <div style={{ 
                              background: 'var(--bg-elevated)', 
                              color: 'var(--text-secondary)', 
                              padding: '0.25rem 0.8rem', 
                              borderRadius: '16px', 
                              fontSize: '0.75rem', 
                              fontWeight: 600,
                              boxShadow: 'var(--shadow-sm)',
                              border: '1px solid var(--border-primary)',
                              zIndex: 1,
                            }}>
                              {getDateSeparatorText(msg.timestamp)}
                            </div>
                          </div>
                        )}
                        <MessageItem
                          msg={msg}
                          isPinned={pinnedMessages.some(p => p.id === msg.id)}
                          showUsername={showUsername}
                          currentUserId={userIdRef.current}
                          handleSetReply={handleSetReply}
                          handleReact={handleReact}
                          openDeleteMenu={handleOpenDeleteMenu}
                          openLightbox={openLightbox}
                          isMediaLoaded={loadedMediaMessageSet.has(msg.id)}
                          onRequestMediaLoad={handleRequestMediaLoad}
                          isMediaLoadInProgress={Object.prototype.hasOwnProperty.call(mediaLoadProgressById, msg.id)}
                          mediaLoadProgress={mediaLoadProgressById[msg.id] ?? 0}
                          loadedMediaSrc={loadedMediaSrcById[msg.id]}
                          onRequestDownload={handleRequestDownload}
                          onResumeUpload={() => {
                            transferManager.resumeUpload(msg.id, roomId, resolveApiBaseUrl(), userIdRef.current)?.catch(error => {
                              if (error.message === 'Aborted') return;
                              setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, uploadError: true, text: error.message || 'Upload failed' } : m));
                            }).then(uploadedFileData => {
                              if (!uploadedFileData) return;
                              setMessages(prev => prev.map(m => {
                                if (m.id !== msg.id) return m;
                                const finalMessage = {
                                  ...m,
                                  ...uploadedFileData,
                                  originalName: chooseReadableFilename(uploadedFileData.originalName, m.originalName),
                                  isUploading: false,
                                  id: uploadedFileData.id,
                                };
                                ws.current?.send(JSON.stringify(finalMessage));
                                return finalMessage;
                              }));
                            });
                          }}
                          onCancelUpload={() => {
                            transferManager.pauseTransfer(msg.id);
                          }}
                          activeDeleteMenu={activeDeleteMenu}
                          deleteMenuRef={deleteMenuRef}
                          deleteForMe={deleteForMe}
                          deleteForEveryone={deleteForEveryone}
                          scrollToMessage={scrollToMessage}
                          isSelectModeActive={isSelectModeActive}
                          isSelected={selectedMessageIds.has(msg.id)}
                          handleToggleSelectMessage={handleToggleSelectMessage}
                          setActiveDeleteMenu={setActiveDeleteMenu}
                          handleCopy={handleCopy}
                          handleOpenReport={handleOpenReport}
                          handleStartEdit={handleStartEdit}
                          handleCancelSelectMode={handleCancelSelectMode}
                          isMobileView={isMobileView}
                          selectedMessages={selectedMessages}
                          onOpenReactionPicker={handleOpenReactionPicker}
                          setReactionsPopup={setReactionsPopup}
                          handleOpenFullEmojiPicker={handleOpenFullEmojiPicker}
                          reactionPickerData={reactionPickerData}
                          editingMessageId={editingMessageId}
                          handleSetEditingMessageId={setEditingMessageId}
                          handleCancelEdit={handleCancelEdit}
                          onVideoFullscreenEnter={handleVideoFullscreenEnter}
                        />
                        </React.Fragment>
                      </VirtualMessageWrapper>
                    );
                  })
                );
                })() : null}
                <div style={{ height: '12px', flexShrink: 0 }} />
              </MessagesContainer>
              <ScrollToBottomButton
                $isVisible={isScrollToBottomVisible}
                onClick={handleScrollToBottomButtonClick}
                onPointerDown={(e) => e.preventDefault()}
                aria-label={scrollToLatestLabel}
                title={scrollToLatestTitle}
              >
                <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14"></path>
                  <path d="m19 12-7 7-7-7"></path>
                </svg>
                <NewMessagesBadge $isVisible={hasNewMessagesIndicator}>{newMessagesIndicatorLabel}</NewMessagesBadge>
              </ScrollToBottomButton>
            </MessagesAndScrollWrapper>
            
            <SearchNotFoundToast $visible={showSearchNotFound}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              Not found
            </SearchNotFoundToast>
            <TypingIndicator onlineUsers={onlineUsers} currentUserId={userIdRef.current} />
            <Footer>
              {isSelectModeActive && (
                <SelectModeFooter>
                  <CancelPreviewButton onClick={handleCancelSelectMode}>&times;</CancelPreviewButton>
                  <span>{selectedMessages.length} selected</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {canEditSelectedMessage && (
                      <EditButton onClick={() => { if (selectedMessage) { handleStartEdit(selectedMessage); } handleCancelSelectMode(); }} title="Edit" aria-label="Edit selected message" >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </EditButton>
                    )}
                    {isMobileView && selectedMessages.length === 1 && selectedMessage && !selectedMessage.isDeleted && (selectedMessage.type === 'text' || selectedMessage.type === 'image') && (
                      <CopyButton onClick={() => { handleCopy(selectedMessage); handleCancelSelectMode(); }} title="Copy" aria-label="Copy selected message" >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </CopyButton>
                    )}
                    {isMobileView && selectedMessages.length === 1 && selectedMessage && !selectedMessage.isDeleted && selectedMessage.userId !== userIdRef.current && selectedMessage.type !== 'system_notification' && (
                      <ReportButton
                        onClick={() => { handleOpenReport(selectedMessage); handleCancelSelectMode(); }}
                        title="Report"
                        aria-label="Report selected message"
                      >
                        <svg style={{ position: 'relative', left: '1px' }} xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                      </ReportButton>
                    )}
                    <DeleteButton onClick={handleInitiateDelete} title="Delete" aria-label="Delete selected messages">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </DeleteButton>
                  </div>
                </SelectModeFooter>
              )}
              {!isSelectModeActive && (
                <div>
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
                        onClick={handleCancelEdit}
                        title="Cancel editing"
                        aria-label="Cancel editing"
                      >&times;</EditPreviewDismiss>
                    </EditPreviewContainer>
                  )}
                  {replyingTo && <ReplyPreviewContainer ref={replyPreviewRef} onClick={() => {
                    const replyTargetId = resolveReplyTargetId(replyingTo);
                    quoteLog('reply-preview click', {
                      rawReplyingTo: replyingTo,
                      resolvedReplyTargetId: replyTargetId,
                    });
                    if (replyTargetId) scrollToMessage(replyTargetId, undefined, 'auto', true, replyingTo);
                  }}>
                    {replyingTo.type === 'video' && replyingTo.url ? (
                      <video src={replyingTo.url} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                    ) : (replyingTo.type === 'image' || replyingTo.type === 'video') && replyingTo.url && (
                      <FilePreviewImage src={replyingTo.url} alt="Reply preview" />
                    )}
                    <ReplyText><p>Replying to {replyingTo.username}</p><span style={replyingTo.isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : undefined}>
                      {(() => {
                        if (replyingTo.isDeleted) {
                          return replyingTo.deletedBy === 'admin' ? 'This message has been deleted by an admin.' : (replyingTo.deletedBy === userIdRef.current ? 'You deleted this message.' : 'This message has been deleted.');
                        }
                        if (replyingTo.text) return replyingTo.text;
                        if (isGiphyUrl(replyingTo.url)) return 'GIF';
                        if (replyingTo.type === 'image') return 'Image';
                        if (replyingTo.type === 'video') return 'Video';
                        return 'Message';
                      })()}
                    </span></ReplyText><CancelPreviewButton onClick={(e) => { e.stopPropagation(); setReplyingTo(null); }}>&times;</CancelPreviewButton></ReplyPreviewContainer>}
                  {stagedFile && !showFilePreview && (
                    <FilePreviewContainer>
                      {stagedFile.type.startsWith('image/') ? (
                        <FilePreviewImage src={URL.createObjectURL(stagedFile)} alt="Preview" />
                      ) : stagedFile.type.startsWith('video/') ? (
                        <video src={URL.createObjectURL(stagedFile)} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: '8px', flexShrink: 0 }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                      )}
                      <FilePreviewInfo>{stagedFile.name}</FilePreviewInfo>
                      <CancelPreviewButton onClick={() => setStagedFile(null)}>&times;</CancelPreviewButton>
                    </FilePreviewContainer>
                  )}
                  {stagedFiles.length > 0 && !showFilePreview && (
                    <FilePreviewContainer>
                      <FilePreviewInfo>{stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''} ready</FilePreviewInfo>
                      <CancelPreviewButton onClick={() => { setStagedFiles([]); setPreviewCaption(''); }}>&times;</CancelPreviewButton>
                    </FilePreviewContainer>
                  )}
                  {stagedGif && <FilePreviewContainer><FilePreviewImage src={stagedGif.preview} alt="GIF Preview" /><FilePreviewInfo>GIF</FilePreviewInfo><CancelPreviewButton onClick={() => setStagedGif(null)}>&times;</CancelPreviewButton></FilePreviewContainer>}
                  <InputContainer>
                    <div style={{ position: 'relative' }} ref={plusMenuRef}>
                      <PlusMenuButton
                        ref={plusButtonRef}
                        $isOpen={isPlusMenuOpen}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => setIsPlusMenuOpen(prev => !prev)}
                        disabled={!isConnected}
                        aria-label="Open actions menu"
                        title="Emoji, GIF, or File"
                      >
                        <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </PlusMenuButton>
                      <PlusMenu $isVisible={isPlusMenuOpen}>
                        <PlusMenuItem
                          ref={emojiButtonRef}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const inputWasFocused = Boolean(
                              messageInputRef.current && document.activeElement === messageInputRef.current
                            );
                            keyboardWasOpenBeforeEmojiRef.current = inputWasFocused;
                            if (inputWasFocused) {
                              messageInputRef.current.blur();
                            }
                            handleOpenEmojiPicker(rect);
                            setIsPlusMenuOpen(false);
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                          <span>Emoji</span>
                        </PlusMenuItem>
                        <PlusMenuItem
                          onPointerDown={(e) => {
                            e.preventDefault();
                            if (messageInputRef.current && document.activeElement === messageInputRef.current) {
                              keyboardWasOpenBeforeGifRef.current = true;
                              messageInputRef.current.blur();
                            } else {
                              keyboardWasOpenBeforeGifRef.current = false;
                            }
                            gifPickerOpenedAtRef.current = Date.now();
                            openGifPicker();
                            setIsPlusMenuOpen(false);
                          }}
                        >
                          <FilmIcon /> <span>GIF</span>
                        </PlusMenuItem>
                        <PlusMenuItem
                          onClick={() => {
                            notifyNativeFilePickerOpen();
                            fileInputRef.current?.click();
                            setIsPlusMenuOpen(false);
                          }}
                        >
                          <FileIcon /> <span>Send File</span>
                        </PlusMenuItem>
                      </PlusMenu>
                    </div>
                    <InputTextWrapper>
                      {(() => {
                        // Detect URL in current input — if found, render highlight overlay
                        CANDIDATE_URL_RE.lastIndex = 0;
                        const hasUrl = CANDIDATE_URL_RE.test(normalizedOverlayMessage);
                        CANDIDATE_URL_RE.lastIndex = 0;
                        return (
                          <>
                            {hasUrl && (
                              <InputHighlightOverlay ref={inputOverlayRef} aria-hidden="true">
                                {renderTextWithLinks(normalizedOverlayMessage, 'other')}
                              </InputHighlightOverlay>
                            )}
                            <MessageInput
                              $hasUrl={hasUrl}
                              ref={messageInputRef}
                              rows={1}
                              id="chat-message-input"
                              name="chatMessage"
                              disabled={!isConnected}
                              placeholder={!isConnected ? 'Connecting...' : editingMessageId ? 'Edit message...' : stagedFile || stagedGif ? 'Add a caption...' : 'Type your message...'}
                              value={inputMessage}
                              onChange={handleInputChange}
                              onKeyDown={handleInputKeyDown}
                              onPaste={handlePaste}
                              onScroll={syncInputOverlayScroll}
                              maxLength={MAX_MESSAGE_LENGTH}
                            />
                          </>
                        );
                      })()}
                    </InputTextWrapper>
                    {inputMessage.length >= MAX_MESSAGE_LENGTH - 200 && (
                      <CharacterCounter $warning={inputMessage.length >= MAX_MESSAGE_LENGTH - 20}>
                        {MAX_MESSAGE_LENGTH - inputMessage.length}
                      </CharacterCounter>
                    )}
                    <SendButton
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleSendMessage}
                      disabled={(!isConnected || (!inputMessage.trim() && !stagedFile && !stagedGif && stagedFiles.length === 0))}
                      title={editingMessageId ? 'Save edit' : 'Send message'}
                      aria-label={editingMessageId ? 'Save edit' : 'Send message'}
                      style={editingMessageId ? { background: 'linear-gradient(135deg, #6366f1, #4f46e5)' } : undefined}
                    >
                      {editingMessageId ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                      )}
                    </SendButton>
                    <input type="file" ref={fileInputRef} onClick={notifyNativeFilePickerOpen} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html" multiple />
                    <input type="file" ref={addFileInputRef} onClick={notifyNativeFilePickerOpen} onChange={async (e) => { markNativeFilePickerClosed(); if (e.target.files) { const newFiles = await Promise.all(Array.from(e.target.files).map(compressImage)); setStagedFiles(prev => [...prev, ...newFiles]); } if (e.target) e.target.value = ''; }} style={{ display: 'none' }} accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.html" multiple />
                  </InputContainer>
                  {/* Mobile emoji picker for typing.
                  Rendered here (inside the Footer's normal DOM flow) so the footer
                  grows to include the picker and the messages area shrinks to fit —
                  exactly like WhatsApp.  A fixed overlay would cover the input bar. */}
                  {isMobileView && emojiPickerPosition && (
                    <div ref={emojiPickerRef} style={{ width: '100%', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-primary)' }}>
                      <EmojiPicker
                        onEmojiClick={handleEmojiClick}
                        autoFocusSearch={false}
                        theme={isDark ? Theme.DARK : Theme.LIGHT}
                        emojiStyle={EmojiStyle.NATIVE}
                        width="100%"
                        height="42dvh"
                        lazyLoadEmojis={false}
                      />
                    </div>
                  )}
                </div>
              )}
            </Footer>
          </ChatWindow>
          <SidebarBackdrop $isVisible={isUserListVisible} onClick={() => setIsUserListVisible(false)} />
          <UserSidebar $isVisible={isUserListVisible}>
            <h2>Online ({onlineUsers.length})</h2>
            <UserList>
              {(() => {
                const currentUser = onlineUsers.find(user => user.userId === userIdRef.current);
                const otherUsers = onlineUsers.filter(user => user.userId !== userIdRef.current);
                const sortedUsers = currentUser ? [currentUser, ...otherUsers] : otherUsers;

                return sortedUsers.map((user, index) => (
                  <UserListItem key={user.userId} index={index}>
                    {user.username}{user.userId === userIdRef.current ? ' (You)' : ''}
                  </UserListItem>
                ));
              })()}
            </UserList>
            <ClearChatButton onClick={handleClearChat}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 9l-6-6H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z"></path><path d="M15 3v6h6"></path><path d="M9.5 12.5 14.5 17.5"></path><path d="m14.5 12.5-5 5"></path></svg>
              Clear Chat
            </ClearChatButton>
            <LogoutButton onClick={() => {
              localStorage.removeItem(getInputDraftKey(userIdRef.current));
              // Send explicit logout to server so it removes us from loggedInUsers
              if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'user_logout', userId: userIdRef.current, roomId }));
              }
              if (overlayGuardPushed.current) {
                clearOverlayGuardHistoryEntry();
                overlayGuardPushed.current = false;
              }
              userContext?.logout();
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Logout
            </LogoutButton>
          </UserSidebar>
        </LayoutContainer>
      </AppContainer>

      {isDeleteConfirmationVisible && (
        <ConfirmationModal>
          <ConfirmationContent>
            <h3>Delete {selectedMessages.length} message{selectedMessages.length > 1 ? 's' : ''}?</h3>
            <div>
              <ConfirmationButton className="cancel" onClick={() => setIsDeleteConfirmationVisible(false)}>Cancel</ConfirmationButton>
              <ConfirmationButton className="delete" onClick={handleBulkDeleteForMe}>Delete for me</ConfirmationButton>
              {canDeleteForEveryone && (
                <ConfirmationButton className="delete" onClick={handleBulkDeleteForEveryone}>Delete for everyone</ConfirmationButton>
              )}
            </div>
          </ConfirmationContent>
        </ConfirmationModal>
      )}

      {isDiscardConfirmationVisible && (
        <ConfirmationModal>
          <DiscardDialog onClick={(e) => e.stopPropagation()}>
            <DiscardTitle>Discard selection?</DiscardTitle>
            <DiscardActions>
              <DiscardBtnCancel onClick={() => setIsDiscardConfirmationVisible(false)}>Cancel</DiscardBtnCancel>
              <DiscardBtnConfirm onClick={() => {
                setIsDiscardConfirmationVisible(false);
                closeFilePreviewAndRestoreDraft();
              }}>Discard</DiscardBtnConfirm>
            </DiscardActions>
          </DiscardDialog>
        </ConfirmationModal>
      )}

      {isReportModalVisible && reportTargetMessage && (
        <ReportModal onClick={handleCloseReportModal}>
          <ReportDialog onClick={(e) => e.stopPropagation()}>
            <ReportTitle>Report user</ReportTitle>
            <ReportSubtext>
              Reported user: <strong>{reportTargetMessage.username}</strong>
            </ReportSubtext>
            <ReportMessageMeta>
              <strong>Reported message</strong>
              <span>
                {reportTargetMessage.text?.trim()
                  || (reportTargetMessage.type === 'image'
                    ? '[Image message]'
                    : reportTargetMessage.type === 'video'
                      ? '[Video message]'
                      : reportTargetMessage.type === 'file'
                        ? '[File attachment]'
                        : '[No text content]')}
              </span>
            </ReportMessageMeta>
            <ReportReasonInput
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Tell us why this user/message should be reviewed..."
              maxLength={MAX_REPORT_REASON_LENGTH}
              autoFocus={!('ontouchstart' in window || navigator.maxTouchPoints > 0)}
            />
            <ReportReasonMeta>
              <span>Minimum {MIN_REPORT_REASON_LENGTH} characters</span>
              <span>{reportReason.length}/{MAX_REPORT_REASON_LENGTH}</span>
            </ReportReasonMeta>
            {reportError && <ReportError>{reportError}</ReportError>}
            <ReportActions>
              <ConfirmationButton className="cancel" onClick={handleCloseReportModal} disabled={isSubmittingReport}>
                Cancel
              </ConfirmationButton>
              <ConfirmationButton className="delete" onClick={handleSubmitReport} disabled={isSubmittingReport}>
                {isSubmittingReport ? 'Submitting...' : 'Submit report'}
              </ConfirmationButton>
            </ReportActions>
          </ReportDialog>
        </ReportModal>
      )}

      {lightboxUrl && (
        <Lightbox onClick={closeLightbox}>
          <LightboxCloseButton
            type="button"
            aria-label="Close photo viewer"
            title="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            <svg viewBox="0 0 24 24">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </LightboxCloseButton>
          <LightboxFrame
            ref={lightboxFrameRef}
            $isZoomed={lightboxTransform.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001}
            onClick={(e) => e.stopPropagation()}
            onWheel={handleLightboxWheel}
            onPointerDown={handleLightboxPointerDown}
            onPointerMove={handleLightboxPointerMove}
            onPointerUp={handleLightboxPointerUp}
            onPointerCancel={handleLightboxPointerCancel}
          >
            <LightboxImage
              ref={lightboxImageRef}
              src={sanitizeMediaUrl(lightboxUrl)}
              alt="Photo viewer"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onLoad={handleLightboxImageLoad}
              $isZoomed={lightboxTransform.scale > PHOTO_LIGHTBOX_MIN_SCALE + 0.001}
              $isInteracting={isLightboxInteracting}
              style={{
                transform: `translate3d(${lightboxTransform.x}px, ${lightboxTransform.y}px, 0) scale(${lightboxTransform.scale})`
              }}
            />
            <LightboxToolbar
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <LightboxZoomButton
                type="button"
                title="Zoom out"
                aria-label="Zoom out"
                disabled={!canZoomOutLightbox}
                onClick={handleLightboxZoomOut}
              >
                <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </LightboxZoomButton>
              <LightboxZoomButton
                type="button"
                title="Zoom in"
                aria-label="Zoom in"
                disabled={!canZoomInLightbox}
                onClick={handleLightboxZoomIn}
              >
                <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </LightboxZoomButton>
            </LightboxToolbar>
          </LightboxFrame>
        </Lightbox>
      )}
      {showGifPicker && (
        <GifPickerModal onClick={() => {
          // Ignore clicks that arrive within 500 ms of opening — these are the phantom
          // synthetic click events that mobile browsers generate after a pointerdown,
          // which would otherwise close the picker immediately after it opens.
          if (Date.now() - gifPickerOpenedAtRef.current < 500) return;
          closeGifPicker();
        }}>
          <GifPickerContent ref={gifPickerRef} onClick={(e) => e.stopPropagation()}>
            <GifSearchBar ref={gifSearchInputRef} type="text" placeholder="Search for GIFs..." value={gifSearchTerm} onChange={(e) => setGifSearchTerm(e.target.value)} />
            {isLoadingGifs ? (
              <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>Loading GIFs...</p>
            ) : gifError ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: '#ef4444' }}>
                <svg style={{ width: '32px', height: '32px', marginBottom: '0.5rem', opacity: 0.8 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', lineHeight: '1.4' }}>
                  {gifError.includes('not configured') ? 'GIFs are not available right now.' : 'Could not load GIFs. Please check your connection.'}
                </p>
                <button
                  onClick={() => { setGifError(''); setGifResults([]); setGifFetchKey(k => k + 1); }}
                  style={{
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                    color: '#ef4444', borderRadius: '8px', padding: '0.4rem 1rem',
                    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                  }}
                >
                  Try again
                </button>
              </div>
            ) : gifResults.length === 0 && !isLoadingGifs ? (
              <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {gifSearchTerm.trim() ? `No GIFs found for "${gifSearchTerm}"` : 'No GIFs available.'}
              </p>
            ) : (
              <GifGrid>{gifResults.map(gif => <GifGridItem key={gif.id} src={gif.preview} onClick={() => handleGifSelect(gif)} />)}</GifGrid>
            )}
          </GifPickerContent>
        </GifPickerModal>
      )}
    </>
  );
}

export default Chat;
