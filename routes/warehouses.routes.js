import express from 'express';
import {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
} from '../controllers/warehouses.controller.js';
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
  getWarehouses
);

router.post(
  '/',
  requireRole(['DIRECTOR']),
  createWarehouse
);

router.put(
  '/:warehouseId',
  requireRole(['DIRECTOR']),
  updateWarehouse
);

export default router;