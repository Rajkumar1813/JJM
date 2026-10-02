import { Device } from '../../types';
import { generateId, mapMongoToApi, mapMongoListToApi } from './repoUtils';
import { getDb } from '../mongo';

export class DeviceRepository {
  private get col() {
    return getDb().collection('devices');
  }

  public async getAll(): Promise<Device[]> {
    const rows = await this.col.find({}).sort({ lastSeenAt: -1 }).toArray();
    return mapMongoListToApi(rows);
  }

  public async getById(id: string): Promise<Device | null> {
    const r = await this.col.findOne({ _id: id as any });
    return r ? mapMongoToApi(r) : undefined;
  }

  public async getByToken(token: string): Promise<Device | null> {
    const r = await this.col.findOne({ deviceToken: token });
    return r ? mapMongoToApi(r) : undefined;
  }

  public async upsert(device: {
    id?: string;
    deviceToken: string;
    platform: string;
    model?: string;
    appVersion: string;
    ipAddress?: string;
    macAddress?: string;
  }): Promise<Device> {
    const now = new Date();
    
    const updatePayload = {
      platform: device.platform,
      model: device.model || null,
      appVersion: device.appVersion,
      ipAddress: device.ipAddress || null,
      macAddress: device.macAddress || null,
      lastSeenAt: now,
    };

    const r = await this.col.findOneAndUpdate(
      { deviceToken: device.deviceToken },
      { 
        $set: updatePayload,
        $setOnInsert: { _id: device.id || generateId('DEV'), createdAt: now } 
      },
      { upsert: true, returnDocument: 'after' }
    );

    return mapMongoToApi(r)!;
  }

  public async updateLastSeen(id: string): Promise<void> {
    await this.col.updateOne({ _id: id as any }, { $set: { lastSeenAt: new Date() } });
  }
}

export const deviceRepo = new DeviceRepository();
