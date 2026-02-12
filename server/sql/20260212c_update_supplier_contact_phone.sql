-- Update suppliers: replace logo_url with contact_phone
SET search_path TO ims, public;

DO $$
BEGIN
  -- Add contact_phone if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='contact_phone'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN contact_phone VARCHAR(50);
  END IF;

  -- Drop logo_url if present (no longer used)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='logo_url'
  ) THEN
    ALTER TABLE suppliers DROP COLUMN logo_url;
  END IF;
END $$;
