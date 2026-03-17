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
  capitalOwnerQuerySchema,
  capitalDrawingCreateSchema,
  capitalDrawingUpdateSchema,
  capitalDrawingListQuerySchema,
  settingsClosingCreateSchema,
  settingsClosingUpdateSchema,
  settingsClosingListQuerySchema,
  settingsOwnerProfitPreviewSchema,
  settingsProfitOwnerUpsertSchema,
  settingsAssetPrepareSchema,
} from './settings.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';
import { logAudit } from '../../utils/audit';
import { pickBranchForWrite, resolveBranchScope } from '../../utils/branchScope';
import { financeClosingService } from '../finance/financeClosing.service';
import { queryMany } from '../../db/query';
import { financialReportsService } from '../reports/financial/financialReports.service';

const normalizeOwnerName = (value: string) => value.trim().replace(/\s+/g, ' ');

const toDateOnly = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw;
};

type IncomeRow = {
  section?: string;
  line_item?: string;
  row_type?: string;
  amount?: number | string;
};

const getIncomeRowAmount = (rows: IncomeRow[], lineItemRegex: RegExp, rowType?: 'detail' | 'total') => {
  const row = rows.find((item) => {
    const lineItem = String(item.line_item || '');
    if (!lineItemRegex.test(lineItem)) return false;
    if (!rowType) return true;
    return String(item.row_type || '').toLowerCase() === rowType;
  });
  return Number(row?.amount || 0);
};

const buildClosingSummaryFromIncomeRows = (rows: IncomeRow[]) => {
  const salesRevenue = getIncomeRowAmount(rows, /^sales revenue$/i);
  const salesReturns = Math.abs(getIncomeRowAmount(rows, /^sales returns$/i));
  const cogs = Math.abs(getIncomeRowAmount(rows, /^cost of goods sold$/i));
  const netIncome = getIncomeRowAmount(rows, /^net income$/i, 'total');

  const isDetailRow = (row: IncomeRow) => String(row.row_type || '').toLowerCase() === 'detail';
  const bySection = (sectionName: string) =>
    rows.filter((row) => String(row.section || '').toLowerCase() === sectionName.toLowerCase());
  const sumAbs = (list: IncomeRow[]) => list.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);

  const operatingDetails = bySection('Operating Expenses').filter(isDetailRow);
  const payrollRows = operatingDetails.filter((row) => /payroll|salary|wage/i.test(String(row.line_item || '')));
  const payrollExpense = sumAbs(payrollRows);
  const expenseCharges = sumAbs(operatingDetails.filter((row) => !/payroll|salary|wage/i.test(String(row.line_item || ''))));
  const netRevenue = salesRevenue - salesReturns;
  const grossProfit = netRevenue - cogs;

  return {
    salesRevenue,
    salesReturns,
    netRevenue,
    cogs,
    grossProfit,
    expenseCharges,
    payrollExpense,
    netIncome,
  };
};

const getLiveIncomeSummaryForPeriod = async (branchId: number, periodFrom: unknown, periodTo: unknown) => {
  const rows = await financialReportsService.getIncomeStatement(branchId, toDateOnly(periodFrom), toDateOnly(periodTo));
  return buildClosingSummaryFromIncomeRows(rows as unknown as IncomeRow[]);
};

const upsertOwnerShareIntoDefaultRule = async (
  scope: Awaited<ReturnType<typeof resolveBranchScope>>,
  branchId: number,
  ownerName: string,
  sharePct: number,
  userId: number | null
) => {
  const cleanName = normalizeOwnerName(ownerName);
  const safePct = Math.max(0, Math.min(100, Number(sharePct || 0)));

  const existingRules = await financeClosingService.listRules(scope, branchId);
  const baseRule = existingRules.find((rule) => rule.isDefault) || existingRules[0];

  if (!baseRule) {
    await financeClosingService.saveRule(
      scope,
      {
        branchId,
        ruleName: 'Owner Profit Sharing',
        sourceAccId: undefined,
        retainedPct: 0,
        retainedAccId: undefined,
        reinvestmentPct: 0,
        reinvestmentAccId: undefined,
        reservePct: 0,
        reserveAccId: undefined,
        partners: [{ partnerName: cleanName, sharePct: safePct, accId: undefined }],
        isDefault: true,
      },
      userId
    );
    return;
  }

  const partners = (baseRule.partners || []).map((partner) => ({
    partnerName: normalizeOwnerName(partner.partnerName),
    sharePct: Number(partner.sharePct || 0),
    accId: partner.accId ?? undefined,
  }));
  const idx = partners.findIndex((partner) => partner.partnerName.toLowerCase() === cleanName.toLowerCase());
  if (idx >= 0) {
    partners[idx].sharePct = safePct;
  } else {
    partners.push({ partnerName: cleanName, sharePct: safePct, accId: undefined });
  }

  const totalPct = partners.reduce((sum, partner) => sum + Number(partner.sharePct || 0), 0);
  if (totalPct > 100.0001) {
    throw ApiError.badRequest(`Owner shares exceed 100% (current total: ${totalPct.toFixed(2)}%)`);
  }

  await financeClosingService.saveRule(
    scope,
    {
      ruleId: baseRule.ruleId || undefined,
      branchId,
      ruleName: baseRule.ruleName || 'Owner Profit Sharing',
      sourceAccId: baseRule.sourceAccId ?? undefined,
      retainedPct: Number(baseRule.retainedPct || 0),
      retainedAccId: baseRule.retainedAccId ?? undefined,
      reinvestmentPct: Number(baseRule.reinvestmentPct || 0),
      reinvestmentAccId: baseRule.reinvestmentAccId ?? undefined,
      reservePct: Number(baseRule.reservePct || 0),
      reserveAccId: baseRule.reserveAccId ?? undefined,
      partners,
      isDefault: true,
    },
    userId
  );
};

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

export const getAssetOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const overview = await settingsService.getAssetOverview(scope);
  return ApiResponse.success(res, { overview });
});

export const prepareAssetAccounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = settingsAssetPrepareSchema.parse(req.body || {});
  const result = await settingsService.prepareAssetAccounts(scope, input.branchId);
  return ApiResponse.success(res, result, 'Asset accounts prepared');
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
  const userId = req.user?.userId || 0;
  const capital = await settingsService.createCapitalContribution(
    {
      ownerName: input.ownerName,
      amount: input.amount,
      sharePct: input.sharePct,
      date: input.date,
      note: (input.note || '').trim() || null,
      branchId: input.branchId,
    },
    scope,
    userId
  );
  let shareSyncWarning: string | null = null;
  try {
    await upsertOwnerShareIntoDefaultRule(
      scope,
      Number(capital.branch_id),
      capital.owner_name,
      Number(input.sharePct || 0),
      userId
    );
  } catch (error: any) {
    shareSyncWarning = String(error?.message || 'Owner share could not be synced');
  }
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'capital_contributions',
    entityId: capital.capital_id,
    newValue: capital,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { capital, shareSyncWarning }, 'Capital entry created');
});

export const updateCapitalContribution = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid capital id');
  const input = capitalUpdateSchema.parse(req.body);
  const userId = req.user?.userId || 0;
  const capital = await settingsService.updateCapitalContribution(
    id,
    {
      ownerName: input.ownerName,
      amount: input.amount,
      sharePct: input.sharePct,
      date: input.date,
      note: input.note !== undefined ? ((input.note || '').trim() || null) : undefined,
    },
    scope,
    userId
  );
  let shareSyncWarning: string | null = null;
  try {
    await upsertOwnerShareIntoDefaultRule(
      scope,
      Number(capital.branch_id),
      capital.owner_name,
      Number(capital.share_pct || 0),
      userId
    );
  } catch (error: any) {
    shareSyncWarning = String(error?.message || 'Owner share could not be synced');
  }
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'capital_contributions',
    entityId: capital.capital_id,
    newValue: capital,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { capital, shareSyncWarning }, 'Capital entry updated');
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

export const listCapitalOwnerEquity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const query = capitalOwnerQuerySchema.parse(req.query);
  const summary = await settingsService.listCapitalOwnerEquity(scope, {
    owner: query.owner,
    search: query.search,
  });
  return ApiResponse.success(res, summary);
});

export const listOwnerDrawings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const query = capitalDrawingListQuerySchema.parse(req.query);
  const data = await settingsService.listOwnerDrawings(scope, {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    search: query.search,
    owner: query.owner,
    fromDate: query.fromDate,
    toDate: query.toDate,
  });
  return ApiResponse.success(res, data);
});

export const createOwnerDrawing = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = capitalDrawingCreateSchema.parse(req.body);
  const userId = req.user?.userId || 0;
  const drawing = await settingsService.createOwnerDrawing(
    {
      ownerName: input.ownerName,
      amount: input.amount,
      date: input.date,
      accountId: input.accountId,
      note: (input.note || '').trim() || null,
      branchId: input.branchId,
    },
    scope,
    userId
  );
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'create',
    entity: 'owner_drawings',
    entityId: drawing.draw_id,
    newValue: drawing,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.created(res, { drawing }, 'Owner drawing created');
});

export const updateOwnerDrawing = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid drawing id');

  const input = capitalDrawingUpdateSchema.parse(req.body);
  const userId = req.user?.userId || 0;
  const drawing = await settingsService.updateOwnerDrawing(
    id,
    {
      ownerName: input.ownerName,
      amount: input.amount,
      date: input.date,
      accountId: input.accountId,
      note: input.note !== undefined ? ((input.note || '').trim() || null) : undefined,
    },
    scope,
    userId
  );

  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'update',
    entity: 'owner_drawings',
    entityId: id,
    newValue: drawing,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, { drawing }, 'Owner drawing updated');
});

export const deleteOwnerDrawing = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid drawing id');
  await settingsService.deleteOwnerDrawing(id, scope);
  await logAudit({
    userId: req.user?.userId ?? null,
    action: 'delete',
    entity: 'owner_drawings',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(res, null, 'Owner drawing deleted');
});

export const listSettingsClosingPeriods = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const query = settingsClosingListQuerySchema.parse(req.query);
  const periods = await financeClosingService.listPeriods(scope, {
    ...query,
    branchId: query.branchId ?? scope.primaryBranchId,
  });
  const periodsWithLiveIncome = await Promise.all(
    periods.map(async (period) => {
      const incomeSummary = await getLiveIncomeSummaryForPeriod(
        Number(period.branch_id),
        period.period_from,
        period.period_to
      );
      return {
        ...period,
        summary_json: {
          ...(period.summary_json || {}),
          netIncome: Number(incomeSummary.netIncome || 0),
        },
      };
    })
  );
  return ApiResponse.success(res, { periods: periodsWithLiveIncome });
});

export const createSettingsClosingPeriod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = settingsClosingCreateSchema.parse(req.body);
  const userId = req.user?.userId ?? null;
  const period = await financeClosingService.createPeriod(
    scope,
    {
      branchId: input.branchId,
      closeMode: input.closeMode || 'custom',
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      note: (input.note || '').trim() || undefined,
    },
    userId
  );
  return ApiResponse.created(res, { period }, 'Closing period created');
});

export const updateSettingsClosingPeriod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');
  const input = settingsClosingUpdateSchema.parse(req.body || {});
  const userId = req.user?.userId ?? null;

  const period = await financeClosingService.updatePeriod(
    scope,
    closingId,
    {
      closeMode: input.closeMode || 'custom',
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      note: (input.note || '').trim() || '',
    },
    userId
  );
  return ApiResponse.success(res, { period }, 'Closing period updated');
});

export const getSettingsClosingSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');
  const summary = await financeClosingService.getSummary(scope, closingId, { live: true });
  const incomeSummary = await getLiveIncomeSummaryForPeriod(
    Number(summary.period.branch_id),
    summary.period.period_from,
    summary.period.period_to
  );
  return ApiResponse.success(res, {
    summary: {
      ...summary,
      summary: {
        ...(summary.summary || {}),
        ...incomeSummary,
      },
    },
  });
});

export const closeSettingsClosingPeriod = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const closingId = Number(req.params.id);
  if (!Number.isFinite(closingId) || closingId <= 0) throw ApiError.badRequest('Invalid closing id');

  const userId = req.user?.userId ?? null;
  const result = await financeClosingService.closePeriod(
    scope,
    closingId,
    {
      autoTransfer: true,
      saveRuleAsDefault: false,
      force: true,
    },
    userId
  );
  return ApiResponse.success(res, { result }, 'Closing period finalized');
});

export const listSettingsProfitOwners = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const where = scope.isAdmin ? '' : 'AND cc.branch_id = ANY($1::bigint[])';
  const params = scope.isAdmin ? [] : [scope.branchIds];

  const owners = await queryMany<{ owner_name: string }>(
    `SELECT DISTINCT BTRIM(cc.owner_name) AS owner_name
       FROM ims.capital_contributions cc
      WHERE COALESCE(BTRIM(cc.owner_name), '') <> ''
        ${where}
      ORDER BY BTRIM(cc.owner_name)`,
    params
  );

  const ownerDrawingsTable = await queryMany<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'ims'
          AND table_name = 'owner_drawings'
     ) AS exists`
  );
  const drawingOwners = ownerDrawingsTable[0]?.exists
    ? await queryMany<{ owner_name: string }>(
        `SELECT DISTINCT BTRIM(od.owner_name) AS owner_name
           FROM ims.owner_drawings od
          WHERE COALESCE(BTRIM(od.owner_name), '') <> ''
            ${scope.isAdmin ? '' : 'AND od.branch_id = ANY($1::bigint[])'}
          ORDER BY BTRIM(od.owner_name)`,
        params
      )
    : [];

  const rules = await financeClosingService.listRules(scope);
  const fromRules = rules
    .flatMap((rule) => rule.partners.map((partner) => partner.partnerName.trim()))
    .filter((name) => name.length > 0);

  const merged = Array.from(
    new Set([
      ...owners.map((row) => row.owner_name.trim()),
      ...drawingOwners.map((row) => row.owner_name.trim()),
      ...fromRules,
    ])
  ).sort((a, b) => a.localeCompare(b));

  return ApiResponse.success(res, { owners: merged });
});

export const upsertSettingsProfitOwner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = settingsProfitOwnerUpsertSchema.parse(req.body);
  const userId = req.user?.userId ?? null;
  const branchId = pickBranchForWrite(scope, input.branchId);
  await upsertOwnerShareIntoDefaultRule(scope, branchId, input.ownerName, input.sharePct, userId);
  await logAudit({
    userId,
    action: 'finance.close.owner_share.save',
    entity: 'finance_profit_share_partners',
    branchId,
    newValue: {
      ownerName: normalizeOwnerName(input.ownerName),
      sharePct: Number(input.sharePct || 0),
    },
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  return ApiResponse.success(
    res,
    {
      owner: {
        branchId,
        ownerName: normalizeOwnerName(input.ownerName),
        sharePct: Number(input.sharePct || 0),
      },
    },
    'Owner share saved'
  );
});

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const previewSettingsOwnerProfit = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = await resolveBranchScope(req);
  const input = settingsOwnerProfitPreviewSchema.parse(req.body);

  const summaryPack = await financeClosingService.getSummary(scope, input.closingId, { live: true });
  const incomeSummary = await getLiveIncomeSummaryForPeriod(
    Number(summaryPack.period.branch_id),
    summaryPack.period.period_from,
    summaryPack.period.period_to
  );
  const netIncome = Number(incomeSummary.netIncome || 0);
  const ownerName = input.ownerName.trim();
  const lowerOwner = ownerName.toLowerCase();
  const inputSharePct =
    input.sharePct !== undefined && Number.isFinite(Number(input.sharePct))
      ? Math.max(0, Math.min(100, Number(input.sharePct)))
      : null;

  if (inputSharePct !== null) {
    const shareAmount = netIncome > 0 ? roundMoney((netIncome * inputSharePct) / 100) : 0;
    return ApiResponse.success(res, {
      preview: {
        closingId: input.closingId,
        period: {
          periodFrom: summaryPack.period.period_from,
          periodTo: summaryPack.period.period_to,
          status: summaryPack.period.status,
        },
        ownerName,
        netIncome,
        sharePct: roundMoney(inputSharePct),
        shareAmount: roundMoney(shareAmount),
        source: 'input',
      },
    });
  }

  const allocations = Array.isArray(summaryPack.profit?.allocations) ? summaryPack.profit.allocations : [];
  const ownerAllocation = allocations.find(
    (row: any) =>
      String(row?.allocationType || '').toLowerCase() === 'partner' &&
      String(row?.label || '').trim().toLowerCase() === lowerOwner
  );

  let sharePct = Number(ownerAllocation?.sharePct || 0);
  let shareAmount = netIncome > 0 ? roundMoney((netIncome * sharePct) / 100) : 0;
  let source: 'allocation' | 'rule' | 'none' = ownerAllocation ? 'allocation' : 'none';

  if (!ownerAllocation) {
    let partnerPct = 0;
    const profitRulePartners = Array.isArray(summaryPack.profit?.rule?.partners) ? summaryPack.profit.rule.partners : [];
    const partnerFromSummaryRule = profitRulePartners.find(
      (partner: any) => String(partner?.partnerName || '').trim().toLowerCase() === lowerOwner
    );
    if (partnerFromSummaryRule) {
      partnerPct = Number(partnerFromSummaryRule.sharePct || 0);
      source = 'rule';
    } else {
      const rules = await financeClosingService.listRules(scope, Number(summaryPack.period.branch_id));
      const selectedRule =
        rules.find((rule) =>
          rule.partners.some((partner) => partner.partnerName.trim().toLowerCase() === lowerOwner)
        ) || rules.find((rule) => rule.isDefault);
      const partner = selectedRule?.partners.find(
        (item) => item.partnerName.trim().toLowerCase() === lowerOwner
      );
      if (partner) {
        partnerPct = Number(partner.sharePct || 0);
        source = 'rule';
      }
    }

    sharePct = partnerPct;
    shareAmount = netIncome > 0 ? roundMoney((netIncome * partnerPct) / 100) : 0;
  }

  return ApiResponse.success(res, {
    preview: {
      closingId: input.closingId,
      period: {
        periodFrom: summaryPack.period.period_from,
        periodTo: summaryPack.period.period_to,
        status: summaryPack.period.status,
      },
      ownerName,
      netIncome,
      sharePct: roundMoney(sharePct),
      shareAmount: roundMoney(shareAmount),
      source,
    },
  });
});
