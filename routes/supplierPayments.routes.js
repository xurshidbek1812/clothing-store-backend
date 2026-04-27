import express from 'express';
import {
  getSupplierBalances,
  getSupplierLedgerHistory,
  createSupplierPayment,
} from '../controllers/supplierPayments.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  requireRole,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get(
  '/balances',
  requireRole(['DIRECTOR', 'SELLER']),
  getSupplierBalances
);

router.get(
  '/:supplierId/history',
  requireRole(['DIRECTOR', 'SELLER']),
  getSupplierLedgerHistory
);

router.post(
  '/',
  requireRole(['DIRECTOR']),
  createSupplierPayment
);

export default router;