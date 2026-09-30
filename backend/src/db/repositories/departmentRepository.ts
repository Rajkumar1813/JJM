import { sqlite } from '../sqlite';
import { Department } from '../../types';

export class DepartmentRepository {
  public getAll(): Department[] {
    const rows = sqlite.prepare('SELECT * FROM departments ORDER BY name ASC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      floor: r.floor,
      description: r.description || '',
      defaultQueueUrl: r.default_queue_url,
      defaultPlaylistId: r.default_playlist_id || undefined,
      status: r.status as 'active' | 'inactive',
      createdAt: r.created_at,
    }));
  }

  public getById(id: string): Department | undefined {
    const r = sqlite.prepare('SELECT * FROM departments WHERE id = ?').get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      floor: r.floor,
      description: r.description || '',
      defaultQueueUrl: r.default_queue_url,
      defaultPlaylistId: r.default_playlist_id || undefined,
      status: r.status as 'active' | 'inactive',
      createdAt: r.created_at,
    };
  }

  public create(dept: Omit<Department, 'id' | 'createdAt'> & { id?: string }): Department {
    const id = dept.id || `DEP-${dept.code.toUpperCase()}`;
    const createdAt = new Date().toISOString();

    sqlite.prepare(`
      INSERT INTO departments (id, name, code, floor, description, default_queue_url, default_playlist_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      dept.name,
      dept.code.toUpperCase(),
      dept.floor,
      dept.description || '',
      dept.defaultQueueUrl,
      dept.defaultPlaylistId || null,
      dept.status || 'active',
      createdAt
    );

    return this.getById(id)!;
  }

  public update(id: string, updates: Partial<Department>): Department | null {
    const current = this.getById(id);
    if (!current) return null;

    const updated = { ...current, ...updates };
    sqlite.prepare(`
      UPDATE departments
      SET name = ?, code = ?, floor = ?, description = ?, default_queue_url = ?, default_playlist_id = ?, status = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.code.toUpperCase(),
      updated.floor,
      updated.description,
      updated.defaultQueueUrl,
      updated.defaultPlaylistId || null,
      updated.status,
      id
    );

    return this.getById(id)!;
  }

  public delete(id: string): boolean {
    const res = sqlite.prepare('DELETE FROM departments WHERE id = ?').run(id);
    return res.changes > 0;
  }
}

export const departmentRepo = new DepartmentRepository();
