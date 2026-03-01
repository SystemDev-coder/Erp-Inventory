import { Response } from 'express';
import { z } from 'zod';
import { ApiResponse } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import { assetsService } from './assets.service';

const fixedAssetCreateSchema = z.object({
  assetName: z.string().trim().min(1, 'Asset name is required'),
  category: z.string().trim().min(1, 'Category is required'),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchase date must be YYYY-MM-DD'),
  cost: z.coerce.number().positive('Cost must be greater than 0'),
  status: z.string().trim().optional(),
  branchId: z.coerce.number().int().positive().optional(),
});

export const listFixedAssets = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const search = (req.query.search as string | undefined)?.trim();
  const status = (req.query.status as string | undefined)?.trim();
  const category = (req.query.category as string | undefined)?.trim();

  const assets = await assetsService.listFixedAssets(scope, {
    search: search || undefined,
    status: status || undefined,
    category: category || undefined,
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
      usefulLifeMonths: 12,
      depreciationMethod: 'straight_line',
      notes: null,
      status: input.status || 'active',
      branchId: input.branchId,
    },
    scope,
    req.user?.userId || 0
  );

  return ApiResponse.created(res, { asset }, 'Fixed asset registered');
});
