import { configPublisher } from '../services/configPublisher';
import { getISTDateString } from '../utils/time';
import { Logger } from './logger';
import { healthMonitor } from './healthMonitor';
import { getDb } from '../db/mongo';
import { getIO } from '../realtime/socket';
import crypto from 'crypto';

import { commandService } from './commandService';
import { screenRepo } from '../db/repositories/screenRepository';
import { resolverService } from './resolverService';

export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  public start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), 15000);
    Logger.info('[Scheduler] Started background tasks (watchdog, campaigns, emergencies)');
  }

  public stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    Logger.info('[Scheduler] Stopped background tasks');
  }

  private async tick() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    let hasLock = false;
    const lockName = 'jjm_scheduler_lock';
    const instanceId = crypto.randomUUID();
    const ttl = 10000;
    const db = getDb();

    try {
      const now = Date.now();
      const lockCol = db.collection('job_locks');
      
      const lockResult = await lockCol.findOneAndUpdate(
        { _id: lockName as any, $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }] },
        { $set: { lockedUntil: now + ttl, owner: instanceId } },
        { upsert: true, returnDocument: 'after' }
      ).catch(async (e) => {
        if (e.code === 11000) {
          return null; // Already exists and locked
        }
        throw e;
      });

      if (!lockResult || lockResult.owner !== instanceId) {
        return; // Another instance has the lock
      }
      
      hasLock = true;

      await healthMonitor.runWatchdog();
      await this.evaluateCampaigns();
      await this.evaluateEmergencies();
      await commandService.reapTimeouts();
      await this.purgeAuditLogs(); // Controlled by settings

    } catch (err: any) {
      Logger.error(`[Scheduler] Tick failed: ${err.message}`);
    } finally {
      if (hasLock) {
        await db.collection('job_locks').deleteOne({ _id: lockName as any, owner: instanceId });
      }
      this.isProcessing = false;
    }
  }

  private async evaluateCampaigns() {
    try {
      const db = getDb();
      let changed = false;
      const todayDateStr = getISTDateString(new Date());

      // 1. Scheduled -> Active
      const scheduledRes = await db.collection('campaigns').updateMany(
        { status: 'scheduled', startDate: { $ne: null, $lte: todayDateStr } },
        { $set: { status: 'active' } }
      );
      if (scheduledRes.modifiedCount > 0) changed = true;

      // 2. Active -> Expired
      const expiredRes = await db.collection('campaigns').updateMany(
        { status: 'active', endDate: { $ne: null, $lt: todayDateStr } },
        { $set: { status: 'expired' } }
      );
      if (expiredRes.modifiedCount > 0) changed = true;

      if (changed) {
        Logger.info('[Scheduler] Campaigns status changed. Pushing updates.');
        await screenRepo.incrementAllTargetConfigVersions();
        if (getIO()) {
          await configPublisher.publish({ all: true });
        }
      }
    } catch (err: any) {
      Logger.error(`[Scheduler] evaluateCampaigns failed: ${err.message}`);
    }
  }

  private async evaluateEmergencies() {
    try {
      const now = Date.now();
      const db = getDb();
      
      const expiredRows = await db.collection('emergency_events').find({
        isActive: true,
        expiresAt: { $ne: null, $lte: now }
      }).toArray();

      if (expiredRows.length > 0) {
        await db.collection('emergency_events').updateMany(
          { isActive: true, expiresAt: { $ne: null, $lte: now } },
          { $set: { isActive: false, clearedAt: new Date() } }
        );
        
        for (const row of expiredRows) {
          Logger.info(`[Scheduler] Auto-expired emergency ${row._id}`);
        }
        
        if (getIO()) {
          getIO().to('admins').emit('emergency:dismiss');
          await configPublisher.publish({ all: true });
        }
      }
    } catch (err: any) {
      Logger.error(`[Scheduler] evaluateEmergencies failed: ${err.message}`);
    }
  }

  private lastPurgeTime = 0;

  private async purgeAuditLogs() {
    try {
      const now = Date.now();
      // Run hourly (3600000 ms)
      if (now - this.lastPurgeTime < 3600000) return;
      this.lastPurgeTime = now;

      const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10);
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - retentionDays);
      
      const res = await getDb().collection('audit_logs').deleteMany({ timestamp: { $lt: thresholdDate } });
      if (res.deletedCount > 0) {
        Logger.info(`[Scheduler] Purged ${res.deletedCount} old audit logs`);
      }
    } catch (err: any) {
      Logger.error(`[Scheduler] purgeAuditLogs failed: ${err.message}`);
    }
  }
}

export const schedulerService = new SchedulerService();
