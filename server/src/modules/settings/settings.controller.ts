import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { settingsService } from './settings.service';
import {
  companyInfoSchema,
  branchCreateSchema,
  branchUpdateSchema,
  auditQuerySchema,
  capitalCreateSchema,
  capitalUpdateSchema,
  capitalListQuerySchema,
  capitalReportQuerySchema,
} from './settings.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { logAudit } from '../../utils/audit';
import { resolveBranchScope } from '../../utils/branchScope';

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
        capital_amount: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }
  return ApiResponse.success(res, { company: data });
});

export const updateCompanyInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = companyInfoSchema.parse(req.body);
  const normalizeNullable = (value?: string | null) => {
    const trimmed = (value || '').trim();
    return trimmed.length ? trimmed : null;
  };

  // If user supplies external URLs, upload them to Cloudinary first
  let logoUrl = normalizeNullable(input.logoImg) || '';
  let bannerUrl = normalizeNullable(input.bannerImg) || '';
  try {
    const { uploadImageFromUrl } = await import('../../config/cloudinary');
    const shouldUpload = (url: string) => {
      if (!url || !/^https?:\/\//i.test(url)) return false;
      if (url.includes('/image/fetch/')) return true; // fetched assets should be re-uploaded
      return !url.includes('res.cloudinary.com');
    };
    const extractOriginal = (url: string) => {
      // For fetch URLs, pull out the last encoded http(s) segment
      const idx = url.lastIndexOf('http');
      if (idx >= 0) {
        try {
          return decodeURIComponent(url.slice(idx));
        } catch {
          return url.slice(idx);
        }
      }
      return url;
    };

    if (shouldUpload(logoUrl)) {
      const source = extractOriginal(logoUrl);
      const uploaded = await uploadImageFromUrl(source, 'system');
      if (uploaded) logoUrl = uploaded;
    }
    if (shouldUpload(bannerUrl)) {
      const source = extractOriginal(bannerUrl);
      const uploaded = await uploadImageFromUrl(source, 'system');
      if (uploaded) bannerUrl = uploaded;
    }
  } catch (err) {
    // Swallow upload errors so the rest of the payload can still persist
    console.error('Cloudinary upload skipped/failed:', err);
  }

  const company = await settingsService.upsertCompanyInfo({
    companyName: input.companyName.trim(),
    phone: normalizeNullable(input.phone),
    managerName: normalizeNullable(input.managerName),
    logoImg: normalizeNullable(logoUrl),
    bannerImg: normalizeNullable(bannerUrl),
    capitalAmount: input.capitalAmount ?? 0,
  });
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'company_info',
    entityId: company.company_id,
    newValue: {
      company_name: company.company_name,
      phone: company.phone,
      manager_name: company.manager_name,
      capital_amount: company.capital_amount,
    },
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { company }, 'Company info saved');
});

export const deleteCompanyInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  await settingsService.deleteCompanyInfo();
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'company_info',
    entityId: 1,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Company info deleted');
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
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'branches',
    entityId: branch.branch_id,
    newValue: branch,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
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

export const deleteBranch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await settingsService.deleteBranch(id);
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

export const listAudit = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit, startDate, endDate } = auditQuerySchema.parse(req.query);
  const { rows, total } = await settingsService.listAuditLogs(page, limit, startDate, endDate);
  return ApiResponse.success(res, { logs: rows, total, page, limit, startDate: startDate || null, endDate: endDate || null });
});

export const listCapitalContributions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const query = capitalListQuerySchema.parse(req.query);
  const data = await settingsService.listCapitalContributions(scope, {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    search: query.search,
    owner: query.owner,
    fromDate: query.fromDate,
    toDate: query.toDate,
  });
  return ApiResponse.success(res, data);
});

export const createCapitalContribution = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = capitalCreateSchema.parse(req.body);
  const capital = await settingsService.createCapitalContribution(
    {
      ownerName: input.ownerName,
      amount: input.amount,
      date: input.date,
      note: (input.note || '').trim() || null,
      branchId: input.branchId,
    },
    scope,
    req.user?.userId || 0
  );
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'capital_contributions',
    entityId: capital.capital_id,
    newValue: capital,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { capital }, 'Capital entry created');
});

export const updateCapitalContribution = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid capital id');
  const input = capitalUpdateSchema.parse(req.body);
  const capital = await settingsService.updateCapitalContribution(
    id,
    {
      ownerName: input.ownerName,
      amount: input.amount,
      date: input.date,
      note: input.note !== undefined ? ((input.note || '').trim() || null) : undefined,
    },
    scope,
    req.user?.userId || 0
  );
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'capital_contributions',
    entityId: capital.capital_id,
    newValue: capital,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { capital }, 'Capital entry updated');
});

export const deleteCapitalContribution = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid capital id');
  await settingsService.deleteCapitalContribution(id, scope);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'capital_contributions',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Capital entry deleted');
});

export const getCapitalReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const query = capitalReportQuerySchema.parse(req.query);
  const report = await settingsService.getCapitalReport(scope, query);
  return ApiResponse.success(res, { report });
});
