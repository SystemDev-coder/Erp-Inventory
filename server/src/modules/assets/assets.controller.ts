import { Response } from 'express';
import { z } from 'zod';
import { ApiResponse } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import { assetsService } from './assets.service';
import { ApiError } from '../../utils/ApiError';

const assetCreateSchema = z.object({
  assetName: z.string().trim().min(1, 'Asset name is required'),
  type: z.enum(['current', 'fixed']),
  purchasedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchased date must be YYYY-MM-DD').optional(),
  amount: z.coerce.number().min(0, 'Amount must be zero or positive'),
  state: z.enum(['active', 'inactive', 'disposed']).optional(),
  branchId: z.coerce.number().int().positive().optional(),
});

const assetUpdateSchema = z
  .object({
    assetName: z.string().trim().min(1, 'Asset name is required').optional(),
    type: z.enum(['current', 'fixed']).optional(),
    purchasedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchased date must be YYYY-MM-DD').optional(),
    amount: z.coerce.number().min(0, 'Amount must be zero or positive').optional(),
    state: z.enum(['active', 'inactive', 'disposed']).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one field must be provided',
  });

export const listAssets = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = (req.query.search as string | undefined)?.trim();
  const type = (req.query.type as string | undefined)?.trim() as any;
  const state = (req.query.state as string | undefined)?.trim();
  const fromDate = (req.query.fromDate as string) || undefined;
  const toDate = (req.query.toDate as string) || undefined;
  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    throw ApiError.badRequest('Both fromDate and toDate are required together');
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw ApiError.badRequest('fromDate cannot be after toDate');
  }

  const assets = await assetsService.listAssets(scope, {
    search: search || undefined,
    type: type || undefined,
    state: state || undefined,
    fromDate,
    toDate,
  });

  return ApiResponse.success(res, { assets });
});

export const createAsset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = assetCreateSchema.parse(req.body);

  const asset = await assetsService.createAsset(
    {
      assetName: input.assetName,
      type: input.type,
      purchasedDate: input.purchasedDate,
      amount: input.amount,
      state: input.state || 'active',
      branchId: input.branchId,
    },
    scope,
    req.user?.userId || 0
  );

  return ApiResponse.created(res, { asset }, 'Asset saved');
});

export const updateAsset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Invalid asset id');
  }
  const input = assetUpdateSchema.parse(req.body);

  const asset = await assetsService.updateAsset(
    id,
    {
      assetName: input.assetName,
      type: input.type,
      purchasedDate: input.purchasedDate,
      amount: input.amount,
      state: input.state,
    },
    scope
  );

  if (!asset) {
    throw ApiError.notFound('Asset not found');
  }

  return ApiResponse.success(res, { asset }, 'Asset updated');
});

export const deleteAsset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Invalid asset id');
  }

  const deleted = await assetsService.deleteAsset(id, scope);
  if (!deleted) {
    throw ApiError.notFound('Asset not found');
  }

  return ApiResponse.success(res, null, 'Asset deleted');
});
