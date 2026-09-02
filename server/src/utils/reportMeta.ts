export type ReportMeta = {
  branchId: number;
  generatedAt: string;
  rowCount: number;
  truncated: boolean;
  maxRows?: number;
};

export const buildReportMeta = (
  branchId: number,
  rowCount: number,
  maxRows?: number
): ReportMeta => ({
  branchId,
  generatedAt: new Date().toISOString(),
  rowCount,
  truncated: maxRows ? rowCount >= maxRows : false,
  ...(maxRows ? { maxRows } : {}),
});

export const withReportMeta = <T extends Record<string, unknown>>(
  payload: T,
  branchId: number,
  rows: unknown[],
  maxRows?: number
) => ({
  ...payload,
  meta: buildReportMeta(branchId, rows.length, maxRows),
});

/** Standard row limits used by report SQL queries (keep in sync with service LIMIT clauses). */
export const REPORT_ROW_LIMITS = {
  salesByStore: 250,
  topCustomers: 200,
  salesByCustomer: 1500,
  salesByProduct: 2000,
  topSellingItems: 200,
  detail: 5000,
  customerList: 2000,
  customerLedger: 4000,
  customerPayments: 3000,
  supplierLedger: 4000,
  supplierWise: 2000,
  bestSuppliers: 200,
  priceVariance: 500,
  profitAnalysis: 500,
  generalLedger: 3000,
  receiptsPayments: 4000,
  storeWiseStock: 4000,
  storeMovementDetail: 8000,
  employeeLedger: 5000,
} as const;

export const reportRows = <T extends Record<string, unknown>>(
  branchId: number,
  payload: T,
  rows: unknown[],
  maxRows?: number
) => withReportMeta({ branchId, ...payload }, branchId, rows, maxRows);
