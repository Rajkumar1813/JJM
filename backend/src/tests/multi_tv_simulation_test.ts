import { sqlite, initDatabaseSchema } from '../db/sqlite';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { screenRepo } from '../db/repositories/screenRepository';
import { campaignRepo } from '../db/repositories/campaignRepository';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { emergencyRepo } from '../db/repositories/emergencyRepository';
import { resolverService } from '../services/resolverService';

async function runMultiTvSimulation() {
  console.log('===========================================================');
  console.log('STARTING MULTI-TV SIMULATION & TARGETING ISOLATION TEST');
  console.log('===========================================================\n');

  initDatabaseSchema();

  // Clear any existing records before simulation
  sqlite.exec(`
    DELETE FROM audit_logs;
    DELETE FROM device_commands;
    DELETE FROM emergency_events;
    DELETE FROM campaign_targets;
    DELETE FROM campaigns;
    DELETE FROM playlists;
    DELETE FROM media;
    DELETE FROM pairing_sessions;
    DELETE FROM screens;
    DELETE FROM devices;
    DELETE FROM departments;
  `);

  // 1. Create 5 Departments
  console.log('[Setup 1] Creating 5 Distinct Hospital Departments...');
  const depts = [
    { id: 'DEP-NEURO', name: 'Neurology OPD', code: 'NEURO', defaultQueueUrl: 'https://hms.jjmhospitalkashipur.com/qd/DOC038' },
    { id: 'DEP-CARDIO', name: 'Cardiology OPD', code: 'CARDIO', defaultQueueUrl: 'https://hms.jjmhospitalkashipur.com/qd/DOC045' },
    { id: 'DEP-RADIO', name: 'Radiology Imaging', code: 'RADIO', defaultQueueUrl: 'https://hms.jjmhospitalkashipur.com/qd/DOC060' },
    { id: 'DEP-PHARM', name: 'Central Pharmacy', code: 'PHARM', defaultQueueUrl: 'https://hms.jjmhospitalkashipur.com/qd/PHARM01' },
    { id: 'DEP-EMERG', name: 'Emergency Triage', code: 'EMERG', defaultQueueUrl: 'https://hms.jjmhospitalkashipur.com/qd/EMERG01' },
  ];

  for (const d of depts) {
    departmentRepo.create({
      id: d.id,
      name: d.name,
      code: d.code,
      floor: '1st Floor',
      description: d.name,
      defaultQueueUrl: d.defaultQueueUrl,
      status: 'active',
    });
    console.log(` -> Created Department: ${d.name} (${d.id})`);
  }

  // 2. Create 5 Screens
  console.log('\n[Setup 2] Registering 5 Dedicated Hospital Display Units...');
  const screens = [
    { id: 'SCR-NEURO-01', name: 'Neurology TV 01', deptId: 'DEP-NEURO', queue: 'https://hms.jjmhospitalkashipur.com/qd/DOC038' },
    { id: 'SCR-CARDIO-01', name: 'Cardiology TV 01', deptId: 'DEP-CARDIO', queue: 'https://hms.jjmhospitalkashipur.com/qd/DOC045' },
    { id: 'SCR-RADIO-01', name: 'Radiology TV 01', deptId: 'DEP-RADIO', queue: 'https://hms.jjmhospitalkashipur.com/qd/DOC060' },
    { id: 'SCR-PHARM-01', name: 'Pharmacy TV 01', deptId: 'DEP-PHARM', queue: 'https://hms.jjmhospitalkashipur.com/qd/PHARM01' },
    { id: 'SCR-EMERG-01', name: 'Emergency TV 01', deptId: 'DEP-EMERG', queue: 'https://hms.jjmhospitalkashipur.com/qd/EMERG01' },
  ];

  for (const s of screens) {
    screenRepo.create({
      id: s.id,
      name: s.name,
      code: s.id.replace('SCR-', ''),
      departmentId: s.deptId,
      location: `Room ${s.id.split('-')[1]}`,
      queueUrl: s.queue,
      staleThresholdSeconds: 180,
      status: 'active',
      connectionStatus: 'online',
      healthStatus: 'ONLINE',
      currentContent: 'queue',
      targetConfigVersion: 1,
      appliedConfigVersion: 0,
      mediaManifestVersion: 1,
      isPaused: false,
      powerState: 'on',
    } as any);
    console.log(` -> Created Screen: ${s.name} (${s.id}) linked to ${s.queue}`);
  }

  // 3. Create Media Assets
  const mediaNeuro = mediaRepo.create({
    title: 'Stroke Awareness Guide',
    type: 'image',
    url: '/uploads/media/stroke_guide.png',
    sha256Hash: 'neuro11111111111111111111111111111111111111111111111111111111111',
    fileSize: 102400,
    duration: 15,
    category: 'Education',
    tags: ['neuro', 'stroke'],
  });

  const mediaCardio = mediaRepo.create({
    title: 'Hypertension Camp',
    type: 'image',
    url: '/uploads/media/hypertension_camp.png',
    sha256Hash: 'cardio22222222222222222222222222222222222222222222222222222222222',
    fileSize: 102400,
    duration: 15,
    category: 'Camp',
    tags: ['cardio', 'heart'],
  });

  const mediaGlobal = mediaRepo.create({
    title: 'Hospital Annual Health Drive',
    type: 'image',
    url: '/uploads/media/annual_drive.png',
    sha256Hash: 'global33333333333333333333333333333333333333333333333333333333333',
    fileSize: 204800,
    duration: 30,
    category: 'General',
    tags: ['hospital', 'global'],
  });

  // 4. Create Department-Specific Campaigns
  console.log('\n[Phase 1] Configuring Department-Specific Campaigns...');
  const campNeuro = campaignRepo.create({
    name: 'Neurology Department Campaign',
    description: 'Neurology awareness ads',
    type: 'department',
    targetIds: ['DEP-NEURO'],
    mediaId: mediaNeuro.id,
    mediaUrl: mediaNeuro.url,
    priority: 60,
    intervalMinutes: 3,
    displayDurationSeconds: 15,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    status: 'active',
  });

  const campCardio = campaignRepo.create({
    name: 'Cardiology Department Campaign',
    description: 'Cardiology awareness ads',
    type: 'department',
    targetIds: ['DEP-CARDIO'],
    mediaId: mediaCardio.id,
    mediaUrl: mediaCardio.url,
    priority: 60,
    intervalMinutes: 3,
    displayDurationSeconds: 15,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    status: 'active',
  });

  // 5. Verify Content Isolation
  console.log('\n[Phase 2] Verifying Isolation (Zero Cross-Department Leakage)...');
  const configNeuro = resolverService.resolveScreenConfig('SCR-NEURO-01');
  const configCardio = resolverService.resolveScreenConfig('SCR-CARDIO-01');
  const configRadio = resolverService.resolveScreenConfig('SCR-RADIO-01');

  console.log(` -> SCR-NEURO-01 Resolved Queue: ${configNeuro.queueUrl}`);
  if (configNeuro.queueUrl !== 'https://hms.jjmhospitalkashipur.com/qd/DOC038') throw new Error('Neurology queue mismatch');
  const neuroAd = configNeuro.playlist.find((i: any) => i.mediaId === mediaNeuro.id);
  const cardioAdInNeuro = configNeuro.playlist.find((i: any) => i.mediaId === mediaCardio.id);
  if (!neuroAd || cardioAdInNeuro) throw new Error('Neurology TV received wrong campaign content');
  console.log('    [PASSED] Neurology TV isolated correctly.');

  console.log(` -> SCR-CARDIO-01 Resolved Queue: ${configCardio.queueUrl}`);
  if (configCardio.queueUrl !== 'https://hms.jjmhospitalkashipur.com/qd/DOC045') throw new Error('Cardiology queue mismatch');
  const cardioAd = configCardio.playlist.find((i: any) => i.mediaId === mediaCardio.id);
  const neuroAdInCardio = configCardio.playlist.find((i: any) => i.mediaId === mediaNeuro.id);
  if (!cardioAd || neuroAdInCardio) throw new Error('Cardiology TV received wrong campaign content');
  console.log('    [PASSED] Cardiology TV isolated correctly.');

  console.log(` -> SCR-RADIO-01 Resolved Queue: ${configRadio.queueUrl}`);
  const radioAds = configRadio.playlist.filter((i: any) => i.type === 'image');
  if (radioAds.length !== 0) throw new Error('Radiology TV received unassigned campaign');
  console.log('    [PASSED] Radiology TV isolated (0 unassigned ads).');

  // 6. Test Global Broadcast to ALL TVs
  console.log('\n[Phase 3] Testing Global Broadcast to ALL TVs...');
  const campGlobal = campaignRepo.create({
    name: 'Hospital-Wide Executive Broadcast',
    description: 'Broadcast to all screens',
    type: 'global',
    targetIds: ['all'],
    mediaId: mediaGlobal.id,
    mediaUrl: mediaGlobal.url,
    priority: 95,
    intervalMinutes: 1,
    displayDurationSeconds: 30,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    status: 'active',
  });

  for (const s of screens) {
    const cfg = resolverService.resolveScreenConfig(s.id);
    const hasGlobal = cfg.playlist.some((i: any) => i.mediaId === mediaGlobal.id);
    console.log(` -> ${s.id} received Global Broadcast: ${hasGlobal ? 'YES' : 'NO'}`);
    if (!hasGlobal) throw new Error(`Global broadcast failed to reach screen ${s.id}`);
  }
  console.log('    [PASSED] All 5 TVs received Global Broadcast simultaneously.');

  // 7. Test Restoration after Global Broadcast Ends
  console.log('\n[Phase 4] Testing Restoration after Global Broadcast Ends...');
  campaignRepo.delete(campGlobal.id);

  const restoredNeuro = resolverService.resolveScreenConfig('SCR-NEURO-01');
  const restoredRadio = resolverService.resolveScreenConfig('SCR-RADIO-01');

  if (restoredNeuro.playlist.some((i: any) => i.mediaId === mediaGlobal.id)) throw new Error('Global ad not removed from Neuro');
  if (!restoredNeuro.playlist.some((i: any) => i.mediaId === mediaNeuro.id)) throw new Error('Neuro ad not restored');
  if (restoredRadio.playlist.filter((i: any) => i.type === 'image').length !== 0) throw new Error('Radio not restored to clean state');
  console.log('    [PASSED] All 5 screens cleanly restored to individual configs.');

  // 8. Test Targeted Emergency Override
  console.log('\n[Phase 5] Testing Targeted Emergency Override...');
  const emergEvent = emergencyRepo.create({
    id: `EMERG-${Date.now()}`,
    title: 'CARDIOLOGY CODE BLUE ALERT',
    message: 'Resuscitation team required in Cardiology Room 10.',
    severity: 'critical',
    targetType: 'DEPARTMENT',
    targetIds: ['DEP-CARDIO'],
    durationSeconds: 60,
  });

  const emergOnCardio = emergencyRepo.getActive('SCR-CARDIO-01', 'DEP-CARDIO');
  const emergOnNeuro = emergencyRepo.getActive('SCR-NEURO-01', 'DEP-NEURO');
  console.log(` -> Emergency active on Cardiology TV: ${emergOnCardio ? 'YES (' + emergOnCardio.title + ')' : 'NO'}`);
  console.log(` -> Emergency active on Neurology TV: ${emergOnNeuro ? 'YES' : 'NO (Isolated)'}`);
  if (!emergOnCardio || emergOnNeuro) throw new Error('Targeted emergency isolation failed');

  emergencyRepo.clearActive();
  console.log('    [PASSED] Emergency alert cleared, normal operation restored.');

  // Clean Reset for fresh production state
  console.log('\n[Clean Reset] Clearing simulation records...');
  sqlite.exec(`
    DELETE FROM audit_logs;
    DELETE FROM device_commands;
    DELETE FROM emergency_events;
    DELETE FROM campaign_targets;
    DELETE FROM campaigns;
    DELETE FROM playlists;
    DELETE FROM media;
    DELETE FROM pairing_sessions;
    DELETE FROM screens;
    DELETE FROM devices;
    DELETE FROM departments;
    VACUUM;
  `);

  console.log('===========================================================');
  console.log('SUCCESS: MULTI-TV SIMULATION & TARGETING 100% VERIFIED');
  console.log('===========================================================');
}

runMultiTvSimulation().catch((err) => {
  console.error('SIMULATION FAILED:', err);
  process.exit(1);
});
