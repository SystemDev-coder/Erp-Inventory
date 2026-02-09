-- Minimal tables to satisfy dashboard queries (idempotent)
-- Creates missing enums and tables referenced by dashboard.service.ts

CREATE SCHEMA IF NOT EXISTS ims;
SET search_path TO ims, public;

-- Enums needed by sales/purchases
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='sale_type_enum' AND n.nspname='ims') THEN
    CREATE TYPE ims.sale_type_enum AS ENUM ('cash','credit');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='sale_status_enum' AND n.nspname='ims') THEN
    CREATE TYPE ims.sale_status_enum AS ENUM ('paid','partial','unpaid','void');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='purchase_status_enum' AND n.nspname='ims') THEN
    CREATE TYPE ims.purchase_status_enum AS ENUM ('received','partial','unpaid','void');
  END IF;
END $$;

-- Products (baseline)
CREATE TABLE IF NOT EXISTS ims.products (
  product_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  reorder_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Branch stock snapshot
CREATE TABLE IF NOT EXISTS ims.branch_stock (
  branch_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL REFERENCES ims.products(product_id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, product_id)
);

-- Sales
CREATE TABLE IF NOT EXISTS ims.sales (
  sale_id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sale_type ims.sale_type_enum NOT NULL DEFAULT 'cash',
  status ims.sale_status_enum NOT NULL DEFAULT 'paid',
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchases
CREATE TABLE IF NOT EXISTS ims.purchases (
  purchase_id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL,
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status ims.purchase_status_enum NOT NULL DEFAULT 'received',
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory movements for 14d chart
CREATE TABLE IF NOT EXISTS ims.inventory_movements (
  move_id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL,
  move_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  qty_in NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_out NUMERIC(14,3) NOT NULL DEFAULT 0
);

-- Stock adjustments and items for recent activity
CREATE TABLE IF NOT EXISTS ims.stock_adjustments (
  adj_id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL,
  adj_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ims.stock_adjustment_items (
  adj_item_id BIGSERIAL PRIMARY KEY,
  adj_id BIGINT NOT NULL REFERENCES ims.stock_adjustments(adj_id) ON DELETE CASCADE,
  qty_change NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0
);
