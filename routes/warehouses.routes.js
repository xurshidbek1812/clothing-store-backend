import express from 'express';
import {
  createWarehouse,
  getWarehouses,
  updateWarehouse,
} from '../controllers/warehouses.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getWarehouses);
router.post('/', isDirector, createWarehouse);
router.put('/:warehouseId', isDirector, updateWarehouse);

export default router;