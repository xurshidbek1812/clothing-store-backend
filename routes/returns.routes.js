import express from 'express';
import {
  createSaleReturn,
  getSaleReturns,
  getSaleReturnById,
} from '../controllers/returns.controller.js';
import {
  verifyToken,
  requireRole,
  resolveStoreAccess,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getSaleReturns);
router.get('/:returnId', getSaleReturnById);
router.post('/', requireRole(['DIRECTOR', 'SELLER']), createSaleReturn);

export default router;