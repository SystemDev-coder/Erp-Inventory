-- Optional monetary cap; NULL preserves existing unlimited-credit behavior.
ALTER TABLE IF EXISTS ims.customers
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'ims'
       AND t.relname = 'customers'
       AND c.conname = 'chk_customers_credit_limit'
  ) THEN
    ALTER TABLE ims.customers
      ADD CONSTRAINT chk_customers_credit_limit
      CHECK (credit_limit IS NULL OR credit_limit >= 0);
  END IF;
END
$$;
