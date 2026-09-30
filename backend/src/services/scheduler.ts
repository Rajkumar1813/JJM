import { Logger } from './logger';
import { healthMonitor } from './healthMonitor';
import { execute, query } from '../db/mysql';
import { io } from '../server';

export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null;

  public start() {
    if (this.intervalId) return;
    // Run every 15 seconds
    this.intervalId = setInterval(() => this.tick(), 15000);
    Logger.info('[Scheduler] Started background tasks (watchdog, campaigns, emergencies)');
  }

  public stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    Logger.info('[Scheduler] Stopped background tasks');
  }

  private async tick() {
    try {
      await healthMonitor.runWatchdog();
      await this.evaluateCampaigns();
      await this.evaluateEmergencies();
    } catch (err: any) {
      Logger.error(`[Scheduler] Tick failed: ${err.message}`);
    }
  }

  private async evaluateCampaigns() {
    try {
      const tzOptions = { timeZone: 'Asia/Kolkata' };
      const now = new Date();
      
      const yyyy = now.toLocaleString('en-US', { ...tzOptions, year: 'numeric' });
      const mm = now.toLocaleString('en-US', { ...tzOptions, month: '2-digit' });
      const dd = now.toLocaleString('en-US', { ...tzOptions, day: '2-digit' });
      const todayStr = `${yyyy}-${mm}-${dd}`;

      // 1. Scheduled -> Active (if startDate <= today)
      await execute(`
        UPDATE campaigns 
        SET status = 'active' 
        WHERE status = 'scheduled' AND start_date <= ?
      `, [todayStr]);

      // 2. Active -> Expired (if endDate < today)
      await execute(`
        UPDATE campaigns 
        SET status = 'expired' 
        WHERE status = 'active' AND end_date IS NOT NULL AND end_date < ?
      `, [todayStr]);
    } catch (err: any) {
      Logger.error(`[Scheduler] evaluateCampaigns failed: ${err.message}`);
    }
  }

  private async evaluateEmergencies() {
    try {
      const now = Date.now();
      
      const expiredRows = await query<any[]>(`
        SELECT id FROM emergency_events 
        WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at <= ?
      `, [now]);

      if (expiredRows.length > 0) {
        await execute(`
          UPDATE emergency_events 
          SET is_active = 0, cleared_at = NOW() 
          WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at <= ?
        `, [now]);
        
        for (const row of expiredRows) {
          Logger.info(`[Scheduler] Auto-expired emergency ${row.id}`);
        }
        
        // Notify screens that emergency ended
        io?.to('admins').emit('emergency:dismiss');
        const { screenRepo } = require('../db/repositories/screenRepository');
        const screens = await screenRepo.getAll();
        for (const s of screens) {
          io?.to(`screen:${s.id}`).emit('emergency:dismiss', {});
          io?.to(`screen:${s.id}`).emit('emergency:update', { announcement: null });
        }
        io?.to('admins').emit('screens:changed');
      }
    } catch (err: any) {
      Logger.error(`[Scheduler] evaluateEmergencies failed: ${err.message}`);
    }
  }
}

export const schedulerService = new SchedulerService();
