import { screenRepo } from '../db/repositories/screenRepository';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { io } from '../server';
import { HealthStatus, Screen } from '../types';
import { Logger } from './logger';

export class HealthMonitor {
  /**
   * Evaluates the multi-dimensional health status of a screen.
   */
  public evaluateScreenHealth(screen: Screen, heartbeatData?: {
    queueConnected?: boolean;
    queueLastUpdateAt?: string;
    mediaManifestVersion?: number;
    hasMediaError?: boolean;
  }): HealthStatus {
    const now = Date.now();

    // 1. Check Offline
    if (!screen.lastHeartbeat) {
      return 'OFFLINE';
    }
    const diffSec = (now - new Date(screen.lastHeartbeat).getTime()) / 1000;
    if (diffSec > 60) {
      return 'OFFLINE';
    }

    // 2. Check Emergency Override
    const activeEmergency = emergencyRepo.getActive(screen.id, screen.departmentId);
    if (activeEmergency) {
      return 'EMERGENCY';
    }

    // 3. Check Configuration Version Discrepancy
    if (screen.appliedConfigVersion < screen.targetConfigVersion) {
      return 'UPDATE_REQUIRED';
    }

    // 4. Check Queue Freshness
    if (heartbeatData?.queueLastUpdateAt) {
      const queueAgeSec = (now - new Date(heartbeatData.queueLastUpdateAt).getTime()) / 1000;
      if (queueAgeSec > (screen.staleThresholdSeconds || 180)) {
        return 'QUEUE_STALE';
      }
    }

    // 5. Check Degraded (media error or disconnected queue)
    if (heartbeatData?.hasMediaError || heartbeatData?.queueConnected === false) {
      return 'DEGRADED';
    }

    // Default healthy
    return 'ONLINE';
  }

  /**
   * Periodic watchdog run every 15 seconds to detect dropped heartbeats
   */
  public runWatchdog(): void {
    const screens = screenRepo.getAll();
    const now = Date.now();

    for (const screen of screens) {
      let isChanged = false;
      const currentHealth = screen.healthStatus;

      if (screen.lastHeartbeat) {
        const diffSec = (now - new Date(screen.lastHeartbeat).getTime()) / 1000;
        if (diffSec > 60 && screen.connectionStatus === 'online') {
          screenRepo.update(screen.id, {
            connectionStatus: 'offline',
            healthStatus: 'OFFLINE',
          });
          isChanged = true;
          Logger.warn(`Screen ${screen.name} (${screen.id}) timed out after ${Math.round(diffSec)}s. Marked OFFLINE.`);
        }
      } else if (screen.connectionStatus === 'online') {
        screenRepo.update(screen.id, {
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
