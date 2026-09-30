import { query, queryOne, execute } from '../mysql';
import { Screen, HealthStatus, ConnectionStatus, ScreenStatus } from '../../types';
import { generateId, buildUpdateQuery, formatDateTimeToISO, safeJson } from './repoUtils';

export class ScreenRepository {
  public async getAll(): Promise<Screen[]> {
    const rows = await query('SELECT * FROM screens ORDER BY name ASC');
    return rows.map(r => this.mapRow(r));
  }

  public async getById(id: string): Promise<Screen | undefined> {
    const r = await queryOne('SELECT * FROM screens WHERE id = ?', [id]);
    return r ? this.mapRow(r) : undefined;
  }

  public async getByToken(token: string): Promise<Screen | undefined> {
    const r = await queryOne('SELECT * FROM screens WHERE device_token = ?', [token]);
    return r ? this.mapRow(r) : undefined;
  }

  public async getByDepartment(departmentId: string): Promise<Screen[]> {
    const rows = await query('SELECT * FROM screens WHERE department_id = ? ORDER BY name ASC', [departmentId]);
    return rows.map(r => this.mapRow(r));
  }

  public async create(screen: Omit<Screen, 'createdAt'> & { id?: string }): Promise<Screen> {
    const id = screen.id || generateId('SCR');
    const createdAt = new Date();

    await execute(`
      INSERT INTO screens (
        id, name, code, department_id, device_id, location, queue_url,
        stale_threshold_seconds, target_config_version, applied_config_version, media_manifest_version,
        status, connection_status, health_status, current_content, current_campaign_id,
        playlist_id, device_token, player_version, is_paused, power_state,
        last_heartbeat, last_heartbeat_at, last_sync_at,
        device_metadata, display_key, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
    `, [
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
      screen.lastHeartbeat ? new Date(screen.lastHeartbeat) : null,
      screen.lastHeartbeatAt ? new Date(screen.lastHeartbeatAt) : null,
      screen.lastSyncAt ? new Date(screen.lastSyncAt) : null,
      screen.deviceMetadata ? JSON.stringify(screen.deviceMetadata) : null,
      screen.displayKey || require('crypto').randomBytes(16).toString('hex'),
      createdAt
    ]);

    return (await this.getById(id))!;
  }

  public async update(id: string, updates: Partial<Screen>): Promise<Screen | null> {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.code !== undefined) dbUpdates.code = updates.code;
    if (updates.departmentId !== undefined) dbUpdates.department_id = updates.departmentId;
    if (updates.deviceId !== undefined) dbUpdates.device_id = updates.deviceId;
    if (updates.location !== undefined) dbUpdates.location = updates.location;
    if (updates.queueUrl !== undefined) dbUpdates.queue_url = updates.queueUrl;
    if (updates.staleThresholdSeconds !== undefined) dbUpdates.stale_threshold_seconds = updates.staleThresholdSeconds;
    if (updates.targetConfigVersion !== undefined) dbUpdates.target_config_version = updates.targetConfigVersion;
    if (updates.appliedConfigVersion !== undefined) dbUpdates.applied_config_version = updates.appliedConfigVersion;
    if (updates.mediaManifestVersion !== undefined) dbUpdates.media_manifest_version = updates.mediaManifestVersion;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.connectionStatus !== undefined) dbUpdates.connection_status = updates.connectionStatus;
    if (updates.healthStatus !== undefined) dbUpdates.health_status = updates.healthStatus;
    if (updates.currentContent !== undefined) dbUpdates.current_content = updates.currentContent;
    if (updates.currentCampaignId !== undefined) dbUpdates.current_campaign_id = updates.currentCampaignId;
    if (updates.playlistId !== undefined) dbUpdates.playlist_id = updates.playlistId;
    if (updates.deviceToken !== undefined) dbUpdates.device_token = updates.deviceToken;
    if (updates.playerVersion !== undefined) dbUpdates.player_version = updates.playerVersion;
    if (updates.isPaused !== undefined) dbUpdates.is_paused = updates.isPaused ? 1 : 0;
    if (updates.powerState !== undefined) dbUpdates.power_state = updates.powerState;
    if (updates.lastHeartbeat !== undefined) dbUpdates.last_heartbeat = updates.lastHeartbeat ? new Date(updates.lastHeartbeat) : null;
    if (updates.lastHeartbeatAt !== undefined) dbUpdates.last_heartbeat_at = updates.lastHeartbeatAt ? new Date(updates.lastHeartbeatAt) : null;
    if (updates.lastSyncAt !== undefined) dbUpdates.last_sync_at = updates.lastSyncAt ? new Date(updates.lastSyncAt) : null;
    if (updates.deviceMetadata !== undefined) dbUpdates.device_metadata = updates.deviceMetadata ? JSON.stringify(updates.deviceMetadata) : null;
    if (updates.displayKey !== undefined) dbUpdates.display_key = updates.displayKey;

    const q = buildUpdateQuery('screens', id, dbUpdates);
    if (q) {
      await execute(q.sql, q.values);
    }
    
    // Check if we need to update snapshot in screen_snapshots (legacy support if passed in updates)
    if (updates.latestSnapshot !== undefined) {
      await this.saveSnapshot(id, updates.latestSnapshot || '');
    }

    return await this.getById(id) || null;
  }

  public async incrementTargetConfigVersion(id: string): Promise<number> {
    await execute('UPDATE screens SET target_config_version = target_config_version + 1 WHERE id = ?', [id]);
    const screen = await this.getById(id);
    return screen ? screen.targetConfigVersion : 1;
  }

  public async incrementAllTargetConfigVersions(): Promise<void> {
    await execute('UPDATE screens SET target_config_version = target_config_version + 1');
  }

  public async incrementDepartmentTargetConfigVersions(departmentId: string): Promise<void> {
    await execute('UPDATE screens SET target_config_version = target_config_version + 1 WHERE department_id = ?', [departmentId]);
  }

  public async recordHeartbeat(id: string, heartbeat: {
    appliedConfigVersion?: number;
    mediaManifestVersion?: number;
    currentContent?: string;
    playerVersion?: string;
    healthStatus?: HealthStatus;
    deviceMetadata?: any;
  }): Promise<Screen | null> {
    const now = new Date();
    
    const dbUpdates: Record<string, any> = {
      connection_status: 'online',
      last_heartbeat: now,
      last_heartbeat_at: now
    };
    if (heartbeat.appliedConfigVersion !== undefined) dbUpdates.applied_config_version = heartbeat.appliedConfigVersion;
    if (heartbeat.mediaManifestVersion !== undefined) dbUpdates.media_manifest_version = heartbeat.mediaManifestVersion;
    if (heartbeat.currentContent !== undefined) dbUpdates.current_content = heartbeat.currentContent;
    if (heartbeat.playerVersion !== undefined) dbUpdates.player_version = heartbeat.playerVersion;
    if (heartbeat.healthStatus !== undefined) dbUpdates.health_status = heartbeat.healthStatus;
    if (heartbeat.deviceMetadata !== undefined) dbUpdates.device_metadata = heartbeat.deviceMetadata ? JSON.stringify(heartbeat.deviceMetadata) : null;

    const q = buildUpdateQuery('screens', id, dbUpdates);
    if (q) {
      await execute(q.sql, q.values);
    }

    return await this.getById(id) || null;
  }

  public async delete(id: string): Promise<boolean> {
    const res = await execute('DELETE FROM screens WHERE id = ?', [id]);
    return res.affectedRows > 0;
  }

  public async getSnapshot(id: string): Promise<{ image: string, time: string } | null> {
    const r = await queryOne<any>('SELECT image, captured_at FROM screen_snapshots WHERE screen_id = ?', [id]);
    if (r) {
      return {
        image: r.image,
        time: formatDateTimeToISO(r.captured_at)!
      };
    }
    return null;
  }

  public async saveSnapshot(id: string, image: string): Promise<void> {
    const now = new Date();
    await execute(`
      INSERT INTO screen_snapshots (screen_id, image, captured_at) 
      VALUES (?, ?, ?) 
      ON DUPLICATE KEY UPDATE image = VALUES(image), captured_at = VALUES(captured_at)
    `, [id, image, now]);
  }

  private mapRow(r: any): Screen {
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
      lastHeartbeat: formatDateTimeToISO(r.last_heartbeat) || null,
      lastHeartbeatAt: formatDateTimeToISO(r.last_heartbeat_at) || null,
      lastSyncAt: formatDateTimeToISO(r.last_sync_at) || null,
      currentContent: r.current_content || 'queue',
      currentCampaignId: r.current_campaign_id || null,
      playlistId: r.playlist_id || 'PL-DEFAULT',
      deviceToken: r.device_token || null,
      playerVersion: r.player_version || '1.0.0',
      isPaused: r.is_paused === 1,
      powerState: (r.power_state || 'on') as 'on' | 'off',
      deviceMetadata: safeJson(r.device_metadata, undefined),
      displayKey: r.display_key || undefined,
      createdAt: formatDateTimeToISO(r.created_at)!,
    };
  }
}

export const screenRepo = new ScreenRepository();
