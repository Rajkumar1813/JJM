import { screenRepo } from '../db/repositories/screenRepository';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { campaignRepo } from '../db/repositories/campaignRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { playlistRepo } from '../db/repositories/miscRepositories';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { ResolvedDisplayConfig, Screen, Campaign, PlaylistItem } from '../types';

export class ResolverService {
  public async resolveScreenConfig(screenId: string): Promise<ResolvedDisplayConfig> {
    const screen = await screenRepo.getById(screenId);
    if (!screen) {
      throw new Error(`Screen with ID ${screenId} not found`);
    }

    const department = await departmentRepo.getById(screen.departmentId);
    const departmentName = department?.name || 'Hospital Department';
    const queueUrl = screen.queueUrl || department?.defaultQueueUrl || 'https://hms.jjmhospitalkashipur.com/qd';
    const staleThresholdSeconds = screen.staleThresholdSeconds || 180;
    const configVersion = screen.targetConfigVersion || 1;
    const mediaManifestVersion = await mediaRepo.getManifestVersion();

    const activeEmergency = await emergencyRepo.getActive(screen.id, screen.departmentId);

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
          transition: 'fade',
          heartbeatSeconds: 20,
          offlineMediaCached: true,
          isPaused: true,
          powerState: screen.powerState || 'on',
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
        activeEmergency || undefined
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
      playlist: playlistItems,
      settings: {
        transition: 'fade',
        heartbeatSeconds: 20,
        offlineMediaCached: true,
        isPaused: !!screen.isPaused,
        powerState: screen.powerState || 'on',
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
    emergency: any
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
          : 15;

      const queueDuration =
        campaign.intervalMinutes && campaign.intervalMinutes > 0
          ? Math.max(10, campaign.intervalMinutes * 60)
          : 20;

      const isFullscreenOnly =
        campaign.contentType === 'single_image_only' ||
        campaign.contentType === 'single_video_only' ||
        campaign.contentType === 'fullscreen_only';

      if (isFullscreenOnly) {
        items = [
          {
            id: `camp-ad-${campaign.id}`,
            type: itemType,
            mediaId: campaign.mediaId || media?.id,
            mediaUrl,
            title: campaign.name,
            duration: adDuration,
            order: 1,
          },
        ];
      } else {
        items = [
          {
            id: `camp-ad-${campaign.id}`,
            type: itemType,
            mediaId: campaign.mediaId || media?.id,
            mediaUrl,
            title: campaign.name,
            duration: adDuration,
            order: 1,
          },
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
        transition: 'fade',
        heartbeatSeconds: 20,
        offlineMediaCached: true,
        isPaused: !!screen.isPaused,
        powerState: screen.powerState || 'on',
        emergencyAnnouncement: emergency,
        announcementTicker: campaign.type === 'emergency' ? campaign.name : undefined,
      },
    };
  }
}

export const resolverService = new ResolverService();
