import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'hospital_signage.db');

export const sqlite = new Database(DB_PATH);

// Enable WAL mode for high concurrent read performance and ACID write transactions
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Initialize schema tables
export function initDatabaseSchema() {
  sqlite.exec(`
    -- System Versions (Monotonically Increasing Sequence Counters)
    CREATE TABLE IF NOT EXISTS system_versions (
      id TEXT PRIMARY KEY,
      version_number INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Admin Auth Sessions (survives restarts)
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );

    -- Departments
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      floor TEXT NOT NULL,
      description TEXT,
      default_queue_url TEXT NOT NULL,
      default_playlist_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    -- Physical Hardware Devices
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      device_token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      model TEXT,
      app_version TEXT NOT NULL,
      ip_address TEXT,
      mac_address TEXT,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Screens (Logical Display Slots)
    CREATE TABLE IF NOT EXISTS screens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      department_id TEXT NOT NULL REFERENCES departments(id),
      device_id TEXT REFERENCES devices(id),
      location TEXT NOT NULL,
      queue_url TEXT NOT NULL,
      stale_threshold_seconds INTEGER NOT NULL DEFAULT 180,
      target_config_version INTEGER NOT NULL DEFAULT 1,
      applied_config_version INTEGER NOT NULL DEFAULT 0,
      media_manifest_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      connection_status TEXT NOT NULL DEFAULT 'offline',
      health_status TEXT NOT NULL DEFAULT 'OFFLINE',
      current_content TEXT NOT NULL DEFAULT 'queue',
      current_campaign_id TEXT,
      playlist_id TEXT DEFAULT 'PL-DEFAULT',
      device_token TEXT,
      player_version TEXT DEFAULT '1.0.0',
      is_paused INTEGER NOT NULL DEFAULT 0,
      power_state TEXT DEFAULT 'on',
      latest_snapshot TEXT,
      latest_snapshot_time TEXT,
      last_heartbeat TEXT,
      last_heartbeat_at TEXT,
      last_sync_at TEXT,
      device_metadata TEXT,
      created_at TEXT NOT NULL
    );

    -- Pairing Sessions
    CREATE TABLE IF NOT EXISTS pairing_sessions (
      pairing_code TEXT PRIMARY KEY,
      socket_id TEXT,
      device_metadata TEXT,
      screen_id TEXT REFERENCES screens(id) ON DELETE SET NULL,
      device_token TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Media Items
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      sha256_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      dimensions TEXT,
      tags TEXT,
      category TEXT,
      created_at TEXT NOT NULL
    );

    -- Playlists
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      items TEXT NOT NULL, -- JSON array of PlaylistItem
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Campaigns
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'global',
      content_type TEXT DEFAULT 'single_image',
      media_id TEXT REFERENCES media(id),
      media_url TEXT,
      playlist_id TEXT,
      priority INTEGER NOT NULL DEFAULT 50,
      interval_minutes INTEGER NOT NULL DEFAULT 3,
      display_duration_seconds INTEGER NOT NULL DEFAULT 15,
      days_of_week TEXT NOT NULL, -- JSON array of ints [0,1,2,3,4,5,6]
      start_date TEXT,
      end_date TEXT,
      start_time TEXT,
      end_time TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    -- Campaign Targets (Many-to-Many with strict targeting)
    CREATE TABLE IF NOT EXISTS campaign_targets (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL, -- 'ALL', 'DEPARTMENT', 'SCREEN'
      target_id TEXT NOT NULL    -- 'all', or deptId, or screenId
    );

    -- Device Commands (Strict 5-Stage Lifecycle)
    CREATE TABLE IF NOT EXISTS device_commands (
      id TEXT PRIMARY KEY,
      screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      device_id TEXT,
      command_type TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED',
      error_message TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      received_at TEXT,
      applied_at TEXT,
      acknowledged_at TEXT,
      expires_at INTEGER NOT NULL
    );

    -- Emergency Events (Persistent & Target-Aware)
    CREATE TABLE IF NOT EXISTS emergency_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'critical',
      display_mode TEXT NOT NULL DEFAULT 'takeover',
      target_type TEXT NOT NULL DEFAULT 'ALL',
      target_ids TEXT NOT NULL, -- JSON array
      highlight_screen INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      duration_seconds INTEGER,
      expires_at INTEGER,
      created_at TEXT NOT NULL,
      cleared_at TEXT
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL,
      user_id TEXT
    );

    -- Create Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_screens_department ON screens(department_id);
    CREATE INDEX IF NOT EXISTS idx_screens_health ON screens(health_status);
    CREATE INDEX IF NOT EXISTS idx_campaign_targets ON campaign_targets(campaign_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_commands_screen ON device_commands(screen_id, status);
    CREATE INDEX IF NOT EXISTS idx_emergency_active ON emergency_events(is_active);
  `);

  // Ensure initial system version sequence exists
  const row = sqlite.prepare("SELECT * FROM system_versions WHERE id = 'GLOBAL_CONFIG'").get();
  if (!row) {
    sqlite.prepare("INSERT INTO system_versions (id, version_number, updated_at) VALUES ('GLOBAL_CONFIG', 1, ?)").run(new Date().toISOString());
  }
  const mediaRow = sqlite.prepare("SELECT * FROM system_versions WHERE id = 'MEDIA_MANIFEST'").get();
  if (!mediaRow) {
    sqlite.prepare("INSERT INTO system_versions (id, version_number, updated_at) VALUES ('MEDIA_MANIFEST', 1, ?)").run(new Date().toISOString());
  }
}

// Automatically init schema on import
initDatabaseSchema();
