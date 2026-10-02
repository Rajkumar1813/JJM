# JJM Hospital Signage — Engineering Guide (as implemented)

> Generated from a line-by-line read of the uploaded `JJM.zip` (backend, Admin_Website, JJM_TV_player).
> It describes what the code **actually does today**, not what older docs claim. Every problem listed in
> section 11 was found in the code; file paths and behaviors are exact. Nothing here uses dummy data.
> Companion file: `AGENTS.md` (short rules that Antigravity auto-loads).

---

## 0. Kaise use karein (Antigravity ke saath) — Hinglish

1. Is zip ke do files apne project ke root me rakho: `AGENTS.md` (root) aur `docs/JJM_ENGINEERING_GUIDE.md`.
   Antigravity root ki `AGENTS.md` (ya `GEMINI.md`) khud padh leta hai; guide ko prompt me `@docs/JJM_ENGINEERING_GUIDE.md` se attach karo.
2. **Ek baar me ek phase** chalao (section 12). Har phase ka prompt neeche ready hai, bas copy-paste karo.
3. Har phase ke baad Antigravity se build/check commands ka output maango (`AGENTS.md` section 3) aur diff review karke hi merge karo.
4. Pehle **Phase 0** (secrets rotate + environment) zaroor karo, warna baaki fixes real database par test nahi ho payenge.
5. Koi bhi real value (URL, password, hospital naam) Antigravity ko mat banane do. Rule hai: "ask, do not invent".

---

## 1. System overview

```
 Admin_Website (React)  ──REST /api/*  + Socket.IO (auth.token)──┐
                                                                  ├──> backend (Express + Socket.IO) ──> MongoDB
 JJM_TV_player (Flutter) ──REST /api/display/* + Socket.IO ───────┘
        (X-Device-Token / auth.{screenId,deviceToken})
```

- **Backend** is the single source of truth. It resolves, per screen, *what to play* (queue WebView, ads, playlist),
  pushes it over Socket.IO, tracks device health, and runs a 15-second scheduler.
- **TV player** shows the hospital's live doctor-queue web page (`queueUrl`) in a WebView and interleaves ads/videos
  according to the resolved playlist. Emergency alerts take over the whole screen with a siren.
- **Admin** manages departments, screens (pairing), media, playlists, campaigns, emergencies, settings, audit.

### 1.1 Real end-to-end flows

**Pairing a TV**
1. TV (no credentials) -> `POST /api/pairing/session` -> backend creates 6-digit code (TTL 15 min, stored in `pairing_sessions`).
2. TV opens Socket.IO with `auth:{isPairing:true}` and emits `pairing:join <code>` (joins room `pairing:<code>`).
3. Admin enters code + name/department/location/queueUrl -> `POST /api/screens/pair-claim`.
4. Backend creates a `devices` doc + `screens` doc (or updates an existing screen id), issues `deviceToken = DEV-<uuid>`,
   marks session `paired`, emits `paired {success, screenId, deviceToken, screen, config}` to room `pairing:<code>`.
5. TV stores `screenId` + `deviceToken` (SharedPreferences), caches config, opens `DisplayEngine`.
   **Gap:** if the socket event is missed there is no REST fallback (P0-4).

**Normal operation**
1. TV boots -> socket connect (`auth:{screenId,deviceToken}`) -> `screen:register` -> `POST /api/display/:id/reconcile`.
2. Reconcile returns `{config, activeEmergency, pendingCommands, configVersion, mediaManifestVersion}`.
3. TV caches config, syncs media to disk, runs the playlist loop; sends `screen:heartbeat` every 20 s over the socket.
4. Admin changes something -> backend bumps `targetConfigVersion` and emits `config:update {config}` to `screen:<id>`.
5. TV applies config and reports `appliedConfigVersion` in the next heartbeat. Mismatch => health `UPDATE_REQUIRED`.

**Command (SYNC_CONFIG, RELOAD_QUEUE, RESTART_PLAYER, CLEAR_CACHE, TAKE_SNAPSHOT, PLAY/STOP_CAMPAIGN, EMERGENCY_OVERRIDE)**
`CREATED -> SENT -> RECEIVED -> APPLIED -> ACKNOWLEDGED` (or `FAILED` / `TIMEOUT`). Command lifetime is **35 s**
(`commandService.dispatchCommand`); the scheduler flips unfinished commands to `TIMEOUT`. `EXPIRED` exists in types
but is never set.

**Emergency**
Admin `POST /api/emergency/broadcast` -> doc in `emergency_events` (`isActive:true`, `expiresAt` epoch-ms or null) ->
backend emits `emergency:update {announcement}` and a fresh `config:update` (with `settings.emergencyAnnouncement`) to every
screen. TV re-checks targeting (all / department / screen), shows red/amber overlay and loops `assets/audio/siren.wav`.
Dismiss: `POST /api/emergency/dismiss` (clears **all** active emergencies) or scheduler auto-expiry.

---

## 2. Repository map (actual)

```
JJM/
├── AGENTS.md                         (add)  rules for Antigravity
├── docs/JJM_ENGINEERING_GUIDE.md     (add)  this file
├── README.md, SYSTEM_ARCHITECTURE_AND_FLOW.md, CLEANUP_REPORT.md   (OUTDATED, see section 10)
├── backend/
│   ├── src/server.ts                 Express app, CORS, routes, health, startServer()
│   ├── src/realtime/socket.ts        Socket.IO auth + events
│   ├── src/routes/*.routes.ts        auth, screens, departments, media, campaigns, playlists,
│   │                                 display (TV), publicDisplay, pairing, emergency, settings, audit
│   ├── src/services/                 resolverService, commandService, pairingService, healthMonitor,
│   │                                 scheduler, configPublisher (UNUSED), logger
│   ├── src/db/mongo.ts               MongoClient, getDb, withTransaction (needs replica set)
│   ├── src/db/migrate.ts             lock + run migrations + seed admin from env
│   ├── src/db/migrations/001_init.ts indexes only
│   ├── src/db/repositories/*         screen, campaign, command, device, department, emergency, media, misc(playlist,pairing,audit,system)
│   ├── src/middleware/auth.middleware.ts   admin session + device token checks
│   ├── src/tests/time_logic.test.ts  pure unit tests (copies of logic, not imports)
│   ├── scripts/seed-admin.ts         manual admin upsert (has default credentials -> remove, P0-8)
│   ├── render.yaml                   OUTDATED env keys (P0-2)
│   ├── data/hospital_signage.db*     LEGACY SQLite files (delete, P2-1)
│   └── dist/                         generated; contains stale sqlite/mysql output
├── Admin_Website/src/
│   ├── App.tsx                       auth gate, data fetch, socket listeners, tab routing
│   ├── services/{api,socket}.ts      axios + socket.io client
│   ├── pages/*                       Dashboard, Screens, Departments, MediaLibrary, Playlists, Campaigns,
│   │                                 EmergencyAnnouncements, LiveFeeds, DeploymentReconciliation,
│   │                                 AuditLogs, Settings, Login, PublicDisplayView
│   └── components/*                  Header, Sidebar, PairScreenModal, ScreenDetailModal, OneClickGlobalModal
└── JJM_TV_player/
    ├── lib/main.dart                 boot: kiosk UI mode, wakelock, cache init, credentials check
    ├── lib/core/{config,network,websocket,storage,sync,queue,native}/
    ├── lib/models/display_models.dart
    ├── lib/screens/{pairing/pairing_view.dart, display/display_engine.dart}
    └── android/app/src/main/{AndroidManifest.xml, kotlin/com/jjm/tv/{MainActivity,BootReceiver}.kt}
```

---

## 3. Configuration (what is really read)

### 3.1 Backend (`process.env`)
| Var | Required | Used in | Notes |
|---|---|---|---|
| `MONGODB_URI` | yes | `db/mongo.ts` | process exits if missing. Atlas/replica set required for transactions |
| `MONGODB_DB_NAME` | no | mongo.ts | default `hospital_signage` (`scripts/seed-admin.ts` ignores it -> bug) |
| `MONGODB_MAX_POOL` | no | mongo.ts | default 10 |
| `ADMIN_EMAIL`,`ADMIN_PASSWORD`,`ADMIN_PIN` | only on first boot | `db/migrate.ts` | seeds first admin **only if `admin_users` is empty**; else `process.exit(1)` |
| `CORS_ORIGIN` | yes in prod | `server.ts` | comma list; `*` is **rejected in production** |
| `PORT`,`HOST`,`NODE_ENV` | no | server.ts | 5000 / 0.0.0.0 |
| `UPLOAD_DIR` | no | server.ts, media.routes.ts | files in `<UPLOAD_DIR>/media`, served at `/uploads` |

**Not used by code** (remove from env files/docs): `DB_HOST/PORT/USER/PASSWORD/NAME/POOL_SIZE/SSL` (old MySQL),
`JWT_SECRET`, `PUBLIC_URL`, `DATA_DIR`. `.env.development` and `.env.production` are **never loaded** (`dotenv.config()` reads `.env` only).

### 3.2 Admin: `VITE_API_URL` (build-time). Fallback hard-coded to `https://jjm-advertising.onrender.com` in `services/api.ts`.
### 3.3 TV: `--dart-define=BACKEND_URL=...` (fallback hard-coded to the same URL in `core/config/app_config.dart`).
The TV also probes `http://10.0.2.2:5000` and `http://localhost:5000` and the manifest allows cleartext HTTP (P2-4).

### 3.4 Deployment facts that matter
- Backend on Render: free tier sleeps -> 30-60 s cold start; disk is ephemeral unless a paid disk is attached
  (`render.yaml` mounts `/data`; uploads then go to `/data/uploads`). Uploaded ads vanish on free tier redeploys.
- Admin on Vercel (`vercel.json` rewrites everything to `index.html`).
- MongoDB Atlas network access must allow the backend host (0.0.0.0/0 is currently set in the user's Atlas; fine for now).

---

## 4. Data model (MongoDB `hospital_signage`)

| Collection | `_id` | Key fields | Indexes (001_init) |
|---|---|---|---|
| `admin_users` | `ADM-…` | email, passwordHash, pinHash (bcrypt), role (`admin`/`editor`), isActive, lastLoginAt | email unique |
| `admin_sessions` | — | tokenHash (sha256), adminUserId, expiresAt (ms), expiresAtDate, ip, userAgent | TTL on expiresAtDate |
| `departments` | `DEP-…` | name, code (UPPER), floor, description, defaultQueueUrl, defaultPlaylistId, status | code unique |
| `screens` | `SCR-…` | name, code, departmentId, deviceId, location, queueUrl, staleThresholdSeconds(180), targetConfigVersion, appliedConfigVersion, mediaManifestVersion, status, connectionStatus, healthStatus, lastHeartbeat(+At), lastSyncAt, currentContent, playlistId, deviceToken, playerVersion, isPaused, powerState, deviceMetadata, displayKey | code unique; displayKey unique sparse; departmentId, healthStatus, lastHeartbeat |
| `devices` | `HW-…` | deviceToken, platform, model, appVersion, ipAddress, lastSeenAt | deviceToken unique |
| `campaigns` | `CAMP-…` | name, type (global/department/screen/emergency), contentType, mediaId/mediaUrl/playlistId, priority(50), intervalMinutes(3), displayDurationSeconds(15), daysOfWeek, startDate/endDate (strings), startTime/endTime (HH:mm), status, **targets[] {targetType,targetId}** (embedded) | status+priority; targets.* |
| `playlists` | `PL-…` | name, description, items[{id,type,mediaId,mediaUrl,title,duration,order}], isDefault | — |
| `media` | `MED-…` | title, type, url (`/uploads/media/<file>` or external), sha256Hash, fileSize, duration, tags, category | — |
| `device_commands` | `CMD-…` | screenId, commandType, payload, status, expiresAt(ms), sent/received/applied/acknowledgedAt, errorMessage | screenId+status+expiresAt; TTL 30 d on createdAt |
| `emergency_events` | `EMERG-…` | title, message, severity, displayMode, targetType, targetIds[], highlightScreen, isActive, durationSeconds, expiresAt(ms/null), clearedAt | isActive+expiresAt |
| `pairing_sessions` | — | pairingCode, socketId, deviceMetadata, status, screenId, deviceToken, expiresAt(ms), expiresAtDate | pairingCode unique; TTL |
| `audit_logs` | `AUD-…` | action, entity, entityId, details, timestamp, userId, ip | timestamp, action |
| `settings` | key string | `value` = JSON-stringified value | — |
| `system_versions` | `GLOBAL_CONFIG`,`MEDIA_MANIFEST` | versionNumber, updatedAt | — |
| `screen_snapshots` | — | screenId, image (data-URL JPEG), capturedAt | **missing index** (add unique screenId) |
| `job_locks`, `schema_migrations` | — | distributed locks / applied migrations | — |

Notes: no seed data exists besides the first admin (from env) and the two `system_versions` docs. Foreign keys are
logical only. Screen delete, media create/delete, department delete and settings PUT use **transactions**.

---

## 5. Backend behavior in detail

### 5.1 Auth
- Admin login `POST /api/auth/login {email,password,pin}`: bcrypt-checks password **and** PIN, creates a 24 h session
  (`ADM-<64 hex>` token, only sha256 stored). Rate limit: 5 failed attempts / 15 min / IP.
- Admin requests: `Authorization: Bearer <token>` or `x-admin-token`. Socket: `auth.token`.
- Roles: only `requireSuperAdminAuth` (role must equal `admin`) guards `/api/auth/users*`. Every other admin route
  accepts any active user (so `editor` == admin for everything else).
- Device auth: `X-Device-Token` must equal `screens.deviceToken` for `:screenId`. Socket: `auth:{screenId,deviceToken}`.
- Public: `/api/health`, `/api/auth/login|logout`, `/api/pairing/session`, `/api/public-display/:id/config?key=`, `/uploads/*`.

### 5.2 Config resolution (`resolverService.resolveScreenConfig`) — contract used by TV and Admin
Order:
1. `screen.isPaused` -> playlist = one `queue` item (duration 9999), `settings.isPaused=true`.
2. Else highest-priority **eligible campaign** (`campaignRepo.getActiveForScreen`, filters: status `active`, target match
   ALL/department/screen, weekday, `startTime..endTime` string compare, `startDate/endDate`; timezone hard-coded `Asia/Kolkata`).
   - `contentType: playlist` or only `playlistId` -> that playlist's items.
   - `only_queue` -> queue item.
   - media campaign -> `[ad item(duration = displayDurationSeconds | media.duration | 15)]` plus, unless
     `single_*_only`, a `queue` item with duration `max(10, intervalMinutes*60)` (default 20).
3. Else screen playlist -> department default playlist -> any `isDefault` playlist -> first playlist -> single `queue` item (30 s).

Response shape (TV parses this in `display_models.dart`):
```jsonc
{ "screenId","screenName","departmentId","departmentName","queueUrl","staleThresholdSeconds",
  "configVersion",            // = screen.targetConfigVersion
  "mediaManifestVersion",     // = system_versions.MEDIA_MANIFEST
  "activeCampaign": {id,name,type,priority,contentType} | null,
  "playlist": [ {id,type:"queue|image|video|announcement",mediaId?,mediaUrl?,title,duration,order} ],
  "settings": { "transition","heartbeatSeconds","offlineMediaCached","isPaused","powerState",
                "emergencyAnnouncement"?, "announcementTicker"? } }
```
**Missing today:** `sha256Hash` per item (P1-1) and the Settings-page values the TV expects: `kioskLock`, `kioskPin`,
`soundAlerts` (P0-6). `getGlobalSettings()` is called but its result is unused.

### 5.3 Versions
`targetConfigVersion` (per screen) is incremented by campaign/screen/settings writes and scheduler status flips.
TV reports `appliedConfigVersion` (heartbeat/reconcile). `MEDIA_MANIFEST` increments on media create/delete.

### 5.4 Health (`healthMonitor.evaluateScreenHealth`)
`OFFLINE` if no heartbeat for >60 s -> else `EMERGENCY` (active emergency for screen) -> `UPDATE_REQUIRED`
(applied < target) -> `QUEUE_STALE` (queueLastUpdateAt older than `staleThresholdSeconds`) -> `DEGRADED`
(media error or queue disconnected) -> `ONLINE`. `GET /api/screens` recomputes health **without heartbeat payload**, so
`QUEUE_STALE`/`DEGRADED` only appear via live socket events and vanish on refetch (P1-5).

### 5.5 Scheduler (every 15 s, guarded by Mongo lock `jjm_scheduler_lock`)
watchdog (mark OFFLINE) -> campaigns (`scheduled->active`, `active->expired`; **string-compare bug**, P1-2) ->
emergencies auto-expire -> command timeouts -> audit purge (30 days hard-coded, runs every tick).

### 5.6 Uploads
`POST /api/media` (multipart `file`, `title`, `duration`, `category`, `tags`, `customUrl`): memory storage, 100 MB limit,
magic-byte check (jpeg/png/webp/mp4/webm), sanitized filename, SHA-256 stored. `customUrl` entries store
`sha256Hash:"unhashed"`. Delete is blocked (409) when referenced unless `?force=true` (UI does not use it).

---

## 6. REST API reference (all paths are under `/api`)

Auth legend: **P** public · **A** admin session · **SA** admin role `admin` · **D** device token (`X-Device-Token`, `:screenId` must match).

| Method & path | Auth | Purpose / body (zod-validated unless noted) |
|---|---|---|
| `GET /health` | P | DB ping; 503 if Mongo down |
| `POST /auth/login` | P | `{email,password,pin}` -> `{token,email,role}` |
| `POST /auth/logout` | P | revokes token |
| `GET /auth/me` | A | `{user:{id,email,role}}` |
| `POST /auth/change-password` | A | `{currentPassword,newPassword}` (no min length, does not revoke other sessions) |
| `GET/POST /auth/users`, `PATCH /auth/users/:id/disable` | SA | manage admins (no validation library used here) |
| `POST /pairing/session` | P | `{socketId?,deviceMetadata?}` -> `{session:{pairingCode,expiresAt,…}}` (100 / 15 min / IP) |
| `GET /public-display/:screenId/config?key=<displayKey>` | P | config + `activeEmergency` for browser display |
| `GET /display/:screenId/config` | D | resolved config |
| `POST /display/:screenId/reconcile` | D | `{appliedConfigVersion?,mediaManifestVersion?,playerVersion?}` -> config, activeEmergency, pendingCommands |
| `POST /display/:screenId/heartbeat` | D | REST heartbeat (**TV does not call it**, P1-5) |
| `POST /display/:screenId/commands/:commandId/{received,applied,ack,fail}` | D | command ACK fallback (no ownership check, P1-3) |
| `GET /screens`, `GET /screens/:id` | A | list (deviceToken stripped; includes `displayKey`) / detail + resolvedConfig |
| `POST /screens` | A | `{name,code?,departmentId,location?,queueUrl,playlistId?,staleThresholdSeconds?}` (defaults `playlistId:"PL-DEFAULT"`, code `DOC###` random -> collision risk) |
| `PATCH /screens/:id` | A | partial update, bumps version, emits config |
| `DELETE /screens/:id` | A | transaction: removes commands, snapshots, target refs |
| `POST /screens/pair-claim` | A | `{pairingCode,name,code?,departmentId,location?,queueUrl,staleThresholdSeconds?}` (does **not** check department exists) |
| `POST /screens/:id/unpair` | A | clears token, status `inactive`, emits `screen:unpaired` |
| `POST /screens/:id/command` (alias `/commands`) | A | `{commandType,payload?}` -> 202 (commandType not validated against enum) |
| `GET /screens/:id/commands` (alias `/command/history`) | A | last 15 commands |
| `POST /screens/:id/{toggle-pause,power,refresh,sync,reload-queue,restart-player,restart,clear-cache,request-snapshot}` | A | convenience actions (`power` body `{state:"on|off"}`) |
| `GET /screens/:id/snapshot` | A | `{image,capturedAt}` latest JPEG data-URL |
| `GET/POST/PATCH/DELETE /departments[/:id]` | A | `{name,code,floor?,description?,defaultQueueUrl?,defaultPlaylistId?,status?}`; delete blocked if screens use it. **Does not publish config** (P0-5). Missing `defaultQueueUrl` falls back to a hard-coded hospital URL (P0-8) |
| `GET /media`, `POST /media`, `DELETE /media/:id?force=` | A | see 5.6 |
| `GET/POST/PATCH/DELETE /campaigns[/:id]` | A | schema in `campaigns.routes.ts`; PATCH/DELETE bump **all** screens |
| `POST /campaigns/broadcast-global` | A | one-click ad to all screens; creates priority-95 campaign whose `endDate` is an ISO datetime |
| `GET/POST/PATCH/DELETE /playlists[/:id]` | A | `items` is `z.any()`; **no config publish** (P0-5) |
| `GET /emergency`, `GET /emergency/history`, `POST /emergency/broadcast`, `POST /emergency/dismiss`, `DELETE /emergency` | A | broadcast `{title,message,severity?,displayMode?,targetType?,targetIds?,highlightScreen?,durationSeconds?}` |
| `GET /settings`, `PUT /settings` | A | arbitrary key/value map (no whitelist); PUT bumps all screens (but resolver ignores values, P0-6) |
| `GET /audit-logs?limit=` | A | newest first (repo supports filters/offset, route does not) |

Error format: `{success:false,message,errors?}`. Unhandled errors return `err.message` (can leak driver text).

---

## 7. Socket.IO contract

**Handshake auth (one of):** `{token}` (admin -> room `admins`) · `{screenId,deviceToken}` (TV -> rooms `screen:<id>`, `dept:<deptId>`) ·
`{isPairing:true}` (TV pairing; may only `pairing:join`). Otherwise `Authentication error`.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| TV -> BE | `pairing:join` | `<code>` | joins `pairing:<code>` |
| TV -> BE | `screen:register` | `{screenId,appVersion,configVersion}` | marks online |
| TV -> BE | `screen:heartbeat` | `{screenId,currentContent,playerVersion,appliedConfigVersion,mediaManifestVersion,queueConnected,queueLastUpdateAt}` | every 20 s |
| TV -> BE | `screen:snapshot` | `{screenId,image,source,currentContent}` | stored in `screen_snapshots` |
| TV -> BE | `command:received|applied|ack|fail` | `{commandId,screenId,resultPayload?|errorMessage?}` | |
| BE -> TV | `paired` | `{success,screenId,deviceToken,screen,config}` | to `pairing:<code>` |
| BE -> TV | `config:update` | `{config,targetConfigVersion?}` | **TV ignores payloads without `config`** |
| BE -> TV | `device:command` | `{commandId,screenId,commandType,payload,expiresAt}` | |
| BE -> TV | `emergency:update` | `{announcement|null}` | |
| BE -> TV | `emergency:dismiss` | `{}` | |
| BE -> TV | `screen:unpaired` | `{screenId}` | TV wipes credentials -> pairing screen |
| BE -> Admin | `screens:changed` | — | App refetches everything (debounced 2 s) |
| BE -> Admin | `screen:status_change`, `screen:heartbeat_received`, `screen:snapshot_updated` | per screen | |
| BE -> Admin | `command:status_updated`, `commands:reaped` | command stage | |
| BE -> Admin | `emergency:update`, `emergency:broadcast`, `emergency:dismiss` | | |

**Listened by TV but never emitted by backend:** `command:request_snapshot`, `snapshot:watch` (dead code, P1-7).

---

## 8. Admin website map

Single-page app, no router. `App.tsx` holds state for screens/departments/media/playlists/campaigns/auditLogs, fetches all of it
on login and after every `screens:changed` (debounced) and passes props down. Auth = token in `localStorage.jjm_auth_token`
(+ `jjm_auth_user` flag). `?display=<id>` or `/display/<id>` renders `PublicDisplayView` without login.

| Page / component | API used | Known issues |
|---|---|---|
| Login | `POST /auth/login` | — |
| Dashboard | `/campaigns`, `/campaigns/broadcast-global`, `/screens/:id/{toggle-pause,power}` | quick broadcast ok |
| Screens | PATCH/unpair/commands/power/pause | — |
| PairScreenModal | `POST /screens/pair-claim` | falls back to department id `'DEP-OPD'` when none selected (P1-8) |
| ScreenDetailModal | commands, snapshot, PATCH | — |
| Departments | CRUD | edits don't reach TVs (P0-5) |
| MediaLibrary | `POST/DELETE /media` | no `force` delete flow; generic error text |
| Playlists | CRUD | edits don't reach TVs (P0-5) |
| Campaigns | CRUD | UI has **no** start/end date, time window or weekday inputs (always all days); duplicate loses `playlistId` and sends status `draft` |
| EmergencyAnnouncements | `/emergency*` | dismiss clears all; `displayMode` fixed `takeover` |
| LiveFeeds | snapshot + `TAKE_SNAPSHOT` | queue WebView renders blank in snapshots (P1-7) |
| DeploymentReconciliation | `/screens`, SYNC_CONFIG | — |
| Settings | `GET/PUT /settings` | values not applied (P0-6) |
| PublicDisplayView | **wrong endpoints** | P0-7 |

---

## 9. TV player map

- `main.dart`: immersive UI, landscape lock, wakelock, `MediaCacheService.init()`, if credentials exist -> `DisplayEngine(cachedConfig)` else `PairingView`.
- `PairingView`: requests a session (tries saved/default/candidate URLs, 3 s timeout each), shows code, listens for `paired`; retries every 3 s;
  refreshes code every 14 min.
- `DisplayEngine` FSM: `BOOT -> AUTHENTICATING -> SYNCING -> READY -> QUEUE | AD_PLAYBACK | EMERGENCY` with `RECOVERING`, `DEGRADED`, `OFFLINE`, `ERROR`.
  Layers: WebView (queue) < ad overlay (image/video) < emergency overlay < status pill < hidden technician trigger (long-press top-right 150 px).
- `QueueMonitor`: injects a MutationObserver (`window.lastMutation`) and polls it every 10 s; only reloads when the page is *unresponsive*.
- `MediaCacheService`: 500 MB LRU cache keyed by sha256(URL); verifies hash only when the item carries `sha256Hash` (backend never sends it today).
- `ApiService`: base-URL discovery (saved -> default -> candidates, 1.8 s health probe), 8 s/5 s timeouts, `AuthException` on 401/403 -> back to pairing.
- Native: `MainActivity` (kiosk MethodChannel: bringToFront, minimizeApp, overlay permission), `BootReceiver` (starts app on boot **only if cached
  `settings.kioskLock == true`**, which the backend never sets -> TV does not auto-start, P0-6).
- Technician menu PIN check accepts a hard-coded `9999` in addition to `settings.kioskPin` (P0-8).

---

## 10. Existing docs vs reality (do not trust the old docs)

| File | Wrong / misleading statement | Reality |
|---|---|---|
| `CLEANUP_REPORT.md` | "PRODUCTION READY", test results, SCR-123-TV counts, `db_verify.js`, `v2_verification.ts` | those tests/files are not in `src`; legacy `data/*.db` still present; secrets exist in `.env`; many P0/P1 bugs below |
| `backend/BACKEND_FLOW.md` | SQL migrations, MySQL vars (`DB_PORT=3306`), `/api/admin/auth/login`, node-cron, JWT, folder tree (`api/`, `jobs/`) | Mongo only, `/api/auth/login`, `setInterval` scheduler, opaque session tokens, flat `routes/` + `services/` |
| `SYSTEM_ARCHITECTURE_AND_FLOW.md` | `.sql` migrations, `pairing:success`, `snapshot:watch` streaming, `GET /reconcile`, `DEP/CARD-1` examples | `paired` event, TS migrations, snapshot only via `TAKE_SNAPSHOT`, `POST /reconcile` |
| `README.md` | "MongoDB 8 running locally", link `MongoDB_SETUP.md` | needs replica set for transactions; file is `MONGODB_SETUP.md` |
| `Admin_Website/ADMIN_WEBSITE_FLOW.md` | Tailwind, `DevicePairing.tsx`, `ScreenManager.tsx`, `Emergency.tsx` | plain CSS variables; real page names in section 8 |
| `render.yaml` | `DB_HOST…`, `DB_PASS` | needs `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_*`, `CORS_ORIGIN`, `UPLOAD_DIR` |

Action: replace these by this guide (P2-2).

---

## 11. Issue register

Severity: **P0** = app cannot work reliably / security · **P1** = wrong behavior · **P2** = hardening & cleanup.
Each item: *Where* (exact files) · *Problem* · *Fix* · *Done when*.

### P0 — must fix first

**P0-1 Backend start-up & crash handling**
- *Where:* `backend/src/server.ts` (`startServer()`, `process.on('uncaughtException'|'unhandledRejection')`), `db/mongo.ts`.
- *Problem:* `startServer()` is called without `.catch`; if Mongo is unreachable the error becomes an "unhandled rejection" that is only logged,
  and the process may stay half-alive. `uncaughtException` is swallowed, leaving the server in an undefined state.
- *Fix:* validate env with zod at boot (clear message listing missing vars, never print values); `startServer().catch(err => { Logger.error(...); process.exit(1); })`;
  on `uncaughtException` log then `process.exit(1)` (Render restarts the service); keep `unhandledRejection` as log + exit for fatal DB errors.
  Add `MONGODB_URI` hint for the common Atlas errors (`Server selection timed out` -> IP allow-list/paused cluster, `Authentication failed` -> user/password or un-encoded special characters).
- *Done when:* with a wrong URI the process exits non-zero within ~15 s with one readable error line; with a correct one `/api/health` returns `db:"up"`.

**P0-2 Render/Vercel deployment config**
- *Where:* `backend/render.yaml`, `backend/package.json`, `.env.production`, `.env.development`.
- *Problem:* `render.yaml` lists MySQL vars and omits `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PIN`; `npm ci` with `NODE_ENV=production`
  skips devDependencies, so `tsc` (TypeScript) may be missing during build; production CORS rejects `*` (and `.env.production` says `CORS_ORIGIN=*`); `.env.development/.production` are never loaded;
  free-tier disk is ephemeral.
- *Fix:* rewrite `render.yaml` with the real keys (`sync:false` for secrets), `buildCommand: npm ci --include=dev && npm run build`; delete `.env.development/.env.production`;
  `.env.example` lists only used vars; document that `CORS_ORIGIN` = exact admin origin(s); keep `/data` disk + `UPLOAD_DIR=/data/uploads` (or move media to external object storage — ask owner).
- *Done when:* fresh Render deploy builds, boots, `/api/health` is `ok`, admin (Vercel) can log in without CORS errors, uploaded media survives a redeploy.

**P0-3 MongoDB transactions need a replica set**
- *Where:* `db/mongo.ts withTransaction`, used by `screenRepository.delete`, `mediaRepository.create/delete`, `departmentRepository.delete`, `settings.routes PUT`.
- *Problem:* works on Atlas, throws "Transaction numbers are only allowed on a replica set member or mongos" on standalone local `mongod`.
- *Fix:* document replica-set requirement (README + `.env.example`); at boot, detect topology (`db.admin().command({hello:1})`) and log a clear fatal message if no `setName`.
  Optionally remove transactions where a single atomic update suffices (media create + version increment can be ordered writes).
- *Done when:* standalone Mongo gives an explicit startup message; Atlas path unchanged.

**P0-4 Pairing resilience + cold start**
- *Where:* `JJM_TV_player/lib/core/network/api_service.dart`, `screens/pairing/pairing_view.dart`, `core/websocket/socket_service.dart`; `backend/src/routes/pairing.routes.ts`, `services/pairingService.ts`.
- *Problem:* (a) TV learns it was paired **only** from the `paired` socket event; `pairing:join` is not re-sent on reconnect; if missed, the TV stays on the code screen while the code is already consumed.
  (b) Timeouts are tuned for an always-on LAN server: 1.8 s health probe, 3 s pairing, 5 s heartbeat; Render cold start is 30-60 s. `getBaseUrl()` re-probes up to 5 URLs every call when none responds.
  (c) `/pairing/session` limit 100 / 15 min / IP is shared by every TV behind the hospital NAT.
- *Fix:* backend: on session creation generate `pollSecret` (returned only to the TV); add `GET /api/pairing/session/:code?secret=` returning `{status}` and, once, `{screenId,deviceToken,config}`
  when `paired` (then clear token from the session). TV: poll that endpoint every 3 s while socket is not delivering; re-emit `pairing:join` on every `connect`. Increase timeouts (health 8 s, pairing 15 s, first call after
  failure retries with backoff 2/4/8/16 s); cache `_resolvedBaseUrl = defaultBackendUrl` after the first success and do not re-probe on every request. Raise/segment the pairing limiter (e.g. 300 / 15 min).
- *Done when:* pairing succeeds after killing the TV's socket right before the admin claims; TV pairs against a cold Render instance without user action.

**P0-5 Config changes do not reach TVs (single publisher)**
- *Where:* `routes/playlists.routes.ts` (PATCH/DELETE), `routes/departments.routes.ts` (PATCH/DELETE), `routes/media.routes.ts` + `mediaRepository.delete(force)`, `routes/campaigns.routes.ts`, `routes/screens.routes.ts`, `routes/emergency.routes.ts`, `routes/settings.routes.ts`, `services/scheduler.ts`; unused `services/configPublisher.ts`.
- *Problem:* editing/deleting a playlist, changing a department's default queue URL/playlist, or force-deleting media changes the resolved config but **does not bump `targetConfigVersion` or emit `config:update`**; TVs keep old content until a manual SYNC.
  The "resolve every screen and emit" loop is copy-pasted in 7 places; `configPublisher` is dead code.
- *Fix:* rewrite `ConfigPublisher` as the only path: `publish({screenIds|departmentId|all})` -> bump versions (one `$inc` query) -> for each affected screen `resolveScreenConfig` -> `io.to('screen:<id>').emit('config:update',{config,targetConfigVersion})` -> `io.to('admins').emit('screens:changed')`.
  Compute affected screens for playlist edits (`screens.playlistId`, `departments.defaultPlaylistId`, `campaigns.playlistId` -> campaign targets). Replace all copy-pasted loops with it.
- *Done when:* editing a playlist item duration, a department queue URL, or force-deleting media updates the physical TV within seconds and the Reconciliation page shows target == applied afterwards.

**P0-6 Settings page is not delivered to TVs; boot auto-start never activates**
- *Where:* `resolverService.ts` (`getGlobalSettings()` result unused), `Admin_Website/src/pages/Settings.tsx`, `routes/settings.routes.ts`, TV `display_engine.dart` (`soundAlerts`, `kioskLock`, `kioskPin`), `BootReceiver.kt` (`kioskLock`).
- *Problem:* Settings saves `hospitalName, hospitalBranch, supportPhone, heartbeatInterval, staleThreshold, defaultDuration, autoRebootTime, kioskLock, soundAlerts, timezone` but only `hospitalName/Branch` are used (by the sidebar).
  TV reads `settings.soundAlerts`, `settings.kioskLock`, `settings.kioskPin` from the resolved config -> always absent, so: siren always on, **BootReceiver never launches the app**, PIN falls back to `9999`.
  `timezone` is ignored (hard-coded `Asia/Kolkata`), `heartbeatInterval`/`staleThreshold`/`defaultDuration` ignored, `autoRebootTime` unimplemented.
- *Fix:* whitelist + validate settings (zod schema, typed values, no arbitrary keys). Resolver merges into `config.settings`: `kioskLock`(bool), `soundAlerts`(bool), `heartbeatSeconds`(from heartbeatInterval),
  `kioskPinHash` (store PIN as salted hash, never plaintext), and uses `staleThreshold` as default for screens without their own, `defaultDuration` as the fallback item duration, `timezone` in campaign evaluation.
  TV: use `heartbeatSeconds` for the heartbeat timer, verify PIN via hash, honor `soundAlerts`; `BootReceiver` then works. Decide with owner whether `autoRebootTime` is in scope; otherwise remove it from the UI.
- *Done when:* toggling each setting in the admin changes TV behavior after save; after a TV power-cycle with `kioskLock=true` the app starts by itself.

**P0-7 Public display (browser) route is broken**
- *Where:* `Admin_Website/src/pages/PublicDisplayView.tsx` vs `backend/src/routes/publicDisplay.routes.ts`.
- *Problem:* the page calls `/api/display/:id/config` (needs `X-Device-Token`) and `/api/emergency` (needs admin session) and opens an unauthenticated socket (rejected). Anyone opening `/display/<id>` gets 401, and a 401 triggers the global "auth expired" handler.
- *Fix:* use `GET /api/public-display/:screenId/config?key=<displayKey>` (already returns config + `activeEmergency`); read `key` from the URL; poll every 10-15 s (no socket) or add a read-only public namespace; use a bare axios instance so a 401 never logs the admin out. Expose the display URL (with key) in the Screen detail modal.
- *Done when:* `/display/<screenId>?key=<displayKey>` plays the playlist, shows emergencies, and a wrong key shows a clear error.

**P0-8 Secrets, default credentials and hard-coded placeholders**
- *Where:* `backend/.env` (real Mongo URI/Aiven/admin values were shared in the zip), `scripts/seed-admin.ts`, `display_engine.dart` (`'9999'`), `screens.routes.ts`/`screenRepository.ts`/`pairingService.ts` (`'PL-DEFAULT'`),
  `PairScreenModal.tsx` (`'DEP-OPD'`), `departments.routes.ts` + `resolverService.ts` + `app_config.dart` (hard-coded `https://hms.jjmhospitalkashipur.com/qd`), `backend/data/*.db`.
- *Problem:* credentials exposed; seed script falls back to `password123` / `123456` / `admin@vibesoft.in`, prints the password, writes role `SUPER_ADMIN` (backend checks `admin`) and ignores `MONGODB_DB_NAME`;
  technician PIN backdoor `9999` always accepted; placeholder IDs that do not exist; hospital URL baked into three places.
- *Fix:* **operator action first:** rotate MongoDB user password, admin password/PIN, drop the Aiven credentials, remove `.env` from any archive. Code: delete `seed-admin.ts` defaults (require env, never print secrets, use `MONGODB_DB_NAME`, role `admin`) or delete the script
  (first admin is already seeded by `migrate.ts`); remove the `9999` fallback; `playlistId` default `null`; PairScreenModal must require a real department (disable submit when none exist and explain); make the default queue URL a stored **setting** (`defaultQueueUrl`) with no hard-coded fallback — if empty, require the field on create;
  delete `backend/data/*.db*`.
- *Done when:* `grep -rnE "9999|PL-DEFAULT|DEP-OPD|password123|123456|jjmhospitalkashipur|vibesoft" backend/src backend/scripts Admin_Website/src JJM_TV_player/lib` returns nothing (placeholder text in input hints must use generic `https://example.invalid/...`-style hints only if truly needed — ask the owner), and no secret appears in the repo.

### P1 — wrong behavior

**P1-1 SHA-256 media verification never runs**
- *Where:* `resolverService.ts` (items built without hash), TV `media_cache_service.dart`, `media_sync_service.dart`.
- *Problem:* playlist items carry no `sha256Hash`, so the TV treats every file as valid; corrupted/partial downloads are accepted. `customUrl` media are stored as `"unhashed"` and also skip verification.
  `_downloadFile` ignores non-200 responses silently and does not retry; a hash mismatch just drops the file with no report (`hasMediaError` is never set).
- *Fix:* when building items look up `media` by `mediaId` and attach `sha256Hash` + `fileSize`; for playlist items refresh `mediaUrl`/hash from the media doc at resolve time (so renamed/deleted media is reflected).
  TV: retry download 3x with backoff, report `hasMediaError` in heartbeat on persistent failure, delete partial files.
- *Done when:* flipping one byte in a cached file makes the TV re-download it; heartbeat shows `hasMediaError` when the file cannot be fetched.

**P1-2 Campaign scheduling & targeting correctness**
- *Where:* `campaignRepository.getActiveForScreen/resolveTargetType`, `scheduler.evaluateCampaigns`, `campaigns.routes.ts`, `Campaigns.tsx`.
- *Problems:* (1) scheduler compares date-only strings with a full UTC ISO string: `endDate:"2026-10-02" < "2026-10-02T04:…Z"` is true, so a campaign **expires at 00:00 UTC (05:30 IST) on its last day**; the resolver itself is IST-based. (2) the Mongo query contains a legacy `{type:'global'}` clause: any campaign whose `type` is `global`
  matches **every** screen even if its targets are a single screen. (3) `resolveTargetType()` returns `ALL` for an unknown id, so a typo/deleted target silently becomes "all screens". (4) `status` accepts any string (UI duplicate sends `draft`). (5) the UI cannot set dates, time window or weekdays although the backend supports them.
  (6) equal priorities have no deterministic tie-breaker. (7) one-click broadcast relies on the scheduler to end (up to 15 s late).
- *Fix:* do all date logic in one helper using the configured timezone (setting from P0-6) and compare `YYYY-MM-DD` to IST date; drop the `{type:'global'}` clause (targets are authoritative; `type` becomes a label); unknown target id -> 400; zod enums for `status`/`type`/`contentType`;
  tie-break `priority desc, createdAt desc`; add date/time/weekday inputs to the Campaign form (validate start<end, HH:mm); for broadcast store `expiresAt` (ms) and have the resolver ignore expired ones.
- *Done when:* a campaign ending today plays until 23:59 IST; a screen-targeted campaign does not appear on other screens; selecting a non-existent target is rejected.

**P1-3 Command security & validation**
- *Where:* `commandService.ts`, `display.routes.ts`, `screens.routes.ts`, `commandRepository.ts`.
- *Problem:* `commandType` is any string; ACK handlers (`received/applied/ack/fail`, REST and socket) never verify the command belongs to that screen, and admin routes can forge TV ACKs; `markApplied/Acknowledged` can overwrite terminal states (e.g. `TIMEOUT -> ACKNOWLEDGED`); `EXPIRED` unused.
- *Fix:* `z.enum` of `CommandType`; handlers must load the command and require `cmd.screenId === screenId`; state-machine guard (only forward transitions, never leave terminal states); remove the admin ACK endpoints; set `EXPIRED` for commands received after `expiresAt`.
- *Done when:* a TV cannot ack another TV's command; unknown command types return 400.

**P1-4 Emergency handling**
- *Where:* TV `_applyEmergency`, `emergency.routes.ts`, `emergencyRepository.ts`, `Screens.tsx`/`ScreenDetailModal.tsx` (EMERGENCY_OVERRIDE).
- *Problems:* TV parses `expiresAt` with `DateTime.tryParse` but the backend sends epoch **milliseconds** (number) -> parse fails, TV falls back to `durationSeconds` and restarts the countdown on every reconcile (a TV that reconnects late shows the alert too long);
  dismiss clears **all** active emergencies (`clearById` exists but unused); `displayMode` (`banner`/`both`) and `severity: info` are ignored by the TV (always full red takeover, amber only for warning); in-memory `autoDismissTimer` is lost on restart (the scheduler covers it, so remove the timer);
  two simultaneous emergencies are not modelled; `EMERGENCY_OVERRIDE` command creates a TV-local alert that is not persisted.
- *Fix:* TV: accept numeric epoch ms (`int`/`num` -> `DateTime.fromMillisecondsSinceEpoch`); add `POST /emergency/:id/dismiss`; implement `banner` (top ribbon) and info colour on TV or remove the options from the API/UI; drop the in-memory timer.
- *Done when:* a TV that reconnects 30 s before expiry dismisses on time; dismissing one emergency leaves another active.

**P1-5 Heartbeat, health and offline detection**
- *Where:* TV `socket_service.dart` / `display_engine.dart`, `healthMonitor.ts`, `screens.routes.ts GET /`.
- *Problems:* TV never uses the REST heartbeat (`ApiService.sendHeartbeat` is unused). If WebSocket is blocked/flapping but HTTP works, the TV plays normally yet shows OFFLINE after 60 s. `GET /screens` recomputes health without heartbeat data, overwriting `QUEUE_STALE`/`DEGRADED`.
  `QUEUE_STALE` is derived from "last DOM mutation": a quiet but healthy OPD page (no change for >180 s) is reported stale. Offline threshold (60 s) is hard-coded.
- *Fix:* when `!socket.connected` send REST heartbeat every `heartbeatSeconds`; persist the last heartbeat-derived `healthStatus` and make list/detail use stored value unless offline; define staleness as "page unresponsive OR no successful reload within N minutes" and add a scheduled forced queue reload (setting `queueRefreshMinutes`);
  offline threshold = `3 x heartbeatSeconds`.
- *Done when:* blocking WebSockets for 2 minutes does not mark a playing TV offline; a quiet page is not flagged stale.

**P1-6 Validation & error mapping**
- *Where:* all routes; `auth.routes.ts` (manual checks), `playlists.routes.ts` (`items: z.any()`), `settings.routes.ts`, `screens.routes.ts` (`pair-claim`, random `DOC###`), `server.ts` error handler.
- *Problems:* duplicate department/screen codes -> Mongo 11000 -> HTTP 500 with driver text; random screen code collides; `pair-claim` accepts a non-existent `departmentId`; playlist item schema unchecked (bad `type`, missing `duration`); no password policy; `GET /audit-logs` ignores offset/filters.
- *Fix:* central `asyncHandler`/error middleware converting 11000 -> 409 `{message:"Code already exists"}` and hiding internals in production; generate screen codes from a collision-checked counter or uuid slice; validate department existence; zod item schema `{type:enum,duration:int>=1,...}`; add `offset/action/entity/from/to/search` to audit route and paginate in the UI.
- *Done when:* creating a duplicate department code returns 409 with a friendly message shown in the UI.

**P1-7 Snapshots / live feed reality check**
- *Where:* TV `_captureAndSendSnapshot`, `socket_service.dart`, backend socket, `LiveFeeds.tsx`.
- *Problem:* snapshots are taken from a Flutter `RepaintBoundary`; Android **WebView (platform view) is not captured**, so while the queue is showing the JPEG is blank/black. Only `TAKE_SNAPSHOT` works; `snapshot:watch` / `command:request_snapshot` are listened to by the TV but never emitted by the backend. `screen_snapshots` has no unique index.
- *Fix (owner to choose):* (A) honest scope: label snapshots "ads/emergency only", delete dead listeners, add unique index on `screenId`; or (B) implement native capture (Android `PixelCopy` of the window via MethodChannel) and return that image.
- *Done when:* the chosen option is implemented and docs/UI text match.

**P1-8 Admin UI defects**
- *Where:* `PairScreenModal.tsx`, `Campaigns.tsx`, `MediaLibrary.tsx`, `App.tsx`, `AuditLogs.tsx`, all pages' `alert(\`...${err.message}\`)`.
- *Problems:* generic axios message instead of server message; media delete never offers `force`; duplicate campaign drops `playlistId`; `authChecked` logic shows the Login screen briefly for authenticated users; `App` refetches **all** collections incl. audit logs on every `screens:changed`;
  emergency state check uses only `GET /emergency` default (no screen filter) - fine, but dismissing from another admin tab is not reflected until refetch.
- *Fix:* shared `getErrorMessage(err)` helper using `err.response?.data?.message`; handle 409 "Media is in use" with a confirm dialog that retries with `?force=true`; copy `playlistId` on duplicate and use status `paused`; fetch only the changed resource (or paginate audit logs).

**P1-9 Circular imports**
- *Where:* `healthMonitor.ts`, `scheduler.ts`, `screens.routes.ts`, `campaigns.routes.ts`, `emergency.routes.ts` import `{ io } from '../server'`.
- *Fix:* use `getIO()` from `realtime/socket.ts` everywhere; remove `export const io` from `server.ts`. Done when: no file except `server.ts` imports `../server`.

### P2 — hardening & cleanup

- **P2-1 Repo hygiene.** Delete `backend/data/*.db*`, stale `backend/dist` output (ignored by git anyway), remove `mysql2` and `@types/mongodb` (driver ships types) from `package.json`, drop unused env vars, move `typescript`/`@types/*` to `dependencies` or keep `--include=dev` (P0-2), add `.nvmrc`/`engines` (Node 20+). Pin `multer` to a stable release (currently `^3.0.0-alpha.2` with `@types/multer@1`).
- **P2-2 Documentation.** Replace `CLEANUP_REPORT.md`, `BACKEND_FLOW.md`, `SYSTEM_ARCHITECTURE_AND_FLOW.md`, `ADMIN_WEBSITE_FLOW.md`, `README.md` setup text with accurate content derived from this guide; delete the fabricated test report.
- **P2-3 Auth & roles.** Add real role checks (`editor` read/write content, `admin` users/settings/pairing), revoke other sessions on password change, add PIN change, make login rate-limit key `ip+email` (hospital NAT), enforce password length, sliding session renewal.
- **P2-4 Android.** `usesCleartextTraffic=true` and localhost/10.0.2.2 candidates should exist only in a debug flavor; release build must not fall back to the debug keystore (fail the build when `key.properties` is missing); remove unused `FOREGROUND_SERVICE`/`REORDER_TASKS` permissions if not needed; document sideload + overlay-permission step required for boot start on Android 10+.
- **P2-5 Tests.** Replace the copy-pasted logic in `time_logic.test.ts` with tests that import the real functions (extract campaign time logic into a pure module). Add pure unit tests for resolver ordering, date handling, command state machine, emergency targeting, PIN hash. No seeded databases.
- **P2-6 Indexes & jobs.** Add: `screen_snapshots.screenId` unique, `device_commands.screenId+createdAt`, `media.createdAt`. Run audit purge hourly with `AUDIT_RETENTION_DAYS` env (default 90). `getById` returns `undefined` vs `null` inconsistently; unify.
- **P2-7 Observability.** Request-id logging, `/api/health` includes `version` from `package.json`, log slow Mongo ops, Render health-check path `/api/health`.

---

## 12. Work plan — phases with copy-paste prompts for Antigravity

Run phases in order. After each phase: build/check commands from `AGENTS.md` section 3 must pass and you review the diff.
Use **Planning** mode, let the agent write its plan first, and reject plans that add seed/demo data.

### Phase 0 — Secrets & environment (you do this by hand, 15 min)
1. MongoDB Atlas: change the DB user's password, update `MONGODB_URI` (URL-encode special characters). Confirm the cluster is not paused.
2. Change `ADMIN_PASSWORD`/`ADMIN_PIN`. Since the admin already exists in DB, change them from the Admin UI (`/auth/change-password`) or delete the old admin doc in Atlas and let boot seed the new env values.
3. Remove Aiven (`DB_*`) values. Never zip `.env` again.
4. Render: set `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PIN`, `CORS_ORIGIN` (admin site URL, e.g. your Vercel domain), `NODE_ENV=production`, `UPLOAD_DIR=/data/uploads`. Vercel: `VITE_API_URL`.

### Phase 1 — Backend boots reliably (P0-1, P0-2, P0-3, P1-9)
```
Read AGENTS.md and docs/JJM_ENGINEERING_GUIDE.md sections 3, 5 and 11 (P0-1, P0-2, P0-3, P1-9).
Implement only those four items in backend/. Requirements:
- zod env validation at boot with readable errors, no secret values in logs
- startServer().catch -> log + process.exit(1); uncaughtException -> log + exit(1)
- detect non-replica-set MongoDB and print a clear fatal message
- rewrite render.yaml (real env keys, buildCommand "npm ci --include=dev && npm run build"), update .env.example,
  delete .env.development and .env.production
- replace every `import { io } from '../server'` with getIO() and remove the export from server.ts
Do not add any seed/demo data. Run: npx tsc --noEmit && npm run build && npm test and show the output.
```

### Phase 2 — Real-time correctness (P0-5, P0-6, P1-1, P1-3)
```
Read the guide sections 5.2, 7 and 11 (P0-5, P0-6, P1-1, P1-3). Implement:
1. A single ConfigPublisher (backend/src/services/configPublisher.ts) that bumps targetConfigVersion and emits
   config:update {config,targetConfigVersion} for affected screens; use it in playlists, departments, media (force delete),
   campaigns, screens, settings, emergency and scheduler routes, deleting the duplicated loops.
2. Settings: zod whitelist (hospitalName, hospitalBranch, supportPhone, heartbeatInterval, staleThreshold, defaultDuration,
   timezone, kioskLock, soundAlerts, kioskPin stored only as salted hash). Resolver merges kioskLock, soundAlerts,
   heartbeatSeconds, kioskPinHash into config.settings and applies staleThreshold/defaultDuration/timezone.
3. Resolver attaches sha256Hash and fileSize to media items.
4. Command ACK ownership + state machine + z.enum(CommandType).
Update the TV (display_engine.dart, socket_service.dart, media_cache_service.dart) and Admin Settings page only where needed
for the contract. No dummy data. Show the diff summary and the check commands output.
```

### Phase 3 — Pairing & TV resilience (P0-4, P1-5, P1-4, P0-8 TV part)
```
Read guide sections 1.1, 9 and 11 (P0-4, P1-5, P1-4, P0-8). In backend + JJM_TV_player implement:
- pairing poll fallback with pollSecret (GET /api/pairing/session/:code?secret=), re-emit pairing:join on every socket connect
- longer timeouts + backoff, cache the resolved base URL, no re-probing on every request
- REST heartbeat fallback when the socket is disconnected; offline threshold = 3 x heartbeatSeconds; persist heartbeat health
- emergency: numeric epoch-ms expiresAt parsing on TV, POST /emergency/:id/dismiss, banner/info rendering (or remove options)
- remove the hard-coded technician PIN 9999 (verify PIN against kioskPinHash from settings; if no PIN configured, the technician menu is disabled)
Keep the cached-config fallback so the screen is never black. Run flutter analyze && flutter test.
```

### Phase 4 — Admin website (P0-7, P1-2 UI, P1-6, P1-8, P0-8 admin part)
```
Read guide sections 8 and 11 (P0-7, P1-2, P1-6, P1-8, P0-8). In Admin_Website implement:
- PublicDisplayView using /api/public-display/:screenId/config?key= with polling, bare axios (no logout on 401)
- Campaign form: start/end date, start/end time, weekdays, validation; duplicate keeps playlistId and uses status "paused"
- getErrorMessage(err) helper used by every page; media force-delete confirm flow; PairScreenModal requires a real department
- audit logs pagination (backend route supports offset/filters - extend the route accordingly)
- remove every hard-coded hospital URL / placeholder id. If a value is needed, ask me.
Run npm run build.
```

### Phase 5 — Campaign engine & validation (P1-2 backend, P1-6 backend)
```
Read guide section 11 (P1-2, P1-6). Backend only:
- one timezone-aware date helper; scheduler expires campaigns after the end date in IST, not at 00:00 UTC
- remove the legacy {type:'global'} clause; reject unknown targetIds; z.enum for status/type/contentType; priority tie-break
- map Mongo 11000 to 409; central error middleware; validate departmentId in pair-claim; playlist item zod schema
- extract campaign time/target logic into a pure module and make time_logic.test.ts import it (no copied code)
Add unit tests for date edges (end date, midnight IST, weekday normalisation 7 -> 0). No database fixtures.
```

### Phase 6 — Cleanup & docs (P1-7, P2-1 ... P2-7)
```
Read guide section 11 P1-7 and all P2 items. Do P2-1, P2-2 (rewrite README/flow docs from the guide, delete CLEANUP_REPORT.md),
P2-3, P2-4, P2-6, P2-7. For P1-7 implement option A (honest snapshot scope, remove dead listeners, add unique index) unless I say otherwise.
List anything you skipped and why.
```

---

## 13. No-dummy-data policy and how to verify

**Rules:** no seed scripts, fixtures in the database, hard-coded departments/screens/playlists/campaign names, default passwords/PINs, sample media, or lorem text in the UI.
Empty database must produce clean empty states (Admin pages already show empty lists; verify after changes).
Placeholder text inside input fields must be generic (e.g. "Enter queue page URL") and must not contain real hospital URLs or IDs.

**Automated checks (no data needed):** `tsc`, `vite build`, `flutter analyze`, pure unit tests. If an integration test is ever added it must start its own throw-away in-memory replica set,
create what it needs inside the test, delete it afterwards, and never point at Atlas/production.

**Manual end-to-end with real data (operator performs, in this order):**
1. Boot backend against the real cluster -> `/api/health` returns `{"status":"ok","db":"up"}`.
2. Log in to Admin (email + password + 6-digit PIN). Wrong PIN -> 401; 6th failed attempt in 15 min -> 429.
3. Settings -> save hospital name, kiosk lock, sound alerts, PIN. Verify they appear in `GET /api/screens/:id` -> `resolvedConfig.settings` after pairing.
4. Departments -> create a real department with its real queue URL.
5. Power on a TV (release APK built with `--dart-define=BACKEND_URL`) -> code appears. Admin -> Pair -> TV switches to the queue page within seconds. Repeat the pairing while toggling the TV's Wi-Fi once.
6. Media -> upload one real image and one real video; confirm SHA-256 shown; confirm TV downloads them (Technician menu / logs) and plays offline after disconnecting Wi-Fi.
7. Playlist -> create with queue + image + video; assign to the screen; edit durations -> TV changes without manual sync (P0-5).
8. Campaign -> create targeted to one screen with an end date today; other TVs unaffected; still active at 23:30 IST; gone after midnight.
9. Emergency -> targeted to one department; overlay + siren only there; dismiss; repeat with a duration and disconnect/reconnect the TV near expiry.
10. Commands -> RELOAD_QUEUE, CLEAR_CACHE, RESTART_PLAYER show CREATED -> ... -> ACKNOWLEDGED in the screen modal; unplug network and confirm TIMEOUT after 35 s.
11. Reboot the TV with kiosk lock on -> app starts by itself (overlay permission granted once in Technician menu).
12. Unpair from Admin -> TV returns to pairing screen; delete screen -> no orphan commands/snapshots remain in Mongo.

---

## 14. Quick reference

- Health check: `GET /api/health`. Admin token header: `Authorization: Bearer <token>`. TV header: `X-Device-Token`.
- Rooms: `admins`, `screen:<id>`, `dept:<id>`, `pairing:<code>`.
- Timeouts to remember: command 35 s · offline 60 s (to be 3 x heartbeat) · scheduler 15 s · heartbeat 20 s · pairing code 15 min · admin session 24 h.
- ID prefixes: `ADM- DEP- SCR- HW- MED- PL- CAMP- CMD- EMERG- AUD-`; device tokens `DEV-<uuid>`; admin tokens `ADM-<64 hex>`.
- Build TV release: `flutter build apk --release --dart-define=BACKEND_URL=https://<backend-host>`; set `key.properties` for signing.
