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
  type: 'bar' | 'line';
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

export type DashboardResponse = {
  widgets: DashboardWidget[];
  cards: DashboardCard[];
  charts: DashboardChart[];
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
