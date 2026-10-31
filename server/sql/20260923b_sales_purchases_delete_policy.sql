-- Phase 5: Sales + Purchases Delete/Update.
--
-- deleteSale/deletePurchase already REQUIRE the document to be void (or a
-- quotation/purchase-order, which never applied stock/GL/AR-AP) before they
-- do anything - voidSale and updatePurchase's void transition already fully
-- reverse stock, payments, customer/supplier balance, and GL/COGS. This
-- migration only governs the final "soft-delete the document" step
-- (server/src/modules/sales/sales.service.ts#deleteSale,
-- server/src/modules/purchases/purchases.service.ts#deletePurchase), which
-- this phase switches from a hard DELETE to softDeleteById.
--
-- sale_items/purchase_items are 'preserve', not 'cascade': ims.sp_restore
-- only restores one row at a time (Phase 2 limitation), so cascading them
-- would leave a restored sale/purchase with no line items. Preserving them
-- keeps them fully intact - naturally hidden once the parent is hidden
-- (every report already joins through the parent's is_deleted), and visible
-- again immediately on restore with zero extra code.
--
-- Deliberately NOT classifying sale_payments, customer_receipts,
-- sales_returns, supplier_payments, supplier_receipts, purchase_returns -
-- left unclassified, they default to 'block':
--   - sale_payments/supplier_payments should always be empty by delete time
--     (the void step already cleared them) - this is a pure safety net.
--   - sales_returns/purchase_returns being unclassified IS the new guard:
--     a voided sale/purchase that still has an active return against it is
--     now correctly blocked from being deleted, with zero new app code.
--   - customer_receipts/supplier_receipts stay conservatively blocked too.

INSERT INTO ims.delete_dependency_policy (parent_table, child_table, child_column, policy, note)
VALUES
  ('sales', 'sale_items', 'sale_id', 'preserve', 'Line items preserved, not cascaded - sp_restore is single-row, cascading would leave a restored sale empty.'),
  ('purchases', 'purchase_items', 'purchase_id', 'preserve', 'Same reasoning as sales/sale_items.')
ON CONFLICT (parent_table, child_table, child_column) DO NOTHING;
