import { useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Boxes,
  Package,
  ReceiptText,
  RefreshCcw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { apiClient, type ApiResponse } from '../../services/api';
import { API } from '../../config/env';

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

type DashboardResponse = {
  cards: DashboardCard[];
  charts: DashboardChart[];
  recent: DashboardRecentRow[];
  summary: {
    modules: number;
    sections: number;
  };
  role: {
    role_id: number;
    role_name: string;
  };
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
    stripe: 'from-[#0e4e75] to-[#2d7faa]',
    iconWrap: 'bg-[#e5f2fb] text-[#0e4e75] dark:bg-[#1a4b69] dark:text-[#9ed2ef]',
  },
  {
    stripe: 'from-[#0f7a58] to-[#2ea27b]',
    iconWrap: 'bg-[#e5f7ee] text-[#0f7a58] dark:bg-[#1a4f41] dark:text-[#9de6cc]',
  },
  {
    stripe: 'from-[#4d5aa9] to-[#6f7bd2]',
    iconWrap: 'bg-[#edf1ff] text-[#4d5aa9] dark:bg-[#29376b] dark:text-[#bcc6ff]',
  },
  {
    stripe: 'from-[#b96f2c] to-[#d59452]',
    iconWrap: 'bg-[#fff0e1] text-[#b96f2c] dark:bg-[#5b3e26] dark:text-[#ffd2a8]',
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
    return 'border-[#bde0d3] bg-[#eaf8f1] text-[#0f7a58] dark:border-[#2f725b] dark:bg-[#123a30] dark:text-[#8ae1bf]';
  }
  if (normalized.includes('void') || normalized.includes('cancel')) {
    return 'border-[#f2c3c3] bg-[#fff0f0] text-[#b93232] dark:border-[#7c3434] dark:bg-[#3c1d1d] dark:text-[#ffabab]';
  }
  if (normalized.includes('unpaid') || normalized.includes('pending') || normalized.includes('partial')) {
    return 'border-[#f0d6be] bg-[#fff6eb] text-[#b8681f] dark:border-[#7c5b33] dark:bg-[#3d2d18] dark:text-[#ffc98d]';
  }
  return 'border-[#b9d4e6] bg-[#edf5fb] text-[#0f4f76] dark:border-[#2c6183] dark:bg-[#123b56] dark:text-[#9bcde8]';
};

const Dashboard = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [hasLoaded, setHasLoaded] = useState(false);

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

  const orderedCharts = useMemo(() => {
    if (!data?.charts) return [];
    const order = ['income-trend-12m', 'sales-6m', 'stock-14d'];
    return [...data.charts].sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
  }, [data?.charts]);

  const chartOptions = useMemo(() => {
    if (!orderedCharts.length) return {};

    const themeById: Record<string, { base: string; soft: string }> = isDark
      ? {
          'income-trend-12m': { base: '#4de0a3', soft: '#4de0a3' },
          'sales-6m': { base: '#75c7f3', soft: '#75c7f3' },
          'stock-14d': { base: '#b6beff', soft: '#b6beff' },
        }
      : {
          'income-trend-12m': { base: '#0b7f5a', soft: '#6fc9a6' },
          'sales-6m': { base: '#0e527b', soft: '#6aa9cd' },
          'stock-14d': { base: '#4056ba', soft: '#93a0ef' },
        };

    const axisColor = isDark ? '#d0e6f5' : '#274a61';
    const legendColor = isDark ? '#e2f3ff' : '#173f57';
    const gridColor = isDark ? '#2a5a78' : '#b7cede';

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
    if (chartId === 'stock-14d') return 'Daily net stock movement for the last 14 days';
    return 'Sales totals for the last 6 months';
  };

  const chartHasData = (chart: DashboardChart) => chart.series.some((series) => series.data.length > 0);
  const incomeTrendChart = orderedCharts.find((chart) => chart.id === 'income-trend-12m');
  const bottomCharts = orderedCharts.filter((chart) => chart.id !== 'income-trend-12m');
  const hasRenderableCharts = orderedCharts.some((chart) => !!chartOptions[chart.id] && chartHasData(chart));

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-[#b7cde0] bg-gradient-to-r from-[#f8fbff] via-[#eef5fb] to-[#e5eff8] p-6 shadow-sm dark:border-[#1f4a67] dark:bg-gradient-to-r dark:from-[#113751] dark:via-[#0f334b] dark:to-[#0b2739]">
        <div className="pointer-events-none absolute -right-20 top-[-60px] h-64 w-64 rounded-full bg-[#0f4f76]/10 blur-3xl dark:bg-[#7cc0e4]/20" />
        <div className="pointer-events-none absolute -left-20 -bottom-28 h-64 w-64 rounded-full bg-[#7cc0e4]/10 blur-3xl dark:bg-[#c5ecff]/16" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-[#4f6f87] dark:text-[#b7d1e4]">Inventory ERP</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[#123f5c] dark:text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-[#38576f] dark:text-[#d3e8f7]">
              {hasLoaded
                ? `Live metrics loaded | ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : ''}`
                : 'Click Display Dashboard to load live cards, charts, and activity.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-[#9fc3da] bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b4061] disabled:opacity-65 dark:border-[#2d6386] dark:bg-[#e8f3fb] dark:text-[#0f4f76] dark:hover:bg-white"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {!hasLoaded ? 'Display Dashboard' : loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-[#f2c3c3] bg-[#fff2f2] px-4 py-3 text-sm font-medium text-[#b93232] dark:border-[#7d3535] dark:bg-[#3a1d1d] dark:text-[#ffb9b9]">
          {error}
        </div>
      )}

      {!hasLoaded && !loading && (
        <section className="rounded-3xl border border-dashed border-[#9fc3da] bg-white/95 p-12 text-center shadow-sm dark:border-[#2f6385] dark:bg-[#0f334b]/80">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf5fb] text-[#0f4f76] dark:bg-[#154261] dark:text-[#9fd0ec]">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-[#123f5c] dark:text-[#f2f9ff]">Dashboard ready</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[#4f6f87] dark:text-[#b2cee0]">
            Press <span className="font-semibold">Display Dashboard</span> to render live metrics and chart trends.
          </p>
        </section>
      )}

      {loading && !data && hasLoaded && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`dash-skeleton-${index}`}
              className="h-28 animate-pulse rounded-2xl border border-[#c6d9e8] bg-gradient-to-br from-[#f7fbff] to-[#edf5fb] dark:border-[#2b5b7a] dark:bg-gradient-to-br dark:from-[#123a55] dark:to-[#0d2f45]"
            />
          ))}
        </section>
      )}

      {hasLoaded && data && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {data.cards.map((card, index) => {
              const tone = CARD_TONES[index % CARD_TONES.length];
              const Icon = card.icon && card.icon in ICONS ? ICONS[card.icon as keyof typeof ICONS] : TrendingUp;
              return (
                <article
                  key={card.id}
                  className="group relative overflow-hidden rounded-2xl border border-[#b7cde0] bg-gradient-to-br from-white via-[#f7fbff] to-[#edf5fb] p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md dark:border-[#1f4a67] dark:bg-gradient-to-br dark:from-[#123a55] dark:via-[#0f334b] dark:to-[#0d2f45]"
                >
                  <div className={`absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r ${tone.stripe}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.17em] text-[#4f6f87] dark:text-[#9fc0d7]">
                        {card.title}
                      </p>
                      <p className="mt-2 truncate text-[1.7rem] font-semibold leading-tight text-[#123f5c] dark:text-[#f2f9ff]">
                        {formatValue(card.value, card.format)}
                      </p>
                      <p className="mt-1 text-xs text-[#5d7c93] dark:text-[#b5cee0]">{card.subtitle}</p>
                    </div>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.iconWrap}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="space-y-5">
            {incomeTrendChart && chartOptions[incomeTrendChart.id] && chartHasData(incomeTrendChart) && (
              <article className="rounded-2xl border border-[#b7cde0] bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:border-[#1f4a67] dark:bg-[#0f334b]/88">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-[#123f5c] dark:text-[#e9f5ff]">
                      {incomeTrendChart.name}
                    </h3>
                    <p className="text-xs text-[#335973] dark:text-[#c4def0]">
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
                        ? 'border-[#9bd7bf] bg-[#e8f8f0] text-[#0f7a58] dark:border-[#2f725b] dark:bg-[#123a30] dark:text-[#8ae1bf]'
                        : 'border-[#f2c3c3] bg-[#fff0f0] text-[#b93232] dark:border-[#7c3434] dark:bg-[#3c1d1d] dark:text-[#ffb0b0]';

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

            {bottomCharts.length > 0 && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {bottomCharts.map((chart) => {
                  const options = chartOptions[chart.id];
                  if (!options || !chartHasData(chart)) return null;

                  return (
                    <article
                      key={chart.id}
                      className="rounded-2xl border border-[#b7cde0] bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:border-[#1f4a67] dark:bg-[#0f334b]/88"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                          <h3 className="text-base font-semibold text-[#123f5c] dark:text-[#e9f5ff]">{chart.name}</h3>
                          <p className="text-xs text-[#335973] dark:text-[#c4def0]">{getChartSubtitle(chart.id)}</p>
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

            {!hasRenderableCharts && (
              <article className="rounded-2xl border border-dashed border-[#b7cde0] bg-white/90 p-8 text-center text-[#5d7890] dark:border-[#2f6385] dark:bg-[#0f334b]/78 dark:text-[#b4cfe1]">
                No charts available for your current permissions.
              </article>
            )}
          </section>

          <section className="grid grid-cols-1 gap-5">
            <article className="rounded-2xl border border-[#b7cde0] bg-white/95 p-5 shadow-sm dark:border-[#1f4a67] dark:bg-[#0f334b]/88">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-[#123f5c] dark:text-[#e9f5ff]">Recent Activity</h3>
                  <p className="text-xs text-[#5f7f96] dark:text-[#b0cce0]">Latest sales and purchase transactions</p>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6d8aa0] dark:text-[#9ab9cf]">
                  Last {Math.min(10, data.recent.length)} records
                </span>
              </div>

              <div className="mt-4 overflow-x-auto custom-scrollbar">
                <table className="min-w-[680px] w-full">
                  <thead>
                    <tr className="border-b border-[#d8e5ef] text-left text-[11px] uppercase tracking-[0.18em] text-[#5d7890] dark:border-[#23506d] dark:text-[#9ab9cf]">
                      <th className="px-2 py-3">Type</th>
                      <th className="px-2 py-3">Reference</th>
                      <th className="px-2 py-3">Amount</th>
                      <th className="px-2 py-3">Date</th>
                      <th className="px-2 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((row) => (
                      <tr key={row.id} className="border-b border-[#ebf2f8] dark:border-[#1b4662]">
                        <td className="px-2 py-3 text-sm font-semibold text-[#123f5c] dark:text-[#ecf7ff]">{row.type}</td>
                        <td className="px-2 py-3 text-sm text-[#57748c] dark:text-[#b5cee0]">{row.ref}</td>
                        <td className="px-2 py-3 text-sm text-[#2c4a62] dark:text-[#d4e6f4]">{formatValue(row.amount, 'currency')}</td>
                        <td className="px-2 py-3 text-sm text-[#57748c] dark:text-[#b5cee0]">{formatDateTime(row.date)}</td>
                        <td className="px-2 py-3 text-right">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.recent.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-8 text-center text-sm text-[#6b879d] dark:text-[#b0cce0]">
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
    </div>
  );
};

export default Dashboard;
