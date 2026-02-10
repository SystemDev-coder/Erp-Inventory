import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { settingsService } from './settings.service';
import { companyInfoSchema, branchCreateSchema, branchUpdateSchema, auditQuerySchema } from './settings.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';

export const getCompanyInfo = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const data = await settingsService.getCompanyInfo();
  if (!data) {
    // return empty shell instead of 404 for first-time setup
    return ApiResponse.success(res, {
      company: {
        company_id: 1,
        company_name: '',
        logo_img: null,
        banner_img: null,
        phone: null,
        manager_name: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }
  return ApiResponse.success(res, { company: data });
});

export const updateCompanyInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = companyInfoSchema.parse(req.body);
  const company = await settingsService.upsertCompanyInfo({
    companyName: input.companyName,
    phone: input.phone,
    managerName: input.managerName,
    logoImg: input.logoImg,
    bannerImg: input.bannerImg,
  });
  return ApiResponse.success(res, { company }, 'Company info saved');
});

export const listBranches = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const branches = await settingsService.listBranches();
  return ApiResponse.success(res, { branches });
});

export const createBranch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = branchCreateSchema.parse(req.body);
  const branch = await settingsService.createBranch({
    branchName: input.branchName,
    location: input.location,
    isActive: input.isActive,
  });
  return ApiResponse.created(res, { branch }, 'Branch created');
});

export const updateBranch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = branchUpdateSchema.parse(req.body);
  const branch = await settingsService.updateBranch(id, {
    branchName: input.branchName,
    location: input.location,
    isActive: input.isActive,
  });
  if (!branch) throw ApiError.notFound('Branch not found');
  return ApiResponse.success(res, { branch }, 'Branch updated');
});

export const deleteBranch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await settingsService.deleteBranch(id);
  return ApiResponse.success(res, null, 'Branch deleted');
});

export const listAudit = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit } = auditQuerySchema.parse(req.query);
  const { rows, total } = await settingsService.listAuditLogs(page, limit);
  return ApiResponse.success(res, { logs: rows, total, page, limit });
});
