import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb, withTransaction } from '../db/mongo';
import { auditRepo } from '../db/repositories/miscRepositories';
import { configPublisher } from '../services/configPublisher';

const router = Router();

const settingsSchema = z.object({
  hospitalName: z.string().optional(),
  hospitalBranch: z.string().optional(),
  supportPhone: z.string().optional(),
  heartbeatInterval: z.number().int().min(5).optional(),
  staleThreshold: z.number().int().min(1).optional(),
  defaultDuration: z.number().int().min(1).optional(),
  timezone: z.string().optional(),
  kioskLock: z.boolean().optional(),
  soundAlerts: z.boolean().optional(),
  kioskPin: z.string().optional(),
}).strict();

router.get('/', async (req: Request, res: Response) => {
  try {
    const rows = await getDb().collection('settings').find().toArray();
    const settings = rows.reduce((acc: any, row: any) => {
      if (row._id !== 'kioskPinHash') {
        acc[row._id] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      }
      return acc;
    }, {});
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
    }

    const settings = parsed.data;
    const finalSettings: Record<string, any> = { ...settings };
    
    if (finalSettings.kioskPin) {
      const crypto = require('crypto');
      finalSettings.kioskPinHash = crypto.createHash('sha256').update(finalSettings.kioskPin).digest('hex');
      delete finalSettings.kioskPin;
    }

    await withTransaction(async (session) => {
      for (const [key, value] of Object.entries(finalSettings)) {
        let strValue = JSON.stringify(value);
        await getDb().collection('settings').updateOne(
          { _id: key as any },
          { $set: { value: strValue, updatedAt: new Date() } },
          { upsert: true, session }
        );
      }
    });
    
    await auditRepo.log('UPDATE_SETTINGS', 'System', 'GLOBAL', 'Updated platform settings');
    await configPublisher.publish({ all: true });

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
