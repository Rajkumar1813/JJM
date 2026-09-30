import { Router, Request, Response } from 'express';
import { screenRepo } from '../db/repositories/screenRepository';
import { resolverService } from '../services/resolverService';
import { emergencyRepo } from '../db/repositories/emergencyRepository';

const router = Router();

router.get('/:screenId/config', async (req: Request, res: Response) => {
  try {
    const { screenId } = req.params;
    const { key } = req.query;

    if (!key || typeof key !== 'string') {
      return res.status(401).json({ success: false, message: 'Unauthorized. Display key required.' });
    }

    const screen = await screenRepo.getById(screenId);
    if (!screen || screen.displayKey !== key) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Invalid display key or screen not found.' });
    }

    const config = await resolverService.resolveScreenConfig(screenId);
    const activeEmergency = await emergencyRepo.getActive(screen.id, screen.departmentId);

    return res.json({ 
      success: true, 
      config: {
        ...config,
        activeEmergency
      } 
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
