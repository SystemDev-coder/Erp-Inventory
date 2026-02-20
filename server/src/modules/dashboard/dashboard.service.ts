import { queryMany, queryOne } from '../../db/query';
import {
  DashboardCard,
  DashboardChart,
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
  if (key.startsWith('items.')) {
    return permissions.includes(key.replace('items.', 'products.'));
  }
  if (key.startsWith('products.')) {
    return permissions.includes(key.replace('products.', 'items.'));
  }
  return false;
};

export class DashboardService {
  getDashboardWidgets(permissions: string[]): DashboardWidget[] {
    return ALL_WIDGETS.filter((widget) => hasPermission(permissions, widget.permission));
  }

  async getDashboardCards(
    branchId: number,
    permissions: string[]
  ): Promise<DashboardCard[]> {
    if (!permissions.includes('dashboard.view')) {
      return [];
    }

    const runLowStockCount = async (): Promise<{ count: string } | null> => {
      return queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM (
             SELECT i.item_id
               FROM ims.items i
               LEFT JOIN ims.store_items si
                 ON si.product_id = i.item_id
               LEFT JOIN ims.stores st
                 ON st.store_id = si.store_id
              WHERE i.branch_id = $1
                AND st.branch_id = i.branch_id
                AND i.is_active = TRUE
              GROUP BY i.item_id, i.stock_alert
             HAVING COALESCE(SUM(si.quantity), 0) <= COALESCE(i.stock_alert, 0)
           ) AS x`,
        [branchId]
      );
    };

    const runInventoryStock = async (): Promise<{ total: string } | null> => {
      return queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(si.quantity), 0)::text AS total
           FROM ims.store_items si
           JOIN ims.stores st ON st.store_id = si.store_id
          WHERE st.branch_id = $1`,
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
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM ims.customers
          WHERE branch_id = $1`,
        [branchId]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM ims.employees
          WHERE branch_id = $1
            AND status = 'active'`,
        [branchId]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM ims.items
          WHERE branch_id = $1
            AND is_active = TRUE`,
        [branchId]
      ),
      queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(total), 0)::text AS total
           FROM ims.sales
          WHERE branch_id = $1
            AND status <> 'void'
            AND sale_date::date = CURRENT_DATE`,
        [branchId]
      ),
      queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(total), 0)::text AS total
           FROM ims.sales
          WHERE branch_id = $1
            AND status <> 'void'
            AND sale_date >= date_trunc('month', CURRENT_DATE)`,
        [branchId]
      ),
      queryOne<{ total: string }>(
        `SELECT (
            COALESCE((SELECT SUM(ep.amount_paid) FROM ims.expense_payments ep WHERE ep.branch_id = $1 AND ep.pay_date::date = CURRENT_DATE), 0)
            +
            COALESCE((SELECT SUM(emp.amount_paid) FROM ims.employee_payments emp WHERE emp.branch_id = $1 AND emp.pay_date::date = CURRENT_DATE), 0)
          )::text AS total`,
        [branchId]
      ),
      queryOne<{ total: string }>(
        `SELECT (
            COALESCE((SELECT SUM(ep.amount_paid) FROM ims.expense_payments ep WHERE ep.branch_id = $1 AND ep.pay_date >= date_trunc('month', CURRENT_DATE)), 0)
            +
            COALESCE((SELECT SUM(emp.amount_paid) FROM ims.employee_payments emp WHERE emp.branch_id = $1 AND emp.pay_date >= date_trunc('month', CURRENT_DATE)), 0)
          )::text AS total`,
        [branchId]
      ),
      queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(balance), 0)::text AS total
           FROM ims.accounts
          WHERE branch_id = $1
            AND is_active = TRUE`,
        [branchId]
      ),
    ]);

    const inventoryStockRow = await runInventoryStock();
    const lowStockRow = await runLowStockCount();

    return [
      {
        id: 'total-customers',
        title: 'Total Customers',
        value: Number(totalCustomersRow?.count || 0),
        subtitle: 'Registered customers',
        icon: 'Users',
        format: 'number',
      },
      {
        id: 'total-employees',
        title: 'Total Employees',
        value: Number(totalEmployeesRow?.count || 0),
        subtitle: 'Active employees',
        icon: 'BriefcaseBusiness',
        format: 'number',
      },
      {
        id: 'total-products',
        title: 'Total Products',
        value: Number(totalProductsRow?.count || 0),
        subtitle: 'Active products',
        icon: 'Package',
        format: 'number',
      },
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
      },
      {
        id: 'today-income',
        title: 'Today Income',
        value: Number(todayIncomeRow?.total || 0),
        subtitle: 'Sales today',
        icon: 'TrendingUp',
        format: 'currency',
      },
      {
        id: 'monthly-income',
        title: 'Monthly Income',
        value: Number(monthlyIncomeRow?.total || 0),
        subtitle: 'Sales this month',
        icon: 'TrendingUp',
        format: 'currency',
      },
      {
        id: 'today-payment',
        title: 'Today Payment',
        value: Number(todayPaymentsRow?.total || 0),
        subtitle: 'Expenses + salary',
        icon: 'ReceiptText',
        format: 'currency',
      },
      {
        id: 'monthly-payment',
        title: 'Monthly Payment',
        value: Number(monthlyPaymentsRow?.total || 0),
        subtitle: 'Expenses + salary this month',
        icon: 'ReceiptText',
        format: 'currency',
      },
      {
        id: 'balance',
        title: 'Balance',
        value: Number(balanceRow?.total || 0),
        subtitle: 'Current account balances',
        icon: 'Wallet',
        format: 'currency',
      },
    ];
  }

  async getDashboardCharts(
    branchId: number,
    permissions: string[]
  ): Promise<DashboardChart[]> {
    const charts: DashboardChart[] = [];

    if (permissions.includes('sales.view')) {
      const rows = await queryMany<{ label: string; total: string }>(
        `SELECT to_char(date_trunc('month', sale_date), 'YYYY-MM') AS label,
                COALESCE(SUM(total), 0)::text AS total
           FROM ims.sales
          WHERE branch_id = $1
            AND status <> 'void'
            AND sale_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
          GROUP BY date_trunc('month', sale_date)
          ORDER BY date_trunc('month', sale_date)`,
        [branchId]
      );

      const labels = rows.map((row) => row.label);
      const data = rows.map((row) => Number(row.total || 0));

      charts.push({
        id: 'sales-6m',
        name: 'Sales (Last 6 Months)',
        type: 'bar',
        labels,
        series: [{ name: 'Sales', data }],
      });
    }

    if (permissions.includes('stock.view')) {
      const rows = await queryMany<{ label: string; qty: string }>(
        `SELECT to_char(date_trunc('day', move_date), 'YYYY-MM-DD') AS label,
                COALESCE(SUM(qty_in - qty_out), 0)::text AS qty
           FROM ims.inventory_movements
          WHERE branch_id = $1
            AND move_date >= CURRENT_DATE - INTERVAL '13 days'
          GROUP BY date_trunc('day', move_date)
          ORDER BY date_trunc('day', move_date)`,
        [branchId]
      );

      const labels = rows.map((row) => row.label);
      const data = rows.map((row) => Number(row.qty || 0));

      charts.push({
        id: 'stock-14d',
        name: 'Stock Movement (14 days)',
        type: 'line',
        labels,
        series: [{ name: 'Units', data }],
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
        `SELECT sale_id, total::text, sale_date::text, status::text
           FROM ims.sales
          WHERE branch_id = $1
          ORDER BY sale_date DESC
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
