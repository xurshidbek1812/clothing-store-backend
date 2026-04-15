import fs from 'fs';
import path from 'path';
import multer from 'multer';

const uploadDir = path.join(process.cwd(), 'uploads', 'products');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext || '.jpg';
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (!allowed.includes(file.mimetype)) {
    cb(new Error('Faqat jpg, png yoki webp rasm yuklash mumkin'));
    return;
  }

  cb(null, true);
};

export const productImageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});