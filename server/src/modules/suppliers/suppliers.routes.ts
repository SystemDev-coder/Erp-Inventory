import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import { uploadSupplierImage } from '../../config/cloudinary';
import {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  uploadSupplierLogo,
  deleteSupplierLogo,
} from './suppliers.controller';

const router = Router();

router.use(requireAuth);

// List suppliers
router.get('/', requirePerm('suppliers.view'), listSuppliers);

// Get single supplier
router.get('/:id', requirePerm('suppliers.view'), getSupplier);

// Create supplier
router.post('/', requirePerm('suppliers.create'), createSupplier);

// Update supplier
router.put('/:id', requirePerm('suppliers.update'), updateSupplier);

// Delete supplier
router.delete('/:id', requirePerm('suppliers.delete'), deleteSupplier);

// Upload supplier logo
router.post(
  '/:id/logo',
  requirePerm('suppliers.update'),
  uploadSupplierImage.single('logo'),
  uploadSupplierLogo
);

// Delete supplier logo
router.delete('/:id/logo', requirePerm('suppliers.update'), deleteSupplierLogo);

export default router;
