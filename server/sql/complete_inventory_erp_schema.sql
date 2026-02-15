/* =========================================================
COMPLETE INVENTORY ERP SCHEMA WITH FINANCIAL MODULES
AND BRANCH-BASED MULTI-TENANCY
=========================================================

BRANCH-BASED MULTI-TENANCY FEATURES:
-------------------------------------

1. USER-BRANCH RELATIONSHIP:
   - New table: user_branch (junction table)
   - Users can belong to multiple branches
   - Each user has a primary branch
   - Flexible access control

2. BRANCH-SPECIFIC DATA:
   Tables with branch_id column for data isolation:
   - categories (branch-specific product categories)
   - suppliers (branch-specific suppliers)
   - customers (branch-specific customers)
   - products (branch-specific products)
   - accounts (branch-specific bank/cash accounts)
   - employees (branch assignments)
   - sales, purchases (branch transactions)
   - inventory_movements (branch inventory tracking)
   - audit_logs (branch audit trails)
   - All other operational tables

3. BRANCH-SCOPED UNIQUE CONSTRAINTS:
   - Product barcodes: unique per branch
   - Category names: unique per branch
   - Allows branches to operate independently

4. HELPER FUNCTIONS:
   - fn_user_branches(user_id): Get all accessible branches
   - fn_user_primary_branch(user_id): Get user's primary branch
   - fn_user_has_branch_access(user_id, branch_id): Check access

5. VIEWS FOR EASY QUERYING:
   - v_branch_products: Products with related data
   - v_branch_customers: Customers with branch info
   - v_branch_suppliers: Suppliers with branch info

6. AUDIT COLUMNS:
   - created_by, updated_by: Track who creates/modifies records
   - created_at, updated_at: Track timestamps

USAGE NOTES:
------------
- All API endpoints should filter data by user's accessible branches
- Use helper functions to get user's branches before querying
- Always include branch_id when creating records
- Validate branch access on all operations

Last Updated: 2026-02-14
========================================================= */
BEGIN;

-- =========================================================
-- 0) CREATE SCHEMA AND SET SEARCH PATH
-- =========================================================
CREATE SCHEMA IF NOT EXISTS ims;
SET search_path TO ims, public;

-- =========================================================
-- 1) ENUM TYPES
-- =========================================================
DO $$
BEGIN
    -- Sales
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='sale_type_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.sale_type_enum AS ENUM ('cash','credit');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='sale_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.sale_status_enum AS ENUM ('paid','partial','unpaid','void');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='charge_type_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.charge_type_enum AS ENUM ('sale','opening','fee','other');
    END IF;

    -- Transfers
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='transfer_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.transfer_status_enum AS ENUM ('draft','sent','received','void');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='wh_transfer_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.wh_transfer_status_enum AS ENUM ('draft','sent','received','void');
    END IF;
    
    -- People
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='sex_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.sex_enum AS ENUM ('male','female');
    END IF;
    
    -- Purchases
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='purchase_type_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.purchase_type_enum AS ENUM ('cash','credit');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='purchase_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.purchase_status_enum AS ENUM ('received','partial','unpaid','void');
    END IF;

    -- Inventory
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='movement_type_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.movement_type_enum AS ENUM (
            'opening','purchase','sale','transfer_out','transfer_in',
            'wh_transfer_out','wh_transfer_in','adjustment',
            'sales_return','purchase_return'
        );
    END IF;
    
    -- Supplier
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='supplier_charge_type_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.supplier_charge_type_enum AS ENUM ('purchase','opening','fee','other');
    END IF;
    
    -- Payroll
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='employment_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.employment_status_enum AS ENUM ('active','inactive','terminated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='salary_type_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.salary_type_enum AS ENUM ('monthly','daily','hourly');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='payroll_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.payroll_status_enum AS ENUM ('draft','posted','void');
    END IF;
    
    -- Financial (NEW)
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='account_type_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.account_type_enum AS ENUM (
            'asset_current', 'asset_fixed', 'asset_other',
            'liability_current', 'liability_longterm',
            'equity', 'revenue', 'cost_of_goods_sold', 
            'expense_operating', 'expense_other', 'expense_tax'
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='journal_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.journal_status_enum AS ENUM ('draft','posted','void');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='depreciation_method_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.depreciation_method_enum AS ENUM ('straight_line','declining_balance');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='asset_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.asset_status_enum AS ENUM ('active','sold','disposed','scrapped');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='tax_return_status_enum' AND n.nspname='ims') THEN
        CREATE TYPE ims.tax_return_status_enum AS ENUM ('pending','filed','paid','overdue');
    END IF;
END $$;

-- =========================================================
-- 2) CONFIGURATION TABLES (Existing)
-- =========================================================

-- Company Info table
CREATE TABLE IF NOT EXISTS ims.company_info (
    company_id INTEGER PRIMARY KEY DEFAULT 1,
    company_name VARCHAR(200) NOT NULL,
    logo_img TEXT,
    banner_img TEXT,
    phone VARCHAR(50),
    manager_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure singleton row exists
INSERT INTO ims.company_info (company_id, company_name)
SELECT 1, 'My Company'
WHERE NOT EXISTS (SELECT 1 FROM ims.company_info WHERE company_id = 1);


CREATE TABLE IF NOT EXISTS ims.currencies (
    currency_code CHAR(3) PRIMARY KEY,
    currency_name VARCHAR(60) NOT NULL,
    symbol VARCHAR(10),
    is_base BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_currency_code_len CHECK (char_length(currency_code)=3)
);

INSERT INTO ims.currencies(currency_code, currency_name, symbol, is_base)
VALUES 
    ('USD','US Dollar','$', TRUE),
    ('SOS','Somali Shilling','S', FALSE)
ON CONFLICT (currency_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS ims.exchange_rates (
    rate_id BIGSERIAL PRIMARY KEY,
    from_currency CHAR(3) NOT NULL REFERENCES ims.currencies(currency_code),
    to_currency CHAR(3) NOT NULL REFERENCES ims.currencies(currency_code),
    rate NUMERIC(18,6) NOT NULL CHECK (rate > 0),
    rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_fx_diff CHECK (from_currency <> to_currency),
    CONSTRAINT uq_fx_day UNIQUE (from_currency, to_currency, rate_date)
);

CREATE TABLE IF NOT EXISTS ims.units (
    unit_id BIGSERIAL PRIMARY KEY,
    unit_name VARCHAR(60) NOT NULL UNIQUE,
    symbol VARCHAR(15),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.taxes (
    tax_id BIGSERIAL PRIMARY KEY,
    tax_name VARCHAR(80) NOT NULL UNIQUE,
    rate_percent NUMERIC(6,3) NOT NULL CHECK (rate_percent >= 0),
    is_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ims.taxes(tax_name, rate_percent, is_inclusive)
VALUES ('VAT', 0, FALSE)
ON CONFLICT (tax_name) DO NOTHING;

-- =========================================================
-- 3) CORE TABLES (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.branches (
    branch_id BIGSERIAL PRIMARY KEY,
    branch_name VARCHAR(120) NOT NULL,
    address TEXT,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.roles (
    role_id BIGSERIAL PRIMARY KEY,
    role_name VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ims.users (
    user_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    role_id BIGINT NOT NULL REFERENCES ims.roles(role_id),
    name VARCHAR(120) NOT NULL,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.user_branch (
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, branch_id)
);

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
END $$;

DROP TRIGGER IF EXISTS trg_sync_user_branch_from_users ON ims.users;
CREATE TRIGGER trg_sync_user_branch_from_users
AFTER INSERT OR UPDATE OF branch_id ON ims.users
FOR EACH ROW
EXECUTE FUNCTION ims.fn_sync_user_branch_from_users();

-- User-Branch Junction Table (Many-to-Many)
-- Allows users to access multiple branches
CREATE TABLE IF NOT EXISTS ims.user_branch (
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_user ON ims.user_branch(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_branch ON ims.user_branch(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_primary ON ims.user_branch(user_id, is_primary) WHERE is_primary = TRUE;

COMMENT ON TABLE ims.user_branch IS 'Junction table linking users to multiple branches they can access';
COMMENT ON COLUMN ims.user_branch.is_primary IS 'Indicates if this is the user''s primary/default branch';

-- Migrate existing users to user_branch table
INSERT INTO ims.user_branch (user_id, branch_id, is_primary)
SELECT user_id, branch_id, TRUE
FROM ims.users
WHERE branch_id IS NOT NULL
ON CONFLICT (user_id, branch_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ims.permissions (
    perm_id BIGSERIAL PRIMARY KEY,
    perm_key VARCHAR(80) NOT NULL UNIQUE,
    perm_name VARCHAR(120) NOT NULL,
    module VARCHAR(50) NOT NULL DEFAULT 'system',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.role_permissions (
    role_id BIGINT NOT NULL REFERENCES ims.roles(role_id),
    perm_id BIGINT NOT NULL REFERENCES ims.permissions(perm_id),
    PRIMARY KEY (role_id, perm_id)
);

CREATE TABLE IF NOT EXISTS ims.user_permissions (
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    perm_id BIGINT NOT NULL REFERENCES ims.permissions(perm_id),
    PRIMARY KEY (user_id, perm_id)
);

CREATE TABLE IF NOT EXISTS ims.audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT REFERENCES ims.branches(branch_id),
    user_id BIGINT REFERENCES ims.users(user_id),
    action VARCHAR(60) NOT NULL,
    entity VARCHAR(40) NOT NULL,
    entity_id BIGINT,
    old_value JSONB,
    new_value JSONB,
    meta JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.notifications (
    notification_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT REFERENCES ims.branches(branch_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    created_by BIGINT REFERENCES ims.users(user_id),
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'system',
    link VARCHAR(240),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    meta JSONB,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- 4) MASTER DATA (Branch-Specific)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.categories (
    cat_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    cat_name VARCHAR(120) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT REFERENCES ims.users(user_id),
    updated_by BIGINT REFERENCES ims.users(user_id)
);

-- Unique constraint: category name must be unique within a branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_branch ON ims.categories(branch_id, cat_name);
CREATE INDEX IF NOT EXISTS idx_categories_branch ON ims.categories(branch_id);

CREATE TABLE IF NOT EXISTS ims.suppliers (
    supplier_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    supplier_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    contact_person VARCHAR(255),
    contact_phone VARCHAR(50),
    phone VARCHAR(50),
    address TEXT,
    location TEXT,
    remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT REFERENCES ims.users(user_id),
    updated_by BIGINT REFERENCES ims.users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON ims.suppliers(branch_id);

CREATE TABLE IF NOT EXISTS ims.products (
    product_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    cat_id BIGINT NOT NULL REFERENCES ims.categories(cat_id),
    supplier_id BIGINT REFERENCES ims.suppliers(supplier_id),
    unit_id BIGINT REFERENCES ims.units(unit_id),
    reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
    reorder_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
    tax_id BIGINT REFERENCES ims.taxes(tax_id),
    name VARCHAR(160) NOT NULL,
    barcode VARCHAR(80),
    open_balance NUMERIC(14,3) NOT NULL DEFAULT 0,
    cost_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    sell_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT REFERENCES ims.users(user_id),
    updated_by BIGINT REFERENCES ims.users(user_id),
    CONSTRAINT chk_product_prices CHECK (cost_price >= 0 AND sell_price >= 0),
    CONSTRAINT chk_reorder_vals CHECK (reorder_level >= 0 AND reorder_qty >= 0)
);

-- Unique constraint: barcode must be unique within a branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_branch ON ims.products(branch_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_branch ON ims.products(branch_id);

CREATE TABLE IF NOT EXISTS ims.product_price_history (
    price_hist_id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    old_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    new_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    old_sell NUMERIC(14,2) NOT NULL DEFAULT 0,
    new_sell NUMERIC(14,2) NOT NULL DEFAULT 0,
    changed_by BIGINT REFERENCES ims.users(user_id),
    reason TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION ims.fn_product_price_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.cost_price IS DISTINCT FROM OLD.cost_price)
    OR (NEW.sell_price IS DISTINCT FROM OLD.sell_price) THEN
        INSERT INTO ims.product_price_history(
            product_id, old_cost, new_cost, old_sell, new_sell, changed_by, reason
        ) VALUES (
            OLD.product_id,
            COALESCE(OLD.cost_price,0), COALESCE(NEW.cost_price,0),
            COALESCE(OLD.sell_price,0), COALESCE(NEW.sell_price,0),
            NULL,
            'Auto log: price changed'
        );
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_product_price_history ON ims.products;
CREATE TRIGGER trg_product_price_history
AFTER UPDATE OF cost_price, sell_price ON ims.products
FOR EACH ROW EXECUTE FUNCTION ims.fn_product_price_history();

-- =========================================================
-- 5) INVENTORY & WAREHOUSE (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.warehouses (
    wh_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    wh_name VARCHAR(120) NOT NULL,
    location TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_warehouse UNIQUE (branch_id, wh_name)
);

CREATE TABLE IF NOT EXISTS ims.warehouse_stock (
    wh_id BIGINT NOT NULL REFERENCES ims.warehouses(wh_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
    PRIMARY KEY (wh_id, product_id),
    CONSTRAINT chk_wh_stock_qty CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS ims.branch_stock (
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
    PRIMARY KEY (branch_id, product_id),
    CONSTRAINT chk_branch_stock_qty CHECK (quantity >= 0)
);

-- =========================================================
-- 6) CUSTOMERS (Branch-Specific)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.customers (
    customer_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    full_name VARCHAR(160) NOT NULL,
    phone VARCHAR(30),
    sex ims.sex_enum,
    address TEXT,
    registered_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT REFERENCES ims.users(user_id),
    updated_by BIGINT REFERENCES ims.users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_branch ON ims.customers(branch_id);

-- =========================================================
-- 7) ACCOUNTS & RECEIVABLES (Branch-Specific)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.accounts (
    acc_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    name VARCHAR(120) NOT NULL,
    institution VARCHAR(120),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES ims.currencies(currency_code),
    balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT REFERENCES ims.users(user_id),
    updated_by BIGINT REFERENCES ims.users(user_id),
    CONSTRAINT chk_acc_balance CHECK (balance >= 0),
    CONSTRAINT uq_account_name_per_branch UNIQUE (branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_accounts_branch ON ims.accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON ims.accounts(branch_id, is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS ims.charges (
    charge_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    customer_id BIGINT NOT NULL REFERENCES ims.customers(customer_id),
    sale_id BIGINT,
    charge_type ims.charge_type_enum NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    charge_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    CONSTRAINT chk_charge_amount CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS ims.receipts (
    receipt_id BIGSERIAL PRIMARY KEY,
    charge_id BIGINT NOT NULL REFERENCES ims.charges(charge_id),
    customer_id BIGINT REFERENCES ims.customers(customer_id),
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES ims.currencies(currency_code),
    fx_rate NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    receipt_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount NUMERIC(14,2) NOT NULL,
    reference_no VARCHAR(80),
    note TEXT,
    CONSTRAINT chk_receipt_amount CHECK (amount > 0)
);

-- =========================================================
-- 8) SALES (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.sales (
    sale_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    wh_id BIGINT REFERENCES ims.warehouses(wh_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    customer_id BIGINT REFERENCES ims.customers(customer_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES ims.currencies(currency_code),
    fx_rate NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    tax_id BIGINT REFERENCES ims.taxes(tax_id),
    total_before_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sale_type ims.sale_type_enum NOT NULL DEFAULT 'cash',
    doc_type VARCHAR(20) NOT NULL DEFAULT 'sale',
    quote_valid_until DATE,
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    status ims.sale_status_enum NOT NULL DEFAULT 'paid',
    note TEXT,
    pay_acc_id BIGINT REFERENCES ims.accounts(acc_id),
    paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_stock_applied BOOLEAN NOT NULL DEFAULT TRUE,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    CONSTRAINT chk_sales_amounts CHECK (subtotal >= 0 AND discount >= 0 AND total >= 0),
    CONSTRAINT chk_sales_doc_type CHECK (doc_type IN ('sale', 'invoice', 'quotation')),
    CONSTRAINT chk_sales_paid_amount CHECK (paid_amount >= 0)
);

ALTER TABLE IF EXISTS ims.sales
  ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS quote_valid_until DATE,
  ADD COLUMN IF NOT EXISTS pay_acc_id BIGINT REFERENCES ims.accounts(acc_id),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_stock_applied BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_sales_doc_type'
       AND conrelid = 'ims.sales'::regclass
  ) THEN
    ALTER TABLE ims.sales
      ADD CONSTRAINT chk_sales_doc_type
      CHECK (doc_type IN ('sale', 'invoice', 'quotation'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_sales_paid_amount'
       AND conrelid = 'ims.sales'::regclass
  ) THEN
    ALTER TABLE ims.sales
      ADD CONSTRAINT chk_sales_paid_amount
      CHECK (paid_amount >= 0);
  END IF;
END $$;

ALTER TABLE ims.charges
DROP CONSTRAINT IF EXISTS fk_charges_sale;
ALTER TABLE ims.charges
ADD CONSTRAINT fk_charges_sale
FOREIGN KEY (sale_id) REFERENCES ims.sales(sale_id)
ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ims.sale_items (
    sale_item_id BIGSERIAL PRIMARY KEY,
    sale_id BIGINT NOT NULL REFERENCES ims.sales(sale_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_sale_item_vals CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0)
);

-- =========================================================
-- 9) PURCHASES & PAYABLES (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.purchases (
    purchase_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    wh_id BIGINT REFERENCES ims.warehouses(wh_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    supplier_id BIGINT NOT NULL REFERENCES ims.suppliers(supplier_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES ims.currencies(currency_code),
    fx_rate NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      purchase_type ims.purchase_type_enum NOT NULL DEFAULT 'cash',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    status ims.purchase_status_enum NOT NULL DEFAULT 'received',
    note TEXT,
    CONSTRAINT chk_purchase_amounts CHECK (subtotal >= 0 AND discount >= 0 AND total >= 0)
);

CREATE TABLE IF NOT EXISTS ims.purchase_items (
    purchase_item_id BIGSERIAL PRIMARY KEY,
    purchase_id BIGINT NOT NULL REFERENCES ims.purchases(purchase_id),
    product_id BIGINT REFERENCES ims.products(product_id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    sale_price NUMERIC(14,2),
    line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    batch_no VARCHAR(80),
    expiry_date DATE,
    discount NUMERIC(14,2) NOT NULL DEFAULT 0,
    description VARCHAR(240),
    CONSTRAINT chk_purchase_item_vals CHECK (quantity > 0 AND unit_cost >= 0 AND line_total >= 0)
);

-- Ensure new columns exist for legacy databases
ALTER TABLE IF EXISTS ims.purchase_items
  ADD COLUMN IF NOT EXISTS discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description VARCHAR(240),
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14,2);

CREATE TABLE IF NOT EXISTS ims.supplier_charges (
    sup_charge_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    supplier_id BIGINT NOT NULL REFERENCES ims.suppliers(supplier_id),
    purchase_id BIGINT REFERENCES ims.purchases(purchase_id),
    charge_type ims.supplier_charge_type_enum NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    charge_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    CONSTRAINT chk_sup_charge_amount CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS ims.supplier_payments (
    sup_payment_id BIGSERIAL PRIMARY KEY,
    sup_charge_id BIGINT NOT NULL REFERENCES ims.supplier_charges(sup_charge_id),
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES ims.currencies(currency_code),
    fx_rate NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    pay_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount_paid NUMERIC(14,2) NOT NULL,
    reference_no VARCHAR(80),
    note TEXT,
    CONSTRAINT chk_sup_paid_amount CHECK (amount_paid > 0)
);

-- =========================================================
-- 10) EXPENSES (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.expenses (
    exp_no BIGSERIAL PRIMARY KEY,
    exp_name VARCHAR(140) NOT NULL,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    description TEXT
);

CREATE TABLE IF NOT EXISTS ims.expense_charge (
    exp_charge_no BIGSERIAL PRIMARY KEY,
    exp_no BIGINT NOT NULL REFERENCES ims.expenses(exp_no),
    amount NUMERIC(14,2) NOT NULL,
    charge_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_exp_charge_amount CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS ims.expense_payment (
    exp_payment_no BIGSERIAL PRIMARY KEY,
    exp_charge_no BIGINT NOT NULL REFERENCES ims.expense_charge(exp_charge_no),
    acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES ims.currencies(currency_code),
    fx_rate NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    amount_paid NUMERIC(14,2) NOT NULL,
    pay_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference_no VARCHAR(80),
    note TEXT,
    CONSTRAINT chk_exp_paid_amount CHECK (amount_paid > 0)
);

-- =========================================================
-- 11) TRANSFERS (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.transfers (
    transfer_id BIGSERIAL PRIMARY KEY,
    from_branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    to_branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status ims.transfer_status_enum NOT NULL DEFAULT 'draft',
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    note TEXT,
    CONSTRAINT chk_transfer_branches CHECK (from_branch_id <> to_branch_id)
);

CREATE TABLE IF NOT EXISTS ims.transfer_items (
    transfer_item_id BIGSERIAL PRIMARY KEY,
    transfer_id BIGINT NOT NULL REFERENCES ims.transfers(transfer_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_transfer_item_vals CHECK (quantity > 0 AND unit_cost >= 0)
);

CREATE TABLE IF NOT EXISTS ims.warehouse_transfers (
    wh_transfer_id BIGSERIAL PRIMARY KEY,
    from_wh_id BIGINT NOT NULL REFERENCES ims.warehouses(wh_id),
    to_wh_id BIGINT NOT NULL REFERENCES ims.warehouses(wh_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status ims.wh_transfer_status_enum NOT NULL DEFAULT 'draft',
    note TEXT,
    CONSTRAINT chk_wh_transfer_diff CHECK (from_wh_id <> to_wh_id)
);

CREATE TABLE IF NOT EXISTS ims.warehouse_transfer_items (
    wh_transfer_item_id BIGSERIAL PRIMARY KEY,
    wh_transfer_id BIGINT NOT NULL REFERENCES ims.warehouse_transfers(wh_transfer_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_wh_tr_item_vals CHECK (quantity > 0 AND unit_cost >= 0)
);

-- =========================================================
-- 12) INVENTORY MOVEMENTS (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.inventory_movements (
    move_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    wh_id BIGINT REFERENCES ims.warehouses(wh_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    move_type ims.movement_type_enum NOT NULL,
    ref_table VARCHAR(40),
    ref_id BIGINT,
    qty_in NUMERIC(14,3) NOT NULL DEFAULT 0,
    qty_out NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    move_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    CONSTRAINT chk_move_qty CHECK (qty_in >= 0 AND qty_out >= 0 AND (qty_in + qty_out) > 0)
);

-- =========================================================
-- 13) ADJUSTMENTS & RETURNS (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.stock_adjustments (
    adj_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    wh_id BIGINT REFERENCES ims.warehouses(wh_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    adj_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason VARCHAR(120),
    note TEXT
);

CREATE TABLE IF NOT EXISTS ims.stock_adjustment_items (
    adj_item_id BIGSERIAL PRIMARY KEY,
    adj_id BIGINT NOT NULL REFERENCES ims.stock_adjustments(adj_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    qty_change NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ims.sales_returns (
    sr_id BIGSERIAL PRIMARY KEY,
    sale_id BIGINT REFERENCES ims.sales(sale_id),
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    wh_id BIGINT REFERENCES ims.warehouses(wh_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    customer_id BIGINT REFERENCES ims.customers(customer_id),
    return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    note TEXT,
    CONSTRAINT chk_sr_amount CHECK (subtotal >= 0 AND total >= 0)
);

CREATE TABLE IF NOT EXISTS ims.sales_return_items (
    sr_item_id BIGSERIAL PRIMARY KEY,
    sr_id BIGINT NOT NULL REFERENCES ims.sales_returns(sr_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_sr_item_vals CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0)
);

CREATE TABLE IF NOT EXISTS ims.purchase_returns (
    pr_id BIGSERIAL PRIMARY KEY,
    purchase_id BIGINT REFERENCES ims.purchases(purchase_id),
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    wh_id BIGINT REFERENCES ims.warehouses(wh_id),
    user_id BIGINT NOT NULL REFERENCES ims.users(user_id),
    supplier_id BIGINT NOT NULL REFERENCES ims.suppliers(supplier_id),
    return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    note TEXT,
    CONSTRAINT chk_pr_amount CHECK (subtotal >= 0 AND total >= 0)
);

CREATE TABLE IF NOT EXISTS ims.purchase_return_items (
    pr_item_id BIGSERIAL PRIMARY KEY,
    pr_id BIGINT NOT NULL REFERENCES ims.purchase_returns(pr_id),
    product_id BIGINT NOT NULL REFERENCES ims.products(product_id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_pr_item_vals CHECK (quantity > 0 AND unit_cost >= 0 AND line_total >= 0)
);

-- =========================================================
-- 14) EMPLOYEES & PAYROLL (Existing)
-- =========================================================
CREATE TABLE IF NOT EXISTS ims.employees (
    emp_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    user_id BIGINT UNIQUE REFERENCES ims.users(user_id),
    full_name VARCHAR(160) NOT NULL,
    phone VARCHAR(30),
    address TEXT,
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status ims.employment_status_enum NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.salary_types (
    sal_type_id BIGSERIAL PRIMARY KEY,
    type_name VARCHAR(60) NOT NULL UNIQUE,
    base_type ims.salary_type_enum NOT NULL
);

CREATE TABLE IF NOT EXISTS ims.employee_salary (
    emp_sal_id BIGSERIAL PRIMARY KEY,
    emp_id BIGINT NOT NULL REFERENCES ims.employees(emp_id),
    sal_type_id BIGINT NOT NULL REFERENCES ims.salary_types(sal_type_id),
    basic_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_emp_salary_amount CHECK (basic_salary >= 0),
    CONSTRAINT chk_emp_salary_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS ims.payroll_runs (
    payroll_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    created_by BIGINT NOT NULL REFERENCES ims.users(user_id),
    period_year INT NOT NULL,
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    status ims.payroll_status_enum NOT NULL DEFAULT 'draft',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payroll_period UNIQUE (branch_id, period_year, period_month),
    CONSTRAINT chk_payroll_dates CHECK (period_to >= period_from)
);

CREATE TABLE IF NOT EXISTS ims.payroll_lines (
    payroll_line_id BIGSERIAL PRIMARY KEY,
    payroll_id BIGINT NOT NULL REFERENCES ims.payroll_runs(payroll_id),
    emp_id BIGINT NOT NULL REFERENCES ims.employees(emp_id),
    basic_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
    allowances NUMERIC(14,2) NOT NULL DEFAULT 0,
    deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
    note TEXT,
    CONSTRAINT uq_payroll_emp UNIQUE (payroll_id, emp_id),
    CONSTRAINT chk_payroll_line_amounts CHECK (
        basic_salary >= 0 AND allowances >= 0 AND deductions >= 0 AND net_salary >= 0
    )
);

CREATE TABLE IF NOT EXISTS ims.employee_payments (
    emp_payment_id BIGSERIAL PRIMARY KEY,
    payroll_id BIGINT REFERENCES ims.payroll_runs(payroll_id),
    payroll_line_id BIGINT REFERENCES ims.payroll_lines(payroll_line_id),
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    emp_id BIGINT NOT NULL REFERENCES ims.employees(emp_id),
    paid_by BIGINT NOT NULL REFERENCES ims.users(user_id),
    acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id),
    pay_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount_paid NUMERIC(14,2) NOT NULL,
    reference_no VARCHAR(80),
    note TEXT,
    CONSTRAINT chk_emp_paid_amount CHECK (amount_paid > 0)
);

CREATE TABLE IF NOT EXISTS ims.employee_loans (
    loan_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    emp_id BIGINT NOT NULL REFERENCES ims.employees(emp_id),
    created_by BIGINT NOT NULL REFERENCES ims.users(user_id),
    loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(14,2) NOT NULL,
    note TEXT,
    CONSTRAINT chk_loan_amount CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS ims.loan_payments (
    loan_payment_id BIGSERIAL PRIMARY KEY,
    loan_id BIGINT NOT NULL REFERENCES ims.employee_loans(loan_id),
    acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id),
    paid_by BIGINT NOT NULL REFERENCES ims.users(user_id),
    pay_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount_paid NUMERIC(14,2) NOT NULL,
    reference_no VARCHAR(80),
    note TEXT,
    CONSTRAINT chk_loan_payment_amount CHECK (amount_paid > 0)
);

-- =========================================================
-- 15) FINANCIAL MANAGEMENT - NEW TABLES (MISSING)
-- =========================================================

-- 15.1) CHART OF ACCOUNTS
CREATE TABLE IF NOT EXISTS ims.chart_of_accounts (
    account_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT REFERENCES ims.branches(branch_id),
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(160) NOT NULL,
    account_type ims.account_type_enum NOT NULL,
    parent_account_id BIGINT REFERENCES ims.chart_of_accounts(account_id),
    normal_balance CHAR(1) NOT NULL DEFAULT 'D' CHECK (normal_balance IN ('D','C')),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES ims.currencies(currency_code),
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_by BIGINT REFERENCES ims.users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_account_code_per_branch UNIQUE (branch_id, account_code)
);

-- 15.2) JOURNAL ENTRIES
CREATE TABLE IF NOT EXISTS ims.journal_entries (
    entry_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number VARCHAR(40) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    currency_code CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES ims.currencies(currency_code),
    fx_rate NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    total_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    status ims.journal_status_enum NOT NULL DEFAULT 'draft',
    source_module VARCHAR(50), -- 'sales', 'purchases', 'payroll', 'manual'
    source_id BIGINT, -- Reference to source transaction
    posted_by BIGINT REFERENCES ims.users(user_id),
    posted_at TIMESTAMPTZ,
    created_by BIGINT NOT NULL REFERENCES ims.users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    CONSTRAINT chk_journal_balance CHECK (total_debit = total_credit)
);

-- 15.3) JOURNAL ENTRY LINES
CREATE TABLE IF NOT EXISTS ims.journal_entry_lines (
    line_id BIGSERIAL PRIMARY KEY,
    entry_id BIGINT NOT NULL REFERENCES ims.journal_entries(entry_id),
    account_id BIGINT NOT NULL REFERENCES ims.chart_of_accounts(account_id),
    debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    description TEXT,
    reference_table VARCHAR(40),
    reference_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_line_amount CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR 
        (credit_amount > 0 AND debit_amount = 0)
    )
);

-- 15.4) FIXED ASSETS
CREATE TABLE IF NOT EXISTS ims.fixed_assets (
    asset_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    asset_code VARCHAR(40) NOT NULL UNIQUE,
    asset_name VARCHAR(160) NOT NULL,
    asset_category VARCHAR(80) NOT NULL,
    purchase_date DATE NOT NULL,
    purchase_cost NUMERIC(14,2) NOT NULL,
    supplier_id BIGINT REFERENCES ims.suppliers(supplier_id),
    useful_life_years INT NOT NULL,
    salvage_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    current_book_value NUMERIC(14,2) NOT NULL,
    depreciation_method ims.depreciation_method_enum NOT NULL DEFAULT 'straight_line',
    status ims.asset_status_enum NOT NULL DEFAULT 'active',
    location VARCHAR(200),
    serial_number VARCHAR(100),
    notes TEXT,
    created_by BIGINT REFERENCES ims.users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15.5) ASSET DEPRECIATION
CREATE TABLE IF NOT EXISTS ims.asset_depreciation (
    dep_id BIGSERIAL PRIMARY KEY,
    asset_id BIGINT NOT NULL REFERENCES ims.fixed_assets(asset_id),
    fiscal_year INT NOT NULL,
    fiscal_month INT NOT NULL CHECK (fiscal_month BETWEEN 1 AND 12),
    depreciation_amount NUMERIC(14,2) NOT NULL,
    accumulated_depreciation NUMERIC(14,2) NOT NULL DEFAULT 0,
    book_value_after NUMERIC(14,2) NOT NULL,
    journal_entry_id BIGINT REFERENCES ims.journal_entries(entry_id),
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_at TIMESTAMPTZ,
    CONSTRAINT uq_asset_dep_period UNIQUE (asset_id, fiscal_year, fiscal_month)
);

-- 15.6) FISCAL PERIODS
CREATE TABLE IF NOT EXISTS ims.fiscal_periods (
    period_id BIGSERIAL PRIMARY KEY,
    period_name VARCHAR(80) NOT NULL,
    period_year INT NOT NULL,
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    closed_by BIGINT REFERENCES ims.users(user_id),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fiscal_period UNIQUE (period_year, period_month),
    CONSTRAINT chk_period_dates CHECK (end_date >= start_date)
);

-- 15.7) INCOME STATEMENTS
CREATE TABLE IF NOT EXISTS ims.income_statements (
    statement_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    period_id BIGINT NOT NULL REFERENCES ims.fiscal_periods(period_id),
    total_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_cogs NUMERIC(14,2) NOT NULL DEFAULT 0,
    gross_profit NUMERIC(14,2) NOT NULL DEFAULT 0,
    operating_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_income NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_profit_before_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_expense NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_profit_after_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
    generated_by BIGINT NOT NULL REFERENCES ims.users(user_id),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    CONSTRAINT uq_income_statement UNIQUE (branch_id, period_id)
);

-- 15.8) BALANCE SHEETS
CREATE TABLE IF NOT EXISTS ims.balance_sheets (
    balance_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    period_id BIGINT NOT NULL REFERENCES ims.fiscal_periods(period_id),
    total_assets NUMERIC(14,2) NOT NULL DEFAULT 0,
    current_assets NUMERIC(14,2) NOT NULL DEFAULT 0,
    fixed_assets NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_assets NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_liabilities NUMERIC(14,2) NOT NULL DEFAULT 0,
    current_liabilities NUMERIC(14,2) NOT NULL DEFAULT 0,
    long_term_liabilities NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_equity NUMERIC(14,2) NOT NULL DEFAULT 0,
    share_capital NUMERIC(14,2) NOT NULL DEFAULT 0,
    retained_earnings NUMERIC(14,2) NOT NULL DEFAULT 0,
    generated_by BIGINT NOT NULL REFERENCES ims.users(user_id),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    CONSTRAINT uq_balance_sheet UNIQUE (branch_id, period_id),
    CONSTRAINT chk_balance_check CHECK (
        ABS(total_assets - (total_liabilities + total_equity)) <= 0.01
    )
);

-- 15.9) TRIAL BALANCE
CREATE TABLE IF NOT EXISTS ims.trial_balances (
    trial_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    period_id BIGINT NOT NULL REFERENCES ims.fiscal_periods(period_id),
    account_id BIGINT NOT NULL REFERENCES ims.chart_of_accounts(account_id),
    opening_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    opening_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    period_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    period_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    closing_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    closing_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_trial_account UNIQUE (branch_id, period_id, account_id)
);

-- 15.10) BUDGETS
CREATE TABLE IF NOT EXISTS ims.budgets (
    budget_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    budget_name VARCHAR(160) NOT NULL,
    budget_year INT NOT NULL,
    budget_month INT CHECK (budget_month BETWEEN 1 AND 12),
    account_id BIGINT NOT NULL REFERENCES ims.chart_of_accounts(account_id),
    budget_amount NUMERIC(14,2) NOT NULL,
    actual_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    variance_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    variance_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
    created_by BIGINT NOT NULL REFERENCES ims.users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    CONSTRAINT uq_budget_period UNIQUE (branch_id, budget_year, budget_month, account_id)
);

-- 15.11) TAX RETURNS
CREATE TABLE IF NOT EXISTS ims.tax_returns (
    tax_return_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    tax_id BIGINT NOT NULL REFERENCES ims.taxes(tax_id),
    period_id BIGINT NOT NULL REFERENCES ims.fiscal_periods(period_id),
    taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_payable NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_due NUMERIC(14,2) NOT NULL DEFAULT 0,
    filing_date DATE,
    payment_date DATE,
    status ims.tax_return_status_enum NOT NULL DEFAULT 'pending',
    reference_no VARCHAR(100),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tax_return_period UNIQUE (branch_id, tax_id, period_id)
);

-- =========================================================
-- 15.12) SOFT DELETE BASELINE (applies on fresh init)
-- Ensures core inventory tables support soft delete on first load
-- (Triggers/migrations may also add these; keeping here for portability)
-- =========================================================
ALTER TABLE ims.products
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE ims.warehouses
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE ims.branches
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE ims.warehouse_stock
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE ims.branch_stock
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE ims.inventory_movements
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- =========================================================
-- 16) CREATE INDEXES FOR ALL TABLES
-- =========================================================

-- Existing table indexes
CREATE INDEX IF NOT EXISTS idx_users_branch ON ims.users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON ims.users(role_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_user ON ims.user_branch(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_branch ON ims.user_branch(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_primary ON ims.user_branch(user_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_cat ON ims.products(cat_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON ims.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_unit ON ims.products(unit_id);
CREATE INDEX IF NOT EXISTS idx_products_tax ON ims.products(tax_id);
CREATE INDEX IF NOT EXISTS idx_wh_branch ON ims.warehouses(branch_id);
CREATE INDEX IF NOT EXISTS idx_wh_stock_product ON ims.warehouse_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_branch_stock_prod ON ims.branch_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON ims.sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_wh ON ims.sales(wh_id);
CREATE INDEX IF NOT EXISTS idx_sales_user ON ims.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON ims.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON ims.sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_doc_type_status ON ims.sales(doc_type, status);
CREATE INDEX IF NOT EXISTS idx_sales_pay_acc ON ims.sales(pay_acc_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON ims.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON ims.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_charges_branch ON ims.charges(branch_id);
CREATE INDEX IF NOT EXISTS idx_charges_customer ON ims.charges(customer_id);
CREATE INDEX IF NOT EXISTS idx_charges_sale ON ims.charges(sale_id);
CREATE INDEX IF NOT EXISTS idx_receipts_charge ON ims.receipts(charge_id);
CREATE INDEX IF NOT EXISTS idx_receipts_branch ON ims.receipts(branch_id);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON ims.receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_acc ON ims.receipts(acc_id);
CREATE INDEX IF NOT EXISTS idx_purchases_branch ON ims.purchases(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_wh ON ims.purchases(wh_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON ims.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_pid ON ims.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_prd ON ims.purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sup_charges_supplier ON ims.supplier_charges(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sup_pay_charge ON ims.supplier_payments(sup_charge_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON ims.expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON ims.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON ims.transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON ims.transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_tr ON ims.transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_wh_tr_from ON ims.warehouse_transfers(from_wh_id);
CREATE INDEX IF NOT EXISTS idx_wh_tr_to ON ims.warehouse_transfers(to_wh_id);
CREATE INDEX IF NOT EXISTS idx_wh_tr_items_tr ON ims.warehouse_transfer_items(wh_transfer_id);
CREATE INDEX IF NOT EXISTS idx_inv_move_bp ON ims.inventory_movements(branch_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inv_move_wh ON ims.inventory_movements(wh_id);
CREATE INDEX IF NOT EXISTS idx_inv_move_date ON ims.inventory_movements(move_date);
CREATE INDEX IF NOT EXISTS idx_inv_move_type ON ims.inventory_movements(move_type);
CREATE INDEX IF NOT EXISTS idx_adj_items_adj ON ims.stock_adjustment_items(adj_id);
CREATE INDEX IF NOT EXISTS idx_adj_items_prd ON ims.stock_adjustment_items(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON ims.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON ims.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON ims.audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON ims.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON ims.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON ims.notifications(user_id, is_read)
WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_employees_branch ON ims.employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_emp_salary_emp ON ims.employee_salary(emp_id);
CREATE INDEX IF NOT EXISTS idx_payroll_branch ON ims.payroll_runs(branch_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_emp ON ims.payroll_lines(emp_id);
CREATE INDEX IF NOT EXISTS idx_emp_pay_emp ON ims.employee_payments(emp_id);
CREATE INDEX IF NOT EXISTS idx_loan_emp ON ims.employee_loans(emp_id);
CREATE INDEX IF NOT EXISTS idx_loan_pay_loan ON ims.loan_payments(loan_id);

-- New financial table indexes
CREATE INDEX IF NOT EXISTS idx_coa_branch ON ims.chart_of_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_coa_parent ON ims.chart_of_accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_coa_type ON ims.chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_coa_code ON ims.chart_of_accounts(account_code);

CREATE INDEX IF NOT EXISTS idx_journal_branch ON ims.journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_date ON ims.journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_status ON ims.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_number ON ims.journal_entries(entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_source ON ims.journal_entries(source_module, source_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON ims.journal_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON ims.journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_ref ON ims.journal_entry_lines(reference_table, reference_id);

CREATE INDEX IF NOT EXISTS idx_assets_branch ON ims.fixed_assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_assets_category ON ims.fixed_assets(asset_category);
CREATE INDEX IF NOT EXISTS idx_assets_status ON ims.fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_supplier ON ims.fixed_assets(supplier_id);

CREATE INDEX IF NOT EXISTS idx_dep_asset ON ims.asset_depreciation(asset_id);
CREATE INDEX IF NOT EXISTS idx_dep_period ON ims.asset_depreciation(fiscal_year, fiscal_month);
CREATE INDEX IF NOT EXISTS idx_dep_journal ON ims.asset_depreciation(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_period_dates ON ims.fiscal_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_period_closed ON ims.fiscal_periods(is_closed);
CREATE INDEX IF NOT EXISTS idx_period_year_month ON ims.fiscal_periods(period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_income_period ON ims.income_statements(period_id);
CREATE INDEX IF NOT EXISTS idx_income_branch_period ON ims.income_statements(branch_id, period_id);

CREATE INDEX IF NOT EXISTS idx_balance_period ON ims.balance_sheets(period_id);
CREATE INDEX IF NOT EXISTS idx_balance_branch_period ON ims.balance_sheets(branch_id, period_id);

CREATE INDEX IF NOT EXISTS idx_trial_period ON ims.trial_balances(period_id);
CREATE INDEX IF NOT EXISTS idx_trial_account ON ims.trial_balances(account_id);
CREATE INDEX IF NOT EXISTS idx_trial_branch_period ON ims.trial_balances(branch_id, period_id);

CREATE INDEX IF NOT EXISTS idx_budget_period ON ims.budgets(budget_year, budget_month);
CREATE INDEX IF NOT EXISTS idx_budget_account ON ims.budgets(account_id);
CREATE INDEX IF NOT EXISTS idx_budget_branch_period ON ims.budgets(branch_id, budget_year, budget_month);

CREATE INDEX IF NOT EXISTS idx_tax_return_period ON ims.tax_returns(period_id);
CREATE INDEX IF NOT EXISTS idx_tax_return_status ON ims.tax_returns(status);
CREATE INDEX IF NOT EXISTS idx_tax_return_branch_period ON ims.tax_returns(branch_id, period_id);

-- =========================================================
-- 17) SEED BASIC FINANCIAL DATA
-- =========================================================
INSERT INTO ims.fiscal_periods (period_name, period_year, period_month, start_date, end_date)
VALUES 
    ('January 2024', 2024, 1, '2024-01-01', '2024-01-31'),
    ('February 2024', 2024, 2, '2024-02-01', '2024-02-29'),
    ('March 2024', 2024, 3, '2024-03-01', '2024-03-31'),
    ('April 2024', 2024, 4, '2024-04-01', '2024-04-30'),
    ('May 2024', 2024, 5, '2024-05-01', '2024-05-31'),
    ('June 2024', 2024, 6, '2024-06-01', '2024-06-30')
ON CONFLICT DO NOTHING;

-- =========================================================
-- 18) BRANCH-BASED MULTI-TENANCY HELPER FUNCTIONS
-- =========================================================

-- Function to get all branches a user has access to
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

-- Function to get user's primary branch
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

-- Function to check if user has access to a specific branch
CREATE OR REPLACE FUNCTION ims.fn_user_has_branch_access(p_user_id BIGINT, p_branch_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM ims.user_branch
    WHERE user_id = p_user_id AND branch_id = p_branch_id
  );
END;
$$;

COMMENT ON FUNCTION ims.fn_user_has_branch_access IS 'Checks if user has access to a specific branch';

-- =========================================================
-- 19) BRANCH-BASED VIEWS FOR EASIER QUERYING
-- =========================================================

-- View for products with related data
CREATE OR REPLACE VIEW ims.v_branch_products AS
SELECT 
  p.*,
  c.cat_name,
  u.unit_name,
  u.symbol as unit_symbol,
  s.supplier_name,
  t.tax_name,
  t.rate_percent as tax_rate,
  b.branch_name
FROM ims.products p
LEFT JOIN ims.categories c ON c.cat_id = p.cat_id
LEFT JOIN ims.units u ON u.unit_id = p.unit_id
LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
LEFT JOIN ims.taxes t ON t.tax_id = p.tax_id
LEFT JOIN ims.branches b ON b.branch_id = p.branch_id;

COMMENT ON VIEW ims.v_branch_products IS 'Products with related data including branch information';

-- View for customers with branch info
CREATE OR REPLACE VIEW ims.v_branch_customers AS
SELECT 
  c.*,
  b.branch_name
FROM ims.customers c
LEFT JOIN ims.branches b ON b.branch_id = c.branch_id;

COMMENT ON VIEW ims.v_branch_customers IS 'Customers with branch information';

-- View for suppliers with branch info
CREATE OR REPLACE VIEW ims.v_branch_suppliers AS
SELECT 
  s.*,
  b.branch_name
FROM ims.suppliers s
LEFT JOIN ims.branches b ON b.branch_id = s.branch_id;

COMMENT ON VIEW ims.v_branch_suppliers IS 'Suppliers with branch information';

-- View for accounts with branch info
CREATE OR REPLACE VIEW ims.v_branch_accounts AS
SELECT 
  a.*,
  b.branch_name,
  c.currency_name,
  c.symbol as currency_symbol
FROM ims.accounts a
LEFT JOIN ims.branches b ON b.branch_id = a.branch_id
LEFT JOIN ims.currencies c ON c.currency_code = a.currency_code;

COMMENT ON VIEW ims.v_branch_accounts IS 'Accounts with branch and currency information';

-- View for active accounts per branch
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

COMMENT ON VIEW ims.v_active_branch_accounts IS 'Active accounts with branch and currency information';

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

COMMENT ON FUNCTION ims.fn_branch_accounts IS 'Returns accounts for a specific branch, optionally filtered by active status';

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

COMMENT ON FUNCTION ims.fn_branch_total_balance IS 'Returns total balance of all active accounts for a branch, optionally filtered by currency';

-- =========================================================
-- 20) AUTOMATIC BRANCH CONTEXT MANAGEMENT
-- =========================================================

-- Set current user and branch context for session
CREATE OR REPLACE FUNCTION ims.set_current_context(p_user_id BIGINT, p_branch_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  -- Set session variables for current user and branch
  PERFORM set_config('app.current_user_id', p_user_id::text, false);
  PERFORM set_config('app.current_branch_id', p_branch_id::text, false);
END;
$$;

COMMENT ON FUNCTION ims.set_current_context IS 'Sets current user and branch context in session for automatic branch_id population';

-- Get current branch from session
CREATE OR REPLACE FUNCTION ims.get_current_branch()
RETURNS BIGINT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_value TEXT;
BEGIN
  v_value := current_setting('app.current_branch_id', true);
  IF v_value IS NULL OR v_value = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_value::BIGINT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION ims.get_current_branch IS 'Gets current branch_id from session context';

-- Get current user from session
CREATE OR REPLACE FUNCTION ims.get_current_user()
RETURNS BIGINT
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '')::BIGINT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION ims.get_current_user IS 'Gets current user_id from session context';

-- =========================================================
-- 21) AUTO-POPULATE BRANCH_ID TRIGGERS
-- =========================================================

-- Generic trigger function to auto-populate branch_id on INSERT
CREATE OR REPLACE FUNCTION ims.trg_auto_branch_id()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_branch_id BIGINT;
  v_user_id BIGINT;
BEGIN
  -- Get current branch and user from session
  v_branch_id := ims.get_current_branch();
  v_user_id := ims.get_current_user();
  
  -- On INSERT: auto-populate branch_id if not provided
  IF TG_OP = 'INSERT' THEN
    IF NEW.branch_id IS NULL THEN
      IF v_branch_id IS NOT NULL THEN
        -- Use session branch_id
        NEW.branch_id := v_branch_id;
      ELSE
        -- Fallback: Get user's primary branch from users table if user_id is available
        IF v_user_id IS NOT NULL THEN
          SELECT branch_id INTO NEW.branch_id
          FROM ims.users
          WHERE user_id = v_user_id
          LIMIT 1;
        END IF;
        
        -- If still NULL, try to get first available branch
        IF NEW.branch_id IS NULL THEN
          SELECT branch_id INTO NEW.branch_id
          FROM ims.branches
          WHERE is_active = TRUE
          ORDER BY branch_id
          LIMIT 1;
        END IF;
      END IF;
    END IF;
    
    -- Auto-populate created_by if column exists and not set
    IF v_user_id IS NOT NULL THEN
      BEGIN
        IF NEW.created_by IS NULL THEN
          NEW.created_by := v_user_id;
        END IF;
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END;
      
      -- Set created_at if not already set
      BEGIN
        IF NEW.created_at IS NULL THEN
          NEW.created_at := NOW();
        END IF;
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END;
    END IF;
  END IF;
  
  -- On UPDATE: auto-populate updated_by
  IF TG_OP = 'UPDATE' THEN
    IF v_user_id IS NOT NULL THEN
      BEGIN
        NEW.updated_by := v_user_id;
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END;
      
      -- Update updated_at timestamp
      BEGIN
        NEW.updated_at := NOW();
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ims.trg_auto_branch_id IS 'Automatically populates branch_id, created_by, updated_by, and timestamps based on session context';

-- Apply trigger to all branch-specific tables
CREATE TRIGGER trg_auto_branch_categories BEFORE INSERT OR UPDATE ON ims.categories
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_suppliers BEFORE INSERT OR UPDATE ON ims.suppliers
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_customers BEFORE INSERT OR UPDATE ON ims.customers
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_products BEFORE INSERT OR UPDATE ON ims.products
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_accounts BEFORE INSERT OR UPDATE ON ims.accounts
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_sales BEFORE INSERT OR UPDATE ON ims.sales
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_purchases BEFORE INSERT OR UPDATE ON ims.purchases
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_charges BEFORE INSERT OR UPDATE ON ims.charges
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_receipts BEFORE INSERT OR UPDATE ON ims.receipts
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_supplier_charges BEFORE INSERT OR UPDATE ON ims.supplier_charges
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_supplier_payments BEFORE INSERT OR UPDATE ON ims.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_expenses BEFORE INSERT OR UPDATE ON ims.expenses
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_inventory_movements BEFORE INSERT OR UPDATE ON ims.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_employees BEFORE INSERT OR UPDATE ON ims.employees
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_employee_payments BEFORE INSERT OR UPDATE ON ims.employee_payments
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_employee_loans BEFORE INSERT OR UPDATE ON ims.employee_loans
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

CREATE TRIGGER trg_auto_branch_audit_logs BEFORE INSERT OR UPDATE ON ims.audit_logs
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

-- Special trigger for warehouses (already has branch_id but needs created_by)
CREATE TRIGGER trg_auto_warehouse_audit BEFORE INSERT OR UPDATE ON ims.warehouses
  FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

COMMIT;

/* =========================================================
SCHEMA CREATION COMPLETE
========================================================= */
