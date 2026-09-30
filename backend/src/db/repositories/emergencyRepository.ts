import { query, queryOne, execute } from '../mysql';
import { EmergencyAnnouncement } from '../../types';
import { generateId, buildUpdateQuery, formatDateTimeToISO, safeJson } from './repoUtils';

export class EmergencyRepository {
  public async getActive(screenId?: string, departmentId?: string): Promise<EmergencyAnnouncement | null> {
    const now = Date.now();
    const rows = await query(`
      SELECT * FROM emergency_events
      WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
    `, [now]);

    if (rows.length === 0) return null;

    for (const r of rows) {
      const announcement = this.mapRow(r);
      if (!screenId && !departmentId) return announcement;

      if (announcement.targetType === 'ALL' || announcement.targetIds.includes('all')) {
        return announcement;
      }
      if (announcement.targetType === 'DEPARTMENT' && departmentId && announcement.targetIds.includes(departmentId)) {
        return announcement;
      }
      if (announcement.targetType === 'SCREEN' && screenId && announcement.targetIds.includes(screenId)) {
        return announcement;
      }
    }

    return null;
  }

  public async getAll(): Promise<EmergencyAnnouncement[]> {
    const rows = await query('SELECT * FROM emergency_events ORDER BY created_at DESC');
    return rows.map(r => this.mapRow(r));
  }

  public async create(emergency: {
    id?: string;
    title: string;
    message: string;
    severity?: 'critical' | 'warning' | 'info';
    displayMode?: 'takeover' | 'banner' | 'both';
    targetType?: 'ALL' | 'DEPARTMENT' | 'SCREEN';
    targetIds?: string[];
    highlightScreen?: boolean;
    durationSeconds?: number;
  }): Promise<EmergencyAnnouncement> {
    const id = emergency.id || generateId('EMERG');
    const now = new Date();
    const expiresAt = emergency.durationSeconds && emergency.durationSeconds > 0
      ? Date.now() + (emergency.durationSeconds * 1000)
      : null;

    await execute(`
      INSERT INTO emergency_events (
        id, title, message, severity, display_mode, target_type, target_ids,
        highlight_screen, is_active, duration_seconds, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `, [
      id,
      emergency.title,
      emergency.message,
      emergency.severity || 'critical',
      emergency.displayMode || 'takeover',
      emergency.targetType || 'ALL',
      JSON.stringify(emergency.targetIds || ['all']),
      emergency.highlightScreen !== false ? 1 : 0,
      emergency.durationSeconds || null,
      expiresAt,
      now
    ]);

    const r = await queryOne('SELECT * FROM emergency_events WHERE id = ?', [id]);
    return this.mapRow(r);
  }

  public async clearActive(): Promise<boolean> {
    const now = new Date();
    const res = await execute("UPDATE emergency_events SET is_active = 0, cleared_at = ? WHERE is_active = 1", [now]);
    return res.affectedRows > 0;
  }

  public async clearById(id: string): Promise<boolean> {
    const now = new Date();
    const res = await execute("UPDATE emergency_events SET is_active = 0, cleared_at = ? WHERE id = ?", [now, id]);
    return res.affectedRows > 0;
  }

  private mapRow(r: any): EmergencyAnnouncement {
    return {
      id: r.id,
      title: r.title,
      message: r.message,
      severity: r.severity as 'critical' | 'warning' | 'info',
      displayMode: r.display_mode as 'takeover' | 'banner' | 'both',
      targetType: (r.target_type || 'ALL') as 'ALL' | 'DEPARTMENT' | 'SCREEN',
      targetIds: safeJson(r.target_ids, ['all']),
      highlightScreen: r.highlight_screen === 1,
      active: r.is_active === 1,
      isActive: r.is_active === 1,
      status: r.is_active === 1 ? 'active' : 'cleared',
      durationSeconds: r.duration_seconds || undefined,
      expiresAt: r.expires_at || undefined,
      createdAt: formatDateTimeToISO(r.created_at)!,
      clearedAt: formatDateTimeToISO(r.cleared_at) || null,
    };
  }
}

export const emergencyRepo = new EmergencyRepository();
