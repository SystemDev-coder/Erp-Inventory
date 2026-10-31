-- Phase 1 security fix follow-up: server/src/modules/trash/trash.routes.ts already
-- gates its endpoints with requireAnyPerm(['trash.view']) / requireAnyPerm(['trash.restore']),
-- but those two permission keys were never seeded into ims.permissions, so the check
-- could never pass for anyone through real grants. Trash access only ever worked (for
-- the Developer role) as a side effect of the C1 permission-bypass bug (is_system=true
-- incorrectly treated as "full admin"). Now that C1 is fixed, these keys need to exist
-- and be granted to the roles that are meant to have this access, or the
-- already-built trash/restore feature becomes unreachable by anyone.
--
-- This does not create a new permission architecture - it uses the exact key names
-- already hardcoded in trash.routes.ts, following the same shape as every other row
-- in ims.permissions.

INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
VALUES
  ('trash.view', 'View Trash', 'System Administration', 'Trash', 'view', 'View soft-deleted records across the system'),
  ('trash.restore', 'Restore Trash', 'System Administration', 'Trash', 'restore', 'Restore a soft-deleted record')
ON CONFLICT (perm_key) DO NOTHING;

-- Grant to Administrator and Developer only - the two roles this route already
-- requires via requireRoleName('developer') plus the admin bypass; Developer is the
-- role actually gated by name, Administrator is included for consistency since it
-- already holds every other permission in the system.
INSERT INTO ims.role_permissions (role_id, perm_id)
SELECT r.role_id, p.perm_id
  FROM ims.roles r
  CROSS JOIN ims.permissions p
 WHERE r.role_code IN ('ADMIN', 'DEVELOPER')
   AND p.perm_key IN ('trash.view', 'trash.restore')
ON CONFLICT DO NOTHING;
