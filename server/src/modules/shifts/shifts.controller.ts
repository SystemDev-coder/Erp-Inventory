import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middlewares/requireAuth';
import {
  closeShiftSchema,
  listShiftsQuerySchema,
  openShiftSchema,
} from './shifts.schemas';
import { shiftsService } from './shifts.service';
import { resolveBranchScope } from '../../utils/branchScope';

export const listShifts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const query = listShiftsQuerySchema.parse(req.query);
  const shifts = await shiftsService.list(scope, query);
  return ApiResponse.success(res, { shifts });
});

export const openShift = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = openShiftSchema.parse(req.body);
  const userId = Number(req.user?.userId || 0);
  if (!userId) {
    throw ApiError.unauthorized('Authentication required');
  }

  const shift = await shiftsService.open(scope, userId, input);
  return ApiResponse.created(res, { shift }, 'Shift opened');
});

export const closeShift = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const input = closeShiftSchema.parse(req.body);
  const shift = await shiftsService.close(scope, id, input);
  if (!shift) throw ApiError.notFound('Shift not found');
  return ApiResponse.success(res, { shift }, 'Shift closed');
});

export const voidShift = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  const shift = await shiftsService.void(scope, id);
  if (!shift) throw ApiError.notFound('Shift not found');
  return ApiResponse.success(res, { shift }, 'Shift voided');
});

