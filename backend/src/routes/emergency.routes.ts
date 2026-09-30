import { Router, Request, Response } from 'express';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { screenRepo } from '../db/repositories/screenRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { resolverService } from '../services/resolverService';
import { io } from '../server';
import { EmergencyAnnouncement } from '../types';

const router = Router();
let autoDismissTimer: NodeJS.Timeout | null = null;

// Helper to push dismiss to all screens
function dismissActiveEmergency() {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
  emergencyRepo.clearActive();

  if (io) {
    io.emit('emergency:update', { announcement: null });
    io.emit('emergency:dismiss', {});
    screenRepo.getAll().forEach((s) => {
      try {
        const config = resolverService.resolveScreenConfig(s.id);
        io.to(`screen:${s.id}`).emit('config:update', { config });
      } catch {}
    });
    io.emit('screens:changed');
  }

  auditRepo.log('EMERGENCY_DISMISSED', 'Emergency', 'ALL', 'Active emergency announcement dismissed');
}

// GET current active emergency announcement
router.get('/', (req: Request, res: Response) => {
  const { screenId, departmentId } = req.query;
  const announcement = emergencyRepo.getActive(screenId as string, departmentId as string);
  return res.json({ success: true, announcement });
});

// GET all past and present emergency announcements
router.get('/history', (req: Request, res: Response) => {
  const announcements = emergencyRepo.getAll();
  return res.json({ success: true, announcements });
});

// POST Broadcast emergency announcement with targeted scope
router.post('/broadcast', (req: Request, res: Response) => {
  const { title, message, severity, displayMode, targetType, targetIds, highlightScreen, durationSeconds } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'Title and message are required' });
  }

  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }

  const id = `EMERG-${Date.now().toString(36).toUpperCase()}`;
  const parsedDuration = durationSeconds ? Number(durationSeconds) : undefined;

  const announcement = emergencyRepo.create({
    id,
    title: title.trim(),
    message: message.trim(),
    severity: severity || 'critical',
    displayMode: displayMode || 'takeover',
    targetType: targetType || 'ALL',
    targetIds: Array.isArray(targetIds) && targetIds.length > 0 ? targetIds : ['all'],
    highlightScreen: highlightScreen !== undefined ? !!highlightScreen : true,
    durationSeconds: parsedDuration,
  });

  // Broadcast targeted emergency event
  if (io) {
    io.emit('emergency:update', { announcement });
    io.emit('emergency:broadcast', { announcement });

    // Notify targeted screen rooms
    screenRepo.getAll().forEach((s) => {
      try {
        const config = resolverService.resolveScreenConfig(s.id);
        io.to(`screen:${s.id}`).emit('config:update', { config });
      } catch {}
    });
    io.emit('screens:changed');
  }

  // Schedule auto-dismiss if duration specified
  if (parsedDuration && parsedDuration > 0) {
    autoDismissTimer = setTimeout(() => {
      const current = emergencyRepo.getActive();
      if (current && current.id === announcement.id) {
        dismissActiveEmergency();
      }
    }, parsedDuration * 1000);
  }

  auditRepo.log('EMERGENCY_BROADCAST', 'Emergency', id, `Triggered emergency: ${title} (${targetType || 'ALL'})`);
  return res.json({ success: true, announcement });
});

// DELETE / POST clear active emergency
router.delete('/', (req: Request, res: Response) => {
  dismissActiveEmergency();
  return res.json({ success: true, message: 'Emergency cleared successfully' });
});

router.post('/dismiss', (req: Request, res: Response) => {
  dismissActiveEmergency();
  return res.json({ success: true, message: 'Emergency dismissed' });
});

export default router;
