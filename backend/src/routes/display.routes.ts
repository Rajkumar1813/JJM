import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { screenRepo } from '../db/repositories/screenRepository';
import { commandRepo } from '../db/repositories/commandRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { resolverService } from '../services/resolverService';
import { healthMonitor } from '../services/healthMonitor';
import { commandService } from '../services/commandService';
import { requireDeviceAuth } from '../middleware/auth.middleware';
import { getIO } from '../realtime/socket';
import { ReconciliationResponse } from '../types';
import { Logger } from '../services/logger';

const router = Router();

// Apply device auth to all routes in this router
router.use('/:screenId', requireDeviceAuth);

router.get('/:screenId/config', async (req: Request, res: Response) => {
  try {
    const config = await resolverService.resolveScreenConfig(req.params.screenId);
    return res.json({ success: true, config });
  } catch (err: any) {
    return res.status(404).json({ success: false, message: err.message });
  }
});

const reconcileSchema = z.object({
  appliedConfigVersion: z.union([z.string(), z.number()]).optional(),
  mediaManifestVersion: z.union([z.string(), z.number()]).optional(),
  playerVersion: z.string().optional(),
});

router.post('/:screenId/reconcile', async (req: Request, res: Response) => {
  const { screenId } = req.params;
  
  const parsed = reconcileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }
  
  const { appliedConfigVersion, mediaManifestVersion, playerVersion } = parsed.data;

  const screen = await screenRepo.getById(screenId);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not registered' });
  }

  const now = new Date().toISOString();
  await screenRepo.update(screen.id, {
    connectionStatus: 'online',
    lastSyncAt: now,
    lastHeartbeat: now,
    lastHeartbeatAt: now,
    appliedConfigVersion: appliedConfigVersion !== undefined ? Number(appliedConfigVersion) : screen.appliedConfigVersion,
    mediaManifestVersion: mediaManifestVersion !== undefined ? Number(mediaManifestVersion) : screen.mediaManifestVersion,
    playerVersion: playerVersion || screen.playerVersion,
  });

  const config = await resolverService.resolveScreenConfig(screen.id);
  const activeEmergency = await emergencyRepo.getActive(screen.id, screen.departmentId);
  let pendingCommands = await commandRepo.getPendingForScreen(screen.id);
  
  // Transform to camelCase for the TV as requested
  const transformedCommands = pendingCommands.map(cmd => ({
    id: cmd.id,
    commandType: cmd.commandType,
    payload: cmd.payload,
    status: cmd.status
  }));

  const updatedScreen = await screenRepo.getById(screenId);

  const response: ReconciliationResponse = {
    success: true,
    screenId: screen.id,
    configVersion: updatedScreen!.targetConfigVersion,
    mediaManifestVersion: await mediaRepo.getManifestVersion(),
    config,
    activeEmergency,
    pendingCommands: transformedCommands as any,
    timestamp: now,
  };

  return res.json(response);
});

const heartbeatSchema = z.object({
  currentContent: z.string().optional(),
  playerVersion: z.string().optional(),
  appliedConfigVersion: z.union([z.string(), z.number()]).optional(),
  mediaManifestVersion: z.union([z.string(), z.number()]).optional(),
  queueConnected: z.boolean().optional(),
  queueLastUpdateAt: z.string().optional(),
  hasMediaError: z.boolean().optional(),
  deviceMetadata: z.any().optional(),
});

router.post('/:screenId/heartbeat', async (req: Request, res: Response) => {
  const { screenId } = req.params;
  
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const {
    currentContent,
    playerVersion,
    appliedConfigVersion,
    mediaManifestVersion,
    queueConnected,
    queueLastUpdateAt,
    hasMediaError,
    deviceMetadata,
  } = parsed.data;

  const screen = await screenRepo.getById(screenId);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not registered' });
  }

  // Record heartbeat first
  const updatedScreen = await screenRepo.recordHeartbeat(screenId, {
    appliedConfigVersion: appliedConfigVersion !== undefined ? Number(appliedConfigVersion) : undefined,
    mediaManifestVersion: mediaManifestVersion !== undefined ? Number(mediaManifestVersion) : undefined,
    currentContent: currentContent || 'queue',
    playerVersion: playerVersion || '1.0.0',
    deviceMetadata,
    healthStatus: 'ONLINE' // Temp update before evaluation
  });

  // Then evaluate health with fresh timestamp
  const freshScreen = await screenRepo.getById(screenId);
  const healthStatus = await healthMonitor.evaluateScreenHealth(freshScreen as any, {
    queueConnected,
    queueLastUpdateAt,
    mediaManifestVersion: mediaManifestVersion !== undefined ? Number(mediaManifestVersion) : undefined,
    hasMediaError,
  });

  if (healthStatus !== freshScreen?.healthStatus) {
    await screenRepo.update(screenId, { healthStatus });
  }

  try {
    const io = getIO();
    io.to('admins').emit('screen:heartbeat_received', {
      screenId: screen.id,
      status: 'online',
      healthStatus,
      appliedConfigVersion: updatedScreen?.appliedConfigVersion,
      targetConfigVersion: updatedScreen?.targetConfigVersion,
      currentContent,
    });
  } catch (e) {
    Logger.warn('Socket not initialized yet');
  }

  return res.json({
    success: true,
    targetConfigVersion: screen.targetConfigVersion,
    appliedConfigVersion: updatedScreen?.appliedConfigVersion,
    healthStatus,
    timestamp: new Date().toISOString(),
  });
});

// TV Command Fallback HTTP Endpoints
router.post('/:screenId/commands/:commandId/received', async (req: Request, res: Response) => {
  await commandService.handleReceived(req.params.commandId, req.params.screenId);
  res.json({ success: true });
});

router.post('/:screenId/commands/:commandId/applied', async (req: Request, res: Response) => {
  await commandService.handleApplied(req.params.commandId, req.params.screenId);
  res.json({ success: true });
});

router.post('/:screenId/commands/:commandId/ack', async (req: Request, res: Response) => {
  await commandService.handleAcknowledged(req.params.commandId, req.params.screenId, req.body.resultPayload);
  res.json({ success: true });
});

router.post('/:screenId/commands/:commandId/fail', async (req: Request, res: Response) => {
  await commandService.handleFailed(req.params.commandId, req.params.screenId, req.body.errorMessage || 'Unknown error');
  res.json({ success: true });
});

export default router;
