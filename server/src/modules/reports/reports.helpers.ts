import { ApiError } from '../../utils/ApiError';
import { assertBranchAccess, resolveBranchScope } from '../../utils/branchScope';
import { AuthRequest } from '../../middlewares/requireAuth';

export type SelectionMode = 'all' | 'show';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const parseIsoDate = (value: string | undefined, fieldName: string): string => {
  if (!value) {
    throw ApiError.badRequest(`${fieldName} is required (YYYY-MM-DD)`);
  }
  if (!datePattern.test(value)) {
    throw ApiError.badRequest(`${fieldName} must be in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest(`${fieldName} is invalid`);
  }
  return value;
};

export const parseSelectionMode = (value: unknown): SelectionMode => {
  const normalized = String(value || 'all').toLowerCase();
  if (normalized === 'all' || normalized === 'show') {
    return normalized;
  }
  throw ApiError.badRequest('mode must be either "all" or "show"');
};

export const parseNumericId = (value: unknown, fieldName: string): number => {
  const id = Number(value);
  if (!id || Number.isNaN(id) || id <= 0) {
    throw ApiError.badRequest(`${fieldName} is invalid`);
  }
  return id;
};

export const resolveRequestedBranchId = (req: AuthRequest, defaultBranchId: number) => {
  const raw = req.query.branchId;
  if (raw === undefined || raw === null || raw === '') {
    return defaultBranchId;
  }
  return parseNumericId(raw, 'branchId');
};

export const parseDateRange = (req: AuthRequest) => {
  const fromDate = parseIsoDate(req.query.fromDate as string | undefined, 'fromDate');
  const toDate = parseIsoDate(req.query.toDate as string | undefined, 'toDate');
  if (fromDate > toDate) {
    throw ApiError.badRequest('fromDate cannot be after toDate');
  }
  return { fromDate, toDate };
};

export const resolveBranchIdForReports = async (req: AuthRequest) => {
  const scope = await resolveBranchScope(req);
  const branchId = resolveRequestedBranchId(req, scope.primaryBranchId);
  assertBranchAccess(scope, branchId);
  return branchId;
};
