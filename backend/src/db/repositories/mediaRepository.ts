import { MediaItem } from '../../types';
import { generateId, mapMongoToApi, mapMongoListToApi } from './repoUtils';
import { getDb, withTransaction } from '../mongo';

export class MediaRepository {
  private get col() {
    return getDb().collection('media');
  }

  public async getAll(): Promise<MediaItem[]> {
    const rows = await this.col.find({}).sort({ createdAt: -1 }).toArray();
    return mapMongoListToApi(rows);
  }

  public async getById(id: string): Promise<MediaItem | null> {
    const r = await this.col.findOne({ _id: id as any });
    return r ? mapMongoToApi(r) : undefined;
  }

  public async create(media: Omit<MediaItem, 'id' | 'createdAt'> & { id?: string }): Promise<MediaItem> {
    const id = media.id || generateId('MED');
    const createdAt = new Date();

    const newMedia = {
      _id: id,
      title: media.title,
      type: media.type,
      url: media.url,
      sha256Hash: media.sha256Hash || 'legacy_unhashed',
      fileSize: media.fileSize || 0,
      duration: media.duration || 15,
      dimensions: media.dimensions || null,
      tags: media.tags || [],
      category: media.category || 'General',
      createdAt,
    };

    await withTransaction(async (session) => {
      await this.col.insertOne(newMedia as any, { session });
      await getDb().collection('system_versions').updateOne(
        { _id: 'MEDIA_MANIFEST' as any },
        { $inc: { versionNumber: 1 }, $set: { updatedAt: new Date() } },
        { session }
      );
    });

    return (await this.getById(id))!;
  }

  public async delete(id: string, force: boolean = false): Promise<{ success: boolean, usage?: { campaigns: string[], playlists: string[] } }> {
    return await withTransaction(async (session) => {
      const campaigns = await getDb().collection('campaigns').find({ mediaId: id }, { session }).toArray();
      const playlists = await getDb().collection('playlists').find({ 'items.mediaId': id }, { session }).toArray();

      if (!force && (campaigns.length > 0 || playlists.length > 0)) {
        return {
          success: false,
          usage: {
            campaigns: campaigns.map(c => c._id as unknown as string),
            playlists: playlists.map(p => p._id as unknown as string)
          }
        };
      }

      if (force) {
        if (campaigns.length > 0) {
          await getDb().collection('campaigns').updateMany(
            { mediaId: id },
            { $set: { mediaId: null, mediaUrl: null } },
            { session }
          );
        }
        if (playlists.length > 0) {
          await getDb().collection('playlists').updateMany(
            { 'items.mediaId': id },
            { $pull: { items: { mediaId: id } } as any },
            { session }
          );
        }
      }

      const res = await this.col.deleteOne({ _id: id as any }, { session });
      if (res.deletedCount > 0) {
        await getDb().collection('system_versions').updateOne(
          { _id: 'MEDIA_MANIFEST' as any },
          { $inc: { versionNumber: 1 }, $set: { updatedAt: new Date() } },
          { session }
        );
        return { success: true };
      }
      return { success: false };
    });
  }

  public async getManifestVersion(): Promise<number> {
    const r = await getDb().collection('system_versions').findOne({ _id: 'MEDIA_MANIFEST' as any });
    return r ? (r.versionNumber as number) : 1;
  }
}

export const mediaRepo = new MediaRepository();
