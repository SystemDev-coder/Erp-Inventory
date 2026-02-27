import type { ReportColumn, ReportTotalItem } from '../../components/reports/ReportModal';

export type TabId = 'sales' | 'inventory' | 'purchase' | 'financial' | 'hr' | 'customer';

export type ModalReportState = {
  title: string;
  subtitle?: string;
  fileName: string;
  data: Record<string, unknown>[];
  columns: ReportColumn<Record<string, unknown>>[];
  filters: Record<string, string | number>;
  totals?: ReportTotalItem[];
  variant?: 'default' | 'income-statement' | 'balance-sheet';
};

export type DateRange = {
  fromDate: string;
  toDate: string;
};
