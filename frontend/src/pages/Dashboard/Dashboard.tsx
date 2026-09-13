import { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  HandCoins,
  HandHeart,
  Loader2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
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

type DashboardResponse = {
  widgets?: Array<{ id: string; name: string; permission: string; description?: string }>;
  cards: DashboardCard[];
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

// Only these four cards belong on the dashboard itself - the day-to-day numbers a manager
// checks first thing (cash flow, credit risk, collection performance, overall exposure).
// Everything else (totals, monthly/period breakdowns, charts, recent activity) lives in
// Reports instead, where longer time ranges and drill-downs make more sense.
const DASHBOARD_CARD_ORDER = ['today-income', 'loans-given-today', 'debt-recovered-today', 'total-outstanding-debt'];

const ICONS = {
  TrendingUp,
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

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [valuesVisible, setValuesVisible] = useState(false);
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
    void loadDashboard(false);
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

  const loadDashboard = async (reveal = true) => {
    setLoading(true);
    setError(null);

    const dashboardUrl = activeBranchId ? `${API.DASHBOARD}?branchId=${activeBranchId}` : API.DASHBOARD;
    const res: ApiResponse<DashboardResponse> = await apiClient.get<DashboardResponse>(dashboardUrl);
    if (res.success && res.data) {
      setData(res.data);
      setLastUpdated(new Date().toISOString());
      if (reveal) setValuesVisible(true);
    } else {
      setData(null);
      setError(res.error || 'Failed to load dashboard data');
      if (reveal) setValuesVisible(false);
    }

    setHasLoaded(true);
    setLoading(false);
  };

  const handleShowToggle = () => {
    if (valuesVisible) {
      setValuesVisible(false);
      return;
    }
    if (data) {
      setValuesVisible(true);
      return;
    }
    void loadDashboard(true);
  };

  const maskedValue = (format?: 'currency' | 'number') => (format === 'currency' ? '••••••' : '••••');

  const openCardModal = async (card: DashboardCard) => {
    if (!valuesVisible) return;
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
        case 'today-income':
          columns = [text('sale_id', 'Sale #'), dateTime('sale_date', 'Date'), text('doc_type', 'Type'), text('customer_name', 'Customer'), money('total', 'Total'), text('status', 'Status')];
          totalLabel = 'Total Income';
          totalKey = 'total';
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

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-slate-100 p-6 shadow-sm dark:border-slate-800 dark:bg-gradient-to-r dark:from-black dark:via-black dark:to-black">
        <div className="pointer-events-none absolute -right-20 top-[-60px] h-64 w-64 rounded-full bg-primary-500/10 blur-3xl dark:bg-primary-400/20" />
        <div className="pointer-events-none absolute -left-20 -bottom-28 h-64 w-64 rounded-full bg-primary-300/10 blur-3xl dark:bg-primary-300/20" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary-700 dark:text-primary-200">Inventory ERP</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl dark:text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-700 dark:text-white/80">
              {loading && !data
                ? 'Loading dashboard cards...'
                : valuesVisible
                  ? `Live metrics visible | ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : ''}`
                  : 'Cards are visible. Click Show to reveal numbers.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleShowToggle}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-primary-400 bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-65 dark:border-primary-400 dark:bg-primary-600 dark:text-white dark:hover:bg-primary-700"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : valuesVisible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {loading ? 'Loading...' : valuesVisible ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </section>

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
                  onClick={() => {
                    if (valuesVisible) void openCardModal(card);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (!valuesVisible) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void openCardModal(card);
                    }
                  }}
                  className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4 shadow-sm transition duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-700 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 ${
                    valuesVisible
                      ? 'cursor-pointer hover:-translate-y-1 hover:shadow-md'
                      : 'cursor-default'
                  }`}
                >
                  <div className={`absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r ${tone.stripe}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                        {card.title}
                      </p>
                      <p className="mt-2 truncate text-[1.7rem] font-semibold leading-tight text-slate-900 dark:text-slate-100">
                        {valuesVisible ? formatValue(card.value, card.format) : maskedValue(card.format)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        {valuesVisible ? card.subtitle : 'Hidden until Show'}
                      </p>
                    </div>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.iconWrap}`}>
                      {valuesVisible ? <Icon className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
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
