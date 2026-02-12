-- Add company_name column to suppliers if missing
SET search_path TO ims, public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ims'
      AND table_name = 'suppliers'
      AND column_name = 'company_name'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN company_name VARCHAR(255);
  END IF;
END $$;

COMMENT ON COLUMN suppliers.company_name IS 'Registered company name for the supplier';
