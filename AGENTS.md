# AGENTS.md — JJM Hospital Digital Signage (monorepo)

Read this file fully before every task. The detailed spec is in `docs/JJM_ENGINEERING_GUIDE.md`
(architecture, API/socket contracts, data model, issue register with IDs like P0-3, work phases).
When a task mentions an issue ID, open that section of the guide first.

## 1. What this repo is
Three apps that talk to one Node backend backed by MongoDB:

| Folder | Stack | Role |
|---|---|---|
| `backend/` | Node 20, Express 4, Socket.IO 4, MongoDB driver 7, zod, TypeScript (CommonJS) | REST + realtime, single source of truth |
| `Admin_Website/` | React 18, Vite 6, TypeScript, axios, socket.io-client | Admin dashboard (no router; tab state in `App.tsx`) |
| `JJM_TV_player/` | Flutter (Dart ^3.9), webview_flutter, socket_io_client, video_player | Android TV kiosk: queue WebView + ads + emergency overlay |

Flow: Admin (REST + socket) -> Backend -> MongoDB; TV (REST + socket, `X-Device-Token`) -> Backend.
Backend is authoritative for config version, media manifest version, emergencies and commands.

## 2. HARD RULES (never break these)
1. **No dummy, mock, sample, seed or test data. Ever.** Do not add seed scripts, fixture JSON, placeholder
   departments/screens/playlists/campaigns, fake IDs (`SCR-123`, `DEP-OPD`, `PL-DEFAULT`), default
   passwords/PINs (`password123`, `9999`, `123456`), or "demo" content in UI or API. Real data enters only
   through the admin UI / real devices. Empty states must render correctly with zero records.
2. **MongoDB is the only datastore.** No SQLite, MySQL, JSON files or in-memory state that must survive a restart.
3. **Never commit or print secrets.** `.env` is never copied into docs, logs, commits, or responses. Read config
   from `process.env` (backend), `import.meta.env.VITE_*` (admin), `--dart-define` (TV).
4. **Do not rename or reshape fields that other apps consume** without updating all three apps in the same
   change. The contracts are in guide section 6 (REST), 7 (Socket) and 5.2 (resolved config).
5. **Server decides, TV obeys.** Targeting, priority, versions, expiry are computed on the backend only.
6. **Every config-affecting write must reach TVs**: bump `targetConfigVersion` and emit `config:update`
   through the single publisher (guide P0-5). Never copy-paste another emit loop.
7. **Validate input at the edge** with zod; map Mongo duplicate-key (11000) to HTTP 409; never leak raw
   driver errors to clients.
8. **Keep changes small and reviewable.** One issue ID per change set. Do not refactor unrelated code.
9. **Do not touch `backend/dist/`, `node_modules/`, `Admin_Website/dist/`, `JJM_TV_player/build/`** — generated.
10. If a requirement is ambiguous or needs a real value (URL, credential, hospital name), **stop and ask**;
    do not invent one.

## 3. Commands (run and report results before saying "done")
```bash
# backend
cd backend && npm ci --include=dev && npx tsc --noEmit && npm run build && npm test
# admin
cd Admin_Website && npm ci && npm run build
# tv player
cd JJM_TV_player && flutter pub get && flutter analyze && flutter test
```
Run backend: `cd backend && npm run dev` (needs a real `MONGODB_URI`; transactions require a **replica set**,
e.g. MongoDB Atlas or a local `mongod --replSet rs0`). Admin: `npm run dev` (port 5173). TV release build:
`flutter build apk --release --dart-define=BACKEND_URL=<https backend url>`.

## 4. Code conventions
- Backend layering: `routes/*` (zod + HTTP) -> `services/*` (logic) -> `db/repositories/*` (Mongo). No Mongo
  calls inside routes except where the file already does so; prefer moving them into a repository.
- Use `getIO()` from `realtime/socket.ts`. Do **not** `import { io } from '../server'` (circular import).
- Mongo `_id` is a prefixed string (`SCR-`, `DEP-`, `CAMP-`, `MED-`, `PL-`, `CMD-`, `EMERG-`, `AUD-`, `ADM-`).
  Repositories map `_id -> id` and `Date -> ISO string` via `mapMongoToApi`.
- Dates stored as BSON `Date`, except legacy numeric epoch-ms fields: `expiresAt` on `device_commands`,
  `emergency_events`, `pairing_sessions`, `admin_sessions`. Campaign `startDate/endDate` are strings
  (`YYYY-MM-DD`, IST). Do not mix comparisons between these types.
- Logging: use `Logger` (JSON lines). Never log tokens, passwords, PINs or full `MONGODB_URI`.
- Admin: pages receive data via props from `App.tsx`; mutations call `api.*` then `onRefresh()`. Show
  `err.response?.data?.message` to users, not the generic axios message. No `localStorage` use except the
  existing `jjm_auth_token` / `jjm_auth_user`.
- TV: `DisplayEngine` is a state machine (`DisplayState`). Network code lives in `core/network/api_service.dart`
  and `core/websocket/socket_service.dart`. Always keep a cached-config fallback so the screen is never black.

## 5. Where things are
- Boot: `backend/src/server.ts` (middleware, routes, `startServer`).
- Targeting/priority: `backend/src/services/resolverService.ts`, `db/repositories/campaignRepository.ts`.
- Commands: `services/commandService.ts`, `db/repositories/commandRepository.ts`.
- Realtime: `realtime/socket.ts`. Background jobs: `services/scheduler.ts` (15 s tick, Mongo lock).
- Admin API client: `Admin_Website/src/services/api.ts`; socket: `services/socket.ts`.
- TV: `lib/screens/display/display_engine.dart`, `lib/screens/pairing/pairing_view.dart`, `lib/core/*`,
  native: `android/app/src/main/kotlin/com/jjm/tv/{MainActivity,BootReceiver}.kt`.

## 6. Definition of done for any task
- The relevant guide acceptance criteria are met (guide section 11/12).
- All three build/check commands above pass for the apps you touched.
- No new dummy/default values, no secrets, no new `any` casts where a type exists.
- Behavior verified with **real** entities created via the UI/API in a non-production database, then removed
  by the operator. Describe the manual verification steps you performed.
- You updated the matching section of `docs/JJM_ENGINEERING_GUIDE.md` if you changed a contract.

## 7. Known traps (details in the guide)
- Production CORS rejects `*`; `CORS_ORIGIN` must be exact admin origin(s), comma-separated.
- `dotenv` loads only `.env`; `.env.development` / `.env.production` are NOT read.
- `npm ci` with `NODE_ENV=production` skips devDependencies (TypeScript) -> use `--include=dev` on Render.
- Render free tier sleeps (30-60 s cold start) and has an ephemeral disk; TV timeouts and media storage
  must account for that.
- Playlist / department / media edits currently do not push to TVs (P0-5). Settings page values are not
  delivered to the TV (P0-6). Public display web route uses wrong endpoints (P0-7).
