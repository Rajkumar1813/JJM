import { query, queryOne, execute } from '../mysql';
import { Playlist, PairingSession, AuditLog } from '../../types';
import { generateId, buildUpdateQuery, formatDateTimeToISO, safeJson } from './repoUtils';

export class PlaylistRepository {
  public async getAll(): Promise<Playlist[]> {
    const rows = await query('SELECT * FROM playlists ORDER BY name ASC');
    return rows.map(r => this.mapRow(r));
  }

  public async getById(id: string): Promise<Playlist | undefined> {
    const r = await queryOne('SELECT * FROM playlists WHERE id = ?', [id]);
    return r ? this.mapRow(r) : undefined;
  }

  public async create(p: Omit<Playlist, 'id' | 'createdAt'> & { id?: string }): Promise<Playlist> {
    const id = p.id || generateId('PL');
    const createdAt = new Date();

    await execute(`
      INSERT INTO playlists (id, name, description, items, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      id,
      p.name,
      p.description || '',
      JSON.stringify(p.items || []),
      p.isDefault ? 1 : 0,
      createdAt
    ]);

    return (await this.getById(id))!;
  }

  public async update(id: string, updates: Partial<Playlist>): Promise<Playlist | null> {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.items !== undefined) dbUpdates.items = JSON.stringify(updates.items);
    if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault ? 1 : 0;

    const q = buildUpdateQuery('playlists', id, dbUpdates);
    if (q) {
      await execute(q.sql, q.values);
    }
    return await this.getById(id) || null;
  }

  public async delete(id: string): Promise<boolean> {
    const res = await execute('DELETE FROM playlists WHERE id = ?', [id]);
    return res.affectedRows > 0;
  }

  private mapRow(r: any): Playlist {
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      items: safeJson(r.items, []),
      isDefault: r.is_default === 1,
      createdAt: formatDateTimeToISO(r.created_at)!,
    };
  }
}

export class PairingRepository {
  public async get(code: string): Promise<PairingSession | undefined> {
    const r = await queryOne<any>('SELECT * FROM pairing_sessions WHERE pairing_code = ?', [code]);
    if (!r) return undefined;
    return {
      pairingCode: r.pairing_code,
      socketId: r.socket_id || undefined,
      deviceMetadata: safeJson(r.device_metadata, undefined),
      screenId: r.screen_id || undefined,
      deviceToken: r.device_token || undefined,
      status: r.status as any,
      expiresAt: r.expires_at,
      createdAt: formatDateTimeToISO(r.created_at)!,
    };
  }

  public async save(session: PairingSession): Promise<void> {
    const now = new Date();
    await execute(`
      INSERT INTO pairing_sessions (pairing_code, socket_id, device_metadata, screen_id, device_token, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        socket_id = VALUES(socket_id),
        device_metadata = VALUES(device_metadata),
        screen_id = VALUES(screen_id),
        device_token = VALUES(device_token),
        status = VALUES(status),
        expires_at = VALUES(expires_at)
    `, [
      session.pairingCode,
      session.socketId || null,
      session.deviceMetadata ? JSON.stringify(session.deviceMetadata) : null,
      session.screenId || null,
      session.deviceToken || null,
      session.status,
      session.expiresAt,
      now
    ]);
  }

  public async delete(code: string): Promise<void> {
    await execute('DELETE FROM pairing_sessions WHERE pairing_code = ?', [code]);
  }
}

export class AuditRepository {
  public async log(action: string, entity: string, entityId: string, details: string | any, userId?: string, ip?: string): Promise<AuditLog> {
    const id = generateId('AUD');
    const timestamp = new Date();

    await execute(`
      INSERT INTO audit_logs (id, action, entity, entity_id, details, timestamp, user_id, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, action, entity, entityId, JSON.stringify(details), timestamp, userId || null, ip || null]);

    return { id, action, entity, entityId, details: typeof details === 'string' ? details : JSON.stringify(details), timestamp: formatDateTimeToISO(timestamp)!, userId };
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
    const conditions: string[] = ['1=1'];
    const values: any[] = [];

    if (filters.action) {
      conditions.push('action = ?');
      values.push(filters.action);
    }
    if (filters.userId) {
      conditions.push('user_id = ?');
      values.push(filters.userId);
    }
    if (filters.entity) {
      conditions.push('entity = ?');
      values.push(filters.entity);
    }
    if (filters.from) {
      conditions.push('timestamp >= ?');
      values.push(new Date(filters.from));
    }
    if (filters.to) {
      conditions.push('timestamp <= ?');
      values.push(new Date(filters.to));
    }
    if (filters.search) {
      conditions.push('(action LIKE ? OR entity LIKE ? OR entity_id LIKE ? OR details LIKE ?)');
      const searchStr = `%${filters.search}%`;
      values.push(searchStr, searchStr, searchStr, searchStr);
    }

    const whereClause = conditions.join(' AND ');
    const countRow = await queryOne<any>(`SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`, values);
    const total = countRow?.total || 0;

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;
    values.push(limit, offset);

    const rows = await query<any[]>(`SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`, values);
    
    const data = rows.map(r => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      details: safeJson(r.details, ''),
      timestamp: formatDateTimeToISO(r.timestamp)!,
      userId: r.user_id || undefined,
      ip: r.ip || undefined,
    }));

    return { data, total };
  }
}

export class SystemRepository {
  public async getGlobalConfigVersion(): Promise<number> {
    const r = await queryOne<any>("SELECT version_number FROM system_versions WHERE id = 'GLOBAL_CONFIG'");
    return r ? r.version_number : 1;
  }

  public async incrementGlobalConfigVersion(): Promise<number> {
    const now = new Date();
    await execute("UPDATE system_versions SET version_number = version_number + 1, updated_at = ? WHERE id = 'GLOBAL_CONFIG'", [now]);
    return await this.getGlobalConfigVersion();
  }
}

export const playlistRepo = new PlaylistRepository();
export const pairingRepo = new PairingRepository();
export const auditRepo = new AuditRepository();
export const systemRepo = new SystemRepository();
