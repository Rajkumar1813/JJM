import { sqlite } from '../sqlite';
import { Screen, HealthStatus, ConnectionStatus, ScreenStatus } from '../../types';

export class ScreenRepository {
  public getAll(): Screen[] {
    const rows = sqlite.prepare('SELECT * FROM screens ORDER BY name ASC').all() as any[];
    return rows.map(r => this.mapRow(r));
  }

  public getById(id: string): Screen | undefined {
    const r = sqlite.prepare('SELECT * FROM screens WHERE id = ?').get(id) as any;
    return r ? this.mapRow(r) : undefined;
  }

  public getByToken(token: string): Screen | undefined {
    const r = sqlite.prepare('SELECT * FROM screens WHERE device_token = ?').get(token) as any;
    return r ? this.mapRow(r) : undefined;
  }

  public getByDepartment(departmentId: string): Screen[] {
    const rows = sqlite.prepare('SELECT * FROM screens WHERE department_id = ? ORDER BY name ASC').all(departmentId) as any[];
    return rows.map(r => this.mapRow(r));
  }

  public create(screen: Omit<Screen, 'createdAt'> & { id?: string }): Screen {
    const id = screen.id || `SCR-${screen.code.toUpperCase()}`;
    const createdAt = new Date().toISOString();

    sqlite.prepare(`
      INSERT INTO screens (
        id, name, code, department_id, device_id, location, queue_url,
        stale_threshold_seconds, target_config_version, applied_config_version, media_manifest_version,
        status, connection_status, health_status, current_content, current_campaign_id,
        playlist_id, device_token, player_version, is_paused, power_state,
        latest_snapshot, latest_snapshot_time, last_heartbeat, last_heartbeat_at, last_sync_at,
        device_metadata, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )
    `).run(
      id,
      screen.name,
      screen.code,
      screen.departmentId,
      screen.deviceId || null,
      screen.location,
      screen.queueUrl,
      screen.staleThresholdSeconds || 180,
      screen.targetConfigVersion || 1,
      screen.appliedConfigVersion || 0,
      screen.mediaManifestVersion || 1,
      screen.status || 'active',
      screen.connectionStatus || 'offline',
      screen.healthStatus || 'OFFLINE',
      screen.currentContent || 'queue',
      screen.currentCampaignId || null,
      screen.playlistId || 'PL-DEFAULT',
      screen.deviceToken || null,
      screen.playerVersion || '1.0.0',
      screen.isPaused ? 1 : 0,
      screen.powerState || 'on',
      screen.latestSnapshot || null,
      screen.latestSnapshotTime || null,
      screen.lastHeartbeat || null,
      screen.lastHeartbeatAt || null,
      screen.lastSyncAt || null,
      screen.deviceMetadata ? JSON.stringify(screen.deviceMetadata) : null,
      createdAt
    );

    return this.getById(id)!;
  }

  public update(id: string, updates: Partial<Screen>): Screen | null {
    const current = this.getById(id);
    if (!current) return null;

    const updated = { ...current, ...updates };

    sqlite.prepare(`
      UPDATE screens SET
        name = ?,
        code = ?,
        department_id = ?,
        device_id = ?,
        location = ?,
        queue_url = ?,
        stale_threshold_seconds = ?,
        target_config_version = ?,
        applied_config_version = ?,
        media_manifest_version = ?,
        status = ?,
        connection_status = ?,
        health_status = ?,
        current_content = ?,
        current_campaign_id = ?,
        playlist_id = ?,
        device_token = ?,
        player_version = ?,
        is_paused = ?,
        power_state = ?,
        latest_snapshot = ?,
        latest_snapshot_time = ?,
        last_heartbeat = ?,
        last_heartbeat_at = ?,
        last_sync_at = ?,
        device_metadata = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.code,
      updated.departmentId,
      updated.deviceId || null,
      updated.location,
      updated.queueUrl,
      updated.staleThresholdSeconds ?? 180,
      updated.targetConfigVersion ?? 1,
      updated.appliedConfigVersion ?? 0,
      updated.mediaManifestVersion ?? 1,
      updated.status,
      updated.connectionStatus,
      updated.healthStatus,
      updated.currentContent,
      updated.currentCampaignId || null,
      updated.playlistId || 'PL-DEFAULT',
      updated.deviceToken || null,
      updated.playerVersion,
      updated.isPaused ? 1 : 0,
      updated.powerState || 'on',
      updated.latestSnapshot || null,
      updated.latestSnapshotTime || null,
      updated.lastHeartbeat || null,
      updated.lastHeartbeatAt || null,
      updated.lastSyncAt || null,
      updated.deviceMetadata ? JSON.stringify(updated.deviceMetadata) : null,
      id
    );

    return this.getById(id)!;
  }

  public incrementTargetConfigVersion(id: string): number {
    sqlite.prepare('UPDATE screens SET target_config_version = target_config_version + 1 WHERE id = ?').run(id);
    const screen = this.getById(id);
    return screen ? screen.targetConfigVersion : 1;
  }

  public incrementAllTargetConfigVersions(): void {
    sqlite.prepare('UPDATE screens SET target_config_version = target_config_version + 1').run();
  }

  public incrementDepartmentTargetConfigVersions(departmentId: string): void {
    sqlite.prepare('UPDATE screens SET target_config_version = target_config_version + 1 WHERE department_id = ?').run(departmentId);
  }

  public recordHeartbeat(id: string, heartbeat: {
    appliedConfigVersion?: number;
    mediaManifestVersion?: number;
    currentContent?: string;
    playerVersion?: string;
    healthStatus?: HealthStatus;
    deviceMetadata?: any;
  }): Screen | null {
    const now = new Date().toISOString();
    sqlite.prepare(`
      UPDATE screens SET
        connection_status = 'online',
        last_heartbeat = ?,
        last_heartbeat_at = ?,
        applied_config_version = COALESCE(?, applied_config_version),
        media_manifest_version = COALESCE(?, media_manifest_version),
        current_content = COALESCE(?, current_content),
        player_version = COALESCE(?, player_version),
        health_status = COALESCE(?, health_status),
        device_metadata = COALESCE(?, device_metadata)
      WHERE id = ?
    `).run(
      now,
      now,
      heartbeat.appliedConfigVersion ?? null,
      heartbeat.mediaManifestVersion ?? null,
      heartbeat.currentContent ?? null,
      heartbeat.playerVersion ?? null,
      heartbeat.healthStatus ?? null,
      heartbeat.deviceMetadata ? JSON.stringify(heartbeat.deviceMetadata) : null,
      id
    );

    return this.getById(id) || null;
  }

  public delete(id: string): boolean {
    const res = sqlite.prepare('DELETE FROM screens WHERE id = ?').run(id);
    return res.changes > 0;
  }

  private mapRow(r: any): Screen {
    let metadata;
    try {
      metadata = r.device_metadata ? JSON.parse(r.device_metadata) : undefined;
    } catch (_) {}

    return {
      id: r.id,
      name: r.name,
      code: r.code,
      departmentId: r.department_id,
      deviceId: r.device_id || null,
      location: r.location,
      queueUrl: r.queue_url,
      staleThresholdSeconds: r.stale_threshold_seconds ?? 180,
      targetConfigVersion: r.target_config_version ?? 1,
      appliedConfigVersion: r.applied_config_version ?? 0,
      mediaManifestVersion: r.media_manifest_version ?? 1,
      status: r.status as ScreenStatus,
      connectionStatus: r.connection_status as ConnectionStatus,
      healthStatus: (r.health_status || 'OFFLINE') as HealthStatus,
      lastHeartbeat: r.last_heartbeat || null,
      lastHeartbeatAt: r.last_heartbeat_at || null,
      lastSyncAt: r.last_sync_at || null,
      currentContent: r.current_content || 'queue',
      currentCampaignId: r.current_campaign_id || null,
      playlistId: r.playlist_id || 'PL-DEFAULT',
      deviceToken: r.device_token || null,
      playerVersion: r.player_version || '1.0.0',
      isPaused: r.is_paused === 1,
      powerState: (r.power_state || 'on') as 'on' | 'off',
      latestSnapshot: r.latest_snapshot || undefined,
      latestSnapshotTime: r.latest_snapshot_time || undefined,
      deviceMetadata: metadata,
      createdAt: r.created_at,
    };
  }
}

export const screenRepo = new ScreenRepository();
