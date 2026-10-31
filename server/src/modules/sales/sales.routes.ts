import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import {
  listSales,
  getSale,
  listSaleItems,
  listPosOrderItems,
  listPosPayments,
  createSale,
  updateSale,
  voidSale,
  convertQuotation,
  deleteSale,
  printSale,
} from './sales.controller';

const router = Router();

router.use(requireAuth);

// List sales
router.get('/', requirePerm('sales.view'), listSales);

// POS Orders read-only tabs - registered before the generic '/:id' route below so
// "pos" in the path isn't swallowed as a sale id.
router.get('/pos/items', requirePerm('sales.pos.access'), listPosOrderItems);
router.get('/pos/payments', requirePerm('sales.pos.access'), listPosPayments);

// Get single sale with items
router.get('/:id', requirePerm('sales.view'), getSale);

// List items for a sale (explicit endpoint if needed)
router.get('/:id/items', requirePerm('sales.view'), listSaleItems);

// Print (HTML) - server renders correct template based on document type
router.get('/:id/print', requirePerm('sales.view'), printSale);

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

