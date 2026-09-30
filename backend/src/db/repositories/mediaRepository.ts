import { sqlite } from '../sqlite';
import { MediaItem } from '../../types';

export class MediaRepository {
  public getAll(): MediaItem[] {
    const rows = sqlite.prepare('SELECT * FROM media ORDER BY created_at DESC').all() as any[];
    return rows.map(r => this.mapRow(r));
  }

  public getById(id: string): MediaItem | undefined {
    const r = sqlite.prepare('SELECT * FROM media WHERE id = ?').get(id) as any;
    return r ? this.mapRow(r) : undefined;
  }

  public create(media: Omit<MediaItem, 'id' | 'createdAt'> & { id?: string }): MediaItem {
    const id = media.id || `MED-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const createdAt = new Date().toISOString();

    sqlite.prepare(`
      INSERT INTO media (
        id, title, type, url, sha256_hash, file_size, duration, dimensions, tags, category, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    );

    // Bump global media manifest version
    sqlite.prepare("UPDATE system_versions SET version_number = version_number + 1, updated_at = ? WHERE id = 'MEDIA_MANIFEST'").run(createdAt);

    return this.getById(id)!;
  }

  public delete(id: string): boolean {
    const res = sqlite.prepare('DELETE FROM media WHERE id = ?').run(id);
    if (res.changes > 0) {
      sqlite.prepare("UPDATE system_versions SET version_number = version_number + 1, updated_at = ? WHERE id = 'MEDIA_MANIFEST'").run(new Date().toISOString());
      return true;
    }
    return false;
  }

  public getManifestVersion(): number {
    const r = sqlite.prepare("SELECT version_number FROM system_versions WHERE id = 'MEDIA_MANIFEST'").get() as any;
    return r ? r.version_number : 1;
  }

  private mapRow(r: any): MediaItem {
    let tags = [];
    try {
      tags = r.tags ? JSON.parse(r.tags) : [];
    } catch (_) {}

    return {
      id: r.id,
      title: r.title,
      type: r.type as 'image' | 'video' | 'announcement',
      url: r.url,
      sha256Hash: r.sha256_hash,
      fileSize: r.file_size,
      duration: r.duration,
      dimensions: r.dimensions || undefined,
      tags,
      category: r.category,
      createdAt: r.created_at,
    };
  }
}

export const mediaRepo = new MediaRepository();
