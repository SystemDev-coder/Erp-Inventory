import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import { uploadProductImage as uploadProductImageMiddleware } from '../../config/cloudinary';
import {
  listProducts,
  getProductsSummary,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  mergeProducts,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  seedDefaultCategories,
  listAttributeDefinitions,
  createAttributeDefinition,
  updateAttributeDefinition,
  deleteAttributeDefinition,
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
  getProductByBarcode,
  exportProducts,
  listProductVariants,
  addProductVariant,
  generateProductVariants,
} from './products.controller';

const router = Router();

router.use(requireAuth);

// Categories
router.get('/categories', requirePerm('items.view'), listCategories);
router.post('/categories', requirePerm('items.create'), createCategory);
router.post('/categories/seed-defaults', requirePerm('items.create'), seedDefaultCategories);
router.put('/categories/:id', requirePerm('items.update'), updateCategory);
router.delete('/categories/:id', requirePerm('items.delete'), deleteCategory);

// Attribute definitions (Category Configuration Engine)
router.get('/attributes', requirePerm('items.view'), listAttributeDefinitions);
router.post('/attributes', requirePerm('items.create'), createAttributeDefinition);
router.put('/attributes/:id', requirePerm('items.update'), updateAttributeDefinition);
router.delete('/attributes/:id', requirePerm('items.delete'), deleteAttributeDefinition);

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
router.get('/export', requirePerm('items.view'), exportProducts);
router.get('/summary', requirePerm('items.view'), getProductsSummary);
router.get('/barcode/:barcode', requirePerm('items.view'), getProductByBarcode);
router.get('/:id', requirePerm('items.view'), getProduct);
router.post('/', requirePerm('items.create'), createProduct);
router.put('/:id', requirePerm('items.update'), updateProduct);
router.delete('/:id', requirePerm('items.delete'), deleteProduct);
router.post('/:id/merge-into/:targetId', requirePerm('items.update'), requirePerm('items.delete'), mergeProducts);

// Product Variants
router.get('/:id/variants', requirePerm('items.view'), listProductVariants);
router.post('/:id/variants', requirePerm('items.create'), addProductVariant);
router.post('/:id/variants/generate', requirePerm('items.create'), generateProductVariants);

// Product Image Upload
router.post(
  '/:id/image',
  requirePerm('items.update'),
  uploadProductImageMiddleware.single('image'),
  uploadProductImage
);
router.delete('/:id/image', requirePerm('items.update'), deleteProductImage);

export default router;
