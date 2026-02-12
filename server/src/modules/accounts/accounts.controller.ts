import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { accountsService } from './accounts.service';
import { accountSchema, accountUpdateSchema } from './accounts.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';

export const listAccounts = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const accounts = await accountsService.list();
  return ApiResponse.success(res, { accounts });
});

export const createAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = accountSchema.parse(req.body);
  // If an account with same name and currency exists, skip duplicate create
  const existing = await accountsService.findByNameAndCurrency(input.name, input.currencyCode || 'USD');
  if (existing) {
    return ApiResponse.success(res, { account: existing }, 'Account already exists');
  }
  const account = await accountsService.create(input);
  return ApiResponse.created(res, { account }, 'Account created');
});

export const updateAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = accountUpdateSchema.parse(req.body);
  const account = await accountsService.update(id, input);
  if (!account) throw ApiError.notFound('Account not found');
  return ApiResponse.success(res, { account }, 'Account updated');
});

export const deleteAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await accountsService.remove(id);
  return ApiResponse.success(res, null, 'Account deleted');
});
