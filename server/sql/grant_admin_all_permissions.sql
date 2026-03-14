-- Grants all permissions to the admin user (username = 'admin').
-- Intended for dev reset / recovery.

BEGIN;

DO $$
DECLARE
  admin_id bigint;
BEGIN
  SELECT user_id INTO admin_id
    FROM ims.users
   WHERE LOWER(username) = 'admin'
   LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin user not found';
  END IF;

  INSERT INTO ims.user_permissions (user_id, perm_id, granted_by)
  SELECT admin_id, p.perm_id, admin_id
    FROM ims.permissions p
   WHERE NOT EXISTS (
     SELECT 1
       FROM ims.user_permissions up
      WHERE up.user_id = admin_id
        AND up.perm_id = p.perm_id
   );

  -- Remove any explicit denies for admin.
  DELETE FROM ims.user_permission_overrides
   WHERE user_id = admin_id
     AND effect = 'deny';
END $$;

COMMIT;

