import express from 'express';
import {
  stockInFromSupplier,
  getStockBalances,
  getStockMovements,
  getWarehouseTransferOptions,
  createWarehouseTransfer,
  getWarehouseTransfers,
  approveWarehouseTransfer,
  rejectWarehouseTransfer,
  getSupplierReturnOptions,
  createSupplierReturn,
  getSupplierReturns,
  approveSupplierReturn,
  rejectSupplierReturn,
  updateSupplierReturn
} from '../controllers/stock.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/balances', getStockBalances);
router.get('/movements', getStockMovements);

router.get('/warehouse-transfer-options', getWarehouseTransferOptions);
router.get('/warehouse-transfers', getWarehouseTransfers);

router.post('/supplier-in', isDirector, stockInFromSupplier);
router.post('/warehouse-transfers', isDirector, createWarehouseTransfer);
router.post('/warehouse-transfers/:transferId/approve', isDirector, approveWarehouseTransfer);
router.post('/warehouse-transfers/:transferId/reject', isDirector, rejectWarehouseTransfer);

router.get('/supplier-return-options', getSupplierReturnOptions);
router.get('/supplier-returns', getSupplierReturns);

router.post('/supplier-returns', isDirector, createSupplierReturn);
router.post('/supplier-returns/:supplierReturnId/approve', isDirector, approveSupplierReturn);
router.post('/supplier-returns/:supplierReturnId/reject', isDirector, rejectSupplierReturn);
router.put('/supplier-returns/:supplierReturnId', updateSupplierReturn);

export default router;