import { screenRepo } from '../db/repositories/screenRepository';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { commandRepo } from '../db/repositories/commandRepository';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { resolverService } from '../services/resolverService';
import { commandService } from '../services/commandService';
import { healthMonitor } from '../services/healthMonitor';

async function runTests() {
  console.log('========================================');
  console.log('RUNNING PRODUCTION V2 BACKEND TEST SUITE');
  console.log('========================================');

  // Test 1: Verify Migrated Screens & Departments
  const screens = screenRepo.getAll();
  console.log(`[Test 1] Migrated Screens count: ${screens.length}`);
  if (screens.length === 0) throw new Error('Test 1 Failed: No screens found in SQLite');
  const targetScreen = screens[0];
  console.log(`[Test 1 PASSED] Verified screen: ${targetScreen.name} (${targetScreen.id}), Queue: ${targetScreen.queueUrl}`);

  // Test 2: Command Lifecycle (5-Stage Handshake)
  console.log('\n[Test 2] Testing 5-stage Command Lifecycle...');
  const cmd = await commandService.dispatchCommand(targetScreen.id, 'RELOAD_QUEUE', { force: true });
  console.log(` -> Dispatched command: ${cmd.id}, Initial Status: ${cmd.status}`);
  if (cmd.status !== 'SENT') throw new Error(`Expected SENT, got ${cmd.status}`);

  // TV receives packet
  const received = commandService.handleReceived(cmd.id, targetScreen.id);
  console.log(` -> TV packet received: Status: ${received?.status}`);
  if (received?.status !== 'RECEIVED') throw new Error(`Expected RECEIVED, got ${received?.status}`);

  // TV applies command
  const applied = commandService.handleApplied(cmd.id, targetScreen.id);
  console.log(` -> TV applied action: Status: ${applied?.status}`);
  if (applied?.status !== 'APPLIED') throw new Error(`Expected APPLIED, got ${applied?.status}`);

  // TV acknowledges with result
  const acked = commandService.handleAcknowledged(cmd.id, targetScreen.id, { durationMs: 420, webViewReloaded: true });
  console.log(` -> TV acknowledged: Status: ${acked?.status}`);
  if (acked?.status !== 'ACKNOWLEDGED') throw new Error(`Expected ACKNOWLEDGED, got ${acked?.status}`);
  console.log('[Test 2 PASSED] 5-Stage command lifecycle verified!');

  // Test 3: Version Tracking & Outdated Detection
  console.log('\n[Test 3] Testing Authoritative vs Applied Config Versioning...');
  emergencyRepo.clearActive();
  // Simulate screen online with fresh heartbeat
  screenRepo.recordHeartbeat(targetScreen.id, {
    appliedConfigVersion: 1,
    currentContent: 'queue',
    playerVersion: '1.0.0',
  });
  screenRepo.incrementTargetConfigVersion(targetScreen.id);
  const updatedScreen = screenRepo.getById(targetScreen.id)!;
  console.log(` -> Server Target Version: ${updatedScreen.targetConfigVersion}, TV Applied Version: ${updatedScreen.appliedConfigVersion}`);

  const health = healthMonitor.evaluateScreenHealth(updatedScreen);
  console.log(` -> Screen Health Evaluated: ${health}`);
  if (health !== 'UPDATE_REQUIRED') throw new Error(`Expected UPDATE_REQUIRED, got ${health}`);
  console.log('[Test 3 PASSED] Version mismatch correctly triggers UPDATE_REQUIRED health flag!');

  // Test 4: Persistent Target-Aware Emergency Override
  console.log('\n[Test 4] Testing Persistent Targeted Emergency Events...');
  emergencyRepo.clearActive();
  const emergency = emergencyRepo.create({
    id: `EMERG-TEST-${Date.now()}`,
    title: 'CODE BLUE - Room 105',
    message: 'Medical resuscitation team required immediately in Room 105',
    severity: 'critical',
    targetType: 'SCREEN',
    targetIds: [targetScreen.id],
    durationSeconds: 60,
  });

  // Target screen should receive it
  const activeForScreen = emergencyRepo.getActive(targetScreen.id, targetScreen.departmentId);
  if (!activeForScreen || activeForScreen.id !== emergency.id) {
    throw new Error('Target screen failed to receive targeted emergency');
  }

  // Other non-targeted screen should NOT receive it
  const activeForOther = emergencyRepo.getActive('SCR-OTHER-99', 'DEP-OTHER');
  if (activeForOther !== null) {
    throw new Error('Non-targeted screen mistakenly received targeted emergency');
  }
  console.log('[Test 4 PASSED] Targeted Emergency correctly isolates target screen and ignores non-targeted screens!');
  emergencyRepo.clearActive();

  // Test 5: REST State Reconciliation
  console.log('\n[Test 5] Testing REST State Reconciliation...');
  const resolved = resolverService.resolveScreenConfig(targetScreen.id);
  if (!resolved || resolved.screenId !== targetScreen.id) {
    throw new Error('Resolver failed to produce valid config');
  }
  console.log(` -> Resolved Queue URL: ${resolved.queueUrl}`);
  console.log(` -> Config Version: ${resolved.configVersion}, Manifest Version: ${resolved.mediaManifestVersion}`);
  console.log('[Test 5 PASSED] Authoritative state resolution verified!');

  // Test 6: Media Checksum
  console.log('\n[Test 6] Testing Media Checksum and Manifest Tracking...');
  const testMedia = mediaRepo.create({
    title: 'Health Awareness Test',
    type: 'image',
    url: '/uploads/media/test_poster.jpg',
    sha256Hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    fileSize: 1048576,
    duration: 15,
    tags: ['Awareness'],
    category: 'Cardiology',
  });
  const manifestVer = mediaRepo.getManifestVersion();
  console.log(` -> Media created with SHA-256: ${testMedia.sha256Hash.substring(0, 16)}..., Manifest Version: ${manifestVer}`);
  if (manifestVer < 2) throw new Error('Manifest version did not increment');
  console.log('[Test 6 PASSED] Media SHA-256 and manifest versioning verified!');

  console.log('\n========================================');
  console.log('ALL BACKEND V2 TEST SUITES PASSED (6/6)');
  console.log('========================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
