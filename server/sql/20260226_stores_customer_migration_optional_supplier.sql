/* =========================================================
STORES, CUSTOMER MIGRATION, OPTIONAL SUPPLIER FOR PURCHASES
=========================================================

Changes:
1. stores table - physical locations where items can be created/managed
2. customers - external_id, source_system, migrated_at for importing from other systems
3. purchases - supplier_id becomes optional (walk-in purchases)
4. products - optional store_id for store-level assignment
5. Default "Walking Supplier" for purchases without supplier

Created: 2026-02-26
========================================================= */
BEGIN;

SET search_path TO ims, public;

-- =========================================================
-- 1) STORES TABLE
-- =========================================================
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
COMMENT ON TABLE ims.stores IS 'Physical store locations within branches where items can be managed';

-- Add store_id to products (optional - products can belong to a store)
ALTER TABLE ims.products
    ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES ims.stores(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store ON ims.products(store_id) WHERE store_id IS NOT NULL;

-- =========================================================
-- 2) CUSTOMER MIGRATION FIELDS
-- =========================================================
ALTER TABLE ims.customers
    ADD COLUMN IF NOT EXISTS external_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS source_system VARCHAR(80),
    ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_external_per_branch
    ON ims.customers(branch_id, external_id, source_system)
    WHERE external_id IS NOT NULL AND source_system IS NOT NULL;
COMMENT ON COLUMN ims.customers.external_id IS 'ID from source system when migrating from another ERP';
COMMENT ON COLUMN ims.customers.source_system IS 'Name of source system (e.g. legacy_erp, excel_import)';

-- =========================================================
-- 3) MAKE SUPPLIER OPTIONAL IN PURCHASES
-- =========================================================
DO $$
BEGIN
    ALTER TABLE ims.purchases ALTER COLUMN supplier_id DROP NOT NULL;
EXCEPTION
    WHEN OTHERS THEN NULL;  -- ignore if already nullable
END $$;

-- =========================================================
-- 4) DEFAULT WALKING SUPPLIER HELPER
-- Ensures each branch has a "Walking Supplier" for walk-in purchases
-- =========================================================
CREATE OR REPLACE FUNCTION ims.fn_get_or_create_walking_supplier(p_branch_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_supplier_id BIGINT;
BEGIN
    SELECT supplier_id INTO v_supplier_id
    FROM ims.suppliers
    WHERE branch_id = p_branch_id
      AND LOWER(COALESCE(supplier_name, '')) = 'walking supplier'
    LIMIT 1;

    IF v_supplier_id IS NOT NULL THEN
        RETURN v_supplier_id;
    END IF;

    INSERT INTO ims.suppliers (branch_id, supplier_name, company_name, is_active)
    VALUES (p_branch_id, 'Walking Supplier', 'Walk-in / No Supplier', TRUE)
    RETURNING supplier_id INTO v_supplier_id;

    RETURN v_supplier_id;
END;
$$;
COMMENT ON FUNCTION ims.fn_get_or_create_walking_supplier IS 'Returns supplier_id for Walking Supplier; creates one per branch if needed';

-- =========================================================
-- 5) TRIGGER FOR PURCHASES AUTO-BRANCH
-- =========================================================
CREATE TRIGGER trg_auto_branch_stores BEFORE INSERT OR UPDATE ON ims.stores
    FOR EACH ROW EXECUTE FUNCTION ims.trg_auto_branch_id();

COMMIT;
