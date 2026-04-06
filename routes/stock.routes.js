import express from 'express';
import {
  stockInFromSupplier,
  getStockBalances,
  getStockMovements,
  getAvailableBatches,
} from '../controllers/stock.controller.js';
import {
  verifyToken,
  requireRole,
  resolveStoreAccess,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/balances', getStockBalances);
router.get('/movements', getStockMovements);
router.get('/available-batches', getAvailableBatches);

router.post('/supplier-in', requireRole(['DIRECTOR']), stockInFromSupplier);

export default router;