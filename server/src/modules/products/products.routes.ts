import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
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
} from './products.controller';

const router = Router();

router.use(requireAuth);

// Categories
router.get('/categories', requirePerm('products.view'), listCategories);
router.post('/categories', requirePerm('products.create'), createCategory);
router.put('/categories/:id', requirePerm('products.update'), updateCategory);
router.delete('/categories/:id', requirePerm('products.delete'), deleteCategory);

// Products
router.get('/', requirePerm('products.view'), listProducts);
router.get('/:id', requirePerm('products.view'), getProduct);
router.post('/', requirePerm('products.create'), createProduct);
router.put('/:id', requirePerm('products.update'), updateProduct);
router.delete('/:id', requirePerm('products.delete'), deleteProduct);

export default router;
