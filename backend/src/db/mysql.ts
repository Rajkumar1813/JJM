import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { Logger } from '../services/logger';

// Pool configuration
export let pool: Pool;

export const initDbPool = () => {
  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA } : undefined;

  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hospital_signage',
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalNumbers: true,
    supportBigNumbers: true,
    ssl: ssl as any,
  });
};

function enforceSafetyGuard(sql: string) {
  const upper = sql.toUpperCase();
  if (upper.includes('TRUNCATE TABLE') || upper.includes('TRUNCATE ') || upper.includes('DROP TABLE')) {
    throw new Error('SAFETY VIOLATION: TRUNCATE and DROP TABLE are strictly prohibited at runtime.');
  }
  if (upper.includes('DELETE FROM') && !upper.includes('WHERE')) {
    throw new Error('SAFETY VIOLATION: DELETE FROM without WHERE clause is strictly prohibited.');
  }
}

export async function query<T = RowDataPacket[]>(sql: string, values?: any[]): Promise<T> {
  enforceSafetyGuard(sql);
  const [rows] = await pool.query(sql, values);
  return rows as unknown as T;
}

export async function queryOne<T = RowDataPacket>(sql: string, values?: any[]): Promise<T | null> {
  enforceSafetyGuard(sql);
  const [rows] = await pool.query<RowDataPacket[]>(sql, values);
  return (rows[0] as T) || null;
}

export async function execute(sql: string, values?: any[]): Promise<ResultSetHeader> {
  enforceSafetyGuard(sql);
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return result;
}

export async function withTransaction<T>(callback: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const safeJsonParse = (val: any) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};
