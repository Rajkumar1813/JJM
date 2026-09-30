import { getIO } from '../realtime/socket';
import { screenRepo } from '../db/repositories/screenRepository';
import { Logger } from './logger';

export class ConfigPublisher {
  /**
   * Bumps the target_config_version for the given screens and emits 'config:update' to their specific socket rooms.
   * If screenIds is empty or undefined, it's considered a global update.
   */
  public async publishForScreens(screenIds?: string[]): Promise<void> {
    try {
      const io = getIO();
      if (!screenIds || screenIds.length === 0) {
        // Global update
        await screenRepo.incrementAllTargetConfigVersions();
        io.emit('config:update'); // Emitting to all screens connected
      } else {
        // Targeted update
        for (const id of screenIds) {
          await screenRepo.incrementTargetConfigVersion(id);
          io.to(`screen:${id}`).emit('config:update');
        }
      }
      
      // Notify admins that screens have changed so they can refresh UI if needed
      io.to('admins').emit('screens:changed');
    } catch (e: any) {
      Logger.warn(`[ConfigPublisher] Failed to publish config: ${e.message}`);
    }
  }

  public async publishForDepartment(departmentId: string): Promise<void> {
    try {
      const io = getIO();
      await screenRepo.incrementDepartmentTargetConfigVersions(departmentId);
      io.to(`dept:${departmentId}`).emit('config:update');
      io.to('admins').emit('screens:changed');
    } catch (e: any) {
      Logger.warn(`[ConfigPublisher] Failed to publish config: ${e.message}`);
    }
  }
}

export const configPublisher = new ConfigPublisher();
