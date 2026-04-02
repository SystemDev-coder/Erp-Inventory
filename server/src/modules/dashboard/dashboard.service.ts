import { queryMany, queryOne } from '../../db/query';
import {
  DashboardCard,
  DashboardChart,
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
      balanceRow,
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
      canViewAccounts
        ? queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(balance), 0)::text AS total
               FROM ims.accounts
              WHERE branch_id = $1
                AND is_active = TRUE`,
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

    if (canViewAccounts) {
      cards.push({
        id: 'balance',
        title: 'Balance',
        value: Number((balanceRow as { total: string } | null)?.total || 0),
        subtitle: 'Current account balances',
        icon: 'Wallet',
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
