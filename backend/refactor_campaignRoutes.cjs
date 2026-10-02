const fs = require('fs');

let content = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\routes\\campaigns.routes.ts', 'utf8');

// 1. Add getDb import
if (!content.includes('getDb')) {
  content = content.replace("import { getIO } from '../realtime/socket';", "import { getIO } from '../realtime/socket';\nimport { getDb } from '../db/mongo';");
}

// 2. Replace zod schemas
const newSchemas = `const campaignStatusEnum = z.enum(['active', 'scheduled', 'paused', 'expired', 'draft']);
const campaignTypeEnum = z.enum(['global', 'department', 'screen', 'emergency']);
const contentTypeEnum = z.enum(['playlist', 'single_image', 'single_image_only', 'image', 'video', 'single_video', 'single_video_only', 'only_queue']);

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  type: campaignTypeEnum.optional(),
  contentType: contentTypeEnum.optional(),
  targetIds: z.array(z.string()).optional(),
  mediaId: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  playlistId: z.string().nullable().optional(),
  priority: z.union([z.string(), z.number()]).optional(),
  intervalMinutes: z.union([z.string(), z.number()]).optional(),
  displayDurationSeconds: z.union([z.string(), z.number()]).optional(),
  daysOfWeek: z.array(z.number()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: campaignStatusEnum.optional(),
});`;

content = content.replace(
  /const createCampaignSchema = z\.object\(\{[\s\S]*?\}\);/,
  newSchemas
);

// 3. Add target validation to POST /
const targetValidationStr = `
  const targetIds = Array.isArray(data.targetIds) && data.targetIds.length > 0 ? data.targetIds : ['all'];
  for (const t of targetIds) {
    if (t === 'all') continue;
    if (t.startsWith('DEP-')) {
      const dept = await getDb().collection('departments').findOne({ _id: t as any });
      if (!dept) return res.status(400).json({ success: false, message: \`Unknown department ID: \${t}\` });
    } else if (t.startsWith('SCR-')) {
      const screen = await getDb().collection('screens').findOne({ _id: t as any });
      if (!screen) return res.status(400).json({ success: false, message: \`Unknown screen ID: \${t}\` });
    } else {
      return res.status(400).json({ success: false, message: \`Invalid target ID format: \${t}\` });
    }
  }
`;

content = content.replace(
  '  const data = parsed.data;',
  '  const data = parsed.data;\n' + targetValidationStr
);

// And also replace it in PATCH /:id
content = content.replace(
  '  const updateData = parsed.data as any;',
  `  const updateData = parsed.data as any;
  if (updateData.targetIds) {
    const patchTargetIds = Array.isArray(updateData.targetIds) && updateData.targetIds.length > 0 ? updateData.targetIds : ['all'];
    for (const t of patchTargetIds) {
      if (t === 'all') continue;
      if (t.startsWith('DEP-')) {
        const dept = await getDb().collection('departments').findOne({ _id: t as any });
        if (!dept) return res.status(400).json({ success: false, message: \`Unknown department ID: \${t}\` });
      } else if (t.startsWith('SCR-')) {
        const screen = await getDb().collection('screens').findOne({ _id: t as any });
        if (!screen) return res.status(400).json({ success: false, message: \`Unknown screen ID: \${t}\` });
      } else {
        return res.status(400).json({ success: false, message: \`Invalid target ID format: \${t}\` });
      }
    }
  }
`
);

fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\backend\\src\\routes\\campaigns.routes.ts', content);
