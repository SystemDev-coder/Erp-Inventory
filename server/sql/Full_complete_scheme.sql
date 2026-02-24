/* =========================================================
INVENTORY ERP (ims) SINGLE-COMPANY PER DATABASE
PostgreSQL ONLY
ONE FILE COMPLETE SETUP

Rules applied:

- NO company_id on business tables
- Use branch_id everywhere for separation
- company table exists only for branding/profile (single row)
- NO triggers. All logic is inside procedures/functions
- items are independent from suppliers (supplier optional via item_suppliers)
- money tables always include acc_id to know which account received/paid
- Includes: items, sales, purchases, returns, transfers, HR, finance,
audit logs, permissions, reports, CRUD generator for ALL tables
========================================================= */

CREATE SCHEMA IF NOT EXISTS ims;
SET search_path TO ims, public;

-- =========================================================
-- 1) ENUMS
-- =========================================================
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='sale_type_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.sale_type_enum AS ENUM ('cash','credit');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='sale_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.sale_status_enum AS ENUM ('paid','partial','unpaid','void');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='purchase_type_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.purchase_type_enum AS ENUM ('cash','credit');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='purchase_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.purchase_status_enum AS ENUM ('received','partial','unpaid','void');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='transfer_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.transfer_status_enum AS ENUM ('draft','sent','received','void');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='wh_transfer_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.wh_transfer_status_enum AS ENUM ('draft','sent','received','void');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='sex_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.sex_enum AS ENUM ('male','female');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='movement_type_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.movement_type_enum AS ENUM
('opening','purchase','sale','transfer_out','transfer_in','wh_transfer_out','wh_transfer_in','adjustment','sales_return','purchase_return');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='ledger_entry_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.ledger_entry_enum AS ENUM ('opening','sale','purchase','payment','adjustment','return','void');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='employment_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.employment_status_enum AS ENUM ('active','inactive','terminated');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='salary_type_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.salary_type_enum AS ENUM ('monthly','daily','hourly');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='payroll_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.payroll_status_enum AS ENUM ('draft','posted','void');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='account_transfer_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.account_transfer_status_enum AS ENUM ('draft','posted','void');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='account_txn_type_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.account_txn_type_enum AS ENUM
('sale_payment','supplier_payment','expense_payment','payroll_payment','loan_payment','account_transfer','opening','return_refund','other');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='shift_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.shift_status_enum AS ENUM ('open','closed','void');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='adjustment_type_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.adjustment_type_enum AS ENUM ('INCREASE', 'DECREASE');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='adjustment_status_enum' AND n.nspname='ims') THEN
CREATE TYPE ims.adjustment_status_enum AS ENUM ('POSTED', 'CANCELLED');
END IF;
END $$;

-- =========================================================
-- 2) TABLES WITHOUT FKs
-- =========================================================
-- Company profile (single row only)
CREATE TABLE IF NOT EXISTS ims.company (
company_id SMALLINT PRIMARY KEY DEFAULT 1,
company_name VARCHAR(150) NOT NULL UNIQUE,
phone VARCHAR(30),
address TEXT,
logo_url TEXT,
banner_url TEXT,
is_active BOOLEAN NOT NULL DEFAULT TRUE,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT chk_company_single_row CHECK (company_id = 1)
);

CREATE TABLE IF NOT EXISTS ims.roles (
role_id     BIGSERIAL PRIMARY KEY,
role_code   VARCHAR(40) NOT NULL UNIQUE,
role_name   VARCHAR(60) NOT NULL,
description TEXT,
is_system   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS ims.permissions (
    perm_id     SERIAL PRIMARY KEY,
    perm_key    VARCHAR(100) UNIQUE NOT NULL,
    perm_name   VARCHAR(150) NOT NULL,
    module      VARCHAR(50) NOT NULL,
    sub_module  VARCHAR(50),
    action_type VARCHAR(50),
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 3) TABLES WITH FKs (branch_id based)
-- =========================================================

CREATE TABLE IF NOT EXISTS ims.branches (
branch_id   BIGSERIAL PRIMARY KEY,
branch_name VARCHAR(120) NOT NULL,
address     TEXT,
phone       VARCHAR(30),
is_active   BOOLEAN NOT NULL DEFAULT TRUE,
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_branch_name UNIQUE (branch_name)
);

CREATE TABLE IF NOT EXISTS ims.users (
user_id       BIGSERIAL PRIMARY KEY,
role_id       BIGINT NOT NULL REFERENCES ims.roles(role_id) ON UPDATE CASCADE ON DELETE RESTRICT,
name          VARCHAR(120) NOT NULL,
full_name     VARCHAR(200), -- for sample users
email         VARCHAR(150), -- for sample users
username      VARCHAR(80) NOT NULL UNIQUE,
password_hash TEXT NOT NULL,
is_active     BOOLEAN NOT NULL DEFAULT TRUE,
created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.user_branches (
user_id    BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
branch_id  BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE CASCADE,
is_default BOOLEAN NOT NULL DEFAULT FALSE,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS ims.role_permissions (
role_id BIGINT NOT NULL REFERENCES ims.roles(role_id) ON DELETE CASCADE,
perm_id INT NOT NULL REFERENCES ims.permissions(perm_id) ON DELETE CASCADE,
PRIMARY KEY (role_id, perm_id),
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.user_permissions (
user_id BIGINT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
perm_id INT NOT NULL REFERENCES ims.permissions(perm_id) ON DELETE CASCADE,
granted_by BIGINT REFERENCES ims.users(user_id) ON DELETE SET NULL,
PRIMARY KEY (user_id, perm_id),
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.user_permission_overrides (
user_id BIGINT NOT NULL REFERENCES ims.users(user_id) ON DELETE CASCADE,
perm_id INT NOT NULL REFERENCES ims.permissions(perm_id) ON DELETE CASCADE,
effect VARCHAR(10) NOT NULL CHECK (effect IN ('allow', 'deny')),
expires_at TIMESTAMPTZ,
PRIMARY KEY (user_id, perm_id),
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ims.user_permissions
  ADD COLUMN IF NOT EXISTS granted_by BIGINT REFERENCES ims.users(user_id) ON DELETE SET NULL;
ALTER TABLE ims.user_permission_overrides
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ims.audit_logs (
log_id SERIAL PRIMARY KEY,
branch_id BIGINT REFERENCES ims.branches(branch_id) ON DELETE SET NULL,
user_id BIGINT REFERENCES ims.users(user_id) ON DELETE SET NULL,
action_type VARCHAR(50) NOT NULL,
table_name VARCHAR(100),
record_id BIGINT,
old_values JSONB,
new_values JSONB,
ip_address VARCHAR(50),
user_agent TEXT,
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.categories (
cat_id      BIGSERIAL PRIMARY KEY,
branch_id   BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
cat_name    VARCHAR(120) NOT NULL,
description TEXT,
is_active   BOOLEAN NOT NULL DEFAULT TRUE,
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMPTZ DEFAULT NOW(),
CONSTRAINT uq_category_branch_name UNIQUE (branch_id, cat_name)
);

-- Backward compatibility for legacy databases where categories was created without status/timestamps
ALTER TABLE IF EXISTS ims.categories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE IF EXISTS ims.categories
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS ims.categories
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS ims.units (
unit_id    BIGSERIAL PRIMARY KEY,
branch_id  BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
unit_name  VARCHAR(60) NOT NULL,
symbol     VARCHAR(15),
is_active  BOOLEAN NOT NULL DEFAULT TRUE,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_units_branch_name UNIQUE (branch_id, unit_name)
);

CREATE TABLE IF NOT EXISTS ims.taxes (
tax_id       BIGSERIAL PRIMARY KEY,
branch_id    BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
tax_name     VARCHAR(80) NOT NULL,
rate_percent NUMERIC(6,3) NOT NULL CHECK (rate_percent >= 0),
is_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
is_active    BOOLEAN NOT NULL DEFAULT TRUE,
created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_tax_branch_name UNIQUE (branch_id, tax_name)
);

CREATE TABLE IF NOT EXISTS ims.suppliers (
supplier_id   BIGSERIAL PRIMARY KEY,
branch_id     BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
name          VARCHAR(140) NOT NULL,
country       VARCHAR(80),
phone         VARCHAR(30),
open_balance  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (open_balance >= 0),
is_active     BOOLEAN NOT NULL DEFAULT TRUE,
created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_supplier_branch_name UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS ims.customers (
customer_id     BIGSERIAL PRIMARY KEY,
branch_id       BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
full_name       VARCHAR(160) NOT NULL,
phone           VARCHAR(30),
customer_type   VARCHAR(20) NOT NULL DEFAULT 'regular' CHECK (customer_type IN ('regular', 'one-time')),
sex             ims.sex_enum,
gender          VARCHAR(20),
address         TEXT,
open_balance    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (open_balance >= 0),
registered_date DATE NOT NULL DEFAULT CURRENT_DATE,
external_id     VARCHAR(120),
source_system   VARCHAR(80),
migrated_at     TIMESTAMPTZ,
is_active       BOOLEAN NOT NULL DEFAULT TRUE,
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_customer_branch_phone UNIQUE (branch_id, phone)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_external_per_branch
    ON ims.customers(branch_id, external_id, source_system)
    WHERE external_id IS NOT NULL AND source_system IS NOT NULL;
COMMENT ON COLUMN ims.customers.external_id IS 'ID from source system when migrating from another ERP';
COMMENT ON COLUMN ims.customers.source_system IS 'Name of source system (e.g. legacy_erp, excel_import)';
ALTER TABLE ims.customers ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE ims.customers ADD COLUMN IF NOT EXISTS customer_type VARCHAR(20) NOT NULL DEFAULT 'regular';
ALTER TABLE ims.customers DROP CONSTRAINT IF EXISTS chk_customers_type;
ALTER TABLE ims.customers ADD CONSTRAINT chk_customers_type CHECK (customer_type IN ('regular', 'one-time'));

CREATE TABLE IF NOT EXISTS ims.accounts (
acc_id      BIGSERIAL PRIMARY KEY,
branch_id   BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
name        VARCHAR(120) NOT NULL,
institution VARCHAR(120),
balance     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
is_active   BOOLEAN NOT NULL DEFAULT TRUE,
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_account_branch_name UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS ims.items (
item_id         BIGSERIAL PRIMARY KEY,
branch_id       BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
store_id        BIGINT, -- FK added later after stores table is defined
name            VARCHAR(160) NOT NULL,
barcode         VARCHAR(80) NULL,
stock_alert NUMERIC(14,3) NOT NULL DEFAULT 5 CHECK (stock_alert >= 0),
opening_balance NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
cost_price      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
sell_price      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
is_active       BOOLEAN NOT NULL DEFAULT TRUE,
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_items_branch_name UNIQUE (branch_id, name),
CONSTRAINT uq_items_branch_barcode UNIQUE (branch_id, barcode)
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'ims'
       AND table_name = 'items'
  ) THEN
    ALTER TABLE ims.items
      ADD COLUMN IF NOT EXISTS stock_alert NUMERIC(14,3) NOT NULL DEFAULT 5;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname='ims' AND t.relname='items' AND c.conname='chk_items_stock_alert_non_negative'
    ) THEN
      ALTER TABLE ims.items
        ADD CONSTRAINT chk_items_stock_alert_non_negative CHECK (stock_alert >= 0);
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ims.item_suppliers (
branch_id    BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
item_id      BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE CASCADE,
supplier_id  BIGINT NOT NULL REFERENCES ims.suppliers(supplier_id) ON UPDATE CASCADE ON DELETE RESTRICT,
is_default   BOOLEAN NOT NULL DEFAULT FALSE,
supplier_sku VARCHAR(80),
default_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (default_cost >= 0),
created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
PRIMARY KEY (branch_id, item_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS ims.warehouses (
wh_id      BIGSERIAL PRIMARY KEY,
branch_id  BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
wh_name    VARCHAR(120) NOT NULL,
location   TEXT,
is_active  BOOLEAN NOT NULL DEFAULT TRUE,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_wh_branch_name UNIQUE (branch_id, wh_name)
);

CREATE TABLE IF NOT EXISTS ims.stores (
    store_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id),
    store_name VARCHAR(120) NOT NULL,
    store_code VARCHAR(40),
    address TEXT,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT REFERENCES ims.users(user_id),
    updated_by BIGINT REFERENCES ims.users(user_id),
    CONSTRAINT uq_store_per_branch UNIQUE (branch_id, store_name)
);

CREATE INDEX IF NOT EXISTS idx_stores_branch ON ims.stores(branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_branch_code
  ON ims.stores(branch_id, store_code)
  WHERE store_code IS NOT NULL;
COMMENT ON TABLE ims.stores IS 'Physical store locations within branches where items can be managed';

-- Add FK and index for store_id in items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'ims'
      AND t.relname = 'items'
      AND c.conname = 'fk_items_store'
  ) THEN
    ALTER TABLE ims.items
      ADD CONSTRAINT fk_items_store FOREIGN KEY (store_id) REFERENCES ims.stores(store_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_items_store ON ims.items(store_id) WHERE store_id IS NOT NULL;
-- unit_id / tax_id columns no longer exist in this variant; skip legacy indexes

CREATE TABLE IF NOT EXISTS ims.store_items (
    store_item_id BIGSERIAL PRIMARY KEY,
    store_id      BIGINT NOT NULL REFERENCES ims.stores(store_id) ON UPDATE CASCADE ON DELETE CASCADE,
    product_id    BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE CASCADE,
    quantity      NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_store_items_store_product UNIQUE (store_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_store_items_store ON ims.store_items(store_id);
CREATE INDEX IF NOT EXISTS idx_store_items_product ON ims.store_items(product_id);
COMMENT ON TABLE ims.store_items IS 'Store-specific stock allocation for each item';

CREATE TABLE IF NOT EXISTS ims.warehouse_stock (
branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
wh_id     BIGINT NOT NULL REFERENCES ims.warehouses(wh_id) ON UPDATE CASCADE ON DELETE RESTRICT,
item_id   BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
quantity  NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
PRIMARY KEY (wh_id, item_id)
);

-- Inventory transactions (PostgreSQL syntax)
CREATE TABLE IF NOT EXISTS ims.inventory_transaction (
    transaction_id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    store_id BIGINT REFERENCES ims.stores(store_id) ON UPDATE CASCADE ON DELETE SET NULL,
    product_id BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    item_id BIGINT REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE SET NULL,
    transaction_type VARCHAR(20) NOT NULL,
    direction VARCHAR(3),
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12,2),
    total_cost NUMERIC(14,2) GENERATED ALWAYS AS (quantity * COALESCE(unit_cost, 0)) STORED,
    reference_no VARCHAR(50),
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_inventory_transaction_type
      CHECK (UPPER(transaction_type) IN ('IN', 'OUT', 'ADJUSTMENT', 'PAID', 'SALES', 'DAMAGE')),
    CONSTRAINT chk_inventory_transaction_direction
      CHECK (direction IS NULL OR UPPER(direction) IN ('IN', 'OUT')),
    CONSTRAINT chk_inventory_transaction_status
      CHECK (UPPER(status) IN ('POSTED', 'PENDING', 'CANCELLED'))
);



CREATE TABLE IF NOT EXISTS ims.inventory_movements (
move_id   BIGSERIAL PRIMARY KEY,
branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
wh_id     BIGINT REFERENCES ims.warehouses(wh_id) ON UPDATE CASCADE ON DELETE SET NULL,
item_id   BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
move_type ims.movement_type_enum NOT NULL,
ref_table VARCHAR(40),
ref_id    BIGINT,
qty_in    NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_in >= 0),
qty_out   NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_out >= 0),
unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
move_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
note      TEXT,
CONSTRAINT chk_move_qty CHECK ((qty_in + qty_out) > 0)
);

CREATE TABLE IF NOT EXISTS ims.sales (
sale_id     BIGSERIAL PRIMARY KEY,
branch_id   BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
wh_id       BIGINT REFERENCES ims.warehouses(wh_id) ON UPDATE CASCADE ON DELETE SET NULL,
user_id     BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
customer_id BIGINT REFERENCES ims.customers(customer_id) ON UPDATE CASCADE ON DELETE SET NULL,
tax_id      BIGINT REFERENCES ims.taxes(tax_id) ON UPDATE CASCADE ON DELETE SET NULL,
sale_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
sale_type   ims.sale_type_enum NOT NULL DEFAULT 'cash',
subtotal    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
discount    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
tax_amount  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
total       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
status      ims.sale_status_enum NOT NULL DEFAULT 'paid',
note        TEXT
);

CREATE TABLE IF NOT EXISTS ims.stock_adjustment (
    adjustment_id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    adjustment_type VARCHAR(20) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    reason VARCHAR(255) NOT NULL,
    adjustment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_stock_adjustment_type CHECK (UPPER(adjustment_type) IN ('INCREASE', 'DECREASE')),
    CONSTRAINT chk_stock_adjustment_status CHECK (UPPER(status) IN ('POSTED', 'CANCELLED'))
);

DO $$
BEGIN
  -- keep existing databases compatible with the stock_adjustment shape
  ALTER TABLE ims.stock_adjustment
    ADD COLUMN IF NOT EXISTS item_id BIGINT,
    ADD COLUMN IF NOT EXISTS adjustment_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS reason VARCHAR(255),
    ADD COLUMN IF NOT EXISTS adjustment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS created_by BIGINT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

  ALTER TABLE ims.stock_adjustment
    ALTER COLUMN item_id TYPE BIGINT,
    ALTER COLUMN adjustment_type TYPE VARCHAR(20),
    ALTER COLUMN quantity TYPE NUMERIC(10,2),
    ALTER COLUMN reason TYPE VARCHAR(255),
    ALTER COLUMN adjustment_date SET DEFAULT NOW(),
    ALTER COLUMN created_by TYPE BIGINT,
    ALTER COLUMN status TYPE VARCHAR(20),
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

  UPDATE ims.stock_adjustment
     SET status = 'POSTED'
   WHERE COALESCE(NULLIF(status, ''), 'POSTED') NOT IN ('POSTED', 'CANCELLED');

  ALTER TABLE ims.stock_adjustment
    DROP CONSTRAINT IF EXISTS chk_stock_adjustment_type;
  ALTER TABLE ims.stock_adjustment
    DROP CONSTRAINT IF EXISTS stock_adjustment_adjustment_type_check;
  ALTER TABLE ims.stock_adjustment
    ADD CONSTRAINT chk_stock_adjustment_type
    CHECK (UPPER(adjustment_type) IN ('INCREASE', 'DECREASE'));
  ALTER TABLE ims.stock_adjustment
    DROP CONSTRAINT IF EXISTS chk_stock_adjustment_status;
  ALTER TABLE ims.stock_adjustment
    ADD CONSTRAINT chk_stock_adjustment_status
    CHECK (UPPER(status) IN ('POSTED', 'CANCELLED'));

  IF NOT EXISTS (SELECT 1 FROM ims.stock_adjustment WHERE item_id IS NULL) THEN
    ALTER TABLE ims.stock_adjustment ALTER COLUMN item_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ims.stock_adjustment WHERE adjustment_type IS NULL) THEN
    ALTER TABLE ims.stock_adjustment ALTER COLUMN adjustment_type SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ims.stock_adjustment WHERE quantity IS NULL) THEN
    ALTER TABLE ims.stock_adjustment ALTER COLUMN quantity SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ims.stock_adjustment WHERE reason IS NULL) THEN
    ALTER TABLE ims.stock_adjustment ALTER COLUMN reason SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ims.stock_adjustment WHERE created_by IS NULL) THEN
    ALTER TABLE ims.stock_adjustment ALTER COLUMN created_by SET NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ims.fn_stock_adjustment_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_adjustment_touch_updated_at ON ims.stock_adjustment;
CREATE TRIGGER trg_stock_adjustment_touch_updated_at
BEFORE UPDATE ON ims.stock_adjustment
FOR EACH ROW
EXECUTE FUNCTION ims.fn_stock_adjustment_touch_updated_at();
CREATE TABLE IF NOT EXISTS ims.sale_items (
sale_item_id BIGSERIAL PRIMARY KEY,
branch_id    BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
sale_id      BIGINT NOT NULL REFERENCES ims.sales(sale_id) ON UPDATE CASCADE ON DELETE CASCADE,
item_id      BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
quantity     NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
unit_price   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
line_total   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS ims.sale_payments (
sale_payment_id BIGSERIAL PRIMARY KEY,
branch_id       BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
sale_id         BIGINT NOT NULL REFERENCES ims.sales(sale_id) ON UPDATE CASCADE ON DELETE CASCADE,
user_id         BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
acc_id          BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
pay_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
amount_paid     NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
reference_no    VARCHAR(80),
note            TEXT
);

CREATE TABLE IF NOT EXISTS ims.purchases (
purchase_id   BIGSERIAL PRIMARY KEY,
branch_id     BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
wh_id         BIGINT REFERENCES ims.warehouses(wh_id) ON UPDATE CASCADE ON DELETE SET NULL,
user_id       BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
supplier_id   BIGINT REFERENCES ims.suppliers(supplier_id) ON UPDATE CASCADE ON DELETE RESTRICT,
purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
purchase_type ims.purchase_type_enum NOT NULL DEFAULT 'cash',
subtotal      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
discount      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
total         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
status        ims.purchase_status_enum NOT NULL DEFAULT 'received',
note          TEXT
);

CREATE TABLE IF NOT EXISTS ims.purchase_items (
purchase_item_id BIGSERIAL PRIMARY KEY,
branch_id        BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
purchase_id      BIGINT NOT NULL REFERENCES ims.purchases(purchase_id) ON UPDATE CASCADE ON DELETE CASCADE,
item_id          BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
quantity         NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
unit_cost        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
sale_price       NUMERIC(14,2),
discount         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
line_total       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
batch_no         VARCHAR(80),
expiry_date      DATE,
description      TEXT
);

-- Safe migration: add columns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='purchase_items' AND column_name='sale_price'
  ) THEN
    ALTER TABLE ims.purchase_items ADD COLUMN sale_price NUMERIC(14,2);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='purchase_items' AND column_name='discount'
  ) THEN
    ALTER TABLE ims.purchase_items ADD COLUMN discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='purchase_items' AND column_name='description'
  ) THEN
    ALTER TABLE ims.purchase_items ADD COLUMN description TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ims.supplier_payments (
sup_payment_id BIGSERIAL PRIMARY KEY,
branch_id      BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
purchase_id    BIGINT NOT NULL REFERENCES ims.purchases(purchase_id) ON UPDATE CASCADE ON DELETE CASCADE,
user_id        BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
acc_id         BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
pay_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
amount_paid    NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
reference_no   VARCHAR(80),
note           TEXT
);

CREATE TABLE IF NOT EXISTS ims.customer_ledger (
cust_ledger_id BIGSERIAL PRIMARY KEY,
branch_id      BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
customer_id    BIGINT NOT NULL REFERENCES ims.customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT,
entry_type     ims.ledger_entry_enum NOT NULL,
ref_table      VARCHAR(40),
ref_id         BIGINT,
acc_id         BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
debit          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
credit         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
entry_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
note           TEXT,
CONSTRAINT chk_cust_ledger_amt CHECK ((debit + credit) > 0)
);

CREATE TABLE IF NOT EXISTS ims.supplier_ledger (
sup_ledger_id BIGSERIAL PRIMARY KEY,
branch_id     BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
supplier_id   BIGINT NOT NULL REFERENCES ims.suppliers(supplier_id) ON UPDATE CASCADE ON DELETE RESTRICT,
entry_type    ims.ledger_entry_enum NOT NULL,
ref_table     VARCHAR(40),
ref_id        BIGINT,
acc_id        BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
debit         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
credit        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
entry_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
note          TEXT,
CONSTRAINT chk_sup_ledger_amt CHECK ((debit + credit) > 0)
);

CREATE TABLE IF NOT EXISTS ims.account_transactions (
txn_id    BIGSERIAL PRIMARY KEY,
branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
acc_id    BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
txn_type  ims.account_txn_type_enum NOT NULL,
ref_table VARCHAR(40),
ref_id    BIGINT,
debit     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
credit    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
txn_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
note      TEXT,
CONSTRAINT chk_txn_amt CHECK ((debit + credit) > 0)
);

CREATE TABLE IF NOT EXISTS ims.account_transfers (
acc_transfer_id BIGSERIAL PRIMARY KEY,
branch_id       BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
from_acc_id     BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
to_acc_id       BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
transfer_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
user_id         BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
status          ims.account_transfer_status_enum NOT NULL DEFAULT 'draft',
reference_no    VARCHAR(80),
note            TEXT,
CONSTRAINT chk_acc_transfer_diff CHECK (from_acc_id <> to_acc_id)
);

-- Receipts (Finance)
CREATE TABLE IF NOT EXISTS ims.customer_receipts (
    receipt_id    BIGSERIAL PRIMARY KEY,
    branch_id     BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    customer_id   BIGINT REFERENCES ims.customers(customer_id) ON UPDATE CASCADE ON DELETE SET NULL,
    sale_id       BIGINT REFERENCES ims.sales(sale_id) ON UPDATE CASCADE ON DELETE SET NULL,
    acc_id        BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    receipt_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(40),
    reference_no  VARCHAR(80),
    note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_customer_receipts_branch_date ON ims.customer_receipts(branch_id, receipt_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_receipt_ref ON ims.customer_receipts(branch_id, reference_no)
  WHERE reference_no IS NOT NULL;

-- Stored procedure: record a customer receipt and post balances atomically
DROP FUNCTION IF EXISTS ims.sp_record_customer_receipt(
    BIGINT,BIGINT,BIGINT,NUMERIC,TEXT,TEXT,TEXT,TIMESTAMPTZ
);

CREATE FUNCTION ims.sp_record_customer_receipt(
    p_branch_id      BIGINT,
    p_customer_id    BIGINT,
    p_account_id     BIGINT,
    p_amount         NUMERIC(14,2),
    p_payment_method TEXT DEFAULT NULL,
    p_reference      TEXT DEFAULT NULL,
    p_note           TEXT DEFAULT NULL,
    p_receipt_date   TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE(out_receipt_id BIGINT, out_message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance_col TEXT;
    v_total_paid_exists BOOLEAN;
    v_receipt_id BIGINT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be greater than zero';
    END IF;

    -- detect balance column on customers
    SELECT CASE
             WHEN EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='ims' AND table_name='customers' AND column_name='remaining_balance')
               THEN 'remaining_balance'
             ELSE 'open_balance'
           END
      INTO v_balance_col;

    SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema='ims' AND table_name='customers' AND column_name='total_paid'
           )
      INTO v_total_paid_exists;

    -- validations
    PERFORM 1 FROM ims.customers WHERE customer_id = p_customer_id AND branch_id = p_branch_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer % not found in branch %', p_customer_id, p_branch_id;
    END IF;

    PERFORM 1 FROM ims.accounts WHERE acc_id = p_account_id AND branch_id = p_branch_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account % not found in branch %', p_account_id, p_branch_id;
    END IF;

    -- main txn
    INSERT INTO ims.customer_receipts
        (branch_id, customer_id, acc_id, receipt_date, amount, payment_method, reference_no, note)
    VALUES
        (p_branch_id, p_customer_id, p_account_id, COALESCE(p_receipt_date, NOW()), p_amount, p_payment_method, NULLIF(p_reference,''), p_note)
    RETURNING ims.customer_receipts.receipt_id INTO v_receipt_id;

    -- update customer balance (clamped) and total_paid if exists
    EXECUTE format(
      'UPDATE ims.customers
          SET %I = GREATEST(%I - $1, 0)%s
        WHERE customer_id = $2 AND branch_id = $3',
      v_balance_col,
      v_balance_col,
      CASE WHEN v_total_paid_exists THEN ', total_paid = COALESCE(total_paid,0) + $1' ELSE '' END
    ) USING p_amount, p_customer_id, p_branch_id;

    -- update account balance
    UPDATE ims.accounts
       SET balance = balance + p_amount
     WHERE acc_id = p_account_id AND branch_id = p_branch_id;

    -- ledger
    INSERT INTO ims.customer_ledger
        (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
    VALUES
        (p_branch_id, p_customer_id, 'payment', 'customer_receipts', v_receipt_id, p_account_id, 0, p_amount, p_note);

    -- account transaction
    INSERT INTO ims.account_transactions
        (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
    VALUES
        (p_branch_id, p_account_id, 'sale_payment', 'customer_receipts', v_receipt_id, p_amount, 0, p_note);

    RETURN QUERY SELECT v_receipt_id::BIGINT AS out_receipt_id, 'Customer receipt recorded'::TEXT AS out_message;
END;
$$;

CREATE TABLE IF NOT EXISTS ims.supplier_receipts (
    receipt_id    BIGSERIAL PRIMARY KEY,
    branch_id     BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    supplier_id   BIGINT REFERENCES ims.suppliers(supplier_id) ON UPDATE CASCADE ON DELETE SET NULL,
    purchase_id   BIGINT REFERENCES ims.purchases(purchase_id) ON UPDATE CASCADE ON DELETE SET NULL,
    acc_id        BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    receipt_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(40),
    reference_no  VARCHAR(80),
    note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_supplier_receipts_branch_date ON ims.supplier_receipts(branch_id, receipt_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_receipt_ref ON ims.supplier_receipts(branch_id, reference_no)
  WHERE reference_no IS NOT NULL;

-- Expenses
CREATE TABLE IF NOT EXISTS ims.expenses (
    exp_id      BIGSERIAL PRIMARY KEY,
    branch_id   BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name        VARCHAR(120) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id     BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Safe migration for existing databases: add created_at, drop legacy amount column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expenses' AND column_name='created_at') THEN
    ALTER TABLE ims.expenses ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expenses' AND column_name='amount') THEN
    ALTER TABLE ims.expenses DROP COLUMN amount;
  END IF;
END $$;

DROP TABLE IF EXISTS ims.expense_budgets CASCADE;
CREATE TABLE ims.expense_budgets (
    budget_id    BIGSERIAL PRIMARY KEY,
    exp_id       BIGINT NOT NULL REFERENCES ims.expenses(exp_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    fixed_amount NUMERIC(14,2) NOT NULL CHECK (fixed_amount > 0),
    note         TEXT,
    user_id      BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_expense_budgets_exp ON ims.expense_budgets(exp_id);

CREATE TABLE IF NOT EXISTS ims.expense_charges (
    charge_id   BIGSERIAL PRIMARY KEY,
    branch_id   BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    exp_id      BIGINT NOT NULL REFERENCES ims.expenses(exp_id) ON UPDATE CASCADE ON DELETE CASCADE,
    acc_id      BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
    amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    charge_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reg_date    TIMESTAMPTZ,
    note        TEXT,
    ref_table   VARCHAR(40),
    ref_id      BIGINT,
    exp_budget  SMALLINT NOT NULL DEFAULT 0, -- 1 if created from budget, else 0
    budget_month SMALLINT,
    budget_year  SMALLINT,
    user_id     BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_expense_charges_branch_date ON ims.expense_charges(branch_id, charge_date DESC);

-- Safe migrations for existing DB
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expense_charges' AND column_name='exp_budget') THEN
    ALTER TABLE ims.expense_charges ADD COLUMN exp_budget SMALLINT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expense_charges' AND column_name='budget_month') THEN
    ALTER TABLE ims.expense_charges ADD COLUMN budget_month SMALLINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expense_charges' AND column_name='budget_year') THEN
    ALTER TABLE ims.expense_charges ADD COLUMN budget_year SMALLINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expense_charges' AND column_name='acc_id') THEN
    ALTER TABLE ims.expense_charges ADD COLUMN acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  -- Realign FK to ims.expenses (plural) in case legacy constraint points to ims.expense
  IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema='ims' AND tc.table_name='expense_charges'
        AND tc.constraint_type='FOREIGN KEY'
        AND ccu.column_name='exp_id'
        AND ccu.table_name='expense'
  ) THEN
    ALTER TABLE ims.expense_charges DROP CONSTRAINT expense_charges_exp_id_fkey;
    ALTER TABLE ims.expense_charges ADD CONSTRAINT expense_charges_exp_id_fkey
      FOREIGN KEY (exp_id) REFERENCES ims.expenses(exp_id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ims.expense_payments (
    exp_payment_id BIGSERIAL PRIMARY KEY,
    branch_id      BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    exp_ch_id      BIGINT NOT NULL REFERENCES ims.expense_charges(charge_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    acc_id         BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    pay_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount_paid    NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
    reference_no   VARCHAR(80),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id        BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- -----------------------------------------------------------------
-- User session locks (per-user lock password for UI lock screen)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ims.user_locks (
    user_id    BIGINT PRIMARY KEY REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
    lock_hash  TEXT   NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_locks_updated_at ON ims.user_locks(updated_at DESC);

-- Safe migration: add exp_ch_id, drop legacy exp_id column if present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expense_payments' AND column_name='exp_ch_id') THEN
    ALTER TABLE ims.expense_payments ADD COLUMN exp_ch_id BIGINT REFERENCES ims.expense_charges(charge_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expense_payments' AND column_name='exp_id') THEN
    ALTER TABLE ims.expense_payments DROP COLUMN exp_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='expense_payments' AND column_name='created_at') THEN
    ALTER TABLE ims.expense_payments ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Stored procedure: manage budget charges for a given date and operation
DROP FUNCTION IF EXISTS ims.sp_charge_expense_budget(BIGINT,TIMESTAMPTZ,VARCHAR,BIGINT);
DROP FUNCTION IF EXISTS ims.sp_charge_expense_budget(BIGINT,BIGINT,NUMERIC,TIMESTAMPTZ,TEXT,BIGINT);
CREATE FUNCTION ims.sp_charge_expense_budget(
    p_budget_id   BIGINT,
    p_reg_date    TIMESTAMPTZ,
    p_oper        VARCHAR,
    p_user_id     BIGINT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_month INT := EXTRACT(MONTH FROM p_reg_date);
    v_year  INT := EXTRACT(YEAR  FROM p_reg_date);
BEGIN
    CREATE TEMP TABLE tmp_expense_budget ON COMMIT DROP AS
    SELECT
        b.budget_id,
        b.exp_id,
        b.fixed_amount,
        e.branch_id
    FROM ims.expense_budgets b
    JOIN ims.expenses e ON e.exp_id = b.exp_id
    WHERE p_budget_id IS NULL OR b.budget_id = p_budget_id;

    -- Ensure referenced expenses exist (repair orphaned budgets)
    INSERT INTO ims.expenses (exp_id, branch_id, name, user_id, created_at)
    SELECT t.exp_id, t.branch_id, 'Recovered for budget '||t.budget_id, p_user_id, p_reg_date
    FROM tmp_expense_budget t
    WHERE NOT EXISTS (SELECT 1 FROM ims.expenses e WHERE e.exp_id = t.exp_id);
    PERFORM setval(pg_get_serial_sequence('ims.expenses','exp_id'), (SELECT MAX(exp_id) FROM ims.expenses));

    CASE UPPER(p_oper)
      WHEN 'INSERT' THEN
        INSERT INTO ims.expense_charges (
            branch_id, exp_id, amount,
            charge_date, reg_date,
            note, ref_table, ref_id,
            exp_budget, budget_month, budget_year,
            user_id
        )
        SELECT
            t.branch_id,
            t.exp_id,
            t.fixed_amount,
            p_reg_date,
            p_reg_date,
            'Auto Budget Insert',
            'expense_budgets',
            t.budget_id,
            1,
            v_month,
            v_year,
            p_user_id
        FROM tmp_expense_budget t
        WHERE NOT EXISTS (
            SELECT 1 FROM ims.expense_charges c
            WHERE c.ref_table = 'expense_budgets'
              AND c.ref_id = t.budget_id
              AND c.budget_month = v_month
              AND c.budget_year  = v_year
              AND c.charge_date::date = p_reg_date::date
        );

      WHEN 'UPDATE' THEN
        UPDATE ims.expense_charges c
        SET amount = t.fixed_amount,
            user_id = p_user_id,
            reg_date = p_reg_date
        FROM tmp_expense_budget t
        WHERE c.ref_table = 'expense_budgets'
          AND c.ref_id = t.budget_id
          AND c.budget_month = v_month
          AND c.budget_year  = v_year;

      WHEN 'DELETE' THEN
        DELETE FROM ims.expense_charges c
        WHERE c.ref_table = 'expense_budgets'
          AND c.budget_month = v_month
          AND c.budget_year  = v_year
          AND c.ref_id IN (SELECT budget_id FROM tmp_expense_budget);

      WHEN 'SYNC' THEN
        DELETE FROM ims.expense_charges c
        WHERE c.ref_table = 'expense_budgets'
          AND c.budget_month = v_month
          AND c.budget_year  = v_year
          AND NOT EXISTS (
            SELECT 1 FROM tmp_expense_budget t
            WHERE t.budget_id = c.ref_id
          );

        UPDATE ims.expense_charges c
        SET amount = t.fixed_amount,
            user_id = p_user_id
        FROM tmp_expense_budget t
        WHERE c.ref_table = 'expense_budgets'
          AND c.ref_id = t.budget_id
          AND c.budget_month = v_month
          AND c.budget_year  = v_year
          AND c.amount <> t.fixed_amount;

        INSERT INTO ims.expense_charges (
            branch_id, exp_id, amount,
            charge_date, reg_date,
            note, ref_table, ref_id,
            exp_budget, budget_month, budget_year,
            user_id
        )
        SELECT
            t.branch_id,
            t.exp_id,
            t.fixed_amount,
            p_reg_date,
            p_reg_date,
            'Auto Budget Sync',
            'expense_budgets',
            t.budget_id,
            1,
            v_month,
            v_year,
            p_user_id
        FROM tmp_expense_budget t
        WHERE NOT EXISTS (
            SELECT 1 FROM ims.expense_charges c
            WHERE c.ref_table = 'expense_budgets'
              AND c.ref_id = t.budget_id
              AND c.budget_month = v_month
              AND c.budget_year  = v_year
              AND c.charge_date::date = p_reg_date::date
        );
      ELSE
        RAISE EXCEPTION 'Invalid Operation. Use INSERT / UPDATE / DELETE / SYNC';
    END CASE;
END;
$$;

-- ---------------------------------------------------------
-- Charge salaries: generate payroll runs/lines per branch/month
-- ---------------------------------------------------------
DROP FUNCTION IF EXISTS ims.sp_charge_salary(TIMESTAMPTZ,BIGINT);
CREATE FUNCTION ims.sp_charge_salary(
    p_period_date TIMESTAMPTZ,
    p_user_id     BIGINT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_month INT := EXTRACT(MONTH FROM p_period_date);
    v_year  INT := EXTRACT(YEAR  FROM p_period_date);
    v_created INT := 0;
    v_run_id BIGINT;
    v_last INT := 0;
    r_branch RECORD;
BEGIN
    FOR r_branch IN
        SELECT DISTINCT branch_id FROM ims.employees WHERE status = 'active'
    LOOP
        INSERT INTO ims.payroll_runs (branch_id, created_by, period_year, period_month, period_from, period_to, note)
        VALUES (r_branch.branch_id, p_user_id, v_year, v_month, date_trunc('month', p_period_date)::date, (date_trunc('month', p_period_date) + INTERVAL '1 month - 1 day')::date, 'Auto salary charge')
        ON CONFLICT (branch_id, period_year, period_month)
        DO UPDATE SET note = EXCLUDED.note
        RETURNING payroll_id INTO v_run_id;

        INSERT INTO ims.payroll_lines (
            branch_id, payroll_id, emp_id, basic_salary, allowances, deductions, net_salary, note
        )
        SELECT
            e.branch_id,
            v_run_id,
            e.emp_id,
            e.salary_amount,
            0,
            0,
            e.salary_amount,
            'Auto salary charge'
        FROM ims.employees e
        WHERE e.branch_id = r_branch.branch_id
          AND e.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM ims.payroll_lines pl
              WHERE pl.branch_id = e.branch_id
                AND pl.payroll_id = v_run_id
                AND pl.emp_id = e.emp_id
            );

        GET DIAGNOSTICS v_last = ROW_COUNT;
        v_created := v_created + v_last;
    END LOOP;

    RETURN v_created;
END;
$$;

-- Returns
CREATE TABLE IF NOT EXISTS ims.sales_returns (
sr_id BIGSERIAL PRIMARY KEY,
branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
sale_id BIGINT REFERENCES ims.sales(sale_id) ON UPDATE CASCADE ON DELETE SET NULL,
user_id BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
customer_id BIGINT REFERENCES ims.customers(customer_id) ON UPDATE CASCADE ON DELETE SET NULL,
return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
note TEXT
);

CREATE TABLE IF NOT EXISTS ims.sales_return_items (
sr_item_id BIGSERIAL PRIMARY KEY,
branch_id  BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
sr_id      BIGINT NOT NULL REFERENCES ims.sales_returns(sr_id) ON UPDATE CASCADE ON DELETE CASCADE,
item_id    BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
quantity   NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
line_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS ims.purchase_returns (
pr_id       BIGSERIAL PRIMARY KEY,
branch_id   BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
purchase_id BIGINT REFERENCES ims.purchases(purchase_id) ON UPDATE CASCADE ON DELETE SET NULL,
user_id     BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
supplier_id BIGINT NOT NULL REFERENCES ims.suppliers(supplier_id) ON UPDATE CASCADE ON DELETE RESTRICT,
return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
subtotal    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
total       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
note        TEXT
);

CREATE TABLE IF NOT EXISTS ims.purchase_return_items (
pr_item_id BIGSERIAL PRIMARY KEY,
branch_id  BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
pr_id      BIGINT NOT NULL REFERENCES ims.purchase_returns(pr_id) ON UPDATE CASCADE ON DELETE CASCADE,
item_id    BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
quantity   NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
unit_cost  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
line_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

-- Stock transfers branch to branch
CREATE TABLE IF NOT EXISTS ims.transfers (
transfer_id BIGSERIAL PRIMARY KEY,
from_branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
to_branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
status ims.transfer_status_enum NOT NULL DEFAULT 'draft',
user_id BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
note TEXT,
CONSTRAINT chk_transfer_branches CHECK (from_branch_id <> to_branch_id)
);

CREATE TABLE IF NOT EXISTS ims.transfer_items (
transfer_item_id BIGSERIAL PRIMARY KEY,
transfer_id      BIGINT NOT NULL REFERENCES ims.transfers(transfer_id) ON UPDATE CASCADE ON DELETE CASCADE,
item_id          BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
quantity         NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
unit_cost        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);

-- Stock transfers within same branch: warehouse to warehouse
CREATE TABLE IF NOT EXISTS ims.warehouse_transfers (
wh_transfer_id BIGSERIAL PRIMARY KEY,
branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
from_wh_id BIGINT NOT NULL REFERENCES ims.warehouses(wh_id) ON UPDATE CASCADE ON DELETE RESTRICT,
to_wh_id BIGINT NOT NULL REFERENCES ims.warehouses(wh_id) ON UPDATE CASCADE ON DELETE RESTRICT,
user_id BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
status ims.wh_transfer_status_enum NOT NULL DEFAULT 'draft',
note TEXT,
CONSTRAINT chk_wh_transfer_diff CHECK (from_wh_id <> to_wh_id)
);

CREATE TABLE IF NOT EXISTS ims.warehouse_transfer_items (
wh_transfer_item_id BIGSERIAL PRIMARY KEY,
branch_id           BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
wh_transfer_id      BIGINT NOT NULL REFERENCES ims.warehouse_transfers(wh_transfer_id) ON UPDATE CASCADE ON DELETE CASCADE,
item_id             BIGINT NOT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
unit_cost           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);

-- HR
CREATE TABLE IF NOT EXISTS ims.employees (
emp_id BIGSERIAL PRIMARY KEY,
branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
user_id BIGINT UNIQUE REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
role_id BIGINT REFERENCES ims.roles(role_id) ON UPDATE CASCADE ON DELETE SET NULL,
full_name VARCHAR(160) NOT NULL,
phone VARCHAR(30),
address TEXT,
gender VARCHAR(20),
hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
salary_type VARCHAR(60) NOT NULL DEFAULT 'Monthly' CHECK (salary_type IN ('Hourly', 'Monthly', 'hourly', 'monthly')),
shift_type VARCHAR(20) NOT NULL DEFAULT 'Morning' CHECK (shift_type IN ('Morning', 'Night', 'Evening')),
salary_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (salary_amount >= 0),
status ims.employment_status_enum NOT NULL DEFAULT 'active',
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Backfill columns for older installations where ims.employees already existed.
ALTER TABLE ims.employees ADD COLUMN IF NOT EXISTS role_id BIGINT REFERENCES ims.roles(role_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ims.employees ADD COLUMN IF NOT EXISTS hire_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE ims.employees ADD COLUMN IF NOT EXISTS salary_type VARCHAR(60) NOT NULL DEFAULT 'monthly';
ALTER TABLE ims.employees ADD COLUMN IF NOT EXISTS salary_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ims.employees ADD COLUMN IF NOT EXISTS status ims.employment_status_enum NOT NULL DEFAULT 'active';
ALTER TABLE ims.employees ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE ims.employees ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20) NOT NULL DEFAULT 'Morning';
ALTER TABLE ims.employees DROP CONSTRAINT IF EXISTS chk_employees_salary_type;
ALTER TABLE ims.employees ADD CONSTRAINT chk_employees_salary_type CHECK (salary_type IN ('Hourly', 'Monthly', 'hourly', 'monthly'));
ALTER TABLE ims.employees DROP CONSTRAINT IF EXISTS chk_employees_shift_type;
ALTER TABLE ims.employees ADD CONSTRAINT chk_employees_shift_type CHECK (shift_type IN ('Morning', 'Night', 'Evening'));

CREATE TABLE IF NOT EXISTS ims.salary_types (
sal_type_id BIGSERIAL PRIMARY KEY,
branch_id   BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
type_name   VARCHAR(60) NOT NULL,
base_type   ims.salary_type_enum NOT NULL,
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_salary_type_branch_name UNIQUE (branch_id, type_name)
);

-- Compatibility table used by employee service for salary history tracking
CREATE TABLE IF NOT EXISTS ims.employee_salary (
emp_salary_id BIGSERIAL PRIMARY KEY,
emp_id        BIGINT NOT NULL REFERENCES ims.employees(emp_id) ON UPDATE CASCADE ON DELETE CASCADE,
sal_type_id   BIGINT REFERENCES ims.salary_types(sal_type_id) ON UPDATE CASCADE ON DELETE SET NULL,
basic_salary  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
start_date    DATE NOT NULL DEFAULT CURRENT_DATE,
end_date      DATE,
is_active     BOOLEAN NOT NULL DEFAULT TRUE,
created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_salary_emp_active ON ims.employee_salary(emp_id, is_active);

CREATE TABLE IF NOT EXISTS ims.payroll_runs (
payroll_id   BIGSERIAL PRIMARY KEY,
branch_id    BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
created_by   BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
period_year  INT NOT NULL,
period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
period_from  DATE NOT NULL,
period_to    DATE NOT NULL,
status       ims.payroll_status_enum NOT NULL DEFAULT 'draft',
note         TEXT,
created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_payroll_period UNIQUE (branch_id, period_year, period_month),
CONSTRAINT chk_payroll_dates CHECK (period_to >= period_from)
);

CREATE TABLE IF NOT EXISTS ims.payroll_lines (
payroll_line_id BIGSERIAL PRIMARY KEY,
branch_id       BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
payroll_id      BIGINT NOT NULL REFERENCES ims.payroll_runs(payroll_id) ON UPDATE CASCADE ON DELETE CASCADE,
emp_id          BIGINT NOT NULL REFERENCES ims.employees(emp_id) ON UPDATE CASCADE ON DELETE RESTRICT,
basic_salary    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
allowances      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
deductions      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
net_salary      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_salary >= 0),
note            TEXT,
CONSTRAINT uq_payroll_emp UNIQUE (branch_id, payroll_id, emp_id)
);

CREATE TABLE IF NOT EXISTS ims.employee_payments (
emp_payment_id  BIGSERIAL PRIMARY KEY,
branch_id       BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
payroll_id      BIGINT REFERENCES ims.payroll_runs(payroll_id) ON UPDATE CASCADE ON DELETE SET NULL,
payroll_line_id BIGINT REFERENCES ims.payroll_lines(payroll_line_id) ON UPDATE CASCADE ON DELETE SET NULL,
emp_id          BIGINT NOT NULL REFERENCES ims.employees(emp_id) ON UPDATE CASCADE ON DELETE RESTRICT,
paid_by         BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
acc_id          BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
pay_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
amount_paid     NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
reference_no    VARCHAR(80),
note            TEXT,
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='employee_payments' AND column_name='created_at'
  ) THEN
    ALTER TABLE ims.employee_payments ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- User lock passwords (session lock)
CREATE TABLE IF NOT EXISTS ims.user_locks (
  user_id    BIGINT PRIMARY KEY REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  lock_hash  TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.employee_loans (
loan_id    BIGSERIAL PRIMARY KEY,
branch_id  BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
emp_id     BIGINT NOT NULL REFERENCES ims.employees(emp_id) ON UPDATE CASCADE ON DELETE RESTRICT,
created_by BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
loan_date  DATE NOT NULL DEFAULT CURRENT_DATE,
amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
note       TEXT
);

CREATE TABLE IF NOT EXISTS ims.loan_payments (
loan_payment_id BIGSERIAL PRIMARY KEY,
branch_id       BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
loan_id         BIGINT NOT NULL REFERENCES ims.employee_loans(loan_id) ON UPDATE CASCADE ON DELETE CASCADE,
acc_id          BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
paid_by         BIGINT NOT NULL REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
pay_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
amount_paid     NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
reference_no    VARCHAR(80),
note            TEXT
);

CREATE TABLE IF NOT EXISTS ims.employee_shift_assignments (
assignment_id BIGSERIAL PRIMARY KEY,
branch_id     BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
emp_id        BIGINT NOT NULL REFERENCES ims.employees(emp_id) ON UPDATE CASCADE ON DELETE CASCADE,
shift_type    VARCHAR(20) NOT NULL CHECK (shift_type IN ('Morning', 'Night', 'Evening')),
effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
is_active     BOOLEAN NOT NULL DEFAULT TRUE,
created_by    BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_shift_assignments_emp ON ims.employee_shift_assignments(emp_id);

-- Notifications
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

CREATE INDEX IF NOT EXISTS idx_notifications_user ON ims.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON ims.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON ims.notifications(user_id, is_read)
WHERE is_deleted = FALSE;

-- =========================================================
-- GLOBAL AUDIT TRIGGERS (ALL TABLES)
-- =========================================================
CREATE OR REPLACE FUNCTION ims.fn_audit_all_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_row JSONB;
    v_user_id BIGINT;
    v_branch_id BIGINT;
    v_record_id BIGINT;
BEGIN
    IF TG_TABLE_SCHEMA <> 'ims' OR TG_TABLE_NAME IN ('audit_logs', 'schema_migrations', 'customers') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

    BEGIN
        v_user_id := NULLIF(COALESCE(
            v_row->>'user_id',
            v_row->>'created_by',
            v_row->>'updated_by',
            v_row->>'paid_by'
        ), '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    BEGIN
        v_branch_id := NULLIF(v_row->>'branch_id', '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        v_branch_id := NULL;
    END;

    BEGIN
        v_record_id := NULLIF(COALESCE(
            v_row->>'id',
            v_row->>'company_id',
            v_row->>'customer_id',
            v_row->>'supplier_id',
            v_row->>'item_id',
            v_row->>'sale_id',
            v_row->>'purchase_id',
            v_row->>'transfer_id',
            v_row->>'wh_transfer_id',
            v_row->>'acc_transfer_id',
            v_row->>'txn_id',
            v_row->>'exp_id',
            v_row->>'emp_id',
            v_row->>'payroll_id',
            v_row->>'loan_id',
            v_row->>'branch_id',
            v_row->>'user_id'
        ), '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        v_record_id := NULL;
    END;

    INSERT INTO ims.audit_logs (
        branch_id,
        user_id,
        action_type,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    )
    VALUES (
        v_branch_id,
        v_user_id,
        CASE
            WHEN TG_OP = 'INSERT' THEN 'create'
            WHEN TG_OP = 'UPDATE' THEN 'update'
            WHEN TG_OP = 'DELETE' THEN 'delete'
            ELSE LOWER(TG_OP)
        END,
        TG_TABLE_NAME,
        v_record_id,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        NULL,
        NULL
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'ims'
          AND tablename NOT IN ('audit_logs', 'schema_migrations')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_all_tables ON ims.%I', r.tablename);
        EXECUTE format(
            'CREATE TRIGGER trg_audit_all_tables
             AFTER INSERT OR UPDATE OR DELETE ON ims.%I
             FOR EACH ROW EXECUTE FUNCTION ims.fn_audit_all_tables()',
            r.tablename
        );
    END LOOP;
END;
$$;

-- =========================================================
-- 4) INDEXES (core)
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_user_branches_user ON ims.user_branches(user_id);
CREATE INDEX IF NOT EXISTS idx_items_branch ON ims.items(branch_id);
CREATE INDEX IF NOT EXISTS idx_wh_stock_item ON ims.warehouse_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON ims.sales(branch_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_purchases_branch_date ON ims.purchases(branch_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_acctxn_branch_date ON ims.account_transactions(branch_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON ims.audit_logs(created_at DESC);

-- =========================================================
-- 5) GENERIC CRUD FUNCTIONS FOR ALL TABLES (JSONB)
-- Creates: sp_<table>_add/get/list/del for every ims table
-- =========================================================

CREATE OR REPLACE FUNCTION ims.fn_where_sql(p_where JSONB, OUT sql TEXT, OUT params TEXT[])
RETURNS RECORD
LANGUAGE plpgsql
AS $$
DECLARE
k TEXT;
i INT := 1;
parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
params := ARRAY[]::TEXT[];
IF p_where IS NULL OR p_where = '{}'::jsonb THEN
sql := 'TRUE';
RETURN;
END IF;

FOR k IN SELECT key FROM jsonb_each(p_where)
LOOP
parts := parts || format('%I = $%s', k, i);
params := params || (p_where->>k);
i := i + 1;
END LOOP;

sql := array_to_string(parts, ' AND ');
END $$;

CREATE OR REPLACE FUNCTION ims.fn_insert_json(p_table REGCLASS, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
v_sql TEXT;
v_row JSONB;
BEGIN
v_sql := format(
'INSERT INTO %s SELECT (jsonb_populate_record(NULL::%s, $1)).* RETURNING to_jsonb(%s)',
p_table, p_table, p_table
);
EXECUTE v_sql USING p_data INTO v_row;
RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION ims.fn_get_json(p_table REGCLASS, p_where JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
v_where_sql TEXT;
v_params TEXT[];
v_sql TEXT;
v_row JSONB;
n INT;
BEGIN
SELECT sql, params INTO v_where_sql, v_params FROM ims.fn_where_sql(p_where);
v_sql := format('SELECT to_jsonb(t) FROM %s t WHERE %s LIMIT 1', p_table, v_where_sql);

n := COALESCE(array_length(v_params,1),0);
IF n = 0 THEN EXECUTE v_sql INTO v_row;
ELSIF n = 1 THEN EXECUTE v_sql USING v_params[1] INTO v_row;
ELSIF n = 2 THEN EXECUTE v_sql USING v_params[1], v_params[2] INTO v_row;
ELSIF n = 3 THEN EXECUTE v_sql USING v_params[1], v_params[2], v_params[3] INTO v_row;
ELSIF n = 4 THEN EXECUTE v_sql USING v_params[1], v_params[2], v_params[3], v_params[4] INTO v_row;
ELSE RAISE EXCEPTION 'Too many WHERE keys (max 4)'; END IF;

RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION ims.fn_delete_json(p_table REGCLASS, p_where JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
v_where_sql TEXT;
v_params TEXT[];
v_sql TEXT;
n INT;
BEGIN
SELECT sql, params INTO v_where_sql, v_params FROM ims.fn_where_sql(p_where);
v_sql := format('DELETE FROM %s WHERE %s', p_table, v_where_sql);

n := COALESCE(array_length(v_params,1),0);
IF n = 0 THEN EXECUTE v_sql;
ELSIF n = 1 THEN EXECUTE v_sql USING v_params[1];
ELSIF n = 2 THEN EXECUTE v_sql USING v_params[1], v_params[2];
ELSIF n = 3 THEN EXECUTE v_sql USING v_params[1], v_params[2], v_params[3];
ELSIF n = 4 THEN EXECUTE v_sql USING v_params[1], v_params[2], v_params[3], v_params[4];
ELSE RAISE EXCEPTION 'Too many WHERE keys (max 4)'; END IF;
END $$;

CREATE OR REPLACE FUNCTION ims.fn_list_json(p_table REGCLASS, p_limit INT DEFAULT 200, p_offset INT DEFAULT 0)
RETURNS SETOF JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_sql TEXT;
BEGIN
v_sql := format('SELECT to_jsonb(t) FROM %s t LIMIT %s OFFSET %s',
p_table, GREATEST(COALESCE(p_limit,200),0), GREATEST(COALESCE(p_offset,0),0));
RETURN QUERY EXECUTE v_sql;
END $$;

DO $crud$
DECLARE
r RECORD;
tname TEXT;
fq TEXT;
BEGIN
FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='ims' ORDER BY tablename
LOOP
tname := r.tablename;
fq := format('ims.%I', tname);

EXECUTE format($f$
  CREATE OR REPLACE FUNCTION ims.sp_%I_add(p_data JSONB)
  RETURNS JSONB LANGUAGE plpgsql AS $$
  BEGIN
    RETURN ims.fn_insert_json('%s'::regclass, p_data);
  END $$;
$f$, tname, fq);

EXECUTE format($f$
  CREATE OR REPLACE FUNCTION ims.sp_%I_get(p_where JSONB)
  RETURNS JSONB LANGUAGE plpgsql AS $$
  BEGIN
    RETURN ims.fn_get_json('%s'::regclass, p_where);
  END $$;
$f$, tname, fq);

EXECUTE format($f$
  CREATE OR REPLACE FUNCTION ims.sp_%I_list(p_limit INT DEFAULT 200, p_offset INT DEFAULT 0)
  RETURNS SETOF JSONB LANGUAGE plpgsql AS $$
  BEGIN
    RETURN QUERY SELECT * FROM ims.fn_list_json('%s'::regclass, p_limit, p_offset);
  END $$;
$f$, tname, fq);

EXECUTE format($f$
  CREATE OR REPLACE FUNCTION ims.sp_%I_del(p_where JSONB)
  RETURNS VOID LANGUAGE plpgsql AS $$
  BEGIN
    PERFORM ims.fn_delete_json('%s'::regclass, p_where);
  END $$;
$f$, tname, fq);

END LOOP;
END $crud$;

-- =========================================================
-- 6) VALIDATION + HELPERS (branch-safe)
-- =========================================================

CREATE OR REPLACE FUNCTION ims.fn_assert_branch_row(
p_table REGCLASS,
p_pk_col TEXT,
p_pk BIGINT,
p_branch_id BIGINT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
v_ok INT;
v_sql TEXT;
BEGIN
v_sql := format('SELECT 1 FROM %s WHERE %I = $1 AND branch_id = $2', p_table, p_pk_col);
EXECUTE v_sql USING p_pk, p_branch_id INTO v_ok;

IF v_ok IS NULL THEN
RAISE EXCEPTION 'Branch mismatch or missing row in % for id=% branch_id=%', p_table::TEXT, p_pk, p_branch_id;
END IF;
END $$;

CREATE OR REPLACE FUNCTION ims.fn_account_add(p_branch_id BIGINT, p_acc_id BIGINT, p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

UPDATE ims.accounts
SET balance = balance + p_amount
WHERE branch_id = p_branch_id AND acc_id = p_acc_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'Account not found or wrong branch. acc_id=% branch_id=%', p_acc_id, p_branch_id;
END IF;
END $$;

CREATE OR REPLACE FUNCTION ims.fn_account_sub(p_branch_id BIGINT, p_acc_id BIGINT, p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE v_bal NUMERIC;
BEGIN
IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

SELECT balance INTO v_bal
FROM ims.accounts
WHERE branch_id = p_branch_id AND acc_id = p_acc_id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'Account not found or wrong branch. acc_id=% branch_id=%', p_acc_id, p_branch_id;
END IF;

IF v_bal - p_amount < 0 THEN
RAISE EXCEPTION 'Insufficient balance. acc_id=%', p_acc_id;
END IF;

UPDATE ims.accounts
SET balance = balance - p_amount
WHERE branch_id = p_branch_id AND acc_id = p_acc_id;
END $$;

CREATE OR REPLACE FUNCTION ims.fn_stock_add(p_branch_id BIGINT, p_wh_id BIGINT, p_item_id BIGINT, p_qty NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
IF COALESCE(p_qty,0) <= 0 THEN RAISE EXCEPTION 'Qty must be > 0'; END IF;

PERFORM ims.fn_assert_branch_row('ims.warehouses'::regclass,'wh_id',p_wh_id,p_branch_id);
PERFORM ims.fn_assert_branch_row('ims.items'::regclass,'item_id',p_item_id,p_branch_id);

INSERT INTO ims.warehouse_stock(branch_id, wh_id, item_id, quantity)
VALUES (p_branch_id, p_wh_id, p_item_id, 0)
ON CONFLICT (wh_id, item_id) DO NOTHING;

UPDATE ims.warehouse_stock
SET quantity = quantity + p_qty,
branch_id = p_branch_id
WHERE wh_id = p_wh_id AND item_id = p_item_id;
END $$;

CREATE OR REPLACE FUNCTION ims.fn_stock_sub(p_branch_id BIGINT, p_wh_id BIGINT, p_item_id BIGINT, p_qty NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE v_qty NUMERIC;
BEGIN
IF COALESCE(p_qty,0) <= 0 THEN RAISE EXCEPTION 'Qty must be > 0'; END IF;

PERFORM ims.fn_assert_branch_row('ims.warehouses'::regclass,'wh_id',p_wh_id,p_branch_id);
PERFORM ims.fn_assert_branch_row('ims.items'::regclass,'item_id',p_item_id,p_branch_id);

SELECT quantity INTO v_qty
FROM ims.warehouse_stock
WHERE wh_id = p_wh_id AND item_id = p_item_id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'No stock row found for item_id=% wh_id=%', p_item_id, p_wh_id;
END IF;

IF v_qty - p_qty < 0 THEN
RAISE EXCEPTION 'Insufficient stock item_id=% wh_id=%', p_item_id, p_wh_id;
END IF;

UPDATE ims.warehouse_stock
SET quantity = quantity - p_qty,
branch_id = p_branch_id
WHERE wh_id = p_wh_id AND item_id = p_item_id;
END $$;

-- =========================================================
-- 7) POSTING PROCEDURES (branch-safe)
-- =========================================================

CREATE OR REPLACE FUNCTION ims.sp_post_opening_stock(
p_branch_id BIGINT,
p_wh_id BIGINT,
p_user_id BIGINT,
p_items JSONB,
p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
v_it JSONB;
v_item_id BIGINT;
v_qty NUMERIC;
v_unit_cost NUMERIC;
BEGIN
PERFORM ims.fn_assert_branch_row('ims.warehouses'::regclass,'wh_id',p_wh_id,p_branch_id);
IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
RAISE EXCEPTION 'p_items must be JSON array';
END IF;

FOR v_it IN SELECT value FROM jsonb_array_elements(p_items)
LOOP
v_item_id := (v_it->>'item_id')::BIGINT;
v_qty := COALESCE((v_it->>'qty')::NUMERIC, 0);
v_unit_cost := COALESCE((v_it->>'unit_cost')::NUMERIC, 0);

PERFORM ims.fn_assert_branch_row('ims.items'::regclass,'item_id',v_item_id,p_branch_id);
IF v_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0'; END IF;

PERFORM ims.fn_stock_add(p_branch_id, p_wh_id, v_item_id, v_qty);

INSERT INTO ims.inventory_movements(
  branch_id, wh_id, item_id, move_type, ref_table, ref_id,
  qty_in, qty_out, unit_cost, note
)
VALUES(
  p_branch_id, p_wh_id, v_item_id, 'opening',
  'opening_stock', NULL, v_qty, 0, v_unit_cost, COALESCE(p_note, v_it->>'note')
);

END LOOP;
END $$;

CREATE OR REPLACE FUNCTION ims.sp_post_sale(
p_branch_id BIGINT,
p_wh_id BIGINT,
p_user_id BIGINT,
p_customer_id BIGINT,
p_sale_type ims.sale_type_enum,
p_discount NUMERIC DEFAULT 0,
p_tax_percent NUMERIC DEFAULT 0,
p_items JSONB DEFAULT '[]'::jsonb,
p_payments JSONB DEFAULT '[]'::jsonb,
p_note TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
v_sale_id BIGINT;
v_it JSONB;
v_pay JSONB;

v_item_id BIGINT;
v_qty NUMERIC;
v_unit_price NUMERIC;
v_line_total NUMERIC;

v_subtotal NUMERIC := 0;
v_tax_amount NUMERIC := 0;
v_total NUMERIC := 0;

v_paid NUMERIC := 0;
v_acc_id BIGINT;
v_amt NUMERIC;

v_status ims.sale_status_enum := 'unpaid';
BEGIN
PERFORM ims.fn_assert_branch_row('ims.warehouses'::regclass,'wh_id',p_wh_id,p_branch_id);
IF p_customer_id IS NOT NULL THEN
PERFORM ims.fn_assert_branch_row('ims.customers'::regclass,'customer_id',p_customer_id,p_branch_id);
END IF;

IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN
RAISE EXCEPTION 'p_items must be non-empty JSON array';
END IF;

IF p_discount < 0 THEN RAISE EXCEPTION 'discount must be >= 0'; END IF;
IF p_tax_percent < 0 THEN RAISE EXCEPTION 'tax_percent must be >= 0'; END IF;

INSERT INTO ims.sales(branch_id, wh_id, user_id, customer_id, sale_type, subtotal, discount, tax_amount, total, status, note)
VALUES (p_branch_id, p_wh_id, p_user_id, p_customer_id, p_sale_type, 0, p_discount, 0, 0, 'unpaid', p_note)
RETURNING sale_id INTO v_sale_id;

FOR v_it IN SELECT value FROM jsonb_array_elements(p_items)
LOOP
v_item_id := (v_it->>'item_id')::BIGINT;
v_qty := COALESCE((v_it->>'qty')::NUMERIC, 0);
v_unit_price := COALESCE((v_it->>'unit_price')::NUMERIC, 0);

IF v_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0'; END IF;
IF v_unit_price < 0 THEN RAISE EXCEPTION 'unit_price must be >= 0'; END IF;

PERFORM ims.fn_assert_branch_row('ims.items'::regclass,'item_id',v_item_id,p_branch_id);

v_line_total := round(v_qty * v_unit_price, 2);
v_subtotal := v_subtotal + v_line_total;

INSERT INTO ims.sale_items(branch_id, sale_id, item_id, quantity, unit_price, line_total)
VALUES (p_branch_id, v_sale_id, v_item_id, v_qty, v_unit_price, v_line_total);

PERFORM ims.fn_stock_sub(p_branch_id, p_wh_id, v_item_id, v_qty);

INSERT INTO ims.inventory_movements(branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note)
VALUES(p_branch_id, p_wh_id, v_item_id, 'sale', 'sales', v_sale_id, 0, v_qty, 0, 'Sale issue');

END LOOP;

v_tax_amount := round((GREATEST(v_subtotal - p_discount, 0) * p_tax_percent) / 100.0, 2);
v_total := round(GREATEST(v_subtotal - p_discount, 0) + v_tax_amount, 2);

IF p_payments IS NULL THEN p_payments := '[]'::jsonb; END IF;
IF jsonb_typeof(p_payments) <> 'array' THEN RAISE EXCEPTION 'p_payments must be JSON array'; END IF;

FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
LOOP
v_acc_id := (v_pay->>'acc_id')::BIGINT;
v_amt := COALESCE((v_pay->>'amount_paid')::NUMERIC,0);

IF v_amt <= 0 THEN RAISE EXCEPTION 'payment amount must be > 0'; END IF;
PERFORM ims.fn_assert_branch_row('ims.accounts'::regclass,'acc_id',v_acc_id,p_branch_id);

PERFORM ims.fn_account_add(p_branch_id, v_acc_id, v_amt);

INSERT INTO ims.sale_payments(branch_id, sale_id, user_id, acc_id, amount_paid, reference_no, note)
VALUES(p_branch_id, v_sale_id, p_user_id, v_acc_id, v_amt, v_pay->>'reference_no', v_pay->>'note');

INSERT INTO ims.account_transactions(branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
VALUES(p_branch_id, v_acc_id, 'sale_payment', 'sales', v_sale_id, 0, v_amt, 'Sale payment');

IF p_customer_id IS NOT NULL THEN
  INSERT INTO ims.customer_ledger(branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
  VALUES(p_branch_id, p_customer_id, 'payment', 'sales', v_sale_id, v_acc_id, 0, v_amt, 'Customer payment');
END IF;

v_paid := v_paid + v_amt;

END LOOP;

IF p_customer_id IS NOT NULL THEN
INSERT INTO ims.customer_ledger(branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
VALUES(p_branch_id, p_customer_id, 'sale', 'sales', v_sale_id, NULL, v_total, 0, 'Sale invoice');
END IF;

IF v_total = 0 THEN
v_status := 'paid';
ELSIF v_paid >= v_total THEN
v_status := 'paid';
ELSIF v_paid > 0 THEN
v_status := 'partial';
ELSE
v_status := 'unpaid';
END IF;

UPDATE ims.sales
SET subtotal = v_subtotal,
discount = p_discount,
tax_amount = v_tax_amount,
total = v_total,
status = v_status
WHERE branch_id = p_branch_id AND sale_id = v_sale_id;

RETURN v_sale_id;
END $$;

CREATE OR REPLACE FUNCTION ims.sp_post_purchase(
p_branch_id BIGINT,
p_wh_id BIGINT,
p_user_id BIGINT,
p_supplier_id BIGINT,
p_discount NUMERIC DEFAULT 0,
p_items JSONB DEFAULT '[]'::jsonb,
p_payment JSONB DEFAULT NULL,
p_note TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
v_purchase_id BIGINT;
v_it JSONB;

v_item_id BIGINT;
v_qty NUMERIC;
v_unit_cost NUMERIC;
v_line_total NUMERIC;

v_subtotal NUMERIC := 0;
v_total NUMERIC := 0;

v_paid NUMERIC := 0;
v_acc_id BIGINT;
v_amt NUMERIC;

v_status ims.purchase_status_enum := 'unpaid';
BEGIN
PERFORM ims.fn_assert_branch_row('ims.warehouses'::regclass,'wh_id',p_wh_id,p_branch_id);
PERFORM ims.fn_assert_branch_row('ims.suppliers'::regclass,'supplier_id',p_supplier_id,p_branch_id);

IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN
RAISE EXCEPTION 'p_items must be non-empty JSON array';
END IF;

IF p_discount < 0 THEN RAISE EXCEPTION 'discount must be >= 0'; END IF;

INSERT INTO ims.purchases(branch_id, wh_id, user_id, supplier_id, purchase_type, subtotal, discount, total, status, note)
VALUES (p_branch_id, p_wh_id, p_user_id, p_supplier_id, 'cash', 0, p_discount, 0, 'unpaid', p_note)
RETURNING purchase_id INTO v_purchase_id;

FOR v_it IN SELECT value FROM jsonb_array_elements(p_items)
LOOP
v_item_id := (v_it->>'item_id')::BIGINT;
v_qty := COALESCE((v_it->>'qty')::NUMERIC, 0);
v_unit_cost := COALESCE((v_it->>'unit_cost')::NUMERIC, 0);

IF v_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0'; END IF;
IF v_unit_cost < 0 THEN RAISE EXCEPTION 'unit_cost must be >= 0'; END IF;

PERFORM ims.fn_assert_branch_row('ims.items'::regclass,'item_id',v_item_id,p_branch_id);

v_line_total := round(v_qty * v_unit_cost, 2);
v_subtotal := v_subtotal + v_line_total;

INSERT INTO ims.purchase_items(branch_id, purchase_id, item_id, quantity, unit_cost, line_total, batch_no, expiry_date)
VALUES (p_branch_id, v_purchase_id, v_item_id, v_qty, v_unit_cost, v_line_total, v_it->>'batch_no',
        CASE WHEN (v_it ? 'expiry_date') THEN (v_it->>'expiry_date')::date ELSE NULL END);

PERFORM ims.fn_stock_add(p_branch_id, p_wh_id, v_item_id, v_qty);

INSERT INTO ims.inventory_movements(branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note)
VALUES(p_branch_id, p_wh_id, v_item_id, 'purchase', 'purchases', v_purchase_id, v_qty, 0, v_unit_cost, 'Purchase receive');

END LOOP;

v_total := round(GREATEST(v_subtotal - p_discount, 0), 2);

INSERT INTO ims.supplier_ledger(branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
VALUES(p_branch_id, p_supplier_id, 'purchase', 'purchases', v_purchase_id, NULL, 0, v_total, 'Purchase bill');

IF p_payment IS NOT NULL THEN
v_acc_id := (p_payment->>'acc_id')::BIGINT;
v_amt := COALESCE((p_payment->>'amount_paid')::NUMERIC,0);

IF v_amt <= 0 THEN RAISE EXCEPTION 'payment amount must be > 0'; END IF;
PERFORM ims.fn_assert_branch_row('ims.accounts'::regclass,'acc_id',v_acc_id,p_branch_id);

PERFORM ims.fn_account_sub(p_branch_id, v_acc_id, v_amt);

INSERT INTO ims.supplier_payments(branch_id, purchase_id, user_id, acc_id, amount_paid, reference_no, note)
VALUES(p_branch_id, v_purchase_id, p_user_id, v_acc_id, v_amt, p_payment->>'reference_no', p_payment->>'note');

INSERT INTO ims.account_transactions(branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
VALUES(p_branch_id, v_acc_id, 'supplier_payment', 'purchases', v_purchase_id, v_amt, 0, 'Supplier payment');

INSERT INTO ims.supplier_ledger(branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
VALUES(p_branch_id, p_supplier_id, 'payment', 'purchases', v_purchase_id, v_acc_id, v_amt, 0, 'Supplier payment');

v_paid := v_amt;
END IF;

IF v_total = 0 THEN
v_status := 'received';
ELSIF v_paid >= v_total THEN
v_status := 'received';
ELSIF v_paid > 0 THEN
v_status := 'partial';
ELSE
v_status := 'unpaid';
END IF;

UPDATE ims.purchases
SET subtotal = v_subtotal,
discount = p_discount,
total = v_total,
status = v_status
WHERE branch_id = p_branch_id AND purchase_id = v_purchase_id;

RETURN v_purchase_id;
END $$;

CREATE OR REPLACE FUNCTION ims.sp_post_expense(
p_branch_id BIGINT,
p_user_id BIGINT,
p_exp_type_id BIGINT,
p_amount NUMERIC,
p_acc_id BIGINT,
p_pay_now BOOLEAN DEFAULT TRUE,
p_note TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE v_exp_id BIGINT;
BEGIN
IF p_exp_type_id IS NOT NULL THEN
PERFORM ims.fn_assert_branch_row('ims.expense_types'::regclass,'exp_type_id',p_exp_type_id,p_branch_id);
END IF;

IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;
PERFORM ims.fn_assert_branch_row('ims.accounts'::regclass,'acc_id',p_acc_id,p_branch_id);

INSERT INTO ims.expenses(branch_id, user_id, exp_type_id, exp_date, amount, note)
VALUES(p_branch_id, p_user_id, p_exp_type_id, NOW(), p_amount, p_note)
RETURNING exp_id INTO v_exp_id;

IF p_pay_now THEN
PERFORM ims.fn_account_sub(p_branch_id, p_acc_id, p_amount);

INSERT INTO ims.expense_payments(branch_id, exp_id, user_id, acc_id, amount_paid, reference_no, note)
VALUES(p_branch_id, v_exp_id, p_user_id, p_acc_id, p_amount, NULL, 'Expense payment');

INSERT INTO ims.account_transactions(branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
VALUES(p_branch_id, p_acc_id, 'expense_payment', 'expenses', v_exp_id, p_amount, 0, 'Expense paid');
END IF;

RETURN v_exp_id;
END $$;

CREATE OR REPLACE FUNCTION ims.sp_post_account_transfer(
p_branch_id BIGINT,
p_acc_transfer_id BIGINT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
v_from BIGINT;
v_to BIGINT;
v_amount NUMERIC;
BEGIN
PERFORM ims.fn_assert_branch_row('ims.account_transfers'::regclass,'acc_transfer_id',p_acc_transfer_id,p_branch_id);

SELECT from_acc_id, to_acc_id, amount
INTO v_from, v_to, v_amount
FROM ims.account_transfers
WHERE branch_id = p_branch_id AND acc_transfer_id = p_acc_transfer_id
FOR UPDATE;

IF v_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

PERFORM ims.fn_assert_branch_row('ims.accounts'::regclass,'acc_id',v_from,p_branch_id);
PERFORM ims.fn_assert_branch_row('ims.accounts'::regclass,'acc_id',v_to,p_branch_id);

IF EXISTS (SELECT 1 FROM ims.account_transfers WHERE branch_id=p_branch_id AND acc_transfer_id=p_acc_transfer_id AND status='posted') THEN
RAISE EXCEPTION 'Transfer already posted';
END IF;

PERFORM ims.fn_account_sub(p_branch_id, v_from, v_amount);
PERFORM ims.fn_account_add(p_branch_id, v_to, v_amount);

INSERT INTO ims.account_transactions(branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
VALUES(p_branch_id, v_from, 'account_transfer', 'account_transfers', p_acc_transfer_id, v_amount, 0, 'Transfer out');

INSERT INTO ims.account_transactions(branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
VALUES(p_branch_id, v_to, 'account_transfer', 'account_transfers', p_acc_transfer_id, 0, v_amount, 'Transfer in');

UPDATE ims.account_transfers
SET status='posted'
WHERE branch_id = p_branch_id AND acc_transfer_id = p_acc_transfer_id;
END $$;

CREATE OR REPLACE FUNCTION ims.sp_post_payroll(
p_branch_id BIGINT,
p_payroll_id BIGINT,
p_acc_id BIGINT,
p_paid_by BIGINT,
p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
v_status ims.payroll_status_enum;
r RECORD;
v_net NUMERIC;
BEGIN
PERFORM ims.fn_assert_branch_row('ims.payroll_runs'::regclass,'payroll_id',p_payroll_id,p_branch_id);
PERFORM ims.fn_assert_branch_row('ims.accounts'::regclass,'acc_id',p_acc_id,p_branch_id);

SELECT status INTO v_status
FROM ims.payroll_runs
WHERE branch_id=p_branch_id AND payroll_id=p_payroll_id
FOR UPDATE;

IF v_status <> 'draft' THEN
RAISE EXCEPTION 'Payroll must be draft to post';
END IF;

FOR r IN
SELECT payroll_line_id, emp_id, basic_salary, allowances, deductions, net_salary
FROM ims.payroll_lines
WHERE branch_id=p_branch_id AND payroll_id=p_payroll_id
LOOP
v_net := r.net_salary;
IF v_net = 0 THEN
v_net := GREATEST(r.basic_salary + r.allowances - r.deductions, 0);
UPDATE ims.payroll_lines
SET net_salary = v_net
WHERE branch_id=p_branch_id AND payroll_line_id=r.payroll_line_id;
END IF;

IF v_net > 0 THEN
  PERFORM ims.fn_account_sub(p_branch_id, p_acc_id, v_net);

  INSERT INTO ims.employee_payments(
    branch_id, payroll_id, payroll_line_id, emp_id, paid_by, acc_id, amount_paid, note
  )
  VALUES(
    p_branch_id, p_payroll_id, r.payroll_line_id, r.emp_id, p_paid_by, p_acc_id, v_net, p_note
  );

  INSERT INTO ims.account_transactions(branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
  VALUES(p_branch_id, p_acc_id, 'payroll_payment', 'payroll_runs', p_payroll_id, v_net, 0, 'Payroll payment');
END IF;

END LOOP;

UPDATE ims.payroll_runs
SET status='posted'
WHERE branch_id=p_branch_id AND payroll_id=p_payroll_id;
END $$;

-- Sales return posting with optional refund payment
CREATE OR REPLACE FUNCTION ims.sp_post_sales_return(
p_branch_id BIGINT,
p_wh_id BIGINT,
p_user_id BIGINT,
p_customer_id BIGINT,
p_sale_id BIGINT,
p_items JSONB,
p_refund JSONB DEFAULT NULL,
p_note TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
v_sr_id BIGINT;
v_it JSONB;
v_item_id BIGINT;
v_qty NUMERIC;
v_unit_price NUMERIC;
v_line_total NUMERIC;
v_subtotal NUMERIC := 0;
v_total NUMERIC := 0;
v_acc_id BIGINT;
v_amt NUMERIC;
BEGIN
PERFORM ims.fn_assert_branch_row('ims.warehouses'::regclass,'wh_id',p_wh_id,p_branch_id);
IF p_customer_id IS NOT NULL THEN
PERFORM ims.fn_assert_branch_row('ims.customers'::regclass,'customer_id',p_customer_id,p_branch_id);
END IF;

IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN
RAISE EXCEPTION 'p_items must be non-empty JSON array';
END IF;

INSERT INTO ims.sales_returns(branch_id, sale_id, wh_id, user_id, customer_id, subtotal, total, note)
VALUES(p_branch_id, p_sale_id, p_wh_id, p_user_id, p_customer_id, 0, 0, p_note)
RETURNING sr_id INTO v_sr_id;

FOR v_it IN SELECT value FROM jsonb_array_elements(p_items)
LOOP
v_item_id := (v_it->>'item_id')::BIGINT;
v_qty := COALESCE((v_it->>'qty')::NUMERIC,0);
v_unit_price := COALESCE((v_it->>'unit_price')::NUMERIC,0);

IF v_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0'; END IF;
IF v_unit_price < 0 THEN RAISE EXCEPTION 'unit_price must be >= 0'; END IF;

PERFORM ims.fn_assert_branch_row('ims.items'::regclass,'item_id',v_item_id,p_branch_id);

v_line_total := round(v_qty * v_unit_price, 2);
v_subtotal := v_subtotal + v_line_total;

INSERT INTO ims.sales_return_items(branch_id, sr_id, item_id, quantity, unit_price, line_total)
VALUES(p_branch_id, v_sr_id, v_item_id, v_qty, v_unit_price, v_line_total);

PERFORM ims.fn_stock_add(p_branch_id, p_wh_id, v_item_id, v_qty);

INSERT INTO ims.inventory_movements(branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note)
VALUES(p_branch_id, p_wh_id, v_item_id, 'sales_return', 'sales_returns', v_sr_id, v_qty, 0, 0, 'Sales return');

END LOOP;

v_total := v_subtotal;

UPDATE ims.sales_returns
SET subtotal=v_subtotal, total=v_total
WHERE branch_id=p_branch_id AND sr_id=v_sr_id;

IF p_customer_id IS NOT NULL THEN
INSERT INTO ims.customer_ledger(branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
VALUES(p_branch_id, p_customer_id, 'return', 'sales_returns', v_sr_id, NULL, 0, v_total, 'Sales return credit');
END IF;

IF p_refund IS NOT NULL THEN
v_acc_id := (p_refund->>'acc_id')::BIGINT;
v_amt := COALESCE((p_refund->>'amount_refund')::NUMERIC,0);

IF v_amt <= 0 THEN RAISE EXCEPTION 'refund amount must be > 0'; END IF;
PERFORM ims.fn_assert_branch_row('ims.accounts'::regclass,'acc_id',v_acc_id,p_branch_id);

PERFORM ims.fn_account_sub(p_branch_id, v_acc_id, v_amt);

INSERT INTO ims.account_transactions(branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
VALUES(p_branch_id, v_acc_id, 'return_refund', 'sales_returns', v_sr_id, v_amt, 0, 'Customer refund');
END IF;

RETURN v_sr_id;
END $$;

-- Purchase return posting
CREATE OR REPLACE FUNCTION ims.sp_post_purchase_return(
p_branch_id BIGINT,
p_wh_id BIGINT,
p_user_id BIGINT,
p_supplier_id BIGINT,
p_purchase_id BIGINT,
p_items JSONB,
p_note TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
v_pr_id BIGINT;
v_it JSONB;
v_item_id BIGINT;
v_qty NUMERIC;
v_unit_cost NUMERIC;
v_line_total NUMERIC;
v_subtotal NUMERIC := 0;
v_total NUMERIC := 0;
BEGIN
PERFORM ims.fn_assert_branch_row('ims.warehouses'::regclass,'wh_id',p_wh_id,p_branch_id);
PERFORM ims.fn_assert_branch_row('ims.suppliers'::regclass,'supplier_id',p_supplier_id,p_branch_id);

IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN
RAISE EXCEPTION 'p_items must be non-empty JSON array';
END IF;

INSERT INTO ims.purchase_returns(branch_id, purchase_id, wh_id, user_id, supplier_id, subtotal, total, note)
VALUES(p_branch_id, p_purchase_id, p_wh_id, p_user_id, p_supplier_id, 0, 0, p_note)
RETURNING pr_id INTO v_pr_id;

FOR v_it IN SELECT value FROM jsonb_array_elements(p_items)
LOOP
v_item_id := (v_it->>'item_id')::BIGINT;
v_qty := COALESCE((v_it->>'qty')::NUMERIC,0);
v_unit_cost := COALESCE((v_it->>'unit_cost')::NUMERIC,0);

IF v_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0'; END IF;
IF v_unit_cost < 0 THEN RAISE EXCEPTION 'unit_cost must be >= 0'; END IF;

PERFORM ims.fn_assert_branch_row('ims.items'::regclass,'item_id',v_item_id,p_branch_id);

v_line_total := round(v_qty * v_unit_cost, 2);
v_subtotal := v_subtotal + v_line_total;

INSERT INTO ims.purchase_return_items(branch_id, pr_id, item_id, quantity, unit_cost, line_total)
VALUES(p_branch_id, v_pr_id, v_item_id, v_qty, v_unit_cost, v_line_total);

PERFORM ims.fn_stock_sub(p_branch_id, p_wh_id, v_item_id, v_qty);

INSERT INTO ims.inventory_movements(branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note)
VALUES(p_branch_id, p_wh_id, v_item_id, 'purchase_return', 'purchase_returns', v_pr_id, 0, v_qty, v_unit_cost, 'Purchase return');

END LOOP;

v_total := v_subtotal;

UPDATE ims.purchase_returns
SET subtotal=v_subtotal, total=v_total
WHERE branch_id=p_branch_id AND pr_id=v_pr_id;

INSERT INTO ims.supplier_ledger(branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
VALUES(p_branch_id, p_supplier_id, 'return', 'purchase_returns', v_pr_id, NULL, v_total, 0, 'Purchase return debit');

RETURN v_pr_id;
END $$;

-- Walking Supplier helper
CREATE OR REPLACE FUNCTION ims.fn_get_or_create_walking_supplier(p_branch_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_supplier_id BIGINT;
BEGIN
    SELECT supplier_id INTO v_supplier_id
    FROM ims.suppliers
    WHERE branch_id = p_branch_id
      AND LOWER(COALESCE(name, '')) = 'walking supplier'
    LIMIT 1;

    IF v_supplier_id IS NOT NULL THEN
        RETURN v_supplier_id;
    END IF;

    INSERT INTO ims.suppliers (branch_id, name, is_active)
    VALUES (p_branch_id, 'Walking Supplier', TRUE)
    RETURNING supplier_id INTO v_supplier_id;

    RETURN v_supplier_id;
END;
$$;
COMMENT ON FUNCTION ims.fn_get_or_create_walking_supplier IS 'Returns supplier_id for Walking Supplier; creates one per branch if needed';

-- =========================================================
-- 8) REPORTS (branch-based)
-- =========================================================

CREATE OR REPLACE FUNCTION ims.rpt_income_statement(
p_branch_id BIGINT,
p_date_from DATE,
p_date_to DATE
) RETURNS TABLE(
total_sales NUMERIC,
total_expenses NUMERIC,
gross_profit NUMERIC
)
LANGUAGE sql
AS $$
SELECT
COALESCE((SELECT SUM(total) FROM ims.sales WHERE branch_id=p_branch_id AND sale_date::date BETWEEN p_date_from AND p_date_to AND status <> 'void'),0) AS total_sales,
COALESCE((SELECT SUM(amount) FROM ims.expense_charges WHERE branch_id=p_branch_id AND charge_date::date BETWEEN p_date_from AND p_date_to),0) AS total_expenses,
COALESCE((SELECT SUM(total) FROM ims.sales WHERE branch_id=p_branch_id AND sale_date::date BETWEEN p_date_from AND p_date_to AND status <> 'void'),0)
-
COALESCE((SELECT SUM(amount) FROM ims.expense_charges WHERE branch_id=p_branch_id AND charge_date::date BETWEEN p_date_from AND p_date_to),0) AS gross_profit;
$$;

CREATE OR REPLACE FUNCTION ims.rpt_balance_sheet(
p_branch_id BIGINT,
p_as_of DATE
) RETURNS TABLE(
cash_and_bank NUMERIC,
accounts_receivable NUMERIC,
accounts_payable NUMERIC,
net_position NUMERIC
)
LANGUAGE sql
AS $$
WITH
cash AS (
SELECT COALESCE(SUM(balance),0) AS v
FROM ims.accounts
WHERE branch_id=p_branch_id AND is_active=TRUE
),
ar AS (
SELECT COALESCE(SUM(debit - credit),0) AS v
FROM ims.customer_ledger
WHERE branch_id=p_branch_id AND entry_date::date <= p_as_of
),
ap AS (
SELECT COALESCE(SUM(credit - debit),0) AS v
FROM ims.supplier_ledger
WHERE branch_id=p_branch_id AND entry_date::date <= p_as_of
)
SELECT cash.v, ar.v, ap.v, (cash.v + ar.v - ap.v) AS net_position
FROM cash, ar, ap;
$$;

CREATE OR REPLACE FUNCTION ims.rpt_cash_flow(
p_branch_id BIGINT,
p_date_from DATE,
p_date_to DATE
) RETURNS TABLE(
cash_in NUMERIC,
cash_out NUMERIC,
net_cash_flow NUMERIC
)
LANGUAGE sql
AS $$
SELECT
COALESCE(SUM(credit),0) AS cash_in,
COALESCE(SUM(debit),0) AS cash_out,
COALESCE(SUM(credit),0) - COALESCE(SUM(debit),0) AS net_cash_flow
FROM ims.account_transactions
WHERE branch_id=p_branch_id
AND txn_date::date BETWEEN p_date_from AND p_date_to;
$$;

CREATE OR REPLACE FUNCTION ims.rpt_customers_all(p_branch_id BIGINT)
RETURNS TABLE(customer_id BIGINT, full_name VARCHAR, phone VARCHAR, balance NUMERIC)
LANGUAGE sql
AS $$
SELECT c.customer_id, c.full_name, c.phone,
COALESCE((SELECT SUM(debit-credit) FROM ims.customer_ledger l WHERE l.branch_id=p_branch_id AND l.customer_id=c.customer_id),0) AS balance
FROM ims.customers c
WHERE c.branch_id=p_branch_id
ORDER BY c.full_name;
$$;

CREATE OR REPLACE FUNCTION ims.rpt_customer_between(
p_branch_id BIGINT, p_customer_id BIGINT, p_date_from DATE, p_date_to DATE
) RETURNS TABLE(entry_date TIMESTAMPTZ, entry_type ims.ledger_entry_enum, ref_table VARCHAR, ref_id BIGINT, debit NUMERIC, credit NUMERIC, note TEXT)
LANGUAGE sql
AS $$
SELECT entry_date, entry_type, ref_table, ref_id, debit, credit, note
FROM ims.customer_ledger
WHERE branch_id=p_branch_id AND customer_id=p_customer_id
AND entry_date::date BETWEEN p_date_from AND p_date_to
ORDER BY entry_date;
$$;

CREATE OR REPLACE FUNCTION ims.rpt_employees_all(p_branch_id BIGINT)
RETURNS TABLE(emp_id BIGINT, full_name VARCHAR, phone VARCHAR, status ims.employment_status_enum, hire_date DATE)
LANGUAGE sql
AS $$
SELECT emp_id, full_name, phone, status, hire_date
FROM ims.employees
WHERE branch_id=p_branch_id
ORDER BY full_name;
$$;

CREATE OR REPLACE FUNCTION ims.rpt_employee_payments_between(
p_branch_id BIGINT, p_emp_id BIGINT, p_date_from DATE, p_date_to DATE
) RETURNS TABLE(pay_date TIMESTAMPTZ, amount_paid NUMERIC, acc_id BIGINT, note TEXT)
LANGUAGE sql
AS $$
SELECT pay_date, amount_paid, acc_id, note
FROM ims.employee_payments
WHERE branch_id=p_branch_id AND emp_id=p_emp_id
AND pay_date::date BETWEEN p_date_from AND p_date_to
ORDER BY pay_date;
$$;

CREATE OR REPLACE FUNCTION ims.rpt_inventory_qty(p_branch_id BIGINT, p_wh_id BIGINT)
RETURNS TABLE(item_id BIGINT, item_name VARCHAR, quantity NUMERIC)
LANGUAGE sql
AS $$
SELECT s.item_id, i.name, s.quantity
FROM ims.warehouse_stock s
JOIN ims.items i ON i.item_id=s.item_id
WHERE i.branch_id=p_branch_id AND s.wh_id=p_wh_id
ORDER BY i.name;
$$;

-- Drop first to allow changing OUT columns safely
DROP FUNCTION IF EXISTS ims.rpt_low_stock(BIGINT, BIGINT);

-- Low-stock report based on items.stock_alert threshold (store-level)
CREATE OR REPLACE FUNCTION ims.rpt_low_stock(p_branch_id BIGINT, p_store_id BIGINT)
RETURNS TABLE(
    item_id BIGINT,
    item_name VARCHAR,
    quantity NUMERIC,
    stock_alert NUMERIC
)
LANGUAGE sql
AS $$
SELECT
    si.product_id AS item_id,
    i.name AS item_name,
    si.quantity,
    i.stock_alert
FROM ims.store_items si
JOIN ims.items i ON i.item_id = si.product_id
WHERE i.branch_id = p_branch_id
  AND si.store_id = p_store_id
  AND si.quantity <= i.stock_alert
ORDER BY (i.stock_alert - si.quantity) DESC, i.name;
$$;

CREATE OR REPLACE FUNCTION ims.rpt_today_sales(p_branch_id BIGINT)
RETURNS TABLE(sale_id BIGINT, sale_date TIMESTAMPTZ, total NUMERIC, status ims.sale_status_enum)
LANGUAGE sql
AS $$
SELECT sale_id, sale_date, total, status
FROM ims.sales
WHERE branch_id=p_branch_id
AND sale_date::date = CURRENT_DATE
ORDER BY sale_date DESC;
$$;

/* =========================================================
COMPLETE DYNAMIC PERMISSION & SIDEBAR MENU SYSTEM
PostgreSQL ONLY
========================================================= */

-- =========================================================
-- 1) PERMISSION GENERATION PROCEDURES
-- =========================================================

-- Procedure to generate permissions for ALL tables dynamically
CREATE OR REPLACE FUNCTION ims.sp_generate_all_permissions()
RETURNS TABLE(module_name TEXT, permission_count INT) 
LANGUAGE plpgsql
AS $$
DECLARE
    r RECORD;
    v_module TEXT;
    v_submodule TEXT;
    v_count INT := 0;
BEGIN
    -- Clear existing permissions (optional - comment out if you want to keep existing)
    -- TRUNCATE ims.permissions RESTART IDENTITY CASCADE;
    
    -- Generate permissions for each table in ims schema
    FOR r IN 
        SELECT 
            tablename,
            CASE 
                WHEN tablename LIKE 'sale%' OR tablename = 'customers' OR tablename = 'shifts' THEN 'Sales & POS'
                WHEN tablename LIKE 'purchase%' OR tablename = 'suppliers' THEN 'Purchases'
                WHEN tablename LIKE 'item%' OR tablename IN ('categories', 'units', 'taxes', 'warehouse%', 'inventory_movements') THEN 'Inventory'
                WHEN tablename LIKE 'account%' OR tablename IN ('expenses', 'expense_types', 'customer_ledger', 'supplier_ledger') THEN 'Finance'
                WHEN tablename LIKE 'emp%' OR tablename IN ('salary_types', 'payroll%', 'loans', 'shifts') THEN 'Human Resources'
                WHEN tablename IN ('users', 'roles', 'branches', 'company', 'audit_logs', 'permissions') THEN 'System Administration'
                WHEN tablename LIKE 'return%' THEN 'Returns Management'
                WHEN tablename LIKE 'transfer%' THEN 'Transfers'
                ELSE 'Other'
            END as module,
            CASE
                WHEN tablename LIKE 'sale%' THEN 'Sales'
                WHEN tablename = 'customers' THEN 'Customers'
                WHEN tablename = 'shifts' THEN 'Cashier'
                WHEN tablename LIKE 'purchase%' THEN 'Purchases'
                WHEN tablename = 'suppliers' THEN 'Suppliers'
                WHEN tablename = 'items' THEN 'Products'
                WHEN tablename = 'categories' THEN 'Categories'
                WHEN tablename = 'units' THEN 'Units'
                WHEN tablename = 'taxes' THEN 'Taxes'
                WHEN tablename LIKE 'warehouse%' THEN 'Warehouses'
                WHEN tablename = 'inventory_movements' THEN 'Movements'
                WHEN tablename LIKE 'account%' THEN 'Accounts'
                WHEN tablename = 'expenses' THEN 'Expenses'
                WHEN tablename = 'expense_types' THEN 'Expense Types'
                WHEN tablename LIKE '%ledger' THEN 'Ledgers'
                WHEN tablename LIKE 'emp%' THEN 'Employees'
                WHEN tablename LIKE 'payroll%' THEN 'Payroll'
                WHEN tablename = 'loans' THEN 'Loans'
                WHEN tablename LIKE 'return%' THEN 'Returns'
                WHEN tablename LIKE 'transfer%' THEN 'Transfers'
                ELSE initcap(replace(tablename, '_', ' '))
            END as submodule
        FROM pg_tables 
        WHERE schemaname = 'ims' 
        ORDER BY tablename
    LOOP
        -- Generate VIEW permission
        INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
        VALUES (
            r.tablename || '.view',
            'View ' || initcap(replace(r.tablename, '_', ' ')),
            r.module,
            r.submodule,
            'view',
            'View ' || r.tablename || ' records'
        ) ON CONFLICT (perm_key) DO NOTHING;
        
        -- Generate CREATE permission
        INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
        VALUES (
            r.tablename || '.create',
            'Create ' || initcap(replace(r.tablename, '_', ' ')),
            r.module,
            r.submodule,
            'create',
            'Create new ' || r.tablename || ' records'
        ) ON CONFLICT (perm_key) DO NOTHING;
        
        -- Generate UPDATE permission
        INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
        VALUES (
            r.tablename || '.update',
            'Update ' || initcap(replace(r.tablename, '_', ' ')),
            r.module,
            r.submodule,
            'update',
            'Update existing ' || r.tablename || ' records'
        ) ON CONFLICT (perm_key) DO NOTHING;
        
        -- Generate DELETE permission
        INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
        VALUES (
            r.tablename || '.delete',
            'Delete ' || initcap(replace(r.tablename, '_', ' ')),
            r.module,
            r.submodule,
            'delete',
            'Delete ' || r.tablename || ' records'
        ) ON CONFLICT (perm_key) DO NOTHING;
        
        -- Generate EXPORT permission
        INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
        VALUES (
            r.tablename || '.export',
            'Export ' || initcap(replace(r.tablename, '_', ' ')),
            r.module,
            r.submodule,
            'export',
            'Export ' || r.tablename || ' data'
        ) ON CONFLICT (perm_key) DO NOTHING;
        
        v_count := v_count + 5;
    END LOOP;
    
    -- Generate SPECIAL permissions for specific modules
    -- Sales Special Permissions
    INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description) VALUES
    ('sales.void', 'Void Sales', 'Sales & POS', 'Sales', 'void', 'Void sales transactions'),
    ('sales.refund', 'Refund Sales', 'Sales & POS', 'Sales', 'refund', 'Process sales refunds'),
    ('sales.discount', 'Apply Discounts', 'Sales & POS', 'Sales', 'discount', 'Apply discounts to sales'),
    ('sales.pos.access', 'POS Access', 'Sales & POS', 'POS', 'access', 'Access POS screen'),
    ('sales.pos.close', 'Close POS', 'Sales & POS', 'POS', 'close', 'Close POS shift'),
    ('sales.reports', 'Sales Reports', 'Sales & POS', 'Reports', 'report', 'View sales reports'),
    ('customers.credit', 'Manage Credit', 'Sales & POS', 'Customers', 'credit', 'Manage customer credit limits')
    ON CONFLICT (perm_key) DO NOTHING;
    
    -- Inventory Special Permissions
    INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description) VALUES
    ('stock.opening', 'Opening Stock', 'Inventory', 'Stock', 'opening', 'Post opening stock'),
    ('stock.adjust', 'Adjust Stock', 'Inventory', 'Stock', 'adjust', 'Manual stock adjustments'),
    ('stock.transfer', 'Transfer Stock', 'Inventory', 'Stock', 'transfer', 'Transfer stock between locations'),
    ('stock.count', 'Count Stock', 'Inventory', 'Stock', 'count', 'Perform stock counts'),
    ('stock.reorder', 'Reorder Stock', 'Inventory', 'Stock', 'reorder', 'Generate reorder reports'),
    ('inventory.reports', 'Inventory Reports', 'Inventory', 'Reports', 'report', 'View inventory reports'),
    ('items.price', 'Manage Prices', 'Inventory', 'Items', 'price', 'Update item prices')
    ON CONFLICT (perm_key) DO NOTHING;
    
    -- Purchases Special Permissions
    INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description) VALUES
    ('purchases.void', 'Void Purchases', 'Purchases', 'Purchases', 'void', 'Void purchase transactions'),
    ('purchases.approve', 'Approve Purchases', 'Purchases', 'Purchases', 'approve', 'Approve purchase orders'),
    ('purchases.receive', 'Receive Items', 'Purchases', 'Purchases', 'receive', 'Receive purchase items'),
    ('purchases.reports', 'Purchase Reports', 'Purchases', 'Reports', 'report', 'View purchase reports'),
    ('suppliers.credit', 'Supplier Credit', 'Purchases', 'Suppliers', 'credit', 'Manage supplier credit')
    ON CONFLICT (perm_key) DO NOTHING;
    
    -- Finance Special Permissions
    INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description) VALUES
    ('accounts.transfer', 'Transfer Funds', 'Finance', 'Accounts', 'transfer', 'Transfer between accounts'),
    ('accounts.reconcile', 'Reconcile Accounts', 'Finance', 'Accounts', 'reconcile', 'Reconcile bank accounts'),
    ('expenses.approve', 'Approve Expenses', 'Finance', 'Expenses', 'approve', 'Approve expense claims'),
    ('finance.reports', 'Financial Reports', 'Finance', 'Reports', 'report', 'Access financial reports'),
    ('finance.balance', 'Balance Sheet', 'Finance', 'Reports', 'report', 'View balance sheet'),
    ('finance.income', 'Income Statement', 'Finance', 'Reports', 'report', 'View income statement'),
    ('finance.cashflow', 'Cash Flow', 'Finance', 'Reports', 'report', 'View cash flow statement'),
    ('ledgers.view', 'View Ledgers', 'Finance', 'Ledgers', 'view', 'View all ledgers')
    ON CONFLICT (perm_key) DO NOTHING;
    
    -- HR Special Permissions
    INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description) VALUES
    ('payroll.process', 'Process Payroll', 'Human Resources', 'Payroll', 'process', 'Process payroll runs'),
    ('payroll.approve', 'Approve Payroll', 'Human Resources', 'Payroll', 'approve', 'Approve payroll'),
    ('payroll.pay', 'Pay Salaries', 'Human Resources', 'Payroll', 'pay', 'Process salary payments'),
    ('employees.hire', 'Hire Employees', 'Human Resources', 'Employees', 'hire', 'Hire new employees'),
    ('employees.terminate', 'Terminate', 'Human Resources', 'Employees', 'terminate', 'Terminate employees'),
    ('loans.approve', 'Approve Loans', 'Human Resources', 'Loans', 'approve', 'Approve employee loans'),
    ('hr.reports', 'HR Reports', 'Human Resources', 'Reports', 'report', 'View HR reports'),
    ('attendance.manage', 'Manage Attendance', 'Human Resources', 'Attendance', 'manage', 'Manage employee attendance')
    ON CONFLICT (perm_key) DO NOTHING;
    
    -- Returns Special Permissions
    INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description) VALUES
    ('returns.approve', 'Approve Returns', 'Returns Management', 'Returns', 'approve', 'Approve return requests'),
    ('returns.refund', 'Process Refunds', 'Returns Management', 'Returns', 'refund', 'Process refunds'),
    ('returns.reports', 'Returns Reports', 'Returns Management', 'Reports', 'report', 'View returns reports')
    ON CONFLICT (perm_key) DO NOTHING;
    
    -- Transfers Special Permissions
    INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description) VALUES
    ('transfers.approve', 'Approve Transfers', 'Transfers', 'Transfers', 'approve', 'Approve stock transfers'),
    ('transfers.receive', 'Receive Transfers', 'Transfers', 'Transfers', 'receive', 'Receive transferred stock'),
    ('transfers.reports', 'Transfer Reports', 'Transfers', 'Reports', 'report', 'View transfer reports')
    ON CONFLICT (perm_key) DO NOTHING;
    
    -- System Special Permissions
    INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description) VALUES
    ('system.users.manage', 'Manage Users', 'System Administration', 'Users', 'manage', 'Create and manage users'),
    ('system.roles.manage', 'Manage Roles', 'System Administration', 'Roles', 'manage', 'Create and manage roles'),
    ('system.permissions.manage', 'Manage Permissions', 'System Administration', 'Permissions', 'manage', 'Assign permissions'),
    ('system.branches.manage', 'Manage Branches', 'System Administration', 'Branches', 'manage', 'Create and manage branches'),
    ('system.company.manage', 'Manage Company', 'System Administration', 'Company', 'manage', 'Update company profile'),
    ('system.audit.view', 'View Audit Logs', 'System Administration', 'Audit', 'view', 'View audit trail'),
    ('system.backup', 'Backup System', 'System Administration', 'System', 'backup', 'Perform system backup'),
    ('system.settings', 'System Settings', 'System Administration', 'System', 'settings', 'Configure system settings'),
    ('dashboard.view', 'View Dashboard', 'System Administration', 'Dashboard', 'view', 'Access main dashboard'),
    ('reports.all', 'All Reports', 'System Administration', 'Reports', 'report', 'Access all reports')
    ON CONFLICT (perm_key) DO NOTHING;
    
    -- Return counts by module
    RETURN QUERY
    SELECT 
        p.module::TEXT,
        COUNT(*)::INT
    FROM ims.permissions p
    GROUP BY p.module
    ORDER BY p.module;
END;
$$;

-- =========================================================
-- 2) ROLE MANAGEMENT PROCEDURES
-- =========================================================

-- Procedure to create default roles with comprehensive permissions
CREATE OR REPLACE FUNCTION ims.sp_create_default_roles()
RETURNS TABLE(role_name TEXT, permissions_assigned INT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_admin_id BIGINT;
    v_manager_id BIGINT;
    v_sales_id BIGINT;
    v_inventory_id BIGINT;
    v_purchases_id BIGINT;
    v_accountant_id BIGINT;
    v_hr_id BIGINT;
    v_viewer_id BIGINT;
    v_count INT;
BEGIN
    -- Create Administrator Role (Full Access)
    INSERT INTO roles (role_code, role_name, description, is_system)
    VALUES ('ADMIN', 'Administrator', 'Full system access with all permissions', true)
    ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
    RETURNING role_id INTO v_admin_id;
    
    -- Create Store Manager Role
    INSERT INTO roles (role_code, role_name, description, is_system)
    VALUES ('STORE_MGR', 'Store Manager', 'Manage store operations, sales, and inventory', true)
    ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
    RETURNING role_id INTO v_manager_id;
    
    -- Create Sales Associate Role
    INSERT INTO roles (role_code, role_name, description, is_system)
    VALUES ('SALES', 'Sales Associate', 'Process sales and manage customers', true)
    ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
    RETURNING role_id INTO v_sales_id;
    
    -- Create Inventory Clerk Role
    INSERT INTO roles (role_code, role_name, description, is_system)
    VALUES ('INVENTORY', 'Inventory Clerk', 'Manage inventory, stock, and warehouses', true)
    ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
    RETURNING role_id INTO v_inventory_id;
    
    -- Create Purchasing Agent Role
    INSERT INTO roles (role_code, role_name, description, is_system)
    VALUES ('PURCHASE', 'Purchasing Agent', 'Manage purchases and suppliers', true)
    ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
    RETURNING role_id INTO v_purchases_id;
    
    -- Create Accountant Role
    INSERT INTO roles (role_code, role_name, description, is_system)
    VALUES ('ACCOUNTANT', 'Accountant', 'Manage finances, accounts, and expenses', true)
    ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
    RETURNING role_id INTO v_accountant_id;
    
    -- Create HR Manager Role
    INSERT INTO roles (role_code, role_name, description, is_system)
    VALUES ('HR', 'HR Manager', 'Manage employees and payroll', true)
    ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
    RETURNING role_id INTO v_hr_id;
    
    -- Create Viewer Role (Read Only)
    INSERT INTO roles (role_code, role_name, description, is_system)
    VALUES ('VIEWER', 'Viewer', 'Read-only access to all modules', true)
    ON CONFLICT (role_code) DO UPDATE SET role_name = EXCLUDED.role_name
    RETURNING role_id INTO v_viewer_id;
    
    -- Assign permissions to Administrator (ALL permissions)
    DELETE FROM ims.role_permissions WHERE role_id = v_admin_id;
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT v_admin_id, perm_id FROM ims.permissions;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    role_name := 'Administrator'; permissions_assigned := v_count; RETURN NEXT;
    
    -- Assign permissions to Store Manager
    DELETE FROM ims.role_permissions WHERE role_id = v_manager_id;
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT v_manager_id, perm_id FROM ims.permissions 
    WHERE module IN ('Sales & POS', 'Inventory', 'Purchases', 'Returns Management', 'Transfers')
       OR perm_key LIKE 'dashboard.%'
       OR perm_key LIKE 'reports.%'
       OR (module = 'Finance' AND perm_key IN ('finance.reports', 'ledgers.view'));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    role_name := 'Store Manager'; permissions_assigned := v_count; RETURN NEXT;
    
    -- Assign permissions to Sales Associate
    DELETE FROM ims.role_permissions WHERE role_id = v_sales_id;
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT v_sales_id, perm_id FROM ims.permissions 
    WHERE module = 'Sales & POS'
       OR perm_key IN ('dashboard.view', 'reports.all');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    role_name := 'Sales Associate'; permissions_assigned := v_count; RETURN NEXT;
    
    -- Assign permissions to Inventory Clerk
    DELETE FROM ims.role_permissions WHERE role_id = v_inventory_id;
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT v_inventory_id, perm_id FROM ims.permissions 
    WHERE module = 'Inventory' 
       OR perm_key LIKE 'warehouse%.%'
       OR perm_key IN ('items.view', 'items.create', 'items.update', 'categories.view', 'units.view', 'taxes.view')
       OR perm_key IN ('stock.opening', 'stock.adjust', 'stock.transfer', 'stock.count', 'inventory.reports')
       OR perm_key = 'dashboard.view';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    role_name := 'Inventory Clerk'; permissions_assigned := v_count; RETURN NEXT;
    
    -- Assign permissions to Purchasing Agent
    DELETE FROM ims.role_permissions WHERE role_id = v_purchases_id;
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT v_purchases_id, perm_id FROM ims.permissions 
    WHERE module = 'Purchases'
       OR perm_key LIKE 'suppliers.%'
       OR perm_key IN ('items.view', 'purchases.reports')
       OR perm_key = 'dashboard.view';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    role_name := 'Purchasing Agent'; permissions_assigned := v_count; RETURN NEXT;
    
    -- Assign permissions to Accountant
    DELETE FROM ims.role_permissions WHERE role_id = v_accountant_id;
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT v_accountant_id, perm_id FROM ims.permissions 
    WHERE module = 'Finance'
       OR perm_key IN ('dashboard.view', 'reports.all');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    role_name := 'Accountant'; permissions_assigned := v_count; RETURN NEXT;
    
    -- Assign permissions to HR Manager
    DELETE FROM ims.role_permissions WHERE role_id = v_hr_id;
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT v_hr_id, perm_id FROM ims.permissions 
    WHERE module = 'Human Resources'
       OR perm_key LIKE 'payroll%'
       OR perm_key LIKE 'employee%'
       OR perm_key LIKE 'loans%'
       OR perm_key IN ('hr.reports', 'dashboard.view', 'reports.all');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    role_name := 'HR Manager'; permissions_assigned := v_count; RETURN NEXT;
    
    -- Assign permissions to Viewer (Read Only)
    DELETE FROM ims.role_permissions WHERE role_id = v_viewer_id;
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT v_viewer_id, perm_id FROM ims.permissions 
    WHERE action_type = 'view' 
       OR perm_key LIKE 'reports.%'
       OR perm_key = 'dashboard.view';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    role_name := 'Viewer'; permissions_assigned := v_count; RETURN NEXT;
END;
$$;

-- =========================================================
-- 3) DYNAMIC SIDEBAR MENU GENERATION PROCEDURE
-- =========================================================

-- Function to get sidebar menu based on user permissions
CREATE OR REPLACE FUNCTION ims.fn_get_user_menu(p_user_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_menu JSONB;
    v_role_id BIGINT;
BEGIN
    -- Get user's role
    SELECT role_id INTO v_role_id FROM ims.users WHERE user_id = p_user_id;
    
    -- Build menu structure based on permissions
    WITH user_perms AS (
        SELECT DISTINCT p.module, p.sub_module, p.perm_key, p.action_type
        FROM ims.permissions p
        LEFT JOIN ims.role_permissions rp ON rp.perm_id = p.perm_id AND rp.role_id = v_role_id
        LEFT JOIN ims.user_permissions up ON up.perm_id = p.perm_id AND up.user_id = p_user_id
        LEFT JOIN ims.user_permission_overrides upo ON upo.perm_id = p.perm_id AND upo.user_id = p_user_id
        WHERE (rp.perm_id IS NOT NULL OR up.perm_id IS NOT NULL)
          AND (upo.effect IS NULL OR upo.effect = 'allow')
    ),
    menu_modules AS (
        SELECT DISTINCT 
            module,
            CASE module
                WHEN 'Sales & POS' THEN 1
                WHEN 'Purchases' THEN 2
                WHEN 'Inventory' THEN 3
                WHEN 'Finance' THEN 4
                WHEN 'Human Resources' THEN 5
                WHEN 'Returns Management' THEN 6
                WHEN 'Transfers' THEN 7
                WHEN 'System Administration' THEN 8
                ELSE 9
            END as module_order,
            jsonb_agg(DISTINCT jsonb_build_object(
                'name', sub_module,
                'icon', CASE sub_module
                    WHEN 'Sales' THEN 'shopping-cart'
                    WHEN 'POS' THEN 'cash-register'
                    WHEN 'Customers' THEN 'users'
                    WHEN 'Purchases' THEN 'truck'
                    WHEN 'Suppliers' THEN 'building'
                    WHEN 'Products' THEN 'package'
                    WHEN 'Categories' THEN 'folder'
                    WHEN 'Warehouses' THEN 'warehouse'
                    WHEN 'Stock' THEN 'boxes'
                    WHEN 'Accounts' THEN 'wallet'
                    WHEN 'Expenses' THEN 'receipt'
                    WHEN 'Ledgers' THEN 'book'
                    WHEN 'Employees' THEN 'user-tie'
                    WHEN 'Payroll' THEN 'money-bill'
                    WHEN 'Loans' THEN 'hand-holding-usd'
                    WHEN 'Returns' THEN 'undo'
                    WHEN 'Transfers' THEN 'exchange-alt'
                    WHEN 'Users' THEN 'user-cog'
                    WHEN 'Roles' THEN 'user-tag'
                    WHEN 'Permissions' THEN 'key'
                    WHEN 'Branches' THEN 'store'
                    WHEN 'Audit' THEN 'history'
                    WHEN 'Reports' THEN 'chart-bar'
                    WHEN 'Dashboard' THEN 'tachometer-alt'
                    ELSE 'circle'
                END,
                'items', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'name', 
                            CASE action_type
                                WHEN 'view' THEN 'View ' || sub_module
                                WHEN 'create' THEN 'Add New'
                                WHEN 'update' THEN 'Edit'
                                WHEN 'delete' THEN 'Delete'
                                WHEN 'export' THEN 'Export'
                                ELSE initcap(action_type || ' ' || sub_module)
                            END,
                            'path', '/' || lower(replace(module, ' ', '-')) || '/' || lower(replace(sub_module, ' ', '-')) || '/' || action_type,
                            'permission', perm_key
                        )
                        ORDER BY 
                            CASE action_type
                                WHEN 'view' THEN 1
                                WHEN 'create' THEN 2
                                WHEN 'update' THEN 3
                                WHEN 'export' THEN 4
                                WHEN 'delete' THEN 5
                                ELSE 6
                            END
                    )
                    FROM user_perms up2
                    WHERE up2.module = up.module 
                      AND up2.sub_module = up.sub_module
                )
            )) as submodules
        FROM user_perms up
        GROUP BY module
    )
    SELECT jsonb_build_object(
        'user_id', p_user_id,
        'menu', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', module,
                    'icon', CASE module
                        WHEN 'Sales & POS' THEN 'store'
                        WHEN 'Purchases' THEN 'shopping-bag'
                        WHEN 'Inventory' THEN 'boxes'
                        WHEN 'Finance' THEN 'chart-line'
                        WHEN 'Human Resources' THEN 'users-cog'
                        WHEN 'Returns Management' THEN 'undo-alt'
                        WHEN 'Transfers' THEN 'random'
                        WHEN 'System Administration' THEN 'cogs'
                        ELSE 'folder'
                    END,
                    'order', module_order,
                    'submodules', submodules
                )
                ORDER BY module_order
            )
            FROM menu_modules
        )
    ) INTO v_menu;
    
    RETURN COALESCE(v_menu, '{"menu": []}'::jsonb);
END;
$$;

-- =========================================================
-- 4) USER PERMISSION CHECKING FUNCTIONS
-- =========================================================

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION ims.fn_has_permission(
    p_user_id BIGINT,
    p_perm_key VARCHAR(100)
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_id BIGINT;
    v_perm_id INT;
    v_override VARCHAR(10);
    v_has_perm BOOLEAN := FALSE;
BEGIN
    -- Get permission ID
    SELECT perm_id INTO v_perm_id FROM ims.permissions WHERE perm_key = p_perm_key;
    IF v_perm_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check for override first
    SELECT effect INTO v_override
    FROM ims.user_permission_overrides
    WHERE user_id = p_user_id AND perm_id = v_perm_id
      AND (expires_at IS NULL OR expires_at > NOW());
    
    IF v_override = 'deny' THEN
        RETURN FALSE;
    ELSIF v_override = 'allow' THEN
        RETURN TRUE;
    END IF;
    
    -- Check direct user permissions
    SELECT EXISTS(
        SELECT 1 FROM ims.user_permissions 
        WHERE user_id = p_user_id AND perm_id = v_perm_id
    ) INTO v_has_perm;
    
    IF v_has_perm THEN
        RETURN TRUE;
    END IF;
    
    -- Check role permissions
    SELECT role_id INTO v_role_id FROM ims.users WHERE user_id = p_user_id;
    
    IF v_role_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM ims.role_permissions 
            WHERE role_id = v_role_id AND perm_id = v_perm_id
        ) INTO v_has_perm;
    END IF;
    
    RETURN v_has_perm;
END;
$$;

-- Function to get all user permissions with details
CREATE OR REPLACE FUNCTION ims.fn_get_user_permissions(p_user_id BIGINT)
RETURNS TABLE(
    module TEXT,
    sub_module TEXT,
    perm_key VARCHAR,
    perm_name VARCHAR,
    action_type VARCHAR,
    has_access BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.module::TEXT,
        p.sub_module::TEXT,
        p.perm_key,
        p.perm_name,
        p.action_type,
        ims.fn_has_permission(p_user_id, p.perm_key)
    FROM ims.permissions p
    ORDER BY p.module, p.sub_module, p.action_type;
END;
$$;

-- =========================================================
-- 5) PERMISSION ASSIGNMENT PROCEDURES
-- =========================================================

-- Procedure to assign permissions to role
CREATE OR REPLACE FUNCTION ims.sp_assign_role_permissions(
    p_role_code VARCHAR(30),
    p_perm_keys TEXT[]
) RETURNS TABLE(permission_code TEXT, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_id BIGINT;
    v_perm_id INT;
    v_perm_key TEXT;
BEGIN
    -- Get role ID
    SELECT role_id INTO v_role_id FROM ims.roles WHERE role_code = p_role_code;
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Role % not found', p_role_code;
    END IF;
    
    -- Clear existing permissions for this role
    DELETE FROM ims.role_permissions WHERE role_id = v_role_id;
    
    -- Assign new permissions
    FOREACH v_perm_key IN ARRAY p_perm_keys
    LOOP
        SELECT perm_id INTO v_perm_id FROM ims.permissions WHERE perm_key = v_perm_key;
        
        IF v_perm_id IS NOT NULL THEN
            INSERT INTO ims.role_permissions (role_id, perm_id)
            VALUES (v_role_id, v_perm_id);
            permission_code := v_perm_key;
            status := 'Assigned';
            RETURN NEXT;
        ELSE
            permission_code := v_perm_key;
            status := 'Permission not found';
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

-- Procedure to assign permissions to user
CREATE OR REPLACE FUNCTION ims.sp_assign_user_permissions(
    p_user_id BIGINT,
    p_perm_keys TEXT[],
    p_granted_by BIGINT DEFAULT NULL
) RETURNS TABLE(permission_code TEXT, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_perm_id INT;
    v_perm_key TEXT;
BEGIN
    -- Clear existing direct permissions for this user
    DELETE FROM ims.user_permissions WHERE user_id = p_user_id;
    
    -- Assign new permissions
    FOREACH v_perm_key IN ARRAY p_perm_keys
    LOOP
        SELECT perm_id INTO v_perm_id FROM ims.permissions WHERE perm_key = v_perm_key;
        
        IF v_perm_id IS NOT NULL THEN
            INSERT INTO ims.user_permissions (user_id, perm_id, granted_by)
            VALUES (p_user_id, v_perm_id, p_granted_by);
            permission_code := v_perm_key;
            status := 'Assigned';
            RETURN NEXT;
        ELSE
            permission_code := v_perm_key;
            status := 'Permission not found';
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

-- =========================================================
-- 6) PERMISSION REPORTING PROCEDURES
-- =========================================================

-- Procedure to get permission summary by module
CREATE OR REPLACE FUNCTION ims.sp_permission_summary()
RETURNS TABLE(
    module TEXT,
    total_permissions BIGINT,
    view_permissions BIGINT,
    create_permissions BIGINT,
    update_permissions BIGINT,
    delete_permissions BIGINT,
    export_permissions BIGINT,
    special_permissions BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.module::TEXT,
        COUNT(*)::BIGINT as total,
        COUNT(CASE WHEN p.action_type = 'view' THEN 1 END)::BIGINT as view,
        COUNT(CASE WHEN p.action_type = 'create' THEN 1 END)::BIGINT as create,
        COUNT(CASE WHEN p.action_type = 'update' THEN 1 END)::BIGINT as update,
        COUNT(CASE WHEN p.action_type = 'delete' THEN 1 END)::BIGINT as delete,
        COUNT(CASE WHEN p.action_type = 'export' THEN 1 END)::BIGINT as export,
        COUNT(CASE WHEN p.action_type NOT IN ('view', 'create', 'update', 'delete', 'export') THEN 1 END)::BIGINT as special
    FROM ims.permissions p
    GROUP BY p.module
    ORDER BY p.module;
END;
$$;

-- Procedure to get role permissions
CREATE OR REPLACE FUNCTION ims.sp_role_permissions(p_role_code VARCHAR DEFAULT NULL)
RETURNS TABLE(
    role_code VARCHAR,
    role_name VARCHAR,
    module TEXT,
    sub_module TEXT,
    perm_key VARCHAR,
    perm_name VARCHAR,
    action_type VARCHAR
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.role_code,
        r.role_name,
        p.module::TEXT,
        p.sub_module::TEXT,
        p.perm_key,
        p.perm_name,
        p.action_type
    FROM ims.roles r
    JOIN ims.role_permissions rp ON rp.role_id = r.role_id
    JOIN ims.permissions p ON p.perm_id = rp.perm_id
    WHERE (p_role_code IS NULL OR r.role_code = p_role_code)
    ORDER BY r.role_code, p.module, p.sub_module, p.action_type;
END;
$$;

-- =========================================================
-- 7) SAMPLE USER SETUP PROCEDURE
-- =========================================================

-- Procedure to create sample users with different roles
CREATE OR REPLACE FUNCTION ims.sp_create_sample_users()
RETURNS TABLE(out_username TEXT, out_role TEXT, out_status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_admin_id BIGINT;
    v_manager_id BIGINT;
    v_sales_id BIGINT;
    v_inventory_id BIGINT;
    v_accountant_id BIGINT;
    v_hr_id BIGINT;
    v_branch_id BIGINT;
    v_user_id BIGINT;
    v_pwd VARCHAR := '$2a$10$l4GiG4IwG3TwvyaOfEjbUujvPmDB/ulFpWhpOP9CFCrZP9608gqWC'; -- Hash for Admin@123
BEGIN
    -- Get default branch
    SELECT branch_id INTO v_branch_id FROM ims.branches WHERE is_active = true ORDER BY branch_id LIMIT 1;
    IF v_branch_id IS NULL THEN
        RAISE NOTICE 'No active branch found during sample data creation';
        RETURN;
    END IF;

    -- Get role IDs
    SELECT role_id INTO v_admin_id FROM ims.roles WHERE role_code = 'ADMIN';
    SELECT role_id INTO v_manager_id FROM ims.roles WHERE role_code = 'STORE_MGR';
    SELECT role_id INTO v_sales_id FROM ims.roles WHERE role_code = 'SALES';
    SELECT role_id INTO v_inventory_id FROM ims.roles WHERE role_code = 'INVENTORY';
    SELECT role_id INTO v_accountant_id FROM ims.roles WHERE role_code = 'ACCOUNTANT';
    SELECT role_id INTO v_hr_id FROM ims.roles WHERE role_code = 'HR';
    
    -- Function to create user & employee & branch link
    -- Create Admin
    INSERT INTO ims.users (role_id, name, full_name, username, password_hash, email, is_active)
    VALUES (v_admin_id, 'Admin', 'System Administrator', 'admin', v_pwd, 'admin@example.com', true)
    ON CONFLICT (username) DO UPDATE SET password_hash = v_pwd, role_id = EXCLUDED.role_id
    RETURNING user_id, username INTO v_user_id, out_username;
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO ims.user_branches (user_id, branch_id, is_default) VALUES (v_user_id, v_branch_id, true) ON CONFLICT DO NOTHING;
        INSERT INTO ims.employees (branch_id, user_id, full_name, phone, salary_type, salary_amount, status) VALUES (v_branch_id, v_user_id, 'System Administrator', '111222333', 'monthly', 0, 'active') ON CONFLICT (user_id) DO NOTHING;
        out_role := 'Administrator'; out_status := 'Created/Updated'; RETURN NEXT;
    END IF;
    
    -- Create Cabdi (Store Manager)
    INSERT INTO ims.users (role_id, name, full_name, username, password_hash, email, is_active)
    VALUES (v_manager_id, 'Cabdi', 'Cabdi Maxamed', 'cabdi', v_pwd, 'cabdi@example.com', true)
    ON CONFLICT (username) DO UPDATE SET password_hash = v_pwd, role_id = EXCLUDED.role_id
    RETURNING user_id, username INTO v_user_id, out_username;
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO ims.user_branches (user_id, branch_id, is_default) VALUES (v_user_id, v_branch_id, true) ON CONFLICT DO NOTHING;
        INSERT INTO ims.employees (branch_id, user_id, full_name, phone, salary_type, salary_amount, status) VALUES (v_branch_id, v_user_id, 'Cabdi Maxamed', '222333444', 'monthly', 0, 'active') ON CONFLICT (user_id) DO NOTHING;
        out_role := 'Store Manager'; out_status := 'Created/Updated'; RETURN NEXT;
    END IF;
    
    -- Create Deeqa (Sales)
    INSERT INTO ims.users (role_id, name, full_name, username, password_hash, email, is_active)
    VALUES (v_sales_id, 'Deeqa', 'Deeqa Warsame', 'deeqa', v_pwd, 'deeqa@example.com', true)
    ON CONFLICT (username) DO UPDATE SET password_hash = v_pwd, role_id = EXCLUDED.role_id
    RETURNING user_id, username INTO v_user_id, out_username;
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO ims.user_branches (user_id, branch_id, is_default) VALUES (v_user_id, v_branch_id, true) ON CONFLICT DO NOTHING;
        INSERT INTO ims.employees (branch_id, user_id, full_name, phone, salary_type, salary_amount, status) VALUES (v_branch_id, v_user_id, 'Deeqa Warsame', '333444555', 'monthly', 0, 'active') ON CONFLICT (user_id) DO NOTHING;
        out_role := 'Sales Associate'; out_status := 'Created/Updated'; RETURN NEXT;
    END IF;
    
    -- Create Faarax (Inventory)
    INSERT INTO ims.users (role_id, name, full_name, username, password_hash, email, is_active)
    VALUES (v_inventory_id, 'Faarax', 'Faarax Siciid', 'faarax', v_pwd, 'faarax@example.com', true)
    ON CONFLICT (username) DO UPDATE SET password_hash = v_pwd, role_id = EXCLUDED.role_id
    RETURNING user_id, username INTO v_user_id, out_username;
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO ims.user_branches (user_id, branch_id, is_default) VALUES (v_user_id, v_branch_id, true) ON CONFLICT DO NOTHING;
        INSERT INTO ims.employees (branch_id, user_id, full_name, phone, salary_type, salary_amount, status) VALUES (v_branch_id, v_user_id, 'Faarax Siciid', '444555666', 'monthly', 0, 'active') ON CONFLICT (user_id) DO NOTHING;
        out_role := 'Inventory Clerk'; out_status := 'Created/Updated'; RETURN NEXT;
    END IF;

    -- Create Xasan (Accountant)
    INSERT INTO ims.users (role_id, name, full_name, username, password_hash, email, is_active)
    VALUES (v_accountant_id, 'Xasan', 'Xasan Jaamac', 'xasan', v_pwd, 'xasan@example.com', true)
    ON CONFLICT (username) DO UPDATE SET password_hash = v_pwd, role_id = EXCLUDED.role_id
    RETURNING user_id, username INTO v_user_id, out_username;
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO ims.user_branches (user_id, branch_id, is_default) VALUES (v_user_id, v_branch_id, true) ON CONFLICT DO NOTHING;
        INSERT INTO ims.employees (branch_id, user_id, full_name, phone, salary_type, salary_amount, status) VALUES (v_branch_id, v_user_id, 'Xasan Jaamac', '555666777', 'monthly', 0, 'active') ON CONFLICT (user_id) DO NOTHING;
        out_role := 'Accountant'; out_status := 'Created/Updated'; RETURN NEXT;
    END IF;

    -- Create Sahra (HR)
    INSERT INTO ims.users (role_id, name, full_name, username, password_hash, email, is_active)
    VALUES (v_hr_id, 'Sahra', 'Sahra Ismaaciil', 'sahra', v_pwd, 'sahra@example.com', true)
    ON CONFLICT (username) DO UPDATE SET password_hash = v_pwd, role_id = EXCLUDED.role_id
    RETURNING user_id, username INTO v_user_id, out_username;
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO ims.user_branches (user_id, branch_id, is_default) VALUES (v_user_id, v_branch_id, true) ON CONFLICT DO NOTHING;
        INSERT INTO ims.employees (branch_id, user_id, full_name, phone, salary_type, salary_amount, status) VALUES (v_branch_id, v_user_id, 'Sahra Ismaaciil', '666777888', 'monthly', 0, 'active') ON CONFLICT (user_id) DO NOTHING;
        out_role := 'HR Manager'; out_status := 'Created/Updated'; RETURN NEXT;
    END IF;
END;
$$;

-- =========================================================
-- 8) EXECUTE SETUP - RUN THIS TO CREATE EVERYTHING
-- =========================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Starting Permission System Setup...';
    RAISE NOTICE '========================================';
    
    -- Ensure at least one company exists
    IF NOT EXISTS (SELECT 1 FROM ims.company) THEN
        INSERT INTO ims.company (company_name) VALUES ('My Inventory ERP');
    END IF;

    -- Ensure at least one branch exists
    IF NOT EXISTS (SELECT 1 FROM ims.branches) THEN
        INSERT INTO ims.branches (branch_name, is_active) VALUES ('Main Branch', true);
    END IF;
END $$;

DO $store_seed$
DECLARE
    v_branch_id BIGINT;
BEGIN
    FOR v_branch_id IN
        SELECT branch_id
          FROM ims.branches
         WHERE is_active = TRUE
    LOOP
        INSERT INTO ims.categories (branch_id, cat_name, description)
        VALUES
            (v_branch_id, 'General', 'Default category'),
            (v_branch_id, 'Electronics', 'Electronics and gadgets'),
            (v_branch_id, 'Grocery', 'Grocery items')
        ON CONFLICT (branch_id, cat_name) DO NOTHING;

        INSERT INTO ims.units (branch_id, unit_name, symbol, is_active)
        VALUES
            (v_branch_id, 'Piece', 'pc', TRUE),
            (v_branch_id, 'Box', 'box', TRUE),
            (v_branch_id, 'Kilogram', 'kg', TRUE),
            (v_branch_id, 'Liter', 'ltr', TRUE)
        ON CONFLICT (branch_id, unit_name) DO NOTHING;

        INSERT INTO ims.taxes (branch_id, tax_name, rate_percent, is_inclusive, is_active)
        VALUES
            (v_branch_id, 'No Tax', 0, FALSE, TRUE),
            (v_branch_id, 'VAT 5%', 5, FALSE, TRUE),
            (v_branch_id, 'VAT 10%', 10, FALSE, TRUE)
        ON CONFLICT (branch_id, tax_name) DO NOTHING;

        INSERT INTO ims.stores (branch_id, store_name, store_code, is_active)
        VALUES
            (v_branch_id, 'Main Store', 'MAIN', TRUE)
        ON CONFLICT (branch_id, store_name) DO NOTHING;
    END LOOP;
END $store_seed$;

-- Generate all permissions
SELECT 'Generating all permissions...' as status;
SELECT * FROM ims.sp_generate_all_permissions();

-- Create default roles
SELECT 'Creating default roles...' as status;
SELECT * FROM ims.sp_create_default_roles();

-- Show permission summary
SELECT 'Permission Summary by Module:' as report;
SELECT * FROM ims.sp_permission_summary();

-- Show role permissions count
SELECT 'Roles Created with Permissions:' as report;
SELECT r.role_name, COUNT(rp.perm_id) as permissions_count
FROM ims.roles r
LEFT JOIN ims.role_permissions rp ON rp.role_id = r.role_id
GROUP BY r.role_name
ORDER BY r.role_name;

-- Create sample users (optional - comment out if not needed)
SELECT 'Creating sample users...' as status;
SELECT * FROM ims.sp_create_sample_users();

-- Test sidebar menu for admin (will work after users are created)
DO $$
DECLARE
    v_user_id BIGINT;
    v_menu JSONB;
BEGIN
    SELECT user_id INTO v_user_id FROM ims.users WHERE username = 'admin' LIMIT 1;
    IF v_user_id IS NOT NULL THEN
        v_menu := ims.fn_get_user_menu(v_user_id);
        RAISE NOTICE 'Admin Menu Structure: %', v_menu;
    END IF;
END $$;

SELECT '========================================' as status;
SELECT 'PERMISSION SYSTEM SETUP COMPLETE!' as status;
SELECT '========================================' as status;
SELECT 'Usage Examples:' as info;
SELECT '1. Check if user has permission: SELECT ims.fn_has_permission(1, ''sales.view'');' as example;
SELECT '2. Get user menu: SELECT ims.fn_get_user_menu(1);' as example;
SELECT '3. Get user permissions: SELECT * FROM ims.fn_get_user_permissions(1);' as example;
SELECT '4. Get role permissions: SELECT * FROM ims.sp_role_permissions(''SALES'');' as example;
SELECT '========================================' as status;
