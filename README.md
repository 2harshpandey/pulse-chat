Pulse Chat — Real-time scalable web messaging application
Live: https://pulsechat.tech
Pulse Chat is a production-grade, real-time scalable web messaging application engineered for high fidelity conversations, rich media exchange, and robust moderation. It combines instant WebSocket messaging with carefully secured REST services and a premium, responsive UI designed for both desktop and mobile.
________________________________________
✅ Real-time scalable web messaging application — Core Capabilities
•	Real-time multi-user chat powered by persistent WebSocket connections with heartbeat ping/pong for reliability.
•	Instant join/leave system notifications that announce arrivals and departures to all participants.
•	Unique username enforcement across HTTP and WebSocket layers to prevent duplicates and stale sessions.
•	Session-aware reconnect handling to avoid false leave notifications on refreshes.
•	Persistent user identity with cryptographically strong client-generated user IDs stored locally.
•	Server side user tracking with last seen and join history for moderation insights.
•	Initial history window delivered on connect, then paginated infinite scroll for deeper history.
•	Chronological ordering preserved with oldest first delivery and safe prepend on history loads.
•	Virtualized message list for smooth performance even with large histories.
•	Adaptive overscan and viewport tuning for desktop vs. mobile scroll efficiency.
•	Quote jump navigation with highlight animation and intelligent auto loading to reach quoted messages.
________________________________________
✅ Real-time scalable web messaging application — Messaging UX
•	Reply / quote system with preview bar, sender context, and clickable quoted blocks.
•	Quoted media thumbnails with smart Cloudinary transformations for low latency previews.
•	Inline editing with edit state, history logging, and live updates to all clients.
•	Delete for everyone with content redaction and event logging.
•	Local delete / remove flow for uploaded media when applicable.
•	Message action toolbar with contextual actions on hover/touch.
•	Selection mode with checkbox UI for multi message actions.
•	Bulk actions including delete, copy, edit, and report where relevant.
•	Typing indicators with animated dots and live activity states.
•	GIF selecting presence distinct from typing activity.
________________________________________
✅ Real-time scalable web messaging application — Reactions & Engagement
•	Message reactions with emoji palette, quick tap selection, and animated pills.
•	One reaction per user enforcement with toggle and replace behavior.
•	Reactions popup with tabs per emoji, counts, and an “All” view.
•	Self reaction removal directly from the popup list.
•	Reactions persistence in the database with safe Map serialization to clients.
________________________________________
✅ Real-time scalable web messaging application — Media & File Power
•	Full media pipeline with support for images, videos, and generic files.
•	Cloudinary backed uploads via secure multi part handling and file metadata preservation.
•	Upload size enforcement with clear error messaging (100 MB max).
•	Drag and drop uploads with full screen overlay and animated affordances.
•	WhatsApp style file preview modal with:
o	Multi file carousel preview
o	Add/remove attachments
o	Caption input per send batch
o	Thumbnail strip navigation
•	Inline media rendering with consistent frame sizing to prevent scroll jitter.
•	Image lightbox with zoom controls, wheel scaling, and polished overlay.
•	Custom video player featuring:
o	Play/pause, timeline scrub, and duration display
o	Playback speed cycling
o	Fullscreen mode with layout reflow
o	Picture in Picture support
o	Loop toggle
o	Mute + volume slider (mouse only panel)
o	Double tap seek shortcuts
o	Auto hide controls
•	Media download overlay for images/videos with hover only visibility.
•	Download progress ring with cancel capability and transfer feedback.
•	Secure downloads through allowlisted hosts and a hardened proxy fallback.
•	IndexedDB media cache keyed by user/message/source for fast reloads.
•	Safe media URL sanitation to block unsafe protocols and prevent XSS.
________________________________________
✅ Real-time scalable web messaging application — Link Intelligence
•	Automatic link preview cards with site name, title, description, and image.
•	Preview caching to reduce redundant fetches and improve performance.
•	SSRF hardened metadata fetcher with:
o	DNS resolution checks
o	Private/internal IP blocks
o	Port restrictions
o	Redirect limits
o	Size capped HTML reads
________________________________________
✅ Real-time scalable web messaging application — Security & Privacy
•	Multi layer rate limiting for auth, uploads, API endpoints, and admin routes.
•	Strict input validation for usernames, tokens, and report reasons.
•	Device fingerprinting (screen, platform, language, timezone, UA) for robust blocking.
•	User/IP/Device block enforcement across HTTP and WebSocket pathways.
•	Login lockdown mode with timed or indefinite enforcement.
•	Download proxy hardening with:
o	Host allowlisting
o	Redirect safety checks
o	Private IP resolution blocks
o	Sanitized filenames
•	Safe URL sanitizer preventing javascript: or data: attacks.
________________________________________
✅ Real-time scalable web messaging application — Moderation & Admin Control
•	Dedicated admin dashboard with password protection.
•	Live admin WebSocket channel for instant updates and telemetry.
•	User management with online list, logged in sessions, and status tracking.
•	Force logout for a specific user or all users.
•	User blocking & unblocking with fingerprint merging.
•	Temporary invite links:
o	Time boxed creation
o	Revocation
o	Usage tracking
o	Copy to clipboard UI
•	Login lockdown controls with preset or custom durations.
•	Message history log showing edits, deletions, uploads, and create events.
•	Audit log stream with categorized events and timestamps.
•	User report intake with full context: message snapshot, session data, join history, and metadata.
•	Server log tailing with live refresh and WebSocket pushes.
•	Permanent history purge and frontend only hide controls for compliance workflows.
________________________________________
✅ Real-time scalable web messaging application — UX & Visual Polish
•	Theme toggle with persisted preference and system theme default.
•	Animated UI layers (glow, shimmer, floating orbs, premium transitions).
•	Adaptive mobile layouts with touch optimized controls.
•	Keyboard aware login UX for mobile viewport shifts.
•	Custom scrollbars and stable layout behavior for long lists.
•	Error boundaries & themed error pages for 403/404/408/429/500/503 flows.
________________________________________
High Level Architecture (Real-time scalable web messaging application)
•	Client Application
o	React + TypeScript UI
o	Styled Components system for themeable design
o	WebSocket for real time chat
o	REST for auth, uploads, previews, GIFs, and admin
•	Server Application
o	Express HTTP API + WebSocket server
o	MongoDB persistence for users, messages, events, reports, and state
o	Cloudinary storage for media
o	Tenor API for GIF discovery
•	Data Flow
o	WebSocket for live message stream
o	REST for auth, uploads, moderation, and previews
o	Audit events written to persistent history
________________________________________
Tech Stack
•	Frontend: React 18, TypeScript, Vite, Styled Components, React Router, React Virtuoso, Emoji Picker, @use gesture
•	Backend: Node.js, Express, WebSocket (ws), MongoDB (Mongoose), Cloudinary, Multer, Axios, Winston
•	Services: Tenor GIF API, Cloudinary media CDN
________________________________________
Setup Instructions
1) Environment Variables
Server
•	MONGODB_URI
•	ADMIN_PASSWORD
•	CLIENT_PASSWORD
•	ADMIN_SECRET
•	CLOUDINARY_CLOUD_NAME
•	CLOUDINARY_API_KEY
•	CLOUDINARY_API_SECRET
•	TENOR_API_KEY
Client
•	REACT_APP_API_URL
•	REACT_APP_ADMIN_SECRET
________________________________________
2) Install & Run (Development)
Server
npm install
npm run dev

Client
npm install
npm run start

3) Build (Production)
npm run build

License
All rights reserved.