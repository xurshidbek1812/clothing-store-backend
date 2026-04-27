import express from 'express';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  getCustomerBalances,
  getCustomerCreditHistory,
  createCreditPayment,
} from '../controllers/customers.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  requireRole,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get(
  '/',
  requireRole(['DIRECTOR', 'SELLER']),
  getCustomers
);

router.get(
  '/balances',
  requireRole(['DIRECTOR', 'SELLER']),
  getCustomerBalances
);

router.get(
  '/:customerId/history',
  requireRole(['DIRECTOR', 'SELLER']),
  getCustomerCreditHistory
);

router.post(
  '/',
  requireRole(['DIRECTOR', 'SELLER']),
  createCustomer
);

router.post(
  '/credit-payment',
  requireRole(['DIRECTOR', 'SELLER']),
  createCreditPayment
);

router.put(
  '/:customerId',
  requireRole(['DIRECTOR', 'SELLER']),
  updateCustomer
);

export default router;