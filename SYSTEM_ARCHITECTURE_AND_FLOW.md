# System Architecture & Flow

This document provides a high-level overview of how the Admin Website, Backend API, and Android TV Player interact across the JJM Digital Signage Network.

## The Tri-Stack Architecture
```mermaid
graph TD
    A[Admin Website - React] <-->|REST API + WebSocket| B(Backend Server - Node.js)
    B <-->|MySQL2 Connection Pool| C[(MySQL 8 Database)]
    B <-->|REST API + WebSocket| D[TV Player - Android TV/Flutter]
    
    style A fill:#4F46E5,stroke:#312E81,stroke-width:2px,color:#fff
    style B fill:#059669,stroke:#064E3B,stroke-width:2px,color:#fff
    style C fill:#EA580C,stroke:#7C2D12,stroke-width:2px,color:#fff
    style D fill:#2563EB,stroke:#1E3A8A,stroke-width:2px,color:#fff
```

## Global Concepts

### 1. Database & Persistence (MySQL 8)
- The entire system is anchored to a raw MySQL 8 database. 
- There are no intermediary ORMs masking performance, no local SQLite databases bridging gaps, and no Docker abstraction layers. 
- The backend handles automatic schema migrations natively on boot using raw `.sql` files.
- The `hospital_signage` database is the sole source of truth for campaigns, device pairings, administrative telemetry, and emergency declarations.

### 2. Live Synchronization (WebSockets)
WebSockets are heavily employed to ensure physical TVs update visually within milliseconds of an administrator's command:
- **`config:update`**: Emitted whenever a playlist, campaign, or device setting changes. Tells TVs to re-fetch their JSON payload.
- **`emergency:update`**: Overrides whatever is on the screen with a red flashing siren. Includes `expiresAt` limits mapped to the server's authoritative clock.
- **`command:new`**: Used for manual tasks like `TAKE_SNAPSHOT` or `SYNC_MEDIA`. Executes a complex 5-stage lifecycle (`CREATED` -> `SENT` -> `RECEIVED` -> `APPLIED` -> `ACKNOWLEDGED`).

### 3. Media Integrity (SHA-256)
All images and videos uploaded to the backend generate a SHA-256 hash. When a TV encounters a media file in its assigned config:
1. It looks at the local Android file system.
2. It hashes the file locally and compares it to the server's hash.
3. If valid, it plays completely offline without eating network bandwidth. If invalid, it deletes the file and downloads a fresh copy.

### 4. Resiliency & Diagnostics
- **Queue WebView Polling**: The Flutter app injects JavaScript into the hospital's live patient queue URL. It checks `window.lastMutation` every 10 seconds. If the page freezes but the network remains alive, Flutter performs a localized exponential-backoff reload, hiding this stutter behind cached advertisements.
- **CCTV Snapshots**: The TV leverages a Dart `image` parser to honestly scrape its own internal UI layers, converting them to compressed JPEGs (q60, <640px) which are streamed strictly when a Dashboard admin is connected to a `snapshot:watch` socket.
- **Heartbeats**: Every 20 seconds, the TV reports its config version, media sync status, and screen label. A Node.js CRON job purges silent screens, moving them to an `OFFLINE` status dynamically.

## Cross-Layer Flow Examples

### Pairing a New TV
```mermaid
sequenceDiagram
    participant TV as Android TV
    participant API as Backend Node.js
    participant UI as Admin React
    participant DB as MySQL 8
    
    TV->>API: Boots up, generates 6-digit random code
    TV->>API: Socket Join Room 'pairing:join:123456'
    
    UI->>API: Admin enters '123456' in UI (POST /pairing/confirm)
    API->>DB: Create 'devices' row, Generate X-Device-Token
    API->>TV: Emit 'pairing:success' with Token to Room '123456'
    
    TV->>TV: Wipes old cache, stores Token natively
    TV->>API: GET /reconcile with new Token
    API->>DB: Link device to 'screens' table
    API-->>TV: Send default hospital configuration
```

### Emergency Alert Trigger
```mermaid
sequenceDiagram
    participant UI as Admin React
    participant API as Backend Node.js
    participant DB as MySQL 8
    participant TV1 as TV (Dept Cardiology)
    participant TV2 as TV (Dept Pediatrics)
    
    UI->>API: POST /emergency { target_type: 'DEPT', target_ids: ['CARD-1'] }
    API->>DB: Insert into 'emergency_events'
    API->>API: Emit 'emergency:update' to room 'dept:CARD-1'
    
    API->>TV1: Socket receives emergency payload
    TV1->>TV1: Validate target against local ID
    TV1->>TV1: Transition UI to Flashing Red & Play Siren Audio
    
    Note right of API: TV2 is in a different room and receives nothing.
```
