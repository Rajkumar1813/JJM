const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../data/hospital_signage.db');
const jsonPath = path.resolve(__dirname, '../../data/db.json');

console.log('=== DATABASE VERIFICATION SCRIPT (FRESH PRODUCTION STATE) ===');
console.log('Database file path:', dbPath);

// Ensure the schema is initialized if running standalone
const { initDatabaseSchema, sqlite } = require('../db/sqlite');
initDatabaseSchema();

console.log('Database exists:', fs.existsSync(dbPath));

const db = new Database(dbPath);

// 1. Pragmas
const pragmaFK = db.pragma('foreign_keys', { simple: true });
const pragmaJournal = db.pragma('journal_mode', { simple: true });
console.log('\n--- PRAGMAS ---');
console.log('foreign_keys:', pragmaFK);
console.log('journal_mode:', pragmaJournal);

// 2. Tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('\n--- TABLES CREATED ---');
console.log(tables.map(t => t.name));

// 3. Verify Legacy JSON is ABSENT
console.log('\n--- LEGACY JSON CHECK ---');
if (fs.existsSync(jsonPath)) {
  console.error('ERROR: Legacy db.json still exists at', jsonPath);
} else {
  console.log('SUCCESS: No legacy db.json file present. SQLite is the sole authoritative store.');
}

// 4. Verify ZERO Data Counts for Fresh Production State
console.log('\n--- RECORD COUNTS (FRESH PRODUCTION STATE) ---');
const dataTables = [
  'screens',
  'departments',
  'campaigns',
  'campaign_targets',
  'playlists',
  'media',
  'devices',
  'pairing_sessions',
  'device_commands',
  'emergency_events',
  'audit_logs'
];

let allZero = true;
dataTables.forEach(tbl => {
  try {
    const row = db.prepare(`SELECT count(*) as c FROM ${tbl}`).get();
    console.log(`${tbl}: ${row.c}`);
    if (row.c !== 0) {
      allZero = false;
      console.warn(`WARNING: Table ${tbl} has non-zero records: ${row.c}`);
    }
  } catch (e) {
    console.error(`${tbl}: ERROR (${e.message})`);
    allZero = false;
  }
});

const systemVersions = db.prepare(`SELECT * FROM system_versions`).all();
console.log('\nSystem Versions (Internal Sequence Counters):');
console.log(JSON.stringify(systemVersions, null, 2));

console.log('\nFresh Production Zero State Check:', allZero ? 'PASSED (All 0)' : 'FAILED');

db.close();
