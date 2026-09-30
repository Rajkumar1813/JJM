-- 001_init.sql

CREATE TABLE IF NOT EXISTS system_versions (
  id VARCHAR(64) PRIMARY KEY,
  version_number INT NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  last_login_at DATETIME(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  admin_user_id VARCHAR(64) NOT NULL,
  ip VARCHAR(64),
  user_agent TEXT,
  created_at DATETIME(3) NOT NULL,
  expires_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(64) PRIMARY KEY,
  value JSON,
  updated_at DATETIME(3) NOT NULL,
  updated_by VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  floor VARCHAR(64) NOT NULL,
  description TEXT,
  default_queue_url TEXT NOT NULL,
  default_playlist_id VARCHAR(64),
  doctor_in_charge VARCHAR(120),
  status VARCHAR(64) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR(64) PRIMARY KEY,
  device_token VARCHAR(255) NOT NULL UNIQUE,
  platform VARCHAR(64) NOT NULL,
  model VARCHAR(120),
  app_version VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64),
  mac_address VARCHAR(64),
  last_seen_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS screens (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  department_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64),
  location VARCHAR(120) NOT NULL,
  queue_url TEXT NOT NULL,
  stale_threshold_seconds INT NOT NULL DEFAULT 180,
  target_config_version INT NOT NULL DEFAULT 1,
  applied_config_version INT NOT NULL DEFAULT 0,
  media_manifest_version INT NOT NULL DEFAULT 1,
  status VARCHAR(64) NOT NULL DEFAULT 'active',
  connection_status VARCHAR(64) NOT NULL DEFAULT 'offline',
  health_status VARCHAR(64) NOT NULL DEFAULT 'OFFLINE',
  current_content VARCHAR(120) NOT NULL DEFAULT 'queue',
  current_campaign_id VARCHAR(64),
  playlist_id VARCHAR(64) DEFAULT 'PL-DEFAULT',
  device_token VARCHAR(255),
  player_version VARCHAR(64) DEFAULT '1.0.0',
  is_paused TINYINT(1) NOT NULL DEFAULT 0,
  power_state VARCHAR(64) DEFAULT 'on',
  last_heartbeat DATETIME(3),
  last_heartbeat_at DATETIME(3),
  last_sync_at DATETIME(3),
  device_metadata JSON,
  display_key VARCHAR(64) UNIQUE,
  created_at DATETIME(3) NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL,
  INDEX idx_screens_department (department_id),
  INDEX idx_screens_health (health_status),
  INDEX idx_screens_last_heartbeat (last_heartbeat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS screen_snapshots (
  screen_id VARCHAR(64) PRIMARY KEY,
  image MEDIUMTEXT NOT NULL,
  mime VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
  captured_at DATETIME(3) NOT NULL,
  FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pairing_sessions (
  pairing_code VARCHAR(64) PRIMARY KEY,
  socket_id VARCHAR(120),
  device_metadata JSON,
  screen_id VARCHAR(64),
  device_token VARCHAR(255),
  status VARCHAR(64) NOT NULL DEFAULT 'pending',
  expires_at BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE SET NULL,
  INDEX idx_pairing_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  type VARCHAR(64) NOT NULL,
  url TEXT NOT NULL,
  sha256_hash VARCHAR(128) NOT NULL,
  file_size INT NOT NULL,
  duration INT NOT NULL,
  dimensions VARCHAR(64),
  tags JSON,
  category VARCHAR(64),
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS playlists (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  items JSON NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  type VARCHAR(64) NOT NULL DEFAULT 'global',
  content_type VARCHAR(64) DEFAULT 'single_image',
  media_id VARCHAR(64),
  media_url TEXT,
  playlist_id VARCHAR(64),
  priority INT NOT NULL DEFAULT 50,
  interval_minutes INT NOT NULL DEFAULT 3,
  display_duration_seconds INT NOT NULL DEFAULT 15,
  days_of_week JSON NOT NULL,
  start_date VARCHAR(64),
  end_date VARCHAR(64),
  start_time VARCHAR(64),
  end_time VARCHAR(64),
  status VARCHAR(64) NOT NULL DEFAULT 'active',
  expires_at BIGINT,
  created_at DATETIME(3) NOT NULL,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE SET NULL,
  INDEX idx_campaigns_status_priority (status, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_targets (
  id VARCHAR(64) PRIMARY KEY,
  campaign_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  INDEX idx_campaign_targets (campaign_id, target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_commands (
  id VARCHAR(64) PRIMARY KEY,
  screen_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64),
  command_type VARCHAR(64) NOT NULL,
  payload JSON,
  status VARCHAR(64) NOT NULL DEFAULT 'CREATED',
  error_message TEXT,
  created_at DATETIME(3) NOT NULL,
  sent_at DATETIME(3),
  received_at DATETIME(3),
  applied_at DATETIME(3),
  acknowledged_at DATETIME(3),
  expires_at BIGINT NOT NULL,
  FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
  INDEX idx_commands_screen (screen_id, status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS emergency_events (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(64) NOT NULL DEFAULT 'critical',
  display_mode VARCHAR(64) NOT NULL DEFAULT 'takeover',
  target_type VARCHAR(64) NOT NULL DEFAULT 'ALL',
  target_ids JSON NOT NULL,
  highlight_screen TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  duration_seconds INT,
  expires_at BIGINT,
  created_at DATETIME(3) NOT NULL,
  cleared_at DATETIME(3),
  INDEX idx_emergency_active (is_active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  details JSON,
  timestamp DATETIME(3) NOT NULL,
  user_id VARCHAR(64),
  ip VARCHAR(64),
  INDEX idx_audit_timestamp (timestamp),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
