import { Db } from 'mongodb';

export async function up(db: Db) {
  // admin_users
  const adminUsers = db.collection('admin_users');
  await adminUsers.createIndex({ email: 1 }, { unique: true });

  // screens
  const screens = db.collection('screens');
  await screens.createIndex({ code: 1 }, { unique: true });
  await screens.createIndex({ displayKey: 1 }, { unique: true, sparse: true });
  await screens.createIndex({ departmentId: 1 });
  await screens.createIndex({ healthStatus: 1 });
  await screens.createIndex({ lastHeartbeat: 1 });

  // campaigns
  const campaigns = db.collection('campaigns');
  await campaigns.createIndex({ status: 1, priority: 1 });
  await campaigns.createIndex({ 'targets.targetType': 1, 'targets.targetId': 1 });

  // device_commands
  const deviceCommands = db.collection('device_commands');
  await deviceCommands.createIndex({ screenId: 1, status: 1, expiresAt: 1 });
  // TTL for device commands. Defaults to 30 days (2592000 seconds).
  await deviceCommands.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

  // emergency_events
  const emergencyEvents = db.collection('emergency_events');
  await emergencyEvents.createIndex({ isActive: 1, expiresAt: 1 });

  // pairing_sessions
  const pairingSessions = db.collection('pairing_sessions');
  await pairingSessions.createIndex({ pairingCode: 1 }, { unique: true });
  await pairingSessions.createIndex({ expiresAtDate: 1 }, { expireAfterSeconds: 0 });

  // admin_sessions
  const adminSessions = db.collection('admin_sessions');
  await adminSessions.createIndex({ expiresAtDate: 1 }, { expireAfterSeconds: 0 });

  // audit_logs
  const auditLogs = db.collection('audit_logs');
  await auditLogs.createIndex({ timestamp: -1 });
  await auditLogs.createIndex({ action: 1 });

  // departments
  const departments = db.collection('departments');
  await departments.createIndex({ code: 1 }, { unique: true });

  // devices
  const devices = db.collection('devices');
  await devices.createIndex({ deviceToken: 1 }, { unique: true });
}
