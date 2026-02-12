-- Safety patch: ensure suppliers has address/location/balance columns
SET search_path TO ims, public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='address'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='location'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN location TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='remaining_balance'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
