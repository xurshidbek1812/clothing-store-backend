import express from 'express';
import {
  createWarehouse,
  getWarehouses,
} from '../controllers/warehouses.controller.js';
import {
  verifyToken,
  requireRole,
  resolveStoreAccess,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getWarehouses);
router.post('/', requireRole(['DIRECTOR']), createWarehouse);

export default router;