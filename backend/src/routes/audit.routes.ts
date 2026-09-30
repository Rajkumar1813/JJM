import { Router, Request, Response } from 'express';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const logs = auditRepo.getAll(limit);
  return res.json({ success: true, auditLogs: logs });
});

export default router;
