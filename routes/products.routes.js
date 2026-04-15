import express from 'express';
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  addVariantToProduct,
  getAvailableBatches,
  searchProductsForSupplierIn,
  uploadProductImage,
  deleteProductImage,
} from '../controllers/products.controller.js';
import {
  verifyToken,
  resolveStoreAccess,
  requireRole,
} from '../middleware/auth.middleware.js';
import { productImageUpload } from '../middleware/upload.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(resolveStoreAccess);

router.get('/', getProducts);
router.get('/search', searchProductsForSupplierIn);
router.get('/available-batches', getAvailableBatches);
router.get('/:productId', getProductById);

router.post('/', requireRole(['DIRECTOR']), createProduct);
router.put('/:productId', requireRole(['DIRECTOR']), updateProduct);
router.post('/:productId/variants', requireRole(['DIRECTOR']), addVariantToProduct);

router.post(
  '/:productId/image',
  requireRole(['DIRECTOR']),
  productImageUpload.single('image'),
  uploadProductImage
);

router.delete(
  '/:productId/image',
  requireRole(['DIRECTOR']),
  deleteProductImage
);

export default router;