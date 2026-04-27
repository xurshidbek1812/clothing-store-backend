import express from 'express';
import {
  getCashExchangeOptions,
  getCashExchanges,
  createCashExchange,
  updateCashExchange,
  approveCashExchange,
  rejectCashExchange,
} from '../controllers/cashExchanges.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/options', getCashExchangeOptions);
router.get('/', getCashExchanges);

router.post('/', isDirector, createCashExchange);
router.put('/:exchangeId', isDirector, updateCashExchange);
router.post('/:exchangeId/approve', isDirector, approveCashExchange);
router.post('/:exchangeId/reject', isDirector, rejectCashExchange);

export default router;