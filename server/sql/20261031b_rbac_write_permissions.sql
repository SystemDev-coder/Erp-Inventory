-- Give every write endpoint a matching, grantable permission. These keys are
-- used by the API as well as the Roles/Privileges screen, so custom roles can
-- be configured without relying on a hard-coded role name.
BEGIN;

INSERT INTO ims.permissions (perm_key, perm_name, module, sub_module, action_type, description)
VALUES
  (
    'finance_closing_periods.view',
    'View Closing Periods',
    'Finance',
    'Closing Periods',
    'view',
    'View financial closing periods and profit-sharing rules'
  ),
  (
    'finance_closing_periods.create',
    'Create Closing Periods',
    'Finance',
    'Closing Periods',
    'create',
    'Create financial closing periods'
  ),
  (
    'finance_closing_periods.update',
    'Manage Closing Periods',
    'Finance',
    'Closing Periods',
    'update',
    'Update, close, transfer, and configure financial closing periods'
  ),
  (
    'audit_logs.delete',
    'Delete Audit Logs',
    'System Administration',
    'Audit',
    'delete',
    'Delete audit-log records'
  )
ON CONFLICT (perm_key) DO NOTHING;

-- Keep the default elevated roles operational after the stricter route
-- checks are introduced. Other roles receive these permissions only through
-- the normal Roles/Privileges screen.
INSERT INTO ims.role_permissions (role_id, perm_id)
SELECT r.role_id, p.perm_id
  FROM ims.roles r
  JOIN ims.permissions p
    ON p.perm_key IN (
      'finance_closing_periods.view',
      'finance_closing_periods.create',
      'finance_closing_periods.update',
      'audit_logs.delete'
    )
 WHERE r.role_code IN ('ADMIN', 'DEVELOPER')
ON CONFLICT (role_id, perm_id) DO NOTHING;

COMMIT;
