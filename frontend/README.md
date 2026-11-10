# Pulse Chat: Frontend Client

The frontend client for **Pulse Chat**, engineered with React 18, TypeScript, Vite, Styled Components, and Progressive Web App (PWA) capabilities.

---

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/) (`vite.config.mts`)
- **Styling**: Styled Components (with full light/dark theme design token architecture)
- **Routing**: React Router v7
- **Virtualization**: `react-virtuoso` with sliding window memory management
- **PWA**: `vite-plugin-pwa` with service worker caching & offline support
- **Gestures**: `@use-gesture/react` for touch & swipe-to-reply interactions
- **Testing**: Vitest (`npm test`)

---

## Available Scripts

In the `frontend` directory, you can run:

### `npm run dev` or `npm start`
Starts the Vite local development server with hot module replacement (HMR) and network hosting enabled:
```bash
npm run dev     # or: npm start
```
Access the application at `http://localhost:3000`.

### `npm run build`
Compiles and bundles the production app into the `build/` directory with code-splitting, tree-shaking, and PWA service worker asset generation:
```bash
npm run build
```

### `npm test`
Runs the Vitest unit test suite in interactive watch mode:
```bash
npm test
```

### `npm run test:run`
Executes all unit tests once and exits (ideal for CI/CD pipelines):
```bash
npm run test:run
```

---

## Environment Variables

Configure these in `frontend/.env` (or via deployment environment settings):

| Variable | Description |
| --- | --- |
| `REACT_APP_API_URL` | Base URL of the backend API (HTTP/WebSocket) |
| `REACT_APP_ADMIN_SECRET` | Secret token used to authenticate frontend admin dashboard routes |

---

## Troubleshooting & Installation Notes

### 1. Interrupted Downloads & Native Binaries (`.node` format errors)
Vite 8 bundles with native Rolldown and LightningCSS binaries (`.node`). If an `npm install` process is canceled mid-flight, incomplete binaries may remain on disk, causing errors such as:
- `...\rolldown-binding.win32-x64-msvc.node is not a valid Win32 application`
- `Cannot find module '../lightningcss.win32-x64-msvc.node'`

**Fix:** Completely clear `node_modules` and re-run installation:
```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm run build
```

### 2. npm Audit & `--force` Warnings
- **Do not run `npm audit fix --force`**: It forces a major downgrade of `vite-plugin-pwa` to `v0.2.x`, which breaks the build and PWA service worker.
- The remaining low-severity notices in `deepmerge` are build-time dependencies (`workbox-build`) that are never bundled into the client runtime.

---

## Architectural Highlights

- **Domain-Modular Structure**: Decomposed into focused domains: `/chat`, `/admin`, `/rooms`, `/auth`, `/home`, and `/errors`.
- **Grouped Media Mosaic Albums**: WhatsApp and Telegram inspired dynamic multi-photo album grids (1 to 4+ tiles) with automatic layout calculations and `+N` overflow counters.
- **Interactive Lightbox Gallery & Zoom Engine**: Fullscreen multi-photo gallery viewer featuring thumbnail carousels, keyboard navigation, non-passive wheel zoom scaling without browser intervention warnings, dedicated desktop zoom toolbar buttons (+ / - / 1:1), rapid-click zoom stepping without unwanted double-click resets, and multi-touch pinch-to-zoom.
- **Granular Per-Media & Single-Media Actions**: Floating reaction pills placed precisely on the bottom-right corner of individual photos inside albums, auto-hiding while zoomed in, aggregated reaction banners with per-item breakdown tabs in modal popups, plus header quick actions (reply, react, download, delete) for single sent media and gallery viewer slides.
- **Media Gallery Delete Action**: Dedicated Delete button in the fullscreen viewer between download and close, allowing users to delete individual media items directly with full delete-for-me and delete-for-everyone permission checks and real-time carousel updates.
- **In-Browser Interactive Photo Cropper**: Non-destructive client-side image editor with 8 drag handles, rule-of-thirds grid, 90-degree rotations, and history management (undo, redo, reset) with keyboard shortcuts before uploading.
- **Album Quoting & Navigation**: Custom SVG album icon and item count previews in quoted message bubbles with instant scroll-to-original jump navigation.
- **Granular Quoted Media Preview & Navigation**: Quoting an individual photo or video inside a grouped album displays the exact thumbnail preview of that specific media, and clicking the quoted preview immediately opens that media item in the fullscreen gallery viewer in a paused video state.
- **Deep Historical Album Quote Loading**: Resolves quotes referencing older album slices outside active client memory by executing fast history jumps and switching directly to the quoted slide in the gallery viewer.
- **Session-Scoped "Deleted for Me" Guarding**: Intercepts quote clicks on media deleted for the active session, suppresses unwanted container jumping or element highlighting, and surfaces standard center-bottom status toast alerts (`This photo/video/GIF/voice message/file/message is deleted by you for your session.`).
- **Real-Time Quoted Preview Deletion Sync**: Instantly updates all quotes of deleted messages across the chat to standard deleted placeholders, suppressing thumbnails and duration badges.
- **Full-Width Bubble Link Previews**: Expands link preview cards horizontally to 100% of the message bubble width on large desktop screens.
- **Sliding Window Virtualization**: Handles tens of thousands of messages smoothly without memory bloat or UI stutter.
- **Intelligent Realtime Presence**: Granular activity tracking (typing, live audio recording with soundwaves, media upload progress with bouncing dots, and GIF selection) with upload presence protection and flicker-free caption typing.
- **Zero Layout Shift (CLS)**: Uses `ResizeObserver` on media bubbles and link previews to maintain stable scroll anchoring.
- **Cross-Theme Parity**: Complete visual parity across light and dark modes with dedicated design tokens in `index.css`.
- **Progressive Web App**: Fully installable standalone app on Android, iOS, Windows, and macOS.
