import express from 'express';
import {
  getInventoryCountOptions,
  createInventoryCount,
  getInventoryCounts,
  getInventoryCountById,
} from '../controllers/inventory.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/options', getInventoryCountOptions);
router.get('/', getInventoryCounts);
router.get('/:inventoryCountId', getInventoryCountById);

router.post('/', isDirector, createInventoryCount);

export default router;