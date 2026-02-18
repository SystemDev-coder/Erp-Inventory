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

router.get('/', requireAnyPerm(['items.view', 'stock.view', 'inventory.view']), listStores);
router.get('/:id', requireAnyPerm(['items.view', 'stock.view', 'inventory.view']), getStore);
router.post('/:id/items', requireAnyPerm(['items.update', 'items.create', 'stock.adjust', 'inventory.adjust']), addStoreItem);
router.put('/:id/items/:itemId', requireAnyPerm(['items.update', 'stock.adjust', 'inventory.adjust']), updateStoreItem);
router.delete('/:id/items/:itemId', requireAnyPerm(['items.delete', 'items.update', 'stock.adjust', 'inventory.adjust']), removeStoreItem);
router.post('/', requireAnyPerm(['items.create', 'stock.adjust', 'inventory.adjust']), createStore);
router.put('/:id', requireAnyPerm(['items.update', 'stock.adjust', 'inventory.adjust']), updateStore);
router.delete('/:id', requireAnyPerm(['items.delete', 'stock.adjust', 'inventory.adjust']), deleteStore);

router.get('/:id/items', requireAnyPerm(['items.view', 'stock.view', 'inventory.view']), listStoreItems);

export default router;
