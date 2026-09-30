import { sqlite } from '../sqlite';
import { EmergencyAnnouncement } from '../../types';

export class EmergencyRepository {
  public getActive(screenId?: string, departmentId?: string): EmergencyAnnouncement | null {
    const now = Date.now();
    const rows = sqlite.prepare(`
      SELECT * FROM emergency_events
      WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
    `).all(now) as any[];

    if (rows.length === 0) return null;

    // Filter by target awareness if screenId/departmentId provided
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

  public getAll(): EmergencyAnnouncement[] {
    const rows = sqlite.prepare('SELECT * FROM emergency_events ORDER BY created_at DESC').all() as any[];
    return rows.map(r => this.mapRow(r));
  }

  public create(emergency: {
    id: string;
    title: string;
    message: string;
    severity?: 'critical' | 'warning' | 'info';
    displayMode?: 'takeover' | 'banner' | 'both';
    targetType?: 'ALL' | 'DEPARTMENT' | 'SCREEN';
    targetIds?: string[];
    highlightScreen?: boolean;
    durationSeconds?: number;
  }): EmergencyAnnouncement {
    const now = new Date().toISOString();
    const expiresAt = emergency.durationSeconds && emergency.durationSeconds > 0
      ? Date.now() + (emergency.durationSeconds * 1000)
      : null;

    sqlite.prepare(`
      INSERT INTO emergency_events (
        id, title, message, severity, display_mode, target_type, target_ids,
        highlight_screen, is_active, duration_seconds, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      emergency.id,
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
    );

    return this.mapRow(sqlite.prepare('SELECT * FROM emergency_events WHERE id = ?').get(emergency.id));
  }

  public clearActive(): boolean {
    const now = new Date().toISOString();
    const res = sqlite.prepare("UPDATE emergency_events SET is_active = 0, cleared_at = ? WHERE is_active = 1").run(now);
    return res.changes > 0;
  }

  public clearById(id: string): boolean {
    const now = new Date().toISOString();
    const res = sqlite.prepare("UPDATE emergency_events SET is_active = 0, cleared_at = ? WHERE id = ?").run(now, id);
    return res.changes > 0;
  }

  private mapRow(r: any): EmergencyAnnouncement {
    let targetIds: string[] = ['all'];
    try {
      targetIds = r.target_ids ? JSON.parse(r.target_ids) : ['all'];
    } catch (_) {}

    return {
      id: r.id,
      title: r.title,
      message: r.message,
      severity: r.severity as 'critical' | 'warning' | 'info',
      displayMode: r.display_mode as 'takeover' | 'banner' | 'both',
      targetType: (r.target_type || 'ALL') as 'ALL' | 'DEPARTMENT' | 'SCREEN',
      targetIds,
      highlightScreen: r.highlight_screen === 1,
      active: r.is_active === 1,
      isActive: r.is_active === 1,
      status: r.is_active === 1 ? 'active' : 'cleared',
      durationSeconds: r.duration_seconds || undefined,
      expiresAt: r.expires_at || undefined,
      createdAt: r.created_at,
      clearedAt: r.cleared_at || null,
    };
  }
}

export const emergencyRepo = new EmergencyRepository();
