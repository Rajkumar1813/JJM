import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { departmentRepo } from './repositories/departmentRepository';
import { screenRepo } from './repositories/screenRepository';
import { mediaRepo } from './repositories/mediaRepository';
import { campaignRepo } from './repositories/campaignRepository';
import { playlistRepo, pairingRepo, auditRepo } from './repositories/miscRepositories';
import { emergencyRepo } from './repositories/emergencyRepository';

const JSON_DB_PATH = path.join(__dirname, '../../data/db.json');
const UPLOADS_DIR = path.join(__dirname, '../../uploads/media');

function calculateSha256(filePath: string): { hash: string; size: number } {
  try {
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      return { hash, size: fileBuffer.length };
    }
  } catch (_) {}
  return { hash: 'legacy_unhashed_' + Date.now(), size: 0 };
}

export function runMigration() {
  console.log('[Migration] Starting migration from db.json to SQLite...');

  if (!fs.existsSync(JSON_DB_PATH)) {
    console.log('[Migration] No db.json found. Skipping migration.');
    return;
  }

  const raw = fs.readFileSync(JSON_DB_PATH, 'utf-8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('[Migration] Failed to parse db.json:', err);
    return;
  }

  // 1. Migrate Departments
  if (Array.isArray(data.departments)) {
    for (const d of data.departments) {
      if (!departmentRepo.getById(d.id)) {
        departmentRepo.create({
          id: d.id,
          name: d.name,
          code: d.code,
          floor: d.floor || 'Ground Floor',
          description: d.description || '',
          defaultQueueUrl: d.defaultQueueUrl || 'https://hms.jjmhospitalkashipur.com/qd',
          defaultPlaylistId: d.defaultPlaylistId,
          status: d.status || 'active',
        });
        console.log(`[Migration] Migrated department: ${d.name} (${d.id})`);
      }
    }
  }

  // Ensure OPD default department exists if empty
  if (departmentRepo.getAll().length === 0) {
    departmentRepo.create({
      id: 'DEP-OPD',
      name: 'Outpatient Department (OPD)',
      code: 'OPD',
      floor: 'Ground Floor',
      description: 'General Doctor OPD and Consulting Rooms',
      defaultQueueUrl: 'https://hms.jjmhospitalkashipur.com/qd',
      status: 'active',
    });
    console.log('[Migration] Created default DEP-OPD department.');
  }

  // 2. Migrate Media
  if (Array.isArray(data.media)) {
    for (const m of data.media) {
      if (!mediaRepo.getById(m.id)) {
        const localFilename = path.basename(m.url || '');
        const localPath = path.join(UPLOADS_DIR, localFilename);
        const { hash, size } = calculateSha256(localPath);

        mediaRepo.create({
          id: m.id,
          title: m.title || 'Promotional Poster',
          type: m.type || 'image',
          url: m.url,
          sha256Hash: hash,
          fileSize: m.size || size,
          duration: m.duration || 15,
          dimensions: m.dimensions,
          tags: m.tags || [],
          category: m.category || 'General',
        });
        console.log(`[Migration] Migrated media: ${m.title} (${m.id})`);
      }
    }
  }

  // 3. Migrate Playlists
  if (Array.isArray(data.playlists)) {
    for (const p of data.playlists) {
      if (!playlistRepo.getById(p.id)) {
        playlistRepo.create({
          id: p.id,
          name: p.name,
          description: p.description || '',
          items: p.items || [],
          isDefault: p.isDefault || false,
        });
        console.log(`[Migration] Migrated playlist: ${p.name} (${p.id})`);
      }
    }
  }

  // 4. Migrate Screens
  if (Array.isArray(data.screens)) {
    for (const s of data.screens) {
      if (!screenRepo.getById(s.id)) {
        screenRepo.create({
          id: s.id,
          name: s.name,
          code: s.code || 'DOC038-TV',
          departmentId: s.departmentId || 'DEP-OPD',
          deviceId: null,
          location: s.location || 'Hospital OPD Area',
          queueUrl: s.queueUrl || 'https://hms.jjmhospitalkashipur.com/qd/DOC038',
          staleThresholdSeconds: 180,
          targetConfigVersion: 1,
          appliedConfigVersion: 0,
          mediaManifestVersion: 1,
          status: s.status || 'active',
          connectionStatus: s.connectionStatus || 'offline',
          healthStatus: s.connectionStatus === 'online' ? 'ONLINE' : 'OFFLINE',
          currentContent: s.currentContent || 'queue',
          currentCampaignId: s.currentCampaignId || null,
          playlistId: s.playlistId || 'PL-DEFAULT',
          deviceToken: s.deviceToken || null,
          playerVersion: s.playerVersion || '1.0.0',
          isPaused: !!s.isPaused,
          powerState: s.powerState || 'on',
          latestSnapshot: s.latestSnapshot,
          latestSnapshotTime: s.latestSnapshotTime,
          lastHeartbeat: s.lastHeartbeat,
          lastHeartbeatAt: s.lastHeartbeat,
          lastSyncAt: s.lastHeartbeat,
          deviceMetadata: s.deviceMetadata,
        });
        console.log(`[Migration] Migrated screen: ${s.name} (${s.id}) -> Queue: ${s.queueUrl}`);
      }
    }
  }

  // 5. Migrate Campaigns
  if (Array.isArray(data.campaigns)) {
    for (const c of data.campaigns) {
      if (!campaignRepo.getById(c.id)) {
        campaignRepo.create({
          id: c.id,
          name: c.name,
          description: c.description || '',
          type: c.type || 'global',
          contentType: c.contentType || 'single_image',
          targetIds: c.targetIds || ['all'],
          mediaId: c.mediaId,
          mediaUrl: c.mediaUrl,
          playlistId: c.playlistId,
          priority: c.priority || 50,
          intervalMinutes: c.intervalMinutes || 3,
          displayDurationSeconds: c.displayDurationSeconds || 15,
          daysOfWeek: c.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
          startDate: c.startDate,
          endDate: c.endDate,
          startTime: c.startTime,
          endTime: c.endTime,
          status: c.status || 'active',
        });
        console.log(`[Migration] Migrated campaign: ${c.name} (${c.id})`);
      }
    }
  }

  // 6. Migrate Pairing Sessions
  if (Array.isArray(data.pairingSessions)) {
    for (const p of data.pairingSessions) {
      pairingRepo.save({
        pairingCode: p.pairingCode,
        socketId: p.socketId,
        deviceMetadata: p.deviceMetadata,
        screenId: p.screenId,
        deviceToken: p.deviceToken,
        status: p.status || 'pending',
        expiresAt: p.expiresAt || (Date.now() + 900000),
      });
    }
  }

  // 7. Migrate Emergency if active
  if (data.emergencyAnnouncement && data.emergencyAnnouncement.active) {
    const e = data.emergencyAnnouncement;
    emergencyRepo.create({
      id: e.id || `EMERG-${Date.now()}`,
      title: e.title,
      message: e.message,
      severity: e.severity || 'critical',
      displayMode: e.displayMode || 'takeover',
      targetType: e.targetType || 'ALL',
      targetIds: e.targetIds || ['all'],
      highlightScreen: e.highlightScreen !== false,
      durationSeconds: e.durationSeconds,
    });
    console.log('[Migration] Migrated active emergency announcement.');
  }

  auditRepo.log('MIGRATION_COMPLETE', 'System', 'SQLITE_DB', 'Successfully migrated all records from db.json to SQLite');
  console.log('[Migration] Migration from db.json to SQLite completed successfully!');
}

// Execute migration if run directly
if (require.main === module) {
  runMigration();
}
