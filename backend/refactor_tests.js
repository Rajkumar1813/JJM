const fs = require('fs');

let content = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\tests\\time_logic.test.ts', 'utf8');

// Add imports
if (!content.includes('isCampaignActiveInTime')) {
  content = content.replace(
    "import crypto from 'crypto';",
    "import crypto from 'crypto';\nimport { isCampaignActiveInTime, isCampaignTargeting } from '../services/campaignLogic';"
  );
}

// Remove checkCampaignTargeting
content = content.replace(/function checkCampaignTargeting[\s\S]*?return isTargeted;\n}\n/, '');

// Replace checkCampaignTargeting usage
content = content.replace(
  /checkCampaignTargeting\(([^,]+), ([^,]+), ([^,]+), ([^)]+)\)/g,
  '(isCampaignActiveInTime($1, $4) && isCampaignTargeting($1, $2, $3))'
);

// We need to add tests for the date edges (midnight IST, weekday normalization 7 -> 0)
// Append them at the end of the file.
const extraTests = `
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
`;

// Insert the tests before the last closing brace
content = content.replace(/}\);\n*$/, extraTests + '});\n');

fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\tests\\time_logic.test.ts', content);
