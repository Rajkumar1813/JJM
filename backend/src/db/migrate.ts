import fs from 'fs';
import path from 'path';
import { execute, query, pool } from './mysql';
import { Logger } from '../services/logger';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function runMigrations() {
  const connection = await pool.getConnection();
  try {
    Logger.info('[Migrations] Starting database migration check...');
    // Advisory lock to prevent multiple instances migrating at once
    const lockName = 'jjm_migration_lock';
    const [[lockResult]] = await connection.query<any>('SELECT GET_LOCK(?, 10) AS lock_status', [lockName]);
    if (lockResult.lock_status !== 1) {
      Logger.warn('[Migrations] Could not acquire migration lock. Another instance might be migrating.');
      return;
    }

    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          applied_at DATETIME(3) NOT NULL,
          checksum VARCHAR(255)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      const migrationsDir = path.join(__dirname, 'migrations');
      if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
      }

      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');

        const [rows] = await connection.query<any>('SELECT * FROM schema_migrations WHERE version = ?', [file]);
        if (rows.length === 0) {
          Logger.info(`[Migrations] Applying ${file}...`);
          // split sql into statements by ';' if needed, but mysql2 execute doesn't support multiple statements natively unless enabled.
          // Wait, create pool needs multipleStatements: true to run raw migration scripts!
          // We must ensure multipleStatements: true is set on pool, or we split the statements.
          // For safety, we will just use pool with multipleStatements: true for migrations, or split it here.
          const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
          for (const stmt of statements) {
            await connection.query(stmt);
          }

          await connection.query('INSERT INTO schema_migrations (version, applied_at, checksum) VALUES (?, ?, ?)', [
            file,
            new Date(),
            checksum,
          ]);
          Logger.info(`[Migrations] Successfully applied ${file}`);
        }
      }

      await seedInitialData(connection);

    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    }
  } catch (error) {
    Logger.error('[Migrations] Failed to run migrations:', error);
    throw error;
  } finally {
    connection.release();
  }
}

async function seedInitialData(connection: any) {
  // Seed system_versions
  const [sysRows] = await connection.query("SELECT * FROM system_versions WHERE id IN ('GLOBAL_CONFIG', 'MEDIA_MANIFEST')");
  const existingSys = sysRows.map((r: any) => r.id);
  const now = new Date();
  
  if (!existingSys.includes('GLOBAL_CONFIG')) {
    await connection.query('INSERT INTO system_versions (id, version_number, updated_at) VALUES (?, ?, ?)', ['GLOBAL_CONFIG', 1, now]);
  }
  if (!existingSys.includes('MEDIA_MANIFEST')) {
    await connection.query('INSERT INTO system_versions (id, version_number, updated_at) VALUES (?, ?, ?)', ['MEDIA_MANIFEST', 1, now]);
  }

  // Seed Admin user
  const [adminRows] = await connection.query("SELECT * FROM admin_users");
  if (adminRows.length === 0) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const pin = process.env.ADMIN_PIN;
    
    if (email && password && pin) {
      Logger.info('[Migrations] Seeding initial admin user...');
      const passwordHash = await bcrypt.hash(password, 12);
      const pinHash = await bcrypt.hash(pin, 12);
      const id = 'ADM-' + crypto.randomUUID();
      await connection.query(`
        INSERT INTO admin_users (id, email, password_hash, pin_hash, role, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `, [id, email, passwordHash, pinHash, 'admin', now]);
    } else {
      Logger.error('[Migrations] No admin user exists and ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PIN env vars are missing. Cannot seed admin user. Refusing to start.');
      process.exit(1);
    }
  }
}
