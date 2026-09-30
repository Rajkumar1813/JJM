import crypto from 'crypto';

export function generateId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  return `${prefix}-${uuid}`.toUpperCase();
}

/**
 * Builds a dynamic UPDATE query for MySQL.
 * Returns { sql, values } or null if no valid updates.
 * Ignores keys where value is undefined.
 */
export function buildUpdateQuery(tableName: string, id: string, updates: Record<string, any>): { sql: string, values: any[] } | null {
  const setClauses: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      // map camelCase to snake_case if needed, but we assume keys passed here are already snake_case column names,
      // or we handle mapping before calling this. Let's assume caller passes DB column names.
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) {
    return null;
  }

  const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = ?`;
  values.push(id);
  
  return { sql, values };
}

export function formatDateTimeToISO(dt: any): string | null {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString();
  if (typeof dt === 'string') return new Date(dt).toISOString();
  return null;
}

export function safeJson(val: any, defaultVal: any = null): any {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val; // mysql2 automatically parses JSON columns if decimalNumbers is on or with correct driver settings, but let's be safe.
}
