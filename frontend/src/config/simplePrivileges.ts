// The backend tracks ~400 granular permission keys (account_transactions.export,
// journal_lines.view, warehouse_transfer_items.create, ...) which is accurate but far too
// much detail for a business owner to manage day to day. This maps that down to the handful
// of areas a client actually recognizes, each with the four actions the original ask was
// really about: view it, add new, edit, delete.
//
// A module can map to more than one underlying perm_key prefix (e.g. "Returns" covers both
// sales_returns and purchase_returns) - toggling one checkbox here sets all of them together.
// Any permission NOT covered by one of these modules/actions (export, void, approve, credit,
// reconcile, ...) is left exactly as the role/user already has it - this UI only ever touches
// the keys it displays.
export const SIMPLE_ACTIONS = ['view', 'create', 'update', 'delete'] as const;
export type SimpleAction = (typeof SIMPLE_ACTIONS)[number];

export const SIMPLE_ACTION_LABELS: Record<SimpleAction, string> = {
  view: 'View',
  create: 'Add New',
  update: 'Edit',
  delete: 'Delete',
};

export type SimplePrivilegeModule = {
  id: string;
  label: string;
  prefixes: string[];
};

export const SIMPLE_PRIVILEGE_MODULES: SimplePrivilegeModule[] = [
  { id: 'customers', label: 'Customers', prefixes: ['customers'] },
  { id: 'items', label: 'Items / Stock', prefixes: ['items'] },
  { id: 'sales', label: 'Sales & Invoices', prefixes: ['sales'] },
  { id: 'returns', label: 'Returns', prefixes: ['sales_returns', 'purchase_returns'] },
  { id: 'purchases', label: 'Purchases', prefixes: ['purchases'] },
  { id: 'suppliers', label: 'Suppliers', prefixes: ['suppliers'] },
  { id: 'employees', label: 'Employees', prefixes: ['employees'] },
  { id: 'finance', label: 'Finance / Accounts', prefixes: ['accounts'] },
  { id: 'expenses', label: 'Expenses', prefixes: ['expenses'] },
  { id: 'users', label: 'Users', prefixes: ['users'] },
  { id: 'reports', label: 'Reports', prefixes: ['reports'] },
];

export const simplePermKeys = (module: SimplePrivilegeModule, action: SimpleAction): string[] =>
  module.prefixes.map((prefix) => (action === 'view' && prefix === 'reports' ? 'reports.all' : `${prefix}.${action}`));
