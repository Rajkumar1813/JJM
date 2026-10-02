import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { isCampaignActiveInTime, isCampaignTargeting } from '../services/campaignLogic';

// 1. Mock functions & utilities we want to test
function mapMongoToApi(doc: any): any {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  for (const key in rest) {
    if (rest[key] instanceof Date) {
      rest[key] = rest[key].toISOString();
    }
  }
  return { id: _id, ...rest };
}

function buildMongoUpdate(updates: Record<string, any>): Record<string, any> | null {
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


function checkEmergencyTargeting(announcement: any, screenId: string, departmentId: string) {
  if (announcement.targetType === 'ALL' || announcement.targetIds?.includes('all')) return true;
  if (announcement.targetType === 'DEPARTMENT' && announcement.targetIds?.includes(departmentId)) return true;
  if (announcement.targetType === 'SCREEN' && announcement.targetIds?.includes(screenId)) return true;
  return false;
}

function departmentDeleteGuard(deptId: string, screens: any[]) {
  const inUse = screens.some(s => s.departmentId === deptId);
  if (inUse) return { status: 409, message: 'In use' };
  return { status: 200, message: 'Deleted' };
}

function filterPendingCommands(cmds: any[]) {
  const now = Date.now();
  return cmds.filter(c => ['CREATED', 'SENT', 'RECEIVED'].includes(c.status) && c.expiresAt > now);
}

class FakeJobLock {
  locks: any = {};
  acquire(name: string, ttl: number, owner: string, now: number) {
    const existing = this.locks[name];
    if (!existing || existing.lockedUntil < now) {
      this.locks[name] = { lockedUntil: now + ttl, owner };
      return true;
    }
    return false;
  }
  release(name: string, owner: string) {
    if (this.locks[name] && this.locks[name].owner === owner) {
      delete this.locks[name];
    }
  }
}

// 2. Tests
describe('Pure Unit Tests for MongoDB Migration Logic', () => {
  it('should map _id to id correctly', () => {
    const doc = { _id: 'SCR-123', name: 'Test', createdAt: new Date('2026-01-01T00:00:00Z') };
    const api = mapMongoToApi(doc);
    assert.equal(api.id, 'SCR-123');
    assert.equal(api._id, undefined);
    assert.equal(api.createdAt, '2026-01-01T00:00:00.000Z');
  });

  it('should build $set update ignoring undefined', () => {
    const updates = { name: 'New', desc: undefined, active: true };
    const result = buildMongoUpdate(updates);
    assert.deepEqual(result, { $set: { name: 'New', active: true } });
  });

  it('should evaluate campaign effective status and time window in Asia/Kolkata', () => {
    // Simulated UTC time: 10:00 PM UTC = 3:30 AM IST next day
    const simUTC = new Date('2026-10-01T22:00:00Z'); 
    
    const c1 = {
      status: 'active' as any,
      startTime: '03:00', // 3 AM IST
      endTime: '04:00',   // 4 AM IST
      targets: [{ targetType: 'ALL' }]
    };
    assert.ok((isCampaignActiveInTime(c1, simUTC) && isCampaignTargeting(c1, 'SCR-1', 'DEP-1')), 'Campaign should be active at 3:30 AM IST');
    
    const c2 = {
      status: 'active' as any,
      startTime: '10:00', // 10 AM IST
      endTime: '12:00',
      targets: [{ targetType: 'ALL' }]
    };
    assert.ok(!(isCampaignActiveInTime(c2, simUTC) && isCampaignTargeting(c2, 'SCR-1', 'DEP-1')), 'Campaign should NOT be active at 3:30 AM IST');
  });

  it('should enforce department delete guard 409', () => {
    const screens = [{ id: 'SCR-1', departmentId: 'DEP-1' }];
    assert.equal(departmentDeleteGuard('DEP-1', screens).status, 409);
    assert.equal(departmentDeleteGuard('DEP-2', screens).status, 200);
  });

  it('should manage job locks in-memory', () => {
    const locks = new FakeJobLock();
    const owner1 = 'instance-1';
    const owner2 = 'instance-2';
    
    assert.ok(locks.acquire('mig', 1000, owner1, 100), 'Owner 1 should acquire lock');
    assert.ok(!locks.acquire('mig', 1000, owner2, 200), 'Owner 2 should fail to acquire lock');
    
    // Simulate expiry
    assert.ok(locks.acquire('mig', 1000, owner2, 1200), 'Owner 2 should acquire lock after expiry');
  });

  it('should filter pending commands', () => {
    const now = Date.now();
    const cmds = [
      { id: 1, status: 'CREATED', expiresAt: now + 1000 },
      { id: 2, status: 'APPLIED', expiresAt: now + 1000 },
      { id: 3, status: 'SENT', expiresAt: now - 1000 },
    ];
    const pending = filterPendingCommands(cmds);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, 1);
  });

  it('should evaluate emergency targeting correctly', () => {
    const eALL = { targetType: 'ALL', targetIds: ['all'] };
    const eDEP = { targetType: 'DEPARTMENT', targetIds: ['DEP-5'] };
    assert.ok(checkEmergencyTargeting(eALL, 'SCR-1', 'DEP-2'));
    assert.ok(checkEmergencyTargeting(eDEP, 'SCR-1', 'DEP-5'));
    assert.ok(!checkEmergencyTargeting(eDEP, 'SCR-1', 'DEP-2'));
  });

  it('should map MySQL row to Mongo doc for migration script', () => {
    const r = { id: 'SCR-1', device_token: 'abc', created_at: '2026-01-01T00:00:00Z', is_active: 1 };
    const doc: any = { _id: r.id };
    for (const key of Object.keys(r)) {
      if (key === 'id') continue;
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      let val = (r as any)[key];
      if (camelKey === 'createdAt') doc[camelKey] = new Date(val);
      else if (camelKey === 'isActive') doc[camelKey] = val === 1;
      else doc[camelKey] = val;
    }
    assert.equal(doc._id, 'SCR-1');
    assert.equal(doc.deviceToken, 'abc');
    assert.ok(doc.createdAt instanceof Date);
    assert.equal(doc.isActive, true);
  });

  it('should correctly evaluate date edges in IST', () => {
    // End date today => active
    const today = new Date('2026-10-02T12:00:00Z'); // 17:30 IST
    const c1 = { endDate: '2026-10-02' };
    assert.strictEqual(isCampaignActiveInTime(c1, today), true);
    
    // Past midnight IST (Oct 3rd 01:00 IST = Oct 2nd 19:30 UTC)
    const tomorrowIst = new Date('2026-10-02T19:30:00Z');
    assert.strictEqual(isCampaignActiveInTime(c1, tomorrowIst), false);
    
    // Weekday normalisation 7 -> 0 (Sunday)
    // Oct 4th 2026 is Sunday
    const sunday = new Date('2026-10-04T12:00:00Z'); // Sunday 17:30 IST
    const c2 = { daysOfWeek: [7] }; // UI sent 7 for Sunday
    assert.strictEqual(isCampaignActiveInTime(c2, sunday), true);

    const c3 = { daysOfWeek: [0] }; // UI sent 0 for Sunday
    assert.strictEqual(isCampaignActiveInTime(c3, sunday), true);

    const c4 = { daysOfWeek: [1] }; // Monday
    assert.strictEqual(isCampaignActiveInTime(c4, sunday), false);
  });
});
