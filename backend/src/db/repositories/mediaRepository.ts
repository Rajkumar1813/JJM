import { query, queryOne, execute, withTransaction } from '../mysql';
import { MediaItem } from '../../types';
import { generateId, buildUpdateQuery, formatDateTimeToISO, safeJson } from './repoUtils';

export class MediaRepository {
  public async getAll(): Promise<MediaItem[]> {
    const rows = await query('SELECT * FROM media ORDER BY created_at DESC');
    return rows.map(r => this.mapRow(r));
  }

  public async getById(id: string): Promise<MediaItem | undefined> {
    const r = await queryOne('SELECT * FROM media WHERE id = ?', [id]);
    return r ? this.mapRow(r) : undefined;
  }

  public async create(media: Omit<MediaItem, 'id' | 'createdAt'> & { id?: string }): Promise<MediaItem> {
    const id = media.id || generateId('MED');
    const createdAt = new Date();

    await withTransaction(async (conn) => {
      await conn.execute(`
        INSERT INTO media (
          id, title, type, url, sha256_hash, file_size, duration, dimensions, tags, category, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        media.title,
        media.type,
        media.url,
        media.sha256Hash || 'legacy_unhashed',
        media.fileSize || 0,
        media.duration || 15,
        media.dimensions || null,
        JSON.stringify(media.tags || []),
        media.category || 'General',
        createdAt
      ]);

      await conn.execute("UPDATE system_versions SET version_number = version_number + 1, updated_at = ? WHERE id = 'MEDIA_MANIFEST'", [createdAt]);
    });

    return (await this.getById(id))!;
  }

  public async delete(id: string): Promise<boolean> {
    let affected = 0;
    await withTransaction(async (conn) => {
      const [res] = await conn.execute<any>('DELETE FROM media WHERE id = ?', [id]);
      if (res.affectedRows > 0) {
        affected = res.affectedRows;
        await conn.execute("UPDATE system_versions SET version_number = version_number + 1, updated_at = ? WHERE id = 'MEDIA_MANIFEST'", [new Date()]);
      }
    });
    return affected > 0;
  }

  public async getManifestVersion(): Promise<number> {
    const r = await queryOne<any>("SELECT version_number FROM system_versions WHERE id = 'MEDIA_MANIFEST'");
    return r ? r.version_number : 1;
  }

  private mapRow(r: any): MediaItem {
    return {
      id: r.id,
      title: r.title,
      type: r.type as 'image' | 'video' | 'announcement',
      url: r.url,
      sha256Hash: r.sha256_hash,
      fileSize: r.file_size,
      duration: r.duration,
      dimensions: r.dimensions || undefined,
      tags: safeJson(r.tags, []),
      category: r.category,
      createdAt: formatDateTimeToISO(r.created_at)!,
    };
  }
}

export const mediaRepo = new MediaRepository();
