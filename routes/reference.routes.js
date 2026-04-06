import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  getSizes,
  createSize,
  updateSize,
  getCurrencies,
  createCurrency,
  updateCurrency,
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
} from '../controllers/reference.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

// storega bog'liq bo'lganlar
router.get('/categories', resolveStoreAccess, getCategories);
router.post('/categories', resolveStoreAccess, isDirector, createCategory);
router.put('/categories/:categoryId', resolveStoreAccess, isDirector, updateCategory);

router.get('/expense-categories', resolveStoreAccess, getExpenseCategories);
router.post('/expense-categories', resolveStoreAccess, isDirector, createExpenseCategory);
router.put('/expense-categories/:expenseCategoryId', resolveStoreAccess, isDirector, updateExpenseCategory);

// sizes va currencies global bo'lishi mumkin
router.get('/sizes', getSizes);
router.post('/sizes', isDirector, createSize);
router.put('/sizes/:sizeId', isDirector, updateSize);

router.get('/currencies', getCurrencies);
router.post('/currencies', isDirector, createCurrency);
router.put('/currencies/:currencyId', isDirector, updateCurrency);

export default router;