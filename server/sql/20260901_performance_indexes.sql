-- Performance indexes for ledger, movements, line items, and RBAC lookups.
-- Safe to run multiple times (IF NOT EXISTS).
--
-- Every index is created through a guard that skips it when the target table or
-- column is missing. The entrypoint runs migrations with ON_ERROR_STOP=1 under
-- `set -e`, so a single index referencing a column an older client database does
-- not have would abort the whole deploy before the bootstrap seed, the RLS /
-- soft-delete fixes, and the PM2 restart ever ran. A missing index only costs
-- speed; an aborted deploy leaves the client on stale code.

-- The entrypoint backfills `is_deleted` on every table, but that step runs *after*
-- incremental migrations, so the two partial indexes below would be skipped forever
-- (their checksum never changes, so this file never re-runs). Add the column here.
ALTER TABLE IF EXISTS ims.customers ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS ims.suppliers ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0;

DO $$
DECLARE
  r record;
  missing_col text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('idx_customer_ledger_branch_customer', 'customer_ledger',
       ARRAY['branch_id', 'customer_id']::text[],
       '(branch_id, customer_id)'),
      ('idx_customer_ledger_branch_date', 'customer_ledger',
       ARRAY['branch_id', 'entry_date']::text[],
       '(branch_id, entry_date DESC)'),
      ('idx_customer_ledger_ref', 'customer_ledger',
       ARRAY['ref_table', 'ref_id']::text[],
       '(ref_table, ref_id) WHERE ref_id IS NOT NULL'),
      ('idx_supplier_ledger_branch_supplier', 'supplier_ledger',
       ARRAY['branch_id', 'supplier_id']::text[],
       '(branch_id, supplier_id)'),
      ('idx_supplier_ledger_branch_date', 'supplier_ledger',
       ARRAY['branch_id', 'entry_date']::text[],
       '(branch_id, entry_date DESC)'),
      ('idx_supplier_ledger_ref', 'supplier_ledger',
       ARRAY['ref_table', 'ref_id']::text[],
       '(ref_table, ref_id) WHERE ref_id IS NOT NULL'),
      ('idx_sale_items_sale_id', 'sale_items',
       ARRAY['sale_id']::text[],
       '(sale_id)'),
      ('idx_sale_items_item_id', 'sale_items',
       ARRAY['item_id']::text[],
       '(item_id)'),
      ('idx_purchase_items_purchase_id', 'purchase_items',
       ARRAY['purchase_id']::text[],
       '(purchase_id)'),
      ('idx_inventory_movements_branch_item', 'inventory_movements',
       ARRAY['branch_id', 'item_id']::text[],
       '(branch_id, item_id)'),
      ('idx_inventory_movements_branch_date', 'inventory_movements',
       ARRAY['branch_id', 'move_date']::text[],
       '(branch_id, move_date DESC)'),
      ('idx_account_transactions_branch_date', 'account_transactions',
       ARRAY['branch_id', 'txn_date']::text[],
       '(branch_id, txn_date DESC)'),
      ('idx_account_transactions_ref', 'account_transactions',
       ARRAY['ref_table', 'ref_id']::text[],
       '(ref_table, ref_id) WHERE ref_id IS NOT NULL'),
      ('idx_sales_branch_date', 'sales',
       ARRAY['branch_id', 'sale_date']::text[],
       '(branch_id, sale_date DESC)'),
      ('idx_purchases_branch_date', 'purchases',
       ARRAY['branch_id', 'purchase_date']::text[],
       '(branch_id, purchase_date DESC)'),
      ('idx_customers_branch_active', 'customers',
       ARRAY['branch_id', 'full_name', 'is_deleted']::text[],
       '(branch_id, full_name) WHERE COALESCE(is_deleted, 0) = 0'),
      ('idx_suppliers_branch_active', 'suppliers',
       ARRAY['branch_id', 'supplier_id', 'is_deleted']::text[],
       '(branch_id, supplier_id) WHERE COALESCE(is_deleted, 0) = 0'),
      ('idx_role_permissions_role', 'role_permissions',
       ARRAY['role_id']::text[],
       '(role_id)'),
      ('idx_user_permissions_user', 'user_permissions',
       ARRAY['user_id']::text[],
       '(user_id)'),
      ('idx_user_permission_overrides_user', 'user_permission_overrides',
       ARRAY['user_id']::text[],
       '(user_id)'),
      ('idx_journal_lines_journal', 'journal_lines',
       ARRAY['journal_id']::text[],
       '(journal_id)'),
      ('idx_journal_entries_branch_date', 'journal_entries',
       ARRAY['branch_id', 'entry_date']::text[],
       '(branch_id, entry_date DESC)')
    ) AS t(idx_name, tbl, cols, spec)
  LOOP
    IF to_regclass('ims.' || quote_ident(r.tbl)) IS NULL THEN
      RAISE NOTICE 'Skipping % - table ims.% does not exist', r.idx_name, r.tbl;
      CONTINUE;
    END IF;

    SELECT c INTO missing_col
      FROM unnest(r.cols) AS c
     WHERE NOT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = r.tbl
          AND column_name = c
     )
     LIMIT 1;

    IF missing_col IS NOT NULL THEN
      RAISE NOTICE 'Skipping % - column ims.%.% does not exist', r.idx_name, r.tbl, missing_col;
      CONTINUE;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON ims.%I %s', r.idx_name, r.tbl, r.spec);
  END LOOP;
END
$$;
