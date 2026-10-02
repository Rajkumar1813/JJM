import { configPublisher } from '../services/configPublisher';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import * as fileType from 'file-type';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

const UPLOADS_DIR = process.env.UPLOAD_DIR 
  ? path.join(process.env.UPLOAD_DIR, 'media')
  : path.join(__dirname, '../../uploads/media');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer 2.x uses memory storage by default when no storage is provided
const upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

const uploadSchema = z.object({
  title: z.string().optional(),
  duration: z.string().optional(),
  tags: z.any().optional(),
  category: z.string().optional(),
  customUrl: z.string().optional(),
  text: z.string().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const media = await mediaRepo.getAll();
  const manifestVersion = await mediaRepo.getManifestVersion();
  return res.json({ success: true, media, manifestVersion });
});

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: parsed.error.format() });
  }

  const { title, duration, tags, category, customUrl } = parsed.data;

  let mediaUrl = customUrl;
  let mediaType: 'image' | 'video' | 'announcement' = 'image';
  let size = 0;
  let sha256Hash = 'unhashed';

  if (file && file.buffer) {
    // Validate by magic bytes
    const typeInfo = await fileType.fromBuffer(file.buffer);
    if (!typeInfo) {
      return res.status(400).json({ success: false, message: 'Could not determine file type' });
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    if (!allowedMimes.includes(typeInfo.mime)) {
      return res.status(400).json({ success: false, message: `Unsupported file type: ${typeInfo.mime}` });
    }

    // Sanitize filename
    const originalExt = path.extname(file.originalname);
    const basename = path.basename(file.originalname, originalExt).replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${basename}_${Date.now()}.${typeInfo.ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Write file to disk
    fs.writeFileSync(filePath, file.buffer);

    mediaUrl = `/uploads/media/${filename}`;
    mediaType = typeInfo.mime.startsWith('video') ? 'video' : 'image';
    size = file.buffer.length;
    sha256Hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  } else if (customUrl) {
    // Detect type from custom url
    const ext = path.extname(customUrl).toLowerCase();
    mediaType = ext === '.mp4' || ext === '.webm' ? 'video' : 'image';
  }

  if (!mediaUrl && !req.body.text) {
    return res.status(400).json({ success: false, message: 'File or Media URL is required' });
  }

  const media = await mediaRepo.create({
    title: title || (file ? file.originalname : 'Media Item'),
    type: mediaType,
    url: mediaUrl || '',
    sha256Hash,
    fileSize: size,
    duration: duration ? parseInt(duration, 10) : 15,
    tags: tags ? (Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((t: string) => t.trim()) : []) : [],
    category: category || 'General',
  });

  await auditRepo.log('UPLOAD_MEDIA', 'Media', media.id, `Uploaded ${media.title} (SHA-256: ${sha256Hash.substring(0, 8)}...)`);
  return res.status(201).json({ success: true, media, manifestVersion: await mediaRepo.getManifestVersion() });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const media = await mediaRepo.getById(req.params.id);
  if (!media) {
    return res.status(404).json({ success: false, message: 'Media not found' });
  }

  const force = req.query.force === 'true';
  const result = await mediaRepo.delete(req.params.id, force);

  if (!result.success && result.usage) {
    return res.status(409).json({
      success: false,
      message: 'Media is in use',
      usage: result.usage
    });
  }

  if (media.url && media.url.startsWith('/uploads/media/')) {
    const filename = path.basename(media.url);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }
  }

  await auditRepo.log('DELETE_MEDIA', 'Media', req.params.id, `Deleted media ${media.title}`);
  await configPublisher.publish({ all: true });
  return res.json({ success: true, message: 'Media item deleted', manifestVersion: await mediaRepo.getManifestVersion() });
});

export default router;
