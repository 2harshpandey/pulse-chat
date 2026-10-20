/**
 * Barrel re-export file for chat styled components.
 * Modularized into focused sub-modules under ./styles/ for performance,
 * maintainability, and clean separation of concerns:
 * - chat.animations: Keyframes & GlobalStyle
 * - chat.layout.styles: Layout, header, input, and selection controls
 * - chat.media.styles: Media cards, load gates, file preview, and lightbox
 * - chat.message.styles: Sidebar, gifs, typing indicators, reactions, report modal
 * - chat.video.styles: Custom Video Player (CVP) and download progress ring
 * - chat.ui.styles: Text, badges, system messages, and discard dialogs
 */

export * from './styles/chat.animations';
export * from './styles/chat.layout.styles';
export * from './styles/chat.media.styles';
export * from './styles/chat.message.styles';
export * from './styles/chat.video.styles';
export * from './styles/chat.ui.styles';
