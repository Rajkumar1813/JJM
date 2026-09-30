import { Router, Request, Response } from 'express';
import { departmentRepo } from '../db/repositories/departmentRepository';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const departments = departmentRepo.getAll();
  return res.json({ success: true, departments });
});

router.get('/:id', (req: Request, res: Response) => {
  const department = departmentRepo.getById(req.params.id);
  if (!department) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }
  return res.json({ success: true, department });
});

router.post('/', (req: Request, res: Response) => {
  const { name, code, floor, description, defaultQueueUrl, defaultPlaylistId } = req.body;
  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Name and Code are required' });
  }

  const department = departmentRepo.create({
    name,
    code,
    floor: floor || 'Ground Floor',
    description: description || '',
    defaultQueueUrl: defaultQueueUrl || 'https://hms.jjmhospitalkashipur.com/qd',
    defaultPlaylistId,
    status: 'active',
  });

  auditRepo.log('CREATE_DEPARTMENT', 'Department', department.id, `Created department ${department.name}`);
  return res.status(201).json({ success: true, department });
});

router.patch('/:id', (req: Request, res: Response) => {
  const department = departmentRepo.update(req.params.id, req.body);
  if (!department) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }
  auditRepo.log('UPDATE_DEPARTMENT', 'Department', department.id, `Updated department ${department.name}`);
  return res.json({ success: true, department });
});

router.delete('/:id', (req: Request, res: Response) => {
  const success = departmentRepo.delete(req.params.id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'Department not found' });
  }
  auditRepo.log('DELETE_DEPARTMENT', 'Department', req.params.id, `Deleted department ${req.params.id}`);
  return res.json({ success: true, message: 'Department deleted successfully' });
});

export default router;
