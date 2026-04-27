import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  getSizes,
  createSize,
  updateSize,
  reorderSizes,
  getCurrencies,
  createCurrency,
  updateCurrency,
} from '../controllers/reference.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  requireRole,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/categories', getCategories);
router.post('/categories', requireRole(['DIRECTOR']), createCategory);
router.put('/categories/:categoryId', requireRole(['DIRECTOR']), updateCategory);

router.get('/expense-categories', getExpenseCategories);
router.post('/expense-categories', requireRole(['DIRECTOR']), createExpenseCategory);
router.put('/expense-categories/:expenseCategoryId', requireRole(['DIRECTOR']), updateExpenseCategory);

router.get('/sizes', getSizes);
router.post('/sizes', requireRole(['DIRECTOR']), createSize);
router.put('/sizes/:sizeId', requireRole(['DIRECTOR']), updateSize);
router.patch('/sizes/reorder', requireRole(['DIRECTOR']), reorderSizes);

router.get('/currencies', getCurrencies);
router.post('/currencies', requireRole(['DIRECTOR']), createCurrency);
router.put('/currencies/:currencyId', requireRole(['DIRECTOR']), updateCurrency);

export default router;