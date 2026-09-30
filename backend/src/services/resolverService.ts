import { screenRepo } from '../db/repositories/screenRepository';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { campaignRepo } from '../db/repositories/campaignRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { playlistRepo } from '../db/repositories/miscRepositories';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { ResolvedDisplayConfig, Screen, Campaign, PlaylistItem } from '../types';

export class ResolverService {
  /**
   * Resolves the authoritative display configuration for a given screen from SQLite.
   * Deterministic priority order:
   * 1. Target-aware Emergency Announcement
   * 2. Active Scheduled Campaign (Screen > Department > Global)
   * 3. Assigned Screen Playlist or Department Default Playlist
   * 4. Fallback to Doctor OPD Queue
   */
  public resolveScreenConfig(screenId: string): ResolvedDisplayConfig {
    const screen = screenRepo.getById(screenId);
    if (!screen) {
      throw new Error(`Screen with ID ${screenId} not found`);
    }

    const department = departmentRepo.getById(screen.departmentId);
    const departmentName = department?.name || 'Hospital Department';
    const queueUrl = screen.queueUrl || department?.defaultQueueUrl || 'https://hms.jjmhospitalkashipur.com/qd';
    const staleThresholdSeconds = screen.staleThresholdSeconds || 180;
    const configVersion = screen.targetConfigVersion || 1;
    const mediaManifestVersion = mediaRepo.getManifestVersion();

    // Check target-aware active emergency
    const activeEmergency = emergencyRepo.getActive(screen.id, screen.departmentId);

    // If playback is paused, return queue-only
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
          emergencyAnnouncement: activeEmergency,
        },
      };
    }

    // Resolve eligible targeted campaigns
    const eligibleCampaigns = campaignRepo.getActiveForScreen(screen.id, screen.departmentId);

    if (eligibleCampaigns.length > 0) {
      const winningCampaign = eligibleCampaigns[0];
      return this.buildConfigFromCampaign(
        screen,
        departmentName,
        queueUrl,
        staleThresholdSeconds,
        configVersion,
        mediaManifestVersion,
        winningCampaign,
        activeEmergency
      );
    }

    // Default Playlist resolution
    let playlist = playlistRepo.getById(screen.playlistId || '');
    if (!playlist && department?.defaultPlaylistId) {
      playlist = playlistRepo.getById(department.defaultPlaylistId);
    }
    if (!playlist) {
      playlist = playlistRepo.getAll().find(p => p.isDefault) || playlistRepo.getAll()[0];
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
        emergencyAnnouncement: activeEmergency,
      },
    };
  }

  private buildConfigFromCampaign(
    screen: Screen,
    departmentName: string,
    queueUrl: string,
    staleThresholdSeconds: number,
    configVersion: number,
    mediaManifestVersion: number,
    campaign: Campaign,
    emergency: any
  ): ResolvedDisplayConfig {
    let items: PlaylistItem[] = [];

    // 1. Explicit playlist campaign (only if contentType is playlist or no media is specified)
    if (campaign.playlistId && (campaign.contentType === 'playlist' || (!campaign.mediaId && !campaign.mediaUrl))) {
      const pl = playlistRepo.getById(campaign.playlistId);
      if (pl && pl.items.length) {
        items = pl.items;
      }
    }

    // 2. Only queue campaign
    if (!items.length && campaign.contentType === 'only_queue') {
      items = [{ id: 'camp-q-only', type: 'queue', title: 'Doctor Live Token Queue', duration: 30, order: 1 }];
    }

    // 3. Media-based campaign (Single Image / Video / Banner)
    if (!items.length && (campaign.mediaId || campaign.mediaUrl)) {
      const media = campaign.mediaId ? mediaRepo.getById(campaign.mediaId) : undefined;
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
        // Fullscreen ad only (Continuous single image or video playback — no queue)
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
        // Alternating Single Ad and Doctor OPD Queue
        // CRITICAL: Put the Ad as ORDER 1 so it plays IMMEDIATELY when the campaign is activated!
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
