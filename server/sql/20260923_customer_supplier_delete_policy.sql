-- Phase 4: Customer & Supplier Delete.
--
-- Classifies every FK that references ims.customers / ims.suppliers under the
-- Central Delete Architecture (Phase 2, 20260922_central_delete_architecture.sql).
-- Unlike products (Phase 3), none of these represent "current state that must
-- be zeroed" - they're all genuinely historical (ledger, receipts, sales/
-- purchases, returns) or a harmless association (item_suppliers) - so every
-- row here is 'preserve': a customer/supplier can be archived (soft-deleted)
-- even with real history, and that history is left completely untouched.
-- item_suppliers has a composite PK (branch_id, item_id, supplier_id,
-- discovered in Phase 3) so it cannot be 'cascade' regardless - 'preserve'
-- is correct for it anyway, it has no history value of its own.
--
-- The outstanding-balance check (a value comparison the policy engine can't
-- express) stays as application-level logic in customers.service.ts /
-- suppliers.service.ts, mirroring the on-hand-quantity check added for
-- products in Phase 3.

INSERT INTO ims.delete_dependency_policy (parent_table, child_table, child_column, policy, note)
VALUES
  ('customers', 'customer_ledger', 'customer_id', 'preserve', 'AR history must survive a customer being archived.'),
  ('customers', 'customer_receipts', 'customer_id', 'preserve', 'Payment/receipt history must survive a customer being archived.'),
  ('customers', 'sales', 'customer_id', 'preserve', 'Historical sales must survive a customer being archived.'),
  ('customers', 'sales_returns', 'customer_id', 'preserve', 'Historical sales returns must survive a customer being archived.'),
  ('suppliers', 'supplier_ledger', 'supplier_id', 'preserve', 'AP history must survive a supplier being archived.'),
  ('suppliers', 'supplier_receipts', 'supplier_id', 'preserve', 'Payment/receipt history must survive a supplier being archived.'),
  ('suppliers', 'purchases', 'supplier_id', 'preserve', 'Historical purchases must survive a supplier being archived.'),
  ('suppliers', 'purchase_returns', 'supplier_id', 'preserve', 'Historical purchase returns must survive a supplier being archived.'),
  ('suppliers', 'item_suppliers', 'supplier_id', 'preserve', 'Composite PK - cannot cascade (see Phase 3). No history value anyway, safe to leave.')
ON CONFLICT (parent_table, child_table, child_column) DO NOTHING;
