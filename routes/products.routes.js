import express from 'express';
import { createProduct, getProducts } from '../controllers/products.controller.js';
import { verifyToken, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.get('/', getProducts);
router.post('/', requireRole(['ADMIN', 'MANAGER']), createProduct);

export default router;