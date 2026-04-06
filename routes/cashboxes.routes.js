import express from 'express';
import {
  createCashbox,
  getCashboxes,
  getCashboxTransactions,
  createExpenseFromCashbox,
  transferBetweenCashboxes,
} from '../controllers/cashboxes.controller.js';
import {
  verifyToken,
  requireRole,
  resolveStoreAccess,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getCashboxes);
router.get('/:cashboxId/transactions', getCashboxTransactions);

router.post('/', requireRole(['DIRECTOR']), createCashbox);
router.post('/expense', requireRole(['DIRECTOR']), createExpenseFromCashbox);
router.post('/transfer', requireRole(['DIRECTOR']), transferBetweenCashboxes);

export default router;