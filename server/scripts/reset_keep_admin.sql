-- ============================================================================
-- DANGER: IRREVERSIBLE FULL DATA WIPE. PRODUCTION-TARGETED. MANUAL USE ONLY.
-- ============================================================================
-- Wipes every bit of business/demo data from the ERP and leaves exactly:
--   - one user: the existing 'admin' row, PASSWORD UNCHANGED, granted every
--     permission that exists
--   - the roles/permissions/role_permissions catalog, intact and unchanged
--     (so the ADMIN role itself - not just the admin user - still has full
--     access; a prior version of this script forgot role_permissions and
--     left the role powerless after a reset)
--   - one fresh "Main Branch" branch with one "Main Store" store
--   - one fresh, blank default company profile
-- Everything else - every sale, purchase, customer, supplier, account,
-- ledger entry, notification, audit log, attribute, tax, unit, shift,
-- employee, etc. - is gone. Sequences restart from 1.
--
-- This file deliberately lives in server/scripts/, NOT server/sql/.
-- server/sql/ is auto-applied on every deploy by
-- docker/entrypoint.sh#apply_incremental_migrations() (every .sql file in
-- that directory except the two named base/seed files, tracked by
-- checksum - an unapplied or changed file runs automatically on the next
-- deploy, no confirmation). A file that does this MUST NEVER sit there.
-- server/scripts/ is not copied into the production image at all
-- (server/Dockerfile only COPYs ./sql) and nothing scans it automatically -
-- the only way this runs is a human deliberately pointing psql at it with
-- real database credentials.
--
-- HOW TO RUN (manually, against the intended database only):
--   1. TRIPLE-CHECK the host/database before running anything, e.g.:
--        psql -h <host> -U <admin user> -d <database> -c "\conninfo"
--   2. Run the confirmation SET and this file together, in ONE psql
--      invocation, so they share the same session (two separate psql calls
--      do NOT share a session - the SET would be silently lost and the
--      script would refuse to run, which is the safe failure mode, but the
--      correct way is this single command):
--        psql -h <host> -U <admin user> -d <database> -v ON_ERROR_STOP=1 \
--          -c "SET app.confirm_destructive_reset = 'I_UNDERSTAND_THIS_WIPES_PRODUCTION';" \
--          -f reset_keep_admin.sql
--
-- Connect as the database admin/superuser role (the same role
-- docker/entrypoint.sh uses for migrations) - a role that bypasses RLS,
-- or the TRUNCATE/DELETE statements below will be blocked by
-- ims.rls_soft_delete policies.
-- ============================================================================

DO $$
BEGIN
  IF COALESCE(current_setting('app.confirm_destructive_reset', true), '') <> 'I_UNDERSTAND_THIS_WIPES_PRODUCTION' THEN
    RAISE EXCEPTION 'Refusing to run: SET app.confirm_destructive_reset = ''I_UNDERSTAND_THIS_WIPES_PRODUCTION''; first (see header comment).';
  END IF;
END $$;

BEGIN;

DO $$
DECLARE
  keep_tables text[] := ARRAY[
    'roles',
    'permissions',
    'role_permissions',
    'users',
    'user_permissions',
    'user_permission_overrides',
    'user_locks',
    'delete_dependency_policy'
  ];
  truncate_list text;
  admin_id bigint;
  new_branch_id bigint;
  kept_user_count int;
  granted_perm_count int;
BEGIN
  -- Disable triggers (audit, etc.) during the wipe to avoid FK/trigger noise.
  PERFORM set_config('session_replication_role', 'replica', true);

  SELECT string_agg(format('ims.%I', tablename), ', ')
    INTO truncate_list
    FROM pg_tables
   WHERE schemaname = 'ims'
     AND tablename <> ALL(keep_tables);

  IF truncate_list IS NOT NULL AND length(truncate_list) > 0 THEN
    EXECUTE 'TRUNCATE TABLE ' || truncate_list || ' RESTART IDENTITY CASCADE';
  END IF;

  -- Fresh default company profile (mirrors docker/entrypoint.sh's own
  -- run_bootstrap_seed default so the app isn't left companyless).
  INSERT INTO ims.company (company_id, company_name)
  VALUES (1, 'My Inventory ERP');

  -- Fresh default branch + store (mirrors the same bootstrap defaults).
  INSERT INTO ims.branches (branch_name, is_active)
  VALUES ('Main Branch', TRUE)
  RETURNING branch_id INTO new_branch_id;

  INSERT INTO ims.stores (branch_id, store_name, is_active)
  VALUES (new_branch_id, 'Main Store', TRUE);

  -- Keep only the admin user.
  DELETE FROM ims.users WHERE LOWER(username) <> 'admin';

  SELECT user_id INTO admin_id
    FROM ims.users
   WHERE LOWER(username) = 'admin'
   LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'No user named "admin" survived - aborting before commit (nothing else was supposed to delete it).';
  END IF;

  -- Re-link admin to the fresh branch (user_branches was truncated above).
  INSERT INTO ims.user_branches (user_id, branch_id, is_default)
  VALUES (admin_id, new_branch_id, TRUE)
  ON CONFLICT DO NOTHING;

  -- Ensure admin has every permission that exists.
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

  -- Re-enable triggers.
  PERFORM set_config('session_replication_role', 'origin', true);

  SELECT COUNT(*) INTO kept_user_count FROM ims.users;
  SELECT COUNT(*) INTO granted_perm_count FROM ims.user_permissions WHERE user_id = admin_id;

  RAISE NOTICE 'Reset complete: % user(s) remain, admin (id=%) holds % permission grant(s), branch_id=% / store created.',
    kept_user_count, admin_id, granted_perm_count, new_branch_id;
END $$;

COMMIT;
