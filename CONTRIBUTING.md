# Contributing to Pulse Chat

Thank you for your interest in contributing to **Pulse Chat**! We welcome community contributions, bug reports, feature suggestions, and improvements from developers of all skill levels.

Before submitting code, please take a moment to review this guide.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please ensure all interactions remain respectful, welcoming, and inclusive.

---

## How Can I Contribute?

- **Reporting Bugs:** Open an issue on GitHub detailing the problem, browser/OS version, steps to reproduce, and console logs.
- **Suggesting Enhancements:** Open an issue with the "feature request" tag to discuss new ideas before writing code.
- **Submitting Pull Requests:** Fix known bugs, enhance documentation, or add agreed-upon features.

---

## Local Development Setup

### Prerequisites

- **Node.js** (v18.x, v20.x, or later)
- **npm** (v9.x or later)
- **MongoDB** instance (local or MongoDB Atlas connection string)
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
```

Create a `.env` file in the `backend/` directory:

```env
PORT=8080
MONGODB_URI=mongodb://localhost:27017/pulse-chat
ADMIN_PASSWORD=your_admin_password
CLIENT_PASSWORD=your_client_password
ADMIN_SECRET=your_admin_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
GIPHY_API_KEY=your_giphy_key
```

Start the backend server:

```bash
npm run dev
```

The server will start listening at `http://localhost:8080` (with WebSocket service on `ws://localhost:8080`).

### 3. Frontend Setup

In a separate terminal window:

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend/` directory (optional for local development, as it defaults to `http://localhost:8080`):

```env
REACT_APP_API_URL=http://localhost:8080
```

Start the frontend development server:

```bash
npm run dev     # or: npm start
```

The app will be available at `http://localhost:3000` (or the URL output by Vite).

---

## Testing & Quality Assurance

Before submitting any changes, ensure all tests and security audits pass:

```bash
# In frontend:
npm run test:run    # Runs the full Vitest suite
npm run build       # Verifies production bundle compilation
npm audit           # Ensures zero security vulnerabilities

# In backend:
npm audit           # Ensures zero security vulnerabilities
```

---

## Git & Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for clear, readable git logs:

- `feat(scope): ...` for new user-facing features.
- `fix(scope): ...` for bug fixes.
- `docs(scope): ...` for documentation changes.
- `refactor(scope): ...` for code structure improvements without behavioral changes.
- `chore(scope): ...` for dependency updates and build configuration.

### Branching Model

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b fix/quote-scroll-alignment
   ```
2. Make clean, focused commits with descriptive messages.
3. Keep your branch synchronized with upstream `main`.

---

## Pull Request Guidelines

1. **Self-Review:** Review your diff (`git diff`) before pushing to ensure no unintended formatting, console debugging statements, or temp files were committed.
2. **Descriptive Summary:** Clearly explain what problem the PR solves, the root cause, and how you tested it.
3. **Automated Tests:** Add or update unit tests in `frontend/src/.../*.test.ts(x)` for any new or modified functionality.
4. **Clean Builds:** Ensure `npm run build` succeeds cleanly without warnings or errors.
5. **No Breaking Releases:** Do not manually modify release tags unless requested by maintainers.

---

## Questions or Help?

Feel free to open a discussion or issue on GitHub, or reach out to the project creator, **Harsh Pandey** ([@2harshpandey](https://github.com/2harshpandey)).
