import { EmergencyAnnouncement } from '../../types';
import { generateId, mapMongoToApi, mapMongoListToApi } from './repoUtils';
import { getDb } from '../mongo';

export class EmergencyRepository {
  private get col() {
    return getDb().collection('emergency_events');
  }

  public async getActive(screenId?: string, departmentId?: string): Promise<EmergencyAnnouncement | null> {
    const now = Date.now();
    const rows = await this.col.find({
      isActive: true,
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }]
    }).sort({ createdAt: -1 }).toArray();

    if (rows.length === 0) return null;

    for (const r of rows) {
      const announcement = mapMongoToApi(r);
      // The API return value has a legacy 'active' alias
      announcement.active = announcement.isActive;
      announcement.status = announcement.isActive ? 'active' : 'cleared';

      if (!screenId && !departmentId) return announcement;

      if (announcement.targetType === 'ALL' || announcement.targetIds?.includes('all')) {
        return announcement;
      }
      if (announcement.targetType === 'DEPARTMENT' && departmentId && announcement.targetIds?.includes(departmentId)) {
        return announcement;
      }
      if (announcement.targetType === 'SCREEN' && screenId && announcement.targetIds?.includes(screenId)) {
        return announcement;
      }
    }

    return null;
  }

  public async getAll(): Promise<EmergencyAnnouncement[]> {
    const rows = await this.col.find({}).sort({ createdAt: -1 }).toArray();
    return rows.map(r => {
      const a = mapMongoToApi(r);
      a.active = a.isActive;
      a.status = a.isActive ? 'active' : 'cleared';
      return a;
    });
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

    const newDoc = {
      _id: id,
      title: emergency.title,
      message: emergency.message,
      severity: emergency.severity || 'critical',
      displayMode: emergency.displayMode || 'takeover',
      targetType: emergency.targetType || 'ALL',
      targetIds: emergency.targetIds || ['all'],
      highlightScreen: emergency.highlightScreen !== false,
      isActive: true,
      durationSeconds: emergency.durationSeconds || null,
      expiresAt: expiresAt,
      createdAt: now
    };

    await this.col.insertOne(newDoc as any);
    
    const r = await this.col.findOne({ _id: id as any });
    const a = mapMongoToApi(r);
    a.active = a.isActive;
    a.status = a.isActive ? 'active' : 'cleared';
    return a;
  }

  public async clearActive(): Promise<boolean> {
    const now = new Date();
    const res = await this.col.updateMany(
      { isActive: true },
      { $set: { isActive: false, clearedAt: now } }
    );
    return res.modifiedCount > 0;
  }

  public async clearById(id: string): Promise<boolean> {
    const now = new Date();
    const res = await this.col.updateOne(
      { _id: id as any, isActive: true },
      { $set: { isActive: false, clearedAt: now } }
    );
    return res.modifiedCount > 0;
  }
}

export const emergencyRepo = new EmergencyRepository();
