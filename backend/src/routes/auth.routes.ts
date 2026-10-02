import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb } from '../db/mongo';
import { requireAdminAuth, requireSuperAdminAuth } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' }
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { email, password, pin } = req.body;
  if (!email || !password || !pin) {
    return res.status(401).json({ success: false, message: 'Invalid credentials or PIN' });
  }

  const user = await getDb().collection('admin_users').findOne({ email, isActive: true });
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials or PIN' });
  }

  const passMatch = await bcrypt.compare(password, user.passwordHash as string);
  const pinMatch = await bcrypt.compare(String(pin), user.pinHash as string);

  if (!passMatch || !pinMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials or PIN' });
  }

  await getDb().collection('admin_users').updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date() } }
  );

  const token = `ADM-${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const expiresAt = now.getTime() + 24 * 60 * 60 * 1000;
  
  await getDb().collection('admin_sessions').insertOne({
    tokenHash, 
    adminUserId: user._id, 
    ip: req.ip || 'unknown', 
    userAgent: req.headers['user-agent'] || '', 
    createdAt: now, 
    expiresAt,
    expiresAtDate: new Date(expiresAt)
  });

  return res.json({ success: true, token, email: user.email, role: user.role });
});

router.post('/logout', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-admin-token'] as string);
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await getDb().collection('admin_sessions').deleteOne({ tokenHash });
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

  const passMatch = await bcrypt.compare(currentPassword, user.passwordHash as string);
  if (!passMatch) return res.status(401).json({ success: false, message: 'Incorrect current password' });

  const newHash = await bcrypt.hash(newPassword, 12);
  await getDb().collection('admin_users').updateOne(
    { _id: user.id as any },
    { $set: { passwordHash: newHash } }
  );
  
  return res.json({ success: true });
});

// Super Admin User CRUD
router.get('/users', requireSuperAdminAuth, async (req: Request, res: Response) => {
  const docs = await getDb().collection('admin_users').find().toArray();
  const users = docs.map((r: any) => ({
    id: r._id,
    email: r.email,
    role: r.role,
    is_active: r.isActive,
    created_at: r.createdAt,
    last_login_at: r.lastLoginAt
  }));
  res.json({ success: true, users });
});

router.post('/users', requireSuperAdminAuth, async (req: Request, res: Response) => {
  const { email, password, pin, role } = req.body;
  if (!email || !password || !pin) return res.status(400).json({ success: false, message: 'Missing fields' });

  const existing = await getDb().collection('admin_users').findOne({ email });
  if (existing) return res.status(409).json({ success: false, message: 'Email already exists' });

  const passwordHash = await bcrypt.hash(password, 12);
  const pinHash = await bcrypt.hash(String(pin), 12);
  const id = 'ADM-' + crypto.randomUUID();

  await getDb().collection('admin_users').insertOne({
    _id: id as any,
    email,
    passwordHash,
    pinHash,
    role: role || 'editor',
    isActive: true,
    createdAt: new Date()
  });

  res.json({ success: true, id });
});

router.patch('/users/:id/disable', requireSuperAdminAuth, async (req: Request, res: Response) => {
  await getDb().collection('admin_users').updateOne(
    { _id: req.params.id as any },
    { $set: { isActive: false } }
  );
  res.json({ success: true });
});

export default router;
