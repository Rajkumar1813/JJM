import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pairingService } from '../services/pairingService';
import rateLimit from 'express-rate-limit';

const router = Router();

const pairingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: { success: false, message: 'Too many pairing requests, please try again later.' }
});

const pairSessionSchema = z.object({
  socketId: z.string().optional(),
  deviceMetadata: z.any().optional(),
});

router.post('/session', pairingLimiter, async (req: Request, res: Response) => {
  const parsed = pairSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { socketId, deviceMetadata } = parsed.data;
  try {
    const session = await pairingService.createPairingSession(socketId, deviceMetadata);
    return res.json({ success: true, session });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/session/:code', pairingLimiter, async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const { secret } = req.query;
    
    if (!secret || typeof secret !== 'string') {
      return res.status(401).json({ success: false, message: 'Missing or invalid secret' });
    }

    const session = await pairingService.getSession(code);
    if (!session || session.pollSecret !== secret) {
      return res.status(404).json({ success: false, message: 'Invalid pairing code or secret' });
    }

    if (session.status === 'paired' && session.screenId && session.deviceToken) {
      // Clear token/screen so we don't serve it again
      const result = {
        success: true,
        status: session.status,
        screenId: session.screenId,
        deviceToken: session.deviceToken,
        config: await import('../services/resolverService').then(m => m.resolverService.resolveScreenConfig(session.screenId!))
      };
      
      await import('../db/repositories/miscRepositories').then(m => m.pairingRepo.save({
        ...session,
        screenId: undefined,
        deviceToken: undefined
      }));
      
      return res.json(result);
    }

    return res.json({ success: true, status: session.status });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
