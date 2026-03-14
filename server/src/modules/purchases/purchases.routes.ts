import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import {
  listPurchaseItems,
  listPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase,
  exportPurchasesXlsx,
} from './purchases.controller';

const router = Router();

router.use(requireAuth);

router.get('/items', requirePerm('purchases.view'), listPurchaseItems);
router.get('/export', requirePerm('purchases.view'), exportPurchasesXlsx);
router.get('/', requirePerm('purchases.view'), listPurchases);
router.get('/:id', requirePerm('purchases.view'), getPurchase);
router.post('/', requirePerm('purchases.create'), createPurchase);
router.put('/:id', requirePerm('purchases.update'), updatePurchase);
router.delete('/:id', requirePerm('purchases.delete'), deletePurchase);

export default router;
