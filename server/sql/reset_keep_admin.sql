-- Reset almost all ERP data but keep authentication + default branch.
-- Keeps: branches, roles, permissions, users (admin only), user_* mappings.
-- WARNING: destructive. Intended for development environments.

BEGIN;

DO $$
DECLARE
  keep_tables text[] := ARRAY[
    'branches',
    'roles',
    'permissions',
    'users',
    'user_branches',
    'user_permissions',
    'user_permission_overrides',
    'user_locks'
  ];
  truncate_list text;
  admin_id bigint;
BEGIN
  -- Disable triggers (audit, etc.) during reset to avoid FK issues.
  PERFORM set_config('session_replication_role', 'replica', true);

  SELECT string_agg(format('ims.%I', tablename), ', ')
    INTO truncate_list
    FROM pg_tables
   WHERE schemaname = 'ims'
     AND tablename <> ALL(keep_tables);

  IF truncate_list IS NOT NULL AND length(truncate_list) > 0 THEN
    EXECUTE 'TRUNCATE TABLE ' || truncate_list || ' RESTART IDENTITY CASCADE';
  END IF;

  -- Keep only the admin user.
  DELETE FROM ims.users WHERE LOWER(username) <> 'admin';

  -- Ensure admin has full permissions (sidebar + access after reset).
  SELECT user_id INTO admin_id
    FROM ims.users
   WHERE LOWER(username) = 'admin'
   LIMIT 1;

  IF admin_id IS NOT NULL THEN
    INSERT INTO ims.user_permissions (user_id, perm_id, granted_by)
    SELECT admin_id, p.perm_id, admin_id
      FROM ims.permissions p
     WHERE NOT EXISTS (
       SELECT 1
         FROM ims.user_permissions up
        WHERE up.user_id = admin_id
          AND up.perm_id = p.perm_id
     );

    DELETE FROM ims.user_permission_overrides
     WHERE user_id = admin_id
       AND effect = 'deny';
  END IF;

  -- Re-enable triggers.
  PERFORM set_config('session_replication_role', 'origin', true);
END $$;

COMMIT;
