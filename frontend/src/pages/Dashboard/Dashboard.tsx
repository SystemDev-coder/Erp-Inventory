import { useEffect, useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import {
  TrendingUp,
  ReceiptText,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { apiClient, ApiResponse } from '../../services/api';
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
} as const;

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

const Dashboard = () => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient
      .get<DashboardResponse>(API.DASHBOARD)
      .then((res: ApiResponse<DashboardResponse>) => {
        if (!active) return;
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setData(null);
        }
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const chartOptions = useMemo(() => {
    if (!data?.charts) return {};

    const base: ApexOptions = {
      chart: {
        toolbar: { show: false },
        fontFamily: 'Outfit, sans-serif',
      },
      plotOptions: {},
      grid: {
        borderColor: '#1f2937',
        strokeDashArray: 4,
      },
      xaxis: {
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: '#94a3b8' } },
      },
      yaxis: {
        labels: { style: { colors: '#94a3b8' } },
      },
      legend: {
        show: true,
        position: 'top',
        labels: { colors: '#cbd5f5' },
      },
    };

    return data.charts.reduce<Record<string, ApexOptions>>((acc, chart) => {
      const chartType = chart.type === 'bar' ? 'bar' : 'line';
      acc[chart.id] = {
        ...base,
        chart: { ...base.chart, type: chartType, height: 260 },
        colors: chart.type === 'bar' ? ['#60a5fa'] : ['#22d3ee'],
        stroke: chart.type === 'bar' ? { width: 0 } : { curve: 'smooth', width: 3 },
        plotOptions:
          chart.type === 'bar'
            ? {
                bar: {
                  columnWidth: '42%',
                  borderRadius: 6,
                },
              }
            : {},
        fill:
          chart.type === 'bar'
            ? { type: 'solid', opacity: 1 }
            : {
                type: 'gradient',
                gradient: { opacityFrom: 0.45, opacityTo: 0 },
              },
        dataLabels: { enabled: false },
        xaxis: { ...base.xaxis, categories: chart.labels },
      };
      return acc;
    }, {});
  }, [data?.charts]);

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_top_left,_#0f172a,_#0b1120_60%)] px-6 py-8 sm:px-10">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute -top-24 -right-20 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
              KeydMaal Insights
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Welcome Back
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Role: {data?.role?.role_name ?? 'Loading...'} · Live system pulse
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-200/80">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
              Real-time overview
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
              Powered by live data
            </span>
          </div>
        </div>
      </section>

      {loading && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 p-8 text-slate-500">
          Loading dashboard...
        </div>
      )}

      {!loading && data && (
        <>
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {data.cards.map((card) => {
              const Icon =
                card.icon && card.icon in ICONS
                  ? ICONS[card.icon as keyof typeof ICONS]
                  : TrendingUp;
              return (
                <div
                  key={card.id}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-br from-slate-50/80 via-transparent to-transparent dark:from-slate-800/40" />
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        {card.title}
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">
                        {formatValue(card.value, card.format)}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">{card.subtitle}</p>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {data.charts.map((chart) => {
              const options = chartOptions[chart.id];
              if (!options || !chart.series || chart.series.length === 0) return null;
              const chartType = chart.type === 'bar' ? 'bar' : 'line';
              return (
                <div
                  key={chart.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
                >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {chart.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Live metrics for your branch
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    Real Data
                  </span>
                </div>
                <div className="mt-4">
                  <Chart
                    options={options}
                    series={chart.series}
                    type={chartType}
                    height={260}
                  />
                </div>
              </div>
            )})}
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Recent Activity
                </h3>
                <p className="text-xs text-slate-500">
                  Latest transactions across sales, purchases, and stock
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Updated live
              </span>
            </div>
            <div className="mt-4 max-w-full overflow-x-auto custom-scrollbar">
              <table className="min-w-[640px] w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    <th className="py-3 pr-3">Type</th>
                    <th className="py-3 pr-3">Reference</th>
                    <th className="py-3 pr-3">Amount</th>
                    <th className="py-3 pr-3">Date</th>
                    <th className="py-3 pr-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.slice(0, 8).map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-200 dark:border-slate-800"
                    >
                      <td className="py-3 pr-3 font-medium text-slate-900 dark:text-white">
                        {row.type}
                      </td>
                      <td className="py-3 pr-3 text-slate-500">{row.ref}</td>
                      <td className="py-3 pr-3 text-slate-700 dark:text-slate-300">
                        {formatValue(row.amount, 'currency')}
                      </td>
                      <td className="py-3 pr-3 text-slate-500">
                        {new Date(row.date).toLocaleString()}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <span className="inline-flex items-center rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-200">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Dashboard;
