import fs from 'fs';
import path from 'path';
import { getDb } from './mongo';
import { Logger } from '../services/logger';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function runMigrations() {
  const db = getDb();
  try {
    Logger.info('[Migrations] Starting database migration check...');
    
    // Acquire distributed lock
    const lockName = 'schema_migration_lock';
    const now = Date.now();
    const ttl = 30000; // 30 seconds
    const instanceId = crypto.randomUUID();

    const lockCol = db.collection('job_locks');
    const lockResult = await lockCol.findOneAndUpdate(
      { _id: lockName as any, $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }] },
      { $set: { lockedUntil: now + ttl, owner: instanceId } },
      { upsert: true, returnDocument: 'after' }
    ).catch(async (e) => {
      if (e.code === 11000) {
        // Someone else just created it
        return null;
      }
      throw e;
    });

    if (!lockResult || lockResult.owner !== instanceId) {
      Logger.warn('[Migrations] Could not acquire migration lock. Another instance might be migrating.');
      return;
    }

    try {
      const migrationsDir = path.join(__dirname, 'migrations');
      if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
      }

      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js')).sort();
      const schemaMigrations = db.collection('schema_migrations');
      
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const migration = await import(filePath);

        const applied = await schemaMigrations.findOne({ _id: file as any });
        if (!applied) {
          Logger.info(`[Migrations] Applying ${file}...`);
          if (migration.up) {
            await migration.up(db);
          }
          await schemaMigrations.insertOne({ _id: file as any, appliedAt: new Date() });
          Logger.info(`[Migrations] Successfully applied ${file}`);
        }
      }

      await seedInitialData(db);
      await ensureIndexes(db);

    } finally {
      // Release lock
      await lockCol.deleteOne({ _id: lockName as any, owner: instanceId });
    }
  } catch (error) {
    Logger.error(`[Migrations] Failed to run migrations: ${(error as Error).message}`);
    throw error;
  }
}

async function seedInitialData(db: import('mongodb').Db) {
  const sysCol = db.collection('system_versions');
  const now = new Date();
  
  const sysConfig = await sysCol.findOne({ _id: 'GLOBAL_CONFIG' as any });
  if (!sysConfig) {
    await sysCol.insertOne({ _id: 'GLOBAL_CONFIG' as any, versionNumber: 1, updatedAt: now });
  }

  const sysManifest = await sysCol.findOne({ _id: 'MEDIA_MANIFEST' as any });
  if (!sysManifest) {
    await sysCol.insertOne({ _id: 'MEDIA_MANIFEST' as any, versionNumber: 1, updatedAt: now });
  }

  // Seed Admin user
  const adminCol = db.collection('admin_users');
  const adminCount = await adminCol.countDocuments();
  
  if (adminCount === 0) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const pin = process.env.ADMIN_PIN;
    
    if (email && password && pin) {
      Logger.info('[Migrations] Seeding initial admin user...');
      const passwordHash = await bcrypt.hash(password, 12);
      const pinHash = await bcrypt.hash(pin, 12);
      const id = 'ADM-' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      
      await adminCol.insertOne({
        _id: id as any,
        email,
        passwordHash,
        pinHash,
        role: 'admin',
        isActive: true,
        createdAt: now,
      });
    } else {
      Logger.error('[Migrations] No admin user exists and ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PIN env vars are missing. Cannot seed admin user. Refusing to start.');
      process.exit(1);
    }
  }
}

async function ensureIndexes(db: import('mongodb').Db) {
  Logger.info('[Migrations] Ensuring indexes...');
  await db.collection('screen_snapshots').createIndex({ screenId: 1 }, { unique: true });
  await db.collection('device_commands').createIndex({ screenId: 1, createdAt: -1 });
  await db.collection('media').createIndex({ createdAt: -1 });
  
  // P1-6 requirements: unique department/screen codes
  await db.collection('departments').createIndex({ code: 1 }, { unique: true });
  await db.collection('screens').createIndex({ code: 1 }, { unique: true });
}
