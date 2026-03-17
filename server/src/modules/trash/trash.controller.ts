import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { AuthRequest } from '../../middlewares/requireAuth';
import { trashService } from './trash.service';
import { trashListQuerySchema, trashRestoreSchema } from './trash.schemas';

export const listTrashTables = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await trashService.listTables();
  return ApiResponse.success(res, { tables: data.tables, modules: data.modules });
});

export const listTrashRows = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = trashListQuerySchema.parse(req.query);
  const data = await trashService.listDeleted(query.table, {
    fromDate: query.fromDate,
    toDate: query.toDate,
    limit: query.limit,
    offset: query.offset,
    branchId: query.branchId,
  });
  return ApiResponse.success(res, { rows: data.rows, total: data.total });
});

export const restoreTrashRow = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = trashRestoreSchema.parse({ table: req.params.table, id: req.params.id });
  const userId = req.user?.userId ?? null;
  const result = await trashService.restore(input.table, input.id, userId);
  return ApiResponse.success(res, { result }, 'Record restored');
});
