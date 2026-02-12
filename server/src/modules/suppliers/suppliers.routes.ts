import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
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

export default router;
