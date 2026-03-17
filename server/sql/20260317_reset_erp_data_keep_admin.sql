-- Utility: Reset ERP data (destructive) while keeping auth + core setup tables.
-- Intended for development/demo environments.
--
-- Keeps:
--   - company, branches (so the system still boots)
--   - roles, permissions, role_permissions
--   - users (only the usernames you specify)
--   - user_* mappings for the kept users (rebuilt)
--
-- Deletes everything else by TRUNCATE ... CASCADE + RESTART IDENTITY.
--
-- Usage:
--   1) Install function/procedure (run this file once as a DB owner/superuser)
--   2) Run reset:
--        SELECT ims.fn_reset_erp_data(TRUE, ARRAY['admin']);
--      or:
--        CALL ims.sp_reset_erp_data(TRUE, ARRAY['admin']);

BEGIN;

CREATE OR REPLACE FUNCTION ims.fn_reset_erp_data(
  p_confirm boolean,
  p_keep_usernames text[] DEFAULT ARRAY['admin']
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_keep_usernames text[];
  v_truncate_list text;
  v_branch_id bigint;
  v_user_id bigint;
  v_username text;
BEGIN
  IF p_confirm IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'Confirmation required. Call: SELECT ims.fn_reset_erp_data(TRUE, ARRAY[''admin'']);';
  END IF;

  SELECT array_agg(lower(u))
    INTO v_keep_usernames
    FROM unnest(COALESCE(p_keep_usernames, ARRAY['admin'])) AS u;

  IF v_keep_usernames IS NULL OR array_length(v_keep_usernames, 1) IS NULL THEN
    v_keep_usernames := ARRAY['admin'];
  END IF;

  WITH keep_tables AS (
    SELECT unnest(ARRAY[
      'schema_migrations',
      'company',
      'branches',
      'roles',
      'permissions',
      'role_permissions',
      'users',
      'user_branches',
      'user_permissions',
      'user_permission_overrides',
      'user_locks'
    ]) AS table_name
  )
  SELECT string_agg(format('ims.%I', t.table_name), ', ')
    INTO v_truncate_list
    FROM information_schema.tables t
   WHERE t.table_schema = 'ims'
     AND t.table_type = 'BASE TABLE'
     AND NOT EXISTS (SELECT 1 FROM keep_tables k WHERE k.table_name = t.table_name);

  IF v_truncate_list IS NOT NULL AND length(v_truncate_list) > 0 THEN
    EXECUTE 'TRUNCATE TABLE ' || v_truncate_list || ' RESTART IDENTITY CASCADE';
  END IF;

  -- Keep only selected users (by username).
  DELETE FROM ims.users u
   WHERE NOT (COALESCE(lower(u.username), '') = ANY(v_keep_usernames));

  -- Remove orphaned user mappings (defensive: some schemas may not use CASCADE).
  DELETE FROM ims.user_branches ub WHERE NOT EXISTS (SELECT 1 FROM ims.users u WHERE u.user_id = ub.user_id);
  DELETE FROM ims.user_permissions up WHERE NOT EXISTS (SELECT 1 FROM ims.users u WHERE u.user_id = up.user_id);
  DELETE FROM ims.user_permission_overrides uo WHERE NOT EXISTS (SELECT 1 FROM ims.users u WHERE u.user_id = uo.user_id);
  DELETE FROM ims.user_locks ul WHERE NOT EXISTS (SELECT 1 FROM ims.users u WHERE u.user_id = ul.user_id);

  -- Ensure at least one active branch exists (bootstrap expects it).
  SELECT branch_id
    INTO v_branch_id
    FROM ims.branches
   WHERE COALESCE(is_active, TRUE) = TRUE
   ORDER BY branch_id ASC
   LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO ims.branches (branch_name, is_active)
    VALUES ('Main Branch', TRUE)
    RETURNING branch_id INTO v_branch_id;
  END IF;

  -- Ensure kept users have a branch + full permissions.
  FOREACH v_username IN ARRAY v_keep_usernames LOOP
    SELECT user_id INTO v_user_id
      FROM ims.users
     WHERE lower(username) = v_username
     LIMIT 1;

    IF v_user_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO ims.user_branches (user_id, branch_id)
    SELECT v_user_id, v_branch_id
     WHERE NOT EXISTS (
       SELECT 1
         FROM ims.user_branches ub
        WHERE ub.user_id = v_user_id
          AND ub.branch_id = v_branch_id
     );

    INSERT INTO ims.user_permissions (user_id, perm_id, granted_by)
    SELECT v_user_id, p.perm_id, v_user_id
      FROM ims.permissions p
     WHERE NOT EXISTS (
       SELECT 1
         FROM ims.user_permissions up
        WHERE up.user_id = v_user_id
          AND up.perm_id = p.perm_id
     );

    -- Remove explicit denies for the kept user(s).
    DELETE FROM ims.user_permission_overrides
     WHERE user_id = v_user_id
       AND effect = 'deny';
  END LOOP;
END;
$$;

-- Optional wrapper for "CALL ..." usage.
CREATE OR REPLACE PROCEDURE ims.sp_reset_erp_data(
  p_confirm boolean,
  p_keep_usernames text[] DEFAULT ARRAY['admin']
)
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM ims.fn_reset_erp_data(p_confirm, p_keep_usernames);
END;
$$;

COMMIT;

