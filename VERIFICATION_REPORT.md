# Static & Build-Level Verification Report

This report documents the strict static analysis, database sanity checks, and build process verification executed against the JJM Digital Signage Network repository without starting the backend against a live database.

## 1. Build & Test Commands Executed

| Subsystem | Command Executed | Output Status | Note |
|-----------|-----------------|---------------|------|
| **Backend** | `npm run build` | **PASSED** (0 errors) | TypeScript compilation to `dist/` succeeded after correcting schema typo in settings routes. |
| **Backend** | `npm test` | **PASSED** (2/2 passing) | Validated `time_logic.test.ts` (Asia/Kolkata date handling). |
| **Admin Web** | `npm run build` | **PASSED** (0 errors) | `vite build` generated production assets successfully (dist/ built in 1m12s). |
| **Flutter TV** | `flutter test` | **PASSED** (All tests passed) | `widget_test.dart` smoke tests passed. |
| **Flutter TV** | `flutter analyze`| **PASSED** (No issues) | Zero analyzer warnings. |

## 2. Global Grep Checks

- **`sqlite|better-sqlite3|db.json|migrateFromJson|`**: All code dependencies were cleanly removed. Remaining hits exist exclusively in Markdown documentation confirming their architectural removal.
- **`INSERT INTO|DELETE FROM|TRUNCATE|DROP TABLE` in backend/src**: Scanned. 100% of hits are strictly real application logic inside repository files (e.g. `campaignRepository.ts`, `auth.routes.ts`, `migrate.ts`). `MongoDB.ts` contains a runtime string validation explicitly blocking `TRUNCATE` and `DROP TABLE`. None found in testing scripts.
- **`DOC038|Goel|Sharma|...|LOCAL_FALLBACK` etc.**: Scanned and purged. Replaced placeholder URLs in `Admin_Website/src/pages/*` with generic URLs (e.g. `https://hms.jjmhospitalkashipur.com/qd/123`), removed placeholder comments, and scrubbed `CLEANUP_REPORT.md` of mock TV identifiers.
- **Hardcoded HTTP(s) URLs in Source**: Scanned. All hits point legitimately to the hospital's HMS URL (`https://hms.jjmhospitalkashipur.com/qd`), generic `localhost:5000` emulator fallbacks, or frontend UI placeholders (e.g., Unsplash). 

## 3. Code Review Checklist

| Feature | Status | Evidence (File + Line) |
|---------|--------|------------------------|
| **Device-token enforced on TV routes** | **PASS** | `backend/src/routes/display.routes.ts:18` (`router.use('/:screenId', requireDeviceAuth);`) |
| **TV routes outside admin auth** | **PASS** | `backend/src/server.ts:88` (Loaded before `requireAdminAuth`) |
| **Socket rooms isolate TV A from TV B** | **PASS** | `backend/src/realtime/socket.ts:48` (`socket.join('screen:${screenId}')`) |
| **No global io.emit for pairing/snapshot/emergency**| **PASS** | `backend/src/routes/emergency.routes.ts:24-29`, `screens.routes.ts:184-189` (Refactored global `io.emit` calls to target `admins` and specific `screen:${id}` rooms) |
| **All repositories partial-update safe** | **PASS** | `backend/src/db/MongoDB.ts` dynamic query builders process undefined values safely. |
| **Campaign status computed server-side in Asia/Kolkata** | **PASS** | `backend/src/services/scheduler.ts:34` (`timeZone: 'Asia/Kolkata'`) |
| **Scheduler uses GET_LOCK** | **FAIL** | `backend/src/services/scheduler.ts` does *not* utilize `GET_LOCK` for concurrent cron safety. `GET_LOCK` is only utilized by `backend/src/db/migrate.ts:14`. |
| **Emergency expiry stored in DB** | **PASS** | `backend/src/db/repositories/emergencyRepository.ts` (`expires_at` BIGINT schema mapping) |
| **Admin UI uses only supported command types** | **PASS** | `Admin_Website/src/pages/Screens.tsx:156` (Refactored `REBOOT_DEVICE` to supported `RESTART_PLAYER` command) |
| **Emergency overlay on TV renders from _activeEmergency**| **PASS** | `JJM_TV_player/lib/screens/display/display_engine.dart` (`_isEmergencyActive => _activeEmergency != null`) |
| **PendingCommands camelCase on both sides** | **PASS** | `JJM_TV_player/lib/screens/display/display_engine.dart:195` (Refactored mapping from `command_type` to `commandType`) |
| **Media cache verifies SHA-256** | **PASS** | `JJM_TV_player/lib/core/sync/media_cache_service.dart:58` (`expectedHash = item.sha256Hash`) |
| **No secrets in source or committed env files** | **PASS** | `backend/.env.example` verified safe. No embedded credentials. |

## 4. Migrations & Schema Analysis
Read `backend/src/db/migrations/001_init.sql`.
- **Finding**: File consists strictly of `CREATE TABLE IF NOT EXISTS` schema definitions, foreign key constraints, and performance indexes. 
- **Integrity**: Zero mock data insertion SQL (`INSERT`) exists.
- **Verification**: `backend/src/db/migrate.ts` automatically inserts the two required system rows (`GLOBAL_CONFIG` and `MEDIA_MANIFEST`) inside the migration transaction layer securely.

## 5. Remaining Risks & Required Manual QA

Because tests were strictly statically evaluated without a database instance, the following must be validated physically:
1. **Device Pairing**: Confirming the exact cryptographic timing handshake and WebSocket `pairing:` room isolation across the Admin Dashboard and TV screen.
2. **Android 10+ Boot Takeover**: Validating `BootReceiver.kt` permissions intercept the system broadcast to bring the Flutter Kiosk to the foreground reliably over OEMs.
3. **Queue DOM Watchdog**: Providing a live URL to verify the Flutter `window.lastMutation` polling accurately resets a crashed HMS Queue.
4. **Physical Emergency Rendering**: Emitting a code red to verify audio siren triggers seamlessly over cached campaigns.
5. **Horizontal Scaling Risk**: As identified, `scheduler.ts` lacks `GET_LOCK`. If the Node backend scales to >1 instance, multiple instances will simultaneously expire campaigns/emergencies, possibly overlapping updates to TVs.

