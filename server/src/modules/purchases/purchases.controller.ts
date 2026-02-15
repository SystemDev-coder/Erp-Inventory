import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { purchasesService } from './purchases.service';
import { purchaseSchema } from './purchases.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { assertBranchAccess, pickBranchForWrite, resolveBranchScope } from '../../utils/branchScope';

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
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId) {
    assertBranchAccess(scope, branchId);
  }
  const purchases = await purchasesService.listPurchases(scope, search, status, branchId);
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
  return ApiResponse.success(res, null, 'Purchase deleted');
});
