-- Phase 6: Stock & Inventory delete/restore consistency.
--
-- deleteWarehouse (inventory.service.ts) and stores.service.ts#delete already
-- soft-delete via the Central Delete Architecture engine (Phase 2), but no
-- policy rows existed yet for their historical dependents, so they defaulted
-- to 'block' - meaning a warehouse/store with any real history could never
-- be archived. All rows below are 'preserve': genuinely historical
-- (purchases, sales, inventory logs, transfer documents), left completely
-- untouched when the parent is archived.
--
-- warehouse_stock is 'preserve', not 'cascade', for the same reason as
-- item_suppliers/warehouse_stock in Phase 3: composite PK (wh_id, item_id),
-- sp_soft_delete's cascade path only supports single-column PKs. Safe
-- because inventory.service.ts#deleteWarehouse now requires on-hand
-- quantity to be zero before it will even attempt the delete.
--
-- items.store_id is deliberately left unclassified (stays 'block') per the
-- user's decision - an item must be reassigned or removed before its home
-- store can be deleted, more conservative than the historical tables here.

INSERT INTO ims.delete_dependency_policy (parent_table, child_table, child_column, policy, note)
VALUES
  ('stores', 'purchases', 'store_id', 'preserve', 'Historical purchases must survive a store being archived.'),
  ('stores', 'inventory_transaction', 'store_id', 'preserve', 'Historical inventory transaction log must survive a store being archived.'),
  ('warehouses', 'sales', 'wh_id', 'preserve', 'Historical sales must survive a warehouse being archived.'),
  ('warehouses', 'inventory_movements', 'wh_id', 'preserve', 'Historical movement log must survive a warehouse being archived.'),
  ('warehouses', 'warehouse_transfers', 'from_wh_id', 'preserve', 'Historical transfer documents must survive a warehouse being archived.'),
  ('warehouses', 'warehouse_transfers', 'to_wh_id', 'preserve', 'Same reasoning, destination side.'),
  ('warehouses', 'warehouse_stock', 'wh_id', 'preserve', 'Composite PK - cannot cascade (see Phase 3). Safe: deleteWarehouse requires on-hand quantity to be zero first.')
ON CONFLICT (parent_table, child_table, child_column) DO NOTHING;
