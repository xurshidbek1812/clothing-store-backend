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
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getCashboxes);
router.get('/:cashboxId/transactions', getCashboxTransactions);

router.post('/', isDirector, createCashbox);
router.post('/expense', isDirector, createExpenseFromCashbox);
router.post('/transfer', isDirector, transferBetweenCashboxes);

export default router;