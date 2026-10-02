import { DeviceCommand, CommandType, CommandStatus } from '../../types';
import { generateId, mapMongoToApi } from './repoUtils';
import { getDb } from '../mongo';

export class CommandRepository {
  private get col() {
    return getDb().collection('device_commands');
  }

  public async create(cmd: {
    id?: string;
    screenId: string;
    deviceId?: string | null;
    commandType: CommandType;
    payload?: any;
    expiresAt?: number;
  }): Promise<DeviceCommand> {
    const id = cmd.id || generateId('CMD');
    const createdAt = new Date();
    const expiresAt = cmd.expiresAt || (Date.now() + 60000); // 60s default expiry

    const newCmd = {
      _id: id,
      screenId: cmd.screenId,
      deviceId: cmd.deviceId || null,
      commandType: cmd.commandType,
      payload: cmd.payload || null,
      status: 'CREATED' as CommandStatus,
      createdAt,
      expiresAt,
    };

    await this.col.insertOne(newCmd as any);
    return (await this.getById(id))!;
  }

  public async getById(id: string): Promise<DeviceCommand | null> {
    const r = await this.col.findOne({ _id: id as any });
    return r ? mapMongoToApi(r) : undefined;
  }

  public async getPendingForScreen(screenId: string): Promise<DeviceCommand[]> {
    const rows = await this.col.find({
      screenId,
      status: { $in: ['CREATED', 'SENT', 'RECEIVED'] },
      expiresAt: { $gt: Date.now() }
    }).sort({ createdAt: 1 }).toArray();
    return rows.map(r => mapMongoToApi(r));
  }

  public async getRecentForScreen(screenId: string, limit = 10): Promise<DeviceCommand[]> {
    const rows = await this.col.find({ screenId }).sort({ createdAt: -1 }).limit(limit).toArray();
    return rows.map(r => mapMongoToApi(r));
  }

  public async markSent(id: string): Promise<DeviceCommand | null> {
    await this.col.updateOne(
      { _id: id as any, status: 'CREATED' },
      { $set: { status: 'SENT', sentAt: new Date() } }
    );
    return await this.getById(id) || null;
  }

  public async markReceived(id: string): Promise<DeviceCommand | null> {
    await this.col.updateOne(
      { _id: id as any, status: { $in: ['CREATED', 'SENT'] } },
      { $set: { status: 'RECEIVED', receivedAt: new Date() } }
    );
    return await this.getById(id) || null;
  }

  public async markApplied(id: string): Promise<DeviceCommand | null> {
    await this.col.updateOne(
      { _id: id as any },
      { $set: { status: 'APPLIED', appliedAt: new Date() } }
    );
    return await this.getById(id) || null;
  }

  public async markAcknowledged(id: string): Promise<DeviceCommand | null> {
    await this.col.updateOne(
      { _id: id as any },
      { $set: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() } }
    );
    return await this.getById(id) || null;
  }

  public async markFailed(id: string, errorMessage: string): Promise<DeviceCommand | null> {
    await this.col.updateOne(
      { _id: id as any },
      { $set: { status: 'FAILED', errorMessage } }
    );
    return await this.getById(id) || null;
  }

  public async reapExpiredTimeouts(): Promise<number> {
    const now = Date.now();
    const res = await this.col.updateMany(
      { status: { $in: ['CREATED', 'SENT', 'RECEIVED'] }, expiresAt: { $lt: now } },
      { $set: { status: 'TIMEOUT', errorMessage: 'Command timed out without TV acknowledgement' } }
    );
    return res.modifiedCount;
  }
}

export const commandRepo = new CommandRepository();
