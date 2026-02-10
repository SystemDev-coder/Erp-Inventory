-- Add receipts permissions for new endpoints
SET search_path TO ims, public;

-- Ensure helper exists
DO $$
BEGIN
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

SELECT ims.upsert_permission('receipts.view', 'View Receipts', 'Receipts', 'View receipts list');
SELECT ims.upsert_permission('receipts.create', 'Create Receipts', 'Receipts', 'Record customer receipts');
SELECT ims.upsert_permission('receipts.update', 'Update Receipts', 'Receipts', 'Edit receipts');
SELECT ims.upsert_permission('receipts.delete', 'Delete Receipts', 'Receipts', 'Remove receipts');

-- Grant to Admin/Manager
DO $$
DECLARE
  admin_id INT;
  manager_id INT;
BEGIN
  SELECT role_id INTO admin_id FROM ims.roles WHERE role_name='Admin' LIMIT 1;
  SELECT role_id INTO manager_id FROM ims.roles WHERE role_name='Manager' LIMIT 1;

  IF admin_id IS NOT NULL THEN
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT admin_id, perm_id FROM ims.permissions WHERE perm_key LIKE 'receipts.%'
    ON CONFLICT DO NOTHING;
  END IF;

  IF manager_id IS NOT NULL THEN
    INSERT INTO ims.role_permissions (role_id, perm_id)
    SELECT manager_id, perm_id FROM ims.permissions WHERE perm_key IN ('receipts.view','receipts.create','receipts.update')
    ON CONFLICT DO NOTHING;
  END IF;
END$$;
