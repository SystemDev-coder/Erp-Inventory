-- Ensure suppliers table has contact_person column
SET search_path TO ims, public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ims'
      AND table_name = 'suppliers'
      AND column_name = 'contact_person'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN contact_person VARCHAR(255);
  END IF;
END$$;
