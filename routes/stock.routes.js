import express from 'express';
import {
  stockInFromSupplier,
  getStockBalances,
  getStockMovements,
} from '../controllers/stock.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/balances', getStockBalances);
router.get('/movements', getStockMovements);

router.post('/supplier-in', isDirector, stockInFromSupplier);

export default router;