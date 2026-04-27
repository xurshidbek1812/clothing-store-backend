import express from 'express';
import {
  getCashboxTransferOptions,
  getCashboxTransfers,
  createCashboxTransfer,
  updateCashboxTransfer,
  approveCashboxTransfer,
  rejectCashboxTransfer,
} from '../controllers/cashboxTransfers.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/options', getCashboxTransferOptions);
router.get('/', getCashboxTransfers);

router.post('/', isDirector, createCashboxTransfer);
router.put('/:transferId', isDirector, updateCashboxTransfer);
router.post('/:transferId/approve', isDirector, approveCashboxTransfer);
router.post('/:transferId/reject', isDirector, rejectCashboxTransfer);

export default router;