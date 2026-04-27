import express from 'express';
import {
  getInterStoreTransferOptions,
  createInterStoreTransfer,
  updateInterStoreTransfer,
  getOutgoingInterStoreTransfers,
  getIncomingInterStoreTransfers,
  sendInterStoreTransfer,
  receiveInterStoreTransfer,
  rejectIncomingInterStoreTransfer,
} from '../controllers/interStoreTransfers.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/options', getInterStoreTransferOptions);

router.get('/outgoing', getOutgoingInterStoreTransfers);
router.get('/incoming', getIncomingInterStoreTransfers);

router.post('/', isDirector, createInterStoreTransfer);
router.put('/:transferId', isDirector, updateInterStoreTransfer);

router.post('/:transferId/send', isDirector, sendInterStoreTransfer);
router.post('/:transferId/receive', isDirector, receiveInterStoreTransfer);
router.post('/:transferId/reject', isDirector, rejectIncomingInterStoreTransfer);

export default router;