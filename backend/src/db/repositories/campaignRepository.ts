import { Campaign, CampaignTarget } from '../../types';
import { generateId, buildMongoUpdate, formatDateTimeToISO, mapMongoToApi, mapMongoListToApi } from './repoUtils';
import { getDb } from '../mongo';
import { isCampaignActiveInTime } from '../../services/campaignLogic';

export class CampaignRepository {
  private get col() {
    return getDb().collection('campaigns');
  }

  public async getAll(): Promise<Campaign[]> {
    const rows = await this.col.find({}).sort({ priority: -1, createdAt: -1 }).toArray();
    return rows.map(r => this.mapRow(r));
  }

  public async getById(id: string): Promise<Campaign | null> {
    const r = await this.col.findOne({ _id: id as any });
    return r ? this.mapRow(r) : undefined;
  }

  public async getActiveForScreen(screenId: string, departmentId: string): Promise<Campaign[]> {
    const matching: Campaign[] = [];

    // Query active campaigns targeting ALL, this department, or this screen
    const rows = await this.col.find({
      status: 'active',
      $or: [
        { 'targets.targetType': 'ALL' },
        { 'targets.targetId': 'all' },
        { 'targets.targetType': 'DEPARTMENT', 'targets.targetId': departmentId },
        { 'targets.targetType': 'SCREEN', 'targets.targetId': screenId }
      ]
    }).sort({ priority: -1, createdAt: -1 }).toArray();

    const now = new Date();
    for (const c of rows) {
      if (isCampaignActiveInTime(c as any, now)) {
        matching.push(this.mapRow(c));
      }
    }

    return matching;
  }

  private async resolveTargetType(targetId: string): Promise<'ALL' | 'DEPARTMENT' | 'SCREEN'> {
    if (!targetId || targetId === 'all') return 'ALL';
    if (targetId.startsWith('DEP-')) return 'DEPARTMENT';
    if (targetId.startsWith('SCR-')) return 'SCREEN';
    
    const dept = await getDb().collection('departments').findOne({ _id: targetId as any });
    if (dept) return 'DEPARTMENT';
    
    const screen = await getDb().collection('screens').findOne({ _id: targetId as any });
    if (screen) return 'SCREEN';
    
    return 'ALL';
  }

  public async create(campaign: Omit<Campaign, 'id' | 'createdAt'> & { id?: string }): Promise<Campaign> {
    const id = campaign.id || generateId('CAMP');
    const createdAt = new Date();

    const targetIds = campaign.targetIds || ['all'];
    const targets = [];
    for (const targetId of targetIds) {
      const targetType = await this.resolveTargetType(targetId);
      targets.push({ targetType, targetId });
    }

    const newCampaign = {
      _id: id,
      name: campaign.name,
      description: campaign.description || '',
      type: campaign.type || 'global',
      contentType: campaign.contentType || 'single_image',
      mediaId: campaign.mediaId || null,
      mediaUrl: campaign.mediaUrl || null,
      playlistId: campaign.playlistId || null,
      priority: campaign.priority || 50,
      intervalMinutes: campaign.intervalMinutes || 3,
      displayDurationSeconds: campaign.displayDurationSeconds || 15,
      daysOfWeek: campaign.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
      startDate: campaign.startDate || null,
      endDate: campaign.endDate || null,
      startTime: campaign.startTime || null,
      endTime: campaign.endTime || null,
      status: campaign.status || 'active',
      expiresAt: (campaign as any).expiresAt || null,
      createdAt,
      targets,
    };

    await this.col.insertOne(newCampaign as any);
    return (await this.getById(id))!;
  }

  public async update(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
    const dbUpdates = buildMongoUpdate({
      name: updates.name,
      description: updates.description,
      type: updates.type,
      contentType: updates.contentType,
      mediaId: updates.mediaId,
      mediaUrl: updates.mediaUrl,
      playlistId: updates.playlistId,
      priority: updates.priority,
      intervalMinutes: updates.intervalMinutes,
      displayDurationSeconds: updates.displayDurationSeconds,
      daysOfWeek: updates.daysOfWeek,
      startDate: updates.startDate,
      endDate: updates.endDate,
      startTime: updates.startTime,
      endTime: updates.endTime,
      status: updates.status,
      expiresAt: (updates as any).expiresAt,
    });

    if (updates.targetIds) {
      if (!dbUpdates) {
        // Handle case where only targets are updated
      }
      const targets = [];
      for (const targetId of updates.targetIds) {
        const targetType = await this.resolveTargetType(targetId);
        targets.push({ targetType, targetId });
      }
      if (dbUpdates) {
        dbUpdates.$set.targets = targets;
      } else {
        await this.col.updateOne({ _id: id as any }, { $set: { targets } });
      }
    }

    if (dbUpdates) {
      await this.col.updateOne({ _id: id as any }, dbUpdates);
    }

    return await this.getById(id) || null;
  }

  public async delete(id: string): Promise<boolean> {
    const res = await this.col.deleteOne({ _id: id as any });
    return res.deletedCount > 0;
  }

  private mapRow(r: any): Campaign {
    const mapped = mapMongoToApi(r);
    mapped.targetIds = (r.targets || []).map((t: any) => t.targetId);
    
    // Fallback if targetIds is empty
    if (!mapped.targetIds || mapped.targetIds.length === 0) {
      mapped.targetIds = ['all'];
    }

    delete mapped.targets;
    return mapped;
  }
}

export const campaignRepo = new CampaignRepository();
