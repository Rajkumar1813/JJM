import crypto from 'crypto';

export function generateId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  return `${prefix}-${uuid}`.toUpperCase();
}

/**
 * Builds a dynamic $set query for MongoDB.
 * Ignores keys where value is undefined.
 */
export function buildMongoUpdate(updates: Record<string, any>): Record<string, any> | null {
  const $set: Record<string, any> = {};
  let hasKeys = false;
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      $set[key] = value;
      hasKeys = true;
    }
  }
  return hasKeys ? { $set } : null;
}

export function formatDateTimeToISO(dt: any): string | null {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString();
  if (typeof dt === 'string') return new Date(dt).toISOString();
  if (typeof dt === 'number') return new Date(dt).toISOString();
  return null;
}

export function mapMongoToApi(doc: any): any {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  
  // deeply map dates to iso strings if they are at top level
  for (const key in rest) {
    if (rest[key] instanceof Date) {
      rest[key] = rest[key].toISOString();
    }
  }
  return { id: _id, ...rest };
}

export function mapMongoListToApi(docs: any[]): any[] {
  return docs.map(mapMongoToApi);
}
