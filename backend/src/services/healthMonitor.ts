import { screenRepo } from '../db/repositories/screenRepository';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { getIO } from '../realtime/socket';
import { HealthStatus, Screen } from '../types';
import { Logger } from './logger';

export class HealthMonitor {
  public async evaluateScreenHealth(screen: Screen, heartbeatData?: {
    queueConnected?: boolean;
    queueLastUpdateAt?: string;
    mediaManifestVersion?: number;
    hasMediaError?: boolean;
  }): Promise<HealthStatus> {
    const now = Date.now();

    const settings = await import('./resolverService').then(m => m.resolverService.getGlobalSettings());
    const heartbeatSeconds = settings?.heartbeatSeconds || 15;
    const offlineThreshold = heartbeatSeconds * 3;

    if (!screen.lastHeartbeat) {
      return 'OFFLINE';
    }
    const diffSec = (now - new Date(screen.lastHeartbeat).getTime()) / 1000;
    if (diffSec > offlineThreshold) {
      return 'OFFLINE';
    }

    const activeEmergency = await emergencyRepo.getActive(screen.id, screen.departmentId);
    if (activeEmergency) {
      return 'EMERGENCY';
    }

    if (screen.appliedConfigVersion < screen.targetConfigVersion) {
      return 'UPDATE_REQUIRED';
    }

    if (heartbeatData?.queueLastUpdateAt) {
      const queueAgeSec = (now - new Date(heartbeatData.queueLastUpdateAt).getTime()) / 1000;
      if (queueAgeSec > (screen.staleThresholdSeconds || 180)) {
        return 'QUEUE_STALE';
      }
    }

    if (heartbeatData?.hasMediaError || heartbeatData?.queueConnected === false) {
      return 'DEGRADED';
    }

    return 'ONLINE';
  }

  public async runWatchdog(): Promise<void> {
    const screens = await screenRepo.getAll();
    const now = Date.now();
    const settings = await import('./resolverService').then(m => m.resolverService.getGlobalSettings());
    const heartbeatSeconds = settings?.heartbeatSeconds || 15;
    const offlineThreshold = heartbeatSeconds * 3;

    for (const screen of screens) {
      let isChanged = false;

      if (screen.lastHeartbeat) {
        const diffSec = (now - new Date(screen.lastHeartbeat).getTime()) / 1000;
        if (diffSec > offlineThreshold && screen.connectionStatus === 'online') {
          await screenRepo.update(screen.id, {
            connectionStatus: 'offline',
            healthStatus: 'OFFLINE',
          });
          isChanged = true;
          Logger.warn(`Screen ${screen.name} (${screen.id}) timed out after ${Math.round(diffSec)}s. Marked OFFLINE.`);
        }
      } else if (screen.connectionStatus === 'online') {
        await screenRepo.update(screen.id, {
          connectionStatus: 'offline',
          healthStatus: 'OFFLINE',
        });
        isChanged = true;
      }

      if (isChanged && getIO()) {
        getIO().emit('screen:status_change', {
          screenId: screen.id,
          status: 'offline',
          healthStatus: 'OFFLINE',
        });
        getIO().emit('screens:changed');
      }
    }
  }
}

export const healthMonitor = new HealthMonitor();
