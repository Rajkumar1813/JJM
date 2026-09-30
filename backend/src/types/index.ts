export type ScreenStatus = 'active' | 'inactive';
export type ConnectionStatus = 'online' | 'offline';

export type HealthStatus =
  | 'ONLINE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'SYNCING'
  | 'UPDATE_REQUIRED'
  | 'QUEUE_STALE'
  | 'EMERGENCY'
  | 'ERROR'
  | 'RECOVERING';

export type CommandType =
  | 'SYNC_CONFIG'
  | 'SYNC_MEDIA'
  | 'RELOAD_QUEUE'
  | 'RESTART_PLAYER'
  | 'CLEAR_CACHE'
  | 'TAKE_SNAPSHOT'
  | 'PLAY_CAMPAIGN'
  | 'STOP_CAMPAIGN'
  | 'EMERGENCY_OVERRIDE';

export type CommandStatus =
  | 'CREATED'
  | 'SENT'
  | 'RECEIVED'
  | 'APPLIED'
  | 'ACKNOWLEDGED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'EXPIRED';

export interface Department {
  id: string;
  name: string;
  code: string;
  floor: string;
  description: string;
  defaultQueueUrl: string;
  defaultPlaylistId?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Device {
  id: string;
  deviceToken: string;
  platform: string;
  model?: string;
  appVersion: string;
  ipAddress?: string;
  macAddress?: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface Screen {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  deviceId?: string | null;
  location: string;
  queueUrl: string;
  staleThresholdSeconds: number; // Configurable per screen (default: 180s)
  targetConfigVersion: number;   // Server authoritative target version
  appliedConfigVersion: number;  // Reported by TV
  mediaManifestVersion: number;
  status: ScreenStatus;
  connectionStatus: ConnectionStatus;
  healthStatus: HealthStatus;
  lastHeartbeat: string | null;
  lastHeartbeatAt?: string | null;
  lastSyncAt?: string | null;
  currentContent: string;
  currentCampaignId: string | null;
  playlistId: string | null;
  deviceToken: string | null;
  playerVersion: string;
  isPaused?: boolean;
  powerState?: 'on' | 'off';
  latestSnapshot?: string;
  latestSnapshotTime?: string;
  deviceMetadata?: {
    platform?: string;
    model?: string;
    screenResolution?: string;
    ipAddress?: string;
  };
  createdAt: string;
}

export interface PairingSession {
  pairingCode: string;
  socketId?: string;
  expiresAt: number;
  status: 'pending' | 'paired' | 'expired';
  screenId?: string;
  deviceToken?: string;
  deviceMetadata?: Record<string, any>;
  createdAt?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  type: 'image' | 'video' | 'announcement';
  url: string;
  sha256Hash: string;
  fileSize: number;
  duration: number; // in seconds
  dimensions?: string;
  tags: string[];
  category: string;
  createdAt: string;
}

export interface PlaylistItem {
  id: string;
  type: 'queue' | 'image' | 'video' | 'announcement';
  mediaId?: string;
  mediaUrl?: string;
  title: string;
  duration: number; // in seconds
  order: number;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  items: PlaylistItem[];
  isDefault: boolean;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  type: 'global' | 'department' | 'screen' | 'emergency';
  contentType?: 'playlist' | 'single_image' | 'single_image_only' | 'image' | 'video' | 'single_video' | 'single_video_only' | 'only_queue' | string;
  targetIds: string[]; // ["all"] or department IDs or screen IDs
  mediaId?: string;
  mediaUrl?: string;
  playlistId?: string;
  priority: number;
  intervalMinutes: number;
  displayDurationSeconds: number;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  daysOfWeek: number[]; // 0 = Sunday, 6 = Saturday
  status: 'active' | 'scheduled' | 'paused' | 'expired';
  createdAt: string;
}

export interface CampaignTarget {
  id: string;
  campaignId: string;
  targetType: 'ALL' | 'DEPARTMENT' | 'SCREEN';
  targetId: string;
}

export interface DeviceCommand {
  id: string;
  screenId: string;
  deviceId?: string | null;
  commandType: CommandType;
  payload?: any;
  status: CommandStatus;
  errorMessage?: string | null;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  appliedAt?: string | null;
  acknowledgedAt?: string | null;
  expiresAt: number;
}

export interface EmergencyAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  displayMode: 'takeover' | 'banner' | 'both';
  targetType: 'ALL' | 'DEPARTMENT' | 'SCREEN';
  targetIds: string[];
  highlightScreen: boolean;
  active: boolean;
  isActive?: boolean;
  status?: string;
  durationSeconds?: number;
  expiresAt?: number;
  createdAt: string;
  clearedAt?: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  timestamp: string;
  userId?: string;
}

export interface ResolvedDisplayConfig {
  screenId: string;
  screenName: string;
  departmentId: string;
  departmentName: string;
  queueUrl: string;
  staleThresholdSeconds: number;
  configVersion: number;
  mediaManifestVersion: number;
  activeCampaign: {
    id: string;
    name: string;
    type: string;
    priority: number;
    contentType?: string;
  } | null;
  playlist: PlaylistItem[];
  settings: {
    transition: 'fade' | 'slide' | 'none';
    heartbeatSeconds: number;
    offlineMediaCached: boolean;
    announcementTicker?: string;
    isPaused?: boolean;
    powerState?: 'on' | 'off';
    emergencyAnnouncement?: EmergencyAnnouncement | null;
  };
}

export interface ReconciliationResponse {
  success: boolean;
  screenId: string;
  configVersion: number;
  mediaManifestVersion: number;
  config: ResolvedDisplayConfig;
  activeEmergency: EmergencyAnnouncement | null;
  pendingCommands: DeviceCommand[];
  timestamp: string;
}
