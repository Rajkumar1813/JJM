import { sqlite } from '../sqlite';
import { Campaign, CampaignTarget } from '../../types';

export class CampaignRepository {
  public getAll(): Campaign[] {
    const rows = sqlite.prepare('SELECT * FROM campaigns ORDER BY priority DESC, created_at DESC').all() as any[];
    return rows.map(r => this.mapRow(r));
  }

  public getById(id: string): Campaign | undefined {
    const r = sqlite.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any;
    return r ? this.mapRow(r) : undefined;
  }

  public getActiveForScreen(screenId: string, departmentId: string): Campaign[] {
    const campaigns = this.getAll().filter(c => c.status === 'active');
    const matching: Campaign[] = [];

    const now = new Date();
    const currentDay = now.getDay();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const c of campaigns) {
      // 1. Day of week filter (normalize 0 and 7 for Sunday)
      if (c.daysOfWeek && c.daysOfWeek.length > 0) {
        const normalizedDays = c.daysOfWeek.map((d: number) => (d === 7 ? 0 : d));
        if (!normalizedDays.includes(currentDay)) {
          continue;
        }
      }
      // 2. Time range filter
      if (c.startTime && c.endTime) {
        if (currentTimeStr < c.startTime || currentTimeStr > c.endTime) {
          continue;
        }
      }
      // 3. Date range filter
      const todayDateStr = now.toISOString().split('T')[0];
      if (c.startDate && todayDateStr < c.startDate) continue;
      if (c.endDate && todayDateStr > c.endDate) continue;

      // 4. Target matching
      const targets = this.getTargets(c.id);
      let isTargeted = false;

      if (c.type === 'global' || targets.some(t => t.targetType === 'ALL' || t.targetId === 'all')) {
        isTargeted = true;
      } else if (targets.some(t => (t.targetType === 'DEPARTMENT' || t.targetId.startsWith('DEP-')) && t.targetId === departmentId)) {
        isTargeted = true;
      } else if (targets.some(t => (t.targetType === 'SCREEN' || t.targetId.startsWith('SCR-')) && t.targetId === screenId)) {
        isTargeted = true;
      } else if (c.targetIds && (c.targetIds.includes('all') || c.targetIds.includes(screenId) || c.targetIds.includes(departmentId))) {
        isTargeted = true;
      }

      if (isTargeted) {
        matching.push(c);
      }
    }

    return matching.sort((a, b) => b.priority - a.priority);
  }

  public getTargets(campaignId: string): CampaignTarget[] {
    const rows = sqlite.prepare('SELECT * FROM campaign_targets WHERE campaign_id = ?').all(campaignId) as any[];
    return rows.map(r => ({
      id: r.id,
      campaignId: r.campaign_id,
      targetType: r.target_type as 'ALL' | 'DEPARTMENT' | 'SCREEN',
      targetId: r.target_id,
    }));
  }

  private resolveTargetType(targetId: string): 'ALL' | 'DEPARTMENT' | 'SCREEN' {
    if (!targetId || targetId === 'all') return 'ALL';
    if (targetId.startsWith('DEP-')) return 'DEPARTMENT';
    if (targetId.startsWith('SCR-')) return 'SCREEN';
    try {
      const dept = sqlite.prepare('SELECT id FROM departments WHERE id = ?').get(targetId);
      if (dept) return 'DEPARTMENT';
      const screen = sqlite.prepare('SELECT id FROM screens WHERE id = ?').get(targetId);
      if (screen) return 'SCREEN';
    } catch (_) {}
    return 'ALL';
  }

  public create(campaign: Omit<Campaign, 'id' | 'createdAt'> & { id?: string }): Campaign {
    const id = campaign.id || `CAMP-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const createdAt = new Date().toISOString();

    const insertCampaign = sqlite.transaction(() => {
      sqlite.prepare(`
        INSERT INTO campaigns (
          id, name, description, type, content_type, media_id, media_url, playlist_id,
          priority, interval_minutes, display_duration_seconds, days_of_week,
          start_date, end_date, start_time, end_time, status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
      `).run(
        id,
        campaign.name,
        campaign.description || '',
        campaign.type || 'global',
        campaign.contentType || 'single_image',
        campaign.mediaId || null,
        campaign.mediaUrl || null,
        campaign.playlistId || null,
        campaign.priority || 50,
        campaign.intervalMinutes || 3,
        campaign.displayDurationSeconds || 15,
        JSON.stringify(campaign.daysOfWeek || [0, 1, 2, 3, 4, 5, 6]),
        campaign.startDate || null,
        campaign.endDate || null,
        campaign.startTime || null,
        campaign.endTime || null,
        campaign.status || 'active',
        createdAt
      );

      // Save target relationships
      const targetIds = campaign.targetIds || ['all'];
      for (const targetId of targetIds) {
        const targetType = this.resolveTargetType(targetId);
        sqlite.prepare(`
          INSERT INTO campaign_targets (id, campaign_id, target_type, target_id)
          VALUES (?, ?, ?, ?)
        `).run(`CT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, id, targetType, targetId);
      }
    });

    insertCampaign();
    return this.getById(id)!;
  }

  public update(id: string, updates: Partial<Campaign>): Campaign | null {
    const current = this.getById(id);
    if (!current) return null;

    const updated = { ...current, ...updates };

    const updateTransaction = sqlite.transaction(() => {
      sqlite.prepare(`
        UPDATE campaigns SET
          name = ?, description = ?, type = ?, content_type = ?,
          media_id = ?, media_url = ?, playlist_id = ?, priority = ?,
          interval_minutes = ?, display_duration_seconds = ?, days_of_week = ?,
          start_date = ?, end_date = ?, start_time = ?, end_time = ?, status = ?
        WHERE id = ?
      `).run(
        updated.name,
        updated.description || '',
        updated.type,
        updated.contentType || 'single_image',
        updated.mediaId || null,
        updated.mediaUrl || null,
        updated.playlistId || null,
        updated.priority,
        updated.intervalMinutes,
        updated.displayDurationSeconds,
        JSON.stringify(updated.daysOfWeek),
        updated.startDate || null,
        updated.endDate || null,
        updated.startTime || null,
        updated.endTime || null,
        updated.status,
        id
      );

      if (updates.targetIds) {
        sqlite.prepare('DELETE FROM campaign_targets WHERE campaign_id = ?').run(id);
        for (const targetId of updates.targetIds) {
          const targetType = this.resolveTargetType(targetId);
          sqlite.prepare(`
            INSERT INTO campaign_targets (id, campaign_id, target_type, target_id)
            VALUES (?, ?, ?, ?)
          `).run(`CT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, id, targetType, targetId);
        }
      }
    });

    updateTransaction();
    return this.getById(id)!;
  }

  public delete(id: string): boolean {
    const res = sqlite.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    return res.changes > 0;
  }

  private mapRow(r: any): Campaign {
    let daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
    try {
      daysOfWeek = r.days_of_week ? JSON.parse(r.days_of_week) : daysOfWeek;
    } catch (_) {}

    const targets = this.getTargets(r.id);
    const targetIds = targets.length > 0 ? targets.map(t => t.targetId) : ['all'];

    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      type: r.type as 'global' | 'department' | 'screen' | 'emergency',
      contentType: r.content_type as any,
      targetIds,
      mediaId: r.media_id || undefined,
      mediaUrl: r.media_url || undefined,
      playlistId: r.playlist_id || undefined,
      priority: r.priority,
      intervalMinutes: r.interval_minutes ?? 3,
      displayDurationSeconds: r.display_duration_seconds ?? 15,
      daysOfWeek,
      startDate: r.start_date || undefined,
      endDate: r.end_date || undefined,
      startTime: r.start_time || undefined,
      endTime: r.end_time || undefined,
      status: r.status as any,
      createdAt: r.created_at,
    };
  }
}

export const campaignRepo = new CampaignRepository();
