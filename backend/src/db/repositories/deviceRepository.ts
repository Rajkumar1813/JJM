import { sqlite } from '../sqlite';
import { Device } from '../../types';

export class DeviceRepository {
  public getAll(): Device[] {
    const rows = sqlite.prepare('SELECT * FROM devices ORDER BY last_seen_at DESC').all() as any[];
    return rows.map(r => this.mapRow(r));
  }

  public getById(id: string): Device | undefined {
    const r = sqlite.prepare('SELECT * FROM devices WHERE id = ?').get(id) as any;
    return r ? this.mapRow(r) : undefined;
  }

  public getByToken(token: string): Device | undefined {
    const r = sqlite.prepare('SELECT * FROM devices WHERE device_token = ?').get(token) as any;
    return r ? this.mapRow(r) : undefined;
  }

  public upsert(device: {
    id: string;
    deviceToken: string;
    platform: string;
    model?: string;
    appVersion: string;
    ipAddress?: string;
    macAddress?: string;
  }): Device {
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO devices (id, device_token, platform, model, app_version, ip_address, mac_address, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_token) DO UPDATE SET
        platform = excluded.platform,
        model = excluded.model,
        app_version = excluded.app_version,
        ip_address = excluded.ip_address,
        mac_address = excluded.mac_address,
        last_seen_at = excluded.last_seen_at
    `).run(
      device.id,
      device.deviceToken,
      device.platform,
      device.model || null,
      device.appVersion,
      device.ipAddress || null,
      device.macAddress || null,
      now,
      now
    );

    return this.getByToken(device.deviceToken)!;
  }

  public updateLastSeen(id: string): void {
    sqlite.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  private mapRow(r: any): Device {
    return {
      id: r.id,
      deviceToken: r.device_token,
      platform: r.platform,
      model: r.model || undefined,
      appVersion: r.app_version,
      ipAddress: r.ip_address || undefined,
      macAddress: r.mac_address || undefined,
      lastSeenAt: r.last_seen_at,
      createdAt: r.created_at,
    };
  }
}

export const deviceRepo = new DeviceRepository();
