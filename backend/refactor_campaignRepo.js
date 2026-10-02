const fs = require('fs');

let content = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\db\\repositories\\campaignRepository.ts', 'utf8');

// 1. Add import
if (!content.includes('isCampaignActiveInTime')) {
  content = content.replace(
    "import { getDb } from '../mongo';",
    "import { getDb } from '../mongo';\nimport { isCampaignActiveInTime } from '../../services/campaignLogic';"
  );
}

// 2. Replace getActiveForScreen
content = content.replace(
  /public async getActiveForScreen[\s\S]*?return matching;\n  }/,
  `public async getActiveForScreen(screenId: string, departmentId: string): Promise<Campaign[]> {
    const matching: Campaign[] = [];

    // Query active campaigns targeting ALL, this department, or this screen
    const rows = await this.col.find({
      status: 'active',
      $or: [
        { 'targets.targetType': 'ALL' },
        { 'targets.targetId': 'all' },
        { 'targets.targetType': 'DEPARTMENT', 'targets.targetId': departmentId },
        { 'targets.targetType': 'SCREEN', 'targets.targetId': screenId }
      ]
    }).sort({ priority: -1, createdAt: -1 }).toArray();

    const now = new Date();
    for (const c of rows) {
      if (isCampaignActiveInTime(c, now)) {
        matching.push(this.mapRow(c));
      }
    }

    return matching;
  }`
);

fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\db\\repositories\\campaignRepository.ts', content);
console.log('campaignRepository updated');
