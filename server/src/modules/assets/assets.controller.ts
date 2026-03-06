import { Response } from 'express';
import { z } from 'zod';
import { ApiResponse } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import { assetsService } from './assets.service';
import { ApiError } from '../../utils/ApiError';

const fixedAssetCreateSchema = z.object({
  assetName: z.string().trim().min(1, 'Asset name is required'),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchase date must be YYYY-MM-DD'),
  cost: z.coerce.number().positive('Cost must be greater than 0'),
  category: z.string().trim().optional(),
  status: z.string().trim().optional(),
  branchId: z.coerce.number().int().positive().optional(),
});

const fixedAssetUpdateSchema = z
  .object({
    assetName: z.string().trim().min(1, 'Asset name is required').optional(),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchase date must be YYYY-MM-DD')
      .optional(),
    cost: z.coerce.number().positive('Cost must be greater than 0').optional(),
    category: z.string().trim().optional(),
    status: z.string().trim().optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one field must be provided',
  });

export const listFixedAssets = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = (req.query.search as string | undefined)?.trim();
  const status = (req.query.status as string | undefined)?.trim();

  const assets = await assetsService.listFixedAssets(scope, {
    search: search || undefined,
    status: status || undefined,
  });

  return ApiResponse.success(res, { assets });
});

export const createFixedAsset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = fixedAssetCreateSchema.parse(req.body);

  const asset = await assetsService.createFixedAsset(
    {
      assetName: input.assetName,
      category: input.category,
      purchaseDate: input.purchaseDate,
      cost: input.cost,
      status: input.status || 'active',
      branchId: input.branchId,
    },
    scope,
    req.user?.userId || 0
  );

  return ApiResponse.created(res, { asset }, 'Fixed asset registered');
});

export const updateFixedAsset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Invalid asset id');
  }
  const input = fixedAssetUpdateSchema.parse(req.body);

  const asset = await assetsService.updateFixedAsset(
    id,
    {
      assetName: input.assetName,
      category: input.category,
      purchaseDate: input.purchaseDate,
      cost: input.cost,
      status: input.status,
    },
    scope
  );

  if (!asset) {
    throw ApiError.notFound('Fixed asset not found');
  }

  return ApiResponse.success(res, { asset }, 'Fixed asset updated');
});

export const deleteFixedAsset = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('Invalid asset id');
  }

  const deleted = await assetsService.deleteFixedAsset(id, scope);
  if (!deleted) {
    throw ApiError.notFound('Fixed asset not found');
  }

  return ApiResponse.success(res, null, 'Fixed asset deleted');
});
