import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm, requirePerm } from '../../middlewares/requirePerm';
import {
  listStores,
  getStore,
  createStore,
  updateStore,
  listStoreItems,
  addStoreItem,
  updateStoreItem,
  removeStoreItem,
} from './stores.controller';

const router = Router();
router.use(requireAuth);

// Own permission family (stores.* / store_items.*), independent of items.* so the
// Store tab can be granted/denied separately from the rest of Products. See
// server/sql/20260930a_products_tab_permissions.sql for the one-time backfill that
// keeps every existing items.*-holder's access unchanged on cutover. (items.view /
// stock.view / inventory.view were the old fallback - stock.view/inventory.view were
// never even seeded as grantable keys.)
router.get('/', requireAnyPerm(['stores.view', 'store_items.view']), listStores);
router.get('/:id', requireAnyPerm(['stores.view', 'store_items.view']), getStore);
router.post('/:id/items', requirePerm('store_items.create'), addStoreItem);
router.put('/:id/items/:itemId', requirePerm('store_items.update'), updateStoreItem);
router.delete('/:id/items/:itemId', requirePerm('store_items.delete'), removeStoreItem);
router.post('/', requirePerm('stores.create'), createStore);
router.put('/:id', requirePerm('stores.update'), updateStore);

router.get('/:id/items', requireAnyPerm(['stores.view', 'store_items.view']), listStoreItems);

export default router;
