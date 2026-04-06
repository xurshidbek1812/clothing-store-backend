import express from 'express';
import {
  createSupplier,
  getSuppliers,
} from '../controllers/suppliers.controller.js';
import {
  verifyToken,
  requireRole,
  resolveStoreAccess,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getSuppliers);
router.post('/', requireRole(['DIRECTOR']), createSupplier);

export default router;