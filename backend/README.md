# Pulse Chat: Backend Service

The real-time server application for **Pulse Chat**, engineered with Node.js, Express, native WebSockets (`ws`), MongoDB with Mongoose, Cloudinary media pipeline, and Winston logging.

---

## Architecture & Tech Stack

- **Runtime**: Node.js (>= 20.0.0)
- **HTTP Framework**: Express 5
- **Real-Time Layer**: Native WebSocket (`ws`) with ping/pong heartbeats and room connection pooling
- **Database**: MongoDB via Mongoose ODM
- **Media Pipeline**: Cloudinary CDN with Multer chunked multipart stream uploads
- **Security & Moderation**: Helmet CSP, CORS allowlisting, rate limiting (`express-rate-limit`), device fingerprinting, and audit logging
- **Logging**: Structured Winston logging to console and `pulse-activity.log` with IST timezone formatting

---

## Quick Start

### 1. Configure Environment
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```
Fill in your `MONGODB_URI`, room passwords, and secrets (see [Environment Configuration](#environment-configuration) below).

### 2. Install Dependencies
```powershell
npm install
```
*(A `.npmrc` file with `legacy-peer-deps=true` is included to resolve peer-dependency compatibility automatically).*

### 3. Run Development Server
```powershell
npm run dev
```
The server will watch for changes and listen on `http://localhost:8080`.

---

## Available Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `node --watch index.js` | Starts server with Node.js built-in file watcher |
| `npm run dev:nodemon` | `nodemon index.js` | Starts server with nodemon |
| `npm start` | `node index.js` | Starts production server |

---

## Environment Configuration

Configure these in `backend/.env`. Never commit the actual `.env` file to version control.

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | **Yes** | MongoDB connection string (Atlas URI or local `mongodb://localhost:27017/pulsechat`) |
| `ADMIN_PASSWORD` | **Yes** | Master password for admin dashboard authentication |
| `CLIENT_PASSWORD` | **Yes** | Room password required for standard user entry |
| `ADMIN_SECRET` | **Yes** | Secret header token used to authorize protected admin REST endpoints |
| `SESSION_SECRET` | Optional | Custom session signing key (auto-derived from `ADMIN_SECRET` if omitted) |
| `PORT` | Optional | HTTP & WebSocket server port (defaults to `8080`) |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS allowed origins (e.g. `http://localhost:3000`) |
| `CLOUDINARY_CLOUD_NAME` | Optional | Cloudinary cloud name for media storage |
| `CLOUDINARY_API_KEY` | Optional | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Optional | Cloudinary API secret |
| `GIPHY_API_KEY` | Optional | GIPHY API key for animated GIF search |

---

## Developer Troubleshooting Guide

### 1. PowerShell Script Execution Blocked (`npm.ps1`)
**Error:**
```text
File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
```
**Fix:**
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
Restart your terminal. (Or run `npm.cmd run dev` as a temporary fallback).

---

### 2. Dependency Installation Conflict (`ERESOLVE`) & Missing `dotenv`
**Error:**
```text
npm error code ERESOLVE
npm error Could not resolve dependency:
npm error peer cloudinary@"^1.21.0" from multer-storage-cloudinary@4.0.0
npm error Found: cloudinary@2.8.0
```
This causes `Cannot find module 'dotenv'` because npm aborts installation.

**Fix:**
Ensure `backend/.npmrc` contains:
```ini
legacy-peer-deps=true
```
Then run:
```powershell
npm install
```

---

### 3. Missing `.env` & Fatal `MONGODB_URI` Crash
**Error:**
```text
◇ injected env (0) from .env
error: FATAL ERROR: MONGODB_URI environment variable is not set.
error: Failed to load chat states: Operation `chatstates.find()` buffering timed out after 10000ms
```
**Fix:**
Create `backend/.env` from `.env.example` and set `MONGODB_URI`:
- **Atlas Cloud:** `MONGODB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/pulsechat?retryWrites=true&w=majority"`
- **Local:** `MONGODB_URI="mongodb://localhost:27017/pulsechat"`

Verify with:
```powershell
node -e "require('dotenv').config(); console.log('MongoDB URI loaded:', !!process.env.MONGODB_URI)"
```

