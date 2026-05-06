// NEW: Permission keys currently used by the sidebar UI (v1.0).
// This list is used to keep the System → Privileges screen focused on the permissions
// that actually affect navigation and current screens.
export const SIDEBAR_PERMISSION_KEYS = [
  'dashboard.view',
  'home.view',
  'customers.view',

  'items.view',
  'products.view',
  'stock.view',
  'inventory.view',

  'returns.view',
  'sales_returns.view',
  'purchase_returns.view',

  'purchases.view',
  'suppliers.view',
  'sales.view',

  'finance.reports',
  'accounts.view',
  'expenses.view',
  'ledgers.view',
  'payroll_lines.view',
  'payroll_runs.view',
  'payroll.process',
  'payroll.pay',

  'employees.view',

  'users.view',
  'roles.view',
  'permissions.view',
  'system.users.manage',
  'system.roles.manage',
  'system.permissions.manage',
  'system.settings',

  'reports.all',
  'trash.view',
] as const;

export const SIDEBAR_PERMISSION_KEY_SET = new Set<string>(SIDEBAR_PERMISSION_KEYS);

