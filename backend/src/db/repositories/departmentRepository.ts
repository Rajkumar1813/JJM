import { Department } from '../../types';
import { generateId, buildMongoUpdate, formatDateTimeToISO, mapMongoToApi, mapMongoListToApi } from './repoUtils';
import { getDb, withTransaction } from '../mongo';

export class DepartmentRepository {
  private get col() {
    return getDb().collection('departments');
  }

  public async getAll(): Promise<Department[]> {
    const rows = await this.col.find({}).sort({ name: 1 }).toArray();
    return mapMongoListToApi(rows);
  }

  public async getById(id: string): Promise<Department | null> {
    const r = await this.col.findOne({ _id: id as any });
    return r ? mapMongoToApi(r) : null;
  }

  public async create(dept: Omit<Department, 'id' | 'createdAt'> & { id?: string }): Promise<Department> {
    const id = dept.id || generateId('DEP');
    const createdAt = new Date();

    const newDept = {
      _id: id,
      name: dept.name,
      code: dept.code.toUpperCase(),
      floor: dept.floor,
      description: dept.description || '',
      defaultQueueUrl: dept.defaultQueueUrl,
      defaultPlaylistId: dept.defaultPlaylistId || null,
      doctorInCharge: (dept as any).doctorInCharge || null,
      status: dept.status || 'active',
      createdAt,
    };

    await this.col.insertOne(newDept as any);
    return (await this.getById(id))!;
  }

  public async update(id: string, updates: Partial<Department>): Promise<Department | null> {
    const dbUpdates = buildMongoUpdate({
      name: updates.name,
      code: updates.code ? updates.code.toUpperCase() : undefined,
      floor: updates.floor,
      description: updates.description,
      defaultQueueUrl: updates.defaultQueueUrl,
      defaultPlaylistId: updates.defaultPlaylistId,
      status: updates.status,
      doctorInCharge: (updates as any).doctorInCharge,
    });

    if (dbUpdates) {
      await this.col.updateOne({ _id: id as any }, dbUpdates);
    }
    return await this.getById(id) || null;
  }

  public async delete(id: string): Promise<boolean> {
    return await withTransaction(async (session) => {
      // Pull this department from campaign targets
      await getDb().collection('campaigns').updateMany(
        { 'targets.targetId': id, 'targets.targetType': 'DEPARTMENT' },
        { $pull: { targets: { targetId: id, targetType: 'DEPARTMENT' } } as any },
        { session }
      );
      
      // Emergency events targets array
      await getDb().collection('emergency_events').updateMany(
        { targetIds: id, targetType: 'DEPARTMENT' },
        { $pull: { targetIds: id } as any },
        { session }
      );

      const res = await this.col.deleteOne({ _id: id as any }, { session });
      return res.deletedCount > 0;
    });
  }
}

export const departmentRepo = new DepartmentRepository();
