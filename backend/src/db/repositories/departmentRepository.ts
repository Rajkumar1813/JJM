import { query, queryOne, execute } from '../mysql';
import { Department } from '../../types';
import { generateId, buildUpdateQuery, formatDateTimeToISO } from './repoUtils';

export class DepartmentRepository {
  public async getAll(): Promise<Department[]> {
    const rows = await query('SELECT * FROM departments ORDER BY name ASC');
    return rows.map(r => this.mapRow(r));
  }

  public async getById(id: string): Promise<Department | undefined> {
    const r = await queryOne('SELECT * FROM departments WHERE id = ?', [id]);
    return r ? this.mapRow(r) : undefined;
  }

  public async create(dept: Omit<Department, 'id' | 'createdAt'> & { id?: string }): Promise<Department> {
    const id = dept.id || generateId('DEP');
    const createdAt = new Date();

    await execute(`
      INSERT INTO departments (id, name, code, floor, description, default_queue_url, default_playlist_id, doctor_in_charge, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      dept.name,
      dept.code.toUpperCase(),
      dept.floor,
      dept.description || '',
      dept.defaultQueueUrl,
      dept.defaultPlaylistId || null,
      (dept as any).doctorInCharge || null, // from schema migration
      dept.status || 'active',
      createdAt
    ]);

    return (await this.getById(id))!;
  }

  public async update(id: string, updates: Partial<Department>): Promise<Department | null> {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.code !== undefined) dbUpdates.code = updates.code.toUpperCase();
    if (updates.floor !== undefined) dbUpdates.floor = updates.floor;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.defaultQueueUrl !== undefined) dbUpdates.default_queue_url = updates.defaultQueueUrl;
    if (updates.defaultPlaylistId !== undefined) dbUpdates.default_playlist_id = updates.defaultPlaylistId;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if ((updates as any).doctorInCharge !== undefined) dbUpdates.doctor_in_charge = (updates as any).doctorInCharge;

    const q = buildUpdateQuery('departments', id, dbUpdates);
    if (q) {
      await execute(q.sql, q.values);
    }

    return await this.getById(id) || null;
  }

  public async delete(id: string): Promise<boolean> {
    const res = await execute('DELETE FROM departments WHERE id = ?', [id]);
    return res.affectedRows > 0;
  }

  private mapRow(r: any): Department {
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      floor: r.floor,
      description: r.description || '',
      defaultQueueUrl: r.default_queue_url,
      defaultPlaylistId: r.default_playlist_id || undefined,
      status: r.status as 'active' | 'inactive',
      createdAt: formatDateTimeToISO(r.created_at)!,
      ...((r.doctor_in_charge ? { doctorInCharge: r.doctor_in_charge } : {}) as any)
    };
  }
}

export const departmentRepo = new DepartmentRepository();
