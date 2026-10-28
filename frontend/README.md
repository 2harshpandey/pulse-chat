# Pulse Chat — Frontend Client

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

## Architectural Highlights

- **Domain-Modular Structure**: Decomposed into focused domains: `/chat`, `/admin`, `/rooms`, `/auth`, `/home`, and `/errors`.
- **Sliding Window Virtualization**: Handles tens of thousands of messages smoothly without memory bloat or UI stutter.
- **Intelligent Realtime Presence**: Granular activity tracking (typing, live audio recording with soundwaves, media upload progress with bouncing dots, and GIF selection) with upload presence protection and flicker-free caption typing.
- **Zero Layout Shift (CLS)**: Uses `ResizeObserver` on media bubbles and link previews to maintain stable scroll anchoring.
- **Cross-Theme Parity**: Complete visual parity across light and dark modes with dedicated design tokens in `index.css`.
- **Progressive Web App**: Fully installable standalone app on Android, iOS, Windows, and macOS.
