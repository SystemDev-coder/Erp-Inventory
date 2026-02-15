-- =========================================================
-- BRANCH-BASED MULTI-TENANCY IMPLEMENTATION
-- This migration implements complete branch isolation for the ERP system
-- =========================================================
BEGIN;
SET search_path TO ims, public;

-- =========================================================
-- 1) CREATE USER_BRANCH JUNCTION TABLE
-- Allow users to belong to multiple branches
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.user_branch (
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, branch_id)
);

COMMENT ON TABLE ims.user_branch IS 'Junction table linking users to multiple branches they can access';
COMMENT ON COLUMN ims.user_branch.is_primary IS 'Indicates if this is the user''s primary/default branch';

CREATE OR REPLACE FUNCTION ims.fn_sync_user_branch_from_users()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE ims.user_branch
     SET is_primary = FALSE
   WHERE user_id = NEW.user_id;

  INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
  VALUES (NEW.user_id, NEW.branch_id, TRUE)
  ON CONFLICT (user_id, branch_id)
  DO UPDATE SET is_primary = TRUE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_branch_from_users ON ims.users;
CREATE TRIGGER trg_sync_user_branch_from_users
AFTER INSERT OR UPDATE OF branch_id ON ims.users
FOR EACH ROW
EXECUTE FUNCTION ims.fn_sync_user_branch_from_users();

-- Migrate existing users.branch_id to user_branch table
INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
SELECT user_id, branch_id, TRUE
FROM ims.users
WHERE branch_id IS NOT NULL
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- =========================================================
-- 2) DROP ALL VIEWS THAT DEPEND ON TABLES WE'LL MODIFY
-- =========================================================
DROP VIEW IF EXISTS ims.v_branch_products CASCADE;
DROP VIEW IF EXISTS ims.v_branch_customers CASCADE;
DROP VIEW IF EXISTS ims.v_branch_suppliers CASCADE;
DROP VIEW IF EXISTS ims.v_products CASCADE;
DROP VIEW IF EXISTS ims.v_customers CASCADE;
DROP VIEW IF EXISTS ims.v_suppliers CASCADE;
DROP VIEW IF EXISTS ims.v_product_stock CASCADE;

-- =========================================================
-- 3) ADD BRANCH_ID TO TABLES THAT NEED BRANCH ISOLATION
-- =========================================================

-- Categories - Each branch can have its own product categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='categories' AND column_name='branch_id'
  ) THEN
    ALTER TABLE ims.categories ADD COLUMN branch_id BIGINT REFERENCES ims.branches(branch_id);
    
    -- Set default branch for existing categories
    UPDATE ims.categories SET branch_id = (SELECT branch_id FROM ims.branches ORDER BY branch_id LIMIT 1)
    WHERE branch_id IS NULL;
    
    -- Make it NOT NULL after backfilling
    ALTER TABLE ims.categories ALTER COLUMN branch_id SET NOT NULL;
    
    -- Update unique constraint to be branch-specific
    ALTER TABLE ims.categories DROP CONSTRAINT IF EXISTS categories_cat_name_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_branch ON ims.categories(branch_id, cat_name);
  END IF;
END$$;

-- Suppliers - Each branch manages its own suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='branch_id'
  ) THEN
    ALTER TABLE ims.suppliers ADD COLUMN branch_id BIGINT REFERENCES ims.branches(branch_id);
    
    UPDATE ims.suppliers SET branch_id = (SELECT branch_id FROM ims.branches ORDER BY branch_id LIMIT 1)
    WHERE branch_id IS NULL;
    
    ALTER TABLE ims.suppliers ALTER COLUMN branch_id SET NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON ims.suppliers(branch_id);
  END IF;
END$$;

-- Customers - Each branch has its own customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='customers' AND column_name='branch_id'
  ) THEN
    ALTER TABLE ims.customers ADD COLUMN branch_id BIGINT REFERENCES ims.branches(branch_id);
    
    UPDATE ims.customers SET branch_id = (SELECT branch_id FROM ims.branches ORDER BY branch_id LIMIT 1)
    WHERE branch_id IS NULL;
    
    ALTER TABLE ims.customers ALTER COLUMN branch_id SET NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_customers_branch ON ims.customers(branch_id);
  END IF;
END$$;

-- Products - Each branch can have different products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='products' AND column_name='branch_id'
  ) THEN
    ALTER TABLE ims.products ADD COLUMN branch_id BIGINT REFERENCES ims.branches(branch_id);
    
    UPDATE ims.products SET branch_id = (SELECT branch_id FROM ims.branches ORDER BY branch_id LIMIT 1)
    WHERE branch_id IS NULL;
    
    ALTER TABLE ims.products ALTER COLUMN branch_id SET NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_products_branch ON ims.products(branch_id);
    
    -- Update barcode uniqueness to be branch-specific.
    -- In many databases, products_barcode_key is a UNIQUE CONSTRAINT (not a plain index),
    -- so it must be dropped via ALTER TABLE first.
    ALTER TABLE ims.products DROP CONSTRAINT IF EXISTS products_barcode_key;
    DROP INDEX IF EXISTS ims.products_barcode_key;
    DROP INDEX IF EXISTS ims.idx_products_barcode_branch;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_branch
      ON ims.products(branch_id, barcode)
      WHERE barcode IS NOT NULL;
  END IF;
END$$;

-- Accounts - Each branch has its own accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='accounts' AND column_name='branch_id'
  ) THEN
    ALTER TABLE ims.accounts ADD COLUMN branch_id BIGINT REFERENCES ims.branches(branch_id);
    
    UPDATE ims.accounts SET branch_id = (SELECT branch_id FROM ims.branches ORDER BY branch_id LIMIT 1)
    WHERE branch_id IS NULL;
    
    ALTER TABLE ims.accounts ALTER COLUMN branch_id SET NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_accounts_branch ON ims.accounts(branch_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_active ON ims.accounts(branch_id, is_active) WHERE is_active = TRUE;
    
    -- Add unique constraint for account name per branch
    -- First, ensure no duplicates exist
    CREATE UNIQUE INDEX IF NOT EXISTS uq_account_name_per_branch ON ims.accounts(branch_id, name);
  END IF;
END$$;

-- Transfers - Already has from_branch_id and to_branch_id, add created_branch_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='transfers' AND column_name='created_branch_id'
  ) THEN
    ALTER TABLE ims.transfers ADD COLUMN created_branch_id BIGINT REFERENCES ims.branches(branch_id);
    
    -- Default to from_branch_id
    UPDATE ims.transfers SET created_branch_id = from_branch_id
    WHERE created_branch_id IS NULL AND from_branch_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_transfers_created_branch ON ims.transfers(created_branch_id);
  END IF;
END$$;

-- Employees - Each branch has its own employees
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='ims' AND table_name='employees'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='employees' AND column_name='branch_id'
  ) THEN
    ALTER TABLE ims.employees ADD COLUMN branch_id BIGINT REFERENCES ims.branches(branch_id);
    
    UPDATE ims.employees SET branch_id = (SELECT branch_id FROM ims.branches ORDER BY branch_id LIMIT 1)
    WHERE branch_id IS NULL;
    
    ALTER TABLE ims.employees ALTER COLUMN branch_id SET NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_employees_branch ON ims.employees(branch_id);
  END IF;
END$$;

-- =========================================================
-- 3) CREATE HELPER FUNCTION TO GET USER'S ACCESSIBLE BRANCHES
-- =========================================================
CREATE OR REPLACE FUNCTION ims.fn_user_branches(p_user_id BIGINT)
RETURNS TABLE(branch_id BIGINT, branch_name VARCHAR, is_primary BOOLEAN) 
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.branch_id,
    b.branch_name,
    ub.is_primary
  FROM ims.user_branch ub
  JOIN ims.branches b ON b.branch_id = ub.branch_id
  WHERE ub.user_id = p_user_id
  ORDER BY ub.is_primary DESC, b.branch_name;
END;
$$;

COMMENT ON FUNCTION ims.fn_user_branches IS 'Returns all branches a user has access to';

-- =========================================================
-- 4) CREATE HELPER FUNCTION TO GET USER'S PRIMARY BRANCH
-- =========================================================
CREATE OR REPLACE FUNCTION ims.fn_user_primary_branch(p_user_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_branch_id BIGINT;
BEGIN
  SELECT branch_id INTO v_branch_id
  FROM ims.user_branch
  WHERE user_id = p_user_id AND is_primary = TRUE
  LIMIT 1;
  
  -- If no primary branch, return first available branch
  IF v_branch_id IS NULL THEN
    SELECT branch_id INTO v_branch_id
    FROM ims.user_branch
    WHERE user_id = p_user_id
    ORDER BY created_at
    LIMIT 1;
  END IF;
  
  RETURN v_branch_id;
END;
$$;

COMMENT ON FUNCTION ims.fn_user_primary_branch IS 'Returns user''s primary branch ID';

-- =========================================================
-- 4) RECREATE VIEWS AFTER TABLE MODIFICATIONS
-- =========================================================
CREATE OR REPLACE VIEW ims.v_branch_products AS
SELECT 
  p.*,
  c.cat_name,
  u.unit_name,
  u.symbol as unit_symbol,
  s.supplier_name,
  t.tax_name,
  t.rate_percent as tax_rate
FROM ims.products p
LEFT JOIN ims.categories c ON c.cat_id = p.cat_id
LEFT JOIN ims.units u ON u.unit_id = p.unit_id
LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
LEFT JOIN ims.taxes t ON t.tax_id = p.tax_id;

CREATE OR REPLACE VIEW ims.v_branch_customers AS
SELECT c.* FROM ims.customers c;

CREATE OR REPLACE VIEW ims.v_branch_suppliers AS
SELECT s.* FROM ims.suppliers s;

-- =========================================================
-- 5) ADD INDEXES FOR PERFORMANCE
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_user_branch_user ON ims.user_branch(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_branch ON ims.user_branch(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_primary ON ims.user_branch(user_id, is_primary) WHERE is_primary = TRUE;

-- =========================================================
-- 6) ADD CREATED_BY AND UPDATED_BY TRACKING
-- =========================================================

-- Helper function to add audit columns
CREATE OR REPLACE FUNCTION ims.fn_add_audit_columns(p_table_name TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- Add created_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name=p_table_name AND column_name='created_by'
  ) THEN
    EXECUTE format('ALTER TABLE ims.%I ADD COLUMN created_by BIGINT REFERENCES ims.users(user_id)', p_table_name);
  END IF;
  
  -- Add updated_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name=p_table_name AND column_name='updated_by'
  ) THEN
    EXECUTE format('ALTER TABLE ims.%I ADD COLUMN updated_by BIGINT REFERENCES ims.users(user_id)', p_table_name);
  END IF;
  
  -- Add updated_at if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name=p_table_name AND column_name='updated_at'
  ) THEN
    EXECUTE format('ALTER TABLE ims.%I ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()', p_table_name);
  END IF;
END;
$$;

-- Drop views before altering tables
DROP VIEW IF EXISTS ims.v_branch_products CASCADE;
DROP VIEW IF EXISTS ims.v_branch_customers CASCADE;
DROP VIEW IF EXISTS ims.v_branch_suppliers CASCADE;

-- Apply audit columns to key tables
SELECT ims.fn_add_audit_columns('products');
SELECT ims.fn_add_audit_columns('categories');
SELECT ims.fn_add_audit_columns('customers');
SELECT ims.fn_add_audit_columns('suppliers');
SELECT ims.fn_add_audit_columns('sales');
SELECT ims.fn_add_audit_columns('purchases');

-- Recreate views after table modifications
CREATE OR REPLACE VIEW ims.v_branch_products AS
SELECT 
  p.*,
  c.cat_name,
  u.unit_name,
  u.symbol as unit_symbol,
  s.supplier_name,
  t.tax_name,
  t.rate_percent as tax_rate
FROM ims.products p
LEFT JOIN ims.categories c ON c.cat_id = p.cat_id
LEFT JOIN ims.units u ON u.unit_id = p.unit_id
LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
LEFT JOIN ims.taxes t ON t.tax_id = p.tax_id;

CREATE OR REPLACE VIEW ims.v_branch_customers AS
SELECT c.* FROM ims.customers c;

CREATE OR REPLACE VIEW ims.v_branch_suppliers AS
SELECT s.* FROM ims.suppliers s;

CREATE OR REPLACE VIEW ims.v_branch_accounts AS
SELECT 
  a.*,
  b.branch_name,
  c.currency_name,
  c.symbol as currency_symbol
FROM ims.accounts a
LEFT JOIN ims.branches b ON b.branch_id = a.branch_id
LEFT JOIN ims.currencies c ON c.currency_code = a.currency_code;

CREATE OR REPLACE VIEW ims.v_active_branch_accounts AS
SELECT 
  a.*,
  b.branch_name,
  c.currency_name,
  c.symbol as currency_symbol
FROM ims.accounts a
LEFT JOIN ims.branches b ON b.branch_id = a.branch_id
LEFT JOIN ims.currencies c ON c.currency_code = a.currency_code
WHERE a.is_active = TRUE;

-- Function to get accounts for a specific branch
CREATE OR REPLACE FUNCTION ims.fn_branch_accounts(p_branch_id BIGINT, p_active_only BOOLEAN DEFAULT TRUE)
RETURNS TABLE(
  acc_id BIGINT,
  branch_id BIGINT,
  name VARCHAR,
  institution VARCHAR,
  currency_code CHAR,
  balance NUMERIC,
  is_active BOOLEAN,
  branch_name VARCHAR
) 
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_active_only THEN
    RETURN QUERY
    SELECT 
      a.acc_id,
      a.branch_id,
      a.name,
      a.institution,
      a.currency_code,
      a.balance,
      a.is_active,
      b.branch_name
    FROM ims.accounts a
    LEFT JOIN ims.branches b ON b.branch_id = a.branch_id
    WHERE a.branch_id = p_branch_id AND a.is_active = TRUE
    ORDER BY a.name;
  ELSE
    RETURN QUERY
    SELECT 
      a.acc_id,
      a.branch_id,
      a.name,
      a.institution,
      a.currency_code,
      a.balance,
      a.is_active,
      b.branch_name
    FROM ims.accounts a
    LEFT JOIN ims.branches b ON b.branch_id = a.branch_id
    WHERE a.branch_id = p_branch_id
    ORDER BY a.name;
  END IF;
END;
$$;

-- Function to get account balance for a branch
CREATE OR REPLACE FUNCTION ims.fn_branch_total_balance(p_branch_id BIGINT, p_currency_code CHAR(3) DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF p_currency_code IS NOT NULL THEN
    SELECT COALESCE(SUM(balance), 0) INTO v_total
    FROM ims.accounts
    WHERE branch_id = p_branch_id 
      AND currency_code = p_currency_code
      AND is_active = TRUE;
  ELSE
    SELECT COALESCE(SUM(balance), 0) INTO v_total
    FROM ims.accounts
    WHERE branch_id = p_branch_id 
      AND is_active = TRUE;
  END IF;
  
  RETURN v_total;
END;
$$;

COMMIT;

-- =========================================================
-- NOTES FOR APPLICATION IMPLEMENTATION:
-- =========================================================
-- 1. All API endpoints should filter data by user's accessible branches
-- 2. Use fn_user_branches(user_id) to get list of accessible branches
-- 3. Use fn_user_primary_branch(user_id) to get default branch
-- 4. Frontend should allow branch selection if user has multiple branches
-- 5. All CREATE operations should include branch_id
-- 6. All LIST operations should filter by branch_id IN (user's branches)
-- 7. All UPDATE/DELETE operations should verify branch access
-- =========================================================
