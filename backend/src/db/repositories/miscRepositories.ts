import { Playlist, PairingSession, AuditLog } from '../../types';
import { generateId, buildMongoUpdate, formatDateTimeToISO, mapMongoToApi, mapMongoListToApi } from './repoUtils';
import { getDb } from '../mongo';

export class PlaylistRepository {
  private get col() {
    return getDb().collection('playlists');
  }

  public async getAll(): Promise<Playlist[]> {
    const rows = await this.col.find({}).sort({ name: 1 }).toArray();
    return mapMongoListToApi(rows);
  }

  public async getById(id: string): Promise<Playlist | null> {
    const r = await this.col.findOne({ _id: id as any });
    return r ? mapMongoToApi(r) : undefined;
  }

  public async create(p: Omit<Playlist, 'id' | 'createdAt'> & { id?: string }): Promise<Playlist> {
    const id = p.id || generateId('PL');
    const createdAt = new Date();

    const newPlaylist = {
      _id: id,
      name: p.name,
      description: p.description || '',
      items: p.items || [],
      isDefault: !!p.isDefault,
      createdAt,
    };

    await this.col.insertOne(newPlaylist as any);
    return (await this.getById(id))!;
  }

  public async update(id: string, updates: Partial<Playlist>): Promise<Playlist | null> {
    const dbUpdates = buildMongoUpdate({
      name: updates.name,
      description: updates.description,
      items: updates.items,
      isDefault: updates.isDefault !== undefined ? !!updates.isDefault : undefined,
    });

    if (dbUpdates) {
      await this.col.updateOne({ _id: id as any }, dbUpdates);
    }
    return await this.getById(id) || null;
  }

  public async delete(id: string): Promise<boolean> {
    const res = await this.col.deleteOne({ _id: id as any });
    return res.deletedCount > 0;
  }
}

export class PairingRepository {
  private get col() {
    return getDb().collection('pairing_sessions');
  }

  public async get(code: string): Promise<PairingSession | null> {
    const r = await this.col.findOne({ pairingCode: code });
    if (!r) return null;
    return {
      pairingCode: r.pairingCode,
      socketId: r.socketId || undefined,
      deviceMetadata: r.deviceMetadata,
      screenId: r.screenId || undefined,
      deviceToken: r.deviceToken || undefined,
      status: r.status as any,
      expiresAt: r.expiresAt,
      createdAt: formatDateTimeToISO(r.createdAt)!,
    };
  }

  public async save(session: PairingSession): Promise<void> {
    const now = new Date();
    // In Mongo migration, we set expiresAtDate for the TTL index.
    const expiresAtDate = new Date(session.expiresAt);

    await this.col.findOneAndUpdate(
      { pairingCode: session.pairingCode },
      {
        $set: {
          socketId: session.socketId || null,
          deviceMetadata: session.deviceMetadata || null,
          screenId: session.screenId || null,
          deviceToken: session.deviceToken || null,
          status: session.status,
          expiresAt: session.expiresAt,
          expiresAtDate: expiresAtDate,
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );
  }

  public async delete(code: string): Promise<void> {
    await this.col.deleteOne({ pairingCode: code });
  }
}

export class AuditRepository {
  private get col() {
    return getDb().collection('audit_logs');
  }

  public async log(action: string, entity: string, entityId: string, details: string | any, userId?: string, ip?: string): Promise<AuditLog> {
    const id = generateId('AUD');
    const timestamp = new Date();

    const doc = {
      _id: id,
      action,
      entity,
      entityId,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      timestamp,
      userId: userId || null,
      ip: ip || null
    };

    await this.col.insertOne(doc as any);

    return { id, action, entity, entityId, details: doc.details, timestamp: formatDateTimeToISO(timestamp)!, userId };
  }

  public async getAll(filters: {
    limit?: number;
    offset?: number;
    action?: string;
    userId?: string;
    entity?: string;
    from?: string;
    to?: string;
    search?: string;
  } = {}): Promise<{ data: AuditLog[], total: number }> {
    const query: Record<string, any> = {};

    if (filters.action) query.action = filters.action;
    if (filters.userId) query.userId = filters.userId;
    if (filters.entity) query.entity = filters.entity;
    
    if (filters.from || filters.to) {
      query.timestamp = {};
      if (filters.from) query.timestamp.$gte = new Date(filters.from);
      if (filters.to) query.timestamp.$lte = new Date(filters.to);
    }
    
    if (filters.search) {
      const searchRegex = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { action: searchRegex },
        { entity: searchRegex },
        { entityId: searchRegex },
        { details: searchRegex },
      ];
    }

    const total = await this.col.countDocuments(query);
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const rows = await this.col.find(query).sort({ timestamp: -1 }).skip(offset).limit(limit).toArray();
    
    const data = rows.map(r => ({
      id: r._id.toString(),
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      details: r.details,
      timestamp: formatDateTimeToISO(r.timestamp)!,
      userId: r.userId || undefined,
      ip: r.ip || undefined,
    }));

    return { data, total };
  }
}

export class SystemRepository {
  private get col() {
    return getDb().collection('system_versions');
  }

  public async getGlobalConfigVersion(): Promise<number> {
    const r = await this.col.findOne({ _id: 'GLOBAL_CONFIG' as any });
    return r ? (r.versionNumber as number) : 1;
  }

  public async incrementGlobalConfigVersion(): Promise<number> {
    const r = await this.col.findOneAndUpdate(
      { _id: 'GLOBAL_CONFIG' as any },
      { $inc: { versionNumber: 1 }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return r ? (r.versionNumber as number) : 1;
  }
}

export const playlistRepo = new PlaylistRepository();
export const pairingRepo = new PairingRepository();
export const auditRepo = new AuditRepository();
export const systemRepo = new SystemRepository();
