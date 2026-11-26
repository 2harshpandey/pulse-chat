# Pulse Chat

> **A modern, production-grade real-time messaging application engineered for fast conversations, dynamic multi-room routing, rich media exchange, side panel media galleries, voice messaging, and responsive light/dark themes.**

<p align="center">
  <a href="https://pulsechat.tech">
    <img src="frontend/public/og-image.png" alt="Pulse Chat - Connect without limits. Chat reimagined." width="100%" />
  </a>
</p>

[![Live Site](https://img.shields.io/badge/Live-pulsechat.tech-2563eb?style=for-the-badge)](https://pulsechat.tech)
[![Version](https://img.shields.io/badge/Version-v3.2.0-10b981?style=for-the-badge)](#overview)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%20%2B%20Vite-61dafb?style=for-the-badge)](#technology-stack)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express%205-111827?style=for-the-badge)](#technology-stack)
[![Realtime](https://img.shields.io/badge/Realtime-Native%20WebSockets-7c3aed?style=for-the-badge)](#system-architecture)
[![Database](https://img.shields.io/badge/Database-MongoDB-10b981?style=for-the-badge)](#technology-stack)
[![PWA](https://img.shields.io/badge/PWA-Installable-purple?style=for-the-badge)](#core-capabilities)

---

## Table of Contents

- [Overview](#overview)
- [Live Application](#live-application)
- [Core Capabilities](#core-capabilities)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Project Structure](#project-structure)
- [Community & Governance](#community--governance)
- [License](#license)

---

## Overview

**Pulse Chat** is a scalable, real-time messaging platform built for high-performance communication. It combines persistent native WebSocket connections, Express 5 REST APIs, MongoDB persistence, Cloudinary media delivery, hardened link previews, and a domain-modular React 18 interface with full light and dark mode parity.

### Engineering Priorities

1. **Real-Time Reliability**: Sub-second reconnection, heartbeat keepalives, ordered message delivery, and session-aware recovery.
2. **Multi-Device Concurrency**: Bounded concurrent sessions (up to 5 active sessions per account) with cryptographically hashed session tokens, seamless cross-tab/cross-device message delivery, and remote logout synchronization.
3. **Multi-Room Isolation**: Namespace routing, custom aliases, dynamic password locks, temporary invite links, and sandboxed room moderation.
4. **Defense-in-Depth Security**: Centralized session authentication, async scrypt password verification, constant-time comparisons, SSRF DNS pre-resolution with private IP blocking, NoSQL query immunization with `$eq` casting, and cascade reply quote tombstoning.
5. **Fluid Performance**: Virtualized sliding-window rendering (`react-virtuoso`), on-demand media gating, and zero layout shift.
6. **Rich Media Intelligence**: Mosaic albums, fullscreen lightbox with zoom engines, in-browser photo cropping, acoustic audio waveforms, and side gallery explorers.
7. **Modular Micro-Architecture**: Decoupled, single-responsibility services across backend controllers (`sessionService`, `roomAccess`, `messageLifecycle`, `reportHandler`, `pinnedManager`) and frontend domain modules (`chat/utils/`, `chat/components/footer/`, `chat/styles/`, `wsMessageRouter`).

---

## Live Application

- **Production App:** [https://pulsechat.tech](https://pulsechat.tech)
- **About the Developer:** [https://pulsechat.tech/about-developer](https://pulsechat.tech/about-developer)
- **GitHub Repository:** [https://github.com/2harshpandey/pulse-chat](https://github.com/2harshpandey/pulse-chat)

---

## Core Capabilities

### 1. Real-Time Messaging & Multi-Device Concurrency
- **Native WebSockets**: Low-latency bidirectional messaging with heartbeat `ping`/`pong` checks and automatic reconnection.
- **Bounded Multi-Device Concurrency**: Users can seamlessly maintain up to 5 concurrent active sessions across different devices and browser tabs with independent cryptographically hashed tokens, without triggering premature force-logouts on valid sessions.
- **Virtualized Message Feed**: Powered by `react-virtuoso` with sliding-window memory management, rendering tens of thousands of messages without frame drops.
- **Granular Presence Engine**: Distinguishes standard typing (`typing`), live voice recording (`recording_audio`), media transfer (`sending_photo`, `sending_video`, `sending_file`), and GIF browsing (`gif_selecting`).
- **Quotes & Pin Navigation**: Header announcement banner for pinned messages with animated highlight sweeps, and instant jump navigation for deeply nested quotes.
- **Inline Editing & Complete Redaction**: Full edit support with `(edited)` badges, plus delete-for-everyone and session-scoped local delete flows. Reply quote previews are completely sanitized via `$unset` tombstoning (`replyingTo.text` and `replyingTo.url`), preventing phantom quote leaks across the room.

### 2. Side Panel Media Viewer
- **Segmented View Switcher**: High-contrast, theme-aware toggle in the sidebar between active online users and room media.
- **Mutually Exclusive Filters**: Category tabs for **Photos**, **Videos**, **Docs**, and **Links** (supporting both `http(s)://` and `www.` prefixed URLs) with smooth horizontal mouse-wheel scrolling on desktop.
- **Infinite Cursor Pagination**: Efficient reverse-chronological cursor paging with real-time sync for deletions, room clears, and new messages.
- **Direct Proxy Downloads**: Document attachments trigger secure backend proxy downloads (`preferProxy: true`), preventing cross-origin token leakage.

### 3. Mosaic Albums & Fullscreen Gallery
- **Dynamic Mosaic Albums**: Consecutive photos and videos from the same user merge automatically into responsive 1-to-4+ tile albums with `+N` overflow counters.
- **Interactive Lightbox Modal**: Touch pinch-to-zoom, rapid double-tap zoom/restore, mouse double-click, and dedicated desktop zoom controls (`+`, `-`, `1:1`) with pointer capture preventing stuck cursor tracking during image panning.
- **Playback Continuity**: Seamless transition from streaming video to cached blobs without resetting playback position to 0:00.
- **In-Browser Photo Cropper**: Client-side image editor with 8 drag handles, rule-of-thirds grid, 90-degree rotations, and `Ctrl+Z`/`Ctrl+Y` undo/redo history.
- **Granular Reactions**: Floating reaction badges on individual photos within albums, aggregated summary pills, and reaction breakdown sheets.
- **Single-Click ZIP Downloads**: Export entire albums or selections into compressed `.zip` archives with live progress, retry resilience, and instant cancel affordances.

### 4. Voice Messaging & Audio Engine
- **One-Tap Voice Recording**: Interactive microphone recorder with live timer, animated soundwaves, pre-send audio preview, and instant cancel/send workflows.
- **36-Bar Acoustic Waveforms**: Interactive SVG waveform visualization with drag scrubbing, seek navigation, and played/unplayed color differentiation.
- **Playback Controls & Safari Fallback**: Quick-cycle speed controls (`1x` → `1.5x` → `2x`), global coordinator preventing overlapping streams, and automatic MP3 fallback streaming for iOS Safari that preserves playback position across play/pause toggles.

### 5. Multi-Room Routing & Discovery
- **Public & Private Rooms**: Instant custom room creation with optional join passwords. Adding a password dynamically transitions a public room to private.
- **Temporary Access Links**: Shareable `/join/:token` invite links with room parameter validation, enabling smooth guest onboarding and authenticated room transitions.
- **Discovery Dashboard**: Search, filter, and browse public rooms with live participant counts and metadata telemetry.
- **Protected `/me` Namespace**: Dedicated default chat space and personal isolation mode with an adaptive ID copy widget.

### 6. Link Intelligence & Security
- **Smart Link Previews**: Auto-detects bare links without protocol prefixes, generating rich Open Graph preview cards with high-res favicon scrapers.
- **Server-Side SSRF Protection**: Validates URLs, resolves DNS before connection, restricts ports (80/443), and blocks private/loopback IP ranges.
- **Defense-in-Depth Hardening**: Centralized session validation (`sessionService.js`), NoSQL injection prevention with `$eq` casting, ReDoS sanitization, and allowlisting for direct and signed Cloudinary downloads (`res.cloudinary.com` and `api.cloudinary.com`).

### 7. Moderation & Administrative Suite
- **Protected Dashboard**: Telemetry console with real-time WebSocket event streams and one-click log clipboard exports.
- **Operational Controls**: User blocking with device fingerprinting, session force-logouts, login lockdown modes, room alias management, and temporary access link generation.
- **Audit Logging**: Paginated administrative message history with persistent cursor states that stay stable across message pinning and unpinning actions.

---

## System Architecture

```mermaid
flowchart TB
  subgraph Frontend["Frontend Client (React 18 + Vite PWA)"]
    ChatFeed["Message Feed & Virtuoso Virtualizer"]
    Composer["Composer, Shortcuts & Audio Engine"]
    SideGallery["Side Media Viewer & Lightbox Gallery"]
    WSRouter["wsMessageRouter & State Hooks"]
  end

  subgraph Backend["Backend Server (Express 5 + Native WebSockets)"]
    WSServer["WebSocket Coordinator & Handlers"]
    SessionSvc["Session Service (Multi-Device Bounded Sessions)"]
    RoomAccess["Room Access & Message Query Engine"]
    MsgLifecycle["Message Lifecycle Router"]
    REST["Modular REST Endpoints (Media, Previews, Rooms, Admin)"]
  end

  subgraph External["Persistence & Cloud Services"]
    Mongo[(MongoDB)]
    Cloudinary[Cloudinary Media CDN]
    Giphy[Giphy API]
  end

  WSRouter <-->|Bidirectional Native WebSockets| WSServer
  ChatFeed -->|REST API Requests| REST
  Composer -->|Media Uploads & Previews| REST
  WSServer --> SessionSvc
  WSServer --> RoomAccess
  REST --> SessionSvc
  REST --> RoomAccess
  REST --> MsgLifecycle
  SessionSvc --> Mongo
  RoomAccess --> Mongo
  MsgLifecycle --> Mongo
  REST --> Cloudinary
  REST --> Giphy
```

---

## Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 18, TypeScript, Vite, Styled Components, React Router v7, React Virtuoso, `@use-gesture/react`, Vite PWA |
| **Backend** | Node.js (>=20), Express 5, Native WebSockets (`ws`), Mongoose, Multer, Winston, Axios |
| **Database** | MongoDB (Atlas or Local Community Server), IndexedDB media cache |
| **Media & CDN** | Cloudinary (multipart chunked uploads, transformation pipelines), JSZip |
| **GIF Search** | Giphy API |
| **Tooling & Tests**| Vitest, Testing Library, PostCSS, npm |

---

## Quick Start

### Prerequisites
- **Node.js** (v20.x or later) & **npm** (v9.x or later)
- **MongoDB** instance (local or free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster)
- Free **Cloudinary** account (for media storage)
- Free **Giphy API Key** (optional, for GIF picker)

### 1. Clone the Repository
```bash
git clone https://github.com/2harshpandey/pulse-chat.git
cd pulse-chat
```

### 2. Backend Setup
```bash
cd backend
npm install
Copy-Item .env.example .env    # On Linux/macOS: cp .env.example .env
npm run dev
```
*The backend server will listen at `http://localhost:8080` (WebSocket on `ws://localhost:8080`).*

### 3. Frontend Setup
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
*The client application will start at `http://localhost:3000`.*

> [!TIP]
> For platform-specific setup details (such as Windows PowerShell policies or dependency peer-resolutions), see the detailed guides in [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

---

## Environment Configuration

### Backend (`backend/.env`)
| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | **Yes** | MongoDB connection string (Atlas URI or local `mongodb://localhost:27017/pulsechat`) |
| `ADMIN_PASSWORD` | **Yes** | Master password for admin dashboard authentication |
| `CLIENT_PASSWORD` | **Yes** | Password required for standard chat room login |
| `ADMIN_SECRET` | **Yes** | Secret header token used to authorize protected admin REST routes |
| `SESSION_SECRET` | Optional | Custom session signing key for HMAC tokens (auto-derived from `ADMIN_SECRET` if omitted) |
| `PORT` | Optional | HTTP and WebSocket server port (defaults to `8080`) |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS allowed origins (e.g. `http://localhost:3000`) |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | Cloudinary cloud name for media hosting |
| `CLOUDINARY_API_KEY` | **Yes** | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | **Yes** | Cloudinary API secret |
| `GIPHY_API_KEY` | Optional | GIPHY API key for animated GIF search |

### Frontend (`frontend/.env`)
| Variable | Required | Description |
| --- | --- | --- |
| `REACT_APP_API_URL` | Optional | Backend API base URL (defaults to `http://localhost:8080`) |
| `REACT_APP_ADMIN_SECRET` | Optional | Secret token for frontend admin route authorization |

---

## Project Structure

```text
.
├── backend/
│   ├── index.js                  # Express & HTTP server bootstrap & route mounting
│   ├── websocket.js              # Native WebSocket connection coordinator
│   ├── sessionService.js         # Centralized session hydration, validation & multi-device concurrency
│   ├── roomAccess.js             # Room access authorization, visible queries & reply tombstoning
│   ├── db.js                     # MongoDB connection handling
│   ├── logger.js                 # Winston IST logging
│   ├── middleware.js             # Rate limiters, security guards, CORS
│   ├── security.js               # SSRF checks, URL validators, filename sanitizers, Cloudinary deletion
│   ├── state.js                  # Active rooms & in-memory connection registry
│   ├── models/                   # Mongoose schemas (Message, Room, User, AuditLog)
│   ├── routes/                   # Modular REST endpoints (media, messageLifecycle, messages, download, linkPreview, gifs, rooms, auth, admin)
│   └── websocket/                # Socket handlers (messageHandler, presenceHandler, reportHandler, pinnedManager, adminHandler)
├── frontend/
│   ├── src/
│   │   ├── admin/                # Admin tabs, logs viewer, security controls, hooks
│   │   ├── auth/                 # Authentication forms & login controllers
│   │   ├── chat/                 # Message feed, media viewer, composer, audio recorder
│   │   │   ├── components/       # SideMediaGallery, MessagesList, ChatFooter, Lightbox
│   │   │   │   ├── footer/       # SelectModeFooterBar, ReplyEditPreviewBanner, VoiceRecordingBar
│   │   │   │   ├── message/      # AudioMessagePlayer, MediaGroupItem, MediaOverlayPrimitives
│   │   │   │   └── modals/       # MediaGalleryModal, ReactionsPopup, DeleteModal
│   │   │   ├── hooks/            # useChatWebSocket, wsMessageRouter, useChatMessages, chatWindowHelper, useChatComposer, useComposerShortcuts
│   │   │   ├── styles/           # chat.message.styles, chat.audio.styles, chat.sideGallery.styles, Chat.styles
│   │   │   ├── utils/            # Domain utils: urlMediaUtils, audioDuration, overlayHistoryGuard, clipboardUtils, messageHelpers, downloadUtils, urlLinkUtils
│   │   │   └── utils.tsx         # Backward-compatible barrel re-export
│   │   ├── rooms/                # Room explorer, join/create modals, room controllers
│   │   ├── errors/               # Themed HTTP error views (403, 404, 500)
│   │   ├── home/                 # Landing page & feature showcase
│   │   ├── App.tsx               # Root application router
│   │   └── index.css             # Light & Dark mode design system tokens
│   ├── public/                   # PWA manifests, icons, service worker assets
│   └── vite.config.mts           # Vite 8 bundling & PWA configuration
├── CONTRIBUTING.md               # Contribution guidelines & Git workflows
├── SECURITY.md                   # Security policy & vulnerability reporting
├── CODE_OF_CONDUCT.md           # Contributor Covenant standard
├── CONTRIBUTORS.md               # Project contributors recognition
└── LICENSE                       # MIT License
```

---

## Community & Governance

- **[Contributing Guide](CONTRIBUTING.md)**: Development setup, commit standards, and pull request guidelines.
- **[Security Policy](SECURITY.md)**: Vulnerability disclosure channels, response timelines, and safeguards.
- **[Code of Conduct](CODE_OF_CONDUCT.md)**: Contributor Covenant community pledge and enforcement rules.
- **[Contributors](CONTRIBUTORS.md)**: Project creators and community recognition.

---

## License

This project is open-source and licensed under the **[MIT License](LICENSE)**.

Copyright &copy; 2026 Harsh Pandey. See [LICENSE](LICENSE) for full details.
