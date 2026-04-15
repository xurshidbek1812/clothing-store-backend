import express from 'express';
import {
  getSupplierBalances,
  getSupplierLedger,
  createSupplierPayment,
} from '../controllers/supplierPayments.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/balances', isDirector, getSupplierBalances);
router.get('/ledger/:supplierId', isDirector, getSupplierLedger);
router.post('/pay', isDirector, createSupplierPayment);

export default router;