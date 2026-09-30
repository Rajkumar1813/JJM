import { Router, Request, Response } from 'express';
import { pool } from '../db/mysql';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any>('SELECT * FROM settings');
    const settings = rows.reduce((acc: any, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const settings = req.body;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const [key, value] of Object.entries(settings)) {
        let strValue = typeof value === 'string' ? value : JSON.stringify(value);
        await connection.query(
          'INSERT INTO settings (`key`, value, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()',
          [key, strValue]
        );
      }
      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
    
    await auditRepo.log('UPDATE_SETTINGS', 'System', 'GLOBAL', 'Updated platform settings');
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
