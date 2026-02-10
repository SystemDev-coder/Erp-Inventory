-- =====================================================
-- Image Upload Tables Migration
-- Created: 2026-02-10
-- Description: System info, products, suppliers with Cloudinary image support
-- =====================================================

SET search_path TO ims, public;

-- =====================================================
-- 1. SYSTEM INFORMATION TABLE (Single Row Only)
-- =====================================================

CREATE TABLE IF NOT EXISTS system_information (
    system_id SERIAL PRIMARY KEY,
    system_name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    banner_image_url TEXT,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_info_single_row 
ON system_information ((1));

-- Trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_system_info_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_info_timestamp ON system_information;
CREATE TRIGGER trg_system_info_timestamp
    BEFORE UPDATE ON system_information
    FOR EACH ROW
    EXECUTE FUNCTION update_system_info_timestamp();

-- Insert default system info if not exists
INSERT INTO system_information (system_name, system_id)
VALUES ('My ERP System', 1)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 2. UPDATE PRODUCTS TABLE (Add Image Column)
-- =====================================================

-- Add image column to existing products table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'products' 
        AND column_name = 'product_image_url'
    ) THEN
        ALTER TABLE products ADD COLUMN product_image_url TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'ims' 
        AND table_name = 'products' 
        AND column_name = 'description'
    ) THEN
        ALTER TABLE products ADD COLUMN description TEXT;
    END IF;
END $$;

-- =====================================================
-- 3. SUPPLIERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id SERIAL PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to update updated_at for suppliers
CREATE OR REPLACE FUNCTION update_supplier_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_timestamp ON suppliers;
CREATE TRIGGER trg_supplier_timestamp
    BEFORE UPDATE ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_supplier_timestamp();

-- Ensure supplier_name column exists even if legacy "name" column was used
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='supplier_name'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN supplier_name VARCHAR(255);
    -- If legacy name column exists, backfill
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='ims' AND table_name='suppliers' AND column_name='name'
    ) THEN
      UPDATE suppliers SET supplier_name = COALESCE(supplier_name, name);
    END IF;
    -- Ensure not null constraint gently
    ALTER TABLE suppliers ALTER COLUMN supplier_name DROP NOT NULL;
  END IF;

  -- Add is_active if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='is_active'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    UPDATE suppliers SET is_active = TRUE WHERE is_active IS NULL;
  END IF;
END$$;

-- Create indexes for performance (choose existing column)
DO $$
DECLARE
  col_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='suppliers' AND column_name='supplier_name') THEN
    col_name := 'supplier_name';
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='suppliers' AND column_name='name') THEN
    col_name := 'name';
  END IF;

  IF col_name IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(%I);', col_name);
  END IF;

  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);';
END$$;

-- =====================================================
-- 4. IMAGE UPLOADS LOG TABLE (Optional - Track uploads)
-- =====================================================

CREATE TABLE IF NOT EXISTS image_uploads (
    upload_id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'system', 'product', 'supplier'
    entity_id INTEGER NOT NULL,
    image_type VARCHAR(50), -- 'logo', 'banner', 'product_image'
    cloudinary_public_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    uploaded_by INTEGER REFERENCES users(user_id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_uploads_entity ON image_uploads(entity_type, entity_id);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify table creation
DO $$
BEGIN
    RAISE NOTICE 'System Information Table: %', 
        (SELECT COUNT(*) FROM information_schema.tables 
         WHERE table_schema = 'ims' AND table_name = 'system_information');
    
    RAISE NOTICE 'Products Table with images: %', 
        (SELECT COUNT(*) FROM information_schema.columns 
         WHERE table_schema = 'ims' AND table_name = 'products' AND column_name = 'product_image_url');
    
    RAISE NOTICE 'Suppliers Table: %', 
        (SELECT COUNT(*) FROM information_schema.tables 
         WHERE table_schema = 'ims' AND table_name = 'suppliers');
    
    RAISE NOTICE '✓ Image Upload Tables Migration Completed Successfully!';
END $$;
