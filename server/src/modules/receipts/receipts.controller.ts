import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { receiptsService } from './receipts.service';
import { receiptSchema } from './receipts.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';

export const listReceipts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const search = (req.query.search as string) || undefined;
  const receipts = await receiptsService.listReceipts(search);
  return ApiResponse.success(res, { receipts });
});

export const createReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = receiptSchema.parse(req.body);
  const branchId = req.user?.branchId ?? 1;
  const userId = req.user?.userId ?? 1;
  const receipt = await receiptsService.createReceipt(input, { branchId, userId });
  return ApiResponse.created(res, { receipt }, 'Receipt recorded');
});

export const updateReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = receiptSchema.partial().parse(req.body);
  const receipt = await receiptsService.updateReceipt(id, input);
  if (!receipt) throw ApiError.notFound('Receipt not found');
  return ApiResponse.success(res, { receipt }, 'Receipt updated');
});

export const deleteReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id) throw ApiError.badRequest('Invalid receipt id');
  await receiptsService.deleteReceipt(id);
  return ApiResponse.success(res, null, 'Receipt deleted');
});
