import { query, queryOne, execute } from '../mysql';
import { Device } from '../../types';
import { generateId, formatDateTimeToISO } from './repoUtils';

export class DeviceRepository {
  public async getAll(): Promise<Device[]> {
    const rows = await query('SELECT * FROM devices ORDER BY last_seen_at DESC');
    return rows.map(r => this.mapRow(r));
  }

  public async getById(id: string): Promise<Device | undefined> {
    const r = await queryOne('SELECT * FROM devices WHERE id = ?', [id]);
    return r ? this.mapRow(r) : undefined;
  }

  public async getByToken(token: string): Promise<Device | undefined> {
    const r = await queryOne('SELECT * FROM devices WHERE device_token = ?', [token]);
    return r ? this.mapRow(r) : undefined;
  }

  public async upsert(device: {
    id?: string;
    deviceToken: string;
    platform: string;
    model?: string;
    appVersion: string;
    ipAddress?: string;
    macAddress?: string;
  }): Promise<Device> {
    const now = new Date();
    const id = device.id || generateId('DEV');
    
    await execute(`
      INSERT INTO devices (id, device_token, platform, model, app_version, ip_address, mac_address, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        platform = VALUES(platform),
        model = VALUES(model),
        app_version = VALUES(app_version),
        ip_address = VALUES(ip_address),
        mac_address = VALUES(mac_address),
        last_seen_at = VALUES(last_seen_at)
    `, [
      id,
      device.deviceToken,
      device.platform,
      device.model || null,
      device.appVersion,
      device.ipAddress || null,
      device.macAddress || null,
      now,
      now
    ]);

    return (await this.getByToken(device.deviceToken))!;
  }

  public async updateLastSeen(id: string): Promise<void> {
    await execute('UPDATE devices SET last_seen_at = ? WHERE id = ?', [new Date(), id]);
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
      lastSeenAt: formatDateTimeToISO(r.last_seen_at)!,
      createdAt: formatDateTimeToISO(r.created_at)!,
    };
  }
}

export const deviceRepo = new DeviceRepository();
