-- Phase 3: Product Delete & Test Data Cleanup.
--
-- Classifies every FK that references ims.items under the Central Delete
-- Architecture (Phase 2, 20260922_central_delete_architecture.sql):
--
-- - Genuinely historical tables (sales/purchases/returns/stock-adjustments/
--   transfers/inventory movements) become 'preserve': a product can be
--   archived (soft-deleted) even with real history, and that history is
--   left completely untouched. Today these are hard-blocked forever by
--   Postgres's own FK RESTRICT constraints - this deliberately reverses
--   that for the soft-delete path (products.service.ts#deleteProduct is
--   being switched from a hard DELETE to softDeleteById in this same phase).
-- - item_suppliers (just a supplier/item association, no history value) and
--   warehouse_stock (current stock-on-hand snapshot) would ideally be
--   'cascade', but both have composite primary keys (item_suppliers:
--   branch_id+item_id+supplier_id; warehouse_stock: wh_id+item_id) and
--   sp_soft_delete's cascade path only supports single-column PKs
--   (fn_table_pk_column returns NULL for either, which makes sp_soft_delete
--   RAISE EXCEPTION rather than cascade). Extending the engine to support
--   composite PKs is explicitly out of scope for this phase, so both are
--   'preserve' instead: safe because deleteProduct requires on-hand
--   quantity to be zero before it will even attempt the delete, so any
--   leftover row is already zero-quantity and harmless to leave in place.
-- - store_items has a single-column PK (store_item_id) so it genuinely can
--   be 'cascade' - same zero-quantity precondition applies.

INSERT INTO ims.delete_dependency_policy (parent_table, child_table, child_column, policy, note)
VALUES
  ('items', 'sale_items', 'item_id', 'preserve', 'Historical sales line items must survive a product being archived.'),
  ('items', 'purchase_items', 'item_id', 'preserve', 'Historical purchase line items must survive a product being archived.'),
  ('items', 'sales_return_items', 'item_id', 'preserve', 'Historical sales-return line items must survive a product being archived.'),
  ('items', 'purchase_return_items', 'item_id', 'preserve', 'Historical purchase-return line items must survive a product being archived.'),
  ('items', 'stock_adjustment', 'item_id', 'preserve', 'Historical stock adjustments must survive a product being archived.'),
  ('items', 'transfer_items', 'item_id', 'preserve', 'Historical branch transfers must survive a product being archived.'),
  ('items', 'warehouse_transfer_items', 'item_id', 'preserve', 'Historical warehouse transfers must survive a product being archived.'),
  ('items', 'inventory_movements', 'item_id', 'preserve', 'Historical inventory movement log must survive a product being archived.'),
  ('items', 'inventory_transaction', 'item_id', 'preserve', 'Historical inventory transaction log must survive a product being archived.'),
  ('items', 'inventory_transaction', 'product_id', 'preserve', 'Same table, second FK column referencing items.'),
  ('items', 'item_suppliers', 'item_id', 'preserve', 'Composite PK - cannot cascade (see note above). Safe to leave: zero-quantity precondition + no history value anyway.'),
  ('items', 'store_items', 'product_id', 'cascade', 'Single-column PK. Safe only because deleteProduct requires on-hand quantity to be zero first.'),
  ('items', 'warehouse_stock', 'item_id', 'preserve', 'Composite PK - cannot cascade (see note above). Safe: deleteProduct requires on-hand quantity to be zero first.')
ON CONFLICT (parent_table, child_table, child_column) DO NOTHING;
