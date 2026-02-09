import { DashboardWidget, DashboardCard, DashboardChart, DashboardRecentRow } from './dashboard.types';
import { queryMany, queryOne } from '../../db/query';

const ALL_WIDGETS: DashboardWidget[] = [
  {
    id: 'overview',
    name: 'Overview',
    permission: 'home.view',
    description: 'Core dashboard overview',
  },
  {
    id: 'sales_summary',
    name: 'Sales Summary',
    permission: 'sales.view',
    description: 'Sales totals and recent transactions',
  },
  {
    id: 'stock_alerts',
    name: 'Stock Alerts',
    permission: 'stock.view',
    description: 'Low stock and reorder alerts',
  },
  {
    id: 'purchases_status',
    name: 'Purchases Status',
    permission: 'purchases.view',
    description: 'Purchase order status and activity',
  },
  {
    id: 'finance_overview',
    name: 'Finance Overview',
    permission: 'finance.view',
    description: 'Payments, expenses, and cash flow',
  },
  {
    id: 'customers_overview',
    name: 'Customers Overview',
    permission: 'customers.view',
    description: 'Customer activity and totals',
  },
  {
    id: 'employees_overview',
    name: 'Employees Overview',
    permission: 'employees.view',
    description: 'Employee metrics and shifts',
  },
  {
    id: 'system_health',
    name: 'System Health',
    permission: 'system.users',
    description: 'System access and audit summary',
  },
];

export class DashboardService {
  /**
   * Build dashboard widgets based on permissions
   */
  getDashboardWidgets(permissions: string[]): DashboardWidget[] {
    const permSet = new Set(permissions);
    return ALL_WIDGETS.filter((widget) => permSet.has(widget.permission));
  }

  /**
   * Build cards from database metrics
   */
  async getDashboardCards(branchId: number, permissions: string[]): Promise<DashboardCard[]> {
    const permSet = new Set(permissions);
    const cards: DashboardCard[] = [];

    if (permSet.has('sales.view')) {
      const todaySales = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(total), 0) AS total
         FROM ims.sales
         WHERE branch_id = $1
           AND status <> 'void'
           AND sale_date::date = CURRENT_DATE`,
        [branchId]
      );
      cards.push({
        id: 'today-sales',
        title: "Today's Sales",
        value: Number(todaySales?.total || 0),
        subtitle: 'Sales collected today',
        icon: 'TrendingUp',
        format: 'currency',
      });
    }

    if (permSet.has('purchases.view')) {
      const monthPurchases = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(total), 0) AS total
         FROM ims.purchases
         WHERE branch_id = $1
           AND status <> 'void'
           AND date_trunc('month', purchase_date) = date_trunc('month', CURRENT_DATE)`,
        [branchId]
      );
      cards.push({
        id: 'month-purchases',
        title: 'Monthly Purchases',
        value: Number(monthPurchases?.total || 0),
        subtitle: 'Purchases this month',
        icon: 'ReceiptText',
        format: 'currency',
      });
    }

    if (permSet.has('products.view')) {
      const products = await queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM ims.products
         WHERE is_active = TRUE`
      );
      cards.push({
        id: 'active-products',
        title: 'Active Products',
        value: Number(products?.count || 0),
        subtitle: 'Products available',
        icon: 'Package',
        format: 'number',
      });
    }

    if (permSet.has('stock.view')) {
      const lowStock = await queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM ims.branch_stock bs
         JOIN ims.products p ON p.product_id = bs.product_id
         WHERE bs.branch_id = $1
           AND p.is_active = TRUE
           AND bs.quantity <= p.reorder_level`,
        [branchId]
      );
      cards.push({
        id: 'low-stock',
        title: 'Low Stock Alerts',
        value: Number(lowStock?.count || 0),
        subtitle: 'Needs reorder soon',
        icon: 'AlertTriangle',
        format: 'number',
      });
    }

    return cards;
  }

  /**
   * Build charts from database metrics
   */
  async getDashboardCharts(branchId: number, permissions: string[]): Promise<DashboardChart[]> {
    const permSet = new Set(permissions);
    const charts: DashboardChart[] = [];

    if (permSet.has('sales.view')) {
      const rows = await queryMany<{ label: string; month: string; total: number }>(
        `SELECT to_char(date_trunc('month', sale_date), 'Mon') AS label,
                date_trunc('month', sale_date) AS month,
                COALESCE(SUM(total), 0) AS total
         FROM ims.sales
         WHERE branch_id = $1
           AND status <> 'void'
           AND sale_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
         GROUP BY 1, 2
         ORDER BY 2`,
        [branchId]
      );

      const labels: string[] = [];
      const data: number[] = [];
      for (let i = 11; i >= 0; i -= 1) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const label = date.toLocaleString('en-US', { month: 'short' });
        labels.push(label);
        const row = rows.find((r) => r.label === label);
        data.push(Number(row?.total || 0));
      }

      charts.push({
        id: 'sales-12m',
        name: 'Sales (Last 12 Months)',
        type: 'bar',
        labels,
        series: [{ name: 'Sales', data }],
      });
    }

    if (permSet.has('stock.view')) {
      const rows = await queryMany<{ day: string; qty: number }>(
        `SELECT to_char(date_trunc('day', move_date), 'DD Mon') AS day,
                COALESCE(SUM(qty_in - qty_out), 0) AS qty
         FROM ims.inventory_movements
         WHERE branch_id = $1
           AND move_date >= NOW() - INTERVAL '14 days'
         GROUP BY 1, date_trunc('day', move_date)
         ORDER BY date_trunc('day', move_date)`,
        [branchId]
      );

      const labels: string[] = [];
      const data: number[] = [];
      for (let i = 13; i >= 0; i -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const label = date.toLocaleString('en-US', { day: '2-digit', month: 'short' });
        labels.push(label);
        const row = rows.find((r) => r.day === label);
        data.push(Number(row?.qty || 0));
      }

      charts.push({
        id: 'stock-14d',
        name: 'Stock Movement (14 days)',
        type: 'line',
        labels,
        series: [{ name: 'Units', data }],
      });
    }

    return charts.slice(0, 2);
  }

  /**
   * Build recent activity table from database
   */
  async getRecentActivity(branchId: number, permissions: string[]): Promise<DashboardRecentRow[]> {
    const permSet = new Set(permissions);
    const rows: DashboardRecentRow[] = [];

    if (permSet.has('sales.view')) {
      const sales = await queryMany<{
        sale_id: number;
        total: number;
        sale_date: string;
        status: string;
      }>(
        `SELECT sale_id, total, sale_date, status
         FROM ims.sales
         WHERE branch_id = $1
         ORDER BY sale_date DESC
         LIMIT 5`,
        [branchId]
      );
      sales.forEach((s) => {
        rows.push({
          id: `sale-${s.sale_id}`,
          type: 'Sale',
          ref: `S-${s.sale_id}`,
          amount: Number(s.total || 0),
          date: s.sale_date,
          status: s.status,
        });
      });
    }

    if (permSet.has('purchases.view')) {
      const purchases = await queryMany<{
        purchase_id: number;
        total: number;
        purchase_date: string;
        status: string;
      }>(
        `SELECT purchase_id, total, purchase_date, status
         FROM ims.purchases
         WHERE branch_id = $1
         ORDER BY purchase_date DESC
         LIMIT 5`,
        [branchId]
      );
      purchases.forEach((p) => {
        rows.push({
          id: `purchase-${p.purchase_id}`,
          type: 'Purchase',
          ref: `P-${p.purchase_id}`,
          amount: Number(p.total || 0),
          date: p.purchase_date,
          status: p.status,
        });
      });
    }

    if (permSet.has('stock.adjust')) {
      const adjustments = await queryMany<{
        adj_id: number;
        adj_date: string;
        amount: number;
      }>(
        `SELECT a.adj_id,
                a.adj_date,
                COALESCE(SUM(ai.qty_change * ai.unit_cost), 0) AS amount
         FROM ims.stock_adjustments a
         LEFT JOIN ims.stock_adjustment_items ai ON ai.adj_id = a.adj_id
         WHERE a.branch_id = $1
         GROUP BY a.adj_id, a.adj_date
         ORDER BY a.adj_date DESC
         LIMIT 5`,
        [branchId]
      );
      adjustments.forEach((a) => {
        rows.push({
          id: `adjust-${a.adj_id}`,
          type: 'Adjustment',
          ref: `ADJ-${a.adj_id}`,
          amount: Number(a.amount || 0),
          date: a.adj_date,
          status: 'posted',
        });
      });
    }

    return rows
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }
}

export const dashboardService = new DashboardService();
