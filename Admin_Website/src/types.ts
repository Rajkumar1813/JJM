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
  screenCount?: number;
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
  staleThresholdSeconds?: number;
  targetConfigVersion: number;
  appliedConfigVersion: number;
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

export interface DeviceCommand {
  id: string;
  screenId: string;
  deviceId?: string;
  commandType: CommandType;
  payload?: any;
  status: CommandStatus;
  errorMessage?: string;
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
  appliedAt?: string;
  acknowledgedAt?: string;
  expiresAt: number;
}

export interface MediaItem {
  id: string;
  title: string;
  type: 'image' | 'video' | 'announcement';
  url: string;
  sha256Hash?: string;
  fileSize?: number;
  duration: number;
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
  duration: number;
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
  targetIds: string[];
  mediaId?: string;
  mediaUrl?: string;
  playlistId?: string;
  priority: number;
  intervalMinutes?: number;
  displayDurationSeconds?: number;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  daysOfWeek: number[];
  status: 'active' | 'scheduled' | 'paused' | 'expired';
  createdAt: string;
}

export interface EmergencyAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  displayMode: 'takeover' | 'banner' | 'both';
  targetType?: 'ALL' | 'DEPARTMENT' | 'SCREEN';
  targetIds?: string[];
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
