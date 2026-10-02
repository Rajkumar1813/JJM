# JJM Hospital Digital Signage

A unified system for Hospital Queue Management and Digital Signage, consisting of three components:
1. `backend/`: Node 20, Express 4, Socket.IO 4, MongoDB backend.
2. `Admin_Website/`: React 18, Vite 6 Admin Dashboard.
3. `JJM_TV_player/`: Flutter Android TV kiosk app.

## Documentation
Please refer to `docs/JJM_ENGINEERING_GUIDE.md` for the complete architecture, setup instructions, database schema, and socket contracts.

## Quick Start
```bash
# Backend
cd backend
npm ci --include=dev
npm run dev

# Admin UI
cd Admin_Website
npm ci
npm run dev

# TV App
cd JJM_TV_player
flutter pub get
flutter run
```
