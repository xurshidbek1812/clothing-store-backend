import express from 'express';
import {
  searchSellableProducts,
  createCashSale,
} from '../controllers/sales.controller.js';
import {
  getSalesHistory,
  getSaleById,
} from '../controllers/salesHistory.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  requireRole,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get(
  '/search-products',
  requireRole(['DIRECTOR', 'SELLER']),
  searchSellableProducts
);

router.get(
  '/',
  requireRole(['DIRECTOR', 'SELLER']),
  getSalesHistory
);

router.get(
  '/:saleId',
  requireRole(['DIRECTOR', 'SELLER']),
  getSaleById
);

router.post(
  '/cash',
  requireRole(['DIRECTOR', 'SELLER']),
  createCashSale
);

export default router;