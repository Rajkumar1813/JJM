# TV Player Flow & Architecture

## Purpose & Responsibilities
The JJM TV Player is a Flutter application designed strictly for Android TV hardware. It functions as an unattended digital signage kiosk. Its responsibilities include:
- Auto-starting on TV boot (BootReceiver) and locking out standard Android UI (Kiosk mode).
- Rendering web-based queue URLs beneath Flutter UI overlays (videos, images, announcements).
- Pairing securely with the backend via 6-digit codes.
- Caching media locally for offline resiliency using SHA-256 validation.
- Recovering gracefully from network loss, queue stalls (MutationObserver polling), and API errors.
- Reporting exact diagnostic states (Heartbeats, Snapshots, Command Acks) back to the server.

## Tech Stack & Folder Tree
**Stack:** Flutter (Dart), `webview_flutter` (for the queue), `video_player`, `audioplayers` (siren generation), `socket_io_client`, `path_provider`, Android Kotlin (for BootReceiver & MethodChannels).

```text
JJM_TV_player/
├── android/
│   ├── app/src/main/kotlin/com/jjm/tv/
│   │   ├── MainActivity.kt        # Implements MethodChannel for System Overlays
│   │   └── BootReceiver.kt        # Intercepts boot events, reads kioskLock from SharedPreferences
├── lib/
│   ├── core/
│   │   ├── config/                # Environment variables parsing
│   │   ├── native/                # MethodChannel wrappers (KioskChannel.dart)
│   │   ├── network/               # API service (REST calls, interceptors)
│   │   ├── queue/                 # QueueMonitor (Javascript DOM polling logic)
│   │   ├── storage/               # SharedPreferences for caching offline configs
│   │   ├── sync/                  # MediaCacheService (LRU budget, downloads, SHA-256)
│   │   └── websocket/             # SocketService (Socket.IO event handlers)
│   ├── models/                    # Data classes (PlaylistItem, ResolvedConfig)
│   ├── screens/
│   │   ├── display/               # Main kiosk UI Engine (display_engine.dart)
│   │   ├── pairing/               # 6-digit PIN display UI
│   │   └── splash/                # Initial boot loading screen
│   └── main.dart                  # Flutter entry point (wakelock init, cache init)
└── assets/audio/                  # Generated siren.wav file
```

## Setup & Run

### Environment Variables
Currently, standard configuration is defined internally via the UI pairing process, but the backend URL is hardcoded during compilation or set dynamically via an admin debug dialog.

### Build & Deploy
- **Analyze**: `flutter analyze`
- **Build APK**: `flutter build apk --release` (Generates a FAT APK compatible with Android TV architectures).
- **Deployment**: Install via USB drive to Android TV or push via MDM.
- **Bootloader**: Upon first launch, accept the "Draw over other apps" permission by entering the Technician Menu (long press top-right for 5s, enter PIN `9999`).

## Working Flow Diagrams

### Boot Sequence & FSM State Diagram
```mermaid
stateDiagram-v2
    [*] --> SPLASH
    SPLASH --> PAIRING: No stored credentials
    SPLASH --> SYNCING: Has credentials
    
    PAIRING --> SYNCING: User enters code on Admin UI
    
    SYNCING --> QUEUE: Reconcile success (Empty Playlist)
    SYNCING --> AD_PLAYBACK: Reconcile success (Has Playlist)
    SYNCING --> DEGRADED: Network failure, using cached Config
    
    QUEUE --> AD_PLAYBACK: Loop timer expires
    AD_PLAYBACK --> QUEUE: Ad duration ends
    
    QUEUE --> RECOVERING: QueueMonitor detects stall
    RECOVERING --> QUEUE: WebView successfully reloaded
    
    state "Any State" as AnyState
    AnyState --> EMERGENCY: Backend emits 'emergency:update'
    EMERGENCY --> QUEUE: Backend emits 'emergency:clear' or expiresAt reached
```

### Media Sync & Caching Flow
```mermaid
sequenceDiagram
    participant D as DisplayEngine
    participant M as MediaCacheService
    participant API as Network (REST)
    participant Disk as Local FileSystem
    
    D->>M: syncPlaylist(playlist, manifestVersion)
    loop Every Item
        M->>Disk: Check if file exists?
        alt File exists
            M->>M: Validate SHA-256 Hash
            alt Hash Match
                M->>M: Mark as valid (Update LRU access time)
            else Hash Mismatch
                M->>Disk: Delete invalid file
                M->>API: Download File -> Disk
            end
        else File Missing
            M->>API: Download File -> Disk
        end
    end
    M->>Disk: Enforce LRU 500MB Budget
    M-->>D: Sync Complete
    D->>API: Update heartbeat with new mediaManifestVersion
```

### Technician Menu Flow (Hidden Kiosk Override)
```mermaid
flowchart TD
    A[Long Press Top Right Corner 5s] --> B[PIN Dialog]
    B -->|PIN incorrect| C[Dismiss]
    B -->|Enter '9999' or config PIN| D[Show Technician Menu]
    D --> E[Toggle Kiosk Lock]
    D --> F[Request Overlay Permission]
    D --> G[Clear Media Cache]
```

## Error Handling & Security Notes
- **Authentication**: Stores `X-Device-Token` securely in SharedPreferences. On `401 Unauthorized` responses from the backend API, the device wipes its token and gracefully downgrades to the PAIRING screen.
- **Offline Resiliency**: If REST calls fail during boot, the system relies on `flutter.cached_display_config` generated during the last successful ping. Ad media falls back to `file://` URIs natively avoiding black screens.
- **Queue WebView Freeze**: A JS script is injected into the WebView. `QueueMonitor` polls `window.lastMutation`. If frozen > thresholds, it initiates an exponential backoff reload (to avoid flooding the hospital's patient software).
- **Snapshot Limitations**: Android `RepaintBoundary` cannot capture standard native WebViews. The snapshot logic explicitly transmits `source='queue-webview-uncaptured'` vs `flutter-layer` back to the server so admins know they are seeing a truthful approximation of the UI.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Stuck on Pairing Screen | Device token was revoked server-side, or the TV lost internet access before completing the pairing lifecycle. | Re-enter the pairing code on the Admin Website. |
| Emergency overlay doesn't appear | The target IDs for the emergency don't match this screen/department, OR the duration expired. | Create a 'Global' emergency or verify screen assignment. |
| Media shows briefly as black | The cached file was deleted externally or failed a checksum test dynamically right before render. | Automatically recovers next loop. Admin can hit "Clear Cache" remotely to force a flush. |
| App minimizes unexpectedly | Android TV OS reclaimed memory or killed the app. | If Kiosk Lock is enabled via Technician Menu, `BootReceiver` attempts to aggressively relaunch the app. |

## Manual QA Checklist (TV Player)
- [ ] Connect Android TV to internet. Open app, verify 6-digit pairing code appears.
- [ ] Pair via Admin UI. Verify TV immediately transitions to the Queue URL defined in its Department.
- [ ] Unplug ethernet. Verify TV continues playing cached images/videos in a loop flawlessly without crashing.
- [ ] Re-plug ethernet. Wait 20 seconds. Send an Emergency Broadcast from Admin UI. Verify Siren audio plays and red overlay takes over.
- [ ] Long-press top right corner for 5 seconds. Verify Technician Menu opens with correct PIN. Use menu to grant overlay permissions.
