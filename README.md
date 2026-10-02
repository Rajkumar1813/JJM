# JJM Hospital Digital Signage System

A robust, resilient digital signage platform built for hospitals. It enables central management of Android TV screens that sit above patient wards, blending live patient queue webviews with marketing campaigns and critical emergency overrides.

## Ecosystem Overview

This monorepo consists of three tightly coupled, yet distinct layers:

1. **[Backend Server](./backend/BACKEND_FLOW.md)** (`/backend`): 
   - A Node.js API (Express + MongoDB 8 + Socket.IO) handling all business logic, device configuration states, offline media sync, and real-time socket emitting.
2. **[Admin Dashboard](./Admin_Website/ADMIN_WEBSITE_FLOW.md)** (`/Admin_Website`): 
   - A React SPA giving hospital administrators granular control over campaigns, remote snapshot viewing, media libraries, and device pairing.
3. **[TV Player Kiosk](./JJM_TV_player/TV_PLAYER_FLOW.md)** (`/JJM_TV_player`):
   - A Flutter Android TV application handling offline caching (SHA-256 validated), automated queue DOM-polling to prevent freezes, hardware boot takeover, and emergency siren playback.

## Core Directives & Guiding Principles
- **MongoDB Only**: The platform exclusively uses MongoDB 8 as the singular database layer. No embedded SQLite, no  wrappers, and no ORM abstractions that hide queries.
- **Data Integrity**: Contains strictly zero mock, seed, or dummy data. Real hospital data is generated purely via physical UI usage or deliberate admin workflows.
- **Offline Resiliency**: TV screens are assumed to have intermittent network connections. Media is buffered, verified, and played locally, preventing black screens.

## Quick Start
1. Ensure MongoDB 8 is running locally.
2. Initialize the backend environment via `backend/docs/MongoDB_SETUP.md`.
3. Start the backend: `cd backend && npm install && npm run dev`
4. Start the admin website: `cd Admin_Website && npm install && npm run dev`
5. Compile and install the TV APK: `cd JJM_TV_player && flutter build apk --release`

## Deep Dive Documentation
Each subsystem has a dedicated FLOW document mapping its exact responsibilities, environment variables, APIs, and data models with Mermaid diagrams:
- [Backend Flow](./backend/BACKEND_FLOW.md)
- [Admin Website Flow](./Admin_Website/ADMIN_WEBSITE_FLOW.md)
- [TV Player Flow](./JJM_TV_player/TV_PLAYER_FLOW.md)
- [System Architecture Overview](./SYSTEM_ARCHITECTURE_AND_FLOW.md)

