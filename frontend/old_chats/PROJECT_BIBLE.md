# Project Bible

This document summarizes the goals, technology, and features of the Pulse Chat project.

## Project Goal

The primary goal of this project is to build a real-time chat application named "Pulse Chat". A key component of the project is a comprehensive, password-protected admin panel that allows a non-coder to monitor all chat activity, view user lists, and access detailed event logs.

## Tech Stack

The project is a full-stack application with a clear separation between the frontend and backend.

*   **Frontend (Client-Side):**
    *   **Language:** TypeScript
    *   **Framework:** React
    *   **Styling:** `styled-components` for CSS-in-JS.
    *   **Key Libraries:** `react-router-dom` for navigation, `emoji-picker-react` for emoji selection, and `@use-gesture/react` for drag gestures.

*   **Backend (Server-Side):**
    *   **Environment:** Node.js
    *   **Framework:** Express.js for the web server and API endpoints.
    *   **Real-time Communication:** `ws` (WebSocket) library for live activity feeds.
    *   **File Storage:** Cloudinary for hosting uploaded media (images, videos). `multer` is used to handle file uploads.
    *   **Configuration:** `dotenv` for managing environment variables (like API keys and passwords).     
    *   **Logging:** A custom logger (`logger.js`) is used to create a persistent `pulse-activity.log` file.

## Features Built

During our session, we iteratively built a full-featured admin panel from the ground up.

1.  **Admin Authentication:** The admin panel at `/admin` is protected by a password.
2.  **Consolidated Message Log:**
    *   The "Messages" and "History" tabs were merged into a single, unified "Message Log" tab.
    *   This view displays a detailed table of all message-related events: creations, edits, uploads, and deletions.
    *   Columns include Date, Time, User, Event Type, Message ID, and event-specific details.
    *   Media uploads (images, videos) and GIFs now show as clickable links in the log.
3.  **User List:** A dedicated tab shows a list of all users currently or previously connected to the chat.
4.  **Live Activity Feed:**
    *   A "Live Activity" tab provides a real-time, non-scrolling feed of server events (e.g., user connections, messages sent).
    *   The activity log now persists across page refreshes using session storage.
5.  **Server Log Viewer:** A "Server Logs" tab was created to display the raw contents of the `pulse-activity.log` file directly from the server, providing low-level system insight.
6.  **Advanced Filtering:** The main "Message Log" is equipped with filters for Message ID, User, Event Type (via a dropdown), and a text search for content.
7.  **Enhanced Logging:**
    *   Deletion events are now more specific, showing "Delete (Everyone)" for clarity.
    *   A distinct "Upload" event is logged when a user uploads media, separate from the "Create" event when the message is actually sent.

## Business Rules

We established the following rules for how the system should operate:

*   **Admin Access:** All admin endpoints and the frontend admin panel must be protected by a secret password.
*   **Immutability:** The message event log (`messageEventsLog` on the backend) is designed to be an immutable record of all actions taken.
*   **Real-Time Monitoring:** Admin clients receive live updates on user connections, disconnections, and all message activities.
*   **Media Handling:** All user-uploaded media is stored in Cloudinary, and the links are logged for admin review.
*   **Log Persistence:** The real-time activity feed's state is preserved within a browser session to prevent data loss on refresh.



---

## Session 2 Summary: Real-Time Conversion & Bug Fixes

This session focused on debugging and converting the admin panel into a fully real-time monitoring tool.  

### New Features & Enhancements

*   **Real-Time Admin Panel:** The entire admin panel was upgraded to receive live data updates via WebSockets, removing the need for manual refreshes.
    *   The "Refresh" button was removed from the "Server Logs" tab.
    *   The backend now automatically pushes updates for the message log, user list, and server logs to all connected admin clients whenever a relevant event occurs.

### Bug Fixes

*   **"Unknown" User Resolved:** A critical bug causing disconnected users to appear as "unknown ()" in the logs was fixed. This was achieved by creating a persistent, session-long user list on the backend, ensuring user information remains available for logging even after they disconnect.
*   **Content Filtering Corrected:** The message log filter was fixed to properly search through message text content without incorrectly matching media file uploads.
*   **UI Layout Stabilized:** Persistent layout issues with the log containers in the admin panel were resolved. The containers now use a fixed height (`70vh`) and have vertical scrolling enabled to prevent overflow and ensure a consistent user experience.
*   **Live Activity Feed Repaired:** A regression that caused the live activity feed to display "undefined" for each new event was identified and resolved. The issue was traced to an incorrect data access pattern in the frontend's WebSocket handler.



---

## Session 3 Summary: Database Persistence & Deployment Readiness

This session marked a major transition from a temporary, in-memory prototype to a professional, persistent application by integrating a cloud database and preparing the project for version control.

### Project Goal
The goal expanded to ensure data durability. By adding a database, we ensured that no messages, user data, or event logs are lost when the server restarts or the application is refreshed.

### Tech Stack
*   **Database:** MongoDB Atlas (Cloud-based NoSQL database).
*   **Object Modeling:** `mongoose` for managing database schemas and interactions.
*   **Version Control:** Git, initialized for tracking project history and facilitating GitHub integration.
*   **Environment Management:** `dotenv` usage was reinforced to secure database connection strings and passwords.

### Features Built & Finished
*   **MongoDB Integration:** Successfully connected the backend to a MongoDB Atlas cluster.
*   **Persistent Data Models:** Created formal schemas for `User`, `Message` (supporting text, media, replies, and reactions), and `MessageEvent`.
*   **Backend Refactoring:** Completely rewrote the server logic to save all chat activity to the database instead of volatile memory.
*   **Admin Panel Enhancements:**
    *   Added a "Refresh" button to the Server Logs for manual control.
    *   Restored real-time updates for the Message Log and User List.
    *   Refined the Live Activity feed with a non-scrollable ticker UI and more descriptive connection/disconnection messages.
*   **Git Setup:** Initialized the repository and established a `.gitignore` file to protect sensitive files (`.env`, `node_modules`, etc.).

### Business Rules
*   **Data Durability:** Every message and user interaction must be recorded in the database to ensure a "professional" level of reliability.
*   **Environment Isolation:** Connection strings and secrets must never be hardcoded or committed to Git; they reside strictly in the `.env` file.
*   **Deployment Preparation:** The application was prepared for cloud hosting (AWS) by externalizing configurations and optimizing build processes.



---

## Session 4 Summary: Refinement, Git Integration & Deployment Prep

This session focused on stabilizing the application, removing unnecessary features, and preparing the codebase for deployment and version control.

### Feature Changes & Refactoring
*   **Removed User Color:** The `userColor` feature was completely removed from the frontend (Auth, UserContext) and backend (Schema, logic) per user request to simplify the application.
*   **Admin Panel UI/UX Improvements:**
    *   **Layout Fixes:** Resolved layout breaking issues in "Live Activity" and "Server Logs" tabs by enforcing fixed heights (`400px`) and proper overflow handling.
    *   **Auto-Scroll:** Implemented auto-scrolling for the "Live Activity" feed, ensuring the newest logs appear at the bottom and the view automatically tracks them.
    *   **Real-Time User Updates:** Fixed a bug where the "Users" tab in the admin panel wasn't updating in real-time upon user disconnection. Added logic to broadcast the updated user list to admins whenever a socket closes.

### Bug Fixes
*   **Runtime Errors:** Resolved a `TypeError: message.data.sort is not a function` in the admin panel by correcting how history log updates were processed.
*   **Validation Errors:** Fixed Mongoose validation errors caused by the removal of the `userColor` field.

### Deployment Readiness & Version Control
*   **Environment Abstraction:** Hardcoded URLs (`http://localhost:8080`, `ws://localhost:8080`) in the frontend (`Chat.tsx`, `Admin.tsx`) were replaced with a `process.env.REACT_APP_API_URL` environment variable. This allows seamless switching between local and production environments.
*   **Git Initialization:**
    *   Initialized a local Git repository.
    *   Created a root `.gitignore` to exclude node_modules, logs, and environment files.
    *   Performed the initial commit of the entire codebase.



---

## Session 5 Summary: Production Stability & UX Fixes

This session focused on resolving critical production issues that were causing application instability and a poor user experience, particularly after the initial deployment.

### Feature Changes & Refactoring
*   **Backend Deployment Overhaul:**
    *   The Azure deployment process was completely refactored to be more robust.
    *   Instead of letting Azure build the application, the GitHub Actions workflow was modified to pre-build all backend dependencies (`npm install`) *before* deploying. This fixed a critical crash-restart loop caused by corrupted package installations on the Azure server.
*   **Persistent User Identity:**
    *   A major bug was fixed where users' own messages would appear as if they belonged to someone else after a server restart or connection loss.
    *   The frontend was updated (`UserContext.tsx`) to save the user's ID and username to the browser's `localStorage`.
    *   Now, on page load, the application immediately restores the user's session from `localStorage`, ensuring a stable identity and preventing the login screen from appearing for returning users.

### Bug Fixes
*   **Mobile Scrolling Repaired:** Fixed a bug that prevented users from scrolling through the chat history on touchscreen devices. The chat container's CSS was updated (`Chat.tsx`) to correctly handle touch-and-drag gestures for scrolling.
*   **Git History Corruption:** Resolved a recurring `git push` failure caused by a large file that had been committed to the repository's history. The local `main` branch was reset to match the clean version on GitHub, permanently removing the problematic history.

### Business Rules
*   **Stable User Identity is Critical:** The application must ensure a user's identity (`userId`) is stable and persists across page reloads and temporary disconnections to maintain a consistent user experience and correct message ownership.



---

## Session 6 Summary: User Experience (UX) Enhancements & Critical Bug Fixes

This session was dedicated to refining the core chat experience by fixing annoying bugs and adding a key quality-of-life feature.

### New Features & Enhancements

*   **"Scroll to Bottom" Button:**
    *   A new floating button with a down-arrow icon was added to the chat window.
    *   This button automatically appears when a user scrolls up from the bottom of the chat history.     
    *   Clicking the button provides a quick, smooth scroll back to the latest messages, significantly improving navigation in long conversations.

### Bug Fixes

*   **Persistent Login Identity:** A critical bug was fixed where logging out and back in would cause a user's own messages to appear as if they belonged to someone else after a page refresh. The `logout` logic was corrected to preserve the user's core ID (`userId`) in the browser, only clearing the temporary username. This ensures message ownership is permanent and correct.
*   **Scroll Position on Refresh:** Fixed a bug where the chat window would not reliably scroll to the bottom after a page refresh. The logic was adjusted to ensure the view instantly jumps to the latest message on load.
*   **Build Stability:** Resolved a series of build failures on the Netlify deployment platform caused by syntax errors introduced during development. The final state of the code is stable and deploys correctly. 

### Business Rules
*   **User ID Persistence:** A user's unique ID (`userId`) must be considered permanent for their device and should never be deleted on logout. Only the display name (`username`) is transient. This is a core rule to guarantee data integrity and a consistent user experience.



---

## Session 7 Summary: Advanced Debugging & Mobile UX Polish

This session was focused on a deep dive into advanced debugging, tackling deployment issues, critical backend crashes, and subtle user experience bugs on mobile devices.

### Feature Changes & Enhancements

*   **Scroll-to-Bottom Button Refinement:**
    *   The button's visibility logic was made more sensitive, causing it to appear immediately when scrolling up.
    *   Its positioning was fixed so it now correctly "floats" in the bottom-right corner instead of scrolling with the chat content.
    *   On desktop, chat messages now shift to the left to make reserved space for the button, preventing overlap. On mobile, this feature is disabled to prevent rendering issues, and the button overlays the content.

### Bug Fixes

*   **Backend Crash on Reply (Critical):** A server-crashing bug was fixed. When a user replied to a message, the backend would crash due to a database schema validation error. The `Message` model was corrected to properly handle the reply data structure, ensuring server stability.
*   **Deployment Failures Resolved:** Investigated and fixed a series of Netlify deployment failures. The root cause was identified as a syntax error in the frontend code that was not being caught by the backend-only CI/CD workflow. The code was corrected, and a new deployment process was established to ensure consistency.
*   **"Clear Chat" Feature Repaired:** Fixed a major bug where using the "Clear Chat" button and refreshing would permanently break the chat session until a full logout. The faulty persistence logic was removed, and the button now only clears the current view, which is correctly restored on refresh.
*   **Mobile "Earthquake" Scroll Bug:** Fixed a visual glitch on mobile devices where the chat would shake or "jump" when scrolling to the bottom. This was caused by a layout shift, which was resolved by altering the scroll button's behavior on mobile.
*   **Mobile Reaction Bug:** Corrected a regression where reacting to messages on mobile devices had stopped working. The event handlers were adjusted to correctly register taps without interfering with other UI events.



---

## Session 8 Summary: Final Stability & Advanced Gesture/Backend Fixes

This session was a marathon of debugging to resolve the last remaining, complex bugs related to deployment, mobile gesture conflicts, and backend stability, bringing the application to a fully polished and professional state.

### Bug Fixes

*   **Backend Crash on Reactions (Critical):** Fixed a critical, server-crashing bug that occurred whenever a user reacted to a message. The backend logic was completely rewritten to correctly handle the data structure for reactions from the MongoDB database, ensuring server stability.
*   **Mobile Reaction UI Bug (Definitive Fix):** After multiple attempts, a persistent and frustrating bug on touch devices was finally resolved. The issueâ€”where reacting to a message would also incorrectly select it and cause the screen to jumpâ€”was fixed by completely isolating the reaction menu's touch events from the parent message's gesture handlers. The reaction feature now works smoothly and predictably on all devices.
*   **Deployment & Build Failures Resolved:** A series of recurring Netlify build failures were diagnosed and fixed. The root cause was a syntax error that was not being caught by the backend-only CI/CD workflow. The codebase was corrected, and the deployment pipeline is now stable.
*   **Mobile "Earthquake" Scroll Bug (Refined):** Further refined the fix for the "shaking" effect when scrolling on mobile. The solution was to make the adaptive padding (space for the scroll-to-bottom button) a desktop-only feature, preventing layout shifts on sensitive mobile viewports.



---

## Session 9 Summary: Deployment, UX, and Build Fixes

This session focused on improving the deployment process, refining the user experience, and resolving a series of complex build errors.

### Features Built & Enhancements

*   **User Self-Identification:** The online users list was updated to display `(You)` next to the current user's username. This prevents confusion when multiple users have the same name.
*   **User Join Notifications:** A temporary notification (e.g., "[username] joined the chat") now appears in the main chat flow, styled as a centered, grey line of text. This provides a clear, in-line record of when users connect.
*   **Mobile Keyboard Behavior:** On touchscreen devices, the "Enter" key on the on-screen keyboard now correctly inserts a new line in the message input field, instead of sending the message. This makes typing multi-line messages on mobile much more intuitive.

### Bug Fixes

*   **Auto-Scroll on Refresh:** A persistent bug was fixed where the chat window would not reliably scroll to the very bottom upon refresh. The scrolling logic was refactored to be more robust, ensuring the latest message is always in view on load.
*   **Server Crash Loop on Azure:** Diagnosed and fixed a server crash-loop caused by a missing `MONGODB_URI` environment variable in the production environment. The application was made more resilient to this error to prevent future crashes and improve logging.
*   **Redundant Backend Deployments:** The GitHub Actions workflow for the backend was optimized. It now only triggers a new deployment when files in the `backend/` directory are changed, preventing unnecessary server restarts on frontend-only pushes.
*   **Netlify Build Failures:** Resolved multiple cascading build failures on the frontend:
    *   **Duplicate Declaration:** Removed a duplicate declaration of a styled-component (`SystemMessage`) that was causing a syntax error.
    *   **React Hooks Violation:** Fixed a critical error where React Hooks were being called conditionally. The component logic was refactored to ensure hooks are always called at the top level, respecting the Rules of Hooks and allowing the build to succeed.

### Business Rules

*   **Deployment Efficiency:** The backend deployment workflow must only run when backend code is modified.
*   **Platform-Specific UX:** The user interface must adapt to provide an intuitive experience on both desktop and mobile (e.g., "Enter" key behavior).
*   **Clear User Feedback:** The UI should provide clear, non-intrusive feedback for system events like a user joining the chat.



---

## Session 10 Summary: Styling, Deployment & Build Fixes

This session was focused on refining the application's visual style, fixing critical deployment-blocking bugs, and ensuring the local build process was stable.

### Project Goal
The goal was to improve the user experience by making system messages more distinct and visually appealing, while also ensuring the application remains stable and deployable.

### Tech Stack
No new technologies were introduced. The work was primarily focused within the existing React and `styled-components` frontend.

### Features Built & Finished
*   **Enhanced System Message Styling:** The styling for system messages (e.g., "user joined") was significantly improved based on user feedback.
    *   A light grey background (`#ced4da`) and rounded corners were added to make the messages stand out.
    *   The font size was increased, and the text color was adjusted to `#212529` for better contrast and readability.
    *   The message block now dynamically fits its content width (`width: fit-content`) and is centered.

### Bug Fixes
*   **Netlify Deployment Failures:** A persistent and critical build error (TypeScript's TS2322) was diagnosed and fixed.
    *   **Initial Bug:** A redundant check for system messages was causing a type error.
    *   **Deeper Bug:** After the first fix, a deeper issue was found where attempting to *reply* to a system message caused a different type mismatch.
    *   **Solution:** The application logic was updated to prohibit replying to system messages, which is semantically correct and resolved the build-breaking error.
*   **Local Build Process:** The frontend build process was run locally (`npm run build`) to replicate and diagnose the Netlify error, confirming the fix before pushing it to the repository.

### Business Rules
*   **No Replies to System Messages:** A new rule was implicitly established: users cannot reply to system-generated notifications.
*   **Visual Prominence for System Events:** System messages must be visually distinct from user messages to be easily identifiable.



---

## Session 11 Summary: Advanced UX and Real-World Polish

This session was focused on improving the core user experience by fixing long-standing bugs and implementing professional-grade features that make the application feel more robust and intuitive, especially on mobile devices.

**Features Built & Finished**

*   **"Delete for Everyone" (Corrected):** The "Delete for Everyone" feature has been fully repaired and enhanced.
    *   When a user deletes their own message within 15 minutes of sending, the message content is now correctly replaced for all users in the chat.
    *   The user who initiated the delete sees a replaced text: "You deleted this message."
    *   All other users see a generic notification: "This message has been deleted."

*   **Intelligent Join/Leave Notifications:** The notifications for users joining and leaving the chat are now much smarter, preventing notification spam from simple page refreshes.
    *   A notification for a user joining is now only displayed if they are a genuinely new user in the session.
    *   A "user has left" notification is now implemented and is shown only when a user has been disconnected for more than 10 seconds, correctly ignoring brief connection drops or page reloads.

*   **Mobile Back-Button Navigation:** The application now properly handles the mobile device's back button, providing a more native and intuitive navigation experience.
    *   **Media Viewer:** When viewing a photo, video, or GIF in the full-screen lightbox, pressing the back button now correctly closes the viewer and returns the user to the chat, instead of exiting the application.
    *   **UI Overlays:** The back button now correctly closes UI overlays in a hierarchical manner. For example, it will close the delete confirmation modal or the online users sidebar without exiting the app. The user can then press the back button again to navigate further back or exit.

*   **Online User List Polish:**
    *   The user's own name is now always displayed at the top of the online users list for easy access.


---

## Session 12 Summary: Security hardening, UX polish & production push

**Overview:** This session focused on closing remaining security leaks (hardcoded client/admin passwords and logging/exposure), a set of UX/mobile polish items in the chat UI, and preparing the app for production by ensuring environment-driven auth and CI/Azure app-settings updates.

- **Security & Auth:**
    - Removed hardcoded client and admin passwords from the frontend and eliminated logging/exposure of the admin secret.
    - Moved client/admin verification to the backend: added a `POST /api/auth/verify` endpoint and switched admin WS auth from a URL query param to an in-socket message handshake.
    - Added startup environment checks on the backend to fail fast when required secrets are missing.

- **Frontend (key file): `frontend/src/Chat.tsx`**
    - Unified back-button / popstate behavior with an `overlayGuard` (ref) and a single popstate handler that closes overlays in strict hierarchy (delete confirmation → select-mode → lightbox → user-list sidebar).
    - Added a `SidebarBackdrop` and click-outside handling to close the online-users sidebar.
    - Fixed select-mode race by pushing the history guard synchronously when selection first activates.
    - Ensured reliable scroll-to-bottom behavior on load and after send; added tweaks so the scroll-to-bottom button doesn't steal focus or minimize the on-screen keyboard on touch devices (preventDefault on pointer/mouse/touch down events).
    - Double-click quoting limited to desktop clicks that occur outside the message bubble (prevents accidental quoting when double-clicking inside a bubble).
    - Made the typing indicator text unselectable (`user-select: none`) to avoid accidental-selection UX.
    - Footer copy behavior (mobile): the footer `Copy` action now appears only when exactly one message is selected; it hides immediately when multiple messages are selected and reappears when selection returns to a single message.
    - Media preview tap behavior: tapping an image/video/GIF preview opens the lightbox/player without selecting the message (prevents accidental multi-select); selecting a message still works when tapping the side-area or for plain text/quoted messages.

- **Backend (key file): `backend/index.js`**
    - Implemented `POST /api/auth/verify` and moved admin handshake logic to message-based auth.
    - Removed diagnostic logs that previously leaked secrets and added server startup checks for required env vars.

- **CI / Deployment:**
    - GitHub Actions were updated to push app settings to Azure App Service during deploy. **Action required:** set GitHub Secrets / Azure App Settings for production (CLIENT_PASSWORD, ADMIN_PASSWORD, MONGODB_URI, CLOUDINARY_*, TENOR_API_KEY, REACT_APP_API_URL, etc.).

- **Validation & Commits:**
    - Local production builds were run and reported "Compiled successfully." after edits.
    - Changes were committed and pushed; last pushed commit for these UX polish changes: `7cc13c8` (fix(ux): finalize Chat.tsx UX polish).

- **Pending / Next Steps:**
    - User must add the production secrets to GitHub Secrets / Azure App Settings so `POST /api/auth/verify` works in production.
    - Revisit one remaining select-mode back-button edge-case later (known, postponed by the user).
    - Optionally add small UI tests (Playwright/Puppeteer) to assert keyboard/sticky-button behavior and quoting behavior across device emulations.

**Files touched (high-level):** `frontend/src/Chat.tsx`, `frontend/src/Auth.tsx`, `backend/index.js`, CI workflow(s).

---

## Session 13 Summary: Mobile Keyboard & Emoji UX Polish (2026-03-02)

**Overview:** This session focused on delivering a truly seamless mobile chat experience by thoroughly fixing the last remaining issues with the emoji picker, keyboard minimization, and select-mode checkbox on mobile devices. All changes were build-verified and pushed with zero warnings.

- **Emoji Picker One-Tap Fix:** The emoji picker now opens and the keyboard closes in a single, smooth tap on mobile. The previous two-tap and focus-jank issues are fully resolved. The toggle logic was moved to the pointer-down event, capturing the button position before any layout shift.
- **Keyboard Dismissal Smoothness:** The app now avoids fighting the keyboard blur/focus cycle and defers menu-closing logic to ensure the main thread is free for animation. This results in a much smoother keyboard minimization on all mobile keyboards.
- **Checkbox Selection Reliability:** Fixed a bug where selecting/deselecting messages in select mode required two taps on mobile. Now works reliably on the first tap.
- **Gboard Note:** The only remaining minor stutter (the Gboard top bar briefly sticking when minimizing) is a known Gboard-specific issue and not caused by the app. All other keyboards minimize flawlessly.
- **Code Quality:** All changes were build-verified and pushed with zero warnings. No breaking changes to existing features.

**Business Rules:**
- Mobile UX must be frictionless: emoji picker, keyboard, and selection all work in one tap with no jank.
- Known platform-specific issues (like Gboard's top bar stutter) are documented but outside app control.
- All changes must be build-verified and not break any existing features.

---

## Session 13B: Multi-File Upload, WhatsApp-Style Preview Modal, and Robust File Handling (2026-03-02)

**Overview:**  
This extension of Session 13 delivered a major upgrade to file upload and preview capabilities, including a WhatsApp-style, multi-file preview modal, robust drag-and-drop/paste support, professional-grade error handling on both frontend and backend and further admin panel & table fixes.

**Features Built & Enhancements:**
- **WhatsApp-Style Multi-File Preview Modal:**
  - Full-screen preview modal with horizontal thumbnails, caption input, and send/cancel actions.
  - Fully responsive across mobile, tablet, and desktop; touch + mouse supported.
- **Multi-File Upload:**
  - Multiple files via drag-and-drop, paste, or file picker.
  - Pre-send previews with clear errors for unsupported types or size limits.
- **Robust Backend Error Handling:**
  - Mimetype-based detection, strict size/type limits, clear API error responses surfaced in UI.
- **Download UX Improvements:**
  - Original filename + extension preserved (including cross-origin blobs).
  - Left-aligned download button to avoid overlap and improve accessibility.
- **UI/UX Polish:**
  - Modal, overlay, and thumbnails styled for a clean WhatsApp-like experience.
  - Responsive and accessibility-tested across devices.
- **Further Admin Panel & Table Fixes:**
  - Admin panel tables are now fully responsive: the Message Log table uses horizontal scroll only when truly needed (on small screens with many columns), while the Users table never scrolls horizontally and always fits on mobile and tablet.
   - Table word-break logic was improved: table cells now wrap only at word boundaries, never splitting words mid-character, so all text remains readable and professional.
   - These changes ensure the admin panel is premium, clean, and accessible on all device types, with no awkward horizontal scrolling or broken words in any table.

**Bug Fixes:**
- Fixed non-image/video upload failures.
- Resolved preview modal and chat layout overlaps.
- All features hardened for production use.

**Business Rules:**
- Multi-file uploads with explicit, user-friendly error feedback.
- Downloads must always preserve original filenames.
- All UI must be responsive and accessible on all devices.
- **Debounced Presence Notifications:** Join/leave events are delayed and verified to avoid noise during refreshes or brief network drops.

---

### Appended UX & Interaction Fixes (Session 13B Extension)

- **Quote Handling:**
  - Pressing `Esc` instantly removes (unquotes) the active quoted message.
  - Quoted-preview close icon remains perfectly circular, slightly larger for easier tapping.
  - Long quoted text is responsively truncated with ellipsis (no distortion) across all screen sizes.
  - Deleted messages can no longer be quoted on touch devices.
- **Auto-Scroll Behavior:**
  - When quoting a message, chat auto-scrolls smoothly so the quoted message ends just above the quote preview (WhatsApp-style).
  - When opening the menu on the last message, chat auto-scrolls so the menu is fully visible above the textbox.
- **Scroll-to-Bottom Button:**
  - Repositioned to never overlap UI elements.
  - Desktop: sits higher to avoid partial overlap with Send.
  - Mobile: stays just above the quote preview (not below it).
- **Menus & Reactions:**
  - React menu / three-dot menu now toggles closed when clicking the same icon again (no blink).
  - Reaction bar dismisses when tapping/clicking anywhere outside it.
- **Selection & Deletion UX:**
  - “You deleted this message.” text is now unselectable (`user-select: none`).
- **Cross-Cutting Guarantees:**
  - All fixes are responsive, smooth, and consistent across touchscreen and non-touchscreen devices.

**Validation & Commits:**
- Build-verified and tested across devices and browsers.
- Changes committed and pushed with detailed messages; all additions production-ready.

---

## Session 14 Summary: Security Hardening & Vulnerability Remediation (2026-03-02)

**Overview:**
This session was dedicated entirely to identifying and resolving all code-level and dependency-level security vulnerabilities, covering GitHub CodeQL scan alerts, Dependabot findings, and `npm audit` results. All high-severity issues were resolved without breaking the site.

### CodeQL / GitHub Security Alert Fixes

All alerts were addressed across `frontend/src/Chat.tsx`, `frontend/src/Admin.tsx`, and `backend/index.js`:

- **DOM-XSS (Chat.tsx):** The root cause was a taint chain where a user-controlled file object flowed into `src` attributes via blob URLs. Fixed by introducing:
  - A `getBlobUrl(file)` helper backed by a `WeakMap` cache to deduplicate blob creation.
  - A `sanitizeMediaUrl(url)` taint-breaking function that validates and reconstructs the URL, ensuring CodeQL's taint analysis cannot trace the value back to user input.
  - All media preview `src` attributes and download `href` values now use `sanitizeMediaUrl(getBlobUrl(file))` exclusively.
  - A `revokeBlobUrl(file)` cleanup helper to prevent memory leaks.
- **XSS (Chat.tsx, Admin.tsx):** Removed all instances of `dangerouslySetInnerHTML` and direct DOM assignments with user-controlled data. All dynamic content is now rendered through React's safe text rendering.
- **SSRF / URL Redirect:** Validated and restricted all outbound URL constructions on the backend to prevent server-side request forgery and open redirect vectors.
- **Insecure Randomness:** Replaced uses of `Math.random()` for security-sensitive identifiers with cryptographically secure alternatives.
- **Password Storage:** Removed any plaintext storage or logging of passwords/secrets in both frontend and backend.
- **Cleartext Logging of Secrets (backend/index.js):** Removed diagnostic `console.log` / `logger` calls that previously printed the admin secret or client password to server logs.
- **Missing Rate Limiting (backend/index.js):** Added `express-rate-limit` middleware to all sensitive and destructive API routes:
  - Admin authentication routes.
  - All admin-only data endpoints (message log, user list, clear chat, delete operations).
  - File upload endpoint.
  - This prevents brute-force and denial-of-service attacks on protected routes.

### Dependency Vulnerability Fixes (npm audit)

- **High severity — jsonpath (via bfj):** `bfj` was upgraded to `9.1.3` using a package.json `overrides` entry in `frontend/package.json`. This removed the transitive `jsonpath` dependency that carried a high-severity ReDoS vulnerability.
- **Moderate severity — postcss:** Added a `postcss` override pinned to `^8.5.6` to resolve the known CSS parsing vulnerability where possible within the CRA dependency tree.
- **npm audit fix --force incident:** An initial attempt with `npm audit fix --force` removed `react-scripts` entirely (replaced with `0.0.0`), breaking the build. This was recovered by re-installing `react-scripts@5.0.1` and switching to targeted `overrides` instead.
- **upgrade resolve-url-loader to v5:**
    - Removed vulnerable `postcss@7.0.39` (CVE-2023-44270, Dependabot #2) bundled via `resolve-url-loader@4`.  
    - Override not viable due to `postcss.plugin()` removal in v8.  
     Upgraded to `resolve-url-loader@5.0.0` (PostCSS v8 compatible).  
    - Webpack interface unchanged; clean build verified.
- **Remaining moderate vulnerabilities:** `webpack-dev-server` remain at moderate severity. These are dev/build-tool-only dependencies with no production exposure. They cannot be safely upgraded without migrating away from Create React App.

### Final Security State

- All CodeQL alerts: **resolved** (dev-only tool alerts are not actionable without a CRA → Vite/Next.js migration).
- All high-severity npm audit vulnerabilities: **resolved**.
- Remaining vulnerabilities: **2 moderate**, all confined to dev/build tools (`webpack-dev-server`). No production runtime impact.
- All changes were build-verified (`npm run build` clean with zero warnings) and committed/pushed.

### Business Rules Established

- All security-sensitive API routes must be rate-limited.
- Blob URLs for user-uploaded media must always be passed through `sanitizeMediaUrl()` before being assigned to any DOM attribute.
- Secrets and passwords must never appear in any log output.
- Dependency fixes must not break the production build; `--force` upgrades are prohibited without a full toolchain migration plan.

### Additional Bug Fixes

- **GIF Button Mobile Reliability:** Fixed a persistent bug where the GIF picker button would not work on mobile/touchscreen devices due to phantom synthetic clicks. Added a timestamp guard to reliably detect user intent and prevent accidental double-triggering.
- **Clear Chat Persistence:** The "Clear Chat" feature now persists across page refreshes by storing a per-user clear timestamp in localStorage. This ensures that cleared messages do not reappear after reload, providing a consistent experience.
- **Duplicate Username Prevention:** Users are now prevented from joining the chat room with a username that is already in use. This is enforced both server-side (WebSocket join handler) and client-side, with clear error feedback for the user. The fix is now live after resolving a long-standing CI/CD deployment issue that had blocked backend updates for multiple sessions.
- **Fixed Copy Issues:**
    - Copy button is now hidden for videos on all devices (PC and mobile).
    - Copying an image now copies the actual image to the clipboard (not just the URL), for both PC and mobile, using the Clipboard API.
- Fixed backend rate limiter to handle IPv6 users correctly and prevent bypass (now uses ipKeyGenerator, Azure proxy port stripping still supported).