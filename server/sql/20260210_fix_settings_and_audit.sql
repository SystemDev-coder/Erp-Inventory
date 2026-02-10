-- Align audit logs structure and add missing settings permissions
-- Date: 2026-02-10

SET search_path TO ims, public;

-- Ensure upsert_permission helper exists (idempotent)
DO $$
BEGIN
  -- make sure permissions table has needed columns
  BEGIN
    ALTER TABLE ims.permissions
      ADD COLUMN IF NOT EXISTS module VARCHAR(50),
      ADD COLUMN IF NOT EXISTS description TEXT;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'permissions table missing; skipping column add';
  END;

  CREATE OR REPLACE FUNCTION ims.upsert_permission(
    p_key VARCHAR(100),
    p_name VARCHAR(150),
    p_module VARCHAR(50),
    p_desc TEXT DEFAULT NULL
  ) RETURNS void AS $func$
  BEGIN
    INSERT INTO ims.permissions (perm_key, perm_name, module, description)
    VALUES (p_key, p_name, p_module, p_desc)
    ON CONFLICT (perm_key) DO UPDATE
    SET perm_name = EXCLUDED.perm_name,
        module = EXCLUDED.module,
        description = EXCLUDED.description;
  END;
  $func$ LANGUAGE plpgsql;
END$$;

-- Add missing audit columns used by API
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS action VARCHAR(150),
  ADD COLUMN IF NOT EXISTS entity VARCHAR(150),
  ADD COLUMN IF NOT EXISTS entity_id INTEGER,
  ADD COLUMN IF NOT EXISTS meta JSONB;

-- Backfill new columns from legacy data when present
DO $$
DECLARE
  has_action_type BOOLEAN;
  has_table_name BOOLEAN;
  has_record_id  BOOLEAN;
  has_new_values BOOLEAN;
BEGIN
  -- Add columns if missing
  ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS action VARCHAR(150),
    ADD COLUMN IF NOT EXISTS entity VARCHAR(150),
    ADD COLUMN IF NOT EXISTS entity_id INTEGER,
    ADD COLUMN IF NOT EXISTS meta JSONB;

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

-- Add missing system permissions required by settings endpoints
SELECT upsert_permission('system.view', 'View System Settings', 'System', 'View company/system settings');
SELECT upsert_permission('system.update', 'Update System Settings', 'System', 'Update company/system settings');

-- Assign new permissions to Admin and Manager roles
DO $$
DECLARE
  admin_id INT;
  manager_id INT;
BEGIN
  SELECT role_id INTO admin_id FROM ims.roles WHERE role_name = 'Admin' LIMIT 1;
  SELECT role_id INTO manager_id FROM ims.roles WHERE role_name = 'Manager' LIMIT 1;

  IF admin_id IS NOT NULL THEN
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT admin_id, perm_id
      FROM ims.permissions
     WHERE perm_key IN ('system.view', 'system.update')
    ON CONFLICT DO NOTHING;
  END IF;

  IF manager_id IS NOT NULL THEN
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT manager_id, perm_id
      FROM ims.permissions
     WHERE perm_key IN ('system.view', 'system.update')
    ON CONFLICT DO NOTHING;
  END IF;
END$$;

-- Ensure company_info singleton row exists
INSERT INTO ims.company_info (company_id, company_name)
SELECT 1, 'My Company'
WHERE NOT EXISTS (SELECT 1 FROM ims.company_info WHERE company_id = 1);
