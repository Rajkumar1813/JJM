import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne } from '../db/mysql';
import { Logger } from '../services/logger';
import { screenRepo } from '../db/repositories/screenRepository';

export const isValidAdminToken = async (token: string): Promise<any> => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = await queryOne<any>(`
    SELECT a.* FROM admin_sessions s
    JOIN admin_users a ON s.admin_user_id = a.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND a.is_active = 1
  `, [tokenHash, Date.now()]);
  return row || null;
};

export const requireAdminAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') return next();
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-admin-token'] as string);
  
  if (token) {
    const user = await isValidAdminToken(token);
    if (user) {
      (req as any).adminUser = user;
      // Sliding window logic could be here or done async
      return next();
    }
  }
  return res.status(401).json({ success: false, message: 'Unauthorized. Admin session required.' });
};

export const requireSuperAdminAuth = async (req: Request, res: Response, next: NextFunction) => {
  await requireAdminAuth(req, res, (err?: any) => {
    if (err) return next(err);
    const user = (req as any).adminUser;
    if (user && user.role === 'admin') {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Forbidden. Super admin required.' });
  });
};

export const requireDeviceAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') return next();
  const deviceToken = req.headers['x-device-token'] as string;
  const screenId = req.params.screenId;
  
  if (!deviceToken || !screenId) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Device token and screenId required.' });
  }

  const screen = await screenRepo.getById(screenId);
  if (!screen || !screen.deviceToken) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Screen not found or paired.' });
  }

  try {
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(deviceToken.padEnd(255)),
      Buffer.from(screen.deviceToken.padEnd(255))
    );
    if (isMatch && deviceToken === screen.deviceToken) {
      return next();
    }
  } catch (e) {
    // Length mismatch handling
    if (deviceToken === screen.deviceToken) {
      return next();
    }
  }
  
  return res.status(401).json({ success: false, message: 'Unauthorized. Invalid device token.' });
};
