import { ApiError } from '../../utils/ApiError';
import { resolveActiveBranchId } from '../../utils/branchScope';
import { AuthRequest } from '../../middlewares/requireAuth';

export type SelectionMode = 'all' | 'show';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const parseIsoDate = (value: string | undefined, fieldName: string): string => {
  if (!value) {
    throw ApiError.badRequest(`${fieldName} is required (YYYY-MM-DD)`);
  }
  if (!datePattern.test(value)) {
    throw ApiError.badRequest(`${fieldName} must be in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest(`${fieldName} is invalid`);
  }
  return value;
};

export const parseSelectionMode = (value: unknown): SelectionMode => {
  const normalized = String(value || 'all').toLowerCase();
  if (normalized === 'all' || normalized === 'show') {
    return normalized;
  }
  throw ApiError.badRequest('mode must be either "all" or "show"');
};

export const parseNumericId = (value: unknown, fieldName: string): number => {
  const id = Number(value);
  if (!id || Number.isNaN(id) || id <= 0) {
    throw ApiError.badRequest(`${fieldName} is invalid`);
  }
  return id;
};

export const parseDateRange = (req: AuthRequest) => {
  const fromDate = parseIsoDate(req.query.fromDate as string | undefined, 'fromDate');
  const toDate = parseIsoDate(req.query.toDate as string | undefined, 'toDate');
  if (fromDate > toDate) {
    throw ApiError.badRequest('fromDate cannot be after toDate');
  }
  return { fromDate, toDate };
};

export const resolveBranchIdForReports = (req: AuthRequest) => resolveActiveBranchId(req);

/** Shared SQL fragments for report queries */
export const NON_QUOTATION_SALES_WHERE = `COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`;
export const ACTIVE_SALE_SQL = 'COALESCE(s.is_deleted, 0) = 0';
export const ACTIVE_SALES_RETURN_SQL = 'COALESCE(sr.is_deleted, 0) = 0';
export const ACTIVE_PURCHASE_SQL = 'COALESCE(p.is_deleted, 0) = 0';
export const ACTIVE_PURCHASE_RETURN_SQL = 'COALESCE(pr.is_deleted, 0) = 0';

/** Supplier payments from both supplier_payments and finance supplier_receipts */
export const supplierPaymentsCteSql = (branchRef: string) => `
  payments AS (
    SELECT
      purchase_id,
      COALESCE(SUM(paid), 0)::double precision AS paid_amount
    FROM (
      SELECT sp.purchase_id, sp.amount_paid AS paid
        FROM ims.supplier_payments sp
       WHERE sp.branch_id = ${branchRef}
      UNION ALL
      SELECT sr.purchase_id, sr.amount AS paid
        FROM ims.supplier_receipts sr
       WHERE sr.branch_id = ${branchRef}
         AND sr.purchase_id IS NOT NULL
    ) combined
    WHERE purchase_id IS NOT NULL
    GROUP BY purchase_id
  )`;

/** Customer invoice payments from sale_payments and customer_receipts */
export const customerInvoicePaymentsCteSql = (branchRef: string, asOfDateRef: string) => `
  pay_sum AS (
    SELECT sale_id, COALESCE(SUM(paid), 0)::double precision AS paid
    FROM (
      SELECT sp.sale_id, sp.amount_paid AS paid
        FROM ims.sale_payments sp
       WHERE sp.branch_id = ${branchRef}
         AND sp.pay_date::date <= ${asOfDateRef}::date
      UNION ALL
      SELECT cr.sale_id, cr.amount AS paid
        FROM ims.customer_receipts cr
       WHERE cr.branch_id = ${branchRef}
         AND cr.sale_id IS NOT NULL
         AND cr.receipt_date::date <= ${asOfDateRef}::date
    ) combined
    WHERE sale_id IS NOT NULL
    GROUP BY sale_id
  )`;
