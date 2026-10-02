import { configPublisher } from '../services/configPublisher';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { screenRepo } from '../db/repositories/screenRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { resolverService } from '../services/resolverService';
import { getIO } from '../realtime/socket';

const router = Router();
async function emitEmergencyUpdate() {
  const current = await emergencyRepo.getActive();
  if (getIO()) {
    getIO().to('admins').emit('emergency:update', { announcement: current });
    await configPublisher.publish({ all: true });
  }
}

async function dismissActiveEmergency() {
  await emergencyRepo.clearActive();
  await emitEmergencyUpdate();
  await auditRepo.log('EMERGENCY_DISMISSED', 'Emergency', 'ALL', 'All active emergency announcements dismissed');
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

  if (getIO()) {
    getIO().to('admins').emit('emergency:update', { announcement });
    getIO().to('admins').emit('emergency:broadcast', { announcement });

    await configPublisher.publish({ all: true });
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

router.post('/:id/dismiss', async (req: Request, res: Response) => {
  const { id } = req.params;
  const success = await emergencyRepo.clearById(id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'Active emergency not found' });
  }
  await emitEmergencyUpdate();
  await auditRepo.log('EMERGENCY_DISMISSED', 'Emergency', id, 'Emergency announcement dismissed');
  return res.json({ success: true, message: 'Emergency dismissed' });
});

export default router;
