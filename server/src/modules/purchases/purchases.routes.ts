import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import {
  listPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase,
} from './purchases.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requirePerm('purchases.view'), listPurchases);
router.get('/:id', requirePerm('purchases.view'), getPurchase);
router.post('/', requirePerm('purchases.create'), createPurchase);
router.put('/:id', requirePerm('purchases.update'), updatePurchase);
router.delete('/:id', requirePerm('purchases.delete'), deletePurchase);

export default router;
