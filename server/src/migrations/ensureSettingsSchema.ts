import { query } from '../db/query';

/**
 * Lightweight bootstrap to ensure settings-related tables/columns exist.
 * Runs on server start; safe to run repeatedly.
 */
export async function ensureSettingsSchema() {
  // Ensure schema exists
  await query(`CREATE SCHEMA IF NOT EXISTS ims`);

  // Company info singleton table
  await query(`
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
  `);
  await query(`
    INSERT INTO ims.company_info (company_id, company_name)
    SELECT 1, 'My Company'
    WHERE NOT EXISTS (SELECT 1 FROM ims.company_info WHERE company_id = 1);
  `);

  // Branches table: add missing columns if needed
  await query(`
    ALTER TABLE ims.branches
      ADD COLUMN IF NOT EXISTS location VARCHAR(255),
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `);
  await query(`
    CREATE OR REPLACE FUNCTION ims.touch_updated_at() RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await query(`
    DROP TRIGGER IF EXISTS trg_branches_touch ON ims.branches;
    CREATE TRIGGER trg_branches_touch
    BEFORE UPDATE ON ims.branches
    FOR EACH ROW EXECUTE FUNCTION ims.touch_updated_at();
  `);

  // Audit logs table
  await query(`
    CREATE TABLE IF NOT EXISTS ims.audit_logs (
      audit_id SERIAL PRIMARY KEY,
      user_id INTEGER,
      action VARCHAR(150) NOT NULL,
      entity VARCHAR(150),
      entity_id INTEGER,
      old_value JSONB,
      new_value JSONB,
      meta JSONB,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // If audit_logs already exists without audit_id, add it and set PK
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'ims' AND table_name = 'audit_logs' AND column_name = 'audit_id'
      ) THEN
        ALTER TABLE ims.audit_logs ADD COLUMN audit_id SERIAL;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        WHERE tc.table_schema = 'ims'
          AND tc.table_name = 'audit_logs'
          AND tc.constraint_type = 'PRIMARY KEY'
      ) THEN
        ALTER TABLE ims.audit_logs ADD PRIMARY KEY (audit_id);
      END IF;
    END$$;
  `);

  // Backfill/align legacy audit_logs structure (action_type/table_name/record_id/new_values)
  await query(`
    ALTER TABLE ims.audit_logs
      ADD COLUMN IF NOT EXISTS action VARCHAR(150),
      ADD COLUMN IF NOT EXISTS entity VARCHAR(150),
      ADD COLUMN IF NOT EXISTS entity_id INTEGER,
      ADD COLUMN IF NOT EXISTS old_value JSONB,
      ADD COLUMN IF NOT EXISTS new_value JSONB,
      ADD COLUMN IF NOT EXISTS meta JSONB,
      ADD COLUMN IF NOT EXISTS ip_address TEXT,
      ADD COLUMN IF NOT EXISTS user_agent TEXT;
  `);

  // Fill new columns from legacy ones only if legacy columns exist
  await query(`
    DO $$
    DECLARE
      has_action_type BOOLEAN;
      has_table_name BOOLEAN;
      has_record_id  BOOLEAN;
      has_new_values BOOLEAN;
    BEGIN
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='audit_logs' AND column_name='action_type') INTO has_action_type;
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='audit_logs' AND column_name='table_name') INTO has_table_name;
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='audit_logs' AND column_name='record_id') INTO has_record_id;
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ims' AND table_name='audit_logs' AND column_name='new_values') INTO has_new_values;

      IF has_action_type OR has_table_name OR has_record_id OR has_new_values THEN
        EXECUTE '
          UPDATE ims.audit_logs
             SET action = COALESCE(action, ' || CASE WHEN has_action_type THEN 'action_type' ELSE 'NULL' END || '),
                 entity = COALESCE(entity, ' || CASE WHEN has_table_name THEN 'table_name' ELSE 'NULL' END || '),
                 entity_id = COALESCE(entity_id, ' || CASE WHEN has_record_id THEN 'record_id' ELSE 'NULL' END || '),
                 meta = COALESCE(meta, ' || CASE WHEN has_new_values THEN 'new_values' ELSE 'NULL' END || ')
           WHERE (' || CASE WHEN has_action_type THEN 'action IS NULL AND action_type IS NOT NULL' ELSE 'FALSE' END || ')
              OR (' || CASE WHEN has_table_name THEN 'entity IS NULL AND table_name IS NOT NULL' ELSE 'FALSE' END || ')
              OR (' || CASE WHEN has_record_id THEN 'entity_id IS NULL AND record_id IS NOT NULL' ELSE 'FALSE' END || ')
              OR (' || CASE WHEN has_new_values THEN 'meta IS NULL AND new_values IS NOT NULL' ELSE 'FALSE' END || ');
        ';
      END IF;
    END$$;
  `);

  // Customers: add remaining_balance for opening/balance input (fixes "column c.remaining_balance does not exist")
  await query(`
    ALTER TABLE ims.customers
      ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

  // Stores table (branch-specific; requires ims.branches to exist)
  await query(`
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
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stores_branch ON ims.stores(branch_id);`);

  // Store items: items (products) in each store
  await query(`
    CREATE TABLE IF NOT EXISTS ims.store_items (
      store_item_id BIGSERIAL PRIMARY KEY,
      store_id BIGINT NOT NULL REFERENCES ims.stores(store_id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES ims.products(product_id) ON DELETE CASCADE,
      quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT chk_store_item_qty CHECK (quantity >= 0),
      CONSTRAINT uq_store_product UNIQUE (store_id, product_id)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_store_items_store ON ims.store_items(store_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_store_items_product ON ims.store_items(product_id);`);

  await query(`ALTER TABLE ims.products ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES ims.stores(store_id);`);
}
