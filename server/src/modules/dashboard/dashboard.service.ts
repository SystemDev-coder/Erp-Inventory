import { queryMany, queryOne } from '../../db/query';
import {
  DashboardCard,
  DashboardChart,
  DashboardCardDrilldown,
  DashboardLowStockItem,
  DashboardRecentRow,
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
    branchId: number,
    permissions: string[],
    cardId: string
  ): Promise<DashboardCardDrilldown> {
    if (!permissions.includes('dashboard.view') && !permissions.includes('home.view')) {
      return { cardId, title: 'Dashboard', total: 0, rows: [] };
    }

    const canViewCustomers = hasPermission(permissions, 'customers.view');
    const canViewEmployees = hasPermission(permissions, 'employees.view') || permissions.includes('users.view');
    const canViewProducts = hasPermission(permissions, 'items.view') || hasPermission(permissions, 'products.view');
    const canViewStock = hasPermission(permissions, 'stock.view');
    const canViewSales = permissions.includes('sales.view');
    const canViewExpenses = permissions.includes('expenses.view');
    const canViewAccounts = permissions.includes('accounts.view');
    const canViewPayments = canViewAccounts || canViewExpenses;

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
          WHERE branch_id = $1
          ORDER BY customer_id DESC
          LIMIT 500`,
        [branchId]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM ims.customers
          WHERE branch_id = $1`,
        [branchId]
      );
      return { cardId, title: 'Total Customers', format: 'number', total: Number(totalRow?.total || 0), rows };
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
          WHERE branch_id = $1
            AND status = 'active'
          ORDER BY ${idCol} DESC
          LIMIT 500`,
        [branchId]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM ims.employees
          WHERE branch_id = $1
            AND status = 'active'`,
        [branchId]
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
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY item_id DESC
          LIMIT 500`,
        [branchId]
      );
      const totalRow = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM ims.items
          WHERE branch_id = $1
            AND is_active = TRUE`,
        [branchId]
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
          WHERE i.branch_id = $1
            AND i.is_active = TRUE
         )
         SELECT item_id,
                COALESCE(item_name, '')::text AS item_name,
                stock_alert::text,
                quantity::text
           FROM item_stock
          ${cardId === 'low-stock-alert' ? 'WHERE quantity <= stock_alert' : ''}
          ORDER BY item_name`,
        [branchId]
      );

      const total = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      const totalCount = rows.length;
      if (cardId === 'low-stock-alert') {
        return { cardId, title: 'Low Stock Alert', format: 'number', total: totalCount, rows };
      }
      return { cardId, title: 'Inventory Stock', format: 'number', total, rows };
    }

    if (cardId === 'today-income' || cardId === 'monthly-income' || cardId === 'total-revenue') {
      if (!canViewSales) return { cardId, title: 'Income', format: 'currency', total: 0, rows: [] };
      const predicate =
        cardId === 'today-income'
          ? `s.sale_date::date = CURRENT_DATE`
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
             WHERE s.branch_id = $1
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
             WHERE sr.branch_id = $1
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
             WHERE s.branch_id = $1
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
      }>(salesSql, [branchId]);
      const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
      return {
        cardId,
        title:
          cardId === 'today-income'
            ? 'Today Income'
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
         WHERE ep.branch_id = $1
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
         WHERE emp.branch_id = $1
           AND ${datePredicate.replace(/p\./g, 'emp.')}
         ORDER BY pay_date DESC`,
        [branchId]
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

    return { cardId, title: 'Dashboard', total: 0, rows: [] };
  }

  async getDashboardCards(
    branchId: number,
    permissions: string[]
  ): Promise<DashboardCard[]> {
    if (!permissions.includes('dashboard.view') && !permissions.includes('home.view')) {
      return [];
    }

    const canViewCustomers = hasPermission(permissions, 'customers.view');
    const canViewEmployees = hasPermission(permissions, 'employees.view') || permissions.includes('users.view');
    const canViewProducts = hasPermission(permissions, 'items.view') || hasPermission(permissions, 'products.view');
    const canViewStock = hasPermission(permissions, 'stock.view');
    const canViewSales = permissions.includes('sales.view');
    const canViewExpenses = permissions.includes('expenses.view');
    const canViewAccounts = permissions.includes('accounts.view');
    const canViewPayments = canViewAccounts || canViewExpenses;

    const runLowStockCount = async (): Promise<{ count: string } | null> => {
      const alertExpr = await getItemAlertExpression();
      const thresholdExpr = `GREATEST(COALESCE(NULLIF(${alertExpr}, 0), 5), 1)`;
      return queryOne<{ count: string }>(
        `WITH item_stock AS (
           SELECT
             i.item_id,
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
          WHERE i.branch_id = $1
            AND i.is_active = TRUE
         )
         SELECT COUNT(*)::text AS count
           FROM item_stock
          WHERE quantity <= stock_alert`,
        [branchId]
      );
    };

    const runInventoryStock = async (): Promise<{ total: string } | null> => {
      return queryOne<{ total: string }>(
        `WITH item_stock AS (
           SELECT
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
          WHERE i.branch_id = $1
            AND i.is_active = TRUE
         )
         SELECT COALESCE(SUM(quantity), 0)::text AS total
           FROM item_stock`,
        [branchId]
      );
    };

    const [
      totalCustomersRow,
      totalEmployeesRow,
      totalProductsRow,
      todayIncomeRow,
      monthlyIncomeRow,
      todayPaymentsRow,
      monthlyPaymentsRow,
      totalRevenueRow,
    ] = await Promise.all([
      canViewCustomers
        ? queryOne<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM ims.customers
              WHERE branch_id = $1`,
            [branchId]
          )
        : Promise.resolve(null),
      canViewEmployees
        ? queryOne<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM ims.employees
              WHERE branch_id = $1
                AND status = 'active'`,
            [branchId]
          )
        : Promise.resolve(null),
      canViewProducts
        ? queryOne<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM ims.items
              WHERE branch_id = $1
                AND is_active = TRUE`,
            [branchId]
          )
        : Promise.resolve(null),
      canViewSales
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(s.total), 0)::text AS total
               FROM ims.sales s
              WHERE s.branch_id = $1
                AND s.status <> 'void'
                AND s.sale_date::date = CURRENT_DATE
                AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`,
            [branchId]
          )
        : Promise.resolve(null),
      canViewSales
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(s.total), 0)::text AS total
               FROM ims.sales s
              WHERE s.branch_id = $1
                AND s.status <> 'void'
                AND s.sale_date >= date_trunc('month', CURRENT_DATE)
                AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`,
            [branchId]
          )
        : Promise.resolve(null),
      canViewPayments
        ? queryOne<{ total: string }>(
            `SELECT (
                COALESCE((SELECT SUM(ep.amount_paid) FROM ims.expense_payments ep WHERE ep.branch_id = $1 AND ep.pay_date::date = CURRENT_DATE), 0)
                +
                COALESCE((SELECT SUM(emp.amount_paid) FROM ims.employee_payments emp WHERE emp.branch_id = $1 AND emp.pay_date::date = CURRENT_DATE), 0)
              )::text AS total`,
            [branchId]
          )
        : Promise.resolve(null),
      canViewPayments
        ? queryOne<{ total: string }>(
            `SELECT (
                COALESCE((SELECT SUM(ep.amount_paid) FROM ims.expense_payments ep WHERE ep.branch_id = $1 AND ep.pay_date >= date_trunc('month', CURRENT_DATE)), 0)
                +
                COALESCE((SELECT SUM(emp.amount_paid) FROM ims.employee_payments emp WHERE emp.branch_id = $1 AND emp.pay_date >= date_trunc('month', CURRENT_DATE)), 0)
              )::text AS total`,
            [branchId]
          )
        : Promise.resolve(null),
      canViewSales
        ? queryOne<{ total: string }>(
            `SELECT (
                COALESCE((SELECT SUM(s.total) FROM ims.sales s
                          WHERE s.branch_id = $1
                            AND s.status <> 'void'
                            AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'), 0)
                -
                COALESCE((SELECT SUM(sr.total) FROM ims.sales_returns sr
                          WHERE sr.branch_id = $1), 0)
              )::text AS total`,
            [branchId]
          )
        : Promise.resolve(null),
    ]);

    const [inventoryStockRow, lowStockRow] = await Promise.all([
      canViewStock ? runInventoryStock() : Promise.resolve(null),
      canViewStock ? runLowStockCount() : Promise.resolve(null),
    ]);

    const cards: DashboardCard[] = [];

    if (canViewCustomers) {
      cards.push({
        id: 'total-customers',
        title: 'Total Customers',
        value: Number(totalCustomersRow?.count || 0),
        subtitle: 'Registered customers',
        icon: 'Users',
        format: 'number',
      });
    }

    if (canViewEmployees) {
      cards.push({
        id: 'total-employees',
        title: 'Total Employees',
        value: Number(totalEmployeesRow?.count || 0),
        subtitle: 'Active employees',
        icon: 'BriefcaseBusiness',
        format: 'number',
      });
    }

    if (canViewProducts) {
      cards.push({
        id: 'total-products',
        title: 'Total Products',
        value: Number(totalProductsRow?.count || 0),
        subtitle: 'Active products',
        icon: 'Package',
        format: 'number',
      });
    }

    if (canViewStock) {
      cards.push(
        {
          id: 'inventory-stock',
          title: 'Inventory Stock',
          value: Number((inventoryStockRow as { total: string } | null)?.total || 0),
          subtitle: 'Units in stock',
          icon: 'Boxes',
          format: 'number',
        },
        {
          id: 'low-stock-alert',
          title: 'Low Stock Alert',
          value: Number((lowStockRow as { count: string } | null)?.count || 0),
          subtitle: 'Items below reorder level',
          icon: 'AlertTriangle',
          format: 'number',
        }
      );
    }

    if (canViewSales) {
      cards.push(
        {
          id: 'today-income',
          title: 'Today Income',
          value: Number((todayIncomeRow as { total: string } | null)?.total || 0),
          subtitle: 'Sales today',
          icon: 'TrendingUp',
          format: 'currency',
        },
        {
          id: 'monthly-income',
          title: 'Monthly Income',
          value: Number((monthlyIncomeRow as { total: string } | null)?.total || 0),
          subtitle: 'Sales this month',
          icon: 'TrendingUp',
          format: 'currency',
        }
      );
    }

    if (canViewPayments) {
      cards.push(
        {
          id: 'today-payment',
          title: 'Today Payment',
          value: Number((todayPaymentsRow as { total: string } | null)?.total || 0),
          subtitle: 'Expenses + salary',
          icon: 'ReceiptText',
          format: 'currency',
        },
        {
          id: 'monthly-payment',
          title: 'Monthly Payment',
          value: Number((monthlyPaymentsRow as { total: string } | null)?.total || 0),
          subtitle: 'Expenses + salary this month',
          icon: 'ReceiptText',
          format: 'currency',
        }
      );
    }

    if (canViewSales) {
      cards.push({
        id: 'total-revenue',
        title: 'Total Revenue',
        value: Number((totalRevenueRow as { total: string } | null)?.total || 0),
        subtitle: 'All sales (calculated from transactions)',
        icon: 'TrendingUp',
        format: 'currency',
      });
    }

    return cards;
  }

  async getLowStockItems(
    branchId: number,
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
        WHERE i.branch_id = $1
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
      [branchId]
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

  async getDashboardCharts(
    branchId: number,
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
            WHERE s.branch_id = $1
              AND s.status <> 'void'
              AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
            GROUP BY date_trunc('month', s.sale_date)
         )
         SELECT to_char(m.month_start, 'YYYY-MM') AS label,
                COALESCE(s.total, 0)::text AS total
           FROM months m
           LEFT JOIN sales s ON s.month_start = m.month_start
          ORDER BY m.month_start`,
        [branchId]
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
            WHERE s.branch_id = $1
              AND s.status <> 'void'
              AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
            GROUP BY date_trunc('month', s.sale_date)
         )
         SELECT to_char(m.month_start, 'YYYY-MM') AS label,
                COALESCE(s.income, 0)::text AS income
           FROM months m
           LEFT JOIN sales s ON s.month_start = m.month_start
          ORDER BY m.month_start`,
        [branchId]
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
    }

    return charts;
  }

  async getRecentActivity(
    branchId: number,
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
          WHERE s.branch_id = $1
            AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
          ORDER BY s.sale_date DESC
          LIMIT 5`,
        [branchId]
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
          WHERE branch_id = $1
          ORDER BY purchase_date DESC
          LIMIT 5`,
        [branchId]
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
