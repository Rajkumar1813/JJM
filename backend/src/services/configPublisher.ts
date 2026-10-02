import { getIO } from '../realtime/socket';
import { Logger } from './logger';
import { getDb } from '../db/mongo';
import { resolverService } from './resolverService';

export class ConfigPublisher {
  public async publish(options: { screenIds?: string[], departmentId?: string, all?: boolean }): Promise<void> {
    try {
      const db = getDb();
      const screensCol = db.collection('screens');
      const filter: any = {};
      
      if (options.all) {
        // match all
      } else if (options.screenIds && options.screenIds.length > 0) {
        filter._id = { $in: options.screenIds };
      } else if (options.departmentId) {
        filter.departmentId = options.departmentId;
      } else {
        return;
      }

      // Bump versions
      await screensCol.updateMany(filter, { $inc: { targetConfigVersion: 1 } });
      
      const affectedScreens = await screensCol.find(filter).project({ _id: 1, targetConfigVersion: 1 }).toArray();
      
      for (const s of affectedScreens) {
        try {
          const config = await resolverService.resolveScreenConfig(s._id.toString());
          getIO().to(`screen:${s._id}`).emit('config:update', { config, targetConfigVersion: config.configVersion });
        } catch (e: any) {
          Logger.error(`[ConfigPublisher] Error resolving config for screen ${s._id}: ${e.message}`);
        }
      }
      
      getIO().to('admins').emit('screens:changed');
    } catch (e: any) {
      Logger.error(`[ConfigPublisher] Failed to publish config: ${e.message}`);
    }
  }
}

export const configPublisher = new ConfigPublisher();
