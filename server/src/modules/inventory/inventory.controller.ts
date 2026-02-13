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
} from './inventory.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { ApiError } from '../../utils/ApiError';
import { logAudit } from '../../utils/audit';

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
  const filters = stockQuerySchema.parse(sanitizeQuery(req.query));
  const rows = await inventoryService.listStock(filters);
  return ApiResponse.success(res, { rows });
});

export const listMovements = asyncHandler(async (req: AuthRequest, res) => {
  const filters = movementQuerySchema.parse(sanitizeQuery(req.query));
  const rows = await inventoryService.listMovements(filters);
  return ApiResponse.success(res, { rows });
});

export const listAdjustments = asyncHandler(async (req: AuthRequest, res) => {
  const filters = adjustmentListQuerySchema.parse(sanitizeQuery(req.query));
  const rows = await inventoryService.listAdjustments(filters);
  return ApiResponse.success(res, { rows });
});

export const listRecounts = asyncHandler(async (req: AuthRequest, res) => {
  const filters = recountListQuerySchema.parse(sanitizeQuery(req.query));
  const rows = await inventoryService.listRecounts(filters);
  return ApiResponse.success(res, { rows });
});

export const createAdjustment = asyncHandler(async (req: AuthRequest, res) => {
  const input = adjustmentSchema.parse(req.body);
  const adjustment = await inventoryService.adjust(input, req.user);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'stock_adjustments',
    entityId: adjustment?.adj_id ?? null,
    newValue: adjustment,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { adjustment }, 'Stock adjusted');
});

export const createTransfer = asyncHandler(async (req: AuthRequest, res) => {
  const input = transferSchema.parse(req.body);
  await inventoryService.transfer(input, req.user);
  return ApiResponse.created(res, null, 'Stock transferred');
});

export const createRecount = asyncHandler(async (req: AuthRequest, res) => {
  const input = recountSchema.parse(req.body);
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
  const filters = locationQuerySchema.parse(sanitizeQuery(req.query));
  const branches = await inventoryService.listBranches(filters);
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
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid branch id');
  }
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
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid branch id');
  }
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
  const filters = locationQuerySchema.parse(sanitizeQuery(req.query));
  const warehouses = await inventoryService.listWarehouses(filters);
  return ApiResponse.success(res, { warehouses });
});

export const createWarehouse = asyncHandler(async (req: AuthRequest, res) => {
  const input = warehouseCreateSchema.parse(req.body);
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
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid warehouse id');
  }
  const input = warehouseUpdateSchema.parse(req.body);
  const warehouse = await inventoryService.updateWarehouse(id, input);
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
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw ApiError.badRequest('Invalid warehouse id');
  }
  await inventoryService.deleteWarehouse(id);
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
