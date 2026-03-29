import express from 'express';
import { addIncome, getIncomes } from '../controllers/incomes.controller.js';
import { verifyToken, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// Hamma route'larni token bilan himoyalaymiz
router.use(verifyToken);

// Kirimlarni ko'rish
router.get('/', getIncomes);

// Yangi kirim qo'shish (Faqat Admin va Menejer huquqiga ega)
router.post('/', requireRole(['ADMIN', 'MANAGER']), addIncome);

export default router;