import express from 'express';
import {
  getDashboardSummary,
  getTopSellingProducts,
  getRecentSales,
} from '../controllers/dashboard.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/summary', getDashboardSummary);
router.get('/top-products', getTopSellingProducts);
router.get('/recent-sales', getRecentSales);

export default router;