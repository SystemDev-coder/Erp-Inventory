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

type WarehouseStockShape = {
  itemColumn: 'item_id' | 'product_id';
  hasBranchId: boolean;
};

let warehouseStockShapeCache: WarehouseStockShape | null = null;

const alternateItemColumn = (
  itemColumn: WarehouseStockShape['itemColumn']
): WarehouseStockShape['itemColumn'] => (itemColumn === 'item_id' ? 'product_id' : 'item_id');

const buildWarehouseShapeCandidates = (
  detected: WarehouseStockShape
): WarehouseStockShape[] => {
  const candidates: WarehouseStockShape[] = [
    detected,
    { ...detected, hasBranchId: !detected.hasBranchId },
    { ...detected, itemColumn: alternateItemColumn(detected.itemColumn) },
    {
      itemColumn: alternateItemColumn(detected.itemColumn),
      hasBranchId: !detected.hasBranchId,
    },
  ];

  const seen = new Set<string>();
  return candidates.filter((shape) => {
    const key = `${shape.itemColumn}-${shape.hasBranchId ? 'b1' : 'b0'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

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

const detectWarehouseStockShape = async (): Promise<WarehouseStockShape> => {
  if (warehouseStockShapeCache) return warehouseStockShapeCache;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'warehouse_stock'`
  );
  const names = new Set(columns.map((row) => row.column_name));

  warehouseStockShapeCache = {
    itemColumn: names.has('item_id') ? 'item_id' : 'product_id',
    hasBranchId: names.has('branch_id'),
  };

  return warehouseStockShapeCache;
};

export class DashboardService {
  getDashboardWidgets(permissions: string[]): DashboardWidget[] {
    return ALL_WIDGETS.filter((widget) => hasPermission(permissions, widget.permission));
  }

  async getDashboardCards(
    branchId: number,
    permissions: string[]
  ): Promise<DashboardCard[]> {
    const cards: DashboardCard[] = [];

    if (permissions.includes('sales.view')) {
      const row = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(total), 0)::text AS total
           FROM ims.sales
          WHERE branch_id = $1
            AND status <> 'void'
            AND sale_date::date = CURRENT_DATE`,
        [branchId]
      );
      cards.push({
        id: 'today-sales',
        title: "Today's Sales",
        value: Number(row?.total || 0),
        subtitle: 'Sales collected today',
        icon: 'TrendingUp',
        format: 'currency',
      });
    }

    if (permissions.includes('purchases.view')) {
      const row = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(total), 0)::text AS total
           FROM ims.purchases
          WHERE branch_id = $1
            AND status <> 'void'
            AND purchase_date::date >= date_trunc('month', CURRENT_DATE)::date`,
        [branchId]
      );
      cards.push({
        id: 'month-purchases',
        title: 'Monthly Purchases',
        value: Number(row?.total || 0),
        subtitle: 'Purchases this month',
        icon: 'ReceiptText',
        format: 'currency',
      });
    }

    if (hasPermission(permissions, 'items.view') || hasPermission(permissions, 'products.view')) {
      const row = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM ims.items
          WHERE branch_id = $1
            AND is_active = TRUE`,
        [branchId]
      );
      cards.push({
        id: 'active-products',
        title: 'Active Items',
        value: Number(row?.count || 0),
        subtitle: 'Items available',
        icon: 'Package',
        format: 'number',
      });
    }

    if (hasPermission(permissions, 'stock.view')) {
      const runLowStockCount = async (
        stockShape: WarehouseStockShape
      ): Promise<{ row: { count: string } | null; shape: WarehouseStockShape }> => {
        const stockJoins = stockShape.hasBranchId
          ? `LEFT JOIN ims.warehouse_stock ws
               ON ws.${stockShape.itemColumn} = i.item_id
              AND ws.branch_id = i.branch_id`
          : `LEFT JOIN ims.warehouse_stock ws
               ON ws.${stockShape.itemColumn} = i.item_id
             LEFT JOIN ims.warehouses w
               ON w.wh_id = ws.wh_id`;
        const totalStockExpr = stockShape.hasBranchId
          ? 'COALESCE(SUM(ws.quantity), 0)'
          : 'COALESCE(SUM(CASE WHEN w.branch_id = i.branch_id THEN ws.quantity ELSE 0 END), 0)';

        const row = await queryOne<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM (
               SELECT i.item_id
                  FROM ims.items i
                  ${stockJoins}
                 WHERE i.branch_id = $1
                   AND i.is_active = TRUE
                 GROUP BY i.item_id, i.reorder_level
                HAVING ${totalStockExpr} <= COALESCE(i.reorder_level, 0)
             ) AS x`,
          [branchId]
        );

        return { row, shape: stockShape };
      };

      const detectedShape = await detectWarehouseStockShape();
      const candidates = buildWarehouseShapeCandidates(detectedShape);
      let row: { count: string } | null = null;
      let appliedShape = detectedShape;
      let lastShapeError: any = null;

      for (const candidate of candidates) {
        try {
          const result = await runLowStockCount(candidate);
          row = result.row;
          appliedShape = result.shape;
          lastShapeError = null;
          break;
        } catch (error: any) {
          if (error?.code !== '42703') {
            throw error;
          }
          lastShapeError = error;
        }
      }

      if (lastShapeError) {
        throw lastShapeError;
      }
      warehouseStockShapeCache = appliedShape;

      cards.push({
        id: 'low-stock',
        title: 'Low Stock Alerts',
        value: Number(row?.count || 0),
        subtitle: 'Needs reorder soon',
        icon: 'AlertTriangle',
        format: 'number',
      });
    }

    return cards;
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
