import { sqlite } from '../sqlite';
import { DeviceCommand, CommandType, CommandStatus } from '../../types';

export class CommandRepository {
  public create(cmd: {
    id: string;
    screenId: string;
    deviceId?: string | null;
    commandType: CommandType;
    payload?: any;
    expiresAt?: number;
  }): DeviceCommand {
    const createdAt = new Date().toISOString();
    const expiresAt = cmd.expiresAt || (Date.now() + 60000); // 60s default expiry

    sqlite.prepare(`
      INSERT INTO device_commands (
        id, screen_id, device_id, command_type, payload, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?)
    `).run(
      cmd.id,
      cmd.screenId,
      cmd.deviceId || null,
      cmd.commandType,
      cmd.payload ? JSON.stringify(cmd.payload) : null,
      createdAt,
      expiresAt
    );

    return this.getById(cmd.id)!;
  }

  public getById(id: string): DeviceCommand | undefined {
    const r = sqlite.prepare('SELECT * FROM device_commands WHERE id = ?').get(id) as any;
    return r ? this.mapRow(r) : undefined;
  }

  public getPendingForScreen(screenId: string): DeviceCommand[] {
    const rows = sqlite.prepare(`
      SELECT * FROM device_commands
      WHERE screen_id = ? AND status IN ('CREATED', 'SENT', 'RECEIVED') AND expires_at > ?
      ORDER BY created_at ASC
    `).all(screenId, Date.now()) as any[];
    return rows.map(r => this.mapRow(r));
  }

  public getRecentForScreen(screenId: string, limit = 10): DeviceCommand[] {
    const rows = sqlite.prepare(`
      SELECT * FROM device_commands
      WHERE screen_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(screenId, limit) as any[];
    return rows.map(r => this.mapRow(r));
  }

  public markSent(id: string): DeviceCommand | null {
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE device_commands SET status = 'SENT', sent_at = ? WHERE id = ? AND status = 'CREATED'").run(now, id);
    return this.getById(id) || null;
  }

  public markReceived(id: string): DeviceCommand | null {
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE device_commands SET status = 'RECEIVED', received_at = ? WHERE id = ? AND status IN ('CREATED', 'SENT')").run(now, id);
    return this.getById(id) || null;
  }

  public markApplied(id: string): DeviceCommand | null {
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE device_commands SET status = 'APPLIED', applied_at = ? WHERE id = ?").run(now, id);
    return this.getById(id) || null;
  }

  public markAcknowledged(id: string): DeviceCommand | null {
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE device_commands SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE id = ?").run(now, id);
    return this.getById(id) || null;
  }

  public markFailed(id: string, errorMessage: string): DeviceCommand | null {
    sqlite.prepare("UPDATE device_commands SET status = 'FAILED', error_message = ? WHERE id = ?").run(errorMessage, id);
    return this.getById(id) || null;
  }

  public reapExpiredTimeouts(timeoutThresholdMs = 30000): number {
    const now = Date.now();
    const res = sqlite.prepare(`
      UPDATE device_commands
      SET status = 'TIMEOUT', error_message = 'Command timed out without TV acknowledgement'
      WHERE status IN ('CREATED', 'SENT', 'RECEIVED') AND expires_at < ?
    `).run(now);
    return res.changes;
  }

  private mapRow(r: any): DeviceCommand {
    let payload;
    try {
      payload = r.payload ? JSON.parse(r.payload) : undefined;
    } catch (_) {}

    return {
      id: r.id,
      screenId: r.screen_id,
      deviceId: r.device_id || undefined,
      commandType: r.command_type as CommandType,
      payload,
      status: r.status as CommandStatus,
      errorMessage: r.error_message || undefined,
      createdAt: r.created_at,
      sentAt: r.sent_at || undefined,
      receivedAt: r.received_at || undefined,
      appliedAt: r.applied_at || undefined,
      acknowledgedAt: r.acknowledged_at || undefined,
      expiresAt: r.expires_at,
    };
  }
}

export const commandRepo = new CommandRepository();
