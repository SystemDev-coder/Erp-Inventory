export type DashboardWidget = {
  id: string;
  name: string;
  permission: string;
  description?: string;
};

export type DashboardCard = {
  id: string;
  title: string;
  value: number;
  subtitle: string;
  icon?: string;
  route?: string;
  format?: 'currency' | 'number';
};

export type DashboardAccessRow = {
  id: string;
  section: string;
  route: string;
  permission: string;
  items: number;
};

export type DashboardChart = {
  id: string;
  name: string;
  type: 'bar' | 'line' | 'donut';
  labels: string[];
  series: Array<{
    name: string;
    data: number[];
  }>;
};

export type DashboardRecentRow = {
  id: string;
  type: string;
  ref: string;
  amount: number;
  date: string;
  status: string;
};

export type DashboardLowStockItem = {
  item_id: number;
  item_name: string;
  quantity: number;
  stock_alert: number;
  shortage: number;
};

export type DashboardCardDrilldown = {
  cardId: string;
  title: string;
  format?: 'currency' | 'number';
  total: number;
  rows: Record<string, unknown>[];
};

export type DashboardTopProduct = {
  item_id: number;
  name: string;
  sku: string | null;
  category_name: string | null;
  quantity_sold: number;
  revenue: number;
  stock_status: 'in_stock' | 'low_stock' | 'no_stock';
};

export type DashboardDebtRow = {
  customer_id: number;
  name: string;
  phone: string | null;
  balance: number;
  aging: 'overdue' | 'due_soon' | 'current';
  days_since_last_unpaid_sale: number | null;
};

export type DashboardResponse = {
  widgets: DashboardWidget[];
  cards: DashboardCard[];
  charts: DashboardChart[];
  low_stock_items: DashboardLowStockItem[];
  top_products: DashboardTopProduct[];
  debt_breakdown: DashboardDebtRow[];
  recent: DashboardRecentRow[];
  summary: {
    modules: number;
    sections: number;
  };
  permissions: string[];
  role: {
    role_id: number;
    role_name: string;
  };
};
