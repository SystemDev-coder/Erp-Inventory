import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import {
  listSales,
  getSale,
  listSaleItems,
  createSale,
  updateSale,
  voidSale,
  convertQuotation,
  deleteSale,
} from './sales.controller';

const router = Router();

router.use(requireAuth);

// List sales
router.get('/', requirePerm('sales.view'), listSales);

// Get single sale with items
router.get('/:id', requirePerm('sales.view'), getSale);

// List items for a sale (explicit endpoint if needed)
router.get('/:id/items', requirePerm('sales.view'), listSaleItems);

// Create sale
router.post('/', requirePerm('sales.create'), createSale);

// Update sale
router.put('/:id', requirePerm('sales.update'), updateSale);

// Void sale/invoice/quotation
router.post('/:id/void', requirePerm('sales.void'), voidSale);

// Convert quotation to invoice
router.post('/:id/convert-quotation', requirePerm('sales.update'), convertQuotation);

// Delete (only voided/quotation per service rules)
router.delete('/:id', requirePerm('sales.void'), deleteSale);

export default router;

