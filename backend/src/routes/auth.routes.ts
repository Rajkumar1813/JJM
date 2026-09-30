import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, queryOne } from '../db/mysql';
import { requireAdminAuth, requireSuperAdminAuth } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' }
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { email, password, pin } = req.body;
  if (!email || !password || !pin) {
    return res.status(401).json({ success: false, message: 'Invalid credentials or PIN' });
  }

  const user = await queryOne<any>('SELECT * FROM admin_users WHERE email = ? AND is_active = 1', [email]);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials or PIN' });
  }

  const passMatch = await bcrypt.compare(password, user.password_hash);
  const pinMatch = await bcrypt.compare(String(pin), user.pin_hash);

  if (!passMatch || !pinMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials or PIN' });
  }

  await query('UPDATE admin_users SET last_login_at = ? WHERE id = ?', [new Date(), user.id]);

  const token = `ADM-${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const expiresAt = now.getTime() + 24 * 60 * 60 * 1000;
  
  await query('INSERT INTO admin_sessions (token_hash, admin_user_id, ip, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', [
    tokenHash, user.id, req.ip || 'unknown', req.headers['user-agent'] || '', now, expiresAt
  ]);

  return res.json({ success: true, token, email: user.email, role: user.role });
});

router.post('/logout', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-admin-token'] as string);
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]);
  }
  return res.json({ success: true });
});

router.get('/me', requireAdminAuth, (req: Request, res: Response) => {
  const user = (req as any).adminUser;
  return res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
});

router.post('/change-password', requireAdminAuth, async (req: Request, res: Response) => {
  const user = (req as any).adminUser;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Missing fields' });

  const passMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!passMatch) return res.status(401).json({ success: false, message: 'Incorrect current password' });

  const newHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
  
  return res.json({ success: true });
});

// Super Admin User CRUD
router.get('/users', requireSuperAdminAuth, async (req: Request, res: Response) => {
  const users = await query('SELECT id, email, role, is_active, created_at, last_login_at FROM admin_users');
  res.json({ success: true, users });
});

router.post('/users', requireSuperAdminAuth, async (req: Request, res: Response) => {
  const { email, password, pin, role } = req.body;
  if (!email || !password || !pin) return res.status(400).json({ success: false, message: 'Missing fields' });

  const existing = await queryOne('SELECT id FROM admin_users WHERE email = ?', [email]);
  if (existing) return res.status(409).json({ success: false, message: 'Email already exists' });

  const passwordHash = await bcrypt.hash(password, 12);
  const pinHash = await bcrypt.hash(String(pin), 12);
  const id = 'ADM-' + crypto.randomUUID();

  await query(`
    INSERT INTO admin_users (id, email, password_hash, pin_hash, role, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `, [id, email, passwordHash, pinHash, role || 'editor', new Date()]);

  res.json({ success: true, id });
});

router.patch('/users/:id/disable', requireSuperAdminAuth, async (req: Request, res: Response) => {
  await query('UPDATE admin_users SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
