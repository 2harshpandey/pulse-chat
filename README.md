# Pulse Chat

> **A production-grade, real-time, scalable web messaging application engineered for high-fidelity conversations, dynamic multi-room routing, rich media exchange, secure moderation, and a premium responsive user experience.**

[![Live Site](https://img.shields.io/badge/Live-pulsechat.tech-2563eb?style=for-the-badge)](https://pulsechat.tech)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-61dafb?style=for-the-badge)](#technology-stack)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-111827?style=for-the-badge)](#technology-stack)
[![Realtime](https://img.shields.io/badge/Realtime-WebSocket-7c3aed?style=for-the-badge)](#realtime-architecture)
[![Database](https://img.shields.io/badge/Database-MongoDB-10b981?style=for-the-badge)](#technology-stack)

---

## Table of Contents

- [Overview](#overview)
- [Live Application](#live-application)
- [Core Capabilities](#core-capabilities)
- [Multi-Room Architecture](#multi-room-architecture)
- [Messaging Experience](#messaging-experience)
- [Reactions and Engagement](#reactions-and-engagement)
- [Media and File Pipeline](#media-and-file-pipeline)
- [Security and Privacy](#security-and-privacy)
- [Moderation and Administration](#moderation-and-administration)
- [User Experience and Visual Design](#user-experience-and-visual-design)
- [Realtime Architecture](#realtime-architecture)
- [Technology Stack](#technology-stack)
- [Local Development](#local-development)

---

## Overview

**Pulse Chat** is a real-time scalable web messaging platform built for fast, reliable, and expressive digital communication. It combines persistent WebSocket messaging, secure REST services, MongoDB-backed persistence, Cloudinary-powered media delivery, hardened link preview handling, and a refined React interface optimized for desktop and mobile interaction.

The application is designed around five engineering priorities:

1. **Realtime reliability** — persistent WebSocket communication, heartbeat health checks, reconnection awareness, and ordered history delivery.
2. **Multi-room isolation** — dynamic routing, private aliases, distinct moderation boundaries, and secure joining mechanisms.
3. **Security-first interaction** — strict validation, ReDoS/NoSQL injection prevention, rate limiting, URL sanitation, and robust device fingerprinting.
4. **High-performance UI** — virtualized rendering, adaptive overscan, optimized media previews, lock-solid scrolling mechanics, and premium micro-interactions.
5. **Operational control** — admin telemetry, live audit streams, blocking workflows, invite controls, report intake, and message event history.

---

## Live Application

- **Production URL:** [https://pulsechat.tech](https://pulsechat.tech)
- **About the Developer:** [https://pulsechat.tech/about-developer](https://pulsechat.tech/about-developer)
- **Repository:** [https://github.com/2harshpandey/pulse-chat](https://github.com/2harshpandey/pulse-chat)

---

## Core Capabilities

Pulse Chat includes a complete real-time messaging foundation suitable for high-concurrency conversational workflows.

- Persistent multi-user WebSocket messaging with heartbeat `ping` / `pong` reliability checks.
- Instant join and leave system notifications broadcast to active participants.
- Session-aware reconnect handling to prevent false leave events during page refreshes.
- Persistent client identity using cryptographically strong locally stored user identifiers.
- Server-side user tracking with join history, last-seen metadata, and moderation context.
- Chronological message ordering with oldest-first delivery and safe prepend behavior during history loads.
- Virtualized message rendering for smooth performance across large histories.
- Adaptive overscan and viewport tuning for desktop and mobile scrolling performance.
- Quote-jump navigation with automatic loading and highlight animation for referenced messages.

---

## Multi-Room Architecture

Pulse Chat supports distinct, securely isolated rooms, allowing vast communities to thrive in parallel.

- **Dynamic Room Creation**: Users can spin up custom rooms instantly with custom names, descriptions, and privacy settings.
- **Aliases & Namespaces**: Support for human-readable aliases (e.g., `/my-cool-room`). Also features the protected `/me` namespace for the global default chat and personal isolation.
- **Public Room Discovery**: A rich dashboard allowing users to search, browse, and filter active public rooms with live telemetry (e.g., active user counts).
- **Private Rooms**: Securely locked behind dynamic "Join Passwords". Adding a password to a public room implicitly transitions it to a private room.
- **Room-specific Moderation**: Admin credentials and dashboards are sandboxed per room, allowing distributed community moderation.

---

## Messaging Experience

The messaging layer is built to support modern conversation patterns while preserving performance and consistency.

- **Inline Message Editing**: Full edit support with `(edited)` state tracking, event logging, and live propagation to all connected clients.
- Reply and quote system with preview bar, sender context, and clickable quoted message blocks.
- Quoted media thumbnails optimized through Cloudinary transformations for low-latency previews.
- Contextual message action toolbar optimized for hover and touch interaction.
- Selection mode with checkbox interface for multi-message workflows.
- Bulk actions including delete, copy, edit, and report where relevant.
- Typing indicators with animated dots and live activity state propagation.
- GIF-selection presence distinct from normal typing activity.

---

## Reactions and Engagement

Pulse Chat provides lightweight engagement tools designed for clarity and real-time consistency.

- **Emoji Reactions**: A beautifully animated, sliding bottom-sheet emoji picker optimized for touch, ensuring reactions can be added quickly without disrupting flow.
- One reaction per user enforcement with toggle and replace behavior.
- Reaction detail popup with per-emoji tabs, reaction counts, and aggregate "All" view.
- Persistent reactions stored securely in the database with safe map serialization for client delivery.

---

## Media and File Pipeline

The media layer supports rich file exchange while applying strict safety and performance controls.

### Upload and preview features
- Cloudinary-backed uploads through secure multipart handling.
- **Tiered Upload Limits**: 
  - Raw/General Files: Max **10 MB**.
  - High-res Media (Photos/Videos): Max **100 MB**.
  - Clear, distinct UI error messaging seamlessly integrated into the chat feed for limit violations.
- Drag-and-drop uploads with full-screen overlay and animated affordance.
- WhatsApp-style file preview modal with carousel preview, attachment controls, caption input, and thumbnail strips.
- Inline media rendering with consistent frame sizing and intelligent constraints to prevent scroll jitter or horizontal stretching.

### Custom video player
- Purpose-built video playback interface with: Play/pause, timeline scrubber, duration display, playback speed cycling, Fullscreen/PiP, loop toggle, and double-tap seek shortcuts.

### Link Intelligence
- Automatic link preview cards with site name, title, description, and image extraction.
- Server-side metadata fetching with SSRF hardening (DNS checks, internal IP blocking, size-capped reads).

---

## Security and Privacy

Security is treated as a primary system requirement, validated by strict scanning pipelines (e.g., GitHub CodeQL).

### Application safeguards
- **Query Injection Prevention**: Complete immunization against NoSQL injections by strictly casting query parameters (e.g., `roomId`) and leveraging `$eq` MongoDB operators.
- **ReDoS Prevention**: Escaped and sanitized regex workflows using strict `escapeRegExp` helpers, preventing Denial of Service attacks on search endpoints.
- Multi-layer rate limiting for authentication, uploads, API endpoints, and admin routes.
- Device fingerprinting using screen, platform, language, timezone, and user-agent context.
- Login lockdown mode with timed or indefinite enforcement.

---

## Moderation and Administration

Pulse Chat includes a dedicated administrative control plane for live moderation and operational visibility.

- Password-protected admin dashboard (with per-room scoping).
- Live admin WebSocket channel for instant telemetry updates.
- Online user list with session and status tracking.
- Force logout for individual users or all active users.
- User blocking and unblocking with fingerprint merging.
- **Room Settings Management**: Change aliases, descriptions, and convert rooms between Public/Private dynamically via the dashboard.
- Temporary invite link management (time-boxed invite creation, revocation, usage tracking).
- Login lockdown controls with preset and custom durations.
- Categorized audit event stream and Server log tailing with live refresh.

---

## User Experience and Visual Design

The interface is designed to feel premium, responsive, and stable under heavy interaction.

- **Lock-Solid Scrolling**: Highly optimized scrolling mechanics, eliminating "nested scrollbar" bugs and utilizing `overflow-x: clip`. Native `scrollRestoration` is handled manually to prevent layout shifting on load.
- Theme toggle with persisted preference and system-theme default.
- Contextual notification sound system providing audio cues (intelligently gated to prevent audio fatigue).
- Animated UI layers including glow, shimmer, floating orbs, smooth transitions, and premium informational callout boxes.
- Custom scrollbars and stable long-list behavior, ensuring `min-height: 100vh` fills the exact viewport properly on all devices.
- Error boundary protection to prevent full-page application failure.

---

## Realtime Architecture

Pulse Chat uses a hybrid communication model:

| Channel | Purpose |
| --- | --- |
| WebSocket | Live messages, typing state, GIF selection presence, reactions, moderation telemetry, and system events. |
| REST API | Authentication, uploads, link previews, GIF discovery, admin workflows, reports, and operational actions. |
| MongoDB | Persistent storage for users, messages, events, reports, moderation state, and chat state. |
| Cloudinary | Media upload storage, delivery, and transformation-backed previews. |
| Tenor API | GIF search and discovery. |

---

## Technology Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Styled Components, React Router, React Virtuoso, Emoji Picker, `@use-gesture/react` |
| Backend | Node.js, Express, WebSocket `ws`, MongoDB, Mongoose, Multer, Axios, Winston |
| Media | Cloudinary |
| GIF Search | Tenor API |
| Storage | MongoDB, IndexedDB media cache |
| Tooling | Vite, TypeScript, npm |

---

## Local Development

Install and run the backend and frontend separately.

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run start
```

After both services are running, open the frontend development URL shown by Vite.

---

## License

All rights reserved.

Pulse Chat is proprietary software unless a separate written license is provided by the owner.
