import { screenRepo } from '../db/repositories/screenRepository';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { io } from '../server';
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

    if (!screen.lastHeartbeat) {
      return 'OFFLINE';
    }
    const diffSec = (now - new Date(screen.lastHeartbeat).getTime()) / 1000;
    if (diffSec > 60) {
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

    for (const screen of screens) {
      let isChanged = false;

      if (screen.lastHeartbeat) {
        const diffSec = (now - new Date(screen.lastHeartbeat).getTime()) / 1000;
        if (diffSec > 60 && screen.connectionStatus === 'online') {
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

      if (isChanged && io) {
        io.emit('screen:status_change', {
          screenId: screen.id,
          status: 'offline',
          healthStatus: 'OFFLINE',
        });
        io.emit('screens:changed');
      }
    }
  }
}

export const healthMonitor = new HealthMonitor();
