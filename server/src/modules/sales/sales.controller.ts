import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { salesService } from './sales.service';
import {
  quotationConvertSchema,
  saleSchema,
  saleUpdateSchema,
  saleVoidSchema,
} from './sales.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { assertBranchAccess, pickBranchForWrite, resolveBranchScope } from '../../utils/branchScope';

export const listSales = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = (req.query.search as string) || undefined;
  const status = (req.query.status as string) || undefined;
  const docType = (req.query.docType as string) || undefined;
  const includeVoided = String(req.query.includeVoided || '').toLowerCase() === 'true';
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId) {
    assertBranchAccess(scope, branchId);
  }
  const sales = await salesService.listSales(scope, {
    search,
    status,
    docType,
    includeVoided,
    branchId,
  });
  return ApiResponse.success(res, { sales });
});

export const listSaleItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!id) {
    throw ApiError.badRequest('Invalid sale id');
  }
  const sale = await salesService.getSale(id, scope);
  if (!sale) {
    throw ApiError.notFound('Sale not found');
  }
  const items = await salesService.listItems(id);
  return ApiResponse.success(res, { items });
});

export const getSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const sale = await salesService.getSale(id, scope);
  if (!sale) {
    throw ApiError.notFound('Sale not found');
  }
  const items = await salesService.listItems(id);
  return ApiResponse.success(res, { sale, items });
});

export const createSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = saleSchema.parse(req.body);
  const branchId = pickBranchForWrite(scope, input.branchId);
  const userId = req.user?.userId ?? 1;
  const sale = await salesService.createSale(input, { branchId, userId });
  return ApiResponse.created(res, { sale }, 'Sale created');
});

export const updateSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!id) throw ApiError.badRequest('Invalid sale id');
  const input = saleUpdateSchema.parse(req.body);
  const sale = await salesService.updateSale(id, input, scope, { userId: req.user?.userId ?? null });
  if (!sale) throw ApiError.notFound('Sale not found');
  return ApiResponse.success(res, { sale }, 'Sale updated');
});

export const voidSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!id) throw ApiError.badRequest('Invalid sale id');
  const input = saleVoidSchema.parse(req.body || {});
  const sale = await salesService.voidSale(id, input.reason, scope, { userId: req.user?.userId ?? null });
  if (!sale) throw ApiError.notFound('Sale not found');
  return ApiResponse.success(res, { sale }, 'Sale voided');
});

export const convertQuotation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!id) throw ApiError.badRequest('Invalid sale id');
  const input = quotationConvertSchema.parse(req.body || {});
  const sale = await salesService.convertQuotation(id, input, scope, { userId: req.user?.userId ?? null });
  if (!sale) throw ApiError.notFound('Quotation not found');
  return ApiResponse.success(res, { sale }, 'Quotation converted to invoice');
});

export const deleteSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!id) throw ApiError.badRequest('Invalid sale id');
  await salesService.deleteSale(id, scope);
  return ApiResponse.success(res, null, 'Sale deleted');
});

