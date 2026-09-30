import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  floor: z.string().optional(),
  description: z.string().optional(),
  defaultQueueUrl: z.string().url().optional(),
  defaultPlaylistId: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const departments = await departmentRepo.getAll();
  return res.json({ success: true, departments });
});

router.get('/:id', async (req: Request, res: Response) => {
  const department = await departmentRepo.getById(req.params.id);
  if (!department) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }
  return res.json({ success: true, department });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const department = await departmentRepo.create({
    name: parsed.data.name,
    code: parsed.data.code,
    floor: parsed.data.floor || 'Ground Floor',
    description: parsed.data.description || '',
    defaultQueueUrl: parsed.data.defaultQueueUrl || 'https://hms.jjmhospitalkashipur.com/qd',
    defaultPlaylistId: parsed.data.defaultPlaylistId,
    status: 'active',
  });

  await auditRepo.log('CREATE_DEPARTMENT', 'Department', department.id, `Created department ${department.name}`);
  return res.status(201).json({ success: true, department });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const department = await departmentRepo.update(req.params.id, parsed.data);
  if (!department) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }
  await auditRepo.log('UPDATE_DEPARTMENT', 'Department', department.id, `Updated department ${department.name}`);
  return res.json({ success: true, department });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const success = await departmentRepo.delete(req.params.id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }
  await auditRepo.log('DELETE_DEPARTMENT', 'Department', req.params.id, `Deleted department ${req.params.id}`);
  return res.json({ success: true, message: 'Department deleted successfully' });
});

export default router;
