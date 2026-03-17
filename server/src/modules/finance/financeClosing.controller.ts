import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import {
  closingActionSchema,
  closingPeriodCreateSchema,
  closingPeriodUpdateSchema,
  closingPeriodsQuerySchema,
  closingReopenSchema,
  profitShareRuleUpsertSchema,
  profitDistributionSchema,
} from './financeClosing.schemas';
import { financeClosingService } from './financeClosing.service';

export const listClosingPeriods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const query = closingPeriodsQuerySchema.parse(req.query);
  const periods = await financeClosingService.listPeriods(scope, query);
  return ApiResponse.success(res, { periods });
});

export const createClosingPeriod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = closingPeriodCreateSchema.parse(req.body);
  const userId = req.user?.userId ?? null;
  const period = await financeClosingService.createPeriod(scope, input, userId);
  return ApiResponse.created(res, { period }, 'Closing period created');
});

export const updateClosingPeriod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');
  const input = closingPeriodUpdateSchema.parse(req.body || {});
  const userId = req.user?.userId ?? null;
  const period = await financeClosingService.updatePeriod(scope, closingId, input, userId);
  return ApiResponse.success(res, { period }, 'Closing period updated');
});

export const previewClosingPeriod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');
  const input = closingActionSchema.parse(req.body || {});
  const userId = req.user?.userId ?? null;
  const preview = await financeClosingService.previewClose(scope, closingId, input, userId);
  return ApiResponse.success(res, { preview });
});

export const closeClosingPeriod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');
  const input = closingActionSchema.parse(req.body || {});
  const userId = req.user?.userId ?? null;
  const result = await financeClosingService.closePeriod(scope, closingId, input, userId);
  return ApiResponse.success(res, { result }, 'Finance closing completed');
});

export const reopenClosingPeriod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');
  const input = closingReopenSchema.parse(req.body || {});
  const userId = req.user?.userId ?? null;
  const period = await financeClosingService.reopenPeriod(scope, closingId, input, userId);
  return ApiResponse.success(res, { period }, 'Closing period reopened');
});

export const getClosingSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');
  const summary = await financeClosingService.getSummary(scope, closingId);
  return ApiResponse.success(res, { summary });
});

export const postProfitDistribution = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');
  profitDistributionSchema.parse(req.body || {});
  const userId = req.user?.userId ?? null;
  const result = await financeClosingService.postProfitDistribution(scope, closingId, userId);
  return ApiResponse.success(res, { result }, 'Profit distribution posted');
});

export const listProfitShareRules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const rules = await financeClosingService.listRules(scope, branchId);
  return ApiResponse.success(res, { rules });
});

export const saveProfitShareRule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = profitShareRuleUpsertSchema.parse(req.body);
  const userId = req.user?.userId ?? null;
  const rule = await financeClosingService.saveRule(scope, input, userId);
  return ApiResponse.success(res, { rule }, 'Profit sharing rule saved');
});

export const runScheduledClosings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const userId = req.user?.userId ?? null;
  const result = await financeClosingService.runScheduledClosings(scope, userId);
  return ApiResponse.success(res, { result }, 'Scheduled closing run completed');
});
