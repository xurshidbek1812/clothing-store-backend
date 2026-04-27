import express from 'express';
import {
  searchSellableProducts,
  createCashSale,
  createCreditSale,
} from '../controllers/sales.controller.js';
import {
  getSalesHistory,
  getSaleById,
} from '../controllers/salesHistory.controller.js';
import {
  getSaleReturns,
  createSaleReturn,
} from '../controllers/saleReturns.controller.js';
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
  '/returns',
  requireRole(['DIRECTOR', 'SELLER']),
  getSaleReturns
);

router.post(
  '/returns',
  requireRole(['DIRECTOR', 'SELLER']),
  createSaleReturn
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

router.post(
  '/credit',
  requireRole(['DIRECTOR', 'SELLER']),
  createCreditSale
);

export default router;