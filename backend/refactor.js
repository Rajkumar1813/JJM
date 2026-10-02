const fs = require('fs');
const path = require('path');

function replaceLoops(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // The common pattern to replace
  // In some files it's a for loop iterating over screens and emitting.
  // Instead of complex regex, let's just do targeted string replacements or simpler regexes.
  
  // Pattern 1: (settings, scheduler, etc)
  // const screens = await screenRepo.getAll();
  // for (const s of screens) { ... }
  // getIO().emit('screens:changed');
  
  // We'll replace it entirely with: await configPublisher.publish({ all: true });
  // Since formatting varies, let's use a regex that matches from `const screens = await screenRepo.getAll();`
  // up to `getIO().emit('screens:changed');`
  
  content = content.replace(/const\s+screens\s*=\s*await\s+screenRepo\.getAll\(\);[\s\S]*?getIO\(\)\.emit\('screens:changed'\);/g, 'await configPublisher.publish({ all: true });');
  content = content.replace(/const\s+screens\s*=\s*await\s+screenRepo\.getAll\(\);[\s\S]*?getIO\(\)\.to\('admins'\)\.emit\('screens:changed'\);/g, 'await configPublisher.publish({ all: true });');

  // screens.routes.ts has specific updates
  // e.g. await screenRepo.incrementTargetConfigVersion(existing.id);
  // getIO().to(`screen:${existing.id}`).emit('config:update', { config, targetConfigVersion: newTargetVersion });
  // getIO().to('admins').emit('screens:changed');
  content = content.replace(/await\s+screenRepo\.incrementTargetConfigVersion\(([^)]+)\);[\s\S]*?getIO\(\)\.to\('admins'\)\.emit\('screens:changed'\);/g, 'await configPublisher.publish({ screenIds: [$1] });');

  if (content !== original) {
    if (!content.includes('configPublisher')) {
      content = "import { configPublisher } from '../services/configPublisher';\n" + content;
    }
    fs.writeFileSync(filePath, content);
  }
}

['src/routes/campaigns.routes.ts', 'src/routes/screens.routes.ts', 'src/routes/settings.routes.ts', 'src/routes/emergency.routes.ts', 'src/services/scheduler.ts'].forEach(f => replaceLoops(f));

// Now for missing publishers
// Playlists PATCH and DELETE
let pl = fs.readFileSync('src/routes/playlists.routes.ts', 'utf8');
if (!pl.includes('configPublisher')) {
  pl = "import { configPublisher } from '../services/configPublisher';\n" + pl;
  // PATCH: return res.json({ success: true, playlist });
  pl = pl.replace(/await auditRepo.log\('UPDATE_PLAYLIST'[^;]+;/g, "$&\n  await configPublisher.publish({ all: true });");
  // DELETE: return res.json({ success: true, message: 'Playlist deleted successfully' });
  pl = pl.replace(/await auditRepo.log\('DELETE_PLAYLIST'[^;]+;/g, "$&\n  await configPublisher.publish({ all: true });");
  fs.writeFileSync('src/routes/playlists.routes.ts', pl);
}

// Departments PATCH and DELETE
let dept = fs.readFileSync('src/routes/departments.routes.ts', 'utf8');
if (!dept.includes('configPublisher')) {
  dept = "import { configPublisher } from '../services/configPublisher';\n" + dept;
  dept = dept.replace(/await auditRepo.log\('UPDATE_DEPARTMENT'[^;]+;/g, "$&\n  await configPublisher.publish({ departmentId: department.id });");
  dept = dept.replace(/await auditRepo.log\('DELETE_DEPARTMENT'[^;]+;/g, "$&\n  await configPublisher.publish({ departmentId: req.params.id });");
  fs.writeFileSync('src/routes/departments.routes.ts', dept);
}

// Media DELETE (force)
let media = fs.readFileSync('src/routes/media.routes.ts', 'utf8');
if (!media.includes('configPublisher')) {
  media = "import { configPublisher } from '../services/configPublisher';\n" + media;
  media = media.replace(/await auditRepo.log\('DELETE_MEDIA'[^;]+;/g, "$&\n  await configPublisher.publish({ all: true });");
  fs.writeFileSync('src/routes/media.routes.ts', media);
}

console.log('Refactor complete');
