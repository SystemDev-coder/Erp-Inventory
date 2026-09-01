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
