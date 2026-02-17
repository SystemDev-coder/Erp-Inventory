import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import { uploadProductImage as uploadProductImageMiddleware } from '../../config/cloudinary';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadProductImage,
  deleteProductImage,
} from './products.controller';

const router = Router();

router.use(requireAuth);

// Categories
router.get('/categories', requirePerm('items.view'), listCategories);
router.post('/categories', requirePerm('items.create'), createCategory);
router.put('/categories/:id', requirePerm('items.update'), updateCategory);
router.delete('/categories/:id', requirePerm('items.delete'), deleteCategory);

// Products
router.get('/', requirePerm('items.view'), listProducts);
router.get('/:id', requirePerm('items.view'), getProduct);
router.post('/', requirePerm('items.create'), createProduct);
router.put('/:id', requirePerm('items.update'), updateProduct);
router.delete('/:id', requirePerm('items.delete'), deleteProduct);

// Product Image Upload
router.post(
  '/:id/image',
  requirePerm('items.update'),
  uploadProductImageMiddleware.single('image'),
  uploadProductImage
);
router.delete('/:id/image', requirePerm('items.update'), deleteProductImage);

export default router;
