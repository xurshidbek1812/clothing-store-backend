import express from 'express';
import {
  createSupplier,
  getSuppliers,
  updateSupplier,
} from '../controllers/suppliers.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getSuppliers);
router.post('/', isDirector, createSupplier);
router.put('/:supplierId', isDirector, updateSupplier);

export default router;