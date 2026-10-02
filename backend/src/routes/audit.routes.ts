import { Router, Request, Response } from 'express';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
  
  const result = await auditRepo.getAll({
    limit,
    offset,
    action: req.query.action as string,
    entity: req.query.entity as string,
    from: req.query.from as string,
    to: req.query.to as string,
    search: req.query.search as string,
  });
  
  return res.json({ success: true, auditLogs: result.data, total: result.total });
});

export default router;
