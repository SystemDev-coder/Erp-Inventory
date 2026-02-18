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
  listUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  listTaxes,
  createTax,
  updateTax,
  deleteTax,
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

// Units
router.get('/units', requirePerm('items.view'), listUnits);
router.post('/units', requirePerm('items.create'), createUnit);
router.put('/units/:id', requirePerm('items.update'), updateUnit);
router.delete('/units/:id', requirePerm('items.delete'), deleteUnit);

// Taxes
router.get('/taxes', requirePerm('items.view'), listTaxes);
router.post('/taxes', requirePerm('items.create'), createTax);
router.put('/taxes/:id', requirePerm('items.update'), updateTax);
router.delete('/taxes/:id', requirePerm('items.delete'), deleteTax);

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
