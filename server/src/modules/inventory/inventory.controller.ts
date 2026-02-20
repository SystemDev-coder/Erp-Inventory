import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { inventoryService } from './inventory.service';
import {
  stockQuerySchema,
  movementQuerySchema,
  adjustmentListQuerySchema,
  recountListQuerySchema,
  adjustmentSchema,
  transferSchema,
  recountSchema,
  locationQuerySchema,
  branchCreateSchema,
  branchUpdateSchema,
  warehouseCreateSchema,
  warehouseUpdateSchema,
  inventoryTransactionListSchema,
  inventoryTransactionSchema,
} from './inventory.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { ApiError } from '../../utils/ApiError';
import { logAudit } from '../../utils/audit';
import { assertBranchAccess, resolveBranchScope } from '../../utils/branchScope';

const sanitizeQuery = (query: any) => {
  const cleaned: Record<string, any> = { ...query };
  ['branchId', 'whId', 'productId', 'itemId', 'includeInactive'].forEach((k) => {
    if (
      cleaned[k] === undefined ||
      cleaned[k] === null ||
      cleaned[k] === '' ||
      cleaned[k] === 'undefined' ||
      cleaned[k] === 'null'
    ) {
      delete cleaned[k];
    }
  });
  return cleaned;
};

export const listStock = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const filters = stockQuerySchema.parse(sanitizeQuery(req.query));
  if (filters.branchId) {
    assertBranchAccess(scope, filters.branchId);
  }
  const rows = await inventoryService.listStock({
    ...filters,
    branchIds: scope.isAdmin ? undefined : scope.branchIds,
  });
  return ApiResponse.success(res, { rows });
});

export const listItems = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const filters = stockQuerySchema.parse(sanitizeQuery(req.query));
  if (filters.branchId) {
    assertBranchAccess(scope, filters.branchId);
  }
  const items = await inventoryService.listPurchasedItems({
    ...filters,
    branchIds: scope.isAdmin ? undefined : scope.branchIds,
  });
  return ApiResponse.success(res, { items });
});

export const listMovements = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const filters = movementQuerySchema.parse(sanitizeQuery(req.query));
  if (filters.branchId) {
    assertBranchAccess(scope, filters.branchId);
  }
  const rows = await inventoryService.listMovements({
    ...filters,
    branchIds: scope.isAdmin ? undefined : scope.branchIds,
  });
  return ApiResponse.success(res, { rows });
});

export const listAdjustments = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const filters = adjustmentListQuerySchema.parse(sanitizeQuery(req.query));
  if (filters.branchId) {
    assertBranchAccess(scope, filters.branchId);
  }
  const rows = await inventoryService.listAdjustments({
    ...filters,
    branchIds: scope.isAdmin ? undefined : scope.branchIds,
  });
  return ApiResponse.success(res, { rows });
});

export const listRecounts = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const filters = recountListQuerySchema.parse(sanitizeQuery(req.query));
  if (filters.branchId) {
    assertBranchAccess(scope, filters.branchId);
  }
  const rows = await inventoryService.listRecounts({
    ...filters,
    branchIds: scope.isAdmin ? undefined : scope.branchIds,
  });
  return ApiResponse.success(res, { rows });
});

export const createAdjustment = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const input = adjustmentSchema.parse(req.body);
  const branchId = input.branchId ?? scope.primaryBranchId;
  assertBranchAccess(scope, branchId);
  const adjustment = await inventoryService.adjust(
    {
      ...input,
      branchId,
      whId: null,
    },
    req.user
  );
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'stock_adjustment',
    entityId: adjustment?.adj_id ?? null,
    newValue: adjustment,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { adjustment }, 'Stock adjusted');
});

export const createTransfer = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const input = transferSchema.parse(req.body);
  await inventoryService.transfer(input, req.user, scope);
  return ApiResponse.created(res, null, 'Stock transferred');
});

export const createRecount = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const input = recountSchema.parse(req.body);
  assertBranchAccess(scope, input.branchId);
  const recount = await inventoryService.recount(input, req.user);
  if (recount?.adjustment) {
    await logAudit({
      userId: req.user?.userId ?? null,
      action: 'create',
      entity: 'stock_recount',
      entityId: recount.adjustment.adj_id ?? null,
      newValue: recount,
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
    });
  }
  return ApiResponse.created(res, recount, recount.changed ? 'Stock recount saved' : 'No stock difference');
});

export const listBranches = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const filters = locationQuerySchema.parse(sanitizeQuery(req.query));
  const branches = await inventoryService.listBranches({
    ...filters,
    branchIds: scope.isAdmin ? undefined : scope.branchIds,
  });
  return ApiResponse.success(res, { branches });
});

export const createBranch = asyncHandler(async (req: AuthRequest, res) => {
  const input = branchCreateSchema.parse(req.body);
  const branch = await inventoryService.createBranch(input);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'branches',
    entityId: branch?.branch_id ?? null,
    newValue: branch,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { branch }, 'Branch created');
});

export const updateBranch = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid branch id');
  }
  assertBranchAccess(scope, id);
  const input = branchUpdateSchema.parse(req.body);
  const branch = await inventoryService.updateBranch(id, input);
  if (!branch) throw ApiError.notFound('Branch not found');
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'branches',
    entityId: id,
    newValue: input,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { branch }, 'Branch updated');
});

export const deleteBranch = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid branch id');
  }
  assertBranchAccess(scope, id);
  await inventoryService.deleteBranch(id);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'branches',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Branch deleted');
});

export const listWarehouses = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const filters = locationQuerySchema.parse(sanitizeQuery(req.query));
  if (filters.branchId) {
    assertBranchAccess(scope, filters.branchId);
  }
  const warehouses = await inventoryService.listWarehouses({
    ...filters,
    branchIds: scope.isAdmin ? undefined : scope.branchIds,
  });
  return ApiResponse.success(res, { warehouses });
});

export const createWarehouse = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const input = warehouseCreateSchema.parse(req.body);
  assertBranchAccess(scope, input.branchId);
  const warehouse = await inventoryService.createWarehouse(input);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'warehouses',
    entityId: warehouse?.wh_id ?? null,
    newValue: warehouse,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { warehouse }, 'Warehouse created');
});

export const updateWarehouse = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid warehouse id');
  }
  const input = warehouseUpdateSchema.parse(req.body);
  if (input.branchId) {
    assertBranchAccess(scope, input.branchId);
  }
  const warehouse = await inventoryService.updateWarehouse(id, input, scope);
  if (!warehouse) throw ApiError.notFound('Warehouse not found');
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'warehouses',
    entityId: id,
    newValue: input,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { warehouse }, 'Warehouse updated');
});

export const deleteWarehouse = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid warehouse id');
  }
  await inventoryService.deleteWarehouse(id, scope);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'warehouses',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Warehouse deleted');
});

export const listInventoryTransactions = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const filters = inventoryTransactionListSchema.parse(sanitizeQuery(req.query));
  const rows = await inventoryService.listInventoryTransactions({
    ...filters,
    branchIds: scope.isAdmin ? undefined : scope.branchIds,
  });
  return ApiResponse.success(res, { rows });
});

export const createInventoryTransaction = asyncHandler(async (req: AuthRequest, res) => {
  const scope = await resolveBranchScope(req);
  const input = inventoryTransactionSchema.parse(req.body);
  const transaction = await inventoryService.createInventoryTransaction(
    input,
    { userId: req.user?.userId ?? null },
    scope
  );
  return ApiResponse.created(res, { transaction }, 'Inventory transaction created');
});
