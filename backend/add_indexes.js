const fs = require('fs');
const content = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\db\\migrate.ts', 'utf8');
const ensureIndexesStr = `
async function ensureIndexes(db: import('mongodb').Db) {
  Logger.info('[Migrations] Ensuring indexes...');
  await db.collection('screen_snapshots').createIndex({ screenId: 1 }, { unique: true });
  await db.collection('device_commands').createIndex({ screenId: 1, createdAt: -1 });
  await db.collection('media').createIndex({ createdAt: -1 });
  
  // P1-6 requirements: unique department/screen codes
  await db.collection('departments').createIndex({ code: 1 }, { unique: true });
  await db.collection('screens').createIndex({ code: 1 }, { unique: true });
}
`;
fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\db\\migrate.ts', content + ensureIndexesStr);
