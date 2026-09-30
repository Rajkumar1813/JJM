import { Router, Request, Response } from 'express';
import { screenRepo } from '../db/repositories/screenRepository';
import { commandRepo } from '../db/repositories/commandRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { resolverService } from '../services/resolverService';
import { healthMonitor } from '../services/healthMonitor';
import { io } from '../server';
import { ReconciliationResponse } from '../types';

const router = Router();

// Resolved display configuration for a screen
router.get('/:screenId/config', (req: Request, res: Response) => {
  try {
    const config = resolverService.resolveScreenConfig(req.params.screenId);
    return res.json({ success: true, config });
  } catch (err: any) {
    return res.status(404).json({ success: false, message: err.message });
  }
});

/**
 * Authoritative REST State Reconciliation Endpoint
 * Called by TV on:
 * - Boot
 * - Socket Reconnection
 * - Network Recovery
 * - Backend Restart
 */
router.post('/:screenId/reconcile', (req: Request, res: Response) => {
  const { screenId } = req.params;
  const { appliedConfigVersion, mediaManifestVersion, playerVersion } = req.body;

  const screen = screenRepo.getById(screenId);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not registered' });
  }

  // Update screen last sync and applied versions
  const now = new Date().toISOString();
  screenRepo.update(screen.id, {
    connectionStatus: 'online',
    lastSyncAt: now,
    lastHeartbeat: now,
    lastHeartbeatAt: now,
    appliedConfigVersion: appliedConfigVersion !== undefined ? Number(appliedConfigVersion) : screen.appliedConfigVersion,
    mediaManifestVersion: mediaManifestVersion !== undefined ? Number(mediaManifestVersion) : screen.mediaManifestVersion,
    playerVersion: playerVersion || screen.playerVersion,
  });

  const config = resolverService.resolveScreenConfig(screen.id);
  const activeEmergency = emergencyRepo.getActive(screen.id, screen.departmentId);
  const pendingCommands = commandRepo.getPendingForScreen(screen.id);

  const response: ReconciliationResponse = {
    success: true,
    screenId: screen.id,
    configVersion: screen.targetConfigVersion,
    mediaManifestVersion: mediaRepo.getManifestVersion(),
    config,
    activeEmergency,
    pendingCommands,
    timestamp: now,
  };

  return res.json(response);
});

// TV Heartbeat endpoint with rich multi-dimensional diagnostics
router.post('/:screenId/heartbeat', (req: Request, res: Response) => {
  const { screenId } = req.params;
  const {
    currentContent,
    playerVersion,
    appliedConfigVersion,
    mediaManifestVersion,
    queueConnected,
    queueLastUpdateAt,
    hasMediaError,
    deviceMetadata,
  } = req.body;

  const screen = screenRepo.getById(screenId);
  if (!screen) {
    return res.status(404).json({ success: false, message: 'Screen not registered' });
  }

  // Evaluate multi-dimensional health
  const healthStatus = healthMonitor.evaluateScreenHealth(screen, {
    queueConnected,
    queueLastUpdateAt,
    mediaManifestVersion,
    hasMediaError,
  });

  const updatedScreen = screenRepo.recordHeartbeat(screenId, {
    appliedConfigVersion: appliedConfigVersion !== undefined ? Number(appliedConfigVersion) : undefined,
    mediaManifestVersion: mediaManifestVersion !== undefined ? Number(mediaManifestVersion) : undefined,
    currentContent: currentContent || 'queue',
    playerVersion: playerVersion || '1.0.0',
    healthStatus,
    deviceMetadata,
  });

  if (io) {
    io.emit('screen:heartbeat_received', {
      screenId: screen.id,
      status: 'online',
      healthStatus,
      appliedConfigVersion: updatedScreen?.appliedConfigVersion,
      targetConfigVersion: updatedScreen?.targetConfigVersion,
      currentContent,
    });
  }

  return res.json({
    success: true,
    targetConfigVersion: screen.targetConfigVersion,
    appliedConfigVersion: updatedScreen?.appliedConfigVersion,
    healthStatus,
    timestamp: new Date().toISOString(),
  });
});

export default router;
