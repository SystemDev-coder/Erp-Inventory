import { queryMany, queryOne } from '../../db/query';
import {
  DashboardCard,
  DashboardChart,
  DashboardCardDrilldown,
  DashboardDebtRow,
  DashboardLowStockItem,
  DashboardRecentRow,
  DashboardTopProduct,
  DashboardWidget,
} from './dashboard.types';

const ALL_WIDGETS: DashboardWidget[] = [
  { id: 'overview', name: 'Overview', permission: 'home.view' },
  { id: 'sales_summary', name: 'Sales Summary', permission: 'sales.view' },
  { id: 'stock_alerts', name: 'Stock Alerts', permission: 'stock.view' },
  { id: 'purchases_status', name: 'Purchases Status', permission: 'purchases.view' },
  { id: 'finance_overview', name: 'Finance Overview', permission: 'finance.view' },
  { id: 'customers_overview', name: 'Customers Overview', permission: 'customers.view' },
  { id: 'employees_overview', name: 'Employees Overview', permission: 'employees.view' },
];

const hasPermission = (permissions: string[], key: string) => {
  if (permissions.includes(key)) return true;
  if (key === 'stock.view') {
    return (
      permissions.includes('warehouse_stock.view') ||
      permissions.includes('inventory.view') ||
      permissions.includes('items.view') ||
      permissions.includes('products.view')
    );
  }
  if (key === 'inventory.view') {
    return permissions.includes('stock.view') || permissions.includes('warehouse_stock.view');
  }
  if (key === 'warehouse_stock.view') {
    return permissions.includes('stock.view') || permissions.includes('inventory.view');
  }
  if (key.startsWith('items.')) {
    return permissions.includes(key.replace('items.', 'products.'));
  }
  if (key.startsWith('products.')) {
    return permissions.includes(key.replace('products.', 'items.'));
  }
  return false;
};

let cachedItemAlertExpression: string | null = null;

const cachedTableColumns = new Map<string, Set<string>>();

const getTableColumns = async (tableName: string): Promise<Set<string>> => {
  const key = `ims.${tableName}`;
  const cached = cachedTableColumns.get(key);
  if (cached) return cached;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = $1`,
    [tableName]
  );
  const set = new Set(columns.map((row) => row.column_name));
  cachedTableColumns.set(key, set);
  return set;
};

const pickFirstColumn = async (tableName: string, candidates: string[], fallback: string) => {
  const cols = await getTableColumns(tableName);
  for (const name of candidates) {
    if (cols.has(name)) return name;
  }
  return fallback;
};

const getItemAlertExpression = async (): Promise<string> => {
  if (cachedItemAlertExpression) return cachedItemAlertExpression;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'items'`
  );
  const names = new Set(columns.map((row) => row.column_name));

  if (names.has('stock_alert')) {
    cachedItemAlertExpression = 'i.stock_alert';
    return cachedItemAlertExpression;
  }
  if (names.has('reorder_level')) {
    cachedItemAlertExpression = 'i.reorder_level';
    return cachedItemAlertExpression;
  }

  cachedItemAlertExpression = 'NULL::numeric';
  return cachedItemAlertExpression;
};

export class DashboardService {
  getDashboardWidgets(permissions: string[]): DashboardWidget[] {
    return ALL_WIDGETS.filter((widget) => hasPermission(permissions, widget.permission));
  }

  async getDashboardCardDrilldown(
    branchIds: number[],
    permissions: string[],
    cardId: string
  ): Promise<DashboardCardDrilldown> {
    if (!permissions.includes('dashboard.view') && !permissions.includes('home.view')) {
      return { cardId, title: 'Dashboard', total: 0, rows: [] };
    }

    const canViewCustomers = hasPermission(permissions, 'customers.view');
    const canViewEmployees = hasPermission(permissions, 'employees.view') || permissions.includes('users.view');
    const canViewProducts = hasPermission(permissions, 'items.view') || hasPermission(permissions, 'products.view');
    // 'stock.view' was never a seeded permission key - items/products/warehouse_stock view
    // rights are what actually gate stock features elsewhere (e.g. the sidebar's Stock
    // Management item), so check those instead.
    const canViewStock =
      hasPermission(permissions, 'items.view') ||
      hasPermission(permissions, 'products.view') ||
      hasPermission(permissions, 'warehouse_stock.view');
    const canViewSales = permissions.includes('sales.view');
    const canViewExpenses = permissions.includes('expenses.view');
    const canViewAccounts = permissions.includes('accounts.view');
    const canViewPayments = canViewAccounts || canViewExpenses;
    const canViewSuppliers = hasPermission(permissions, 'suppliers.view');
    const canViewPurchases = permissions.includes('purchases.view');

    if (cardId === 'total-suppliers') {
      if (!canViewSuppliers) return { cardId, title: 'Total Suppliers', format: 'number', total: 0, rows: [] };
      const rows = await queryMany<{
        supplier_id: number;
        name: string;
        phone: string | null;
        created_at: string | null;
      }>(
        `SELECT supplier_id,
                COALESCE(name, '')::text AS name,
                NULLIF(phone, '')::text AS phone,
                created_at::text AS created_at
           FROM ims.suppliers
          WHERE branch_id = ANY($1)
            AND is_active = TRUE
          ORDER BY supplier_id DESC
          LIMIT 500`,
        [branchIds]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM ims.suppliers
          WHERE branch_id = ANY($1)
            AND is_active = TRUE`,
        [branchIds]
      );
      return { cardId, title: 'Total Suppliers', format: 'number', total: Number(totalRow?.total || 0), rows };
    }

    if (cardId === 'total-purchases' || cardId === 'today-purchases') {
      const title = cardId === 'today-purchases' ? "Today's Purchases" : 'Total Purchases';
      if (!canViewPurchases) return { cardId, title, format: 'currency', total: 0, rows: [] };
      const datePredicate = cardId === 'today-purchases' ? `p.purchase_date::date = CURRENT_DATE` : `p.purchase_date >= date_trunc('month', CURRENT_DATE)`;
      const supplierNameCol = await pickFirstColumn('suppliers', ['name'], 'name');
      const rows = await queryMany<{
        purchase_id: number;
        purchase_date: string;
        supplier_name: string | null;
        total: string;
        status: string;
      }>(
        `SELECT p.purchase_id,
                p.purchase_date::text AS purchase_date,
                COALESCE(s.${supplierNameCol}, '')::text AS supplier_name,
                p.total::text AS total,
                COALESCE(p.status::text, '')::text AS status
           FROM ims.purchases p
           LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
          WHERE p.branch_id = ANY($1)
            AND p.status NOT IN ('void', 'order', 'ordered')
            AND ${datePredicate}
            AND COALESCE(p.doc_type, 'purchase') = 'purchase'
          ORDER BY p.purchase_date DESC
          LIMIT 500`,
        [branchIds]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(p.total), 0)::text AS total
           FROM ims.purchases p
          WHERE p.branch_id = ANY($1)
            AND p.status NOT IN ('void', 'order', 'ordered')
            AND ${datePredicate}
            AND COALESCE(p.doc_type, 'purchase') = 'purchase'`,
        [branchIds]
      );
      return { cardId, title, format: 'currency', total: Number(totalRow?.total || 0), rows };
    }

    if (cardId === 'total-expenses' || cardId === 'today-expenses' || cardId === 'week-expenses') {
      const title = cardId === 'today-expenses' ? "Today's Expenses" : cardId === 'week-expenses' ? 'This Week Expenses' : 'Total Expenses';
      if (!canViewExpenses) return { cardId, title, format: 'currency', total: 0, rows: [] };
      const datePredicate =
        cardId === 'today-expenses'
          ? `ec.charge_date::date = CURRENT_DATE`
          : cardId === 'week-expenses'
            ? `ec.charge_date >= date_trunc('week', CURRENT_DATE)`
            : `ec.charge_date >= date_trunc('month', CURRENT_DATE)`;
      const expenseNameCol = await pickFirstColumn('expenses', ['name', 'expense_name', 'title'], 'name');
      const rows = await queryMany<{
        charge_id: number;
        charge_date: string;
        name: string | null;
        amount: string;
        note: string | null;
      }>(
        `SELECT ec.charge_id,
                ec.charge_date::text AS charge_date,
                COALESCE(e.${expenseNameCol}, '[Expense]')::text AS name,
                ec.amount::text AS amount,
                ec.note::text AS note
           FROM ims.expense_charges ec
           LEFT JOIN ims.expenses e ON e.exp_id = ec.exp_id AND e.branch_id = ec.branch_id
          WHERE ec.branch_id = ANY($1)
            AND ${datePredicate}
          ORDER BY ec.charge_date DESC
          LIMIT 500`,
        [branchIds]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(ec.amount), 0)::text AS total
           FROM ims.expense_charges ec
          WHERE ec.branch_id = ANY($1)
            AND ${datePredicate}`,
        [branchIds]
      );
      return { cardId, title, format: 'currency', total: Number(totalRow?.total || 0), rows };
    }

    if (cardId === 'total-customers') {
      if (!canViewCustomers) return { cardId, title: 'Total Customers', format: 'number', total: 0, rows: [] };
      const nameCol = await pickFirstColumn('customers', ['full_name', 'name'], 'full_name');
      const phoneCol = await pickFirstColumn('customers', ['phone', 'mobile', 'phone_number'], 'phone');
      const createdCol = await pickFirstColumn('customers', ['created_at', 'registered_date'], 'created_at');
      const rows = await queryMany<{
        customer_id: number;
        name: string;
        phone: string | null;
        created_at: string | null;
      }>(
        `SELECT customer_id,
                COALESCE(${nameCol}, '')::text AS name,
                NULLIF(${phoneCol}, '')::text AS phone,
                ${createdCol}::text AS created_at
           FROM ims.customers
          WHERE branch_id = ANY($1)
          ORDER BY customer_id DESC
          LIMIT 500`,
        [branchIds]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM ims.customers
          WHERE branch_id = ANY($1)`,
        [branchIds]
      );
      return { cardId, title: 'Total Customers', format: 'number', total: Number(totalRow?.total || 0), rows };
    }

    if (cardId === 'new-customers-today') {
      if (!canViewCustomers) return { cardId, title: 'New Customers Today', format: 'number', total: 0, rows: [] };
      const nameCol = await pickFirstColumn('customers', ['full_name', 'name'], 'full_name');
      const phoneCol = await pickFirstColumn('customers', ['phone', 'mobile', 'phone_number'], 'phone');
      const createdCol = await pickFirstColumn('customers', ['created_at', 'registered_date'], 'created_at');
      const rows = await queryMany<{
        customer_id: number;
        name: string;
        phone: string | null;
        created_at: string | null;
      }>(
        `SELECT customer_id,
                COALESCE(${nameCol}, '')::text AS name,
                NULLIF(${phoneCol}, '')::text AS phone,
                ${createdCol}::text AS created_at
           FROM ims.customers
          WHERE branch_id = ANY($1)
            AND ${createdCol}::date = CURRENT_DATE
          ORDER BY ${createdCol} DESC
          LIMIT 500`,
        [branchIds]
      );
      return { cardId, title: 'New Customers Today', format: 'number', total: rows.length, rows };
    }

    if (cardId === 'total-employees') {
      if (!canViewEmployees) return { cardId, title: 'Total Employees', format: 'number', total: 0, rows: [] };
      const employeeCols = await getTableColumns('employees');
      const idCol = await pickFirstColumn('employees', ['employee_id', 'emp_id', 'id'], 'emp_id');
      const nameCol = await pickFirstColumn('employees', ['full_name', 'name'], 'full_name');
      const phoneCol = await pickFirstColumn('employees', ['phone', 'mobile', 'phone_number'], 'phone');
      const positionCol = await pickFirstColumn('employees', ['position', 'job_title', 'title'], '__none__');
      const hasPosition = employeeCols.has(positionCol);
      const rows = await queryMany<{
        employee_id: number;
        name: string;
        phone: string | null;
        position: string | null;
        status: string;
      }>(
        `SELECT COALESCE(${idCol}, 0)::bigint AS employee_id,
                COALESCE(${nameCol}, '')::text AS name,
                NULLIF(${phoneCol}, '')::text AS phone,
                ${hasPosition ? `NULLIF(${positionCol}, '')::text` : `NULL::text`} AS position,
                COALESCE(status::text, '')::text AS status
           FROM ims.employees
          WHERE branch_id = ANY($1)
            AND status = 'active'
          ORDER BY ${idCol} DESC
          LIMIT 500`,
        [branchIds]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM ims.employees
          WHERE branch_id = ANY($1)
            AND status = 'active'`,
        [branchIds]
      );
      return { cardId, title: 'Total Employees', format: 'number', total: Number(totalRow?.total || 0), rows };
    }

    if (cardId === 'total-products') {
      if (!canViewProducts) return { cardId, title: 'Total Products', format: 'number', total: 0, rows: [] };
      const priceCol = await pickFirstColumn('items', ['sell_price', 'sale_price', 'selling_price'], 'sell_price');
      const rows = await queryMany<{
        item_id: number;
        name: string;
        opening_balance: string | null;
        sale_price: string | null;
        is_active: boolean;
      }>(
        `SELECT item_id,
                COALESCE(name, '')::text AS name,
                opening_balance::text,
                ${priceCol}::text AS sale_price,
                COALESCE(is_active, TRUE) AS is_active
           FROM ims.items
          WHERE branch_id = ANY($1)
            AND is_active = TRUE
          ORDER BY item_id DESC
          LIMIT 500`,
        [branchIds]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM ims.items
          WHERE branch_id = ANY($1)
            AND is_active = TRUE`,
        [branchIds]
      );
      return { cardId, title: 'Total Products', format: 'number', total: Number(totalRow?.total || 0), rows };
    }

    if (cardId === 'inventory-stock' || cardId === 'low-stock-alert') {
      if (!canViewStock) return { cardId, title: 'Inventory', format: 'number', total: 0, rows: [] };

      const alertExpr = await getItemAlertExpression();
      const thresholdExpr = `GREATEST(COALESCE(NULLIF(${alertExpr}, 0), 5), 1)`;

      const rows = await queryMany<{
        item_id: number;
        item_name: string;
        stock_alert: string;
        quantity: string;
      }>(
        `WITH item_stock AS (
           SELECT
             i.item_id,
             i.name AS item_name,
             ${thresholdExpr}::numeric(14,3) AS stock_alert,
             CASE
               WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
               ELSE COALESCE(st.store_qty, 0)
             END::numeric(14,3) AS quantity
           FROM ims.items i
           LEFT JOIN (
             SELECT
               s.branch_id,
               si.product_id AS item_id,
               COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS store_qty,
               COUNT(*)::int AS row_count
             FROM ims.store_items si
             JOIN ims.stores s ON s.store_id = si.store_id
             GROUP BY s.branch_id, si.product_id
           ) st
             ON st.item_id = i.item_id
            AND st.branch_id = i.branch_id
          WHERE i.branch_id = ANY($1)
            AND i.is_active = TRUE
         )
         SELECT item_id,
                COALESCE(item_name, '')::text AS item_name,
                stock_alert::text,
                quantity::text
           FROM item_stock
          ${cardId === 'low-stock-alert' ? 'WHERE quantity <= stock_alert' : ''}
          ORDER BY item_name`,
        [branchIds]
      );

      const total = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      const totalCount = rows.length;
      if (cardId === 'low-stock-alert') {
        return { cardId, title: 'Low Stock Alert', format: 'number', total: totalCount, rows };
      }
      return { cardId, title: 'Inventory Stock', format: 'number', total, rows };
    }

    if (cardId === 'today-income' || cardId === 'monthly-income' || cardId === 'total-revenue' || cardId === 'week-sales') {
      if (!canViewSales) return { cardId, title: 'Income', format: 'currency', total: 0, rows: [] };
      const predicate =
        cardId === 'today-income'
          ? `s.sale_date::date = CURRENT_DATE`
          : cardId === 'week-sales'
            ? `s.sale_date >= date_trunc('week', CURRENT_DATE)`
            : cardId === 'monthly-income'
              ? `s.sale_date >= date_trunc('month', CURRENT_DATE)`
              : `TRUE`;
      const customerNameCol = await pickFirstColumn('customers', ['full_name', 'name'], 'full_name');
      const salesSql =
        cardId === 'total-revenue'
          ? `SELECT
                s.sale_id,
                s.sale_date::text AS sale_date,
                COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale')::text AS doc_type,
                COALESCE(c.${customerNameCol}, 'Walking Customer')::text AS customer_name,
                COALESCE(s.total, 0)::text AS total,
                COALESCE(s.status::text, '')::text AS status
              FROM ims.sales s
              LEFT JOIN ims.customers c ON c.customer_id = s.customer_id AND c.branch_id = s.branch_id
             WHERE s.branch_id = ANY($1)
               AND s.status <> 'void'
               AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
            UNION ALL
            SELECT
                COALESCE(
                  NULLIF(to_jsonb(sr) ->> 'sales_return_id', '')::bigint,
                  NULLIF(to_jsonb(sr) ->> 'return_id', '')::bigint,
                  NULLIF(to_jsonb(sr) ->> 'id', '')::bigint,
                  0
                ) AS sale_id,
                sr.return_date::text AS sale_date,
                'sales_return'::text AS doc_type,
                COALESCE(c.${customerNameCol}, 'Walking Customer')::text AS customer_name,
                (-COALESCE(sr.total, 0))::text AS total,
                COALESCE(NULLIF(to_jsonb(sr) ->> 'status', ''), 'posted')::text AS status
              FROM ims.sales_returns sr
              LEFT JOIN ims.customers c ON c.customer_id = sr.customer_id AND c.branch_id = sr.branch_id
             WHERE sr.branch_id = ANY($1)
            ORDER BY sale_id ASC`
          : `SELECT
                s.sale_id,
                s.sale_date::text AS sale_date,
                COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale')::text AS doc_type,
                COALESCE(c.${customerNameCol}, 'Walking Customer')::text AS customer_name,
                COALESCE(s.total, 0)::text AS total,
                COALESCE(s.status::text, '')::text AS status
              FROM ims.sales s
              LEFT JOIN ims.customers c ON c.customer_id = s.customer_id AND c.branch_id = s.branch_id
             WHERE s.branch_id = ANY($1)
               AND s.status <> 'void'
               AND ${predicate}
               AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
             ORDER BY s.sale_date DESC`;

      const rows = await queryMany<{
        sale_id: number;
        sale_date: string;
        doc_type: string;
        customer_name: string;
        total: string;
        status: string;
      }>(salesSql, [branchIds]);
      const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
      return {
        cardId,
        title:
          cardId === 'today-income'
            ? 'Today Income'
            : cardId === 'week-sales'
              ? 'This Week Sales'
              : cardId === 'monthly-income'
                ? 'Monthly Income'
                : 'Total Revenue',
        format: 'currency',
        total,
        rows,
      };
    }

    if (cardId === 'today-payment' || cardId === 'monthly-payment') {
      if (!canViewPayments) return { cardId, title: 'Payments', format: 'currency', total: 0, rows: [] };
      const datePredicate =
        cardId === 'today-payment'
          ? `p.pay_date::date = CURRENT_DATE`
          : `p.pay_date >= date_trunc('month', CURRENT_DATE)`;

      const accNameCol = await pickFirstColumn('accounts', ['account_name', 'name'], 'name');
      const employeeNameCol = await pickFirstColumn('employees', ['full_name', 'name'], 'full_name');
      const employeeIdCol = await pickFirstColumn('employees', ['employee_id', 'emp_id', 'id'], 'emp_id');
      const employeePaymentEmpIdCol = await pickFirstColumn('employee_payments', ['employee_id', 'emp_id'], 'emp_id');
      const expenseNameCol = await pickFirstColumn('expenses', ['name', 'expense_name', 'title'], 'name');
      const expenseChargeNoteCol = await pickFirstColumn('expense_charges', ['note', 'description', 'memo'], 'note');

      const rows = await queryMany<{
        payment_type: string;
        ref_id: number;
        pay_date: string;
        name: string;
        account_name: string;
        amount_paid: string;
        note: string | null;
      }>(
        `SELECT
            'expense'::text AS payment_type,
            ep.exp_payment_id::int AS ref_id,
            ep.pay_date::text AS pay_date,
            COALESCE(ex.${expenseNameCol}, NULLIF(ec.${expenseChargeNoteCol}, ''), '[Expense]')::text AS name,
            COALESCE(a.${accNameCol}, '')::text AS account_name,
            COALESCE(ep.amount_paid, 0)::text AS amount_paid,
            ep.note::text AS note
          FROM ims.expense_payments ep
          JOIN ims.expense_charges ec ON ec.charge_id = ep.exp_ch_id AND ec.branch_id = ep.branch_id
          LEFT JOIN ims.expenses ex ON ex.exp_id = ec.exp_id AND ex.branch_id = ec.branch_id
          LEFT JOIN ims.accounts a ON a.acc_id = ep.acc_id AND a.branch_id = ep.branch_id
         WHERE ep.branch_id = ANY($1)
           AND ${datePredicate.replace(/p\./g, 'ep.')}
        UNION ALL
          SELECT
            'salary'::text AS payment_type,
            emp.emp_payment_id::int AS ref_id,
            emp.pay_date::text AS pay_date,
            COALESCE(e.${employeeNameCol}, '[Employee]')::text AS name,
            COALESCE(a.${accNameCol}, '')::text AS account_name,
            COALESCE(emp.amount_paid, 0)::text AS amount_paid,
            emp.note::text AS note
          FROM ims.employee_payments emp
          LEFT JOIN ims.employees e ON e.${employeeIdCol} = emp.${employeePaymentEmpIdCol} AND e.branch_id = emp.branch_id
          LEFT JOIN ims.accounts a ON a.acc_id = emp.acc_id AND a.branch_id = emp.branch_id
         WHERE emp.branch_id = ANY($1)
           AND ${datePredicate.replace(/p\./g, 'emp.')}
         ORDER BY pay_date DESC`,
        [branchIds]
      );

      const total = rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
      return {
        cardId,
        title: cardId === 'today-payment' ? 'Today Payment' : 'Monthly Payment',
        format: 'currency',
        total,
        rows,
      };
    }

    if (cardId === 'loans-given-today') {
      if (!canViewSales) return { cardId, title: 'Loans Given Today', format: 'currency', total: 0, rows: [] };
      const customerNameCol = await pickFirstColumn('customers', ['full_name', 'name'], 'full_name');
      const rows = await queryMany<{
        sale_id: number;
        sale_date: string;
        doc_type: string;
        customer_name: string;
        total: string;
        status: string;
      }>(
        `SELECT
            s.sale_id,
            s.sale_date::text AS sale_date,
            COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale')::text AS doc_type,
            COALESCE(c.${customerNameCol}, 'Walking Customer')::text AS customer_name,
            COALESCE(s.total, 0)::text AS total,
            COALESCE(s.status::text, '')::text AS status
          FROM ims.sales s
          LEFT JOIN ims.customers c ON c.customer_id = s.customer_id AND c.branch_id = s.branch_id
         WHERE s.branch_id = ANY($1)
           AND s.status <> 'void'
           AND s.sale_date::date = CURRENT_DATE
           AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
           AND LOWER(COALESCE(s.sale_type::text, '')) = 'credit'
         ORDER BY s.sale_date DESC`,
        [branchIds]
      );
      const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
      return { cardId, title: 'Loans Given Today', format: 'currency', total, rows };
    }

    if (cardId === 'debt-recovered-today') {
      if (!canViewCustomers) return { cardId, title: 'Debt Recovered Today', format: 'currency', total: 0, rows: [] };
      const customerNameCol = await pickFirstColumn('customers', ['full_name', 'name'], 'full_name');
      const rows = await queryMany<{
        receipt_id: number;
        receipt_date: string;
        customer_name: string;
        amount: string;
        note: string | null;
      }>(
        `SELECT
            cr.receipt_id,
            cr.receipt_date::text AS receipt_date,
            COALESCE(c.${customerNameCol}, 'Unknown Customer')::text AS customer_name,
            COALESCE(cr.amount, 0)::text AS amount,
            cr.note::text AS note
          FROM ims.customer_receipts cr
          LEFT JOIN ims.customers c ON c.customer_id = cr.customer_id AND c.branch_id = cr.branch_id
         WHERE cr.branch_id = ANY($1)
           AND cr.receipt_date::date = CURRENT_DATE
         ORDER BY cr.receipt_date DESC`,
        [branchIds]
      );
      const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      return { cardId, title: 'Debt Recovered Today', format: 'currency', total, rows };
    }

    if (cardId === 'total-outstanding-debt') {
      if (!canViewCustomers) return { cardId, title: 'Total Outstanding Debt', format: 'currency', total: 0, rows: [] };
      const customerNameCol = await pickFirstColumn('customers', ['full_name', 'name'], 'full_name');
      const phoneCol = await pickFirstColumn('customers', ['phone', 'mobile', 'phone_number'], 'phone');
      const rows = await queryMany<{
        customer_id: number;
        name: string;
        phone: string | null;
        remaining_balance: string;
      }>(
        `SELECT customer_id,
                COALESCE(${customerNameCol}, '')::text AS name,
                NULLIF(${phoneCol}, '')::text AS phone,
                remaining_balance::text
           FROM ims.customers
          WHERE branch_id = ANY($1)
            AND remaining_balance > 0
          ORDER BY remaining_balance DESC
          LIMIT 500`,
        [branchIds]
      );
      const total = rows.reduce((sum, row) => sum + Number(row.remaining_balance || 0), 0);
      return { cardId, title: 'Total Outstanding Debt', format: 'currency', total, rows };
    }

    return { cardId, title: 'Dashboard', total: 0, rows: [] };
  }

  async getDashboardCards(
    branchIds: number[],
    permissions: string[]
  ): Promise<DashboardCard[]> {
    if (!permissions.includes('dashboard.view') && !permissions.includes('home.view')) {
      return [];
    }

    const canViewCustomers = hasPermission(permissions, 'customers.view');
    const canViewSales = permissions.includes('sales.view');
    const canViewExpenses = permissions.includes('expenses.view');
    const canViewPurchases = permissions.includes('purchases.view');

    const [
      todaySalesRow,
      newCustomersTodayRow,
      todayExpensesRow,
      todayPurchasesRow,
      weekSalesRow,
      weekExpensesRow,
      loansGivenTodayRow,
      debtRecoveredTodayRow,
      totalOutstandingDebtRow,
    ] = await Promise.all([
      canViewSales
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(s.total), 0)::text AS total
               FROM ims.sales s
              WHERE s.branch_id = ANY($1)
                AND s.status <> 'void'
                AND s.sale_date::date = CURRENT_DATE
                AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`,
            [branchIds]
          )
        : Promise.resolve(null),
      canViewCustomers
        ? queryOne<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM ims.customers
              WHERE branch_id = ANY($1)
                AND created_at::date = CURRENT_DATE`,
            [branchIds]
          )
        : Promise.resolve(null),
      canViewExpenses
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(ec.amount), 0)::text AS total
               FROM ims.expense_charges ec
              WHERE ec.branch_id = ANY($1)
                AND ec.charge_date::date = CURRENT_DATE`,
            [branchIds]
          )
        : Promise.resolve(null),
      // Today's purchases: received purchases only, excluding void and not-yet-received
      // purchase orders.
      canViewPurchases
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(p.total), 0)::text AS total
               FROM ims.purchases p
              WHERE p.branch_id = ANY($1)
                AND p.status NOT IN ('void', 'order', 'ordered')
                AND p.purchase_date::date = CURRENT_DATE
                AND COALESCE(p.doc_type, 'purchase') = 'purchase'`,
            [branchIds]
          )
        : Promise.resolve(null),
      canViewSales
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(s.total), 0)::text AS total
               FROM ims.sales s
              WHERE s.branch_id = ANY($1)
                AND s.status <> 'void'
                AND s.sale_date >= date_trunc('week', CURRENT_DATE)
                AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`,
            [branchIds]
          )
        : Promise.resolve(null),
      canViewExpenses
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(ec.amount), 0)::text AS total
               FROM ims.expense_charges ec
              WHERE ec.branch_id = ANY($1)
                AND ec.charge_date >= date_trunc('week', CURRENT_DATE)`,
            [branchIds]
          )
        : Promise.resolve(null),
      // Loans given today: credit sales handed out today (money lent to customers to
      // collect later), for tracking day-to-day credit risk.
      canViewSales
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(s.total), 0)::text AS total
               FROM ims.sales s
              WHERE s.branch_id = ANY($1)
                AND s.status <> 'void'
                AND s.sale_date::date = CURRENT_DATE
                AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
                AND LOWER(COALESCE(s.sale_type::text, '')) = 'credit'`,
            [branchIds]
          )
        : Promise.resolve(null),
      // Debt recovered today: standalone collections against outstanding customer
      // balances (Finance > Receipts), not inline payments taken at time of a new sale.
      canViewCustomers
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(cr.amount), 0)::text AS total
               FROM ims.customer_receipts cr
              WHERE cr.branch_id = ANY($1)
                AND cr.receipt_date::date = CURRENT_DATE`,
            [branchIds]
          )
        : Promise.resolve(null),
      // Total outstanding debt: current sum of every customer's live receivable balance,
      // kept in sync with customer_ledger by syncCustomerOutstandingFromLedger.
      canViewCustomers
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(c.remaining_balance), 0)::text AS total
               FROM ims.customers c
              WHERE c.branch_id = ANY($1)`,
            [branchIds]
          )
        : Promise.resolve(null),
    ]);

    const cards: DashboardCard[] = [];

    if (canViewSales) {
      cards.push({
        id: 'today-income',
        title: "Today's Sales",
        value: Number((todaySalesRow as { total: string } | null)?.total || 0),
        subtitle: 'Sales today',
        icon: 'TrendingUp',
        format: 'currency',
      });
    }

    if (canViewCustomers) {
      cards.push({
        id: 'new-customers-today',
        title: 'New Customers Today',
        value: Number(newCustomersTodayRow?.count || 0),
        subtitle: 'Registered today',
        icon: 'Users',
        format: 'number',
      });
    }

    if (canViewExpenses) {
      cards.push({
        id: 'today-expenses',
        title: "Today's Expenses",
        value: Number((todayExpensesRow as { total: string } | null)?.total || 0),
        subtitle: 'Expenses booked today',
        icon: 'ReceiptText',
        format: 'currency',
      });
    }

    if (canViewPurchases) {
      cards.push({
        id: 'today-purchases',
        title: "Today's Purchases",
        value: Number((todayPurchasesRow as { total: string } | null)?.total || 0),
        subtitle: 'Received purchases today',
        icon: 'ShoppingBag',
        format: 'currency',
      });
    }

    if (canViewSales) {
      cards.push({
        id: 'week-sales',
        title: "This Week's Sales",
        value: Number((weekSalesRow as { total: string } | null)?.total || 0),
        subtitle: 'Sales this week',
        icon: 'TrendingUp',
        format: 'currency',
      });
    }

    if (canViewExpenses) {
      cards.push({
        id: 'week-expenses',
        title: "This Week's Expenses",
        value: Number((weekExpensesRow as { total: string } | null)?.total || 0),
        subtitle: 'Expenses booked this week',
        icon: 'ReceiptText',
        format: 'currency',
      });
    }

    if (canViewSales) {
      cards.push({
        id: 'loans-given-today',
        title: 'Loans Given Today',
        value: Number((loansGivenTodayRow as { total: string } | null)?.total || 0),
        subtitle: 'Credit sales handed out today',
        icon: 'HandCoins',
        format: 'currency',
      });
    }

    if (canViewCustomers) {
      cards.push(
        {
          id: 'debt-recovered-today',
          title: 'Debt Recovered Today',
          value: Number((debtRecoveredTodayRow as { total: string } | null)?.total || 0),
          subtitle: 'Collected against customer balances today',
          icon: 'HandHeart',
          format: 'currency',
        },
        {
          id: 'total-outstanding-debt',
          title: 'Total Outstanding Debt',
          value: Number((totalOutstandingDebtRow as { total: string } | null)?.total || 0),
          subtitle: 'Sum of all customer balances owed',
          icon: 'Wallet',
          format: 'currency',
        }
      );
    }

    return cards;
  }

  async getLowStockItems(
    branchIds: number[],
    permissions: string[]
  ): Promise<DashboardLowStockItem[]> {
    if (!hasPermission(permissions, 'stock.view')) {
      return [];
    }

    const alertExpr = await getItemAlertExpression();
    const thresholdExpr = `GREATEST(COALESCE(NULLIF(${alertExpr}, 0), 5), 1)`;

    const rows = await queryMany<{
      item_id: number;
      item_name: string;
      quantity: string;
      stock_alert: string;
    }>(
      `WITH item_stock AS (
         SELECT
           i.item_id,
           i.name AS item_name,
           ${thresholdExpr}::numeric(14,3) AS stock_alert,
           CASE
             WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
             ELSE COALESCE(st.store_qty, 0)
           END::numeric(14,3) AS quantity
         FROM ims.items i
         LEFT JOIN (
           SELECT
             s.branch_id,
             si.product_id AS item_id,
             COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS store_qty,
             COUNT(*)::int AS row_count
           FROM ims.store_items si
           JOIN ims.stores s ON s.store_id = si.store_id
           GROUP BY s.branch_id, si.product_id
         ) st
           ON st.item_id = i.item_id
          AND st.branch_id = i.branch_id
        WHERE i.branch_id = ANY($1)
          AND i.is_active = TRUE
       )
       SELECT
         item_id,
         item_name,
         quantity::text AS quantity,
         stock_alert::text AS stock_alert
       FROM item_stock
       WHERE quantity <= stock_alert
       ORDER BY (stock_alert - quantity) DESC, item_name ASC
       LIMIT 12`,
      [branchIds]
    );

    return rows.map((row) => {
      const quantity = Number(row.quantity || 0);
      const stockAlert = Number(row.stock_alert || 0);
      return {
        item_id: Number(row.item_id),
        item_name: row.item_name,
        quantity,
        stock_alert: stockAlert,
        shortage: Math.max(stockAlert - quantity, 0),
      };
    });
  }

  // Same "Top Selling Products" table the reference dashboard design shows -
  // extends the top-items-30d chart's own query with the fields a real table
  // needs (SKU, category, revenue, stock status) instead of just quantity.
  async getTopSellingProducts(
    branchIds: number[],
    permissions: string[]
  ): Promise<DashboardTopProduct[]> {
    if (!permissions.includes('sales.view')) {
      return [];
    }

    const alertExpr = await getItemAlertExpression();
    const thresholdExpr = `GREATEST(COALESCE(NULLIF(${alertExpr}, 0), 5), 1)`;

    const rows = await queryMany<{
      item_id: number;
      item_name: string;
      barcode: string | null;
      cat_name: string | null;
      quantity_sold: string;
      revenue: string;
      quantity: string;
      stock_alert: string;
    }>(
      `WITH sale_item_map AS (
         SELECT
           si.sale_id,
           COALESCE(
             (to_jsonb(si) ->> 'product_id')::bigint,
             (to_jsonb(si) ->> 'item_id')::bigint
           ) AS item_id,
           COALESCE((to_jsonb(si) ->> 'quantity')::numeric, 0) AS quantity,
           COALESCE((to_jsonb(si) ->> 'line_total')::numeric, 0) AS line_total
         FROM ims.sale_items si
       ),
       stock AS (
         SELECT
           s.branch_id,
           si.product_id AS item_id,
           COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS store_qty,
           COUNT(*)::int AS row_count
         FROM ims.store_items si
         JOIN ims.stores s ON s.store_id = si.store_id
         GROUP BY s.branch_id, si.product_id
       )
       SELECT
         i.item_id,
         i.name AS item_name,
         i.barcode,
         c.cat_name,
         COALESCE(SUM(m.quantity), 0)::double precision AS quantity_sold,
         COALESCE(SUM(m.line_total), 0)::double precision AS revenue,
         CASE
           WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
           ELSE COALESCE(st.store_qty, 0)
         END::numeric(14,3) AS quantity,
         ${thresholdExpr}::numeric(14,3) AS stock_alert
         FROM sale_item_map m
         JOIN ims.sales s ON s.sale_id = m.sale_id
         JOIN ims.items i ON i.item_id = m.item_id
         LEFT JOIN ims.categories c ON c.cat_id = i.category_id
         LEFT JOIN stock st ON st.item_id = i.item_id AND st.branch_id = i.branch_id
        WHERE s.branch_id = ANY($1)
          AND s.status <> 'void'
          AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
          AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY i.item_id, i.name, i.barcode, c.cat_name, st.row_count, st.store_qty, i.opening_balance
       HAVING COALESCE(SUM(m.quantity), 0) > 0
        ORDER BY quantity_sold DESC
        LIMIT 5`,
      [branchIds]
    );

    return rows.map((row) => {
      const quantity = Number(row.quantity || 0);
      const stockAlert = Number(row.stock_alert || 0);
      const stockStatus: DashboardTopProduct['stock_status'] =
        quantity <= 0 ? 'no_stock' : quantity <= stockAlert ? 'low_stock' : 'in_stock';
      return {
        item_id: Number(row.item_id),
        name: row.item_name,
        sku: row.barcode,
        category_name: row.cat_name,
        quantity_sold: Number(row.quantity_sold || 0),
        revenue: Number(row.revenue || 0),
        stock_status: stockStatus,
      };
    });
  }

  // Same "Customer Debt Breakdown" list the reference dashboard design shows
  // - reuses the total-outstanding-debt card's own rows, plus a real (not
  // fabricated) aging bucket derived from how long ago the customer's most
  // recent still-unpaid sale was made.
  async getCustomerDebtList(
    branchIds: number[],
    permissions: string[]
  ): Promise<DashboardDebtRow[]> {
    if (!permissions.includes('customers.view')) {
      return [];
    }

    const nameCol = await pickFirstColumn('customers', ['full_name', 'name'], 'full_name');
    const phoneCol = await pickFirstColumn('customers', ['phone', 'mobile', 'phone_number'], 'phone');

    const rows = await queryMany<{
      customer_id: number;
      name: string;
      phone: string | null;
      balance: string;
      days_since: string | null;
    }>(
      `SELECT
         cu.customer_id,
         COALESCE(${nameCol}, '')::text AS name,
         NULLIF(${phoneCol}, '')::text AS phone,
         cu.remaining_balance::text AS balance,
         (SELECT (CURRENT_DATE - MAX(s.sale_date::date))::int
            FROM ims.sales s
           WHERE s.customer_id = cu.customer_id
             AND s.status IN ('unpaid', 'partial')) AS days_since
       FROM ims.customers cu
      WHERE cu.branch_id = ANY($1)
        AND cu.remaining_balance > 0
      ORDER BY cu.remaining_balance DESC
      LIMIT 6`,
      [branchIds]
    );

    return rows.map((row) => {
      const daysSince = row.days_since === null ? null : Number(row.days_since);
      const aging: DashboardDebtRow['aging'] =
        daysSince === null ? 'current' : daysSince > 45 ? 'overdue' : daysSince > 20 ? 'due_soon' : 'current';
      return {
        customer_id: Number(row.customer_id),
        name: row.name,
        phone: row.phone,
        balance: Number(row.balance || 0),
        aging,
        days_since_last_unpaid_sale: daysSince,
      };
    });
  }

  async getDashboardCharts(
    branchIds: number[],
    permissions: string[]
  ): Promise<DashboardChart[]> {
    const charts: DashboardChart[] = [];

    if (permissions.includes('sales.view')) {
      const rows6m = await queryMany<{ label: string; total: string }>(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
             date_trunc('month', CURRENT_DATE),
             INTERVAL '1 month'
           ) AS month_start
         ),
         sales AS (
           SELECT date_trunc('month', s.sale_date) AS month_start,
                  COALESCE(SUM(s.total), 0) AS total
             FROM ims.sales s
            WHERE s.branch_id = ANY($1)
              AND s.status <> 'void'
              AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
            GROUP BY date_trunc('month', s.sale_date)
         )
         SELECT to_char(m.month_start, 'YYYY-MM') AS label,
                COALESCE(s.total, 0)::text AS total
           FROM months m
           LEFT JOIN sales s ON s.month_start = m.month_start
          ORDER BY m.month_start`,
        [branchIds]
      );

      const labels6m = rows6m.map((row) => row.label);
      const data6m = rows6m.map((row) => Number(row.total || 0));

      charts.push({
        id: 'sales-6m',
        name: 'Sales (Last 6 Months)',
        type: 'bar',
        labels: labels6m,
        series: [{ name: 'Sales', data: data6m }],
      });

      const rows12m = await queryMany<{ label: string; income: string }>(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
             date_trunc('month', CURRENT_DATE),
             INTERVAL '1 month'
           ) AS month_start
         ),
         sales AS (
           SELECT date_trunc('month', s.sale_date) AS month_start,
                  COALESCE(SUM(s.total), 0) AS income
             FROM ims.sales s
            WHERE s.branch_id = ANY($1)
              AND s.status <> 'void'
              AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
            GROUP BY date_trunc('month', s.sale_date)
         )
         SELECT to_char(m.month_start, 'YYYY-MM') AS label,
                COALESCE(s.income, 0)::text AS income
           FROM months m
           LEFT JOIN sales s ON s.month_start = m.month_start
          ORDER BY m.month_start`,
        [branchIds]
      );

      const labels12m = rows12m.map((row) => row.label);
      const income12m = rows12m.map((row) => Number(row.income || 0));

      charts.push({
        id: 'income-trend-12m',
        name: 'Income Trend (12 Months)',
        type: 'line',
        labels: labels12m,
        series: [{ name: 'Income', data: income12m }],
      });

      const topItemRows = await queryMany<{ item_name: string; quantity_sold: string }>(
        `WITH sale_item_map AS (
           SELECT
             si.sale_id,
             COALESCE(
               (to_jsonb(si) ->> 'product_id')::bigint,
               (to_jsonb(si) ->> 'item_id')::bigint
             ) AS item_id,
             COALESCE((to_jsonb(si) ->> 'quantity')::numeric, 0) AS quantity
           FROM ims.sale_items si
         )
         SELECT i.name AS item_name,
                COALESCE(SUM(m.quantity), 0)::double precision AS quantity_sold
           FROM sale_item_map m
           JOIN ims.sales s ON s.sale_id = m.sale_id
           JOIN ims.items i ON i.item_id = m.item_id
          WHERE s.branch_id = ANY($1)
            AND s.status <> 'void'
            AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
            AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY i.item_id, i.name
         HAVING COALESCE(SUM(m.quantity), 0) > 0
          ORDER BY quantity_sold DESC
          LIMIT 5`,
        [branchIds]
      );

      if (topItemRows.length) {
        charts.push({
          id: 'top-items-30d',
          name: 'Top Selling Items (Last 30 Days)',
          type: 'bar',
          labels: topItemRows.map((row) => row.item_name),
          series: [{ name: 'Quantity Sold', data: topItemRows.map((row) => Number(row.quantity_sold || 0)) }],
        });
      }
    }

    if (permissions.includes('customers.view')) {
      const nameCol = await pickFirstColumn('customers', ['full_name', 'name'], 'full_name');
      const topDebtRows = await queryMany<{ name: string; balance: string }>(
        `SELECT COALESCE(${nameCol}, '')::text AS name, remaining_balance::double precision AS balance
           FROM ims.customers
          WHERE branch_id = ANY($1)
            AND remaining_balance > 0
          ORDER BY remaining_balance DESC
          LIMIT 5`,
        [branchIds]
      );
      const totalDebtRow = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(remaining_balance), 0)::double precision AS total
           FROM ims.customers
          WHERE branch_id = ANY($1)
            AND remaining_balance > 0`,
        [branchIds]
      );

      if (topDebtRows.length) {
        const topSum = topDebtRows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
        const grandTotal = Number(totalDebtRow?.total || 0);
        const othersBalance = Math.max(0, grandTotal - topSum);

        const labels = topDebtRows.map((row) => row.name || 'Customer');
        const values = topDebtRows.map((row) => Number(row.balance || 0));
        if (othersBalance > 0) {
          labels.push('Other Customers');
          values.push(othersBalance);
        }

        charts.push({
          id: 'customer-debt-breakdown',
          name: 'Customer Debt Breakdown',
          type: 'donut',
          labels,
          series: [{ name: 'Outstanding Balance', data: values }],
        });
      }
    }

    return charts;
  }

  async getRecentActivity(
    branchIds: number[],
    permissions: string[]
  ): Promise<DashboardRecentRow[]> {
    const rows: DashboardRecentRow[] = [];

    if (permissions.includes('sales.view')) {
      const sales = await queryMany<{
        sale_id: number;
        total: string;
        sale_date: string;
        status: string;
      }>(
        `SELECT s.sale_id, s.total::text, s.sale_date::text, s.status::text
           FROM ims.sales s
          WHERE s.branch_id = ANY($1)
            AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
          ORDER BY s.sale_date DESC
          LIMIT 5`,
        [branchIds]
      );

      sales.forEach((sale) => {
        rows.push({
          id: `sale-${sale.sale_id}`,
          type: 'sale',
          ref: `SAL-${sale.sale_id}`,
          amount: Number(sale.total || 0),
          date: sale.sale_date,
          status: sale.status,
        });
      });
    }

    if (permissions.includes('purchases.view')) {
      const purchases = await queryMany<{
        purchase_id: number;
        total: string;
        purchase_date: string;
        status: string;
      }>(
        `SELECT purchase_id, total::text, purchase_date::text, status::text
           FROM ims.purchases
          WHERE branch_id = ANY($1)
          ORDER BY purchase_date DESC
          LIMIT 5`,
        [branchIds]
      );

      purchases.forEach((purchase) => {
        rows.push({
          id: `purchase-${purchase.purchase_id}`,
          type: 'purchase',
          ref: `PUR-${purchase.purchase_id}`,
          amount: Number(purchase.total || 0),
          date: purchase.purchase_date,
          status: purchase.status,
        });
      });
    }

    return rows
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }
}

export const dashboardService = new DashboardService();
