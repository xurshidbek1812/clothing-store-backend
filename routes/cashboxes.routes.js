import express from 'express';
import { createCashbox, getCashboxes } from '../controllers/cashboxes.controller.js';
import { verifyToken, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// Hamma route'larni token bilan himoyalaymiz
router.use(verifyToken);

// Kassalarni ko'rish huquqi (Admin va Menejerda)
router.get('/', getCashboxes);

// Kassa yaratish huquqi faqat ADMIN'da bo'ladi (xavfsizlik uchun)
router.post('/', requireRole(['ADMIN']), createCashbox);

export default router;