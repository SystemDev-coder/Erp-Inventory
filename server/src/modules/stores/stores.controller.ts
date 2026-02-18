import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import { storesService } from './stores.service';
import {
  storeCreateSchema,
  storeItemListQuerySchema,
  storeItemSchema,
  storeListQuerySchema,
  storeUpdateSchema,
} from './stores.schemas';

export const listStores = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const filters = storeListQuerySchema.parse(req.query);
  const result = await storesService.list(scope, filters);
  return ApiResponse.success(res, {
    stores: result.rows,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 0,
    },
  });
});

export const getStore = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const scope = await resolveBranchScope(req);
  const store = await storesService.get(id, scope);
  if (!store) throw ApiError.notFound('Store not found');
  return ApiResponse.success(res, { store });
});

export const createStore = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = storeCreateSchema.parse(req.body);
  const scope = await resolveBranchScope(req);
  const store = await storesService.create(input, scope);
  return ApiResponse.created(res, { store }, 'Store created');
});

export const updateStore = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = storeUpdateSchema.parse(req.body);
  const scope = await resolveBranchScope(req);
  const store = await storesService.update(id, input, scope);
  if (!store) throw ApiError.notFound('Store not found');
  return ApiResponse.success(res, { store }, 'Store updated');
});

export const deleteStore = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const scope = await resolveBranchScope(req);
  await storesService.delete(id, scope);
  return ApiResponse.success(res, null, 'Store deleted');
});

export const listStoreItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const storeId = Number(req.params.id);
  const scope = await resolveBranchScope(req);
  const filters = storeItemListQuerySchema.parse(req.query);
  const result = await storesService.listItems(storeId, scope, filters);
  return ApiResponse.success(res, {
    items: result.rows,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 0,
    },
  });
});

export const addStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const storeId = Number(req.params.id);
  const input = storeItemSchema.parse(req.body);
  const scope = await resolveBranchScope(req);
  const item = await storesService.addItem(storeId, input, scope);
  return ApiResponse.created(res, { item }, 'Item added');
});

export const updateStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const storeId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const quantity = Number(req.body.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw ApiError.badRequest('Valid quantity required');
  }
  const scope = await resolveBranchScope(req);
  const item = await storesService.updateItemQuantity(storeId, itemId, quantity, scope);
  if (!item) throw ApiError.notFound('Store item not found');
  return ApiResponse.success(res, { item }, 'Item updated');
});

export const removeStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const storeId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const scope = await resolveBranchScope(req);
  await storesService.removeItem(storeId, itemId, scope);
  return ApiResponse.success(res, null, 'Item removed');
});
