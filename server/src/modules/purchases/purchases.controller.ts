import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { purchasesService } from './purchases.service';
import { purchaseSchema } from './purchases.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { assertBranchAccess, pickBranchForWrite, resolveBranchScope } from '../../utils/branchScope';
import { logAudit } from '../../utils/audit';

const loadSheetJs = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('xlsx') as any;
  } catch (_error) {
    throw ApiError.internal('Excel export dependency is missing. Install xlsx, then restart server.');
  }
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
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;
  const items = await purchasesService.listAllItems(scope, { search, supplierId, productId, branchId, from, to });
  return ApiResponse.success(res, { items });
});

export const listPurchases = asyncHandler(async (req: AuthRequest, res: Response) => {
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
  return ApiResponse.success(res, { purchase, items });
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
