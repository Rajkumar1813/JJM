import { Router, Request, Response } from 'express';
import { screenRepo } from '../db/repositories/screenRepository';
import { deviceRepo } from '../db/repositories/deviceRepository';
import { commandRepo } from '../db/repositories/commandRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { pairingService } from '../services/pairingService';
import { resolverService } from '../services/resolverService';
import { commandService } from '../services/commandService';
import { healthMonitor } from '../services/healthMonitor';
import { io } from '../server';
import { CommandType } from '../types';

const router = Router();

// GET all screens with accurate health states
router.get('/', (req: Request, res: Response) => {
  const screens = screenRepo.getAll().map(s => {
    const health = healthMonitor.evaluateScreenHealth(s);
    return {
      ...s,
      healthStatus: health,
      connectionStatus: health === 'OFFLINE' ? 'offline' : 'online',
    };
  });
  res.json({ success: true, screens });
});

// GET screen by ID with resolved config
router.get('/:id', (req: Request, res: Response) => {
  const screen = screenRepo.getById(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }
  try {
    const resolvedConfig = resolverService.resolveScreenConfig(screen.id);
    const health = healthMonitor.evaluateScreenHealth(screen);
    return res.json({
      success: true,
      screen: { ...screen, healthStatus: health },
      resolvedConfig,
    });
  } catch (err: any) {
    return res.json({ success: true, screen, resolvedConfig: null, error: err.message });
  }
});

// POST Create screen manually
router.post('/', (req: Request, res: Response) => {
  const { name, code, departmentId, location, queueUrl, playlistId, staleThresholdSeconds } = req.body;
  if (!name || !departmentId || !queueUrl) {
    return res.status(400).json({ success: false, message: 'Missing required fields (name, departmentId, queueUrl)' });
  }

  const screenCode = code || `DOC${Math.floor(100 + Math.random() * 900)}`;
  const screenId = `SCR-${screenCode}`;

  const screen = screenRepo.create({
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
    deviceToken: null,
    playerVersion: '1.0.0',
    lastHeartbeat: null,
  });

  auditRepo.log('CREATE_SCREEN', 'Screen', screen.id, `Created screen ${screen.name}`);
  return res.status(201).json({ success: true, screen });
});

// PATCH Update screen (increments targetConfigVersion)
router.patch('/:id', (req: Request, res: Response) => {
  const existing = screenRepo.getById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }

  // Validate departmentId if provided
  if (req.body.departmentId) {
    const dept = departmentRepo.getById(req.body.departmentId);
    if (!dept) {
      return res.status(400).json({ success: false, message: `Department '${req.body.departmentId}' not found` });
    }
  }

  // Increment authoritative target config version so version divergence is tracked
  const newTargetVersion = existing.targetConfigVersion + 1;

  const updated = screenRepo.update(req.params.id, {
    ...req.body,
    targetConfigVersion: newTargetVersion,
  });

  if (io) {
    const config = resolverService.resolveScreenConfig(existing.id);
    io.to(`screen:${existing.id}`).emit('config:update', { config, targetConfigVersion: newTargetVersion });
    io.emit('screens:changed');
  }

  auditRepo.log('UPDATE_SCREEN', 'Screen', existing.id, `Updated screen params (targetConfigVersion: ${newTargetVersion})`);
  return res.json({ success: true, screen: updated });
});


// POST TV generates pairing code
router.post('/pair-session', (req: Request, res: Response) => {
  const { socketId, deviceMetadata } = req.body;
  const session = pairingService.createPairingSession(socketId, deviceMetadata);
  return res.json({ success: true, session });
});

// POST Admin claims pairing code
router.post('/pair-claim', (req: Request, res: Response) => {
  const { pairingCode, name, code, departmentId, location, queueUrl, staleThresholdSeconds } = req.body;
  if (!pairingCode || !name || !departmentId || !queueUrl) {
    return res.status(400).json({ success: false, message: 'Missing required pairing fields' });
  }

  try {
    const { screen, session } = pairingService.pairScreen(pairingCode, {
      name,
      code,
      departmentId,
      location: location || 'Hospital OPD Area',
      queueUrl,
      staleThresholdSeconds: staleThresholdSeconds || 180,
    });

    if (io) {
      io.emit(`pair:${pairingCode}`, {
        success: true,
        screenId: screen.id,
        deviceToken: session.deviceToken,
        screen,
      });
      io.to(`pairing:${pairingCode}`).emit('paired', {
        screenId: screen.id,
        deviceToken: session.deviceToken,
        screen,
      });
      io.emit('screens:changed');
    }

    return res.json({ success: true, screen, session });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// POST Unpair screen
router.post('/:id/unpair', (req: Request, res: Response) => {
  const screen = pairingService.unpairScreen(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }

  if (io) {
    io.to(`screen:${screen.id}`).emit('screen:unpaired', { screenId: screen.id });
    io.emit('screen:unpaired', { screenId: screen.id });
    io.emit('screens:changed');
  }

  return res.json({ success: true, message: 'Screen unpaired successfully' });
});

// DELETE Screen
router.delete('/:id', (req: Request, res: Response) => {
  const screen = screenRepo.getById(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }

  if (io) {
    io.to(`screen:${screen.id}`).emit('screen:unpaired', { screenId: screen.id });
    io.emit('screen:unpaired', { screenId: screen.id });
  }

  screenRepo.delete(screen.id);
  auditRepo.log('DELETE_SCREEN', 'Screen', screen.id, `Permanently deleted screen ${screen.name}`);

  if (io) {
    io.emit('screens:changed');
  }

  return res.json({ success: true, message: 'Screen deleted successfully' });
});

// ==========================================
// TARGETED TV COMMAND CENTER ENDPOINTS (V2)
// ==========================================

// POST Dispatch targeted command to exact physical screen (supports both /command and /commands)
router.post(['/:id/commands', '/:id/command'], async (req: Request, res: Response) => {
  const { commandType, payload } = req.body;
  if (!commandType) {
    return res.status(400).json({ success: false, message: 'commandType is required' });
  }

  try {
    const command = await commandService.dispatchCommand(req.params.id, commandType as CommandType, payload);
    return res.status(202).json({ success: true, command });
  } catch (err: any) {
    return res.status(404).json({ success: false, message: err.message });
  }
});

// GET Recent commands for a screen (supports both /commands and /command/history)
router.get(['/:id/commands', '/:id/command/history'], (req: Request, res: Response) => {
  const commands = commandRepo.getRecentForScreen(req.params.id, 15);
  return res.json({ success: true, commands });
});

// POST TV acknowledges receipt of command (STAGE: RECEIVED)
router.post(['/:id/commands/:commandId/received', '/:id/command/:commandId/received'], (req: Request, res: Response) => {
  const cmd = commandService.handleReceived(req.params.commandId, req.params.id);
  return res.json({ success: true, command: cmd });
});

// POST TV reports command applied (STAGE: APPLIED)
router.post(['/:id/commands/:commandId/applied', '/:id/command/:commandId/applied'], (req: Request, res: Response) => {
  const cmd = commandService.handleApplied(req.params.commandId, req.params.id);
  return res.json({ success: true, command: cmd });
});

// POST TV acknowledges command completion (STAGE: ACKNOWLEDGED)
router.post(['/:id/commands/:commandId/ack', '/:id/command/:commandId/ack'], (req: Request, res: Response) => {
  const { resultPayload } = req.body;
  const cmd = commandService.handleAcknowledged(req.params.commandId, req.params.id, resultPayload);
  return res.json({ success: true, command: cmd });
});

// POST TV reports command failure (STAGE: FAILED)
router.post(['/:id/commands/:commandId/fail', '/:id/command/:commandId/fail'], (req: Request, res: Response) => {
  const { errorMessage } = req.body;
  const cmd = commandService.handleFailed(req.params.commandId, req.params.id, errorMessage || 'Unknown execution error');
  return res.json({ success: true, command: cmd });
});

// POST Toggle screen pause/resume
router.post('/:id/toggle-pause', (req: Request, res: Response) => {
  const screen = screenRepo.getById(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }
  const newPaused = !screen.isPaused;
  const updated = screenRepo.update(screen.id, { isPaused: newPaused });

  if (io) {
    const config = resolverService.resolveScreenConfig(screen.id);
    io.to(`screen:${screen.id}`).emit('config:update', { config });
    io.emit('screens:changed');
  }

  auditRepo.log('TOGGLE_PAUSE', 'Screen', screen.id, `Toggled playback pause: ${newPaused ? 'PAUSED' : 'RESUMED'}`);
  return res.json({ success: true, isPaused: newPaused, screen: updated });
});

// POST Update screen hardware power state
router.post('/:id/power', (req: Request, res: Response) => {
  const { state } = req.body;
  const screen = screenRepo.getById(req.params.id);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not found' });
  }

  const powerState = state === 'off' ? 'off' : 'on';
  const updated = screenRepo.update(screen.id, { powerState });

  if (io) {
    const config = resolverService.resolveScreenConfig(screen.id);
    io.to(`screen:${screen.id}`).emit('config:update', { config });
    io.emit('screens:changed');
  }

  auditRepo.log('POWER_STATE', 'Screen', screen.id, `Set screen power state to ${powerState}`);
  return res.json({ success: true, powerState, screen: updated });
});

// Backwards-compatible convenience routes routing to the formal Command Lifecycle
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

export default router;
