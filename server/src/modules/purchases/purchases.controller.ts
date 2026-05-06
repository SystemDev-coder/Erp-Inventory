import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { purchasesService } from './purchases.service';
import { purchaseSchema } from './purchases.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { assertBranchAccess, pickBranchForWrite, resolveBranchScope } from '../../utils/branchScope';
import { logAudit } from '../../utils/audit';
import { queryMany, queryOne } from '../../db/query';

const loadSheetJs = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('xlsx') as any;
  } catch (_error) {
    throw ApiError.internal('Excel export dependency is missing. Install xlsx, then restart server.');
  }
};

const normalizeDateParam = (value: unknown, label: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  // ISO yyyy-mm-dd (preferred)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Common UI format mm/dd/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [mm, dd, yyyy] = raw.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Epoch seconds/millis
  if (/^\d+$/.test(raw)) {
    const num = Number(raw);
    if (!Number.isFinite(num)) throw ApiError.badRequest(`${label} is invalid date`);
    const ms = raw.length <= 10 ? num * 1000 : num;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`${label} is invalid date`);
    return d.toISOString().slice(0, 10);
  }

  // Last resort parsing
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  throw ApiError.badRequest(`${label} is invalid date`);
};

export const listPurchaseItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = (req.query.search as string) || undefined;
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId) {
    assertBranchAccess(scope, branchId);
  }
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
  const productId = req.query.productId ? Number(req.query.productId) : undefined;
  const from = normalizeDateParam(req.query.from, 'from');
  const to = normalizeDateParam(req.query.to, 'to');
  if ((from && !to) || (!from && to)) {
    throw ApiError.badRequest('Both from and to are required together');
  }
  if (from && to && from > to) {
    throw ApiError.badRequest('from cannot be after to');
  }
  const items = await purchasesService.listAllItems(scope, { search, supplierId, productId, branchId, from, to });
  return ApiResponse.success(res, { items });
});

export const listPurchases = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = (req.query.search as string) || undefined;
  const status = (req.query.status as string) || undefined;
  const fromDate = normalizeDateParam(req.query.fromDate, 'fromDate');
  const toDate = normalizeDateParam(req.query.toDate, 'toDate');
  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    throw ApiError.badRequest('Both fromDate and toDate are required together');
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw ApiError.badRequest('fromDate cannot be after toDate');
  }
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId) {
    assertBranchAccess(scope, branchId);
  }
  const purchases = await purchasesService.listPurchases(scope, search, status, branchId, fromDate, toDate);
  return ApiResponse.success(res, { purchases });
});

export const getPurchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const purchase = await purchasesService.getPurchase(id, scope);
  if (!purchase) {
    throw ApiError.notFound('Purchase not found');
  }
  const items = await purchasesService.listItems(id);
  const branchId = Number((purchase as any).branch_id || 0);

  const paidFromPayments = await queryOne<{ amount: string }>(
    `SELECT COALESCE(SUM(amount_paid), 0)::text AS amount
       FROM ims.supplier_payments
      WHERE branch_id = $1
        AND purchase_id = $2`,
    [branchId, id]
  );
  const totalPaid = Number(paidFromPayments?.amount || 0);

  const paymentAccounts = await queryMany<{ acc_id: number; account_name: string; amount: number }>(
    `SELECT
        p.acc_id::bigint AS acc_id,
        COALESCE(a.name, 'Account') AS account_name,
        COALESCE(SUM(p.amount_paid), 0)::double precision AS amount
       FROM ims.supplier_payments p
       LEFT JOIN ims.accounts a ON a.acc_id = p.acc_id
      WHERE p.branch_id = $1
        AND p.purchase_id = $2
      GROUP BY p.acc_id, a.name
      ORDER BY p.acc_id ASC`,
    [branchId, id]
  );

  return ApiResponse.success(res, {
    purchase: {
      ...purchase,
      paid_amount: totalPaid,
    },
    items,
    paymentSummary: {
      total_paid: totalPaid,
      accounts: paymentAccounts || [],
    },
  });
});

export const createPurchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = purchaseSchema.parse(req.body);
  const branchId = pickBranchForWrite(scope, input.branchId);
  const userId = req.user?.userId ?? 1;
  const purchase = await purchasesService.createPurchase(input, { branchId, userId });
  return ApiResponse.created(res, { purchase }, 'Purchase created');
});

export const updatePurchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const input = purchaseSchema.partial().parse(req.body);
  const purchase = await purchasesService.updatePurchase(id, input, scope);
  if (!purchase) {
    throw ApiError.notFound('Purchase not found');
  }
  return ApiResponse.success(res, { purchase }, 'Purchase updated');
});

export const deletePurchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  await purchasesService.deletePurchase(id, scope);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'purchases',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });

  return ApiResponse.success(res, null, 'Purchase deleted');
});

export const exportPurchasesXlsx = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = (req.query.search as string) || undefined;
  const status = (req.query.status as string) || undefined;
  const fromDate = (req.query.fromDate as string) || undefined;
  const toDate = (req.query.toDate as string) || undefined;
  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    throw ApiError.badRequest('Both fromDate and toDate are required together');
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw ApiError.badRequest('fromDate cannot be after toDate');
  }
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId) {
    assertBranchAccess(scope, branchId);
  }

  const purchases = await purchasesService.listPurchases(scope, search, status, branchId, fromDate, toDate);
  const XLSX = loadSheetJs();

  const rows = purchases.map((p: any) => ({
    purchase_id: p.purchase_id,
    purchase_date: p.purchase_date,
    supplier_name: p.supplier_name ?? '',
    purchase_type: p.purchase_type,
    subtotal: p.subtotal,
    discount: p.discount,
    total: p.total,
    status: p.status,
    note: p.note ?? '',
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Purchases');

  const buffer: Buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const today = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="purchases_${today}.xlsx"`);
  return res.status(200).send(buffer);
});
