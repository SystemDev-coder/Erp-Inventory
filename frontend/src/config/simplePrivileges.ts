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

// Some areas hide real, independently-gated permissions behind their top-level checkbox -
// e.g. granting full Sales CRUD does NOT grant `sales.pos.access` (the POS screen), and
// there is otherwise no UI to toggle that key at all. `subItems` exposes those as their own
// row when a module is expanded:
//   - 'crud'   behaves exactly like a top-level module: 4 checkboxes, one perm_key per action.
//   - 'toggle' is a single real permission with no view/create/update/delete split (e.g.
//     `sales.pos.access`, `payroll.pay`) - rendered as one checkbox in the View column.
//   - 'info'   has no independently-grantable permission of its own (e.g. a Reports tab whose
//     visibility is just an OR of keys that already have their own checkbox elsewhere) -
//     rendered read-only, purely so the admin can see what lives inside the area.
export type SimplePrivilegeSubItem =
  | { id: string; label: string; kind: 'crud'; prefixes: string[] }
  | { id: string; label: string; kind: 'toggle'; key: string }
  | { id: string; label: string; kind: 'info'; note: string };

export type SimplePrivilegeModule = {
  id: string;
  label: string;
  prefixes: string[];
  subItems?: SimplePrivilegeSubItem[];
};

export const SIMPLE_PRIVILEGE_MODULES: SimplePrivilegeModule[] = [
  { id: 'customers', label: 'Customers', prefixes: ['customers'] },
  {
    id: 'items',
    label: 'Products / Stock',
    prefixes: ['items'],
    subItems: [{ id: 'stock-adjust', label: 'Adjust Stock', kind: 'toggle', key: 'stock.adjust' }],
  },
  {
    id: 'sales',
    label: 'Sales & Invoices',
    prefixes: ['sales'],
    subItems: [{ id: 'pos-access', label: 'POS Access', kind: 'toggle', key: 'sales.pos.access' }],
  },
  {
    id: 'returns',
    label: 'Returns',
    prefixes: ['sales_returns', 'purchase_returns'],
    subItems: [
      { id: 'sales-return', label: 'Sales Return', kind: 'crud', prefixes: ['sales_returns'] },
      { id: 'purchase-return', label: 'Supplier Return', kind: 'crud', prefixes: ['purchase_returns'] },
    ],
  },
  { id: 'purchases', label: 'Purchases', prefixes: ['purchases'] },
  { id: 'suppliers', label: 'Suppliers', prefixes: ['suppliers'] },
  { id: 'employees', label: 'Employees', prefixes: ['employees'] },
  {
    id: 'finance',
    label: 'Finance / Accounts',
    prefixes: ['accounts'],
    subItems: [
      { id: 'account-transfers', label: 'Account Transfers', kind: 'crud', prefixes: ['account_transfers'] },
      { id: 'other-income', label: 'Other Income', kind: 'crud', prefixes: ['other_incomes'] },
      { id: 'customer-receipts', label: 'Customer Receipts', kind: 'crud', prefixes: ['customer_receipts'] },
      { id: 'supplier-receipts', label: 'Supplier Receipts', kind: 'crud', prefixes: ['supplier_receipts'] },
      { id: 'payroll-runs', label: 'Payroll', kind: 'crud', prefixes: ['payroll_runs'] },
      { id: 'payroll-process', label: 'Process Payroll', kind: 'toggle', key: 'payroll.process' },
      { id: 'payroll-pay', label: 'Pay Salaries', kind: 'toggle', key: 'payroll.pay' },
    ],
  },
  {
    id: 'expenses',
    label: 'Expenses',
    prefixes: ['expenses'],
    subItems: [
      { id: 'expense-charges', label: 'Expense Charges', kind: 'crud', prefixes: ['expense_charges'] },
      { id: 'expense-budgets', label: 'Expense Budgets', kind: 'crud', prefixes: ['expense_budgets'] },
    ],
  },
  {
    id: 'users',
    label: 'Users',
    prefixes: ['users'],
    subItems: [
      { id: 'roles', label: 'Roles', kind: 'crud', prefixes: ['roles'] },
      { id: 'privileges', label: 'View/Manage Privileges', kind: 'toggle', key: 'permissions.view' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    prefixes: ['reports'],
    subItems: [
      { id: 'rpt-sales', label: 'Sales', kind: 'info', note: 'Needs Reports view, or Sales view' },
      { id: 'rpt-inventory', label: 'Inventory', kind: 'info', note: 'Needs Reports view, or Products/Stock view' },
      { id: 'rpt-purchase', label: 'Purchase', kind: 'info', note: 'Needs Reports view, or Purchases/Suppliers view' },
      { id: 'rpt-financial', label: 'Financial', kind: 'info', note: 'Needs Reports view, or Finance view' },
      { id: 'rpt-profit', label: 'Profit', kind: 'info', note: 'Needs Reports view, or Finance/Sales view' },
      { id: 'rpt-hr', label: 'HR', kind: 'info', note: 'Needs Reports view, or Employees view' },
      { id: 'rpt-customer', label: 'Customer', kind: 'info', note: 'Needs Reports view, or Customers/Sales view' },
      { id: 'rpt-supplier', label: 'Supplier', kind: 'info', note: 'Needs Reports view, or Suppliers/Purchases view' },
    ],
  },
];

export const simplePermKeys = (module: SimplePrivilegeModule, action: SimpleAction): string[] =>
  module.prefixes.map((prefix) => (action === 'view' && prefix === 'reports' ? 'reports.all' : `${prefix}.${action}`));

// Same idea as simplePermKeys, but for one sub-item row. 'toggle' sub-items only ever have a
// single real key and only occupy the View column; 'info' rows have nothing to toggle at all.
export const simpleSubItemKeys = (subItem: SimplePrivilegeSubItem, action: SimpleAction): string[] => {
  if (subItem.kind === 'crud') return subItem.prefixes.map((prefix) => `${prefix}.${action}`);
  if (subItem.kind === 'toggle') return action === 'view' ? [subItem.key] : [];
  return [];
};
