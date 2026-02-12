-- Update suppliers table: remove email, add remaining balance and location
SET search_path TO ims, public;

DO $$
BEGIN
  -- Drop legacy email column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ims' AND table_name = 'suppliers' AND column_name = 'email'
  ) THEN
    ALTER TABLE suppliers DROP COLUMN email;
  END IF;

  -- Add remaining_balance with a safe default
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ims' AND table_name = 'suppliers' AND column_name = 'remaining_balance'
  ) THEN
    ALTER TABLE suppliers
      ADD COLUMN remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
  END IF;

  -- Ensure address column exists (older base schemas used country only)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ims' AND table_name = 'suppliers' AND column_name = 'address'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN address TEXT;
  END IF;

  -- Add location for supplier address/city
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ims' AND table_name = 'suppliers' AND column_name = 'location'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN location TEXT;
  END IF;

  -- Normalize any NULL balances to zero
  UPDATE suppliers SET remaining_balance = 0 WHERE remaining_balance IS NULL;
END $$;

COMMENT ON COLUMN suppliers.remaining_balance IS 'Outstanding amount owed to the supplier';
COMMENT ON COLUMN suppliers.location IS 'City/area of the supplier';
