import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { mediaRepo } from '../db/repositories/mediaRepository';
import { auditRepo } from '../db/repositories/miscRepositories';

const router = Router();

const UPLOADS_DIR = path.join(__dirname, '../../uploads/media');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${basename}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|mp4|webm/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WEBP, MP4, and WEBM formats are supported'));
    }
  },
});

// GET all media items with manifest version
router.get('/', (req: Request, res: Response) => {
  const media = mediaRepo.getAll();
  const manifestVersion = mediaRepo.getManifestVersion();
  return res.json({ success: true, media, manifestVersion });
});

// POST Upload media item with SHA-256 checksum calculation
router.post('/', upload.single('file'), (req: Request, res: Response) => {
  const file = req.file;
  const { title, duration, tags, category, customUrl } = req.body;

  let mediaUrl = customUrl;
  let mediaType: 'image' | 'video' | 'announcement' = 'image';
  let size = 0;
  let sha256Hash = 'unhashed';

  if (file) {
    mediaUrl = `/uploads/media/${file.filename}`;
    const ext = path.extname(file.originalname).toLowerCase();
    mediaType = ext === '.mp4' || ext === '.webm' ? 'video' : 'image';
    size = file.size;

    // Calculate SHA-256 Checksum
    try {
      const fileBuffer = fs.readFileSync(file.path);
      sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (_) {
      sha256Hash = 'hash_error_' + Date.now();
    }
  }

  if (!mediaUrl && !req.body.text) {
    return res.status(400).json({ success: false, message: 'File or Media URL is required' });
  }

  const media = mediaRepo.create({
    title: title || (file ? file.originalname : 'Media Item'),
    type: mediaType,
    url: mediaUrl,
    sha256Hash,
    fileSize: size,
    duration: duration ? parseInt(duration, 10) : 15,
    tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim())) : [],
    category: category || 'General',
  });

  auditRepo.log('UPLOAD_MEDIA', 'Media', media.id, `Uploaded ${media.title} (SHA-256: ${sha256Hash.substring(0, 8)}...)`);
  return res.status(201).json({ success: true, media, manifestVersion: mediaRepo.getManifestVersion() });
});

// DELETE Media item
router.delete('/:id', (req: Request, res: Response) => {
  const media = mediaRepo.getById(req.params.id);
  if (!media) {
    return res.status(404).json({ success: false, message: 'Media not found' });
  }

  // Remove physical file from disk
  if (media.url && media.url.startsWith('/uploads/media/')) {
    const filename = path.basename(media.url);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }
  }

  mediaRepo.delete(req.params.id);
  auditRepo.log('DELETE_MEDIA', 'Media', req.params.id, `Deleted media ${media.title}`);
  return res.json({ success: true, message: 'Media item deleted', manifestVersion: mediaRepo.getManifestVersion() });
});

export default router;
