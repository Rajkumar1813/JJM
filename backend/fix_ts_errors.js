const fs = require('fs');

// 1. campaignRepository.ts
let campRepo = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\db\\repositories\\campaignRepository.ts', 'utf8');
campRepo = campRepo.replace('if (isCampaignActiveInTime(c, now))', 'if (isCampaignActiveInTime(c as any, now))');
fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\db\\repositories\\campaignRepository.ts', campRepo);

// 2. playlists.routes.ts
let plRoutes = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\routes\\playlists.routes.ts', 'utf8');
plRoutes = plRoutes.replace(
  "name: z.string().optional(),",
  "id: z.string().optional(),\n  title: z.string().optional(),\n  order: z.number().optional(),"
);
fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\routes\\playlists.routes.ts', plRoutes);

// 3. resolverService.ts
let resSvc = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\services\\resolverService.ts', 'utf8');
resSvc = resSvc.replace('private async getGlobalSettings', 'public async getGlobalSettings');
fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\services\\resolverService.ts', resSvc);

// 4. pairingService.ts
let pairSvc = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\services\\pairingService.ts', 'utf8');
// Fix undefined return for PairingSession | null
pairSvc = pairSvc.replace(/return undefined;/g, 'return null;');
fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\services\\pairingService.ts', pairSvc);

// 5. time_logic.test.ts
let timeTest = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\tests\\time_logic.test.ts', 'utf8');
timeTest = timeTest.replace(/status: 'active'/g, "status: 'active' as any");
fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\tests\\time_logic.test.ts', timeTest);

console.log('Fixed TS errors');
