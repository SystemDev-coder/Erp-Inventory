import { Router } from 'express';
import {
  listStock,
  listItems,
  listMovements,
  listAdjustments,
  listRecounts,
  createAdjustment,
  updateAdjustment,
  deleteAdjustment,
  createTransfer,
  createRecount,
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  listInventoryTransactions,
  createInventoryTransaction,
} from './inventory.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm } from '../../middlewares/requirePerm';

const router = Router();

router.use(requireAuth);

router.get('/items', requireAnyPerm(['stock.view', 'inventory.view']), listItems);
router.get('/stock', requireAnyPerm(['stock.view', 'inventory.view']), listStock);
router.get('/movements', requireAnyPerm(['stock.view', 'inventory.view']), listMovements);
router.get('/adjustments', requireAnyPerm(['stock.view', 'stock.adjust', 'inventory.view']), listAdjustments);
router.post('/adjustments', requireAnyPerm(['stock.adjust', 'inventory.adjust']), createAdjustment);
router.put('/adjustments/:id', requireAnyPerm(['stock.adjust', 'inventory.adjust']), updateAdjustment);
router.delete('/adjustments/:id', requireAnyPerm(['stock.adjust', 'inventory.adjust']), deleteAdjustment);
router.get('/recounts', requireAnyPerm(['stock.view', 'stock.recount', 'inventory.view']), listRecounts);
router.post('/recounts', requireAnyPerm(['stock.recount', 'stock.adjust', 'inventory.adjust']), createRecount);
router.post('/transfers', requireAnyPerm(['stock.adjust', 'stock.recount', 'inventory.transfer']), createTransfer);
router.get('/branches', requireAnyPerm(['stock.view', 'inventory.view', 'system.branches']), listBranches);
router.post('/branches', requireAnyPerm(['system.branches', 'stock.adjust', 'inventory.adjust']), createBranch);
router.put('/branches/:id', requireAnyPerm(['system.branches', 'stock.adjust', 'inventory.adjust']), updateBranch);
router.delete('/branches/:id', requireAnyPerm(['system.branches', 'stock.adjust', 'inventory.adjust']), deleteBranch);
router.get('/warehouses', requireAnyPerm(['stock.view', 'inventory.view', 'system.branches']), listWarehouses);
router.post('/warehouses', requireAnyPerm(['system.branches', 'stock.adjust', 'inventory.adjust']), createWarehouse);
router.put('/warehouses/:id', requireAnyPerm(['system.branches', 'stock.adjust', 'inventory.adjust']), updateWarehouse);
router.delete('/warehouses/:id', requireAnyPerm(['system.branches', 'stock.adjust', 'inventory.adjust']), deleteWarehouse);
// Own permission family (inventory_transactions.*), independent of items.*/stock.*, so
// the Products page's "Inventory Transaction" tab can be granted/denied separately. See
// server/sql/20260930a_products_tab_permissions.sql for the one-time backfill.
router.get('/transactions', requireAnyPerm(['inventory_transactions.view']), listInventoryTransactions);
router.post('/transactions', requireAnyPerm(['inventory_transactions.create']), createInventoryTransaction);

export default router;
