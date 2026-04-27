import express from 'express';
import {
  getExpenseOptions,
  getExpenses,
  createExpense,
  updateExpense,
  approveExpense,
  rejectExpense,
} from '../controllers/expenses.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/options', getExpenseOptions);
router.get('/', getExpenses);

router.post('/', isDirector, createExpense);
router.put('/:expenseId', isDirector, updateExpense);
router.post('/:expenseId/approve', isDirector, approveExpense);
router.post('/:expenseId/reject', isDirector, rejectExpense);

export default router;