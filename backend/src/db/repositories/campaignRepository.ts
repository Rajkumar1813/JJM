import { query, execute, withTransaction, pool } from '../mysql';
import { Campaign, CampaignTarget } from '../../types';
import { generateId, buildUpdateQuery, formatDateTimeToISO, safeJson } from './repoUtils';

export class CampaignRepository {
  public async getAll(): Promise<Campaign[]> {
    const rows = await query('SELECT * FROM campaigns ORDER BY priority DESC, created_at DESC');
    
    // N+1 problem to fetch targets, but getAll is rarely used for rendering, usually for admin listing.
    // For admin listing, we fetch targets too.
    const allTargets = await query<any[]>('SELECT * FROM campaign_targets');
    const targetMap = new Map<string, CampaignTarget[]>();
    for (const t of allTargets) {
      if (!targetMap.has(t.campaign_id)) targetMap.set(t.campaign_id, []);
      targetMap.get(t.campaign_id)!.push({
        id: t.id,
        campaignId: t.campaign_id,
        targetType: t.target_type as 'ALL' | 'DEPARTMENT' | 'SCREEN',
        targetId: t.target_id,
      });
    }

    return rows.map(r => this.mapRow(r, targetMap.get(r.id) || []));
  }

  public async getById(id: string): Promise<Campaign | undefined> {
    const r = await query<any[]>('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (r.length === 0) return undefined;
    
    const targets = await this.getTargets(id);
    return this.mapRow(r[0], targets);
  }

  public async getActiveForScreen(screenId: string, departmentId: string): Promise<Campaign[]> {
    // 1 SQL JOIN to filter by status and targets
    const rows = await query<any[]>(`
      SELECT c.*,
        GROUP_CONCAT(ct.target_type) as t_types,
        GROUP_CONCAT(ct.target_id) as t_ids
      FROM campaigns c
      LEFT JOIN campaign_targets ct ON c.id = ct.campaign_id
      WHERE c.status = 'active'
      GROUP BY c.id
      ORDER BY c.priority DESC
    `);

    const matching: Campaign[] = [];

    // Use Asia/Kolkata time
    const now = new Date();
    const tzOptions = { timeZone: 'Asia/Kolkata' };
    const dateStrKolkata = now.toLocaleString('en-US', { ...tzOptions, year: 'numeric', month: '2-digit', day: '2-digit' }); 
    // mm/dd/yyyy format. Let's format properly to yyyy-mm-dd
    const [mm, dd, yyyy] = dateStrKolkata.split('/');
    const todayDateStr = `${yyyy}-${mm}-${dd}`;

    const hourStr = now.toLocaleString('en-US', { ...tzOptions, hour: '2-digit', hour12: false });
    const minStr = now.toLocaleString('en-US', { ...tzOptions, minute: '2-digit' });
    const currentTimeStr = `${hourStr.padStart(2, '0')}:${minStr.padStart(2, '0')}`;
    
    // getDay() in Asia/Kolkata
    // To get day of week, we can use format with weekday: 'numeric' (not supported everywhere) 
    // or just construct a new Date from the yyyy-mm-dd string
    const kolkataDateObj = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
    const currentDay = kolkataDateObj.getUTCDay();

    for (const c of rows) {
      const daysOfWeek = safeJson(c.days_of_week, [0, 1, 2, 3, 4, 5, 6]);
      // 1. Day of week filter (normalize 0 and 7 for Sunday)
      if (daysOfWeek.length > 0) {
        const normalizedDays = daysOfWeek.map((d: number) => (d === 7 ? 0 : d));
        if (!normalizedDays.includes(currentDay)) {
          continue;
        }
      }
      
      // 2. Time range filter
      if (c.start_time && c.end_time) {
        if (currentTimeStr < c.start_time || currentTimeStr > c.end_time) {
          continue;
        }
      }
      
      // 3. Date range filter
      if (c.start_date && todayDateStr < c.start_date) continue;
      if (c.end_date && todayDateStr > c.end_date) continue;

      // 4. Target matching in JS (since we pulled all targets for active campaigns)
      let isTargeted = false;
      const tTypes = c.t_types ? c.t_types.split(',') : [];
      const tIds = c.t_ids ? c.t_ids.split(',') : [];
      
      if (c.type === 'global') {
        isTargeted = true;
      } else {
        for (let i = 0; i < tTypes.length; i++) {
          const type = tTypes[i];
          const id = tIds[i];
          if (type === 'ALL' || id === 'all') isTargeted = true;
          else if ((type === 'DEPARTMENT' || id.startsWith('DEP-')) && id === departmentId) isTargeted = true;
          else if ((type === 'SCREEN' || id.startsWith('SCR-')) && id === screenId) isTargeted = true;
        }
      }

      if (isTargeted) {
        // Build mock targets for mapRow
        const mockTargets: CampaignTarget[] = tTypes.map((type: string, idx: number) => ({
          id: '', campaignId: c.id, targetType: type as any, targetId: tIds[idx]
        }));
        matching.push(this.mapRow(c, mockTargets));
      }
    }

    return matching;
  }

  public async getTargets(campaignId: string): Promise<CampaignTarget[]> {
    const rows = await query<any[]>('SELECT * FROM campaign_targets WHERE campaign_id = ?', [campaignId]);
    return rows.map(r => ({
      id: r.id,
      campaignId: r.campaign_id,
      targetType: r.target_type as 'ALL' | 'DEPARTMENT' | 'SCREEN',
      targetId: r.target_id,
    }));
  }

  private async resolveTargetType(targetId: string): Promise<'ALL' | 'DEPARTMENT' | 'SCREEN'> {
    if (!targetId || targetId === 'all') return 'ALL';
    if (targetId.startsWith('DEP-')) return 'DEPARTMENT';
    if (targetId.startsWith('SCR-')) return 'SCREEN';
    
    const dept = await query<any[]>('SELECT id FROM departments WHERE id = ?', [targetId]);
    if (dept.length > 0) return 'DEPARTMENT';
    
    const screen = await query<any[]>('SELECT id FROM screens WHERE id = ?', [targetId]);
    if (screen.length > 0) return 'SCREEN';
    
    return 'ALL';
  }

  public async create(campaign: Omit<Campaign, 'id' | 'createdAt'> & { id?: string }): Promise<Campaign> {
    const id = campaign.id || generateId('CAMP');
    const createdAt = new Date();

    await withTransaction(async (conn) => {
      await conn.execute(`
        INSERT INTO campaigns (
          id, name, description, type, content_type, media_id, media_url, playlist_id,
          priority, interval_minutes, display_duration_seconds, days_of_week,
          start_date, end_date, start_time, end_time, status, expires_at, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?
        )
      `, [
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
        (campaign as any).expiresAt || null,
        createdAt
      ]);

      const targetIds = campaign.targetIds || ['all'];
      for (const targetId of targetIds) {
        const targetType = await this.resolveTargetType(targetId);
        await conn.execute(`
          INSERT INTO campaign_targets (id, campaign_id, target_type, target_id)
          VALUES (?, ?, ?, ?)
        `, [generateId('CT'), id, targetType, targetId]);
      }
    });

    return (await this.getById(id))!;
  }

  public async update(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
    const current = await this.getById(id);
    if (!current) return null;

    await withTransaction(async (conn) => {
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.type !== undefined) dbUpdates.type = updates.type;
      if (updates.contentType !== undefined) dbUpdates.content_type = updates.contentType;
      if (updates.mediaId !== undefined) dbUpdates.media_id = updates.mediaId;
      if (updates.mediaUrl !== undefined) dbUpdates.media_url = updates.mediaUrl;
      if (updates.playlistId !== undefined) dbUpdates.playlist_id = updates.playlistId;
      if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
      if (updates.intervalMinutes !== undefined) dbUpdates.interval_minutes = updates.intervalMinutes;
      if (updates.displayDurationSeconds !== undefined) dbUpdates.display_duration_seconds = updates.displayDurationSeconds;
      if (updates.daysOfWeek !== undefined) dbUpdates.days_of_week = JSON.stringify(updates.daysOfWeek);
      if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
      if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
      if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
      if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if ((updates as any).expiresAt !== undefined) dbUpdates.expires_at = (updates as any).expiresAt;

      const q = buildUpdateQuery('campaigns', id, dbUpdates);
      if (q) {
        await conn.execute(q.sql, q.values);
      }

      if (updates.targetIds) {
        await conn.execute('DELETE FROM campaign_targets WHERE campaign_id = ?', [id]);
        for (const targetId of updates.targetIds) {
          const targetType = await this.resolveTargetType(targetId);
          await conn.execute(`
            INSERT INTO campaign_targets (id, campaign_id, target_type, target_id)
            VALUES (?, ?, ?, ?)
          `, [generateId('CT'), id, targetType, targetId]);
        }
      }
    });

    return await this.getById(id) || null;
  }

  public async delete(id: string): Promise<boolean> {
    const res = await execute('DELETE FROM campaigns WHERE id = ?', [id]);
    return res.affectedRows > 0;
  }

  private mapRow(r: any, targets: CampaignTarget[]): Campaign {
    const daysOfWeek = safeJson(r.days_of_week, [0, 1, 2, 3, 4, 5, 6]);
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
      createdAt: formatDateTimeToISO(r.created_at)!,
      ...((r.expires_at ? { expiresAt: r.expires_at } : {}) as any)
    };
  }
}

export const campaignRepo = new CampaignRepository();
