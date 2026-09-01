-- Performance indexes for ledger, movements, line items, and RBAC lookups.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_customer_ledger_branch_customer
  ON ims.customer_ledger (branch_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_branch_date
  ON ims.customer_ledger (branch_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_ref
  ON ims.customer_ledger (ref_table, ref_id)
  WHERE ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_branch_supplier
  ON ims.supplier_ledger (branch_id, supplier_id);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_branch_date
  ON ims.supplier_ledger (branch_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_ref
  ON ims.supplier_ledger (ref_table, ref_id)
  WHERE ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
  ON ims.sale_items (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_item_id
  ON ims.sale_items (item_id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id
  ON ims.purchase_items (purchase_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_item
  ON ims.inventory_movements (branch_id, item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_date
  ON ims.inventory_movements (branch_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_account_transactions_branch_date
  ON ims.account_transactions (branch_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_account_transactions_ref
  ON ims.account_transactions (ref_table, ref_id)
  WHERE ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_branch_date
  ON ims.sales (branch_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_branch_date
  ON ims.purchases (branch_id, purchase_date DESC);

CREATE INDEX IF NOT EXISTS idx_customers_branch_active
  ON ims.customers (branch_id, full_name)
  WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_suppliers_branch_active
  ON ims.suppliers (branch_id, supplier_id)
  WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON ims.role_permissions (role_id);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user
  ON ims.user_permissions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user
  ON ims.user_permission_overrides (user_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal
  ON ims.journal_lines (journal_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_date
  ON ims.journal_entries (branch_id, entry_date DESC);
