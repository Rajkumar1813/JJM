import { sqlite } from '../sqlite';
import { Playlist, PairingSession, AuditLog } from '../../types';

export class PlaylistRepository {
  public getAll(): Playlist[] {
    const rows = sqlite.prepare('SELECT * FROM playlists ORDER BY name ASC').all() as any[];
    return rows.map(r => this.mapRow(r));
  }

  public getById(id: string): Playlist | undefined {
    const r = sqlite.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as any;
    return r ? this.mapRow(r) : undefined;
  }

  public create(p: Omit<Playlist, 'id' | 'createdAt'> & { id?: string }): Playlist {
    const id = p.id || `PL-${Date.now().toString(36).toUpperCase()}`;
    const createdAt = new Date().toISOString();

    sqlite.prepare(`
      INSERT INTO playlists (id, name, description, items, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      p.name,
      p.description || '',
      JSON.stringify(p.items || []),
      p.isDefault ? 1 : 0,
      createdAt
    );

    return this.getById(id)!;
  }

  public update(id: string, updates: Partial<Playlist>): Playlist | null {
    const current = this.getById(id);
    if (!current) return null;

    const updated = { ...current, ...updates };
    sqlite.prepare(`
      UPDATE playlists SET name = ?, description = ?, items = ?, is_default = ? WHERE id = ?
    `).run(
      updated.name,
      updated.description,
      JSON.stringify(updated.items),
      updated.isDefault ? 1 : 0,
      id
    );

    return this.getById(id)!;
  }

  public delete(id: string): boolean {
    const res = sqlite.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    return res.changes > 0;
  }

  private mapRow(r: any): Playlist {
    let items = [];
    try {
      items = JSON.parse(r.items);
    } catch (_) {}
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      items,
      isDefault: r.is_default === 1,
      createdAt: r.created_at,
    };
  }
}

export class PairingRepository {
  public get(code: string): PairingSession | undefined {
    const r = sqlite.prepare('SELECT * FROM pairing_sessions WHERE pairing_code = ?').get(code) as any;
    if (!r) return undefined;
    let metadata;
    try {
      metadata = r.device_metadata ? JSON.parse(r.device_metadata) : undefined;
    } catch (_) {}
    return {
      pairingCode: r.pairing_code,
      socketId: r.socket_id || undefined,
      deviceMetadata: metadata,
      screenId: r.screen_id || undefined,
      deviceToken: r.device_token || undefined,
      status: r.status as any,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    };
  }

  public save(session: PairingSession): void {
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO pairing_sessions (pairing_code, socket_id, device_metadata, screen_id, device_token, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pairing_code) DO UPDATE SET
        socket_id = excluded.socket_id,
        device_metadata = excluded.device_metadata,
        screen_id = excluded.screen_id,
        device_token = excluded.device_token,
        status = excluded.status,
        expires_at = excluded.expires_at
    `).run(
      session.pairingCode,
      session.socketId || null,
      session.deviceMetadata ? JSON.stringify(session.deviceMetadata) : null,
      session.screenId || null,
      session.deviceToken || null,
      session.status,
      session.expiresAt,
      now
    );
  }

  public delete(code: string): void {
    sqlite.prepare('DELETE FROM pairing_sessions WHERE pairing_code = ?').run(code);
  }
}

export class AuditRepository {
  public log(action: string, entity: string, entityId: string, details: string, userId?: string): AuditLog {
    const id = `AUD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toISOString();

    sqlite.prepare(`
      INSERT INTO audit_logs (id, action, entity, entity_id, details, timestamp, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, action, entity, entityId, details, timestamp, userId || null);

    return { id, action, entity, entityId, details, timestamp, userId };
  }

  public getAll(limit = 100): AuditLog[] {
    const rows = sqlite.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
    return rows.map(r => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      details: r.details || '',
      timestamp: r.timestamp,
      userId: r.user_id || undefined,
    }));
  }
}

export class SystemRepository {
  public getGlobalConfigVersion(): number {
    const r = sqlite.prepare("SELECT version_number FROM system_versions WHERE id = 'GLOBAL_CONFIG'").get() as any;
    return r ? r.version_number : 1;
  }

  public incrementGlobalConfigVersion(): number {
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE system_versions SET version_number = version_number + 1, updated_at = ? WHERE id = 'GLOBAL_CONFIG'").run(now);
    return this.getGlobalConfigVersion();
  }
}

export const playlistRepo = new PlaylistRepository();
export const pairingRepo = new PairingRepository();
export const auditRepo = new AuditRepository();
export const systemRepo = new SystemRepository();
