// patch_chat_phaseA.mjs — rewrites Chat.tsx after Phase A extractions
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const chatPath = join(root, 'frontend/src/Chat.tsx');

const src = readFileSync(chatPath, 'utf8');
const lines = src.split('\n');
const total = lines.length;
console.log(`Chat.tsx total lines before patch: ${total}`);

// Keep lines 1–36 (existing imports block) — indices 0..35
const importBlock = lines.slice(0, 36);

// New import lines for Phase A modules
const newImports = [
  `import {`,
  `  GlobalStyle,`,
  `  EmojiPickerWrapper, MobileEmojiPanel,`,
  `  DragDropOverlay, DragDropCard, DragDropIconWrapper, DragDropTitle, DragDropSubtitle,`,
  `  AppContainer, Header, HeaderTitle, SoundToggleButton, SoundToggleIcon,`,
  `  LayoutContainer, ChatWindow, MessagesContainer, MessagesAndScrollWrapper,`,
  `  MessageRow, Username, MobileReactionPicker, MessageBubble,`,
  `  EditPreviewContainer, EditPreviewIcon, EditPreviewText, EditPreviewDismiss,`,
  `  FooterContainer, Timestamp, Footer, InputContainer,`,
  `  PlusMenuButton, PlusMenu, PlusMenuItem,`,
  `  MessageInput, InputTextWrapper, InputHighlightOverlay, CharacterCounter, SendButton,`,
  `  FileAttachmentCard, FileAttachmentMeta, FileAttachmentName, FileAttachmentDetails,`,
  `  MediaContent, MediaDownloadOverlayBtn, MediaImageWrapper, MediaVideoWrapperDiv,`,
  `  MediaLoadGate, MediaLoadIcon, MediaLoadLabel, MediaLoadPreview, MediaSizeBadge,`,
  `  InlineDownloadBtn,`,
  `  FilePreviewModal, FilePreviewModalHeader, FilePreviewModalClose, FilePreviewModalFilename,`,
  `  FilePreviewModalBody, FilePreviewModalFooter, FilePreviewThumbStrip, FilePreviewThumb,`,
  `  FilePreviewAddBtn, FilePreviewRemoveBtn, FilePreviewCaptionInput, FilePreviewSendBtn,`,
  `  FilePreviewNoPreview, FilePreviewContainer, FilePreviewImage, FilePreviewInfo, CancelPreviewButton,`,
  `  ConfirmationButton, ReactionsContainer,`,
  `  Lightbox, LightboxCloseButton, LightboxFrame, LightboxImage, LightboxToolbar, LightboxZoomButton,`,
  `  DeleteMenu, DeleteMenuItem,`,
  `  UserSidebar, SidebarBackdrop, UserList, UserListItem, MobileUserListToggle, ThemeToggleBtn,`,
  `  ClearChatButton, LogoutButton,`,
  `  GifPickerModal, GifPickerContent, GifSearchBar, GifGrid, GifGridItem,`,
  `  BouncingDots, TypingIndicatorContainer,`,
  `  ReplyPreviewContainer, ReplyText,`,
  `  QuotedMessageContainer, QuotedMediaThumb,`,
  `  LinkPreviewCard, LinkPreviewImage, LinkPreviewBody, LinkPreviewSiteName, LinkPreviewTitle, LinkPreviewDesc,`,
  `  ReactionPicker, ReactionEmoji,`,
  `  ReactionsPopup,`,
  `  ReactionsPopupModal, ReactionsPopupContent, ReactionsPopupHeader, ReactionTab,`,
  `  ReactionsUserList, UserAvatar, ReactionUserRow, ReactionEmojiSpan, ReactionCountSpan,`,
  `  MessageActions, ActionButton, SelectCheckboxContainer, Checkbox,`,
  `  SelectModeFooter, DeleteButton, CopyButton, EditButton, ReportButton,`,
  `  ConfirmationModal, ConfirmationContent,`,
  `  ReportModal, ReportDialog, ReportTitle, ReportSubtext, ReportMessageMeta,`,
  `  ReportReasonInput, ReportReasonMeta, ReportError, ReportActions,`,
  `  VideoPlayerWrapper, CVPContainer, CVPControls, CVPTimelineWrapper, CVPTimelineTrack,`,
  `  CVPTimelineFill, CVPTimelineThumb, CVPBottomRow, CVPIconBtn, CVPTime, CVPSpeedBtn,`,
  `  CVPVolumeWrapper, CVPDoubleTapOverlay, CVPTapIndicator, CVPCenterPlayBtn,`,
  `  DownloadProgressRing, MessageText, SystemMessage,`,
  `  ScrollToBottomButton, NewMessagesBadge,`,
  `} from './chat/ChatStyledComponents';`,
  `import { VideoPlayer } from './chat/VideoPlayer';`,
  `import { MediaDisplay } from './chat/MediaDisplay';`,
  `import { renderMessageContent, detectFirstUrl } from './chat/renderMessage';`,
  `import { LinkPreview, linkPreviewCache, rememberLinkPreview } from './chat/LinkPreview';`,
  `import { MessageItem } from './chat/MessageItem';`,
  `import { TypingIndicator, FilmIcon, FileIcon } from './chat/TypingIndicator';`,
];

// Keep Chat() function: lines 4815–end = indices 4814..end
const chatFunction = lines.slice(4814);

const newLines = [
  ...importBlock,
  ...newImports,
  ``,
  ...chatFunction,
];

writeFileSync(chatPath, newLines.join('\n'), 'utf8');
console.log(`Chat.tsx rewritten. New line count: ${newLines.length}`);
