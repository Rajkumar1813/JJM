import { Router, Request, Response } from 'express';
import { playlistRepo } from '../db/repositories/miscRepositories';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const playlists = playlistRepo.getAll();
  return res.json({ success: true, playlists });
});

router.get('/:id', (req: Request, res: Response) => {
  const playlist = playlistRepo.getById(req.params.id);
  if (!playlist) {
    return res.status(404).json({ success: false, message: 'Playlist not found' });
  }
  return res.json({ success: true, playlist });
});

router.post('/', (req: Request, res: Response) => {
  const { name, description, items, isDefault } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: 'Playlist name is required' });
  }

  const playlist = playlistRepo.create({
    name,
    description: description || '',
    items: items || [],
    isDefault: !!isDefault,
  });

  auditRepo.log('CREATE_PLAYLIST', 'Playlist', playlist.id, `Created playlist ${playlist.name}`);
  return res.status(201).json({ success: true, playlist });
});

router.patch('/:id', (req: Request, res: Response) => {
  const playlist = playlistRepo.update(req.params.id, req.body);
  if (!playlist) {
    return res.status(404).json({ success: false, message: 'Playlist not found' });
  }
  auditRepo.log('UPDATE_PLAYLIST', 'Playlist', playlist.id, `Updated playlist ${playlist.name}`);
  return res.json({ success: true, playlist });
});

router.delete('/:id', (req: Request, res: Response) => {
  const success = playlistRepo.delete(req.params.id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'Playlist not found' });
  }
  auditRepo.log('DELETE_PLAYLIST', 'Playlist', req.params.id, `Deleted playlist ${req.params.id}`);
  return res.json({ success: true, message: 'Playlist deleted successfully' });
});

export default router;
