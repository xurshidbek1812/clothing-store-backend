import express from 'express';
import {
  getCashboxes,
  createCashbox,
  updateCashbox,
  getCurrencies,
} from '../controllers/cashboxes.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  requireRole,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

router.get(
  '/currencies',
  requireRole(['DIRECTOR', 'SELLER']),
  getCurrencies
);

router.use(resolveStoreAccess);

router.get(
  '/',
  requireRole(['DIRECTOR', 'SELLER']),
  getCashboxes
);

router.post(
  '/',
  requireRole(['DIRECTOR']),
  createCashbox
);

router.put(
  '/:cashboxId',
  requireRole(['DIRECTOR']),
  updateCashbox
);

export default router;