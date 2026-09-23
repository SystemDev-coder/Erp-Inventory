import { useEffect, useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import {
  HandCoins,
  HandHeart,
  Loader2,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useLanguage } from '../../context/LanguageContext';
import type { TranslationKey } from '../../translations';
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
  type: 'bar' | 'line' | 'donut';
  labels: string[];
  series: Array<{ name: string; data: number[] }>;
};

type DashboardResponse = {
  widgets?: Array<{ id: string; name: string; permission: string; description?: string }>;
  cards: DashboardCard[];
  charts?: DashboardChart[];
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

// All cards the backend can produce (getDashboardCards), each one already permission-gated
// server-side and with a matching drilldown query. A small set of trend charts sits below
// them (see CHART_TITLE_KEYS); anything more detailed than a card+drilldown stays in Reports.
const DASHBOARD_CARD_ORDER = [
  'today-income',
  'new-customers-today',
  'today-expenses',
  'today-purchases',
  'week-sales',
  'week-expenses',
  'loans-given-today',
  'debt-recovered-today',
  'total-outstanding-debt',
];

// Chart id -> translation keys, same by-id lookup pattern as CARD_TITLE_KEYS above.
const CHART_TITLE_KEYS: Record<string, TranslationKey> = {
  'income-trend-12m': 'chart_income_trend_title',
  'top-items-30d': 'chart_top_items_title',
  'customer-debt-breakdown': 'chart_debt_breakdown_title',
};

const CHART_SUBTITLE_KEYS: Record<string, TranslationKey> = {
  'income-trend-12m': 'chart_income_trend_subtitle',
  'top-items-30d': 'chart_top_items_subtitle',
  'customer-debt-breakdown': 'chart_debt_breakdown_subtitle',
};

// Kept at module scope (not component state) so it survives a route navigation away from
// and back to the dashboard within the same browser session - returning to the page reuses
// this instead of hitting the server again. Cleared automatically once stale.
const DASHBOARD_CACHE_TTL_MS = 60_000;
const dashboardCache = new Map<string, { payload: DashboardResponse; fetchedAt: number }>();
const dashboardCacheKey = (branchId: number | null) => String(branchId ?? 'all');

// Card title/subtitle text comes from the backend in English only; translate it here by
// card id instead, so switching language doesn't require localizing the API response.
const CARD_TITLE_KEYS: Record<string, TranslationKey> = {
  'today-income': 'card_today_sales_title',
  'new-customers-today': 'card_new_customers_today_title',
  'today-expenses': 'card_today_expenses_title',
  'today-purchases': 'card_today_purchases_title',
  'week-sales': 'card_week_sales_title',
  'week-expenses': 'card_week_expenses_title',
  'loans-given-today': 'card_loans_given_title',
  'debt-recovered-today': 'card_debt_recovered_title',
  'total-outstanding-debt': 'card_total_outstanding_title',
};

const CARD_SUBTITLE_KEYS: Record<string, TranslationKey> = {
  'today-income': 'card_today_sales_subtitle',
  'new-customers-today': 'card_new_customers_today_subtitle',
  'today-expenses': 'card_today_expenses_subtitle',
  'today-purchases': 'card_today_purchases_subtitle',
  'week-sales': 'card_week_sales_subtitle',
  'week-expenses': 'card_week_expenses_subtitle',
  'loans-given-today': 'card_loans_given_subtitle',
  'debt-recovered-today': 'card_debt_recovered_subtitle',
  'total-outstanding-debt': 'card_total_outstanding_subtitle',
};

const ICONS = {
  TrendingUp,
  Users,
  ReceiptText,
  ShoppingBag,
  HandCoins,
  HandHeart,
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

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const Dashboard = () => {
  const { permissions: userPermissions } = useAuth();
  const { activeBranchId } = useBranch();
  const { t } = useLanguage();
  const { theme } = useTheme();

  const cacheKey = dashboardCacheKey(activeBranchId);
  const cachedEntry = dashboardCache.get(cacheKey);
  const hasFreshCache = !!cachedEntry && Date.now() - cachedEntry.fetchedAt < DASHBOARD_CACHE_TTL_MS;

  const [data, setData] = useState<DashboardResponse | null>(() => (hasFreshCache ? cachedEntry!.payload : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [hasLoaded, setHasLoaded] = useState(hasFreshCache);
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

  useEffect(() => {
    // Reusing a still-fresh cache entry from a previous mount means simply returning to
    // this page never hits the server again - only a real data change (Show/refresh) does.
    const cached = dashboardCache.get(dashboardCacheKey(activeBranchId));
    if (cached && Date.now() - cached.fetchedAt < DASHBOARD_CACHE_TTL_MS) {
      setData(cached.payload);
      setLastUpdated(new Date(cached.fetchedAt).toISOString());
      setHasLoaded(true);
      return;
    }
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  const expandPermissionKeys = (permKey: string): string[] => {
    if (permKey.startsWith('items.')) {
      return [permKey, permKey.replace('items.', 'products.')];
    }
    if (permKey.startsWith('products.')) {
      return [permKey, permKey.replace('products.', 'items.')];
    }
    return [permKey];
  };

  const hasAnyPermission = (permKeys: string[]) =>
    permKeys.some((key) => expandPermissionKeys(key).some((expanded) => userPermissions.includes(expanded)));

  const visibleCards = useMemo(() => {
    const cards = data?.cards ?? [];
    const cardPermissions: Record<string, string[]> = {
      'today-income': ['sales.view'],
      'new-customers-today': ['customers.view'],
      'today-expenses': ['expenses.view'],
      'today-purchases': ['purchases.view'],
      'week-sales': ['sales.view'],
      'week-expenses': ['expenses.view'],
      'loans-given-today': ['sales.view'],
      'debt-recovered-today': ['customers.view'],
      'total-outstanding-debt': ['customers.view'],
    };

    // Keep only the four dashboard cards, in the fixed order above, regardless of what
    // order the backend returns them in or what other cards it may include.
    return DASHBOARD_CARD_ORDER
      .map((id) => cards.find((card) => card.id === id))
      .filter((card): card is DashboardCard => {
        if (!card) return false;
        const required = cardPermissions[card.id];
        if (!required?.length) return true;
        return hasAnyPermission(required);
      });
  }, [data?.cards, userPermissions]);

  // 'sales-6m' is an older bar chart kept in the API for other consumers; it duplicates
  // income-trend-12m's data in a different shape, so it's left out of the dashboard to
  // avoid showing two near-identical income charts side by side.
  const visibleCharts = useMemo(
    () => (data?.charts ?? []).filter((chart) => chart.id !== 'sales-6m'),
    [data?.charts]
  );

  const isDark = theme === 'dark';
  const chartTextColor = isDark ? '#cbd5e1' : '#475569';
  const chartGridColor = isDark ? '#334155' : '#e2e8f0';
  const chartPalette = ['#2a6f97', '#468faf', '#61a5c2', '#01497c', '#89c2d9', '#94a3b8'];

  const formatMonthLabel = (yyyyMm: string) => {
    const [year, month] = yyyyMm.split('-').map(Number);
    if (!year || !month) return yyyyMm;
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };

  const buildChartView = (chart: DashboardChart): { options: ApexOptions; series: ApexOptions['series'] } => {
    const baseOptions: ApexOptions = {
      chart: { fontFamily: 'inherit', toolbar: { show: false }, background: 'transparent' },
      colors: chartPalette,
      theme: { mode: isDark ? 'dark' : 'light' },
      grid: { borderColor: chartGridColor, strokeDashArray: 4 },
      legend: { labels: { colors: chartTextColor } },
      dataLabels: { enabled: false },
    };

    if (chart.type === 'line') {
      return {
        options: {
          ...baseOptions,
          stroke: { curve: 'smooth', width: 3 },
          fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0 } },
          xaxis: {
            categories: chart.labels.map(formatMonthLabel),
            labels: { style: { colors: chartTextColor } },
            axisBorder: { show: false },
            axisTicks: { show: false },
          },
          yaxis: { labels: { style: { colors: chartTextColor }, formatter: (v: number) => formatValue(v, 'currency') } },
          tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: (v: number) => formatValue(v, 'currency') } },
        },
        series: chart.series,
      };
    }

    if (chart.type === 'donut') {
      const labels = chart.labels.map((label) => (label === 'Other Customers' ? t('chart_other_customers') : label));
      return {
        options: {
          ...baseOptions,
          labels,
          legend: { ...baseOptions.legend, position: 'bottom' },
          dataLabels: { enabled: true, formatter: (v: number) => `${v.toFixed(0)}%` },
          tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: (v: number) => formatValue(v, 'currency') } },
        },
        series: chart.series[0]?.data ?? [],
      };
    }

    // bar
    return {
      options: {
        ...baseOptions,
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
        xaxis: {
          categories: chart.labels,
          labels: { style: { colors: chartTextColor } },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: { labels: { style: { colors: chartTextColor } } },
        tooltip: { theme: isDark ? 'dark' : 'light' },
      },
      series: chart.series,
    };
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    const dashboardUrl = activeBranchId ? `${API.DASHBOARD}?branchId=${activeBranchId}` : API.DASHBOARD;
    const res: ApiResponse<DashboardResponse> = await apiClient.get<DashboardResponse>(dashboardUrl);
    if (res.success && res.data) {
      setData(res.data);
      dashboardCache.set(dashboardCacheKey(activeBranchId), { payload: res.data, fetchedAt: Date.now() });
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
      const drilldownUrl = `${API.DASHBOARD}/cards/${encodeURIComponent(card.id)}${
        activeBranchId ? `?branchId=${activeBranchId}` : ''
      }`;
      const res: ApiResponse<DashboardCardDrilldownResponse> = await apiClient.get<DashboardCardDrilldownResponse>(
        drilldownUrl
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

      let columns: ReportColumn<Record<string, unknown>>[] = [];
      let totalLabel = 'Total';
      let totalKey = 'total';
      let totalValue = payload.format === 'currency' ? formatValue(payload.total, 'currency') : formatValue(payload.total, 'number');

      switch (card.id) {
        case 'new-customers-today':
          columns = [text('customer_id', 'ID'), text('name', 'Name'), text('phone', 'Phone'), dateTime('created_at', 'Registered')];
          totalLabel = 'New Customers Today';
          break;
        case 'today-income':
        case 'week-sales':
          columns = [text('sale_id', 'Sale #'), dateTime('sale_date', 'Date'), text('doc_type', 'Type'), text('customer_name', 'Customer'), money('total', 'Total'), text('status', 'Status')];
          totalLabel = card.id === 'today-income' ? "Today's Sales" : "This Week's Sales";
          totalKey = 'total';
          totalValue = formatValue(payload.total, 'currency');
          break;
        case 'today-purchases':
          columns = [text('purchase_id', 'Purchase #'), dateTime('purchase_date', 'Date'), text('supplier_name', 'Supplier'), money('total', 'Total'), text('status', 'Status')];
          totalLabel = "Today's Purchases";
          totalKey = 'total';
          totalValue = formatValue(payload.total, 'currency');
          break;
        case 'today-expenses':
        case 'week-expenses':
          columns = [dateTime('charge_date', 'Date'), text('name', 'Expense'), money('amount', 'Amount'), text('note', 'Note')];
          totalLabel = card.id === 'today-expenses' ? "Today's Expenses" : "This Week's Expenses";
          totalKey = 'amount';
          totalValue = formatValue(payload.total, 'currency');
          break;
        case 'loans-given-today':
          columns = [text('sale_id', 'Sale #'), dateTime('sale_date', 'Date'), text('customer_name', 'Customer'), money('total', 'Amount'), text('status', 'Status')];
          totalLabel = 'Total Loaned Today';
          totalKey = 'total';
          totalValue = formatValue(payload.total, 'currency');
          break;
        case 'debt-recovered-today':
          columns = [dateTime('receipt_date', 'Date'), text('customer_name', 'Customer'), money('amount', 'Amount'), text('note', 'Note')];
          totalLabel = 'Total Recovered Today';
          totalKey = 'amount';
          totalValue = formatValue(payload.total, 'currency');
          break;
        case 'total-outstanding-debt':
          columns = [text('customer_id', 'ID'), text('name', 'Customer'), text('phone', 'Phone'), money('remaining_balance', 'Owed')];
          totalLabel = 'Total Outstanding';
          totalKey = 'remaining_balance';
          totalValue = formatValue(payload.total, 'currency');
          break;
        default:
          columns = Object.keys(rows[0] || {}).map((key) => text(key, key));
      }

      setCardModalTitle(CARD_TITLE_KEYS[card.id] ? t(CARD_TITLE_KEYS[card.id]) : payload.title || card.title);
      setCardModalSubtitle(CARD_SUBTITLE_KEYS[card.id] ? t(CARD_SUBTITLE_KEYS[card.id]) : card.subtitle);
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

  return (
    <div className="space-y-7">
      {error && (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm font-medium text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-200">
          {error}
        </div>
      )}

      {loading && !data && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`dash-skeleton-${index}`}
              className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-100 dark:border-slate-700 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950"
            />
          ))}
        </section>
      )}

      {hasLoaded && data && (
        <section className="relative">
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
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
                      <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                        {CARD_TITLE_KEYS[card.id] ? t(CARD_TITLE_KEYS[card.id]) : card.title}
                      </p>
                      <p className="mt-2 truncate text-[1.7rem] font-semibold leading-tight text-slate-900 dark:text-slate-100">
                        {formatValue(card.value, card.format)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        {CARD_SUBTITLE_KEYS[card.id] ? t(CARD_SUBTITLE_KEYS[card.id]) : card.subtitle}
                      </p>
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
            <div className="pointer-events-none absolute inset-0 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: Math.max(visibleCards.length, 4) }).map((_, index) => (
                <div
                  key={`dash-refresh-skeleton-${index}`}
                  className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-100 dark:border-slate-700 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950"
                />
              ))}
            </div>
          )}
        </section>
      )}

      {hasLoaded && visibleCharts.length > 0 && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {visibleCharts.map((chart) => {
            const title = CHART_TITLE_KEYS[chart.id] ? t(CHART_TITLE_KEYS[chart.id]) : chart.name;
            const subtitle = CHART_SUBTITLE_KEYS[chart.id] ? t(CHART_SUBTITLE_KEYS[chart.id]) : undefined;
            const span = chart.id === 'income-trend-12m' ? 'lg:col-span-3' : chart.id === 'top-items-30d' ? 'lg:col-span-2' : 'lg:col-span-1';
            const view = buildChartView(chart);
            return (
              <div
                key={chart.id}
                className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${span}`}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
                <div className="mt-3">
                  <Chart
                    options={view.options}
                    series={view.series}
                    type={chart.type}
                    height={chart.type === 'donut' ? 260 : 240}
                  />
                </div>
              </div>
            );
          })}
        </section>
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
