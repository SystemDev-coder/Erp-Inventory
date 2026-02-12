-- Fix legacy suppliers.name NOT NULL and keep it synced with supplier_name
SET search_path TO ims, public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='name'
  ) THEN
    -- Allow nulls to prevent insert errors
    ALTER TABLE suppliers ALTER COLUMN name DROP NOT NULL;

    -- Backfill missing legacy name values
    UPDATE suppliers SET name = COALESCE(name, supplier_name);

    -- Keep legacy name in sync for any code that still reads it
    CREATE OR REPLACE FUNCTION ims.fn_sync_supplier_name()
    RETURNS TRIGGER AS $sync$
    BEGIN
      NEW.name := COALESCE(NEW.name, NEW.supplier_name);
      RETURN NEW;
    END;
    $sync$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_suppliers_sync_name ON suppliers;
    CREATE TRIGGER trg_suppliers_sync_name
      BEFORE INSERT OR UPDATE ON suppliers
      FOR EACH ROW
      EXECUTE FUNCTION ims.fn_sync_supplier_name();
  END IF;
END $$;
