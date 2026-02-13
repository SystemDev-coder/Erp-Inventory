import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { salesService } from './sales.service';
import { saleSchema } from './sales.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';

export const listSales = asyncHandler(async (req: AuthRequest, res: Response) => {
  const search = (req.query.search as string) || undefined;
  const status = (req.query.status as string) || undefined;
  const sales = await salesService.listSales(search, status);
  return ApiResponse.success(res, { sales });
});

export const listSaleItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    throw ApiError.badRequest('Invalid sale id');
  }
  const items = await salesService.listItems(id);
  return ApiResponse.success(res, { items });
});

export const getSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const sale = await salesService.getSale(id);
  if (!sale) {
    throw ApiError.notFound('Sale not found');
  }
  const items = await salesService.listItems(id);
  return ApiResponse.success(res, { sale, items });
});

export const createSale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = saleSchema.parse(req.body);
  const branchId = req.user?.branchId ?? 1;
  const userId = req.user?.userId ?? 1;
  const sale = await salesService.createSale(input, { branchId, userId });
  return ApiResponse.created(res, { sale }, 'Sale created');
});

// Update and delete endpoints can be added later when needed; for now the UI only creates sales.

