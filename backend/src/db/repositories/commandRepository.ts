import { query, queryOne, execute } from '../mysql';
import { DeviceCommand, CommandType, CommandStatus } from '../../types';
import { generateId, buildUpdateQuery, formatDateTimeToISO, safeJson } from './repoUtils';

export class CommandRepository {
  public async create(cmd: {
    id?: string;
    screenId: string;
    deviceId?: string | null;
    commandType: CommandType;
    payload?: any;
    expiresAt?: number;
  }): Promise<DeviceCommand> {
    const id = cmd.id || generateId('CMD');
    const createdAt = new Date();
    const expiresAt = cmd.expiresAt || (Date.now() + 60000); // 60s default expiry

    await execute(`
      INSERT INTO device_commands (
        id, screen_id, device_id, command_type, payload, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?)
    `, [
      id,
      cmd.screenId,
      cmd.deviceId || null,
      cmd.commandType,
      cmd.payload ? JSON.stringify(cmd.payload) : null,
      createdAt,
      expiresAt
    ]);

    return (await this.getById(id))!;
  }

  public async getById(id: string): Promise<DeviceCommand | undefined> {
    const r = await queryOne('SELECT * FROM device_commands WHERE id = ?', [id]);
    return r ? this.mapRow(r) : undefined;
  }

  public async getPendingForScreen(screenId: string): Promise<DeviceCommand[]> {
    const rows = await query(`
      SELECT * FROM device_commands
      WHERE screen_id = ? AND status IN ('CREATED', 'SENT', 'RECEIVED') AND expires_at > ?
      ORDER BY created_at ASC
    `, [screenId, Date.now()]);
    return rows.map(r => this.mapRow(r));
  }

  public async getRecentForScreen(screenId: string, limit = 10): Promise<DeviceCommand[]> {
    const rows = await query(`
      SELECT * FROM device_commands
      WHERE screen_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [screenId, limit]);
    return rows.map(r => this.mapRow(r));
  }

  public async markSent(id: string): Promise<DeviceCommand | null> {
    const now = new Date();
    await execute("UPDATE device_commands SET status = 'SENT', sent_at = ? WHERE id = ? AND status = 'CREATED'", [now, id]);
    return await this.getById(id) || null;
  }

  public async markReceived(id: string): Promise<DeviceCommand | null> {
    const now = new Date();
    await execute("UPDATE device_commands SET status = 'RECEIVED', received_at = ? WHERE id = ? AND status IN ('CREATED', 'SENT')", [now, id]);
    return await this.getById(id) || null;
  }

  public async markApplied(id: string): Promise<DeviceCommand | null> {
    const now = new Date();
    await execute("UPDATE device_commands SET status = 'APPLIED', applied_at = ? WHERE id = ?", [now, id]);
    return await this.getById(id) || null;
  }

  public async markAcknowledged(id: string): Promise<DeviceCommand | null> {
    const now = new Date();
    await execute("UPDATE device_commands SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE id = ?", [now, id]);
    return await this.getById(id) || null;
  }

  public async markFailed(id: string, errorMessage: string): Promise<DeviceCommand | null> {
    await execute("UPDATE device_commands SET status = 'FAILED', error_message = ? WHERE id = ?", [errorMessage, id]);
    return await this.getById(id) || null;
  }

  public async reapExpiredTimeouts(timeoutThresholdMs = 30000): Promise<number> {
    const now = Date.now();
    const res = await execute(`
      UPDATE device_commands
      SET status = 'TIMEOUT', error_message = 'Command timed out without TV acknowledgement'
      WHERE status IN ('CREATED', 'SENT', 'RECEIVED') AND expires_at < ?
    `, [now]);
    return res.affectedRows;
  }

  private mapRow(r: any): DeviceCommand {
    return {
      id: r.id,
      screenId: r.screen_id,
      deviceId: r.device_id || undefined,
      commandType: r.command_type as CommandType,
      payload: safeJson(r.payload, undefined),
      status: r.status as CommandStatus,
      errorMessage: r.error_message || undefined,
      createdAt: formatDateTimeToISO(r.created_at)!,
      sentAt: formatDateTimeToISO(r.sent_at) || undefined,
      receivedAt: formatDateTimeToISO(r.received_at) || undefined,
      appliedAt: formatDateTimeToISO(r.applied_at) || undefined,
      acknowledgedAt: formatDateTimeToISO(r.acknowledged_at) || undefined,
      expiresAt: r.expires_at,
    };
  }
}

export const commandRepo = new CommandRepository();
