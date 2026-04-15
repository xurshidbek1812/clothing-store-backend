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
  getCurrencies,
  createCurrency,
  updateCurrency,
} from '../controllers/reference.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

// storega bog'liq
router.get('/categories', resolveStoreAccess, getCategories);
router.post('/categories', resolveStoreAccess, isDirector, createCategory);
router.put('/categories/:categoryId', resolveStoreAccess, isDirector, updateCategory);

router.get('/expense-categories', resolveStoreAccess, getExpenseCategories);
router.post('/expense-categories', resolveStoreAccess, isDirector, createExpenseCategory);
router.put('/expense-categories/:expenseCategoryId', resolveStoreAccess, isDirector, updateExpenseCategory);

// global
router.get('/sizes', getSizes);
router.post('/sizes', isDirector, createSize);
router.put('/sizes/:sizeId', isDirector, updateSize);

router.get('/currencies', getCurrencies);
router.post('/currencies', isDirector, createCurrency);
router.put('/currencies/:currencyId', isDirector, updateCurrency);

export default router;