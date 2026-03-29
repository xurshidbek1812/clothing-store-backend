import express from 'express';
import { createSale, getSales } from '../controllers/sales.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(verifyToken);

router.post('/', createSale);
router.get('/', getSales);

export default router;