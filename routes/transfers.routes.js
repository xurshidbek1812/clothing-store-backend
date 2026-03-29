import express from 'express';
import { makeTransfer, getTransfers } from '../controllers/transfers.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(verifyToken);
router.post('/', makeTransfer);
router.get('/', getTransfers);

export default router;