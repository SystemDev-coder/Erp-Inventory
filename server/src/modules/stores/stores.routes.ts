import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';
import {
  listStores,
  getStore,
  createStore,
  updateStore,
  deleteStore,
  listStoreItems,
  addStoreItem,
  updateStoreItem,
  removeStoreItem,
} from './stores.controller';

const router = Router();
router.use(requireAuth);

router.get('/', requireAnyPerm(['stock.view', 'inventory.view']), listStores);
router.get('/:id', requireAnyPerm(['stock.view', 'inventory.view']), getStore);
router.post('/', requireAnyPerm(['stock.adjust', 'inventory.adjust']), createStore);
router.put('/:id', requireAnyPerm(['stock.adjust', 'inventory.adjust']), updateStore);
router.delete('/:id', requireAnyPerm(['stock.adjust', 'inventory.adjust']), deleteStore);

router.get('/:id/items', requireAnyPerm(['stock.view', 'inventory.view']), listStoreItems);
router.post('/:id/items', requireAnyPerm(['stock.adjust', 'inventory.adjust']), addStoreItem);
router.put('/:id/items/:itemId', requireAnyPerm(['stock.adjust', 'inventory.adjust']), updateStoreItem);
router.delete('/:id/items/:itemId', requireAnyPerm(['stock.adjust', 'inventory.adjust']), removeStoreItem);

export default router;
