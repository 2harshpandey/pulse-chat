# Pulse Chat

Pulse Chat is a lightweight, real-time chat application designed for small teams and communities. This repository contains a full-stack implementation (React + TypeScript frontend, Node.js + Express backend, WebSocket real-time transport) with an admin monitoring panel, media uploads, and production-focused deployment workflows.

This README documents the project architecture, setup, environment variables, deployment, security considerations, and a progress log describing the improvements and bug fixes made during development.

--

## Table of Contents

- Project overview
- Technology stack
- Architecture and key components
- Quick start (dev)
- Production build & deploy
- Environment variables
- Security notes
- Admin panel
- UX & behavior details
- Testing & CI
- Troubleshooting
- Changelog (Session summaries)
- Contributing
- License

--

## Project overview

Pulse Chat is a real-time chat application that supports text, images, video, GIFs, reactions, message editing, delete-for-everyone, and an admin monitoring interface. The design emphasizes: reliability, predictable mobile UX, secure admin access, and clear operational deployment steps.

The repository is organized with a frontend React app (TypeScript) under `frontend/` and the backend Node/Express server under `backend/`.

## Technology stack

- Frontend: React (TypeScript), styled-components, react-scripts
- Real-time: WebSockets (`ws`) between clients and server
- Backend: Node.js, Express.js, Mongoose (MongoDB Atlas)
- Storage for uploads: Cloudinary
- CI/CD: GitHub Actions; frontend typically deployed to Netlify, backend to Azure App Service
- Other: dotenv for config, multer for upload handling

## Architecture and key components

- `frontend/` - React single-page app. Main entry is `src/index.tsx`, chat UI in `src/Chat.tsx`, and admin client under `src/Admin.tsx`.
- `backend/` - Express API and WebSocket server. Primary server code is `backend/index.js`. Persistent data models live in `backend/models/`.
- Realtime: The server keeps a WS feed for live updates consumed by the admin panel and clients.
- Media: Uploads are forwarded to Cloudinary and references (URLs) are stored in MongoDB.

## Quick start (development)

Prerequisites:

- Node.js 18+ (or current LTS)
- npm
- MongoDB Atlas connection string (or a local MongoDB)
- Cloudinary account credentials if enabling media uploads

Steps (frontend and backend in parallel)

1. Clone the repo and install dependencies:

```powershell
git clone https://github.com/<your-org>/pulse-chat-app.git
cd "Pulse Chat repo root"
```

2. Backend (in a terminal):

```powershell
cd backend
npm install
# create a .env with required variables (see below)
npm run dev
# or: node index.js
```

3. Frontend (in another terminal):

```powershell
cd frontend
npm install
npm start
```

The frontend dev server will proxy API requests to the backend if configured (see `REACT_APP_API_URL`).

## Production build & deploy

Build frontend:

```powershell
cd frontend
npm run build
```

Build/deploy backend according to your chosen host. This project uses GitHub Actions to push built artifacts and (for the backend) update Azure App Service app settings for production environment variables. See `.github/workflows/` for action definitions.

## Environment variables

The app relies on a few environment variables; do NOT commit `.env` files. Examples:

Backend `.env` (required in production):

- `PORT` (optional) — port for Express server
- `MONGODB_URI` — MongoDB connection string
- `CLIENT_PASSWORD` — client login password (moved to backend verification)
- `ADMIN_PASSWORD` — admin panel password (kept secret, not in front-end)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — if using Cloudinary
- `TENOR_API_KEY` — if GIF search is integrated

Frontend `.env` (only flags/URLs):

- `REACT_APP_API_URL` — optional API base url (defaults to same-origin)

Production deployment note: set these variables in Azure App Settings / Netlify environment settings or via GitHub Secrets used by the workflow.

## Security notes

- Secrets and passwords were removed from the frontend code. Admin authentication occurs via a secure backend `POST /api/auth/verify` endpoint and the admin WebSocket handshake uses an in-message handshake (not query parameters) to avoid leaking secrets.
- DO NOT commit `.env` files or secrets to Git.
- The repo includes a `.gitignore` entry for `frontend/old_chats/` (local notes) to prevent accidental push.

## Admin panel

The admin panel provides:

- Real-time message logs
- Live activity feed
- Server logs viewer
- Online user list

Admin access is password-protected. The admin client uses WebSockets to receive live updates; the server pushes events whenever messages or user-connection state change.

## UX & behavior details (notable implementations)

- Mobile-first UX improvements: careful handling of on-screen keyboard, `Enter` behavior set to insert new line on mobile, keyboard not minimized when tapping the “scroll-to-bottom” control.
- **2026-03-02 update:**
  - Emoji picker now opens and keyboard closes in a single tap on mobile, with no focus-jank or two-tap issues.
  - Keyboard minimization is now smooth on all keyboards except Gboard (which has a known Android bug outside app control).
  - Checkbox selection in select mode now works reliably on the first tap on mobile (no double-tap needed).
- Overlay/back-button behavior: mobile back button closes overlays in a strict hierarchy (delete modal → select mode → lightbox → user list) rather than exiting the app.
- Selection mode: synchronous guard push into history to avoid race conditions when enabling message-select mode.
- Copy behavior: the footer `Copy` action is mobile-only and appears only when exactly one message is selected; it hides when multiple messages are selected.
- Media interaction: tapping an image/video/GIF preview opens the lightbox/player without selecting the message; selecting a message still works when tapping the side-area or for plain text/quoted messages.

## Testing & CI

- The project uses a GitHub Actions workflow to build and deploy. Workflows include steps to push app settings to Azure when deploying the backend.
- Recommended: add a Playwright or Puppeteer test suite to assert mobile behaviors (keyboard, copy button visibility, double-click quoting behavior) where needed.

## Troubleshooting

- If the backend fails to start on Azure, check that all required env vars (notably `MONGODB_URI`) are present in App Settings.
- If the admin login fails in production, ensure `CLIENT_PASSWORD` and `ADMIN_PASSWORD` are set as production app settings / GitHub Secrets used by the workflow.

## Changelog / Project Progress (Session summaries)

This project progressed through multiple focused sessions. Brief highlights by session:

- Session 1: Security cleanup - removed hardcoded client/admin passwords, moved verification to backend.
- Session 2: Admin panel converted to real-time via WebSockets and bug fixes to live activity.
- Session 3: Integrated MongoDB Atlas and persisted messages and events.
- Session 4: Refinement for deployment readiness; removed unused features and improved environment abstraction.
- Session 5: Production stability - CI changes to avoid backend crash loops and persistent user identity fixes.
- Session 6: UX - added "Scroll to Bottom" button, fixed scroll-on-refresh, and build stability fixes.
- Session 7: Advanced mobile UX fixes - refined scroll button and resolved mobile reaction/select conflicts.
- Session 8: Final stability - fixed reaction-related crashes and polished mobile gestures.
- Session 9: Deployment and UX polishing; fixed Netlify/CI related issues.
- Session 10: Styling and build fixes; finalized system message styling and TypeScript issues.
- Session 11: Advanced UX: delete-for-everyone, hierarchical mobile back button behavior, presence debouncing.
  - Footer copy: mobile `Copy` action appears only when exactly one message selected.
  - Media preview taps: tapping image/video/GIF opens lightbox/player without selecting message; selection occurs from side-area taps or text taps.

- Session 12: Security & Production Polish.
  - Removed hardcoded passwords and secret leaks; moved auth fully backend-side (POST /api/auth/verify), admin WS auth via in-socket handshake; backend now fails fast if env vars are missing.
  - Chat UI polish (Chat.tsx): unified back-button handling, fixed select-mode/history race, added sidebar backdrop, stabilized scroll-to-bottom (no keyboard focus steal), limited double-click quoting to desktop, improved media-tap vs selection behavior, cleaned up mobile Copy + typing-indicator UX.
  - Backend/CI: cleaned secret logs, updated GitHub Actions to push Azure App Settings. Action: add prod secrets.

- Session 13: Mobile Keyboard & Emoji UX Polish.
  - Fixed emoji picker so that tapping the emoji button while the keyboard is open now closes the keyboard and opens the emoji picker in a single, smooth action (no more two-tap or focus-jank issues).
  - Improved keyboard minimization smoothness on all mobile keyboards by avoiding focus/blur fights and deferring menu-closing logic.
  - Checkbox selection in select mode now works reliably on the first tap on mobile (no double-tap needed).

- Session 13B: Multi-File Upload, WhatsApp-Style Preview Modal, and Robust File Handling
  - Added WhatsApp-style full-screen multi-file preview modal (horizontal thumbnails, caption input, send/cancel) — responsive on mobile/tablet/desktop, touch + mouse support.
  - Multi-file upload via drag-and-drop, paste, or picker; all files previewed pre-send with per-file error feedback for unsupported types/size.
  - Backend hardened: mimetype-based type detection, size/type limits, clear error responses surfaced to the UI.
  - Download UX improved: original filename & extension preserved (including cross-origin blobs); download button left-aligned for accessibility.
  - UI polish: modal, overlay, thumbnail strip styled for a professional, WhatsApp-like experience; accessibility & responsiveness validated.
  - Bug fixes: fixed non-image/video upload failures, resolved modal/chat layout overlaps, tightened error-path handling.
  - Business rules enforced: multi-file support + clear errors; downloads keep original names; all UI responsive & accessible.
  - Validation & commits: build-verified and tested across devices/browsers — only remaining minor Gboard top-bar stutter attributed to Gboard, not the app.
  ESC to unquote: pressing Esc now removes the quoted message.
  - Quoted-preview polish: quote-preview cross stays perfectly circular, slightly larger hit area; long quote text is responsively truncated with an ellipsis (no visual distortion) across all screen sizes (touch + non-touch).
    - Admin panel: Tables are now fully responsive. Message Log table uses horizontal scroll only when needed; Users table never scrolls horizontally and always fits on mobile.
    - Table word-break: Table cells now wrap only at word boundaries, never splitting words mid-character, for a cleaner look.
  - Scroll-to-bottom positioning: repositioned so it never overlaps send/other buttons — on desktop it's raised above the send button; on mobile it's placed just above the quoted-preview.
  - Menu/reaction toggles: clicking the same react icon or three-dots now toggles (closes) the menu instead of blinking.
  - Prevent quoting deleted messages on touch: blocked quoting of deleted messages on touchscreen devices (non-touch behavior unchanged).
  - Auto-scroll fixes: when quote-preview or a message menu would overlap the original message or be hidden by the textbox, chat auto-scrolls smoothly so the item’s end sits just above the preview/menu.
  - Unselectable deleted-text: in-place “You deleted this message.” text is now user-select: none.
  - Reaction bar dismiss: reaction bar closes when clicking anywhere outside it (blank canvas).
  - Cross-cutting: all changes are responsive, smooth, and tested on touch & non-touch devices; added small UI checks for these flows.

- Session 14: Security Hardening & Vulnerability Remediation.
  - Fixed all CodeQL/GitHub scan alerts: DOM-XSS in Chat.tsx (introduced `getBlobUrl` + `sanitizeMediaUrl` taint-breaking pattern with WeakMap cache), XSS in Chat.tsx and Admin.tsx, SSRF/URL-redirect, insecure randomness, and cleartext secret logging on the backend.
  - Added `express-rate-limit` to all admin and destructive backend routes (auth, message log, user list, clear chat, file upload).
    - resolve-url-loader v5
    - Replaced `resolve-url-loader@4` (bundled vulnerable `postcss@7.0.39`).  
    - Migrated to `v5.0.0` for PostCSS v8 compatibility.  
    - No webpack changes required; build clean, CVE resolved.
  - Resolved all high-severity npm audit vulnerabilities: upgraded `bfj` to `9.1.3` via package.json overrides, removing the transitive `jsonpath` ReDoS vulnerability.
  - Remaining 2 moderate vulnerabilities (`webpack-dev-server`) are dev/build-tool-only with no production exposure; not fixable without migrating away from Create React App.
  - Fixed backend rate limiter to handle IPv6 users correctly and prevent bypass (now uses ipKeyGenerator, Azure proxy port stripping still supported).
  - **Bug fixes:**
    - GIF button now works reliably on mobile devices (phantom click issue fixed).
    - Clear chat action now persists across page refreshes (per-user localStorage timestamp).
    - Duplicate usernames are now prevented in the chat room (server-side and client-side checks).
    - Copy button is now hidden for videos on all devices (PC and mobile).
    - Copying an image now copies the actual image to the clipboard (not just the URL), for both PC and mobile, using the Clipboard API.

## Contributing

1. Fork and clone.
2. Create a feature branch: `git checkout -b feat/your-thing`.
3. Run tests / linters.
4. Create a PR with a clear description of the change and relevant screenshots / reproduction steps.

## License

This project does not include an explicit license file in this repository. Add a suitable license (e.g., MIT) if you plan to open-source the project.

--

If you want, I can also:

- Add a short `Makefile` or `npm` scripts to streamline environment setup.
- Generate a `deployment.md` with step-by-step Azure + Netlify deployment instructions.
- Add Playwright tests for the three mobile behaviors we recently hardened.

Let me know which follow-up you'd like.
