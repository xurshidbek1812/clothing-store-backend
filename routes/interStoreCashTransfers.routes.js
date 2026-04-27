import express from 'express';
import {
  getInterStoreCashTransferOptions,
  getOutgoingInterStoreCashTransfers,
  getIncomingInterStoreCashTransfers,
  createInterStoreCashTransfer,
  updateInterStoreCashTransfer,
  sendInterStoreCashTransfer,
  receiveInterStoreCashTransfer,
  rejectIncomingInterStoreCashTransfer,
} from '../controllers/interStoreCashTransfers.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/options', getInterStoreCashTransferOptions);
router.get('/outgoing', getOutgoingInterStoreCashTransfers);
router.get('/incoming', getIncomingInterStoreCashTransfers);

router.post('/', isDirector, createInterStoreCashTransfer);
router.put('/:transferId', isDirector, updateInterStoreCashTransfer);
router.post('/:transferId/send', isDirector, sendInterStoreCashTransfer);
router.post('/:transferId/receive', isDirector, receiveInterStoreCashTransfer);
router.post('/:transferId/reject', isDirector, rejectIncomingInterStoreCashTransfer);

export default router;