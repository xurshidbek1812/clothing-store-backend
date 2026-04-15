import express from 'express';
import {
  createStore,
  getStores,
  getStoreById,
  updateStore,
} from '../controllers/stores.controller.js';
import {
  verifyToken,
  isDirector,
} from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getStores);
router.get('/:storeId', getStoreById);

router.post('/', isDirector, createStore);
router.put('/:storeId', isDirector, updateStore);

export default router;