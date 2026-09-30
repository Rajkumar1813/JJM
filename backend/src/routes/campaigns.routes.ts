import { Router, Request, Response } from 'express';
import { campaignRepo } from '../db/repositories/campaignRepository';
import { screenRepo } from '../db/repositories/screenRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { resolverService } from '../services/resolverService';
import { io } from '../server';

const router = Router();

// POST One-click global broadcast to all screens
router.post('/broadcast-global', (req: Request, res: Response) => {
  const { name, mediaId, mediaUrl, priority, duration } = req.body;
  if (!name && !mediaId && !mediaUrl) {
    return res.status(400).json({ success: false, message: 'Name and media are required' });
  }
  const media = mediaId ? mediaRepo.getById(mediaId) : undefined;
  const finalMediaUrl = mediaUrl || media?.url;
  const campaignName = name || `Global Broadcast - ${new Date().toLocaleTimeString()}`;

  const isVideo = media?.type === 'video' || (finalMediaUrl && (finalMediaUrl.endsWith('.mp4') || finalMediaUrl.endsWith('.webm')));
  const campaign = campaignRepo.create({
    name: campaignName,
    description: 'One-click global broadcast to all hospital TVs',
    type: 'global',
    contentType: isVideo ? 'single_video_only' : 'single_image_only',
    targetIds: ['all'],
    mediaId,
    mediaUrl: finalMediaUrl,
    priority: priority ? parseInt(priority, 10) : 95,
    intervalMinutes: 1,
    displayDurationSeconds: duration ? parseInt(duration, 10) : (media?.duration || 15),
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    status: 'active',
  });

  screenRepo.incrementAllTargetConfigVersions();

  if (io) {
    screenRepo.getAll().forEach((s) => {
      try {
        const config = resolverService.resolveScreenConfig(s.id);
        io.to(`screen:${s.id}`).emit('config:update', { config });
      } catch (_) {}
    });
    io.emit('screens:changed');
  }

  const totalScreens = screenRepo.getAll().length;
  auditRepo.log('GLOBAL_BROADCAST', 'Campaign', campaign.id, `Dispatched one-click global broadcast to ${totalScreens} screens`);
  return res.status(201).json({ success: true, campaign, dispatchedScreens: totalScreens });
});

// GET all campaigns
router.get('/', (req: Request, res: Response) => {
  const campaigns = campaignRepo.getAll();
  return res.json({ success: true, campaigns });
});

// GET campaign by ID
router.get('/:id', (req: Request, res: Response) => {
  const campaign = campaignRepo.getById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }
  return res.json({ success: true, campaign });
});

// POST Create new campaign
router.post('/', (req: Request, res: Response) => {
  const {
    name,
    description,
    type,
    contentType,
    targetIds,
    mediaId,
    mediaUrl,
    playlistId,
    priority,
    intervalMinutes,
    displayDurationSeconds,
    daysOfWeek,
    startDate,
    endDate,
    startTime,
    endTime,
  } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Campaign name is required' });
  }

  const campaign = campaignRepo.create({
    name,
    description: description || '',
    type: type || 'global',
    contentType: contentType || 'single_image',
    targetIds: Array.isArray(targetIds) && targetIds.length > 0 ? targetIds : ['all'],
    mediaId,
    mediaUrl,
    playlistId,
    priority: priority ? parseInt(priority, 10) : 50,
    intervalMinutes: intervalMinutes ? parseInt(intervalMinutes, 10) : 3,
    displayDurationSeconds: displayDurationSeconds ? parseInt(displayDurationSeconds, 10) : 15,
    daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
    startDate,
    endDate,
    startTime,
    endTime,
    status: 'active',
  });

  // Increment targetConfigVersion for targeted screens
  if (campaign.targetIds.includes('all') || campaign.type === 'global') {
    screenRepo.incrementAllTargetConfigVersions();
  } else {
    for (const t of campaign.targetIds) {
      if (t.startsWith('DEP-')) {
        screenRepo.incrementDepartmentTargetConfigVersions(t);
      } else if (t.startsWith('SCR-')) {
        screenRepo.incrementTargetConfigVersion(t);
      } else {
        screenRepo.incrementAllTargetConfigVersions();
      }
    }
  }

  // Push immediate config update over socket to affected screens
  if (io) {
    screenRepo.getAll().forEach(s => {
      try {
        const config = resolverService.resolveScreenConfig(s.id);
        io.to(`screen:${s.id}`).emit('config:update', { config });
      } catch (_) {}
    });
    io.emit('screens:changed');
  }

  auditRepo.log('CREATE_CAMPAIGN', 'Campaign', campaign.id, `Created campaign ${campaign.name}`);
  return res.status(201).json({ success: true, campaign });
});

// PATCH Update campaign
router.patch('/:id', (req: Request, res: Response) => {
  const campaign = campaignRepo.update(req.params.id, req.body);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  // Increment targetConfigVersions
  screenRepo.incrementAllTargetConfigVersions();

  if (io) {
    screenRepo.getAll().forEach(s => {
      try {
        const config = resolverService.resolveScreenConfig(s.id);
        io.to(`screen:${s.id}`).emit('config:update', { config });
      } catch (_) {}
    });
    io.emit('screens:changed');
  }

  auditRepo.log('UPDATE_CAMPAIGN', 'Campaign', campaign.id, `Updated campaign ${campaign.name}`);
  return res.json({ success: true, campaign });
});

// DELETE Campaign
router.delete('/:id', (req: Request, res: Response) => {
  const success = campaignRepo.delete(req.params.id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  screenRepo.incrementAllTargetConfigVersions();

  if (io) {
    screenRepo.getAll().forEach(s => {
      try {
        const config = resolverService.resolveScreenConfig(s.id);
        io.to(`screen:${s.id}`).emit('config:update', { config });
      } catch (_) {}
    });
    io.emit('screens:changed');
  }

  auditRepo.log('DELETE_CAMPAIGN', 'Campaign', req.params.id, `Deleted campaign ${req.params.id}`);
  return res.json({ success: true, message: 'Campaign deleted successfully' });
});

export default router;
