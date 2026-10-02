import { configPublisher } from '../services/configPublisher';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { campaignRepo } from '../db/repositories/campaignRepository';
import { screenRepo } from '../db/repositories/screenRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { resolverService } from '../services/resolverService';
import { getIO } from '../realtime/socket';
import { getDb } from '../db/mongo';

const router = Router();

const broadcastGlobalSchema = z.object({
  name: z.string().optional(),
  mediaId: z.string().optional(),
  mediaUrl: z.string().optional(),
  priority: z.union([z.string(), z.number()]).optional(),
  duration: z.union([z.string(), z.number()]).optional(),
});

const campaignStatusEnum = z.enum(['active', 'scheduled', 'paused', 'expired', 'draft']);
const campaignTypeEnum = z.enum(['global', 'department', 'screen', 'emergency']);
const contentTypeEnum = z.enum(['playlist', 'single_image', 'single_image_only', 'image', 'video', 'single_video', 'single_video_only', 'only_queue']);

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  type: campaignTypeEnum.optional(),
  contentType: contentTypeEnum.optional(),
  targetIds: z.array(z.string()).optional(),
  mediaId: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  playlistId: z.string().nullable().optional(),
  priority: z.union([z.string(), z.number()]).optional(),
  intervalMinutes: z.union([z.string(), z.number()]).optional(),
  displayDurationSeconds: z.union([z.string(), z.number()]).optional(),
  daysOfWeek: z.array(z.number()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: campaignStatusEnum.optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

router.post('/broadcast-global', async (req: Request, res: Response) => {
  const parsed = broadcastGlobalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { name, mediaId, mediaUrl, priority, duration } = parsed.data;
  if (!name && !mediaId && !mediaUrl) {
    return res.status(400).json({ success: false, message: 'Name and media are required' });
  }

  const media = mediaId ? await mediaRepo.getById(mediaId) : undefined;
  const finalMediaUrl = mediaUrl || media?.url;
  const campaignName = name || `Global Broadcast - ${new Date().toLocaleTimeString()}`;

  const isVideo = media?.type === 'video' || (finalMediaUrl && (finalMediaUrl.endsWith('.mp4') || finalMediaUrl.endsWith('.webm')));
  const displayDuration = duration ? parseInt(duration as string, 10) : (media?.duration || 15);
  const endDate = new Date(Date.now() + displayDuration * 1000).toISOString();
  
  const campaign = await campaignRepo.create({
    name: campaignName,
    description: 'One-click global broadcast to all hospital TVs',
    type: 'global',
    contentType: isVideo ? 'single_video_only' : 'single_image_only',
    targetIds: ['all'],
    mediaId,
    mediaUrl: finalMediaUrl,
    priority: priority ? parseInt(priority as string, 10) : 95,
    intervalMinutes: 1,
    displayDurationSeconds: displayDuration,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    endDate: endDate,
    status: 'active',
  });

  await screenRepo.incrementAllTargetConfigVersions();
  
  const screens = await screenRepo.getAll();
  await configPublisher.publish({ all: true });

  await auditRepo.log('GLOBAL_BROADCAST', 'Campaign', campaign.id, `Dispatched one-click global broadcast to ${screens.length} screens`);
  return res.status(201).json({ success: true, campaign, dispatchedScreens: screens.length });
});

router.get('/', async (req: Request, res: Response) => {
  const campaigns = await campaignRepo.getAll();
  return res.json({ success: true, campaigns });
});

router.get('/:id', async (req: Request, res: Response) => {
  const campaign = await campaignRepo.getById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }
  return res.json({ success: true, campaign });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const data = parsed.data;

  const targetIds = Array.isArray(data.targetIds) && data.targetIds.length > 0 ? data.targetIds : ['all'];
  for (const t of targetIds) {
    if (t === 'all') continue;
    if (t.startsWith('DEP-')) {
      const dept = await getDb().collection('departments').findOne({ _id: t as any });
      if (!dept) return res.status(400).json({ success: false, message: `Unknown department ID: ${t}` });
    } else if (t.startsWith('SCR-')) {
      const screen = await getDb().collection('screens').findOne({ _id: t as any });
      if (!screen) return res.status(400).json({ success: false, message: `Unknown screen ID: ${t}` });
    } else {
      return res.status(400).json({ success: false, message: `Invalid target ID format: ${t}` });
    }
  }


  let status = data.status || 'active';
  if (data.startDate && new Date(data.startDate) > new Date()) {
    status = 'scheduled';
  }

  const campaign = await campaignRepo.create({
    name: data.name,
    description: data.description || '',
    type: (data.type as any) || 'global',
    contentType: (data.contentType as any) || 'single_image',
    targetIds: Array.isArray(data.targetIds) && data.targetIds.length > 0 ? data.targetIds : ['all'],
    mediaId: data.mediaId || undefined,
    mediaUrl: data.mediaUrl || undefined,
    playlistId: data.playlistId || undefined,
    priority: data.priority ? parseInt(data.priority as string, 10) : 50,
    intervalMinutes: data.intervalMinutes ? parseInt(data.intervalMinutes as string, 10) : 3,
    displayDurationSeconds: data.displayDurationSeconds ? parseInt(data.displayDurationSeconds as string, 10) : 15,
    daysOfWeek: Array.isArray(data.daysOfWeek) ? data.daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
    startDate: data.startDate,
    endDate: data.endDate,
    startTime: data.startTime,
    endTime: data.endTime,
    status: status as any,
  });

  if (campaign.targetIds.includes('all') || campaign.type === 'global') {
    await screenRepo.incrementAllTargetConfigVersions();
  } else {
    for (const t of campaign.targetIds) {
      if (t.startsWith('DEP-')) {
        await screenRepo.incrementDepartmentTargetConfigVersions(t);
      } else if (t.startsWith('SCR-')) {
        await screenRepo.incrementTargetConfigVersion(t);
      } else {
        await screenRepo.incrementAllTargetConfigVersions();
      }
    }
  }

  if (getIO()) {
    await configPublisher.publish({ all: true });
  }

  await auditRepo.log('CREATE_CAMPAIGN', 'Campaign', campaign.id, `Created campaign ${campaign.name}`);
  return res.status(201).json({ success: true, campaign });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const updateData = parsed.data as any;
  if (updateData.targetIds) {
    const patchTargetIds = Array.isArray(updateData.targetIds) && updateData.targetIds.length > 0 ? updateData.targetIds : ['all'];
    for (const t of patchTargetIds) {
      if (t === 'all') continue;
      if (t.startsWith('DEP-')) {
        const dept = await getDb().collection('departments').findOne({ _id: t as any });
        if (!dept) return res.status(400).json({ success: false, message: `Unknown department ID: ${t}` });
      } else if (t.startsWith('SCR-')) {
        const screen = await getDb().collection('screens').findOne({ _id: t as any });
        if (!screen) return res.status(400).json({ success: false, message: `Unknown screen ID: ${t}` });
      } else {
        return res.status(400).json({ success: false, message: `Invalid target ID format: ${t}` });
      }
    }
  }

  const campaign = await campaignRepo.update(req.params.id, updateData);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  await screenRepo.incrementAllTargetConfigVersions();

  if (getIO()) {
    await configPublisher.publish({ all: true });
  }

  await auditRepo.log('UPDATE_CAMPAIGN', 'Campaign', campaign.id, `Updated campaign ${campaign.name}`);
  return res.json({ success: true, campaign });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const success = await campaignRepo.delete(req.params.id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  await screenRepo.incrementAllTargetConfigVersions();

  if (getIO()) {
    await configPublisher.publish({ all: true });
  }

  await auditRepo.log('DELETE_CAMPAIGN', 'Campaign', req.params.id, `Deleted campaign ${req.params.id}`);
  return res.json({ success: true, message: 'Campaign deleted successfully' });
});

export default router;
