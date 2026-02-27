import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { ApiResponse } from '../../utils/ApiResponse';
import { AuthRequest } from '../../middlewares/requireAuth';
import { resolveBranchScope } from '../../utils/branchScope';
import { importService } from './import.service';
import { ImportMode, ImportType } from './import.types';

const parseMode = (input?: string): ImportMode => {
  const normalized = String(input || 'preview').trim().toLowerCase();
  return normalized === 'import' ? 'import' : 'preview';
};

const resolveUploadedFile = (req: AuthRequest) => {
  const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
  if (!file) {
    throw ApiError.badRequest('File is required in multipart/form-data as field "file"');
  }
  return file;
};

const handleImport = (type: ImportType) =>
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const scope = await resolveBranchScope(req);
    const mode = parseMode((req.body?.mode as string) || (req.query.mode as string));
    const file = resolveUploadedFile(req);

    const result = await importService.processImport({
      type,
      mode,
      branchId: scope.primaryBranchId,
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
    });

    return ApiResponse.success(res, result);
  });

export const importCustomers = handleImport('customers');
export const importSuppliers = handleImport('suppliers');
export const importItems = handleImport('items');

