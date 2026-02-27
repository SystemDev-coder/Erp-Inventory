import type { ReportColumn, ReportTableTotals, ReportTotalItem } from '../../components/reports/ReportModal';

export type TabId = 'sales' | 'inventory' | 'purchase' | 'financial' | 'hr' | 'customer';

export type ModalReportState = {
  title: string;
  subtitle?: string;
  fileName: string;
  data: Record<string, unknown>[];
  columns: ReportColumn<Record<string, unknown>>[];
  filters: Record<string, string | number>;
  totals?: ReportTotalItem[];
  tableTotals?: ReportTableTotals;
  variant?: 'default' | 'income-statement' | 'balance-sheet' | 'cash-flow-statement';
};

export type DateRange = {
  fromDate: string;
  toDate: string;
};
