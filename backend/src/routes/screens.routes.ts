import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { screenRepo } from '../db/repositories/screenRepository';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { commandRepo } from '../db/repositories/commandRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { pairingService } from '../services/pairingService';
import { resolverService } from '../services/resolverService';
import { commandService } from '../services/commandService';
import { healthMonitor } from '../services/healthMonitor';
import { io } from '../server';
import { CommandType } from '../types';

const router = Router();

const createScreenSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  departmentId: z.string().min(1),
  location: z.string().optional(),
  queueUrl: z.string().url(),
  playlistId: z.string().optional(),
  staleThresholdSeconds: z.number().optional(),
});

const updateScreenSchema = createScreenSchema.partial();

const pairSessionSchema = z.object({
  socketId: z.string().optional(),
  deviceMetadata: z.any().optional(),
});

const pairClaimSchema = z.object({
  pairingCode: z.string().min(1),
  name: z.string().min(1),
  code: z.string().optional(),
  departmentId: z.string().min(1),
  location: z.string().optional(),
  queueUrl: z.string().url(),
  staleThresholdSeconds: z.number().optional(),
});

const commandSchema = z.object({
  commandType: z.string().min(1),
  payload: z.any().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const screensList = await screenRepo.getAll();
  const screens = await Promise.all(screensList.map(async (s) => {
    const health = await healthMonitor.evaluateScreenHealth(s);
    return {
      ...s,
      healthStatus: health,
      connectionStatus: health === 'OFFLINE' ? 'offline' : 'online',
    };
  }));
  res.json({ success: true, screens });
});

router.get('/:id', async (req: Request, res: Response) => {
  const screen = await screenRepo.getById(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }
  try {
    const resolvedConfig = await resolverService.resolveScreenConfig(screen.id);
    const health = await healthMonitor.evaluateScreenHealth(screen);
    return res.json({
      success: true,
      screen: { ...screen, healthStatus: health },
      resolvedConfig,
    });
  } catch (err: any) {
    return res.json({ success: true, screen, resolvedConfig: null, error: err.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createScreenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { name, code, departmentId, location, queueUrl, playlistId, staleThresholdSeconds } = parsed.data;

  const screenCode = code || `DOC${Math.floor(100 + Math.random() * 900)}`;
  const screenId = `SCR-${screenCode}`;

  const screen = await screenRepo.create({
    id: screenId,
    name,
    code: screenCode,
    departmentId,
    location: location || 'Hospital OPD Area',
    queueUrl,
    staleThresholdSeconds: staleThresholdSeconds || 180,
    targetConfigVersion: 1,
    appliedConfigVersion: 0,
    mediaManifestVersion: 1,
    status: 'active',
    connectionStatus: 'offline',
    healthStatus: 'OFFLINE',
    currentContent: 'queue',
    currentCampaignId: null,
    playlistId: playlistId || 'PL-DEFAULT',
    deviceToken: null as any,
    playerVersion: '1.0.0',
    lastHeartbeat: null,
  });

  await auditRepo.log('CREATE_SCREEN', 'Screen', screen.id, `Created screen ${screen.name}`);
  return res.status(201).json({ success: true, screen });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateScreenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const existing = await screenRepo.getById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }

  if (parsed.data.departmentId) {
    const dept = await departmentRepo.getById(parsed.data.departmentId);
    if (!dept) {
      return res.status(400).json({ success: false, message: `Department '${parsed.data.departmentId}' not found` });
    }
  }

  const newTargetVersion = existing.targetConfigVersion + 1;

  const updated = await screenRepo.update(req.params.id, {
    ...parsed.data,
    targetConfigVersion: newTargetVersion,
  });

  if (io) {
    const config = await resolverService.resolveScreenConfig(existing.id);
    io.to(`screen:${existing.id}`).emit('config:update', { config, targetConfigVersion: newTargetVersion });
    io.to('admins').emit('screens:changed');
  }

  await auditRepo.log('UPDATE_SCREEN', 'Screen', existing.id, `Updated screen params (targetConfigVersion: ${newTargetVersion})`);
  return res.json({ success: true, screen: updated });
});

router.post('/pair-session', async (req: Request, res: Response) => {
  const parsed = pairSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { socketId, deviceMetadata } = parsed.data;
  const session = await pairingService.createPairingSession(socketId, deviceMetadata);
  return res.json({ success: true, session });
});

router.post('/pair-claim', async (req: Request, res: Response) => {
  const parsed = pairClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { pairingCode, name, code, departmentId, location, queueUrl, staleThresholdSeconds } = parsed.data;

  try {
    const { screen, session } = await pairingService.pairScreen(pairingCode, {
      name,
      code,
      departmentId,
      location: location || 'Hospital OPD Area',
      queueUrl,
      staleThresholdSeconds: staleThresholdSeconds || 180,
    });

    if (io) {
      io.to(`pairing:${pairingCode}`).emit(`pairing:success`, {
        success: true,
        screenId: screen.id,
        deviceToken: session.deviceToken,
        screen,
      });
      io.to('admins').emit('screens:changed');
    }

    return res.json({ success: true, screen, session });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:id/unpair', async (req: Request, res: Response) => {
  const screen = await pairingService.unpairScreen(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }

  if (io) {
    io.to(`screen:${screen.id}`).emit('screen:unpaired', { screenId: screen.id });
    io.to(`screen:${screen.id}`).emit('screen:unpaired', { screenId: screen.id });
    io.to('admins').emit('screens:changed');
  }

  return res.json({ success: true, message: 'Screen unpaired successfully' });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const screen = await screenRepo.getById(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }

  if (io) {
    io.to(`screen:${screen.id}`).emit('screen:unpaired', { screenId: screen.id });
    io.emit('screen:unpaired', { screenId: screen.id });
  }

  await screenRepo.delete(screen.id);
  await auditRepo.log('DELETE_SCREEN', 'Screen', screen.id, `Permanently deleted screen ${screen.name}`);

  if (io) {
    io.emit('screens:changed');
  }

  return res.json({ success: true, message: 'Screen deleted successfully' });
});

router.post(['/:id/commands', '/:id/command'], async (req: Request, res: Response) => {
  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { commandType, payload } = parsed.data;

  try {
    const command = await commandService.dispatchCommand(req.params.id, commandType as CommandType, payload);
    return res.status(202).json({ success: true, command });
  } catch (err: any) {
    return res.status(404).json({ success: false, message: err.message });
  }
});

router.get(['/:id/commands', '/:id/command/history'], async (req: Request, res: Response) => {
  const commands = await commandRepo.getRecentForScreen(req.params.id, 15);
  return res.json({ success: true, commands });
});

router.post(['/:id/commands/:commandId/received', '/:id/command/:commandId/received'], async (req: Request, res: Response) => {
  const cmd = await commandService.handleReceived(req.params.commandId, req.params.id);
  return res.json({ success: true, command: cmd });
});

router.post(['/:id/commands/:commandId/applied', '/:id/command/:commandId/applied'], async (req: Request, res: Response) => {
  const cmd = await commandService.handleApplied(req.params.commandId, req.params.id);
  return res.json({ success: true, command: cmd });
});

router.post(['/:id/commands/:commandId/ack', '/:id/command/:commandId/ack'], async (req: Request, res: Response) => {
  const { resultPayload } = req.body;
  const cmd = await commandService.handleAcknowledged(req.params.commandId, req.params.id, resultPayload);
  return res.json({ success: true, command: cmd });
});

router.post(['/:id/commands/:commandId/fail', '/:id/command/:commandId/fail'], async (req: Request, res: Response) => {
  const { errorMessage } = req.body;
  const cmd = await commandService.handleFailed(req.params.commandId, req.params.id, errorMessage || 'Unknown execution error');
  return res.json({ success: true, command: cmd });
});

router.post('/:id/toggle-pause', async (req: Request, res: Response) => {
  const screen = await screenRepo.getById(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }
  const newPaused = !screen.isPaused;
  const updated = await screenRepo.update(screen.id, { isPaused: newPaused });

  if (io) {
    const config = await resolverService.resolveScreenConfig(screen.id);
    io.to(`screen:${screen.id}`).emit('config:update', { config });
    io.to('admins').emit('screens:changed');
  }

  await auditRepo.log('TOGGLE_PAUSE', 'Screen', screen.id, `Toggled playback pause: ${newPaused ? 'PAUSED' : 'RESUMED'}`);
  return res.json({ success: true, isPaused: newPaused, screen: updated });
});

const powerSchema = z.object({
  state: z.string(),
});

router.post('/:id/power', async (req: Request, res: Response) => {
  const parsed = powerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { state } = parsed.data;
  const screen = await screenRepo.getById(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }

  const powerState = state === 'off' ? 'off' : 'on';
  const updated = await screenRepo.update(screen.id, { powerState });

  if (io) {
    const config = await resolverService.resolveScreenConfig(screen.id);
    io.to(`screen:${screen.id}`).emit('config:update', { config });
    io.to('admins').emit('screens:changed');
  }

  await auditRepo.log('POWER_STATE', 'Screen', screen.id, `Set screen power state to ${powerState}`);
  return res.json({ success: true, powerState, screen: updated });
});

router.post(['/:id/refresh', '/:id/sync'], async (req: Request, res: Response) => {
  const command = await commandService.dispatchCommand(req.params.id, 'SYNC_CONFIG');
  return res.json({ success: true, message: 'Sync config command dispatched', command });
});

router.post('/:id/reload-queue', async (req: Request, res: Response) => {
  const command = await commandService.dispatchCommand(req.params.id, 'RELOAD_QUEUE');
  return res.json({ success: true, message: 'Reload queue command dispatched', command });
});

router.post(['/:id/restart-player', '/:id/restart'], async (req: Request, res: Response) => {
  const command = await commandService.dispatchCommand(req.params.id, 'RESTART_PLAYER');
  return res.json({ success: true, message: 'Restart player command dispatched', command });
});

router.post('/:id/clear-cache', async (req: Request, res: Response) => {
  const command = await commandService.dispatchCommand(req.params.id, 'CLEAR_CACHE');
  return res.json({ success: true, message: 'Clear cache command dispatched', command });
});

router.post('/:id/request-snapshot', async (req: Request, res: Response) => {
  const command = await commandService.dispatchCommand(req.params.id, 'TAKE_SNAPSHOT');
  return res.json({ success: true, message: 'Snapshot command dispatched', command });
});

router.get('/:id/snapshot', async (req: Request, res: Response) => {
  const snap = await screenRepo.getSnapshot(req.params.id);
  if (!snap || !snap.image) {
    return res.status(404).json({ success: false, message: 'No snapshot available' });
  }
  return res.json({ success: true, image: snap.image, capturedAt: snap.time });
});

export default router;
