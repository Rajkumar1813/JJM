import { Screen, HealthStatus, ConnectionStatus, ScreenStatus } from '../../types';
import { generateId, buildMongoUpdate, formatDateTimeToISO, mapMongoToApi, mapMongoListToApi } from './repoUtils';
import { getDb, withTransaction } from '../mongo';
import crypto from 'crypto';

export class ScreenRepository {
  private get col() {
    return getDb().collection('screens');
  }

  public async getAll(): Promise<Screen[]> {
    const rows = await this.col.find({}).sort({ name: 1 }).toArray();
    return mapMongoListToApi(rows);
  }

  public async getById(id: string): Promise<Screen | null> {
    const r = await this.col.findOne({ _id: id as any });
    return r ? mapMongoToApi(r) : undefined;
  }

  public async getByToken(token: string): Promise<Screen | null> {
    const r = await this.col.findOne({ deviceToken: token });
    return r ? mapMongoToApi(r) : undefined;
  }

  public async getByDepartment(departmentId: string): Promise<Screen[]> {
    const rows = await this.col.find({ departmentId }).sort({ name: 1 }).toArray();
    return mapMongoListToApi(rows);
  }

  public async create(screen: Omit<Screen, 'createdAt'> & { id?: string }): Promise<Screen> {
    const id = screen.id || generateId('SCR');
    const createdAt = new Date();

    const newScreen = {
      _id: id,
      name: screen.name,
      code: screen.code,
      departmentId: screen.departmentId,
      deviceId: screen.deviceId || null,
      location: screen.location,
      queueUrl: screen.queueUrl,
      staleThresholdSeconds: screen.staleThresholdSeconds ?? 180,
      targetConfigVersion: screen.targetConfigVersion ?? 1,
      appliedConfigVersion: screen.appliedConfigVersion ?? 0,
      mediaManifestVersion: screen.mediaManifestVersion ?? 1,
      status: screen.status || 'active',
      connectionStatus: screen.connectionStatus || 'offline',
      healthStatus: screen.healthStatus || 'OFFLINE',
      currentContent: screen.currentContent || 'queue',
      currentCampaignId: screen.currentCampaignId || null,
      playlistId: screen.playlistId || 'PL-DEFAULT',
      deviceToken: screen.deviceToken || null,
      playerVersion: screen.playerVersion || '1.0.0',
      isPaused: !!screen.isPaused,
      powerState: screen.powerState || 'on',
      lastHeartbeat: screen.lastHeartbeat ? new Date(screen.lastHeartbeat) : null,
      lastHeartbeatAt: screen.lastHeartbeatAt ? new Date(screen.lastHeartbeatAt) : null,
      lastSyncAt: screen.lastSyncAt ? new Date(screen.lastSyncAt) : null,
      deviceMetadata: screen.deviceMetadata || null,
      displayKey: screen.displayKey || crypto.randomBytes(16).toString('hex'),
      createdAt,
    };

    await this.col.insertOne(newScreen as any);
    return (await this.getById(id))!;
  }

  public async update(id: string, updates: Partial<Screen>): Promise<Screen | null> {
    const dbUpdates = buildMongoUpdate({
      name: updates.name,
      code: updates.code,
      departmentId: updates.departmentId,
      deviceId: updates.deviceId,
      location: updates.location,
      queueUrl: updates.queueUrl,
      staleThresholdSeconds: updates.staleThresholdSeconds,
      targetConfigVersion: updates.targetConfigVersion,
      appliedConfigVersion: updates.appliedConfigVersion,
      mediaManifestVersion: updates.mediaManifestVersion,
      status: updates.status,
      connectionStatus: updates.connectionStatus,
      healthStatus: updates.healthStatus,
      currentContent: updates.currentContent,
      currentCampaignId: updates.currentCampaignId,
      playlistId: updates.playlistId,
      deviceToken: updates.deviceToken,
      playerVersion: updates.playerVersion,
      isPaused: updates.isPaused !== undefined ? !!updates.isPaused : undefined,
      powerState: updates.powerState,
      lastHeartbeat: updates.lastHeartbeat ? new Date(updates.lastHeartbeat) : undefined,
      lastHeartbeatAt: updates.lastHeartbeatAt ? new Date(updates.lastHeartbeatAt) : undefined,
      lastSyncAt: updates.lastSyncAt ? new Date(updates.lastSyncAt) : undefined,
      deviceMetadata: updates.deviceMetadata,
      displayKey: updates.displayKey,
    });

    if (dbUpdates) {
      await this.col.updateOne({ _id: id as any }, dbUpdates);
    }
    
    if (updates.latestSnapshot !== undefined) {
      await this.saveSnapshot(id, updates.latestSnapshot || '');
    }

    return await this.getById(id) || null;
  }

  public async incrementTargetConfigVersion(id: string): Promise<number> {
    const r = await this.col.findOneAndUpdate(
      { _id: id as any },
      { $inc: { targetConfigVersion: 1 } },
      { returnDocument: 'after' }
    );
    return r ? (r.targetConfigVersion as number) : 1;
  }

  public async incrementAllTargetConfigVersions(): Promise<void> {
    await this.col.updateMany({}, { $inc: { targetConfigVersion: 1 } });
  }

  public async incrementDepartmentTargetConfigVersions(departmentId: string): Promise<void> {
    await this.col.updateMany({ departmentId }, { $inc: { targetConfigVersion: 1 } });
  }

  public async recordHeartbeat(id: string, heartbeat: {
    appliedConfigVersion?: number;
    mediaManifestVersion?: number;
    currentContent?: string;
    playerVersion?: string;
    healthStatus?: HealthStatus;
    deviceMetadata?: any;
  }): Promise<Screen | null> {
    const now = new Date();
    
    const updates: Record<string, any> = {
      connectionStatus: 'online',
      lastHeartbeat: now,
      lastHeartbeatAt: now,
    };
    if (heartbeat.appliedConfigVersion !== undefined) updates.appliedConfigVersion = heartbeat.appliedConfigVersion;
    if (heartbeat.mediaManifestVersion !== undefined) updates.mediaManifestVersion = heartbeat.mediaManifestVersion;
    if (heartbeat.currentContent !== undefined) updates.currentContent = heartbeat.currentContent;
    if (heartbeat.playerVersion !== undefined) updates.playerVersion = heartbeat.playerVersion;
    if (heartbeat.healthStatus !== undefined) updates.healthStatus = heartbeat.healthStatus;
    if (heartbeat.deviceMetadata !== undefined) updates.deviceMetadata = heartbeat.deviceMetadata;

    const dbUpdates = buildMongoUpdate(updates);
    if (dbUpdates) {
      await this.col.updateOne({ _id: id as any }, dbUpdates);
    }

    return await this.getById(id) || null;
  }

  public async delete(id: string): Promise<boolean> {
    return await withTransaction(async (session) => {
      // Screen delete -> also delete its device_commands, screen_snapshots, and clear related pairing_sessions.screenId;
      // remove it from emergency/campaign target arrays.
      const db = getDb();
      await db.collection('device_commands').deleteMany({ screenId: id }, { session });
      await db.collection('screen_snapshots').deleteMany({ screenId: id }, { session });
      await db.collection('pairing_sessions').updateMany(
        { screenId: id },
        { $set: { screenId: null } },
        { session }
      );
      
      // Campaigns targets embedded: pull screenId from targets array
      await db.collection('campaigns').updateMany(
        { 'targets.targetId': id, 'targets.targetType': 'SCREEN' },
        { $pull: { targets: { targetId: id, targetType: 'SCREEN' } } as any },
        { session }
      );

      // Emergency events targets array (string array of targetIds)
      await db.collection('emergency_events').updateMany(
        { targetIds: id, targetType: 'SCREEN' },
        { $pull: { targetIds: id } as any },
        { session }
      );

      const res = await this.col.deleteOne({ _id: id as any }, { session });
      return res.deletedCount > 0;
    });
  }

  public async getSnapshot(id: string): Promise<{ image: string, time: string } | null> {
    const r = await getDb().collection('screen_snapshots').findOne({ screenId: id });
    if (r) {
      return {
        image: r.image as string,
        time: formatDateTimeToISO(r.capturedAt)!
      };
    }
    return null;
  }

  public async saveSnapshot(id: string, image: string): Promise<void> {
    const now = new Date();
    await getDb().collection('screen_snapshots').updateOne(
      { screenId: id },
      { $set: { image, capturedAt: now } },
      { upsert: true }
    );
  }
}

export const screenRepo = new ScreenRepository();
