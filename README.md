# JJM Hospital - Digital Signage & Queue Display System

A comprehensive hospital digital signage and queue management system engineered for **JJM Hospital Kashipur**. The platform synchronizes doctor OPD queues with high-impact hospital advertisements, announcements, emergency broadcasts, and multi-zone screen layouts.

---

## 🏥 Architecture Overview

The system consists of 3 synchronized layers:

```
                  ┌────────────────────────────────────────────────┐
                  │          JJM Hospital Control Server           │
                  │        (Node.js + Express + Socket.IO)         │
                  │                  Port: 5000                    │
                  └───────────────────────┬────────────────────────┘
                                          │
                  ┌───────────────────────┴────────────────────────┐
                  │                                                │
                  ▼                                                ▼
     ┌─────────────────────────┐                     ┌──────────────────────────┐
     │   Admin Control Web     │                     │      JJM TV Player       │
     │   (React + Vite + TS)   │                     │  (Flutter Android/Web)   │
     │       Port: 5173        │                     │   Zero-Config Auto-Pair  │
     └─────────────────────────┘                     └──────────────────────────┘
```

1. **`backend/`**: Central Node.js & Socket.IO server managing screen registration, real-time sync, playlist scheduling, media uploads, and live health monitoring.
2. **`Admin_Website/`**: Modern, glassmorphic management dashboard styled with JJM Hospital's royal purple brand identity (`#6B3A8A`). Features 1-Click Broadcast, CCTV-style live preview grids, screen pairing, and full CRUD for departments, screens, campaigns, and playlists.
3. **`JJM_TV_player/`**: Flutter TV player designed for Android TV, Fire TV, and commercial displays. Auto-probes the local hospital network in the background to fetch pairing sessions without manual IP entry.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18 or v20+)
- npm or pnpm
- Flutter SDK (3.x+)

---

### 1. Backend Server
```bash
cd backend
npm install
npm run build
npm start # or npm run dev
```
- Server URL: `http://localhost:5000`
- Health check: `http://localhost:5000/api/health`

---

### 2. Admin Dashboard
```bash
cd Admin_Website
npm install
npm run dev
```
- Dashboard URL: `http://localhost:5173`
- Network URL: `http://<your-lan-ip>:5173`

---

### 3. JJM TV Player (Android TV / Windows / Web)
```bash
cd JJM_TV_player
flutter pub get

# For Android TV (physical device or emulator)
flutter run -d android

# For Windows test
flutter run -d windows

# For Web test
flutter run -d chrome
```

---

## 📺 Zero-Config TV Pairing Process

1. Install and launch the **JJM TV Player** app on the Android TV.
2. The TV automatically discovers the backend server over the hospital Wi-Fi/LAN and displays a unique **6-digit pairing code** on the screen.
3. Open the **Admin Dashboard** (`http://<server-ip>:5173`) on any computer.
4. Go to **Screens** ➔ Click **Pair New Screen**.
5. Enter:
   - **Screen Name**: e.g., `OPD Room 1 - Cardiology`
   - **6-Digit Pairing Code**: displayed on the TV
   - **Department**: select or create department
   - **Doctor HMS Queue URL**: e.g. `https://hms.jjmhospitalkashipur.com/qd/DOC038`
6. Click **Pair Screen Now**.
7. The TV immediately receives the credentials via real-time WebSocket, starts the display engine, and loads the doctor's live queue with scheduled hospital campaigns!

---

## 🛠️ Production Deployment Guide

### Deploying Backend (Linux VPS / Ubuntu / Docker)
1. Use **PM2** to manage the Node.js process:
   ```bash
   cd backend
   npm install --production
   npm run build
   pm2 start dist/server.js --name "jjm-signage-backend"
   pm2 save
   pm2 startup
   ```
2. Configure Nginx as Reverse Proxy with SSL (Certbot Let's Encrypt).

### Deploying Admin Website
1. Build production static bundle:
   ```bash
   cd Admin_Website
   npm run build
   ```
2. Serve `/dist` via Nginx or host on Vercel / Netlify / Cloudflare Pages.

### Building TV Player APK for Android TV
```bash
cd JJM_TV_player
flutter build apk --release
```
The generated APK (`build/app/outputs/flutter-apk/app-release.apk`) can be installed on Android TV boxes via USB or ADB.

---

## 🎨 Design Guidelines & Palette
- **Primary Purple**: `#6B3A8A`
- **Lavender Accent**: `#9D6BBA`
- **Soft Light Lavender**: `#C084FC`
- **Background**: Modern Light Minimalist `#F8FAFC`
- **Cards & Glassmorphism**: Frosted glass with subtle purple glow
