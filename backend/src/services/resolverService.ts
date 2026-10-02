import { screenRepo } from '../db/repositories/screenRepository';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { campaignRepo } from '../db/repositories/campaignRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { playlistRepo } from '../db/repositories/miscRepositories';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { ResolvedDisplayConfig, Screen, Campaign, PlaylistItem } from '../types';
import { getDb } from '../db/mongo';

export class ResolverService {
  public async getGlobalSettings(): Promise<any> {
    const rows = await getDb().collection('settings').find().toArray();
    return rows.reduce((acc: any, row: any) => {
      acc[row._id] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return acc;
    }, {});
  }

  private async hydrateMedia(items: PlaylistItem[], defaultDuration?: number): Promise<PlaylistItem[]> {
    const hydrated = [];
    for (const item of items) {
      const hItem = { ...item };
      if (!hItem.duration || hItem.duration <= 0) {
        hItem.duration = defaultDuration || 15;
      }
      if (hItem.mediaId) {
        const media = await mediaRepo.getById(hItem.mediaId);
        if (media) {
          hItem.mediaUrl = media.url;
          hItem.sha256Hash = media.sha256Hash;
          hItem.fileSize = media.fileSize;
        }
      }
      hydrated.push(hItem);
    }
    return hydrated;
  }

  public async resolveScreenConfig(screenId: string): Promise<ResolvedDisplayConfig> {
    const screen = await screenRepo.getById(screenId);
    if (!screen) {
      throw new Error(`Screen with ID ${screenId} not found`);
    }

    const globalSettings = await this.getGlobalSettings();

    const department = await departmentRepo.getById(screen.departmentId);
    const departmentName = department?.name || 'Hospital Department';
    const queueUrl = screen.queueUrl || department?.defaultQueueUrl || globalSettings.defaultQueueUrl || 'https://hms.jjmhospitalkashipur.com/qd';
    const staleThresholdSeconds = screen.staleThresholdSeconds || globalSettings.staleThreshold || 180;
    const defaultDuration = globalSettings.defaultDuration || 15;
    const configVersion = screen.targetConfigVersion || 1;
    const mediaManifestVersion = await mediaRepo.getManifestVersion();

    const activeEmergency = await emergencyRepo.getActive(screen.id, screen.departmentId);

    const baseSettings = {
      transition: 'fade' as 'fade' | 'slide' | 'none',
      heartbeatSeconds: globalSettings.heartbeatInterval || 20,
      offlineMediaCached: true,
      powerState: screen.powerState || 'on',
      kioskLock: !!globalSettings.kioskLock,
      soundAlerts: !!globalSettings.soundAlerts,
      kioskPinHash: globalSettings.kioskPinHash,
    };

    if (screen.isPaused) {
      return {
        screenId: screen.id,
        screenName: screen.name,
        departmentId: screen.departmentId,
        departmentName,
        queueUrl,
        staleThresholdSeconds,
        configVersion,
        mediaManifestVersion,
        activeCampaign: null,
        playlist: [
          { id: 'item-pause-queue', type: 'queue', title: 'Doctor Live Token Queue', duration: 9999, order: 1 },
        ],
        settings: {
          ...baseSettings,
          isPaused: true,
          emergencyAnnouncement: activeEmergency || undefined,
        },
      };
    }

    const eligibleCampaigns = await campaignRepo.getActiveForScreen(screen.id, screen.departmentId);

    if (eligibleCampaigns.length > 0) {
      const winningCampaign = eligibleCampaigns[0];
      return await this.buildConfigFromCampaign(
        screen,
        departmentName,
        queueUrl,
        staleThresholdSeconds,
        configVersion,
        mediaManifestVersion,
        winningCampaign,
        activeEmergency || undefined,
        baseSettings,
        defaultDuration
      );
    }

    let playlist = await playlistRepo.getById(screen.playlistId || '');
    if (!playlist && department?.defaultPlaylistId) {
      playlist = await playlistRepo.getById(department.defaultPlaylistId);
    }
    if (!playlist) {
      const allPls = await playlistRepo.getAll();
      playlist = allPls.find(p => p.isDefault) || allPls[0];
    }

    const playlistItems: PlaylistItem[] = playlist?.items.length
      ? playlist.items
      : [{ id: 'item-1', type: 'queue', title: 'Doctor Live Token Queue', duration: 30, order: 1 }];

    const hydratedItems = await this.hydrateMedia(playlistItems, defaultDuration);

    return {
      screenId: screen.id,
      screenName: screen.name,
      departmentId: screen.departmentId,
      departmentName,
      queueUrl,
      staleThresholdSeconds,
      configVersion,
      mediaManifestVersion,
      activeCampaign: null,
      playlist: hydratedItems,
      settings: {
        ...baseSettings,
        isPaused: !!screen.isPaused,
        emergencyAnnouncement: activeEmergency || undefined,
      },
    };
  }

  private async buildConfigFromCampaign(
    screen: Screen,
    departmentName: string,
    queueUrl: string,
    staleThresholdSeconds: number,
    configVersion: number,
    mediaManifestVersion: number,
    campaign: Campaign,
    emergency: any,
    baseSettings: any,
    defaultDuration: number
  ): Promise<ResolvedDisplayConfig> {
    let items: PlaylistItem[] = [];

    if (campaign.playlistId && (campaign.contentType === 'playlist' || (!campaign.mediaId && !campaign.mediaUrl))) {
      const pl = await playlistRepo.getById(campaign.playlistId);
      if (pl && pl.items.length) {
        items = pl.items;
      }
    }

    if (!items.length && campaign.contentType === 'only_queue') {
      items = [{ id: 'camp-q-only', type: 'queue', title: 'Doctor Live Token Queue', duration: 30, order: 1 }];
    }

    if (!items.length && (campaign.mediaId || campaign.mediaUrl)) {
      const media = campaign.mediaId ? await mediaRepo.getById(campaign.mediaId) : undefined;
      const mediaUrl = campaign.mediaUrl || media?.url || '';

      const isVideo =
        media?.type === 'video' ||
        campaign.contentType === 'video' ||
        campaign.contentType === 'single_video' ||
        campaign.contentType === 'single_video_only' ||
        mediaUrl.toLowerCase().endsWith('.mp4') ||
        mediaUrl.toLowerCase().endsWith('.webm');

      const itemType: 'image' | 'video' = isVideo ? 'video' : 'image';
      const adDuration =
        campaign.displayDurationSeconds && campaign.displayDurationSeconds > 0
          ? campaign.displayDurationSeconds
          : media?.duration && media.duration > 0
          ? media.duration
          : defaultDuration;

      const queueDuration =
        campaign.intervalMinutes && campaign.intervalMinutes > 0
          ? Math.max(10, campaign.intervalMinutes * 60)
          : 20;

      const isFullscreenOnly =
        campaign.contentType === 'single_image_only' ||
        campaign.contentType === 'single_video_only' ||
        campaign.contentType === 'fullscreen_only';

      const adItem = {
        id: `camp-ad-${campaign.id}`,
        type: itemType,
        mediaId: campaign.mediaId || media?.id,
        mediaUrl,
        sha256Hash: media?.sha256Hash,
        fileSize: media?.fileSize,
        title: campaign.name,
        duration: adDuration,
        order: 1,
      };

      if (isFullscreenOnly) {
        items = [adItem];
      } else {
        items = [
          adItem,
          {
            id: `camp-q-${campaign.id}`,
            type: 'queue',
            title: 'Doctor Live Token Queue',
            duration: queueDuration,
            order: 2,
          },
        ];
      }
    }

    if (!items.length) {
      items = [{ id: 'camp-q-only', type: 'queue', title: 'Doctor Live Token Queue', duration: 30, order: 1 }];
    } else {
      items = await this.hydrateMedia(items, defaultDuration);
    }

    return {
      screenId: screen.id,
      screenName: screen.name,
      departmentId: screen.departmentId,
      departmentName,
      queueUrl,
      staleThresholdSeconds,
      configVersion,
      mediaManifestVersion,
      activeCampaign: {
        id: campaign.id,
        name: campaign.name,
        type: campaign.type,
        priority: campaign.priority,
        contentType: campaign.contentType,
      },
      playlist: items,
      settings: {
        ...baseSettings,
        isPaused: !!screen.isPaused,
        emergencyAnnouncement: emergency,
        announcementTicker: campaign.type === 'emergency' ? campaign.name : undefined,
      },
    };
  }
}

export const resolverService = new ResolverService();
