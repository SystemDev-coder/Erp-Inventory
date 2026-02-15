import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middlewares/requireAuth';
import { pickBranchForWrite, resolveBranchScope } from '../../utils/branchScope';
import { accountsService } from './accounts.service';
import { accountSchema, accountUpdateSchema } from './accounts.schemas';

export const listAccounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const accounts = await accountsService.list(scope);
  return ApiResponse.success(res, { accounts });
});

export const createAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = accountSchema.parse(req.body);
  const branchId = pickBranchForWrite(scope, input.branchId);

  const existing = await accountsService.findByNameAndCurrency(
    input.name,
    input.currencyCode || 'USD',
    branchId
  );
  if (existing) {
    return ApiResponse.success(res, { account: existing }, 'Account already exists in this branch');
  }

  const account = await accountsService.create(input, { branchId });
  return ApiResponse.created(res, { account }, 'Account created');
});

export const updateAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid account id');
  }

  const input = accountUpdateSchema.parse(req.body);
  const account = await accountsService.update(id, input, scope);
  if (!account) throw ApiError.notFound('Account not found');
  return ApiResponse.success(res, { account }, 'Account updated');
});

export const deleteAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid account id');
  }

  await accountsService.remove(id, scope);
  return ApiResponse.success(res, null, 'Account deleted');
});
