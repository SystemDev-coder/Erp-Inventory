import { useEffect, useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Boxes,
  Loader2,
  Package,
  ReceiptText,
  RefreshCcw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { apiClient, type ApiResponse } from '../../services/api';
import { API, env } from '../../config/env';
import { ReportModal, type ReportColumn } from '../../components/reports/ReportModal';
import { settingsService } from '../../services/settings.service';

type DashboardCard = {
  id: string;
  title: string;
  value: number;
  subtitle: string;
  icon?: string;
  route?: string;
  format?: 'currency' | 'number';
};

type DashboardChart = {
  id: string;
  name: string;
  type: 'bar' | 'line';
  labels: string[];
  series: Array<{ name: string; data: number[] }>;
};

type DashboardRecentRow = {
  id: string;
  type: string;
  ref: string;
  amount: number;
  date: string;
  status: string;
};

type DashboardLowStockItem = {
  item_id: number;
  item_name: string;
  quantity: number;
  stock_alert: number;
  shortage: number;
};

type DashboardResponse = {
  widgets?: Array<{ id: string; name: string; permission: string; description?: string }>;
  cards: DashboardCard[];
  charts: DashboardChart[];
  low_stock_items: DashboardLowStockItem[];
  recent: DashboardRecentRow[];
  summary: {
    modules: number;
    sections: number;
  };
  permissions?: string[];
  role: {
    role_id: number;
    role_name: string;
  };
};

type DashboardCardDrilldownResponse = {
  cardId: string;
  title: string;
  format?: 'currency' | 'number';
  total: number;
  rows: Record<string, unknown>[];
};

const ICONS = {
  TrendingUp,
  ReceiptText,
  Package,
  AlertTriangle,
  Users,
  BriefcaseBusiness,
  Boxes,
  Wallet,
} as const;

const CARD_TONES = [
  {
    stripe: 'from-primary-500 to-primary-700',
    iconWrap: 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  },
  {
    stripe: 'from-primary-400 to-primary-600',
    iconWrap: 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  },
  {
    stripe: 'from-primary-600 to-primary-800',
    iconWrap: 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  },
  {
    stripe: 'from-primary-500 to-primary-700',
    iconWrap: 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  },
] as const;

const formatValue = (value: number, format?: 'currency' | 'number') => {
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US').format(value);
};

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const statusTone = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes('paid') || normalized.includes('posted') || normalized.includes('received')) {
    return 'border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/30 dark:text-success-200';
  }
  if (normalized.includes('void') || normalized.includes('cancel')) {
    return 'border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-200';
  }
  if (normalized.includes('unpaid') || normalized.includes('pending') || normalized.includes('partial')) {
    return 'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-800 dark:bg-warning-900/30 dark:text-warning-200';
  }
  return 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-200';
};

const Dashboard = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { permissions: userPermissions } = useAuth();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<{
    name?: string;
    logoUrl?: string;
    bannerUrl?: string;
    manager?: string;
    phone?: string;
    updatedAt?: string;
  }>({});
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [cardModalTitle, setCardModalTitle] = useState('');
  const [cardModalSubtitle, setCardModalSubtitle] = useState('');
  const [cardModalData, setCardModalData] = useState<Record<string, unknown>[]>([]);
  const [cardModalColumns, setCardModalColumns] = useState<ReportColumn<Record<string, unknown>>[]>([]);
  const [cardModalTotalLabel, setCardModalTotalLabel] = useState('Total');
  const [cardModalTotalKey, setCardModalTotalKey] = useState('total');
  const [cardModalTotalValue, setCardModalTotalValue] = useState<string>('0');
  const [cardModalLoadingId, setCardModalLoadingId] = useState<string | null>(null);

  const resolveImageUrl = (value?: string | null) => {
    const raw = (value || '').trim();
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/images/') || raw === '/favicon.png') return raw;
    if (raw.startsWith('uploads/')) return `${env.API_URL}/${raw}`;
    if (raw.startsWith('/')) return `${env.API_URL}${raw}`;
    return raw;
  };

  useEffect(() => {
    settingsService.getCompany().then((response) => {
      if (!response.success || !response.data?.company) return;
      const company = response.data.company;
      setCompanyInfo({
        name: company.company_name || undefined,
        logoUrl: resolveImageUrl(company.logo_img),
        bannerUrl: resolveImageUrl(company.banner_img),
        manager: company.manager_name || undefined,
        phone: company.phone || undefined,
        updatedAt: company.updated_at ? new Date(company.updated_at).toLocaleString() : undefined,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expandPermissionKeys = (permKey: string): string[] => {
    if (permKey.startsWith('items.')) {
      return [permKey, permKey.replace('items.', 'products.')];
    }
    if (permKey.startsWith('products.')) {
      return [permKey, permKey.replace('products.', 'items.')];
    }
    if (permKey === 'stock.view') {
      return [permKey, 'warehouse_stock.view', 'inventory.view', 'items.view', 'products.view'];
    }
    if (permKey === 'warehouse_stock.view') {
      return [permKey, 'stock.view', 'inventory.view', 'items.view', 'products.view'];
    }
    if (permKey === 'inventory.view') {
      return [permKey, 'stock.view', 'warehouse_stock.view', 'items.view', 'products.view'];
    }
    return [permKey];
  };

  const hasAnyPermission = (permKeys: string[]) =>
    permKeys.some((key) => expandPermissionKeys(key).some((expanded) => userPermissions.includes(expanded)));

  const visibleCards = useMemo(() => {
    const cards = data?.cards ?? [];

    const cardPermissions: Record<string, string[]> = {
      'total-customers': ['customers.view'],
      'total-employees': ['employees.view', 'users.view'],
      'total-products': ['items.view', 'products.view'],
      'inventory-stock': ['stock.view', 'warehouse_stock.view', 'inventory.view', 'items.view', 'products.view'],
      'low-stock-alert': ['stock.view', 'warehouse_stock.view', 'inventory.view', 'items.view', 'products.view'],
      'today-income': ['sales.view'],
      'monthly-income': ['sales.view'],
      'today-payment': ['accounts.view', 'expenses.view'],
      'monthly-payment': ['accounts.view', 'expenses.view'],
      'total-revenue': ['sales.view'],
    };

    return cards.filter((card) => {
      const required = cardPermissions[card.id];
      if (!required?.length) return true;
      return hasAnyPermission(required);
    });
  }, [data?.cards, userPermissions]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    const res: ApiResponse<DashboardResponse> = await apiClient.get<DashboardResponse>(API.DASHBOARD);
    if (res.success && res.data) {
      setData(res.data);
      setLastUpdated(new Date().toISOString());
    } else {
      setData(null);
      setError(res.error || 'Failed to load dashboard data');
    }

    setHasLoaded(true);
    setLoading(false);
  };

  const openCardModal = async (card: DashboardCard) => {
    try {
      setCardModalLoadingId(card.id);
      const res: ApiResponse<DashboardCardDrilldownResponse> = await apiClient.get<DashboardCardDrilldownResponse>(
        `${API.DASHBOARD}/cards/${encodeURIComponent(card.id)}`
      );
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to load card details');

      const payload = res.data;
      const rows = payload.rows || [];

      const money = (key: string, header: string) =>
        ({
          key,
          header,
          align: 'right',
          render: (row) => formatValue(Number(row[key] || 0), 'currency'),
        }) satisfies ReportColumn<Record<string, unknown>>;

      const num = (key: string, header: string) =>
        ({
          key,
          header,
          align: 'right',
          render: (row) => formatValue(Number(row[key] || 0), 'number'),
        }) satisfies ReportColumn<Record<string, unknown>>;

      const text = (key: string, header: string) =>
        ({
          key,
          header,
        }) satisfies ReportColumn<Record<string, unknown>>;

      const dateTime = (key: string, header: string) =>
        ({
          key,
          header,
          render: (row) => (row[key] ? formatDateTime(String(row[key])) : '—'),
        }) satisfies ReportColumn<Record<string, unknown>>;

      const totalsOnlyColumn = (key: string, header: string) =>
        ({
          key,
          header,
          align: 'right',
          render: () => '—',
        }) satisfies ReportColumn<Record<string, unknown>>;

      let columns: ReportColumn<Record<string, unknown>>[] = [];
      let totalLabel = 'Total';
      let totalKey = 'total';
      let totalValue = payload.format === 'currency' ? formatValue(payload.total, 'currency') : formatValue(payload.total, 'number');

      switch (card.id) {
        case 'total-customers':
          columns = [
            text('customer_id', 'ID'),
            text('name', 'Customer'),
            text('phone', 'Phone'),
            dateTime('created_at', 'Created At'),
            totalsOnlyColumn('total_value', 'Total'),
          ];
          totalLabel = 'Total Customers';
          totalKey = 'total_value';
          totalValue = formatValue(payload.total, 'number');
          break;
        case 'total-employees':
          columns = [
            text('employee_id', 'ID'),
            text('name', 'Employee'),
            text('phone', 'Phone'),
            text('position', 'Position'),
            text('status', 'Status'),
            totalsOnlyColumn('total_value', 'Total'),
          ];
          totalLabel = 'Total Employees';
          totalKey = 'total_value';
          totalValue = formatValue(payload.total, 'number');
          break;
        case 'total-products':
          columns = [
            text('item_id', 'ID'),
            text('name', 'Product'),
            num('opening_balance', 'Opening Qty'),
            money('sale_price', 'Sale Price'),
            text('is_active', 'Active'),
            totalsOnlyColumn('total_value', 'Total'),
          ];
          totalLabel = 'Total Products';
          totalKey = 'total_value';
          totalValue = formatValue(payload.total, 'number');
          break;
        case 'inventory-stock':
          columns = [text('item_id', 'ID'), text('item_name', 'Item'), num('quantity', 'Quantity'), num('stock_alert', 'Alert')];
          totalLabel = 'Total Units';
          totalKey = 'quantity';
          totalValue = formatValue(payload.total, 'number');
          break;
        case 'low-stock-alert':
          columns = [
            text('item_id', 'ID'),
            text('item_name', 'Item'),
            num('quantity', 'Quantity'),
            num('stock_alert', 'Alert'),
            totalsOnlyColumn('total_value', 'Total'),
          ];
          totalLabel = 'Low Stock Items';
          totalKey = 'total_value';
          totalValue = formatValue(payload.total, 'number');
          break;
        case 'today-income':
        case 'monthly-income':
        case 'total-revenue':
          columns = [text('sale_id', 'Sale #'), dateTime('sale_date', 'Date'), text('doc_type', 'Type'), text('customer_name', 'Customer'), money('total', 'Total'), text('status', 'Status')];
          totalLabel = card.id === 'total-revenue' ? 'Total Revenue' : 'Total Income';
          totalKey = 'total';
          totalValue = formatValue(payload.total, 'currency');
          break;
        case 'today-payment':
        case 'monthly-payment':
          columns = [text('payment_type', 'Type'), dateTime('pay_date', 'Date'), text('name', 'Name'), text('account_name', 'Account'), money('amount_paid', 'Amount'), text('note', 'Note')];
          totalLabel = 'Total Payments';
          totalKey = 'amount_paid';
          totalValue = formatValue(payload.total, 'currency');
          break;
        default:
          columns = Object.keys(rows[0] || {}).map((key) => text(key, key));
      }

      setCardModalTitle(payload.title || card.title);
      setCardModalSubtitle(card.subtitle);
      setCardModalData(rows);
      setCardModalColumns(columns);
      setCardModalTotalLabel(totalLabel);
      setCardModalTotalKey(totalKey);
      setCardModalTotalValue(totalValue);
      setCardModalOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open card details');
    } finally {
      setCardModalLoadingId(null);
    }
  };

  const orderedCharts = useMemo(() => {
    if (!data?.charts) return [];
    const order = ['income-trend-12m', 'sales-6m'];
    return [...data.charts]
      .filter((chart) => chart.id !== 'stock-14d')
      .sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
  }, [data?.charts]);

  const chartOptions = useMemo(() => {
    if (!orderedCharts.length) return {};

    const themeById: Record<string, { base: string; soft: string }> = isDark
      ? {
        'income-trend-12m': { base: '#FFA500', soft: '#FFD08A' },
        'sales-6m': { base: '#FFB74D', soft: '#FFE1B3' },
        }
      : {
        'income-trend-12m': { base: '#FFA500', soft: '#FFD08A' },
        'sales-6m': { base: '#FFB74D', soft: '#FFE1B3' },
        };

    const axisColor = isDark ? '#cbd5e1' : '#334155';
    const legendColor = isDark ? '#e2e8f0' : '#1f2937';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const base: ApexOptions = {
      chart: {
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: 'Manrope, Inter, sans-serif',
      },
      dataLabels: { enabled: false },
      grid: {
        borderColor: gridColor,
        strokeDashArray: 4,
      },
      xaxis: {
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: axisColor } },
      },
      yaxis: {
        labels: {
          style: { colors: axisColor },
          formatter: (value) => formatCompact(value),
        },
      },
      legend: {
        show: true,
        position: 'top',
        labels: { colors: legendColor },
      },
      tooltip: {
        theme: isDark ? 'dark' : 'light',
      },
    };

    return orderedCharts.reduce<Record<string, ApexOptions>>((acc, chart) => {
      const themeColors = themeById[chart.id] || themeById['sales-6m'];
      const isBar = chart.type === 'bar';
      const isIncomeTrend = chart.id === 'income-trend-12m';

      acc[chart.id] = {
        ...base,
        chart: {
          ...base.chart,
          type: isBar ? 'bar' : 'line',
          height: 300,
        },
        colors: [themeColors.base],
        stroke: isBar ? { width: 0 } : { curve: 'smooth', width: 4 },
        markers: isBar ? { size: 0 } : { size: 4, strokeWidth: 0, hover: { size: 6 } },
        fill: isBar
          ? { type: 'solid', opacity: 0.92 }
          : {
              type: 'gradient',
              gradient: {
                shadeIntensity: 0.15,
                opacityFrom: isDark ? 0.34 : 0.46,
                opacityTo: 0.05,
                colorStops: [
                  [
                    { offset: 0, color: themeColors.base, opacity: 0.35 },
                    { offset: 100, color: themeColors.soft, opacity: 0.04 },
                  ],
                ],
              },
            },
        plotOptions: isBar
          ? {
              bar: {
                borderRadius: 8,
                columnWidth: '48%',
              },
            }
          : {},
        xaxis: { ...base.xaxis, categories: chart.labels },
        yaxis: isIncomeTrend
          ? {
              labels: {
                style: { colors: axisColor },
                formatter: (value) => formatValue(Number(value), 'currency'),
              },
            }
          : base.yaxis,
        tooltip: {
          ...base.tooltip,
          y: {
            formatter: (value) =>
              isIncomeTrend
                ? formatValue(Number(value), 'currency')
                : formatCompact(Number(value)),
          },
        },
      };

      return acc;
    }, {});
  }, [isDark, orderedCharts]);

  const getChartSubtitle = (chartId: string) => {
    if (chartId === 'income-trend-12m') return 'Monthly income trend for the last 12 months';
    return 'Sales totals for the last 6 months';
  };

  const chartHasData = (chart: DashboardChart) => chart.series.some((series) => series.data.length > 0);
  const incomeTrendChart = orderedCharts.find((chart) => chart.id === 'income-trend-12m');
  const bottomCharts = orderedCharts.filter((chart) => chart.id !== 'income-trend-12m');
  const hasRenderableCharts = orderedCharts.some((chart) => !!chartOptions[chart.id] && chartHasData(chart));

  const lowStockItems = data?.low_stock_items || [];

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-slate-100 p-6 shadow-sm dark:border-slate-800 dark:bg-gradient-to-r dark:from-black dark:via-black dark:to-black">
        <div className="pointer-events-none absolute -right-20 top-[-60px] h-64 w-64 rounded-full bg-primary-500/10 blur-3xl dark:bg-primary-400/20" />
        <div className="pointer-events-none absolute -left-20 -bottom-28 h-64 w-64 rounded-full bg-primary-300/10 blur-3xl dark:bg-primary-300/20" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-primary-700 dark:text-primary-200">Inventory ERP</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-700 dark:text-white/80">
              {hasLoaded
                ? `Live metrics loaded | ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : ''}`
                : 'Click Display Dashboard to load live cards, charts, and activity.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-primary-400 bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-65 dark:border-primary-400 dark:bg-primary-600 dark:text-white dark:hover:bg-primary-700"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {!hasLoaded ? 'Display Dashboard' : loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm font-medium text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-200">
          {error}
        </div>
      )}

      {!hasLoaded && !loading && (
        <section className="rounded-3xl border border-dashed border-slate-200 bg-white/95 p-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-primary-700 dark:bg-slate-800/60 dark:text-primary-300">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">Dashboard ready</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
            Press <span className="font-semibold">Display Dashboard</span> to render live metrics and chart trends.
          </p>
        </section>
      )}

      {loading && !data && hasLoaded && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`dash-skeleton-${index}`}
              className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-100 dark:border-slate-700 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950"
            />
          ))}
        </section>
      )}

      {hasLoaded && data && (
        <>
          <section className="relative">
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
              {visibleCards.map((card, index) => {
              const tone = CARD_TONES[index % CARD_TONES.length];
              const Icon = card.icon && card.icon in ICONS ? ICONS[card.icon as keyof typeof ICONS] : TrendingUp;
              return (
                <article
                  key={card.id}
                  onClick={() => void openCardModal(card)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void openCardModal(card);
                    }
                  }}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-700 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950"
                >
                  <div className={`absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r ${tone.stripe}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-300">
                        {card.title}
                      </p>
                      <p className="mt-2 truncate text-[1.7rem] font-semibold leading-tight text-slate-900 dark:text-slate-100">
                        {formatValue(card.value, card.format)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{card.subtitle}</p>
                    </div>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.iconWrap}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  {cardModalLoadingId === card.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70">
                      <Loader2 className="h-6 w-6 animate-spin text-primary-600 dark:text-primary-300" />
                    </div>
                  )}
                </article>
              );
              })}
            </div>
            {loading && (
              <div className="pointer-events-none absolute inset-0 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: Math.max(visibleCards.length, 8) }).map((_, index) => (
                  <div
                    key={`dash-refresh-skeleton-${index}`}
                    className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-100 dark:border-slate-700 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950"
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-5">
            {incomeTrendChart && chartOptions[incomeTrendChart.id] && chartHasData(incomeTrendChart) && (
              <article className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {incomeTrendChart.name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {getChartSubtitle(incomeTrendChart.id)}
                    </p>
                  </div>

                  {(() => {
                    const incomeSeries = incomeTrendChart.series[0]?.data ?? [];
                    const start = incomeSeries[0] ?? 0;
                    const end = incomeSeries[incomeSeries.length - 1] ?? 0;
                    const change = start === 0 ? (end > 0 ? 100 : 0) : ((end - start) / start) * 100;
                    const toneClass =
                      change >= 0
                        ? 'border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/30 dark:text-success-200'
                        : 'border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-200';

                    return (
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClass}`}>
                        {`${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs first month`}
                      </span>
                    );
                  })()}
                </div>
                <div className="mt-4">
                  <Chart
                    options={chartOptions[incomeTrendChart.id]}
                    series={incomeTrendChart.series}
                    type="line"
                    height={320}
                  />
                </div>
              </article>
            )}

            {(() => {
              const salesBottomChart = bottomCharts.find((chart) => chart.id === 'sales-6m');
              const remainingBottomCharts = bottomCharts.filter((chart) => chart.id !== 'sales-6m');

              return (
                <>
                  {salesBottomChart && chartOptions[salesBottomChart.id] && chartHasData(salesBottomChart) && (
                    <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                      <article className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                              {salesBottomChart.name}
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {getChartSubtitle(salesBottomChart.id)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <Chart
                            options={chartOptions[salesBottomChart.id]}
                            series={salesBottomChart.series}
                            type={salesBottomChart.type === 'bar' ? 'bar' : 'line'}
                            height={300}
                          />
                        </div>
                      </article>

                      <article className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                              Low Stock Alert Items
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Items at or below reorder level
                            </p>
                          </div>
                          <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-200">
                            {lowStockItems.length} items
                          </span>
                        </div>
                        <div className="mt-4 space-y-2">
                          {lowStockItems.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-300">
                              No low stock alerts right now.
                            </p>
                          ) : (
                            lowStockItems.slice(0, 8).map((item) => (
                              <div
                                key={item.item_id}
                                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {item.item_name}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-300">
                                    Stock: {item.quantity} / Alert: {item.stock_alert}
                                  </p>
                                </div>
                                <span className="ml-3 rounded-full border border-warning-200 bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700 dark:border-warning-800 dark:bg-warning-900/30 dark:text-warning-200">
                                  Need {item.shortage}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </article>
                    </section>
                  )}

                  {remainingBottomCharts.length > 0 && (
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                      {remainingBottomCharts.map((chart) => {
                        const options = chartOptions[chart.id];
                        if (!options || !chartHasData(chart)) return null;

                        return (
                          <article
                            key={chart.id}
                            className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{chart.name}</h3>
                                <p className="text-xs text-slate-600 dark:text-slate-300">{getChartSubtitle(chart.id)}</p>
                              </div>
                            </div>
                            <div className="mt-4">
                              <Chart
                                options={options}
                                series={chart.series}
                                type={chart.type === 'bar' ? 'bar' : 'line'}
                                height={300}
                              />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}

            {!hasRenderableCharts && (
              <article className="rounded-2xl border border-dashed border-slate-200 bg-white/90 p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                No charts available for your current permissions.
              </article>
            )}
          </section>

          <section className="grid grid-cols-1 gap-5">
            <article className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-300">Latest sales and purchase transactions</p>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
                  Last {Math.min(10, data.recent.length)} records
                </span>
              </div>

              <div className="mt-4 overflow-x-auto custom-scrollbar">
                <table className="min-w-[680px] w-full">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:border-slate-700 dark:text-slate-300">
                      <th className="px-2 py-3">Type</th>
                      <th className="px-2 py-3">Reference</th>
                      <th className="px-2 py-3">Amount</th>
                      <th className="px-2 py-3">Date</th>
                      <th className="px-2 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((row) => (
                      <tr key={row.id} className="border-b border-slate-200 dark:border-slate-800">
                        <td className="px-2 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{row.type}</td>
                        <td className="px-2 py-3 text-sm text-slate-500 dark:text-slate-300">{row.ref}</td>
                        <td className="px-2 py-3 text-sm text-slate-700 dark:text-slate-200">{formatValue(row.amount, 'currency')}</td>
                        <td className="px-2 py-3 text-sm text-slate-500 dark:text-slate-300">{formatDateTime(row.date)}</td>
                        <td className="px-2 py-3 text-right">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.recent.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-8 text-center text-sm text-slate-500 dark:text-slate-300">
                          No recent activity found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}

      <ReportModal
        isOpen={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
        title={cardModalTitle || 'Dashboard'}
        subtitle={cardModalSubtitle}
        companyInfo={companyInfo}
        fileName={`dashboard-${cardModalTitle || 'card'}`}
        data={cardModalData}
        columns={cardModalColumns}
        tableTotals={{
          label: cardModalTotalLabel,
          values: {
            [cardModalTotalKey]: cardModalTotalValue,
          },
        }}
      />
    </div>
  );
};

export default Dashboard;
