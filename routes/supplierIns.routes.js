import express from 'express';
import {
  createSupplierIn,
  getSupplierIns,
  getSupplierInById,
  approveSupplierIn,
  rejectSupplierIn,
} from '../controllers/supplierIns.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  requireRole,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getSupplierIns);
router.get('/:supplierInId', getSupplierInById);

router.post('/', requireRole(['DIRECTOR', 'SELLER']), createSupplierIn);
router.post('/:supplierInId/approve', isDirector, approveSupplierIn);
router.post('/:supplierInId/reject', isDirector, rejectSupplierIn);

export default router;