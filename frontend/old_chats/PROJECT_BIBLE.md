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

**Business Rules**

*   **Time-Limited Deletions:** The "Delete for Everyone" feature is strictly limited to the original sender of the message and can only be performed within 15 minutes of the message being sent.
*   **Hierarchical Mobile Navigation:** The mobile back button must always close the top-most active overlay (e.g., lightbox, modal, sidebar) before navigating away from the main chat screen.
*   **Debounced Presence Notifications:** User join/leave notifications must be delayed and verified to avoid creating chat noise when a user refreshes their page or has a temporary network interruption.

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