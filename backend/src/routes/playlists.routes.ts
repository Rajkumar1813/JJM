import { configPublisher } from '../services/configPublisher';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { playlistRepo } from '../db/repositories/miscRepositories';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

const playlistItemSchema = z.object({
  type: z.enum(['image', 'video', 'announcement', 'queue']),
  duration: z.number().int().min(1),
  mediaId: z.string().optional(),
  mediaUrl: z.string().optional(),
  id: z.string().optional().default(''),
  title: z.string().optional().default(''),
  order: z.number().optional().default(0),
});

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  items: z.array(playlistItemSchema).optional(),
  isDefault: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

router.get('/', async (req: Request, res: Response) => {
  const playlists = await playlistRepo.getAll();
  return res.json({ success: true, playlists });
});

router.get('/:id', async (req: Request, res: Response) => {
  const playlist = await playlistRepo.getById(req.params.id);
  if (!playlist) {
    return res.status(404).json({ success: false, message: 'Playlist not found' });
  }
  return res.json({ success: true, playlist });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const playlist = await playlistRepo.create({
    name: parsed.data.name,
    description: parsed.data.description || '',
    items: parsed.data.items || [],
    isDefault: !!parsed.data.isDefault,
  });

  await auditRepo.log('CREATE_PLAYLIST', 'Playlist', playlist.id, `Created playlist ${playlist.name}`);
  return res.status(201).json({ success: true, playlist });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const playlist = await playlistRepo.update(req.params.id, parsed.data);
  if (!playlist) {
    return res.status(404).json({ success: false, message: 'Playlist not found' });
  }
  await auditRepo.log('UPDATE_PLAYLIST', 'Playlist', playlist.id, `Updated playlist ${playlist.name}`);
  await configPublisher.publish({ all: true });
  return res.json({ success: true, playlist });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const success = await playlistRepo.delete(req.params.id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'Playlist not found' });
  }
  await auditRepo.log('DELETE_PLAYLIST', 'Playlist', req.params.id, `Deleted playlist ${req.params.id}`);
  await configPublisher.publish({ all: true });
  return res.json({ success: true, message: 'Playlist deleted successfully' });
});

export default router;
