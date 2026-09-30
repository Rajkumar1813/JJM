import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { screenRepo } from '../db/repositories/screenRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { resolverService } from '../services/resolverService';
import { io } from '../server';

const router = Router();
let autoDismissTimer: NodeJS.Timeout | null = null;

async function dismissActiveEmergency() {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
  await emergencyRepo.clearActive();

  if (io) {
    io.to('admins').emit('emergency:update', { announcement: null });
    io.to('admins').emit('emergency:dismiss', {});
    const screens = await screenRepo.getAll();
    for (const s of screens) {
      try {
        const config = await resolverService.resolveScreenConfig(s.id);
        io.to(`screen:${s.id}`).emit('config:update', { config });
        io.to(`screen:${s.id}`).emit('emergency:update', { announcement: null });
        io.to(`screen:${s.id}`).emit('emergency:dismiss', {});
      } catch {}
    }
    io.to('admins').emit('screens:changed');
  }

  await auditRepo.log('EMERGENCY_DISMISSED', 'Emergency', 'ALL', 'Active emergency announcement dismissed');
}

const broadcastSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  displayMode: z.enum(['takeover', 'banner', 'both']).optional(),
  targetType: z.enum(['ALL', 'DEPARTMENT', 'SCREEN']).optional(),
  targetIds: z.array(z.string()).optional(),
  highlightScreen: z.boolean().optional(),
  durationSeconds: z.union([z.string(), z.number()]).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const { screenId, departmentId } = req.query;
  const announcement = await emergencyRepo.getActive(screenId as string, departmentId as string);
  return res.json({ success: true, announcement });
});

router.get('/history', async (req: Request, res: Response) => {
  const announcements = await emergencyRepo.getAll();
  return res.json({ success: true, announcements });
});

router.post('/broadcast', async (req: Request, res: Response) => {
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { title, message, severity, displayMode, targetType, targetIds, highlightScreen, durationSeconds } = parsed.data;

  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }

  const parsedDuration = durationSeconds ? Number(durationSeconds) : undefined;

  const announcement = await emergencyRepo.create({
    title: title.trim(),
    message: message.trim(),
    severity: severity || 'critical',
    displayMode: displayMode || 'takeover',
    targetType: targetType || 'ALL',
    targetIds: Array.isArray(targetIds) && targetIds.length > 0 ? targetIds : ['all'],
    highlightScreen: highlightScreen !== undefined ? !!highlightScreen : true,
    durationSeconds: parsedDuration,
  });

  if (io) {
    io.to('admins').emit('emergency:update', { announcement });
    io.to('admins').emit('emergency:broadcast', { announcement });

    const screens = await screenRepo.getAll();
    for (const s of screens) {
      try {
        const config = await resolverService.resolveScreenConfig(s.id);
        io.to(`screen:${s.id}`).emit('config:update', { config });
        io.to(`screen:${s.id}`).emit('emergency:update', { announcement });
      } catch {}
    }
    io.to('admins').emit('screens:changed');
  }

  if (parsedDuration && parsedDuration > 0) {
    autoDismissTimer = setTimeout(async () => {
      const current = await emergencyRepo.getActive();
      if (current && current.id === announcement.id) {
        await dismissActiveEmergency();
      }
    }, parsedDuration * 1000);
  }

  await auditRepo.log('EMERGENCY_BROADCAST', 'Emergency', announcement.id, `Triggered emergency: ${title} (${targetType || 'ALL'})`);
  return res.json({ success: true, announcement });
});

router.delete('/', async (req: Request, res: Response) => {
  await dismissActiveEmergency();
  return res.json({ success: true, message: 'Emergency cleared successfully' });
});

router.post('/dismiss', async (req: Request, res: Response) => {
  await dismissActiveEmergency();
  return res.json({ success: true, message: 'Emergency dismissed' });
});

export default router;
